import React, { memo, useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import {
  Lock,
  Key,
  RefreshCw,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  ScanQrCode,
  ShieldAlert,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { handleError } from '../../lib/error-handler';
import { RecaptchaField } from '../../components/security/RecaptchaField';
import {
  generateFormattedPassword,
  MAX_GENERATED_CREDENTIAL_LENGTH,
  MIN_GENERATED_CREDENTIAL_LENGTH,
} from '../../lib/utils';
import { useVaultStore } from '../../store/vaultStore';
import { checkExactUsername } from '../../lib/auth-api';
import { useRecaptchaChallenge } from '../../hooks/useRecaptchaChallenge';
import { getFailedUnlockAttempts, type AuthErrorState } from './useVaultAuth';

interface Props {
  username?: string;
  setUsername?: (v: string) => void;
  accountPassword?: string;
  setAccountPassword?: (v: string) => void;
  vaultKey?: string;
  setVaultKey?: (v: string) => void;
  onUnlock: (captchaToken: string) => boolean | Promise<boolean>;
  onGoBack?: () => void;
  cloudSessionActive?: boolean;
  authMode?: 'login' | 'register';
  onAuthModeChange?: (value: 'login' | 'register') => void;
  twoFactorRequired?: boolean;
  otpToken?: string;
  setOtpToken?: (v: string) => void;
  onVerifyOTP?: (captchaToken: string) => boolean | Promise<boolean>;
  onBackToCredentials?: () => void;
  authError?: AuthErrorState | null;
  clearAuthError?: () => void;
}

interface ApiError {
  status?: number;
  code?: string;
  message?: string;
}

const noop = () => {};
const GENERATION_WINDOW_MS = 60_000;
const GENERATION_COOLDOWN_MS = 4_000;
const GENERATION_MAX_ATTEMPTS = 8;

const CREDENTIAL_REQUIREMENTS_HINT = `${MIN_GENERATED_CREDENTIAL_LENGTH}-${MAX_GENERATED_CREDENTIAL_LENGTH} characters, uppercase, lowercase, number, and special character required`;
const CREDENTIAL_REQUIREMENTS_DETAIL = `must be ${MIN_GENERATED_CREDENTIAL_LENGTH}-${MAX_GENERATED_CREDENTIAL_LENGTH} characters and include uppercase, lowercase, number, and special character with no spaces`;

const isValidPassword = (value: string) => {
  return new RegExp(
    `^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[^A-Za-z\\d])\\S{${MIN_GENERATED_CREDENTIAL_LENGTH},${MAX_GENERATED_CREDENTIAL_LENGTH}}$`,
  ).test(value);
};

const USERNAME_PATTERN = /^[a-z0-9._-]+$/i;

export const VaultLoginForm: React.FC<Props> = memo(
  ({
    username = '',
    setUsername = noop,
    accountPassword = '',
    setAccountPassword = noop,
    vaultKey = '',
    setVaultKey = noop,
    onUnlock,
    onGoBack,
    cloudSessionActive = false,
    authMode = 'login',
    onAuthModeChange = noop,
    twoFactorRequired = false,
    otpToken = '',
    setOtpToken = noop,
    onVerifyOTP = async () => false,
    onBackToCredentials = noop,
    authError = null,
    clearAuthError = noop,
  }) => {
    const [showAccountPassword, setShowAccountPassword] = useState(false);
    const [showVaultKey, setShowVaultKey] = useState(false);
    const [internalError, setInternalError] = useState<AuthErrorState | null>(null);
    const effectiveError = authError || internalError;
    const errorBannerRef = useRef<HTMLDivElement>(null);
    const prevAuthModeRef = useRef(authMode);

    const handleClearAllErrors = useCallback(() => {
      clearAuthError();
      setInternalError(null);
    }, [clearAuthError]);

    useEffect(() => {
      if (prevAuthModeRef.current !== authMode) {
        prevAuthModeRef.current = authMode;
        setAccountPassword('');
        setVaultKey('');
        setShowAccountPassword(false);
        setShowVaultKey(false);
        handleClearAllErrors();
      }
    }, [authMode, setAccountPassword, setVaultKey, handleClearAllErrors]);

    const generatedCredentialLength = useVaultStore(
      (state) => state.preferences.generatedCredentialLength,
    );
    const [loading, setLoading] = useState(false);
    const [generationCooldownUntil, setGenerationCooldownUntil] = useState(0);
    const generationAttemptTimestampsRef = useRef<number[]>([]);
    const [usernameCheckState, setUsernameCheckState] = useState<
      'idle' | 'checking' | 'available' | 'taken'
    >('idle');
    const usernameCheckRequestIdRef = useRef(0);
    const usernameCheckAbortControllerRef = useRef<AbortController | null>(null);
    const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const usernameRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const vaultKeyRef = useRef<HTMLInputElement>(null);
    const otpRef = useRef<HTMLInputElement>(null);
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
      clearFeedback: clearCaptchaFeedback,
    } = useRecaptchaChallenge();

    useEffect(() => {
      return () => {
        if (clipboardTimerRef.current) {
          clearTimeout(clipboardTimerRef.current);
        }
        usernameCheckAbortControllerRef.current?.abort();
      };
    }, []);

    const scheduleClipboardWipe = useCallback(() => {
      if (clipboardTimerRef.current) {
        clearTimeout(clipboardTimerRef.current);
        clipboardTimerRef.current = null;
      }
      clipboardTimerRef.current = setTimeout(() => {
        navigator.clipboard?.writeText('').catch(() => {});
        clipboardTimerRef.current = null;
      }, 30000);
    }, []);

    const handleAuthModeSwitch = useCallback(
      (newMode: 'login' | 'register') => {
        if (newMode === authMode) return;
        resetCaptchaChallenge();
        onAuthModeChange(newMode);
      },
      [authMode, onAuthModeChange, resetCaptchaChallenge],
    );

    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY?.trim() || '';
    const skipCaptcha =
      import.meta.env.MODE === 'test' ||
      (import.meta.env.DEV && import.meta.env.VITE_SKIP_CAPTCHA === 'true');
    const requiresCaptcha = !twoFactorRequired && Boolean(siteKey) && !skipCaptcha;

    useEffect(() => {
      // Only auto-focus on initial mount or when authMode/2FA state changes,
      // avoiding focus movement while the user is actively typing.
      if (
        document.activeElement === usernameRef.current ||
        document.activeElement === passwordRef.current ||
        document.activeElement === vaultKeyRef.current ||
        document.activeElement === otpRef.current
      ) {
        return;
      }

      if (twoFactorRequired) {
        otpRef.current?.focus();
      } else if (!username.trim()) {
        usernameRef.current?.focus();
      } else if (!cloudSessionActive && !accountPassword) {
        passwordRef.current?.focus();
      } else if (!vaultKey) {
        vaultKeyRef.current?.focus();
      }
    }, [authMode, twoFactorRequired, cloudSessionActive]);

    useEffect(() => {
      if (!effectiveError) return;
      errorBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (effectiveError.field === 'accountPassword') {
        passwordRef.current?.focus();
      } else if (effectiveError.field === 'vaultKey') {
        vaultKeyRef.current?.focus();
      } else if (effectiveError.field === 'username') {
        usernameRef.current?.focus();
      } else if (effectiveError.field === 'otp') {
        otpRef.current?.focus();
      }
    }, [effectiveError]);

    const validUsername = useMemo(() => {
      const normalized = username.trim().toLowerCase();
      return normalized.length >= 3 && USERNAME_PATTERN.test(normalized);
    }, [username]);

    useEffect(() => {
      if (authMode !== 'register' || cloudSessionActive || twoFactorRequired) {
        usernameCheckAbortControllerRef.current?.abort();
        setUsernameCheckState('idle');
        return;
      }

      const normalized = username.trim().toLowerCase();
      if (normalized.length < 3 || !USERNAME_PATTERN.test(normalized)) {
        usernameCheckAbortControllerRef.current?.abort();
        setUsernameCheckState('idle');
        return;
      }

      setUsernameCheckState('checking');
      const requestId = ++usernameCheckRequestIdRef.current;

      usernameCheckAbortControllerRef.current?.abort();
      const controller = new AbortController();
      usernameCheckAbortControllerRef.current = controller;

      const timeoutId = window.setTimeout(async () => {
        try {
          const result = await checkExactUsername(normalized, { signal: controller.signal });
          if (controller.signal.aborted || requestId !== usernameCheckRequestIdRef.current) return;
          setUsernameCheckState(result.exists && result.exactMatch ? 'taken' : 'available');
        } catch (err: unknown) {
          if (
            (err instanceof DOMException && err.name === 'AbortError') ||
            (err as { name?: string })?.name === 'AbortError' ||
            controller.signal.aborted
          ) {
            return;
          }
          if (requestId !== usernameCheckRequestIdRef.current) return;
          setUsernameCheckState('idle');
        }
      }, 350);

      return () => {
        controller.abort();
        window.clearTimeout(timeoutId);
      };
    }, [authMode, cloudSessionActive, twoFactorRequired, username]);
    const validAccountPassword = useMemo(
      () =>
        authMode === 'register'
          ? isValidPassword(accountPassword)
          : accountPassword.trim().length >= 1,
      [accountPassword, authMode],
    );
    const validVaultKey = useMemo(
      () => (authMode === 'register' ? isValidPassword(vaultKey) : vaultKey.trim().length >= 1),
      [vaultKey, authMode],
    );
    const validOtpToken = useMemo(() => {
      const normalized = otpToken.trim();
      return /^\d{6}$/.test(normalized) || /^[a-zA-Z0-9]{8}$/.test(normalized);
    }, [otpToken]);
    const isFormValid = useMemo(() => {
      if (twoFactorRequired) {
        return validUsername && validOtpToken && (!requiresCaptcha || isCaptchaCompleted);
      }

      const hasRequiredCredentials =
        authMode === 'register'
          ? validVaultKey && (cloudSessionActive || validAccountPassword)
          : validVaultKey || validAccountPassword;

      return (
        validUsername &&
        (authMode !== 'register' || usernameCheckState !== 'taken') &&
        (authMode !== 'register' || usernameCheckState !== 'checking') &&
        hasRequiredCredentials &&
        (!requiresCaptcha || isCaptchaCompleted)
      );
    }, [
      validUsername,
      authMode,
      usernameCheckState,
      validVaultKey,
      cloudSessionActive,
      validAccountPassword,
      twoFactorRequired,
      validOtpToken,
      requiresCaptcha,
      isCaptchaCompleted,
    ]);
    const canGenerateCredentials = !cloudSessionActive && authMode === 'register';

    const canGenerateNow = useCallback(() => {
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
        toast.error(`Generation limit reached. Try again in ${remainingSeconds}s.`);
        generationAttemptTimestampsRef.current = recentAttempts;
        return false;
      }

      generationAttemptTimestampsRef.current = [...recentAttempts, now];
      setGenerationCooldownUntil(now + GENERATION_COOLDOWN_MS);
      return true;
    }, [generationCooldownUntil]);

    const getGenerationTitle = useCallback(
      (field: string) =>
        canGenerateCredentials
          ? `Generate ${field}`
          : `${field} generation is available while creating an account`,
      [canGenerateCredentials],
    );

    const handleGenerateKey = useCallback(() => {
      if (!canGenerateCredentials) return;
      if (!canGenerateNow()) return;

      try {
        const key = generateFormattedPassword(generatedCredentialLength);
        setVaultKey(key);
        navigator.clipboard
          .writeText(key)
          .then(() => {
            toast.success('Master Key Generated & Copied', {
              description: 'Clipboard clearing will be attempted after 30 seconds.',
            });
            scheduleClipboardWipe();
          })
          .catch(() => {
            toast.error('Failed to copy to clipboard');
          });
        setShowVaultKey(true);
        vaultKeyRef.current?.focus();
      } catch (error) {
        handleError(error, 'Master Key Generation');
      }
    }, [
      canGenerateCredentials,
      canGenerateNow,
      generatedCredentialLength,
      scheduleClipboardWipe,
      setVaultKey,
    ]);

    const handleGenerateAccountPassword = useCallback(() => {
      if (!canGenerateCredentials) return;
      if (!canGenerateNow()) return;

      try {
        const password = generateFormattedPassword(generatedCredentialLength);
        setAccountPassword(password);
        navigator.clipboard
          .writeText(password)
          .then(() => {
            toast.success('Account Password Generated & Copied', {
              description: 'Clipboard clearing will be attempted after 30 seconds.',
            });
            scheduleClipboardWipe();
          })
          .catch(() => {
            toast.error('Failed to copy to clipboard');
          });
        setShowAccountPassword(true);
        passwordRef.current?.focus();
      } catch (error) {
        handleError(error, 'Account Password Generation');
      }
    }, [
      canGenerateCredentials,
      canGenerateNow,
      generatedCredentialLength,
      scheduleClipboardWipe,
      setAccountPassword,
    ]);

    const validateFormInput = useCallback((): boolean => {
      if (!username.trim()) {
        const errorState: AuthErrorState = {
          field: 'username',
          title: 'Account Identifier Required',
          message: 'Please enter your username so the Master Key can be derived correctly.',
        };
        setInternalError(errorState);
        toast.error(errorState.title, {
          description: errorState.message,
        });
        usernameRef.current?.focus();
        return false;
      }
      if (!USERNAME_PATTERN.test(username.trim().toLowerCase())) {
        const errorState: AuthErrorState = {
          field: 'username',
          title: 'Invalid Username',
          message:
            'Username cannot use @ and may only include letters, numbers, dots, underscores, and hyphens.',
        };
        setInternalError(errorState);
        toast.error(errorState.title, {
          description: errorState.message,
        });
        usernameRef.current?.focus();
        return false;
      }
      if (authMode === 'register' && usernameCheckState === 'taken') {
        const errorState: AuthErrorState = {
          field: 'username',
          title: 'Username Already Exists',
          message: 'This username is already taken. Please choose a different username.',
          code: 'USER_EXISTS',
        };
        setInternalError(errorState);
        toast.error(errorState.title, {
          description: errorState.message,
        });
        usernameRef.current?.focus();
        return false;
      }

      if (twoFactorRequired && !validOtpToken) {
        const errorState: AuthErrorState = {
          field: 'otp',
          title: 'Invalid Authenticator Code',
          message: 'Enter a valid 6-digit code or 8-character backup key.',
          code: 'INVALID_2FA_CODE',
        };
        setInternalError(errorState);
        toast.warning(errorState.message);
        otpRef.current?.focus();
        return false;
      }

      if (
        !twoFactorRequired &&
        !cloudSessionActive &&
        authMode === 'register' &&
        !validAccountPassword
      ) {
        const errorState: AuthErrorState = {
          field: 'accountPassword',
          title: 'Account Password Requirements Not Met',
          message: `Account password ${CREDENTIAL_REQUIREMENTS_DETAIL}`,
          code: 'AUTH_WEAK_PASSWORD',
        };
        setInternalError(errorState);
        toast.warning(errorState.message);
        passwordRef.current?.focus();
        return false;
      }

      if (!twoFactorRequired && authMode === 'register' && !validVaultKey) {
        const errorState: AuthErrorState = {
          field: 'vaultKey',
          title: 'Master Key Requirements Not Met',
          message: `Master Key ${CREDENTIAL_REQUIREMENTS_DETAIL}`,
          code: 'AUTH_WEAK_PASSWORD',
        };
        setInternalError(errorState);
        toast.warning(errorState.message);
        vaultKeyRef.current?.focus();
        return false;
      }

      if (
        !twoFactorRequired &&
        !cloudSessionActive &&
        authMode === 'login' &&
        !accountPassword.trim() &&
        !vaultKey.trim()
      ) {
        const errorState: AuthErrorState = {
          field: 'accountPassword',
          title: 'Credentials Required',
          message: 'Please enter your Account Password or Master Key to sign in.',
          code: 'INVALID_CREDENTIALS',
        };
        setInternalError(errorState);
        toast.warning(errorState.message);
        passwordRef.current?.focus();
        return false;
      }

      if (!twoFactorRequired && cloudSessionActive && !vaultKey.trim()) {
        const errorState: AuthErrorState = {
          field: 'vaultKey',
          title: 'Master Key Required',
          message: 'Please enter your Master Key or Decoy PIN to unlock your vault.',
          code: 'MASTER_KEY_INCORRECT',
        };
        setInternalError(errorState);
        toast.warning(errorState.message);
        vaultKeyRef.current?.focus();
        return false;
      }

      if (
        !twoFactorRequired &&
        !cloudSessionActive &&
        authMode === 'register' &&
        accountPassword &&
        vaultKey &&
        accountPassword === vaultKey
      ) {
        const errorState: AuthErrorState = {
          field: 'vaultKey',
          title: 'Security Requirement Error',
          message: 'Account password and Master Key must not be identical.',
        };
        setInternalError(errorState);
        toast.warning(errorState.message);
        vaultKeyRef.current?.focus();
        return false;
      }

      if (requiresCaptcha && !isCaptchaCompleted) {
        const errorState: AuthErrorState = {
          field: 'general',
          title: 'Security Verification Required',
          message: 'Please complete the CAPTCHA challenge before submitting.',
          code: 'CAPTCHA_REQUIRED',
        };
        setInternalError(errorState);
        toast.warning(errorState.message);
        return false;
      }

      return true;
    }, [
      username,
      authMode,
      usernameCheckState,
      twoFactorRequired,
      validOtpToken,
      cloudSessionActive,
      validAccountPassword,
      validVaultKey,
      accountPassword,
      vaultKey,
      requiresCaptcha,
      isCaptchaCompleted,
    ]);

    const executeUnlockFlow = useCallback(async (): Promise<boolean> => {
      if (twoFactorRequired) {
        const verified = await Promise.resolve(onVerifyOTP(captchaToken || ''));
        if (!verified) {
          if (requiresCaptcha) {
            setCaptchaRejected('Security verification failed. Please complete CAPTCHA again.');
          }
          return false;
        }
        if (requiresCaptcha) {
          clearCaptchaFeedback();
          resetCaptchaChallenge();
        }
        return true;
      } else {
        const verified = await Promise.resolve(onUnlock(captchaToken || ''));
        if (!verified) {
          setCaptchaRejected('Please complete CAPTCHA again before your next attempt.');
          return false;
        }
        clearCaptchaFeedback();
        resetCaptchaChallenge();
        return true;
      }
    }, [
      twoFactorRequired,
      onVerifyOTP,
      captchaToken,
      requiresCaptcha,
      setCaptchaRejected,
      clearCaptchaFeedback,
      resetCaptchaChallenge,
      onUnlock,
    ]);

    const handleAuthError = useCallback(
      (error: unknown) => {
        if (!twoFactorRequired && requiresCaptcha) {
          setCaptchaRejected('Security verification failed. Please complete CAPTCHA again.');
        }

        const apiError =
          typeof error === 'object' && error !== null ? (error as ApiError) : undefined;
        const isConflict = apiError?.status === 409 || apiError?.code === 'DUPLICATE_RESOURCE';
        const msg =
          error instanceof Error ? error.message : String(apiError?.message || error || '');

        if (isConflict && authMode === 'register') {
          const errorState: AuthErrorState = {
            field: 'username',
            title: 'Account Already Exists',
            message: 'This username is already taken. Would you like to sign in instead?',
            code: 'USER_EXISTS',
          };
          setInternalError(errorState);
          toast.error(errorState.title, {
            description: errorState.message,
            action: {
              label: 'Switch to Sign In',
              onClick: () => {
                handleAuthModeSwitch('login');
                toast.dismiss();
              },
            },
          });
        } else if (
          apiError?.code === 'DECRYPTION_FAILED' ||
          apiError?.code === 'MASTER_KEY_INCORRECT' ||
          /candidate salts exhausted/i.test(msg) ||
          /master key is incorrect/i.test(msg) ||
          /could not be decrypted/i.test(msg) ||
          /decryption failed/i.test(msg) ||
          /operation-failed/i.test(msg) ||
          /the operation failed/i.test(msg) ||
          /bad decrypt/i.test(msg)
        ) {
          const title = cloudSessionActive
            ? 'Master Key Incorrect'
            : 'Master Key Decryption Failed';
          const description = cloudSessionActive
            ? 'The Master Key you entered is incorrect or cannot decrypt this vault.'
            : 'The account password is valid, but the Master Key is incorrect or cannot decrypt this vault.';
          setInternalError({
            field: 'vaultKey',
            title,
            message: description,
            code: 'MASTER_KEY_INCORRECT',
          });
          toast.error(title, {
            description,
            duration: 6000,
          });
        } else if (
          authMode === 'login' &&
          (apiError?.status === 401 ||
            apiError?.code === 'INVALID_CREDENTIALS' ||
            /invalid username or password/i.test(msg) ||
            /incorrect password/i.test(msg))
        ) {
          // Prevent username enumeration: return a uniform authentication error message
          const title = cloudSessionActive ? 'Master Key Incorrect' : 'Authentication Failed';
          const description = cloudSessionActive
            ? 'The Master Key you entered is incorrect or cannot decrypt this vault.'
            : 'The username or account password is incorrect.';
          setInternalError({
            field: cloudSessionActive ? 'vaultKey' : 'accountPassword',
            title,
            message: description,
            code: 'INVALID_CREDENTIALS',
          });
          toast.error(title, {
            description,
          });
        } else if (
          apiError?.code === 'TOO_MANY_AUTH_ATTEMPTS' ||
          apiError?.code === 'RATE_LIMITED' ||
          apiError?.status === 429 ||
          /too many attempts/i.test(msg)
        ) {
          const title = 'Too Many Attempts';
          const description =
            'Too many authentication attempts detected. Please wait a moment and try again.';
          setInternalError({
            field: 'general',
            title,
            message: description,
            code: 'RATE_LIMITED',
          });
          toast.error(title, {
            description,
          });
        } else if (
          !twoFactorRequired &&
          (apiError?.code === 'CAPTCHA_TOKEN_EXPIRED' ||
            apiError?.code === 'CAPTCHA_VERIFICATION_FAILED' ||
            /captcha/i.test(msg))
        ) {
          const title = 'Security Verification Required';
          const description = 'Please complete the CAPTCHA check to continue.';
          setInternalError({
            field: 'general',
            title,
            message: description,
            code: 'CAPTCHA_REQUIRED',
          });
          toast.error(title, {
            description,
          });
        } else if (
          apiError?.code === 'SESSION_EXPIRED' ||
          apiError?.code === 'SESSION_REFRESH_FAILED' ||
          apiError?.code === 'INVALID_TOKEN' ||
          /session.*expired/i.test(msg)
        ) {
          const title = 'Session Expired';
          const description =
            'Your saved cloud session has expired. Please sign in with your account password.';
          setInternalError({
            field: 'general',
            title,
            message: description,
            code: 'SESSION_EXPIRED',
          });
          toast.error(title, {
            description,
          });
        } else if (
          apiError?.code === 'AUTH_WEAK_PASSWORD' ||
          apiError?.code === 'INVALID_PASSWORD' ||
          /password must/i.test(msg)
        ) {
          const title = 'Password Requirements Not Met';
          const description =
            'Use 16-64 characters with uppercase, lowercase, number, and special character.';
          setInternalError({
            field: 'accountPassword',
            title,
            message: description,
            code: 'AUTH_WEAK_PASSWORD',
          });
          toast.error(title, {
            description,
          });
        } else if (
          apiError?.code === 'NETWORK_ERROR' ||
          /failed to fetch/i.test(msg) ||
          /unable to reach/i.test(msg)
        ) {
          const title = 'Network Connection Issue';
          const description =
            'Could not connect to the server. Please check your internet connection.';
          setInternalError({
            field: 'general',
            title,
            message: description,
            code: 'NETWORK_ERROR',
          });
          toast.error(title, {
            description,
          });
        } else {
          const handled = handleError(
            error,
            twoFactorRequired ? '2FA Verification' : 'Vault Unlock',
          );
          setInternalError({
            field: 'general',
            title: twoFactorRequired ? '2FA Verification Failed' : 'Vault Unlock Failed',
            message:
              handled?.message || msg || 'An error occurred during verification. Please try again.',
            code: handled?.code || 'AUTH_ERROR',
          });
        }
      },
      [
        twoFactorRequired,
        requiresCaptcha,
        setCaptchaRejected,
        authMode,
        handleAuthModeSwitch,
        cloudSessionActive,
      ],
    );

    const handleUnlock = useCallback(async () => {
      if (loading) return;
      if (!validateFormInput()) return;

      try {
        setLoading(true);
        const verified = await executeUnlockFlow();
        if (!verified) {
          return;
        }
      } catch (error: unknown) {
        handleAuthError(error);
      } finally {
        setLoading(false);
      }
    }, [loading, validateFormInput, executeUnlockFlow, handleAuthError]);

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl"
      >
        <Card className="overflow-hidden rounded-[2rem] border border-card-border bg-card-bg p-2 shadow-sm dark:border-white/10 dark:bg-black/90">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-card-border bg-card-bg dark:border-white/10 dark:bg-black/40">
              <Lock className="h-7 w-7" />
            </div>

            <CardTitle className="text-3xl font-bold md:text-4xl">Encrypted Vault Access</CardTitle>

            <CardDescription>
              {twoFactorRequired
                ? 'Secured with Two-Factor Authentication. Please enter the code from your authenticator app.'
                : cloudSessionActive
                  ? 'Cloud session restored. Enter the master key to decrypt and unlock.'
                  : authMode === 'register'
                    ? 'Create an account password, then decrypt with your vault key.'
                    : 'Sign in with your account password, then decrypt with your vault key.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <AnimatePresence mode="wait">
              {effectiveError && (
                <motion.div
                  key="auth-top-error-banner"
                  ref={errorBannerRef}
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  role="alert"
                  aria-live="assertive"
                  className="relative overflow-hidden rounded-2xl border border-red-500/35 bg-gradient-to-br from-red-500/20 via-red-500/10 to-transparent p-4 shadow-sm backdrop-blur-md dark:border-red-500/40"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-400 ring-1 ring-red-500/30">
                      <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1 pr-6">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-bold tracking-tight text-red-300">
                          {effectiveError.title}
                        </h4>
                        {typeof effectiveError.remainingAttempts === 'number' && (
                          <span className="inline-flex items-center rounded-full bg-red-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-200 ring-1 ring-red-500/40">
                            {effectiveError.remainingAttempts} attempt
                            {effectiveError.remainingAttempts === 1 ? '' : 's'} remaining
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-red-200/90 break-words">
                        {effectiveError.message}
                      </p>
                      {effectiveError.code === 'USER_EXISTS' && authMode === 'register' && (
                        <button
                          type="button"
                          onClick={() => {
                            handleClearAllErrors();
                            handleAuthModeSwitch('login');
                          }}
                          className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-red-500/25 hover:bg-red-500/35 px-3 py-1.5 text-xs font-semibold text-red-100 transition-colors"
                        >
                          Switch to Sign In →
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleClearAllErrors}
                      className="absolute right-3 top-3 rounded-lg p-1 text-red-300/70 hover:bg-red-500/20 hover:text-red-200 transition-colors focus:outline-none focus:ring-1 focus:ring-red-400"
                      title="Dismiss error"
                      aria-label="Dismiss error"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {getFailedUnlockAttempts() > 0 &&
              !effectiveError &&
              useVaultStore.getState().preferences.isBruteForceWipeEnabled !== false &&
              authMode === 'login' && (
                <div className="flex items-center gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-xs text-amber-300">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
                  <span className="leading-tight">
                    <strong>Security Warning:</strong> {getFailedUnlockAttempts()}/
                    {useVaultStore.getState().preferences.maxFailedAttemptsBeforeWipe || 10} failed
                    attempts. Local keys will self-destruct if limit is reached.
                  </span>
                </div>
              )}

            {!cloudSessionActive && !twoFactorRequired && (
              <div className="grid grid-cols-2 gap-2 rounded-[1.25rem] border border-card-border bg-card-bg p-1 dark:border-white/10 dark:bg-black/40">
                <button
                  type="button"
                  onClick={() => handleAuthModeSwitch('login')}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] transition-all ${
                    authMode === 'login'
                      ? 'border border-text/15 bg-text/10 text-text'
                      : 'text-text/55 hover:bg-text/10 hover:text-text/85'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => handleAuthModeSwitch('register')}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.14em] transition-all ${
                    authMode === 'register'
                      ? 'border border-text/15 bg-text/10 text-text'
                      : 'text-text/55 hover:bg-text/10 hover:text-text/85'
                  }`}
                >
                  Sign Up
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleUnlock();
              }}
              className="space-y-6"
            >
              <div className="space-y-4">
                {!twoFactorRequired && !cloudSessionActive && (
                  <div className="group w-full">
                    <label htmlFor="username" className="sr-only">
                      Account Identifier (Username)
                    </label>
                    <div className="relative">
                      <input
                        id="username"
                        data-testid="auth-username-input"
                        type="text"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="Username"
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          if (effectiveError?.field === 'username') handleClearAllErrors();
                        }}
                        disabled={loading}
                        readOnly={cloudSessionActive}
                        ref={usernameRef}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (!cloudSessionActive) {
                              passwordRef.current?.focus();
                            } else {
                              vaultKeyRef.current?.focus();
                            }
                          }
                        }}
                        className={`w-full rounded-[1.1rem] border bg-card-bg pl-12 pr-12 py-4 text-base md:text-lg outline-none transition-all placeholder:text-text/25 focus:border-white/20 focus:bg-card-bg/80 dark:bg-black/30 ${
                          effectiveError?.field === 'username'
                            ? 'border-red-500/80 ring-2 ring-red-500/25 bg-red-500/5'
                            : 'border-card-border dark:border-white/10'
                        } aria-[invalid=true]:border-red-500/50`}
                        aria-invalid={
                          effectiveError?.field === 'username' ||
                          (username.trim().length > 0 && !validUsername)
                        }
                        aria-describedby={
                          effectiveError?.field === 'username'
                            ? 'username-auth-error'
                            : username.trim().length > 0 && !validUsername
                              ? 'username-format-error'
                              : authMode === 'register' && usernameCheckState === 'taken'
                                ? 'username-taken-error'
                                : undefined
                        }
                      />
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                        <Lock
                          className={`h-5 w-5 transition-colors ${effectiveError?.field === 'username' ? 'text-red-400' : 'text-text/35 group-focus-within:text-text/80'}`}
                        />
                      </div>
                      <div
                        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        {authMode === 'register' && usernameCheckState === 'checking' ? (
                          <>
                            <span className="sr-only">Checking username availability...</span>
                            <Loader2 className="h-5 w-5 animate-spin text-text/55" />
                          </>
                        ) : null}
                        {authMode === 'register' && usernameCheckState === 'available' ? (
                          <>
                            <span className="sr-only">Username available</span>
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                          </>
                        ) : null}
                        {authMode === 'register' && usernameCheckState === 'taken' ? (
                          <>
                            <span className="sr-only">Username already taken</span>
                            <XCircle className="h-5 w-5 text-red-400" />
                          </>
                        ) : null}
                      </div>
                    </div>
                    {effectiveError?.field === 'username' && (
                      <motion.p
                        id="username-auth-error"
                        role="alert"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-2 flex items-center gap-1.5 pl-4 text-xs font-medium text-red-400"
                      >
                        <XCircle className="h-3.5 w-3.5 shrink-0" />
                        {effectiveError.message}
                      </motion.p>
                    )}
                    {!effectiveError && username.trim().length > 0 && !validUsername && (
                      <motion.p
                        id="username-format-error"
                        role="alert"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-2 text-xs text-red-400 pl-4"
                      >
                        Username must be at least 3 characters and can only include letters,
                        numbers, dots, underscores, and hyphens
                      </motion.p>
                    )}
                    {!effectiveError &&
                      authMode === 'register' &&
                      usernameCheckState === 'taken' && (
                        <motion.p
                          id="username-taken-error"
                          role="alert"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-2 text-xs text-red-400 pl-4"
                        >
                          Username already exists. Please choose another username.
                        </motion.p>
                      )}
                  </div>
                )}

                {!cloudSessionActive && !twoFactorRequired && (
                  <div className="group w-full">
                    <label htmlFor="account-password" className="sr-only">
                      Account Password
                    </label>
                    <div className="relative">
                      <input
                        id="account-password"
                        data-testid="auth-account-password-input"
                        type={showAccountPassword ? 'text' : 'password'}
                        autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder={
                          authMode === 'register'
                            ? 'Account Password (for Cloud Account)'
                            : 'Account Password'
                        }
                        value={accountPassword}
                        onChange={(e) => {
                          setAccountPassword(e.target.value);
                          if (effectiveError?.field === 'accountPassword') handleClearAllErrors();
                        }}
                        disabled={loading}
                        ref={passwordRef}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            vaultKeyRef.current?.focus();
                          }
                        }}
                        className={`w-full rounded-[1.1rem] border bg-card-bg pl-12 pr-24 py-4 text-base md:text-lg outline-none transition-all placeholder:text-text/25 focus:border-white/20 focus:bg-card-bg/80 dark:bg-black/30 ${
                          effectiveError?.field === 'accountPassword'
                            ? 'border-red-500/80 ring-2 ring-red-500/25 bg-red-500/5'
                            : 'border-card-border dark:border-white/10'
                        } aria-[invalid=true]:border-red-500/50`}
                        aria-invalid={
                          effectiveError?.field === 'accountPassword' ||
                          (authMode === 'register' &&
                            accountPassword.length > 0 &&
                            !validAccountPassword)
                        }
                        aria-describedby={
                          effectiveError?.field === 'accountPassword'
                            ? 'account-password-auth-error'
                            : authMode === 'register' &&
                                accountPassword.length > 0 &&
                                !validAccountPassword
                              ? 'account-password-error'
                              : undefined
                        }
                      />

                      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                        <Lock
                          className={`h-5 w-5 transition-colors ${effectiveError?.field === 'accountPassword' ? 'text-red-400' : 'text-text/35 group-focus-within:text-text/80'}`}
                        />
                      </div>

                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          onClick={() => setShowAccountPassword((value) => !value)}
                          className="cursor-pointer rounded-xl p-2 text-text/45 transition-all hover:bg-white/5 hover:text-text/80 disabled:cursor-not-allowed disabled:opacity-40"
                          title={showAccountPassword ? 'Hide' : 'Show'}
                          aria-label={
                            showAccountPassword ? 'Hide account password' : 'Show account password'
                          }
                          aria-pressed={showAccountPassword}
                          type="button"
                          disabled={loading}
                        >
                          {showAccountPassword ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>

                        <div className="mx-1 h-4 w-px bg-white/10" />

                        <button
                          onClick={handleGenerateAccountPassword}
                          className="rounded-xl p-2 text-text/45 transition-all hover:bg-white/5 hover:text-text/85 disabled:cursor-not-allowed disabled:opacity-40"
                          title={getGenerationTitle('Account Password')}
                          aria-label="Generate account password"
                          type="button"
                          disabled={!canGenerateCredentials || loading}
                        >
                          <RefreshCw className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    {effectiveError?.field === 'accountPassword' && (
                      <motion.p
                        id="account-password-auth-error"
                        role="alert"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-2 flex items-center gap-1.5 pl-4 text-xs font-medium text-red-400"
                      >
                        <XCircle className="h-3.5 w-3.5 shrink-0" />
                        {effectiveError.message}
                      </motion.p>
                    )}
                    {!effectiveError &&
                      authMode === 'register' &&
                      accountPassword.length > 0 &&
                      !validAccountPassword && (
                        <motion.p
                          id="account-password-error"
                          role="alert"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-2 text-xs text-red-400 pl-4"
                        >
                          {CREDENTIAL_REQUIREMENTS_HINT}
                        </motion.p>
                      )}
                  </div>
                )}

                {twoFactorRequired && (
                  <div className="space-y-4">
                    <div className="group w-full">
                      <label htmlFor="otp-token" className="sr-only">
                        Authenticator Code
                      </label>
                      <div className="relative">
                        <input
                          id="otp-token"
                          type="text"
                          inputMode={/^\d*$/.test(otpToken) ? 'numeric' : 'text'}
                          autoComplete="one-time-code"
                          placeholder="6-digit Code or 8-char Backup Key"
                          maxLength={8}
                          value={otpToken}
                          onChange={(e) => {
                            setOtpToken(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8));
                            if (effectiveError?.field === 'otp') handleClearAllErrors();
                          }}
                          disabled={loading}
                          ref={otpRef}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleUnlock();
                            }
                          }}
                          className={`w-full rounded-[1.1rem] border bg-card-bg pl-12 pr-4 py-4 text-center font-mono text-base tracking-[0.2em] outline-none transition-all placeholder:text-text/25 focus:border-white/20 focus:bg-card-bg/80 dark:bg-black/30 md:text-lg ${
                            effectiveError?.field === 'otp'
                              ? 'border-red-500/80 ring-2 ring-red-500/25 bg-red-500/5'
                              : 'border-card-border dark:border-white/10'
                          }`}
                          aria-invalid={
                            effectiveError?.field === 'otp' ||
                            (otpToken.length > 0 && !validOtpToken)
                          }
                          aria-describedby={
                            effectiveError?.field === 'otp'
                              ? 'otp-auth-error'
                              : otpToken.length > 0 && !validOtpToken
                                ? 'otp-error'
                                : undefined
                          }
                        />
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                          {loading ? (
                            <Loader2 className="h-5 w-5 animate-spin text-text/55" />
                          ) : (
                            <ScanQrCode
                              className={`h-5 w-5 transition-colors ${effectiveError?.field === 'otp' ? 'text-red-400' : 'text-text/35 group-focus-within:text-text/80'}`}
                            />
                          )}
                        </div>
                      </div>
                      {effectiveError?.field === 'otp' && (
                        <motion.p
                          id="otp-auth-error"
                          role="alert"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs font-medium text-red-400"
                        >
                          <XCircle className="h-3.5 w-3.5 shrink-0" />
                          {effectiveError.message}
                        </motion.p>
                      )}
                      {!effectiveError && otpToken.length > 0 && !validOtpToken && (
                        <motion.p
                          id="otp-error"
                          role="alert"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-2 text-xs text-red-400 text-center"
                        >
                          Enter a valid 6-digit authenticator code or 8-character backup key
                        </motion.p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAccountPassword(false);
                        setShowVaultKey(false);
                        onBackToCredentials();
                      }}
                      className="w-full py-2 text-center text-xs uppercase tracking-[0.18em] text-text/45 transition-colors hover:text-text/80"
                    >
                      Back to credentials
                    </button>
                  </div>
                )}

                {cloudSessionActive && !twoFactorRequired && (
                  <div className="flex items-center justify-between px-4 py-3 text-sm text-emerald-400">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      <span>
                        {' '}
                        <strong className="font-semibold">{username}</strong>
                      </span>
                    </div>
                    {onGoBack && (
                      <button
                        type="button"
                        onClick={onGoBack}
                        className="text-xs text-emerald-300/80 hover:text-emerald-200 underline transition-colors "
                      >
                        Sign Out
                      </button>
                    )}
                  </div>
                )}

                {!twoFactorRequired && (
                  <div className="group w-full">
                    <label htmlFor="master-key" className="sr-only">
                      Master Key
                    </label>
                    <div className="relative">
                      <input
                        id="master-key"
                        data-testid="auth-master-key-input"
                        type={showVaultKey ? 'text' : 'password'}
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder={
                          authMode === 'register'
                            ? 'Master Key (Vault Encryption Key)'
                            : 'Master Key (Vault Key)'
                        }
                        value={vaultKey}
                        onChange={(e) => {
                          setVaultKey(e.target.value);
                          if (effectiveError?.field === 'vaultKey') handleClearAllErrors();
                        }}
                        disabled={loading}
                        ref={vaultKeyRef}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            // Let form handle submit
                          }
                        }}
                        className={`w-full rounded-[1.1rem] border bg-card-bg pl-12 pr-24 py-4 text-base md:text-lg outline-none transition-all placeholder:text-text/25 focus:border-white/20 focus:bg-card-bg/80 dark:bg-black/30 ${
                          effectiveError?.field === 'vaultKey'
                            ? 'border-red-500/80 ring-2 ring-red-500/25 bg-red-500/5'
                            : 'border-card-border dark:border-white/10'
                        } aria-[invalid=true]:border-red-500/50`}
                        aria-invalid={
                          effectiveError?.field === 'vaultKey' ||
                          (authMode === 'register' && vaultKey.length > 0 && !validVaultKey)
                        }
                        aria-describedby={
                          effectiveError?.field === 'vaultKey'
                            ? 'master-key-auth-error'
                            : authMode === 'register' && vaultKey.length > 0 && !validVaultKey
                              ? 'master-key-error'
                              : undefined
                        }
                      />

                      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                        <Key
                          className={`h-5 w-5 transition-colors ${effectiveError?.field === 'vaultKey' ? 'text-red-400' : 'text-text/35 group-focus-within:text-text/80'}`}
                        />
                      </div>

                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          onClick={() => setShowVaultKey((value) => !value)}
                          className="cursor-pointer rounded-xl p-2 text-text/45 transition-all hover:bg-white/5 hover:text-text/80 disabled:cursor-not-allowed disabled:opacity-40"
                          title={showVaultKey ? 'Hide' : 'Show'}
                          aria-label={showVaultKey ? 'Hide master key' : 'Show master key'}
                          aria-pressed={showVaultKey}
                          type="button"
                          disabled={loading}
                        >
                          {showVaultKey ? (
                            <EyeOff className="h-5 w-5" />
                          ) : (
                            <Eye className="h-5 w-5" />
                          )}
                        </button>

                        <div className="mx-1 h-4 w-px bg-white/10" />

                        <button
                          onClick={handleGenerateKey}
                          className="rounded-xl p-2 text-text/45 transition-all hover:bg-white/5 hover:text-text/85 disabled:cursor-not-allowed disabled:opacity-40"
                          title={getGenerationTitle('Master Key')}
                          aria-label="Generate master key"
                          type="button"
                          disabled={!canGenerateCredentials || loading}
                        >
                          <RefreshCw className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    {effectiveError?.field === 'vaultKey' && (
                      <motion.p
                        id="master-key-auth-error"
                        role="alert"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-2 flex items-center gap-1.5 pl-4 text-xs font-medium text-red-400"
                      >
                        <XCircle className="h-3.5 w-3.5 shrink-0" />
                        {effectiveError.message}
                      </motion.p>
                    )}
                    {!effectiveError &&
                      authMode === 'register' &&
                      vaultKey.length > 0 &&
                      !validVaultKey && (
                        <motion.p
                          id="master-key-error"
                          role="alert"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-2 text-xs text-red-400 pl-4"
                        >
                          {CREDENTIAL_REQUIREMENTS_HINT}
                        </motion.p>
                      )}
                  </div>
                )}
              </div>

              {requiresCaptcha && (
                <RecaptchaField
                  id="auth-recaptcha"
                  token={captchaToken}
                  status={captchaFeedback.status}
                  message={captchaFeedback.message}
                  resetNonce={captchaResetNonce}
                  onChange={handleCaptchaTokenChange}
                  onExpired={handleCaptchaExpired}
                  onError={handleCaptchaError}
                  disabled={loading}
                />
              )}

              <div className="mt-2 text-center text-xs text-text/50 font-medium">
                {twoFactorRequired
                  ? 'Two-Factor Authentication Required'
                  : cloudSessionActive
                    ? 'Cloud session active. Enter Master Key to decrypt local vault.'
                    : authMode === 'register'
                      ? 'Create an Account Password (for sign-in) and a Master Key (to encrypt your vault).'
                      : 'Enter your Account Password and Master Key to decrypt your vault.'}
              </div>

              <Button
                type="submit"
                data-testid="auth-submit-button"
                className="h-14 w-full rounded-[1.1rem] border border-text/10 bg-text/10 text-lg text-text hover:bg-text/15"
                disabled={loading || !isFormValid}
                aria-busy={loading}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    Processing...
                  </span>
                ) : twoFactorRequired ? (
                  'Verify & Unlock'
                ) : cloudSessionActive ? (
                  'Unlock'
                ) : authMode === 'register' ? (
                  'Create Account'
                ) : (
                  'Unlock'
                )}
              </Button>
            </form>

            {onGoBack && (
              <Button
                variant="ghost"
                onClick={onGoBack}
                className="h-12 w-full rounded-xl text-sm text-text/45 hover:text-text"
              >
                Return to Home
              </Button>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  },
);

VaultLoginForm.displayName = 'VaultLoginForm';
