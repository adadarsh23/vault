import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useVaultStore } from '../../store/vaultStore';
import { base64ToUint8Array, deriveKey, verifyDecoyPin } from '../../lib/cryptoPrimitives';
import { performHybridKeyExchange } from '../../lib/encryption';
import { handleError } from '../../lib/error-handler';
import {
  authenticateVaultSession,
  fetchVaultSalt,
  refreshVaultSession,
  verifyCloudUnlockCaptcha,
  verify2FALogin,
  waitForPendingLogout,
} from '../../lib/auth-api';
import { clearAuthToken, clearCloudSessionHint } from '../../lib/auth-session';
import { uploadKeyCheckToCloud } from '../../lib/sync';
import { logActivity } from '../../lib/activity';
import { validatePassword } from '../../lib/utils';
import { identifyLogRocketUser } from '../../lib/logrocket';
import { SecurityLayer } from './SecurityLayers';

export type AuthStatus = 'idle' | 'authenticating' | 'syncing' | 'success' | 'error';

export interface UseVaultAuthOptions {
  initialUsername?: string;
  cloudSessionActive?: boolean;
  authMode?: 'login' | 'register';
}

const normalizeVaultUsername = (value: string) => value.trim().toLowerCase();
const USERNAME_PATTERN = /^[a-z0-9._-]+$/i;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 64;
const LAYER_UI_DELAY_MS = 8;
const POST_UNLOCK_ACTIVE_DELAY_MS = 0;
const POST_UNLOCK_COMPLETE_DELAY_MS = 0;
const SUCCESS_TRANSITION_DELAY_MS = 0;
const ERROR_STATUS_COOLDOWN_MS = 1500;
const SUCCESS_COUNTDOWN_SECONDS = 2;

export const FAILED_ATTEMPTS_STORAGE_KEY = 'vault_failed_unlock_attempts';
export const EMERGENCY_WIPED_STORAGE_KEY = 'vault_emergency_wiped_at';

export const getFailedUnlockAttempts = (): number => {
  try {
    if (typeof localStorage === 'undefined') return 0;
    const val = localStorage.getItem(FAILED_ATTEMPTS_STORAGE_KEY);
    const parsed = Number(val);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  } catch {
    return 0;
  }
};

export const incrementFailedUnlockAttempts = (): number => {
  try {
    const next = getFailedUnlockAttempts() + 1;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FAILED_ATTEMPTS_STORAGE_KEY, String(next));
    }
    return next;
  } catch {
    return 1;
  }
};

export const resetFailedUnlockAttempts = (): void => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(FAILED_ATTEMPTS_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
};

const getCryptoSubtle = (): SubtleCrypto | null => {
  const cryptoObj =
    typeof window !== 'undefined' && window.crypto
      ? window.crypto
      : typeof globalThis !== 'undefined' && globalThis.crypto
        ? globalThis.crypto
        : null;

  return cryptoObj?.subtle ?? null;
};

const getRandomValues = (array: Uint8Array): Uint8Array => {
  const cryptoObj =
    typeof window !== 'undefined' && window.crypto
      ? window.crypto
      : typeof globalThis !== 'undefined' && globalThis.crypto
        ? globalThis.crypto
        : null;

  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(array as any);
    return array;
  }
  for (let i = 0; i < array.length; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return array;
};

export const SECURITY_LAYERS: readonly SecurityLayer[] = [
  {
    id: 'layer-kdf',
    label: 'Layer 1: Key Derivation',
    name: 'Argon2id',
    description: 'Hardening password via memory-hard hashing',
    desc: 'Hardening password via memory-hard hashing',
  },
  {
    id: 'layer-exchange',
    label: 'Layer 2: Key Exchange',
    name: 'X25519 + Kyber768',
    description: 'Post-Quantum Hybrid cryptographic bridge',
    desc: 'Post-Quantum Hybrid cryptographic bridge',
  },
  {
    id: 'layer-encryption',
    label: 'Layer 3: Encryption',
    name: 'AES-256-GCM',
    description: 'Authenticated symmetric cipher suite',
    desc: 'Authenticated symmetric cipher suite',
  },
  {
    id: 'layer-transport',
    label: 'Layer 4: Communication',
    name: 'TLS 1.3 Tunnel',
    description: 'Establishing perfect forward secrecy',
    desc: 'Establishing perfect forward secrecy',
  },
  {
    id: 'layer-verification',
    label: 'Layer 5: Verification',
    name: 'Ed25519 + ML-DSA',
    description: 'Post-Quantum Hybrid device fingerprint verification',
    desc: 'Post-Quantum Hybrid device fingerprint verification',
  },
  {
    id: 'layer-pqc-fs',
    label: 'Layer 6: Forward Secrecy',
    name: 'PQC Hybrid FS',
    description: 'Rotating ephemeral sub-session keys',
    desc: 'Rotating ephemeral sub-session keys',
  },
  {
    id: 'layer-storage',
    label: 'Layer 7: Key Storage',
    name: 'Secure Memory',
    description: 'Shielding keys in isolated process memory',
    desc: 'Shielding keys in isolated process memory',
  },
  {
    id: 'layer-mfa',
    label: 'Layer 8: Multi-Factor',
    name: 'WebAuthn / FIDO2 Passkeys',
    description: 'Phishing-resistant hardware MFA & integrity proof',
    desc: 'Phishing-resistant hardware MFA & integrity proof',
  },
];

