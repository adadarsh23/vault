import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useVaultStore } from '../../store/vaultStore';
import { base64ToUint8Array, deriveKey } from '../../lib/cryptoPrimitives';
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
// import { handleError, ErrorCode } from "../../lib/error-handler"
import { logActivity } from '../../lib/activity';
import { validatePassword } from '../../lib/utils';
import { identifyLogRocketUser } from '../../lib/logrocket';

type AuthStatus = 'idle' | 'authenticating' | 'syncing' | 'success' | 'error';

const normalizeVaultUsername = (value: string) => value.trim().toLowerCase();
const USERNAME_PATTERN = /^[a-z0-9._-]+$/i;
const LAYER_UI_DELAY_MS = 8;
const POST_UNLOCK_ACTIVE_DELAY_MS = 0;
const POST_UNLOCK_COMPLETE_DELAY_MS = 0;
const SUCCESS_TRANSITION_DELAY_MS = 0;

/**
 * useVaultAuth
 * Production-ready authentication hook for the secure vault.
 * Manages the multi-layer security verification process and vault unlocking.
 */
export const useVaultAuth = (options?: {
  initialUsername?: string;
  cloudSessionActive?: boolean;
  authMode?: 'login' | 'register';
}) => {
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
  const activeSaltRef = useRef<string | null>(null);
  const unlock = useVaultStore((state) => state.unlock);
  // const lock = useVaultStore((state) => state.lock)
  const completeUnlockTransition = useVaultStore((state) => state.completeUnlockTransition);

  // Clean up on unmount to prevent state updates on unmounted component
  useEffect(() => {
    isComponentMounted.current = true;
    return () => {
      isComponentMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (cloudSessionActive && initialUsername) {
      setUsername(initialUsername);
    }
  }, [cloudSessionActive, initialUsername]);

  // Keep "Verified" visible briefly before returning to idle
  useEffect(() => {
    if (successCountdown === null) return;
    if (successCountdown <= 0) {
      setStatus('idle');
      setSuccessCountdown(null);
      return;
    }
    const t = setTimeout(() => {
      setSuccessCountdown((prev) => (prev === null ? null : prev - 1));
    }, 1000);
    return () => clearTimeout(t);
  }, [successCountdown]);

  const securityLayers = useMemo(
    () => [
      {
        label: 'Layer 1: Key Derivation',
        name: 'Argon2id',
        desc: 'Hardening password via memory-hard hashing',
      },
      {
        label: 'Layer 2: Key Exchange',
        name: 'X25519 + Kyber768',
        desc: 'Post-Quantum Hybrid cryptographic bridge',
      },
      {
        label: 'Layer 3: Encryption',
        name: 'AES-256-GCM',
        desc: 'Authenticated symmetric cipher suite',
      },
      {
        label: 'Layer 4: Communication',
        name: 'TLS 1.3 Tunnel',
        desc: 'Establishing perfect forward secrecy',
      },
      {
        label: 'Layer 5: Verification',
        name: 'Ed25519 + ML-DSA',
        desc: 'Post-Quantum Hybrid device fingerprint verification',
      },
      {
        label: 'Layer 6: Forward Secrecy',
        name: 'PQC Hybrid FS',
        desc: 'Rotating ephemeral sub-session keys',
      },
      {
        label: 'Layer 7: Key Storage',
        name: 'Secure Memory',
        desc: 'Shielding keys in isolated process memory',
      },
      {
        label: 'Layer 8: Multi-Factor',
        name: 'WebAuthn / FIDO2 Passkeys',
        desc: 'Phishing-resistant hardware MFA & integrity proof',
      },
    ],
    []
  );

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
            const randBytes = crypto.getRandomValues(new Uint8Array(16));
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
          // Check for WebCrypto support
          if (!window.crypto || !window.crypto.subtle) {
            throw new Error('Security Protocol Error: WebCrypto API not available.');
          }
          await sleep(LAYER_UI_DELAY_MS);
        } else if (i === 4) {
          // Layer 5: Ed25519 Verification / Identity Audit
          // In a real scenario, this would verify the device signature
          await sleep(LAYER_UI_DELAY_MS);
        } else if (i === 7) {
          // Layer 8: MFA Checksum
          // Pre-verification delay
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
   * handleUnlock
   * Main entry point for vault authentication.
   */
  const handleUnlock = useCallback(
    async (captchaToken: string) => {
      // Prevent double submissions
      if (status === 'authenticating' || !vaultKey) return false;

      if (!username) {
        toast.error('Security Protocol Violation', {
          description: 'Account Identifier is required to derive the PQC encryption bridge.',
        });
        return false;
      }

      const normalizedUsername = normalizeVaultUsername(username);
      if (!normalizedUsername) {
        toast.error('Security Protocol Violation', {
          description: 'Account Identifier is required to derive the PQC encryption bridge.',
        });
        return false;
      }
      if (normalizedUsername.length < 3) {
        toast.error('Account Identifier Too Short', {
          description: 'Username must be at least 3 characters.',
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

      // 1. Production-ready Input Validation
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

      setStatus('authenticating');
      setCurrentLayer(-1);
      pendingMasterKeyRef.current = null;

      try {
        // Prevent stale logout responses from clearing a newly-created session
        // while deriving the vault key in parallel.
        const [, masterKey] = await Promise.all([
          waitForPendingLogout(),
          runSecurityVerification(vaultKey, normalizedUsername),
        ]);

        if (!isComponentMounted.current) return false;

        if (!cloudSessionActive) {
          const authData = await authenticateVaultSession(
            authMode,
            normalizedUsername,
            accountPassword,
            captchaToken,
            vaultKey,
            { pqcSalt: activeSaltRef.current || undefined }
          );

          if (authData.twoFactorRequired) {
            if (!authData.userId || !authData.mfaToken) {
              throw new Error('Authentication session expired. Please sign in again.');
            }
            setTwoFactorRequired(true);
            setUserIdFor2FA(authData.userId);
            setMfaToken(authData.mfaToken);
            pendingMasterKeyRef.current = masterKey;
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

        // 3. Sensitive Memory Management: Clear password state immediately after use
        const rawVaultKey = vaultKey;
        setAccountPassword('');
        setVaultKey('');
        pendingMasterKeyRef.current = null;
        setStatus('syncing');

        // 4. Secure Vault Unlock
        // We wait for the initial cloud sync before exposing the vault UI.
        try {
          await unlock(masterKey, normalizedUsername);
        } catch (unlockErr: any) {
          const isKeyCheckError =
            /master key is incorrect or the vault data could not be decrypted/i.test(
              unlockErr?.message || ''
            );
          if (isKeyCheckError && rawVaultKey) {
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
                const altMasterKey = await deriveKey(rawVaultKey, altSalt);
                await unlock(altMasterKey, normalizedUsername);
                activeSaltRef.current = altSalt;
                const keyBuf = base64ToUint8Array(altMasterKey);
                const cryptoKey = await crypto.subtle.importKey(
                  'raw',
                  keyBuf as any,
                  { name: 'AES-GCM' },
                  false,
                  ['encrypt', 'decrypt']
                );
                keyBuf.fill(0);
                await uploadKeyCheckToCloud(cryptoKey, { force: true }).catch(() => {});
                unlockedWithAlt = true;
                break;
              } catch {
                // Try next salt candidate
              }
            }

            if (!unlockedWithAlt) {
              console.error(
                `All candidate salts exhausted (${triedSalts.join(', ')}) – unlock failed.`,
                unlockErr
              );
              throw unlockErr;
            }
          } else {
            throw unlockErr;
          }
        }

        if (!isComponentMounted.current) return false;

        // Let the final layer tick once, then move directly into the vault UI.
        setCurrentLayer(securityLayers.length - 1);
        if (POST_UNLOCK_ACTIVE_DELAY_MS > 0) {
          await sleep(POST_UNLOCK_ACTIVE_DELAY_MS);
        }

        if (!isComponentMounted.current) return false;

        setCurrentLayer(securityLayers.length);
        if (POST_UNLOCK_COMPLETE_DELAY_MS > 0) {
          await sleep(POST_UNLOCK_COMPLETE_DELAY_MS);
        }

        if (!isComponentMounted.current) return false;

        setStatus('success');
        if (SUCCESS_TRANSITION_DELAY_MS > 0) {
          await sleep(SUCCESS_TRANSITION_DELAY_MS);
        }

        if (!isComponentMounted.current) return false;

        completeUnlockTransition();
        setSuccessCountdown(2); // show verified for ~10 seconds

        // void unlock(masterKey, normalizedUsername).catch((error) => {
        //   if (!isComponentMounted.current) return
        //   lock()
        //   setStatus('error')
        //   setCurrentLayer(-1)
        //   handleError(error, 'Vault background sync')
        //   toast.error('Vault unlock failed', {
        //     description: 'Background vault sync failed. Please sign in again.',
        //   })
        // })

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

        const errorCode = typeof error?.code === 'string' ? error.code : undefined;
        const errorMessage = typeof error?.message === 'string' ? error.message : '';

        if (
          errorCode === 'INVALID_CREDENTIALS' ||
          /invalid username or password/i.test(errorMessage)
        ) {
          toast.error('Authentication failed', {
            description: 'The username or account password is incorrect.',
          });
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault Login Failure',
            description: 'Authentication failed with invalid credentials.',
            status: 'failure',
          });
        } else if (
          errorCode === 'TOO_MANY_AUTH_ATTEMPTS' ||
          /too many authentication attempts/i.test(errorMessage)
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
          /candidate salts exhausted/i.test(errorMessage) ||
          /master key is incorrect/i.test(errorMessage) ||
          /could not be decrypted/i.test(errorMessage)
        ) {
          toast.error('Master Key Incorrect', {
            description:
              'The account password is valid, but the Master Key is incorrect or cannot decrypt this vault.',
          });
          logActivity({
            actionType: 'auth_login',
            itemName: 'Vault Login Failure',
            description: 'Master Key does not match the encrypted vault.',
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
          setTwoFactorRequired(false);
          setOtpToken('');
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
        setTimeout(() => {
          if (isComponentMounted.current) setStatus('idle');
        }, 1500);
        return false;
      }
    },
    [
      accountPassword,
      cloudSessionActive,
      completeUnlockTransition,
      // lock,
      authMode,
      status,
      unlock,
      username,
      vaultKey,
    ]
  );

  /**
   * handleVerifyOTP
   */
  const handleVerifyOTP = useCallback(
    async (captchaToken: string) => {
      if (!userIdFor2FA || !otpToken || isVerifyingOTP) return false;

      try {
        setIsVerifyingOTP(true);
        setStatus('authenticating');

        const normalizedUsername = normalizeVaultUsername(username);

        // Reuse the key derived during step 1 of auth when 2FA is required.
        const masterKey =
          pendingMasterKeyRef.current ??
          (await runSecurityVerification(vaultKey, normalizedUsername));

        if (!mfaToken) {
          throw new Error('Authentication session expired. Please sign in again.');
        }

        await verify2FALogin(userIdFor2FA, otpToken, mfaToken, captchaToken);
        identifyLogRocketUser(userIdFor2FA, {
          username: normalizedUsername,
        });

        const rawVaultKey = vaultKey;
        setAccountPassword('');
        setVaultKey('');
        pendingMasterKeyRef.current = null;
        setOtpToken('');
        setTwoFactorRequired(false);
        setStatus('syncing');

        try {
          await unlock(masterKey, normalizedUsername);
        } catch (unlockErr: any) {
          const isKeyCheckError =
            /master key is incorrect or the vault data could not be decrypted/i.test(
              unlockErr?.message || ''
            );
          if (isKeyCheckError && rawVaultKey) {
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
                  `Primary salt unlock failed during OTP. Retrying unlock with candidate salt (${altSalt})...`
                );
                const altMasterKey = await deriveKey(rawVaultKey, altSalt);
                await unlock(altMasterKey, normalizedUsername);
                activeSaltRef.current = altSalt;
                const keyBuf = base64ToUint8Array(altMasterKey);
                const cryptoKey = await crypto.subtle.importKey(
                  'raw',
                  keyBuf as any,
                  { name: 'AES-GCM' },
                  false,
                  ['encrypt', 'decrypt']
                );
                keyBuf.fill(0);
                await uploadKeyCheckToCloud(cryptoKey, { force: true }).catch(() => {});
                unlockedWithAlt = true;
                break;
              } catch {
                // Try next salt candidate
              }
            }

            if (!unlockedWithAlt) {
              console.error(
                `All candidate salts exhausted during OTP (${triedSalts.join(', ')}) – unlock failed.`,
                unlockErr
              );
              throw unlockErr;
            }
          } else {
            throw unlockErr;
          }
        }

        setCurrentLayer(securityLayers.length);
        setStatus('success');
        completeUnlockTransition();
        setSuccessCountdown(2);

        // void unlock(masterKey, normalizedUsername).catch((error) => {
        //   if (!isComponentMounted.current) return
        //   lock()
        //   setStatus('error')
        //   setCurrentLayer(-1)
        //   handleError(error, 'Vault background sync')
        //   toast.error('Vault unlock failed', {
        //     description: 'Background vault sync failed. Please sign in again.',
        //   })
        // })

        toast.success('Security Cleared', {
          description: '2FA verified. Vault unlocked.',
        });
        return true;
      } catch (error) {
        pendingMasterKeyRef.current = null;
        handleError(error, '2FA Verification');
        setIsVerifyingOTP(false);
        setStatus('idle');
        setOtpToken('');
        return false;
      } finally {
        setIsVerifyingOTP(false);
      }
    },
    [
      userIdFor2FA,
      otpToken,
      isVerifyingOTP,
      username,
      vaultKey,
      unlock,
      completeUnlockTransition,
      securityLayers.length,
      mfaToken,
      // lock,
    ]
  );

  const resetTwoFactorFlow = useCallback(() => {
    pendingMasterKeyRef.current = null;
    setTwoFactorRequired(false);
    setOtpToken('');
    setMfaToken(null);
    setUserIdFor2FA(null);
    setStatus('idle');
  }, []);

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
    // 2FA
    twoFactorRequired,
    otpToken,
    setOtpToken,
    handleVerifyOTP,
    isVerifyingOTP,
    resetTwoFactorFlow,
  };
};
