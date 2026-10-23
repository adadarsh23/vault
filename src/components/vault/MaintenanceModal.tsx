import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Download,
  Upload,
  Key,
  Check,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { RecaptchaField } from '../security/RecaptchaField';
import { useVaultStore } from '../../store/vaultStore';
import { toast } from 'sonner';
import {
  generateFormattedPassword,
  normalizeGeneratedCredentialLength,
  validatePassword,
} from '../../lib/utils';
import { getDeviceId } from '../../lib/auth-session';
import {
  changeAccountPassword,
  fetchVaultSalt,
  verifyMasterKeyChangeCaptcha,
} from '../../lib/auth-api';
import { getVaultId } from '../../lib/sync';
import { deriveKey } from '../../lib/cryptoPrimitives';
import { prepareMasterKeyForCloud } from '../../lib/cloudMasterKey';
import { saveMasterKeyToCloud } from '../../lib/cloudMasterKeyApi';
import { useRecaptchaChallenge } from '../../hooks/useRecaptchaChallenge';
import { useScrollLock } from '../../hooks/useScrollLock';
import { logger } from '../../lib/logger';

interface MaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'export' | 'import' | 'changeKey' | 'changePassword';
}

export const MaintenanceModal: React.FC<MaintenanceModalProps> = React.memo(
  ({ isOpen, onClose, type }) => {
    const SUCCESS_ANIMATION_DELAY_MS = 900;
    const GENERATION_WINDOW_MS = 60_000;
    const GENERATION_COOLDOWN_MS = 4_000;
    const GENERATION_MAX_ATTEMPTS = 8;
    const { exportVaultData, importVaultData, changeMasterKey, preferences, fullLogout } =
      useVaultStore();
    const generatedCredentialLength = normalizeGeneratedCredentialLength(
      preferences.generatedCredentialLength || 16,
    );
    const [step, setStep] = useState(1);
    const [progress, setProgress] = useState(0);
    const [isProcessing, setIsProcessing] = useState(false);

    // Password / Key state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newKey, setNewKey] = useState('');
    const [confirmKey, setConfirmKey] = useState('');
    const [formError, setFormError] = useState<{
      field?: 'currentPassword' | 'newKey' | 'confirmKey' | 'general';
      title?: string;
      message: string;
    } | null>(null);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewKey, setShowNewKey] = useState(false);
    const [showConfirmKey, setShowConfirmKey] = useState(false);
    const [generationCooldownUntil, setGenerationCooldownUntil] = useState(0);
    const generationAttemptTimestampsRef = useRef<number[]>([]);
    const {
      token: captchaToken,
      isCompleted: isCaptchaCompleted,
      resetNonce: captchaResetNonce,
      feedback: captchaFeedback,
      handleTokenChange: handleCaptchaTokenChange,
      handleExpired: handleCaptchaExpired,
      handleError: handleCaptchaError,
      resetChallenge: resetCaptchaChallenge,
      setRejected: setCaptchaRejected,
    } = useRecaptchaChallenge();
    const requiresCaptcha = type === 'changePassword' || type === 'changeKey';

    const currentPasswordRef = useRef<HTMLInputElement>(null);
    const newKeyRef = useRef<HTMLInputElement>(null);
    const confirmKeyRef = useRef<HTMLInputElement>(null);
    const titleId = 'maintenance-modal-title';
    const descriptionId = 'maintenance-modal-description';

    useScrollLock(isOpen);

    useLayoutEffect(() => {
      if (isOpen && step === 1) {
        if (type === 'changePassword' || type === 'changeKey') currentPasswordRef.current?.focus();
      }
    }, [isOpen, step, type]);

    useEffect(() => {
      if (!formError) return;
      if (formError.field === 'currentPassword') {
        currentPasswordRef.current?.focus();
      } else if (formError.field === 'newKey') {
        newKeyRef.current?.focus();
      } else if (formError.field === 'confirmKey') {
        confirmKeyRef.current?.focus();
      }
    }, [formError]);

    // File import state
    const [importFile, setImportFile] = useState<File | null>(null);

    // Reset state on close
    useEffect(() => {
      if (!isOpen) {
        setStep(1);
        setProgress(0);
        setIsProcessing(false);
        setCurrentPassword('');
        setNewKey('');
        setConfirmKey('');
        setFormError(null);
        setImportFile(null);
        setShowCurrentPassword(false);
        setShowNewKey(false);
        setShowConfirmKey(false);
        setGenerationCooldownUntil(0);
        generationAttemptTimestampsRef.current = [];
        resetCaptchaChallenge();
      }
    }, [isOpen, resetCaptchaChallenge]);

    useEffect(() => {
      if (!isOpen) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && !isProcessing) {
          onClose();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [isOpen, isProcessing, onClose]);

    const timeoutRef = useRef<number | null>(null);

    const canGenerateCredentialNow = (): boolean => {
      const now = Date.now();
      if (now < generationCooldownUntil) {
        const remainingSeconds = Math.max(1, Math.ceil((generationCooldownUntil - now) / 1000));
        toast.info(`Please wait ${remainingSeconds}s before regenerating.`);
        return false;
      }

      const recentAttempts = generationAttemptTimestampsRef.current.filter(
        (timestamp) => now - timestamp <= GENERATION_WINDOW_MS,
      );

      if (recentAttempts.length >= GENERATION_MAX_ATTEMPTS) {
        const resetAt = recentAttempts[0] + GENERATION_WINDOW_MS;
        const remainingSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
        setGenerationCooldownUntil(resetAt);
        generationAttemptTimestampsRef.current = recentAttempts;
        toast.error(`Generation limit reached. Try again in ${remainingSeconds}s.`);
        return false;
      }

      generationAttemptTimestampsRef.current = [...recentAttempts, now];
      setGenerationCooldownUntil(now + GENERATION_COOLDOWN_MS);
      return true;
    };

    const generateSecureKey = () => {
      if (!canGenerateCredentialNow()) {
        return;
      }

      const key = generateFormattedPassword(generatedCredentialLength);
      setNewKey(key);
      setConfirmKey(key);
      setShowNewKey(true);
      setShowConfirmKey(true);

      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(key);

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setShowNewKey(false);
        setShowConfirmKey(false);
      }, 10000);
    };

    // Clear on modal close
    useEffect(() => {
      if (!isOpen && timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }, [isOpen]);

    const handleExport = async () => {
      setIsProcessing(true);
      setStep(2);

      try {
        // Export vault data with progress callback
        const data = await exportVaultData((done, total) => {
          const percentage = total ? Math.round((done / total) * 100) : 0;
          setProgress(percentage);
        });

        // Create a Blob and object URL safely
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Create a temporary download link
        const link = document.createElement('a');
        link.href = url;
        link.download = `vault-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);

        // Trigger download
        link.click();

        // Clean up
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setStep(3);
        toast.success('Vault exported successfully');
      } catch (err) {
        logger.error('Export failed', { error: err });
        toast.error('Vault export failed. Please try again.');
        setStep(1);
      } finally {
        // Reset progress and processing state
        setIsProcessing(false);
        setProgress(0);
      }
    };

    const handleImport = async () => {
      if (!importFile) {
        toast.error('No file selected');
        return;
      }

      if (!importFile.name.endsWith('.json')) {
        toast.error('Please select a JSON file');
        return;
      }

      setIsProcessing(true);
      setStep(2);

      const reader = new FileReader();

      reader.onload = async (event: ProgressEvent<FileReader>) => {
        try {
          const text = event.target?.result;
          if (!text) throw new Error('File is empty');

          let content: any;
          try {
            content = JSON.parse(text as string);
          } catch {
            throw new Error('Invalid JSON format');
          }

          if (!Array.isArray(content)) {
            throw new Error('Expected an array of items');
          }

          // Import with progress
          await importVaultData(content, (done, total) => {
            const percentage = total ? Math.round((done / total) * 100) : 0;
            setProgress(percentage);
          });

          setStep(3);
          toast.success(`Imported ${content.length} items successfully`);
        } catch (err: unknown) {
          logger.error('Import error', { error: err });
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Import failed: ${errMsg}`);
          setStep(1);
        } finally {
          setIsProcessing(false);
          setProgress(0);
        }
      };

      reader.onerror = () => {
        toast.error('Failed to read file');
        setIsProcessing(false);
        setProgress(0);
      };

      reader.readAsText(importFile);
    };
    const handleChangeKey = async () => {
      setFormError(null);

      if (!currentPassword) {
        setFormError({
          field: 'currentPassword',
          title: 'Current Password Required',
          message: 'Current account password is required to authorize this change.',
        });
        toast.error('Current account password is required');
        return;
      }
      if (!newKey || !confirmKey) {
        setFormError({
          field: !newKey ? 'newKey' : 'confirmKey',
          title: 'Master Key Required',
          message: 'New master key and confirmation are required.',
        });
        toast.error('New key and confirmation required');
        return;
      }
      if (newKey.length < 16) {
        setFormError({
          field: 'newKey',
          title: 'Key Length Error',
          message: 'Master key must be at least 16 characters long.',
        });
        toast.error('Master key must be 16+ characters');
        return;
      }
      if (newKey !== confirmKey) {
        setFormError({
          field: 'confirmKey',
          title: 'Keys Do Not Match',
          message: 'New master key and confirmation key do not match.',
        });
        toast.error('Keys do not match');
        return;
      }
      if (newKey === currentPassword) {
        setFormError({
          field: 'newKey',
          title: 'Security Conflict',
          message: 'Master key and account password must not be identical.',
        });
        toast.error('Master key and account password must not be identical');
        return;
      }

      const validation = validatePassword(newKey);
      if (!validation.isValid) {
        setFormError({
          field: 'newKey',
          title: 'Requirement Error',
          message: validation.error || 'Password does not meet complexity requirements.',
        });
        toast.error('Requirement Error', { description: validation.error });
        return;
      }

      const isDecoy = useVaultStore.getState().isDecoyMode;
      if (isDecoy) {
        setIsProcessing(true);
        setStep(2);
        setProgress(50);
        await new Promise((r) => setTimeout(r, 400));
        setProgress(100);
        setStep(3);
        toast.success('Master key changed successfully');
        await new Promise((resolve) => window.setTimeout(resolve, SUCCESS_ANIMATION_DELAY_MS));
        fullLogout({ skipServerLogout: true });
        onClose();
        toast.info('Please sign in again with your new master key.');
        setIsProcessing(false);
        setProgress(0);
        return;
      }

      if (!isCaptchaCompleted || !captchaToken) {
        setFormError({
          field: 'general',
          title: 'Security Verification Required',
          message: 'Please complete the CAPTCHA check before continuing.',
        });
        toast.error('Please complete CAPTCHA before continuing.');
        return;
      }

      const username = useVaultStore.getState().username;
      const activeVaultId = useVaultStore.getState().vaultId;
      if (username && activeVaultId) {
        try {
          const salt = await fetchVaultSalt(username).catch(() => `${username}-vault-pqc-salt`);
          const derivedNewKey = await deriveKey(newKey, salt);
          const newVaultId = await getVaultId(derivedNewKey);
          if (newVaultId === activeVaultId) {
            setFormError({
              field: 'newKey',
              title: 'Master Key Unchanged',
              message: 'New master key must be different from your current master key.',
            });
            toast.error('New master key must be different from current master key');
            return;
          }
        } catch (e) {
          logger.error('Key derivation check failed', { error: e });
        }
      }

      setIsProcessing(true);
      setStep(2);
      try {
        await verifyMasterKeyChangeCaptcha(captchaToken);

        const deviceId = getDeviceId();
        if (username && deviceId) {
          try {
            const cloudPayload = await prepareMasterKeyForCloud(newKey, currentPassword, deviceId);
            await saveMasterKeyToCloud({
              ...cloudPayload,
              password: currentPassword,
              masterKey: newKey,
            });
          } catch (cloudErr: any) {
            const code = typeof cloudErr?.code === 'string' ? cloudErr.code : '';
            const msg = typeof cloudErr?.message === 'string' ? cloudErr.message.toLowerCase() : '';
            if (
              code === 'INVALID_CREDENTIALS' ||
              code === 'AUTH_SAME_CREDENTIALS' ||
              msg.includes('current password is incorrect') ||
              msg.includes('must not be identical')
            ) {
              throw cloudErr;
            }
            logger.warn('Cloud master key backup failed, continuing master key rotation', {
              error: cloudErr,
            });
          }
        }

        await changeMasterKey(newKey, (done, total) =>
          setProgress(Math.round((done / total) * 100)),
        );
        setStep(3);
        resetCaptchaChallenge();
        toast.success('Master key changed successfully');
        await new Promise((resolve) => window.setTimeout(resolve, SUCCESS_ANIMATION_DELAY_MS));
        // Perform immediate, single logout to avoid stale-session race conditions.
        fullLogout({ skipServerLogout: true });
        onClose();
        toast.info('Please sign in again with your new master key.');
      } catch (err: any) {
        logger.error('Master key rotation error', { error: err });
        const message = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
        const code = typeof err?.code === 'string' ? err.code : '';
        setCaptchaRejected('Security verification failed. Complete CAPTCHA and retry.');
        if (code === 'INVALID_CREDENTIALS' || message.includes('current password is incorrect')) {
          setFormError({
            field: 'currentPassword',
            title: 'Incorrect Password',
            message: 'The current account password you entered is incorrect.',
          });
          toast.error('Current password is incorrect');
        } else if (code === 'AUTH_SAME_CREDENTIALS' || message.includes('must not be identical')) {
          setFormError({
            field: 'newKey',
            title: 'Security Conflict',
            message: 'Master key and account password must not be identical.',
          });
          toast.error('Master key and account password must not be identical');
        } else {
          setFormError({
            field: 'general',
            title: 'Operation Failed',
            message: err?.message || 'Failed to change master key. Please try again.',
          });
          toast.error(err?.message || 'Failed to change master key');
        }
        setStep(1);
      } finally {
        setIsProcessing(false);
        setProgress(0);
      }
    };

    const handleChangePassword = async () => {
      setFormError(null);

      if (!currentPassword) {
        setFormError({
          field: 'currentPassword',
          title: 'Current Password Required',
          message: 'Current account password is required to authorize this change.',
        });
        toast.error('Current password is required');
        return;
      }
      if (!newKey || !confirmKey) {
        setFormError({
          field: !newKey ? 'newKey' : 'confirmKey',
          title: 'New Password Required',
          message: 'New password and confirmation are required.',
        });
        toast.error('New password and confirmation required');
        return;
      }
      if (newKey !== confirmKey) {
        setFormError({
          field: 'confirmKey',
          title: 'Passwords Do Not Match',
          message: 'New password and confirmation password do not match.',
        });
        toast.error('New password and confirmation do not match');
        return;
      }
      if (newKey === currentPassword) {
        setFormError({
          field: 'newKey',
          title: 'Password Unchanged',
          message: 'New password must be different from your current password.',
        });
        toast.error('New password must be different from current password');
        return;
      }

      const validation = validatePassword(newKey);
      if (!validation.isValid) {
        setFormError({
          field: 'newKey',
          title: 'Requirement Error',
          message: validation.error || 'Password does not meet security requirements.',
        });
        toast.error('Requirement Error', { description: validation.error });
        return;
      }

      const isDecoy = useVaultStore.getState().isDecoyMode;
      if (isDecoy) {
        setIsProcessing(true);
        setStep(2);
        setProgress(50);
        await new Promise((r) => setTimeout(r, 400));
        setProgress(100);
        setStep(3);
        toast.success('Account password changed successfully');
        await new Promise((resolve) => window.setTimeout(resolve, SUCCESS_ANIMATION_DELAY_MS));
        fullLogout({ skipServerLogout: true });
        onClose();
        toast.info('Please sign in again with your new account password.');
        setIsProcessing(false);
        setProgress(0);
        return;
      }

      const username = useVaultStore.getState().username;
      const activeVaultId = useVaultStore.getState().vaultId;
      if (username && activeVaultId) {
        try {
          const salt = await fetchVaultSalt(username).catch(() => `${username}-vault-pqc-salt`);
          const derivedNewKey = await deriveKey(newKey, salt);
          const newVaultId = await getVaultId(derivedNewKey);
          if (newVaultId === activeVaultId) {
            setFormError({
              field: 'newKey',
              title: 'Security Conflict',
              message: 'Account password and master key must not be identical.',
            });
            toast.error('Account password and master key must not be identical');
            return;
          }
        } catch (e) {
          logger.error('Password derivation check failed', { error: e });
        }
      }

      if (!isCaptchaCompleted || !captchaToken) {
        setFormError({
          field: 'general',
          title: 'Security Verification Required',
          message: 'Please complete the CAPTCHA check before continuing.',
        });
        toast.error('Please complete CAPTCHA before continuing.');
        return;
      }

      setIsProcessing(true);
      setStep(2);
      try {
        await changeAccountPassword(currentPassword, newKey, captchaToken);
        setStep(3);
        resetCaptchaChallenge();
        toast.success('Account password changed successfully');
        await new Promise((resolve) => window.setTimeout(resolve, SUCCESS_ANIMATION_DELAY_MS));
        // Perform immediate, single logout to avoid stale-session race conditions.
        fullLogout({ skipServerLogout: true });
        onClose();
        toast.info('Please sign in again with your new account password.');
      } catch (err: any) {
        logger.error('Change account password error', { error: err });
        const message = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
        const code = typeof err?.code === 'string' ? err.code : '';

        setCaptchaRejected('Security verification failed. Complete CAPTCHA again.');

        if (code === 'INVALID_CREDENTIALS' || message.includes('current password is incorrect')) {
          setFormError({
            field: 'currentPassword',
            title: 'Incorrect Password',
            message: 'The current account password you entered is incorrect.',
          });
          toast.error('Current password is incorrect');
        } else if (code === 'PASSWORD_UNCHANGED') {
          setFormError({
            field: 'newKey',
            title: 'Password Unchanged',
            message: 'New password must be different from current password.',
          });
          toast.error('New password must be different from current password');
        } else if (code === 'AUTH_SAME_CREDENTIALS' || message.includes('must not be identical')) {
          setFormError({
            field: 'newKey',
            title: 'Security Conflict',
            message: 'Account password and master key must not be identical.',
          });
          toast.error('Account password and master key must not be identical');
        } else if (code === 'AUTH_WEAK_PASSWORD') {
          setFormError({
            field: 'newKey',
            title: 'Weak Password',
            message: 'New password does not meet security requirements.',
          });
          toast.error('New password does not meet security requirements');
        } else if (code === 'TOO_MANY_PASSWORD_CHANGE_ATTEMPTS') {
          setFormError({
            field: 'general',
            title: 'Too Many Attempts',
            message: 'Too many password change attempts. Please wait a moment and retry.',
          });
          toast.error('Too many password change attempts. Please wait and retry.');
        } else {
          setFormError({
            field: 'general',
            title: 'Operation Failed',
            message: err?.message || 'Failed to change account password. Please try again.',
          });
          toast.error('Failed to change account password');
        }
        setStep(1);
      } finally {
        setIsProcessing(false);
        setProgress(0);
      }
    };

    if (!isOpen) return null;

    const modalTitle =
      type === 'export'
        ? 'Export Vault'
        : type === 'import'
          ? 'Import Vault'
          : type === 'changeKey'
            ? 'Change Master Key'
            : 'Change Account Password';

    const modalDescription =
      type === 'export'
        ? 'Create a secure backup of your encrypted data.'
        : type === 'import'
          ? 'Restore data from a previously exported backup only.'
          : type === 'changeKey'
            ? 'Update your master key and re-encrypt all items.'
            : 'Update the password you use to sign in to this vault.';

    return (
      <AnimatePresence>
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2.5 sm:p-4 overflow-hidden touch-manipulation">
          {/* Full-screen Fixed Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={!isProcessing ? onClose : undefined}
            className="fixed inset-0 bg-black/80 sm:bg-black/75 backdrop-blur-md will-change-transform"
          />

          {/* Modal Dialog Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="relative z-10 w-full max-w-[calc(100vw-1.25rem)] xs:max-w-md sm:max-w-lg max-h-[90vh] max-h-[90dvh] flex flex-col rounded-2xl xs:rounded-3xl border border-card-border bg-card-bg shadow-2xl transition-colors dark:border-white/10 dark:bg-[#0c0c0e] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (step !== 1) return;
                if (type === 'export') await handleExport();
                else if (type === 'import') await handleImport();
                else if (type === 'changePassword') await handleChangePassword();
                else if (type === 'changeKey') await handleChangeKey();
              }}
              className="flex flex-col h-full max-h-[90vh] max-h-[90dvh] min-h-0"
            >
              {/* Modal Header - Fixed */}
              <div className="relative shrink-0 border-b border-card-border/40 dark:border-white/10 bg-text/[0.02] px-4 py-3.5 sm:px-6 sm:py-4">
                {!isProcessing && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close maintenance dialog"
                    className="absolute right-3 top-3 sm:right-4 sm:top-4 p-1.5 rounded-full text-text/30 hover:text-text hover:bg-text/5 transition-colors focus:outline-none focus:ring-2 focus:ring-text/20"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}

                <div className="flex items-center gap-3 sm:gap-4 pr-7 sm:pr-8">
                  <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-text/5 text-text">
                    {type === 'export' && (
                      <Download className="h-5 w-5 sm:h-6 sm:w-6 text-blue-400" />
                    )}
                    {type === 'import' && (
                      <Upload className="h-5 w-5 sm:h-6 sm:w-6 text-green-400" />
                    )}
                    {type === 'changeKey' && (
                      <Key className="h-5 w-5 sm:h-6 sm:w-6 text-amber-400" />
                    )}
                    {type === 'changePassword' && (
                      <Key className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 text-left">
                    <h2 id={titleId} className="text-base sm:text-lg font-bold text-text truncate">
                      {modalTitle}
                    </h2>
                    <p id={descriptionId} className="text-xs text-text/50 truncate">
                      {modalDescription}
                    </p>
                  </div>
                </div>
              </div>

              {/* Scrollable Content Body */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5 custom-scrollbar space-y-4">
                {step === 1 && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4 pb-2"
                  >
                    {type === 'export' && (
                      <div className="space-y-4">
                        <div className="rounded-xl bg-blue-500/5 p-4 border border-blue-500/10">
                          <p className="text-xs text-blue-400/80 leading-relaxed">
                            The exported file will be a JSON document containing your items in their
                            current encrypted state. You will need your current master key to
                            decrypt it after importing.
                          </p>
                        </div>
                        <div className="flex items-start gap-2 rounded-xl bg-amber-500/5 p-3 border border-amber-500/10">
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-amber-500/80 leading-relaxed">
                            Ensure you are importing the JSON file into the same account using the
                            same Master Key that was active when you exported the backup.
                            <br />
                            <br />
                            If you changed/rotated your key via{' '}
                            <code className="bg-amber-500/10 px-1 py-0.5 rounded text-[10px] font-mono text-amber-400 font-semibold">
                              Change Master Key
                            </code>
                            , the rotation process uses{' '}
                            <code className="bg-amber-500/10 px-1 py-0.5 rounded text-[10px] font-mono text-amber-400 font-semibold">
                              Reencrypt Vault Item Content
                            </code>{' '}
                            to successfully re-encrypt existing database records. However, this does
                            not update previously exported JSON backups. You must generate a fresh
                            export after rotating your key.
                          </p>
                        </div>
                      </div>
                    )}

                    {type === 'import' && (
                      <div className="space-y-4">
                        <div
                          className="group relative flex h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all"
                          onClick={() => document.getElementById('import-file-input')?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const file = e.dataTransfer.files[0];
                            if (file) {
                              if (!file.name.toLowerCase().endsWith('.json')) {
                                toast.error('Please select a JSON backup file');
                                return;
                              }
                              setImportFile(file);
                            }
                          }}
                        >
                          <input
                            id="import-file-input"
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                          />
                          {importFile ? (
                            <>
                              <Check className="mb-2 h-8 w-8 text-green-400" />
                              <p className="text-sm font-medium text-text">{importFile.name}</p>
                              <p className="text-[10px] text-text/40">
                                {(importFile.size / 1024).toFixed(1)} KB
                              </p>
                            </>
                          ) : (
                            <>
                              <Upload className="mb-2 h-8 w-8 text-text/10 group-hover:text-text/30 transition-colors" />
                              <p className="text-sm font-medium text-text/40">
                                Click to select backup file
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {type === 'changeKey' && (
                      <div className="space-y-4">
                        <AnimatePresence mode="wait">
                          {formError && (
                            <motion.div
                              key="change-key-error"
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              role="alert"
                              className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300"
                            >
                              <div className="flex items-start gap-2">
                                <ShieldAlert className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  {formError.title && (
                                    <strong className="font-semibold text-red-200">
                                      {formError.title}:{' '}
                                    </strong>
                                  )}
                                  <span>{formError.message}</span>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="space-y-2">
                          <label
                            htmlFor="change-key-current-account-password"
                            className="text-[10px] font-bold uppercase tracking-widest text-text/30"
                          >
                            Current Account Password
                          </label>
                          <div className="relative">
                            <Input
                              id="change-key-current-account-password"
                              type={showCurrentPassword ? 'text' : 'password'}
                              autoComplete="current-password"
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              placeholder="Enter your current sign-in password"
                              value={currentPassword}
                              onChange={(e) => {
                                setCurrentPassword(e.target.value);
                                if (formError?.field === 'currentPassword') setFormError(null);
                              }}
                              ref={currentPasswordRef}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  newKeyRef.current?.focus();
                                }
                              }}
                              className={`pr-10 bg-white/5 ${
                                formError?.field === 'currentPassword'
                                  ? 'border-red-500/80 ring-2 ring-red-500/25 bg-red-500/5'
                                  : 'border-white/10'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text/20 hover:text-text/60 transition-colors"
                              aria-label={
                                showCurrentPassword
                                  ? 'Hide current password'
                                  : 'Show current password'
                              }
                            >
                              {showCurrentPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          {formError?.field === 'currentPassword' && (
                            <p className="flex items-center gap-1 text-[11px] font-medium text-red-400">
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                              {formError.message}
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <label
                            htmlFor="new-master-key"
                            className="text-[10px] font-bold uppercase tracking-widest text-text/30"
                          >
                            New Master Key
                          </label>
                          <div className="relative">
                            <Input
                              id="new-master-key"
                              type={showNewKey ? 'text' : 'password'}
                              autoComplete="new-password"
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              placeholder="********"
                              value={newKey}
                              onChange={(e) => {
                                setNewKey(e.target.value);
                                if (formError?.field === 'newKey') setFormError(null);
                              }}
                              ref={newKeyRef}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  confirmKeyRef.current?.focus();
                                }
                              }}
                              className={`pr-20 bg-white/5 ${
                                formError?.field === 'newKey'
                                  ? 'border-red-500/80 ring-2 ring-red-500/25 bg-red-500/5'
                                  : 'border-white/10'
                              }`}
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setShowNewKey(!showNewKey)}
                                className="p-1.5 text-text/20 hover:text-text/60 transition-colors"
                                aria-label={showNewKey ? 'Hide new key' : 'Show new key'}
                              >
                                {showNewKey ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={generateSecureKey}
                                className="p-1.5 text-text/20 hover:text-blue-500/60 transition-colors"
                                aria-label="Generate secure key"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          {formError?.field === 'newKey' && (
                            <p className="flex items-center gap-1 text-[11px] font-medium text-red-400">
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                              {formError.message}
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <label
                            htmlFor="confirm-new-key"
                            className="text-[10px] font-bold uppercase tracking-widest text-text/30"
                          >
                            Confirm New Key
                          </label>
                          <div className="relative">
                            <Input
                              id="confirm-new-key"
                              type={showConfirmKey ? 'text' : 'password'}
                              autoComplete="new-password"
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              placeholder="********"
                              value={confirmKey}
                              onChange={(e) => {
                                setConfirmKey(e.target.value);
                                if (formError?.field === 'confirmKey') setFormError(null);
                              }}
                              ref={confirmKeyRef}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleChangeKey();
                                }
                              }}
                              className={`pr-10 bg-white/5 ${
                                formError?.field === 'confirmKey'
                                  ? 'border-red-500/80 ring-2 ring-red-500/25 bg-red-500/5'
                                  : 'border-white/10'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmKey(!showConfirmKey)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text/20 hover:text-text/60 transition-colors"
                              aria-label={showConfirmKey ? 'Hide confirm key' : 'Show confirm key'}
                            >
                              {showConfirmKey ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          {formError?.field === 'confirmKey' && (
                            <p className="flex items-center gap-1 text-[11px] font-medium text-red-400">
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                              {formError.message}
                            </p>
                          )}
                        </div>
                        <div className="text-[10px] text-text/40 -mt-2">
                          Requires: 16+ chars, Capital start, Number, Special char. Generated
                          length: {generatedCredentialLength}
                        </div>
                        <div className="flex items-start gap-2 rounded-xl bg-amber-500/5 p-3 border border-amber-500/10">
                          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-amber-500/80 leading-relaxed">
                            Changing your master key requires re-encrypting every item in your
                            vault. This process cannot be interrupted once started.
                          </p>
                        </div>
                      </div>
                    )}

                    {type === 'changePassword' && (
                      <div className="space-y-4">
                        <AnimatePresence mode="wait">
                          {formError && (
                            <motion.div
                              key="change-pwd-error"
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              role="alert"
                              className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300"
                            >
                              <div className="flex items-start gap-2">
                                <ShieldAlert className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  {formError.title && (
                                    <strong className="font-semibold text-red-200">
                                      {formError.title}:{' '}
                                    </strong>
                                  )}
                                  <span>{formError.message}</span>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="space-y-2">
                          <label
                            htmlFor="current-account-password"
                            className="text-[10px] font-bold uppercase tracking-widest text-text/30"
                          >
                            Current Account Password
                          </label>
                          <div className="relative">
                            <Input
                              id="current-account-password"
                              type={showCurrentPassword ? 'text' : 'password'}
                              autoComplete="current-password"
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              placeholder="Enter your current sign-in password"
                              value={currentPassword}
                              onChange={(e) => {
                                setCurrentPassword(e.target.value);
                                if (formError?.field === 'currentPassword') setFormError(null);
                              }}
                              ref={currentPasswordRef}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  newKeyRef.current?.focus();
                                }
                              }}
                              className={`pr-10 bg-white/5 ${
                                formError?.field === 'currentPassword'
                                  ? 'border-red-500/80 ring-2 ring-red-500/25 bg-red-500/5'
                                  : 'border-white/10'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text/20 hover:text-text/60 transition-colors"
                              aria-label={
                                showCurrentPassword
                                  ? 'Hide current password'
                                  : 'Show current password'
                              }
                            >
                              {showCurrentPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          {formError?.field === 'currentPassword' && (
                            <p className="flex items-center gap-1 text-[11px] font-medium text-red-400">
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                              {formError.message}
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <label
                            htmlFor="new-account-password"
                            className="text-[10px] font-bold uppercase tracking-widest text-text/30"
                          >
                            New Account Password
                          </label>
                          <div className="relative">
                            <Input
                              id="new-account-password"
                              type={showNewKey ? 'text' : 'password'}
                              autoComplete="new-password"
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              placeholder="Enter a new sign-in password"
                              value={newKey}
                              onChange={(e) => {
                                setNewKey(e.target.value);
                                if (formError?.field === 'newKey') setFormError(null);
                              }}
                              ref={newKeyRef}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  confirmKeyRef.current?.focus();
                                }
                              }}
                              className={`pr-20 bg-white/5 ${
                                formError?.field === 'newKey'
                                  ? 'border-red-500/80 ring-2 ring-red-500/25 bg-red-500/5'
                                  : 'border-white/10'
                              }`}
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setShowNewKey(!showNewKey)}
                                className="p-1.5 text-text/20 hover:text-text/60 transition-colors"
                                aria-label={showNewKey ? 'Hide new password' : 'Show new password'}
                              >
                                {showNewKey ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={generateSecureKey}
                                className="p-1.5 text-text/20 hover:text-emerald-500/60 transition-colors"
                                aria-label="Generate secure password"
                              >
                                <RefreshCw className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          {formError?.field === 'newKey' && (
                            <p className="flex items-center gap-1 text-[11px] font-medium text-red-400">
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                              {formError.message}
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <label
                            htmlFor="confirm-new-password"
                            className="text-[10px] font-bold uppercase tracking-widest text-text/30"
                          >
                            Confirm New Password
                          </label>
                          <div className="relative">
                            <Input
                              id="confirm-new-password"
                              type={showConfirmKey ? 'text' : 'password'}
                              autoComplete="new-password"
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              placeholder="Confirm the new sign-in password"
                              value={confirmKey}
                              onChange={(e) => {
                                setConfirmKey(e.target.value);
                                if (formError?.field === 'confirmKey') setFormError(null);
                              }}
                              ref={confirmKeyRef}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleChangePassword();
                                }
                              }}
                              className={`pr-10 bg-white/5 ${
                                formError?.field === 'confirmKey'
                                  ? 'border-red-500/80 ring-2 ring-red-500/25 bg-red-500/5'
                                  : 'border-white/10'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmKey(!showConfirmKey)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text/20 hover:text-text/60 transition-colors"
                              aria-label={
                                showConfirmKey ? 'Hide confirm password' : 'Show confirm password'
                              }
                            >
                              {showConfirmKey ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          {formError?.field === 'confirmKey' && (
                            <p className="flex items-center gap-1 text-[11px] font-medium text-red-400">
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                              {formError.message}
                            </p>
                          )}
                        </div>
                        <div className="text-[10px] text-text/40 -mt-2">
                          Requires: 16+ chars, Capital start, Number, Special char. Generated
                          length: {generatedCredentialLength}
                        </div>
                        <div className="flex items-start gap-2 rounded-xl bg-emerald-500/5 p-3 border border-emerald-500/10">
                          <AlertTriangle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-emerald-500/80 leading-relaxed">
                            This changes only your account sign-in password. Your Master Key and
                            encrypted vault data remain unchanged.
                          </p>
                        </div>
                      </div>
                    )}
                    {requiresCaptcha && (
                      <RecaptchaField
                        id="maintenance-recaptcha"
                        token={captchaToken}
                        status={captchaFeedback.status}
                        message={captchaFeedback.message}
                        resetNonce={captchaResetNonce}
                        onChange={handleCaptchaTokenChange}
                        onExpired={handleCaptchaExpired}
                        onError={handleCaptchaError}
                        disabled={isProcessing}
                      />
                    )}
                  </motion.div>
                )}

                {step === 2 && (
                  <div className="space-y-6 py-6">
                    <div className="flex items-center justify-between text-xs font-medium text-text/40 uppercase tracking-widest">
                      <span>{progress < 100 ? 'Processing...' : 'Ready'}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-black/20">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ ease: 'easeOut', duration: 0.3 }}
                        className="h-full transition-colors bg-white"
                      />
                    </div>
                    <p className="text-center text-[10px] text-text/30 animate-pulse">
                      Please do not close the tab or window
                    </p>
                  </div>
                )}

                {step === 3 && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center justify-center py-6 gap-4"
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-green-400">
                      <Check className="h-8 w-8" />
                    </div>
                    <p className="text-sm font-medium text-text">Process Completed Successfully</p>
                  </motion.div>
                )}
              </div>

              {/* Modal Footer - Fixed at bottom */}
              <div className="shrink-0 border-t border-card-border/40 dark:border-white/10 bg-card-bg/95 dark:bg-[#0c0c0e]/95 backdrop-blur-md px-4 py-3 sm:px-6 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {step === 1 && (
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
                    <Button
                      variant="secondary"
                      className="w-full sm:flex-1 h-10 sm:h-11 rounded-xl text-xs sm:text-sm justify-center"
                      onClick={onClose}
                      type="button"
                      disabled={isProcessing}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      aria-busy={isProcessing}
                      className={`w-full sm:flex-1 h-10 sm:h-11 rounded-xl text-xs sm:text-sm font-semibold justify-center text-white ${
                        type === 'export'
                          ? 'bg-blue-500 hover:bg-blue-600'
                          : type === 'import'
                            ? 'bg-green-500 hover:bg-green-600'
                            : type === 'changePassword'
                              ? 'bg-emerald-500 hover:bg-emerald-600'
                              : 'bg-amber-500 hover:bg-amber-600'
                      }`}
                      disabled={
                        isProcessing ||
                        (type === 'import'
                          ? !importFile
                          : type === 'changeKey'
                            ? !currentPassword || !newKey || !confirmKey || !isCaptchaCompleted
                            : type === 'changePassword'
                              ? !currentPassword || !newKey || !confirmKey || !isCaptchaCompleted
                              : false)
                      }
                    >
                      {isProcessing ? (
                        <span className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Initializing...
                        </span>
                      ) : type === 'export' ? (
                        'Start Export'
                      ) : type === 'import' ? (
                        'Start Import'
                      ) : type === 'changeKey' ? (
                        'Update Key'
                      ) : (
                        'Update Password'
                      )}
                    </Button>
                  </div>
                )}

                {step === 3 && (
                  <div className="flex justify-end">
                    <Button
                      variant="secondary"
                      className="w-full sm:w-auto px-6 h-10 sm:h-11 rounded-xl text-xs sm:text-sm font-semibold justify-center"
                      onClick={onClose}
                      type="button"
                    >
                      Close
                    </Button>
                  </div>
                )}
              </div>
            </form>
          </motion.div>
        </div>
      </AnimatePresence>
    );
  },
);

MaintenanceModal.displayName = 'MaintenanceModal';