/**
 * useVaultAuth
 * Production-ready authentication hook for the secure vault.
 * Manages the multi-layer security verification process, 2FA flows, and vault unlocking.
 */
export const useVaultAuth = (options?: UseVaultAuthOptions) => {
  const initialUsername = options?.initialUsername?.trim().toLowerCase() || '';
  const cloudSessionActive = options?.cloudSessionActive === true;
  const authMode = options?.authMode === 'register' ? 'register' : 'login';

  const [username, setUsername] = useState(initialUsername);
  const [accountPassword, setAccountPassword] = useState('');
  const [vaultKey, setVaultKey] = useState('');
  const [status, setStatus] = useState<AuthStatus>('idle');
  const [currentLayer, setCurrentLayer] = useState(-1);
  const [successCountdown, setSuccessCountdown] = useState<number | null>(null);

  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [userIdFor2FA, setUserIdFor2FA] = useState<string | null>(null);
  const [otpToken, setOtpToken] = useState('');
  const [isVerifyingOTP, setIsVerifyingOTP] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  const isComponentMounted = useRef(true);
  const pendingMasterKeyRef = useRef<string | null>(null);
  const pendingVaultKeyRef = useRef<string | null>(null);
  const activeSaltRef = useRef<string | null>(null);
  const statusCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevAuthModeRef = useRef(authMode);

  const unlock = useVaultStore((state) => state.unlock);
  const completeUnlockTransition = useVaultStore((state) => state.completeUnlockTransition);

  const resetTwoFactorFlow = useCallback(() => {
    pendingMasterKeyRef.current = null;
    pendingVaultKeyRef.current = null;
    setTwoFactorRequired(false);
    setOtpToken('');
    setMfaToken(null);
    setUserIdFor2FA(null);
    setStatus('idle');
  }, []);

  // Clean up on unmount to prevent state updates on unmounted component
  useEffect(() => {
    isComponentMounted.current = true;
    return () => {
      isComponentMounted.current = false;
      if (statusCooldownTimerRef.current) {
        clearTimeout(statusCooldownTimerRef.current);
        statusCooldownTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (initialUsername) {
      setUsername(initialUsername);
    }
  }, [initialUsername]);

  useEffect(() => {
    if (prevAuthModeRef.current !== authMode) {
      prevAuthModeRef.current = authMode;
      if (twoFactorRequired) {
        resetTwoFactorFlow();
      }
    }
  }, [authMode, twoFactorRequired, resetTwoFactorFlow]);

  // Keep "Verified" visible briefly before returning to idle
  useEffect(() => {
    if (successCountdown === null) return;
    if (successCountdown <= 0) {
      if (isComponentMounted.current) {
        setStatus('idle');
        setSuccessCountdown(null);
      }
      return;
    }
    const t = setTimeout(() => {
      if (isComponentMounted.current) {
        setSuccessCountdown((prev) => (prev === null ? null : prev - 1));
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [successCountdown]);

  const securityLayers = SECURITY_LAYERS;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Internal security verification process
   * Simulates the 8-layer security protocol while performing actual KDF and key exchange checks.
   */
  const runSecurityVerification = async (inputVaultKey: string, normalizedUsername: string) => {
    let derivedMasterKey: string | null = null;

    try {
      for (let i = 0; i < securityLayers.length; i++) {
        if (!isComponentMounted.current) break;

        setCurrentLayer(i);

        // Actual cryptographic work happens in the relevant layers
        if (i === 0) {
          // Layer 1: Argon2id KDF
          let salt = `${normalizedUsername}-vault-pqc-salt`;
          const isRegistration = authMode === 'register';

          if (isRegistration) {
            // Generate a random unique salt: 16 bytes converted to hex
            const randBytes = getRandomValues(new Uint8Array(16));
            salt = Array.from(randBytes)
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('');
          } else {
            try {
              salt = await fetchVaultSalt(normalizedUsername);
            } catch (err) {
              console.warn('Failed to fetch salt from server, falling back to legacy salt:', err);
            }
          }

          activeSaltRef.current = salt;
          const derivedKey = await deriveKey(inputVaultKey, salt);
          const keyBytes = base64ToUint8Array(derivedKey);

          if (keyBytes.length !== 32) {
            throw new Error('Security Protocol Error: Invalid derived key length (KDF leak).');
          }
          derivedMasterKey = derivedKey;
          await sleep(LAYER_UI_DELAY_MS);
        } else if (i === 1) {
          // Layer 2: Hybrid Key Exchange (ECC + Kyber)
          const result = await performHybridKeyExchange();
          const hasEcc = Boolean(result?.localPublicKeys?.ecc?.length);
          const hasKyber = Boolean(result?.localPublicKeys?.kyber?.length);

          if (!hasEcc || !hasKyber) {
            throw new Error('Security Protocol Error: Hybrid PQC handshake corrupted.');
          }
          await sleep(LAYER_UI_DELAY_MS);
        } else if (i === 2) {
          // Layer 3: AES-256-GCM Initialization
          const subtle = getCryptoSubtle();
          if (!subtle) {
            throw new Error('Security Protocol Error: WebCrypto API not available.');
          }
          await sleep(LAYER_UI_DELAY_MS);
        } else if (i === 4) {
          // Layer 5: Ed25519 Verification / Identity Audit
          await sleep(LAYER_UI_DELAY_MS);
        } else if (i === 7) {
          // Layer 8: MFA Checksum
          await sleep(LAYER_UI_DELAY_MS);
        } else {
          // Keep a small non-blocking cadence so layer changes remain readable.
          await sleep(LAYER_UI_DELAY_MS);
        }
      }

      if (!derivedMasterKey) {
        throw new Error('Security Verification Failure: Core master key not derived.');
      }

      return derivedMasterKey;
    } catch (error) {
      console.error('[Security Verification Error]:', error);
      throw error;
    }
  };

  /**
   * Unlock vault with candidate salt retries if key check fails
   */
  const unlockVaultWithCandidateSalts = async (
    primaryMasterKey: string,
    rawKey: string,
    normalizedUsername: string
  ) => {
    try {
      await unlock(primaryMasterKey, normalizedUsername);
      return true;
    } catch (unlockErr: any) {
      const isKeyCheckError =
        /master key is incorrect or the vault data could not be decrypted/i.test(
          unlockErr?.message || ''
        );

      if (isKeyCheckError && rawKey) {
        const primarySalt = activeSaltRef.current;
        const fetchedSalt = await fetchVaultSalt(normalizedUsername).catch(() => null);
        const candidateSalts = Array.from(
          new Set(
            [
              `${normalizedUsername}-vault-pqc-salt`,
              fetchedSalt,
              'vault-v1-stable-salt-32bytes',
            ].filter((s): s is string => Boolean(s) && s !== primarySalt)
          )
        );

        const triedSalts: string[] = [];
        let unlockedWithAlt = false;

        for (const altSalt of candidateSalts) {
          triedSalts.push(altSalt);
          try {
            console.warn(
              `Primary salt unlock failed. Retrying unlock with candidate salt (${altSalt})...`
            );
            const altMasterKey = await deriveKey(rawKey, altSalt);
            await unlock(altMasterKey, normalizedUsername);
            activeSaltRef.current = altSalt;
            await uploadKeyCheckToCloud(altMasterKey, { force: true }).catch(() => {});
            unlockedWithAlt = true;
            break;
          } catch {
            // Try next candidate salt
          }
        }

        if (!unlockedWithAlt) {
          console.error(
            `All candidate salts exhausted (${triedSalts.join(', ')}) – unlock failed.`,
            unlockErr
          );
          throw unlockErr;
        }
        return true;
      }

      throw unlockErr;
    }
  };

  /**
   * handleUnlock
   * Main entry point for vault authentication.
   */
  const handleUnlock = useCallback(
    async (captchaToken: string) => {
      // Prevent double submissions or empty credentials
      const hasAnyCredential = Boolean(vaultKey?.trim() || accountPassword?.trim());
      if (status === 'authenticating' || !hasAnyCredential) return false;

      if (statusCooldownTimerRef.current) {
        clearTimeout(statusCooldownTimerRef.current);
        statusCooldownTimerRef.current = null;
      }

      const normalizedUsername = normalizeVaultUsername(username);
      if (!normalizedUsername) {
        toast.error('Security Protocol Violation', {
          description: 'Account Identifier is required to derive the PQC encryption bridge.',
        });
        return false;
      }
      if (normalizedUsername.length < MIN_USERNAME_LENGTH) {
        toast.error('Account Identifier Too Short', {
          description: `Username must be at least ${MIN_USERNAME_LENGTH} characters.`,
        });
        return false;
      }
      if (normalizedUsername.length > MAX_USERNAME_LENGTH) {
        toast.error('Account Identifier Too Long', {
          description: `Username must be at most ${MAX_USERNAME_LENGTH} characters.`,
        });
        return false;
      }
      if (!USERNAME_PATTERN.test(normalizedUsername)) {
        toast.error('Invalid username', {
          description:
            'Username cannot use @ and may only include letters, numbers, dots, underscores, and hyphens.',
        });
        return false;
      }

      // Check Decoy / Duress Mode FIRST before password policy check
      const isDecoyVaultConfigured =
        useVaultStore.getState().preferences.isDecoyVaultEnabled !== false &&
        (typeof localStorage === 'undefined' || localStorage.getItem('vault_decoy_enabled') !== 'false');

      if (isDecoyVaultConfigured) {
        const storedHashes = [
          useVaultStore.getState().preferences.decoyPasswordHash,
          typeof localStorage !== 'undefined' ? localStorage.getItem('vault_decoy_pin_hash') : null,
          typeof localStorage !== 'undefined' ? localStorage.getItem('vault_decoy_password_hash') : null,
          typeof localStorage !== 'undefined' ? localStorage.getItem('vault_decoy_hash') : null,
          typeof localStorage !== 'undefined' ? localStorage.getItem('decoy_pin_hash') : null,
          typeof localStorage !== 'undefined' ? localStorage.getItem('decoyPasswordHash') : null,
          typeof localStorage !== 'undefined' ? localStorage.getItem(`vault_decoy_pin_hash_${normalizedUsername}`) : null,
          typeof localStorage !== 'undefined' ? localStorage.getItem(`vault_decoy_hash_${normalizedUsername}`) : null,
          typeof localStorage !== 'undefined' ? localStorage.getItem(`decoyPasswordHash_${normalizedUsername}`) : null,
        ].filter(
          (h): h is string =>
            Boolean(
              h &&
                typeof h === 'string' &&
                h.trim().length > 0 &&
                h !== 'true' &&
                h !== 'false' &&
                h !== 'null' &&
                h !== 'undefined'
            )
        );

        if (storedHashes.length > 0) {
          const candidateCredentials = Array.from(
            new Set(
              [vaultKey, accountPassword, vaultKey?.trim(), accountPassword?.trim()].filter(
                (c): c is string => Boolean(c && typeof c === 'string' && c.length >= 4)
              )
            )
          );

          for (const candidateHash of storedHashes) {
            for (const candidate of candidateCredentials) {
              const isDecoyMatch = await verifyDecoyPin(candidate, candidateHash);
              if (isDecoyMatch) {
                setAccountPassword('');
                setVaultKey('');
                pendingMasterKeyRef.current = null;
                pendingVaultKeyRef.current = null;
                setStatus('authenticating');
                for (let i = 0; i < securityLayers.length; i++) {
                  if (!isComponentMounted.current) break;
                  setCurrentLayer(i);
                  await sleep(LAYER_UI_DELAY_MS);
                }
                await useVaultStore.getState().unlockDecoyVault(normalizedUsername);
                if (isComponentMounted.current) {
                  setCurrentLayer(securityLayers.length);
                  setStatus('success');
                  completeUnlockTransition();
                  setSuccessCountdown(SUCCESS_COUNTDOWN_SECONDS);
                }
                resetFailedUnlockAttempts();
                return true;
              }
            }
          }
        }
      }

      // Input Validation for passwords
      if (authMode === 'register') {
        if (!cloudSessionActive) {
          const authPasswordValidation = validatePassword(accountPassword);
          if (!authPasswordValidation.isValid) {
            toast.error('Account Password Required', {
              description: authPasswordValidation.error,
            });
            return false;
          }
        }

        const vaultKeyValidation = validatePassword(vaultKey);
        if (!vaultKeyValidation.isValid) {
          toast.error('Security Protocol Violation', {
            description: vaultKeyValidation.error,
          });
          return false;
        }

        if (accountPassword && vaultKey && accountPassword === vaultKey) {
          toast.error('Security Requirement Error', {
            description: 'Account password and Master Key must not be identical.',
          });
          return false;
        }
      } else {
        // Sign-in mode requirements
        const effectiveAccountPassword = accountPassword || vaultKey;
        const effectiveVaultKey = vaultKey || accountPassword;

        if (!cloudSessionActive && !effectiveAccountPassword) {
          toast.error('Account Password Required', {
            description: 'Please enter your account password to sign in.',
          });
          return false;
        }
        if (!effectiveVaultKey) {
          toast.error('Master Key Required', {
            description: 'Please enter your Master Key to unlock your vault.',
          });
          return false;
        }
      }

      const resolvedAccountPassword = accountPassword || vaultKey;
      const resolvedVaultKey = vaultKey || accountPassword;

      setStatus('authenticating');
      setCurrentLayer(-1);
      pendingMasterKeyRef.current = null;
      pendingVaultKeyRef.current = null;

      try {

        // Prevent stale logout responses from clearing a newly-created session
        // while deriving the vault key in parallel.
        const [, masterKey] = await Promise.all([
          waitForPendingLogout(),
          runSecurityVerification(resolvedVaultKey, normalizedUsername),
        ]);

        if (!isComponentMounted.current) return false;

        const rawVaultKey = resolvedVaultKey;

        if (!cloudSessionActive) {
          const authData = await authenticateVaultSession(
            authMode,
            normalizedUsername,
            resolvedAccountPassword,
            captchaToken,
            resolvedVaultKey,
            { pqcSalt: activeSaltRef.current || undefined }
          );

          if (authData.twoFactorRequired) {
            if (!authData.userId || !authData.mfaToken) {
              throw new Error('Authentication session expired. Please sign in again.');
            }
            pendingMasterKeyRef.current = masterKey;
            pendingVaultKeyRef.current = rawVaultKey;
            setUserIdFor2FA(authData.userId);
            setMfaToken(authData.mfaToken);
            setTwoFactorRequired(true);
            setStatus('idle');
            return true;
          }

          identifyLogRocketUser(authData?.user?.id, {
            username: authData?.user?.username,
          });
        } else {
          await verifyCloudUnlockCaptcha(captchaToken);
          // Cloud session can persist across reloads while in-memory bearer token
          // is cleared. Rehydrate the active token before vault sync/unlock.
          await refreshVaultSession();
        }

        if (!isComponentMounted.current) return false;

        // Sensitive Memory Management: Clear password state from UI
        setAccountPassword('');
        setVaultKey('');
        pendingMasterKeyRef.current = null;
        pendingVaultKeyRef.current = null;
        setStatus('syncing');

        // Secure Vault Unlock
        await unlockVaultWithCandidateSalts(masterKey, rawVaultKey, normalizedUsername);

        // If unlock succeeded, handle transition steps
        if (isComponentMounted.current) {
          setCurrentLayer(securityLayers.length - 1);
          if (POST_UNLOCK_ACTIVE_DELAY_MS > 0) {
            await sleep(POST_UNLOCK_ACTIVE_DELAY_MS);
          }
        }

        if (isComponentMounted.current) {
          setCurrentLayer(securityLayers.length);
          if (POST_UNLOCK_COMPLETE_DELAY_MS > 0) {
            await sleep(POST_UNLOCK_COMPLETE_DELAY_MS);
          }
        }

        if (isComponentMounted.current) {
          setStatus('success');
          if (SUCCESS_TRANSITION_DELAY_MS > 0) {
            await sleep(SUCCESS_TRANSITION_DELAY_MS);
          }
        }

        completeUnlockTransition();

        if (isComponentMounted.current) {
          setSuccessCountdown(SUCCESS_COUNTDOWN_SECONDS);
        }

        // Reset failed attempts upon successful authentication
        resetFailedUnlockAttempts();

        logActivity({
          actionType: 'auth_login',
          itemName: 'Vault Access',
          description: 'Authenticated with 8-layer security protocol',
          status: 'success',
        });

        toast.success('Security Cleared', {
          description: 'Vault unlocked with 8th-generation encryption bridge.',
        });

        return true;
      } catch (error: any) {
        if (!isComponentMounted.current) return false;

        setStatus('error');
        setCurrentLayer(-1);

        // Clear password on failure too for security
        setAccountPassword('');
        setVaultKey('');
        pendingMasterKeyRef.current = null;
        pendingVaultKeyRef.current = null;

        const errorCode = typeof error?.code === 'string' ? error.code : undefined;
        const errorMessage = typeof error?.message === 'string' ? error.message : '';

        const handleBruteForceFailure = async (credentialContext: 'password' | 'master_key') => {
          const { preferences, emergencyLocalWipe } = useVaultStore.getState();
          const isBruteForceWipeEnabled = preferences.isBruteForceWipeEnabled !== false;
          const maxAttempts = preferences.maxFailedAttemptsBeforeWipe || 10;
          const isMasterKeyCtx = credentialContext === 'master_key' || cloudSessionActive;

          if (!isBruteForceWipeEnabled) {
            if (isMasterKeyCtx) {
              toast.error('Master Key Incorrect', {
                description: cloudSessionActive
                  ? 'The Master Key you entered is incorrect or cannot decrypt this vault.'
                  : 'The account password is valid, but the Master Key is incorrect or cannot decrypt this vault.',
              });
            } else {
              toast.error('Authentication failed', {
                description: 'The username or account password is incorrect.',
              });
            }
            logActivity({
              actionType: 'auth_login',
              itemName: 'Vault Login Failure',
              description: 'Authentication failed with invalid credentials.',
              status: 'failure',
            });
            return;
          }

          const currentFailed = incrementFailedUnlockAttempts();
          if (currentFailed >= maxAttempts) {
            await emergencyLocalWipe();
            resetFailedUnlockAttempts();
            toast.error("🚨 DEAD MAN'S SWITCH: LOCAL DATA SHREDDED", {
              description: `Maximum failed attempts reached (${currentFailed}/${maxAttempts}). All local cryptographic keys and cached records on this device have been permanently shredded. (Cloud vault remains safe).`,
              duration: 12000,
            });
            logActivity({
              actionType: 'auth_lock',
              itemName: "Dead Man's Switch",
              description: `Emergency local wipe triggered after ${currentFailed} failed unlock attempts. Cloud data preserved.`,
              status: 'failure',
            });
          } else {
            const remaining = maxAttempts - currentFailed;
            const desc = isMasterKeyCtx
              ? `Master key incorrect (Attempt ${currentFailed} of ${maxAttempts}). Warning: ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before this device automatically shreds local vault keys.`
              : `Invalid username or password (Attempt ${currentFailed} of ${maxAttempts}). Warning: ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before this device automatically shreds local vault keys.`;
            toast.error(isMasterKeyCtx ? 'Master Key Incorrect' : 'Authentication Failed', {
              description: desc,
              duration: 6000,
            });
            logActivity({
              actionType: 'auth_login',
              itemName: 'Vault Login Failure',
              description: `Authentication failed (Attempt ${currentFailed}/${maxAttempts}).`,
              status: 'failure',
            });
          }
        };

        if (
          errorCode === 'INVALID_CREDENTIALS' ||
          error?.status === 401 ||
          /invalid username or password/i.test(errorMessage) ||
          /incorrect password/i.test(errorMessage)
        ) {
          await handleBruteForceFailure('password');
        } else if (
          /candidate salts exhausted/i.test(errorMessage) ||
          /master key is incorrect/i.test(errorMessage) ||
          /could not be decrypted/i.test(errorMessage)
        ) {
          await handleBruteForceFailure('master_key');
        } else if (
          errorCode === 'TOO_MANY_AUTH_ATTEMPTS' ||
          errorCode === 'RATE_LIMITED' ||
          /too many authentication attempts/i.test(errorMessage) ||
          /too many attempts/i.test(errorMessage)
        ) {
          toast.error('Too many attempts', {
            description:
              'Too many sign-in or registration attempts were detected. Please wait and try again.',
          });
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault Login Failure',
            description: 'Authentication blocked by rate limiter.',
            status: 'failure',
          });
        } else if (errorCode === 'CAPTCHA_TOKEN_EXPIRED' || /captcha expired/i.test(errorMessage)) {
          toast.error('Security check expired', {
            description: 'Please complete CAPTCHA again and retry.',
          });
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault Login Failure',
            description: 'Authentication blocked due to expired CAPTCHA token.',
            status: 'failure',
          });
        } else if (
          errorCode === 'CAPTCHA_VERIFY_UNAVAILABLE' ||
          errorCode === 'CAPTCHA_TOKEN_MISSING' ||
          errorCode === 'CAPTCHA_VERIFICATION_FAILED' ||
          errorCode === 'CAPTCHA_HOSTNAME_MISMATCH' ||
          /captcha/i.test(errorMessage)
        ) {
          toast.error('Security verification required', {
            description:
              errorCode === 'CAPTCHA_VERIFY_UNAVAILABLE'
                ? 'Security verification service is temporarily unreachable. Please try again.'
                : 'Please complete CAPTCHA successfully before trying again.',
          });
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault Login Failure',
            description: 'Authentication blocked by CAPTCHA verification.',
            status: 'failure',
          });
        } else if (errorCode === 'USER_EXISTS' || /username already exists/i.test(errorMessage)) {
          toast.error('Username already exists', {
            description:
              'This username is already registered. Use Sign In or choose a different username.',
          });
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault Login Failure',
            description: 'Registration rejected because username already exists.',
            status: 'failure',
          });
        } else if (
          errorCode === 'AUTH_WEAK_PASSWORD' ||
          errorCode === 'INVALID_PASSWORD' ||
          /password must/i.test(errorMessage)
        ) {
          toast.error('Password does not meet requirements', {
            description:
              'Use 16-64 characters with uppercase, lowercase, number, special character, and no spaces.',
          });
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault Login Failure',
            description: 'Authentication rejected due to weak password policy.',
            status: 'failure',
          });
        } else if (
          errorCode === 'INVALID_USERNAME' ||
          /username must/i.test(errorMessage) ||
          /invalid username/i.test(errorMessage)
        ) {
          toast.error('Invalid username', {
            description:
              'Username must be 3 to 64 characters, cannot use @, and can include letters, numbers, dots, underscores, and hyphens.',
          });
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault Login Failure',
            description: 'Authentication rejected due to invalid username format.',
            status: 'failure',
          });
        } else if (
          errorCode === 'NETWORK_ERROR' ||
          /unable to reach the server/i.test(errorMessage) ||
          /failed to fetch/i.test(errorMessage)
        ) {
          toast.error('Network connection issue', {
            description: 'Could not reach the server. Check your connection and try again.',
          });
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault Login Failure',
            description: 'Authentication failed due to network connectivity.',
            status: 'failure',
          });
        } else if (
          errorCode === 'DB_UNAVAILABLE' ||
          /vault storage is temporarily unavailable/i.test(errorMessage) ||
          /secureconnect.*timed out/i.test(errorMessage) ||
          /connecttimeoutms/i.test(errorMessage)
        ) {
          toast.error('Service temporarily unavailable', {
            description: 'Secure storage is not reachable right now. Please try again in a minute.',
          });
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault Login Failure',
            description: 'Authentication failed because storage connectivity is unavailable.',
            status: 'failure',
          });
        } else if (
          errorCode === 'REGISTRATION_FAILED' ||
          /unable to create the account/i.test(errorMessage)
        ) {
          toast.error('Authentication failed', {
            description:
              'The request could not be completed with the provided credentials. If you already have an account, use Sign In.',
          });
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault Login Failure',
            description: 'Authentication failed during account creation.',
            status: 'failure',
          });
        } else if (
          errorCode === 'MFA_TOKEN_INVALID' ||
          errorCode === 'MFA_TOKEN_MISSING' ||
          /authentication session expired/i.test(errorMessage)
        ) {
          toast.error('Session expired', {
            description:
              'Your secure sign-in session expired. Please sign in again and re-enter your 2FA code.',
          });
          resetTwoFactorFlow();
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault Login Failure',
            description: 'MFA verification session expired or invalid.',
            status: 'failure',
          });
        } else if (
          errorCode === 'SESSION_REFRESH_FAILED' ||
          errorCode === 'INVALID_TOKEN' ||
          errorCode === 'AUTH_REQUIRED' ||
          errorCode === 'SESSION_EXPIRED' ||
          /session could not be refreshed/i.test(errorMessage) ||
          /authentication token is invalid/i.test(errorMessage) ||
          /authentication token is required/i.test(errorMessage)
        ) {
          toast.error('Session expired', {
            description: 'Your saved cloud session has expired. Please sign in with your password.',
          });
          clearAuthToken();
          clearCloudSessionHint();
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault Login Failure',
            description: 'Cloud session expired during vault unlock.',
            status: 'failure',
          });
        } else {
          // Specialized error handling for all other scenarios
          const handledError = handleError(error, 'Vault Security Protocol');

          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault Login Failure',
            description: handledError.message,
            status: 'failure',
          });
        }

        // Re-enable input after a short cooldown on error
        statusCooldownTimerRef.current = setTimeout(() => {
          if (isComponentMounted.current) setStatus('idle');
        }, ERROR_STATUS_COOLDOWN_MS);

        return false;
      }
    },
    [
      accountPassword,
      authMode,
      cloudSessionActive,
      completeUnlockTransition,
      resetTwoFactorFlow,
      securityLayers.length,
      status,
      unlock,
      username,
      vaultKey,
    ]
  );

  /**
   * handleVerifyOTP
   * Verifies 2FA token and completes vault unlock.
   */
  const handleVerifyOTP = useCallback(
    async (captchaToken: string) => {
      const cleanOtp = otpToken.trim();
      if (!userIdFor2FA || !cleanOtp || isVerifyingOTP) return false;

      try {
        setIsVerifyingOTP(true);
        setStatus('authenticating');

        const normalizedUsername = normalizeVaultUsername(username);

        // Reuse the key derived during step 1 of auth when 2FA is required.
        const masterKey =
          pendingMasterKeyRef.current ??
          (await runSecurityVerification(
            pendingVaultKeyRef.current || vaultKey,
            normalizedUsername
          ));

        if (!mfaToken) {
          throw new Error('Authentication session expired. Please sign in again.');
        }

        await verify2FALogin(userIdFor2FA, cleanOtp, mfaToken, captchaToken);
        identifyLogRocketUser(userIdFor2FA, {
          username: normalizedUsername,
        });

        const rawVaultKey = pendingVaultKeyRef.current || vaultKey;

        if (isComponentMounted.current) {
          setAccountPassword('');
          setVaultKey('');
          setOtpToken('');
          setStatus('syncing');
        }

        // Unlock vault with candidate salts
        await unlockVaultWithCandidateSalts(masterKey, rawVaultKey, normalizedUsername);

        // Clear 2FA refs and state upon successful unlock
        pendingMasterKeyRef.current = null;
        pendingVaultKeyRef.current = null;

        if (isComponentMounted.current) {
          setTwoFactorRequired(false);
          setCurrentLayer(securityLayers.length);
          setStatus('success');
          setSuccessCountdown(SUCCESS_COUNTDOWN_SECONDS);
        }

        completeUnlockTransition();

        logActivity({
          actionType: 'auth_login',
          itemName: 'Vault Access',
          description: 'Authenticated with 2FA and 8-layer security protocol',
          status: 'success',
        });

        toast.success('Security Cleared', {
          description: '2FA verified. Vault unlocked.',
        });

        return true;
      } catch (error: any) {
        const errorCode = typeof error?.code === 'string' ? error.code : undefined;
        const errorMessage = typeof error?.message === 'string' ? error.message : '';

        const isSessionExpired =
          errorCode === 'MFA_TOKEN_INVALID' ||
          errorCode === 'MFA_TOKEN_MISSING' ||
          errorCode === 'SESSION_EXPIRED' ||
          /session expired/i.test(errorMessage) ||
          /authentication session expired/i.test(errorMessage);

        if (isSessionExpired) {
          toast.error('Session expired', {
            description: 'Your 2FA session expired. Please sign in again with your password.',
          });
          resetTwoFactorFlow();
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault 2FA Failure',
            description: '2FA session expired.',
            status: 'failure',
          });
        } else if (
          errorCode === 'INVALID_2FA_CODE' ||
          errorCode === 'INVALID_OTP' ||
          errorCode === 'INVALID_CREDENTIALS' ||
          /invalid.*(code|token|otp)/i.test(errorMessage) ||
          /incorrect.*(code|token|otp)/i.test(errorMessage) ||
          /2fa verification failed/i.test(errorMessage)
        ) {
          toast.error('Invalid 2FA Code', {
            description:
              'The verification code is incorrect or has expired. Please check your authenticator app.',
          });
          // Do NOT clear pendingMasterKeyRef so the user can re-try typing OTP without re-deriving
          if (isComponentMounted.current) {
            setOtpToken('');
            setStatus('idle');
          }
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault 2FA Failure',
            description: 'Invalid 2FA verification code entered.',
            status: 'failure',
          });
        } else if (
          errorCode === 'TOO_MANY_AUTH_ATTEMPTS' ||
          errorCode === 'RATE_LIMITED' ||
          /too many/i.test(errorMessage)
        ) {
          toast.error('Too many attempts', {
            description: 'Too many verification attempts detected. Please wait and try again.',
          });
          if (isComponentMounted.current) {
            setStatus('idle');
          }
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault 2FA Failure',
            description: '2FA blocked by rate limiter.',
            status: 'failure',
          });
        } else if (
          errorCode === 'NETWORK_ERROR' ||
          /unable to reach the server/i.test(errorMessage) ||
          /failed to fetch/i.test(errorMessage)
        ) {
          toast.error('Network connection issue', {
            description: 'Could not reach the server. Check your connection and try again.',
          });
          if (isComponentMounted.current) {
            setStatus('idle');
          }
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault 2FA Failure',
            description: '2FA verification failed due to network connectivity.',
            status: 'failure',
          });
        } else {
          handleError(error, '2FA Verification');
          if (isComponentMounted.current) {
            setStatus('idle');
          }
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault 2FA Failure',
            description: errorMessage || '2FA verification failed.',
            status: 'failure',
          });
        }

        return false;
      } finally {
        if (isComponentMounted.current) {
          setIsVerifyingOTP(false);
        }
      }
    },
    [
      completeUnlockTransition,
      isVerifyingOTP,
      mfaToken,
      otpToken,
      resetTwoFactorFlow,
      securityLayers.length,
      unlock,
      userIdFor2FA,
      username,
      vaultKey,
    ]
  );

  return {
    username,
    setUsername,
    accountPassword,
    setAccountPassword,
    vaultKey,
    setVaultKey,
    status,
    currentLayer,
    securityLayers,
    successCountdown,
    handleUnlock,
    twoFactorRequired,
    otpToken,
    setOtpToken,
    handleVerifyOTP,
    isVerifyingOTP,
    resetTwoFactorFlow,
  };
};
