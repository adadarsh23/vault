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
} from 'lucide-react';
import { motion } from 'framer-motion';
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
}

const noop = () => {};
const GENERATION_WINDOW_MS = 60_000;
const GENERATION_COOLDOWN_MS = 4_000;
const GENERATION_MAX_ATTEMPTS = 8;

const isValidPassword = (value: string) => {
  return new RegExp(
    `^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[^A-Za-z\\d])\\S{${MIN_GENERATED_CREDENTIAL_LENGTH},${MAX_GENERATED_CREDENTIAL_LENGTH}}$`
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
  }) => {
    const [showAccountPassword, setShowAccountPassword] = useState(false);
    const [showVaultKey, setShowVaultKey] = useState(false);
    const generatedCredentialLength = useVaultStore(
      (state) => state.preferences.generatedCredentialLength
    );
    const [loading, setLoading] = useState(false);
    const [generationCooldownUntil, setGenerationCooldownUntil] = useState(0);
    const generationAttemptTimestampsRef = useRef<number[]>([]);
    const [usernameCheckState, setUsernameCheckState] = useState<
      'idle' | 'checking' | 'available' | 'taken'
    >('idle');
    const usernameCheckRequestIdRef = useRef(0);
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

    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY?.trim() || '';
    const skipCaptcha =
      import.meta.env.VITE_SKIP_CAPTCHA === 'true' || import.meta.env.MODE === 'test';
    const requiresCaptcha = !twoFactorRequired && Boolean(siteKey) && !skipCaptcha;

    useEffect(() => {
      // Only auto-focus if the user isn't already focused on one of the inputs
      // to avoid jumping focus while typing.
      if (
        document.activeElement === usernameRef.current ||
        document.activeElement === passwordRef.current ||
        document.activeElement === vaultKeyRef.current
      ) {
        return;
      }

      if (!username.trim()) {
        usernameRef.current?.focus();
      } else if (!cloudSessionActive && !accountPassword) {
        passwordRef.current?.focus();
      } else if (!vaultKey) {
        vaultKeyRef.current?.focus();
      } else if (twoFactorRequired) {
        otpRef.current?.focus();
      }
    }, [username, accountPassword, vaultKey, cloudSessionActive, authMode, twoFactorRequired]);

    const validUsername = useMemo(() => {
      const normalized = username.trim().toLowerCase();
      return normalized.length >= 3 && USERNAME_PATTERN.test(normalized);
    }, [username]);

    useEffect(() => {
      if (authMode !== 'register' || cloudSessionActive || twoFactorRequired) {
        setUsernameCheckState('idle');
        return;
      }

      const normalized = username.trim().toLowerCase();
      if (normalized.length < 3 || !USERNAME_PATTERN.test(normalized)) {
        setUsernameCheckState('idle');
        return;
      }

      setUsernameCheckState('checking');
      const requestId = ++usernameCheckRequestIdRef.current;
      const timeoutId = window.setTimeout(async () => {
        try {
          const result = await checkExactUsername(normalized);
          if (requestId !== usernameCheckRequestIdRef.current) return;
          setUsernameCheckState(result.exists && result.exactMatch ? 'taken' : 'available');
        } catch {
          if (requestId !== usernameCheckRequestIdRef.current) return;
          setUsernameCheckState('idle');
        }
      }, 350);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }, [authMode, cloudSessionActive, twoFactorRequired, username]);
    const validAccountPassword = useMemo(
      () => isValidPassword(accountPassword.trim()),
      [accountPassword]
    );
    const validVaultKey = useMemo(() => isValidPassword(vaultKey.trim()), [vaultKey]);
    const validOtpToken = useMemo(() => {
      const normalized = otpToken.trim();
      return /^\d{6}$/.test(normalized) || /^[a-zA-Z0-9]{8}$/.test(normalized);
    }, [otpToken]);
    const isFormValid = useMemo(() => {
      if (twoFactorRequired) {
        return validUsername && validOtpToken && (!requiresCaptcha || isCaptchaCompleted);
      }

      return (
        validUsername &&
        (authMode !== 'register' || usernameCheckState !== 'taken') &&
        (authMode !== 'register' || usernameCheckState !== 'checking') &&
        validVaultKey &&
        (cloudSessionActive || validAccountPassword) &&
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
        (timestamp) => now - timestamp <= GENERATION_WINDOW_MS
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
      [canGenerateCredentials]
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
              description: 'Clipboard will automatically clear in 30 seconds.',
            });
            setTimeout(() => {
              navigator.clipboard
                .readText()
                .then((text) => {
                  if (text === key) {
                    navigator.clipboard.writeText('');
                  }
                })
                .catch(() => {
                  // Ignore if we can't read the clipboard
                });
            }, 30000);
          })
          .catch(() => {
            toast.error('Failed to copy to clipboard');
          });
        setShowVaultKey(true);
        vaultKeyRef.current?.focus();
      } catch (error) {
        handleError(error, 'Master Key Generation');
      }
    }, [canGenerateCredentials, canGenerateNow, generatedCredentialLength, setVaultKey]);

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
              description: 'Clipboard will automatically clear in 30 seconds.',
            });
            setTimeout(() => {
              navigator.clipboard
                .readText()
                .then((text) => {
                  if (text === password) {
                    navigator.clipboard.writeText('');
                  }
                })
                .catch(() => {
                  // Ignore if we can't read the clipboard
                });
            }, 30000);
          })
          .catch(() => {
            toast.error('Failed to copy to clipboard');
          });
        setShowAccountPassword(true);
        passwordRef.current?.focus();
      } catch (error) {
        handleError(error, 'Account Password Generation');
      }
    }, [canGenerateCredentials, canGenerateNow, generatedCredentialLength, setAccountPassword]);

    const handleUnlock = useCallback(async () => {
      if (loading) return;

      if (!username.trim()) {
        toast.error('Account Identifier Required', {
          description: 'Please enter your username so the Master Key can be derived correctly.',
        });
        return;
      }
      if (!USERNAME_PATTERN.test(username.trim().toLowerCase())) {
        toast.error('Invalid Username', {
          description:
            'Username cannot use @ and may only include letters, numbers, dots, underscores, and hyphens.',
        });
        return;
      }
      if (authMode === 'register' && usernameCheckState === 'taken') {
        toast.error('Username already exists', {
          description: 'Please choose a different username.',
        });
        return;
      }

      if (twoFactorRequired && !validOtpToken) {
        toast.warning('Enter a valid 6-digit code or 8-character backup key.');
        return;
      }

      if (!twoFactorRequired && !cloudSessionActive && !validAccountPassword) {
        toast.warning(
          'Account password must be 16-64 characters and include uppercase, lowercase, number, and special character with no spaces'
        );
        return;
      }

      if (!twoFactorRequired && !validVaultKey) {
        toast.warning(
          'Master Key must be 16-64 characters and include uppercase, lowercase, number, and special character with no spaces'
        );
        return;
      }

      if (
        !twoFactorRequired &&
        !cloudSessionActive &&
        accountPassword &&
        vaultKey &&
        accountPassword === vaultKey
      ) {
        toast.warning('Account password and Master Key must not be identical');
        return;
      }

      if (requiresCaptcha && !isCaptchaCompleted) {
        toast.warning('Please complete CAPTCHA before submitting.');
        return;
      }

      try {
        setLoading(true);
        if (twoFactorRequired) {
          const verified = await Promise.resolve(onVerifyOTP(captchaToken || ''));
          if (!verified) {
            if (requiresCaptcha) {
              setCaptchaRejected('Security verification failed. Please complete CAPTCHA again.');
            }
            return;
          }
          if (requiresCaptcha) {
            clearCaptchaFeedback();
            resetCaptchaChallenge();
          }
        } else {
          const verified = await Promise.resolve(onUnlock(captchaToken || ''));
          if (!verified) {
            setCaptchaRejected('Please complete CAPTCHA again before your next attempt.');
            return;
          }
          clearCaptchaFeedback();
          resetCaptchaChallenge();
        }
      } catch (error: any) {
        if (!twoFactorRequired && requiresCaptcha) {
          setCaptchaRejected('Security verification failed. Please complete CAPTCHA again.');
        }

        const isConflict = error?.status === 409 || error?.code === 'DUPLICATE_RESOURCE';

        const msg = String(error?.message || '');
        if (isConflict && authMode === 'register') {
          toast.error('Account Already Exists', {
            description: 'This username is already taken. Would you like to sign in instead?',
            action: {
              label: 'Switch to Sign In',
              onClick: () => {
                onAuthModeChange('login');
                toast.dismiss();
              },
            },
          });
        } else if (
          /candidate salts exhausted/i.test(msg) ||
          /master key is incorrect/i.test(msg) ||
          /could not be decrypted/i.test(msg)
        ) {
          toast.error('Master Key Incorrect', {
            description:
              'The account password is valid, but the Master Key is incorrect or cannot decrypt this vault.',
          });
        } else if (
          authMode === 'login' &&
          (error?.status === 401 ||
            error?.code === 'INVALID_CREDENTIALS' ||
            /invalid username or password/i.test(msg))
        ) {
          try {
            const check = await checkExactUsername(username.trim().toLowerCase());
            if (!check.exists) {
              toast.error('Account Not Found', {
                description: `No account exists for "${username.trim()}". Please sign up to create this vault.`,
                action: {
                  label: 'Switch to Sign Up',
                  onClick: () => {
                    onAuthModeChange('register');
                    toast.dismiss();
                  },
                },
              });
              return;
            }
          } catch {
            // Fall through to default error handler
          }
          handleError(error, 'Vault Login');
        } else {
          handleError(error, twoFactorRequired ? '2FA Verification' : 'Vault Unlock');
        }
      } finally {
        setLoading(false);
      }
    }, [
      loading,
      cloudSessionActive,
      clearCaptchaFeedback,
      captchaToken,
      isCaptchaCompleted,
      onUnlock,
      onVerifyOTP,
      requiresCaptcha,
      resetCaptchaChallenge,
      setCaptchaRejected,
      username,
      validAccountPassword,
      validVaultKey,
      validOtpToken,
      twoFactorRequired,
      authMode,
      usernameCheckState,
      onAuthModeChange,
    ]);

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
            {!cloudSessionActive && !twoFactorRequired && (
              <div className="grid grid-cols-2 gap-2 rounded-[1.25rem] border border-card-border bg-card-bg p-1 dark:border-white/10 dark:bg-black/40">
                <button
                  type="button"
                  onClick={() => {
                    onAuthModeChange('login');
                    resetCaptchaChallenge();
                  }}
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
                  onClick={() => {
                    onAuthModeChange('register');
                    resetCaptchaChallenge();
                  }}
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
                        onChange={(e) => setUsername(e.target.value)}
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
                        className="w-full rounded-[1.1rem] border border-card-border bg-card-bg pl-12 pr-12 py-4 text-base md:text-lg outline-none transition-all placeholder:text-text/25 focus:border-white/20 focus:bg-card-bg/80 dark:border-white/10 dark:bg-black/30 aria-[invalid=true]:border-red-500/50"
                        aria-invalid={username.trim().length > 0 && !validUsername}
                      />
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                        <Lock className="h-5 w-5 text-text/35 group-focus-within:text-text/80 transition-colors" />
                      </div>
                      <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                        {authMode === 'register' && usernameCheckState === 'checking' ? (
                          <Loader2 className="h-5 w-5 animate-spin text-text/55" />
                        ) : null}
                        {authMode === 'register' && usernameCheckState === 'available' ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        ) : null}
                        {authMode === 'register' && usernameCheckState === 'taken' ? (
                          <XCircle className="h-5 w-5 text-red-400" />
                        ) : null}
                      </div>
                    </div>
                    {username.trim().length > 0 && !validUsername && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-2 text-xs text-red-400 pl-4"
                      >
                        Username must be at least 3 characters and can only include letters,
                        numbers, dots, underscores, and hyphens
                      </motion.p>
                    )}
                    {authMode === 'register' && usernameCheckState === 'taken' && (
                      <motion.p
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
                        placeholder="Password"
                        value={accountPassword}
                        onChange={(e) => setAccountPassword(e.target.value)}
                        disabled={loading}
                        ref={passwordRef}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            vaultKeyRef.current?.focus();
                          }
                        }}
                        className="w-full rounded-[1.1rem] border border-card-border bg-card-bg pl-12 pr-24 py-4 text-base md:text-lg outline-none transition-all placeholder:text-text/25 focus:border-white/20 focus:bg-card-bg/80 dark:border-white/10 dark:bg-black/30 aria-[invalid=true]:border-red-500/50"
                        aria-invalid={accountPassword.trim().length > 0 && !validAccountPassword}
                      />

                      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                        <Lock className="h-5 w-5 text-text/35 group-focus-within:text-text/80 transition-colors" />
                      </div>

                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          onClick={() => setShowAccountPassword((value) => !value)}
                          className="cursor-pointer rounded-xl p-2 text-text/45 transition-all hover:bg-white/5 hover:text-text/80 disabled:cursor-not-allowed disabled:opacity-40"
                          title={showAccountPassword ? 'Hide' : 'Show'}
                          aria-label={
                            showAccountPassword ? 'Hide account password' : 'Show account password'
                          }
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
                    {accountPassword.trim().length > 0 && !validAccountPassword && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-2 text-xs text-red-400 pl-4"
                      >
                        16+ chars, uppercase, lowercase, number, and special character required
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
                          inputMode="text"
                          autoComplete="one-time-code"
                          placeholder="6-digit Code or 8-char Backup Key"
                          value={otpToken}
                          onChange={(e) =>
                            setOtpToken(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8))
                          }
                          disabled={loading}
                          ref={otpRef}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleUnlock();
                            }
                          }}
                          className="w-full rounded-[1.1rem] border border-card-border bg-card-bg pl-12 pr-4 py-4 text-center font-mono text-base tracking-[0.2em] outline-none transition-all placeholder:text-text/25 focus:border-white/20 focus:bg-card-bg/80 dark:border-white/10 dark:bg-black/30 md:text-lg"
                        />
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                          <ScanQrCode
                            className={`h-5 w-5 text-text/35 transition-colors group-focus-within:text-text/80 ${loading ? 'animate-spin' : ''}`}
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onBackToCredentials()}
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
                        Cloud session restored for{' '}
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
                        placeholder="Master Key"
                        value={vaultKey}
                        onChange={(e) => setVaultKey(e.target.value)}
                        disabled={loading}
                        ref={vaultKeyRef}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            // Let form handle submit
                          }
                        }}
                        className="w-full rounded-[1.1rem] border border-card-border bg-card-bg pl-12 pr-24 py-4 text-base md:text-lg outline-none transition-all placeholder:text-text/25 focus:border-white/20 focus:bg-card-bg/80 dark:border-white/10 dark:bg-black/30 aria-[invalid=true]:border-red-500/50"
                        aria-invalid={vaultKey.trim().length > 0 && !validVaultKey}
                      />

                      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                        <Key className="h-5 w-5 text-text/35 group-focus-within:text-text/80 transition-colors" />
                      </div>

                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          onClick={() => setShowVaultKey((value) => !value)}
                          className="cursor-pointer rounded-xl p-2 text-text/45 transition-all hover:bg-white/5 hover:text-text/80 disabled:cursor-not-allowed disabled:opacity-40"
                          title={showVaultKey ? 'Hide' : 'Show'}
                          aria-label={showVaultKey ? 'Hide master key' : 'Show master key'}
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
                    {vaultKey.trim().length > 0 && !validVaultKey && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-2 text-xs text-red-400 pl-4"
                      >
                        16+ chars, uppercase, lowercase, number, and special character required
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

              {/* <div className="mt-3 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-text/35">
                {twoFactorRequired
                  ? 'Two-Factor Authentication Required'
                  : cloudSessionActive
                    ? 'Trusted cloud session active on this device'
                    : authMode === 'register'
                      ? 'Create an account password and a separate Master Key'
                      : 'Sign in with your account password, then unlock with your Master Key'}
              </div> */}

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
  }
);

VaultLoginForm.displayName = 'VaultLoginForm';
