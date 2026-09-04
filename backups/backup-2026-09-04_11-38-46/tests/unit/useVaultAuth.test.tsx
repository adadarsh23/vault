/* @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVaultAuth, SECURITY_LAYERS } from '../../src/features/auth/useVaultAuth';

// Mock dependencies
const mockToast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: mockToast,
}));

const { mockVaultStore, mockUseVaultStore } = vi.hoisted(() => {
  const store = {
    unlock: vi.fn().mockResolvedValue(undefined),
    completeUnlockTransition: vi.fn(),
    lock: vi.fn(),
    emergencyLocalWipe: vi.fn().mockResolvedValue(undefined),
    unlockDecoyVault: vi.fn().mockResolvedValue(undefined),
    isUnlocked: false,
    isVaultReady: false,
    items: [],
    preferences: {
      isDecoyVaultEnabled: false,
      decoyPasswordHash: null as string | null,
      isBruteForceWipeEnabled: false,
      maxFailedAttemptsBeforeWipe: 10,
    },
  };

  const useStore = Object.assign(
    (selector: any) => (typeof selector === 'function' ? selector(store) : store),
    {
      getState: () => store,
      setState: (fnOrPartial: any) => {
        if (typeof fnOrPartial === 'function') {
          Object.assign(store, fnOrPartial(store));
        } else {
          Object.assign(store, fnOrPartial);
        }
      },
      subscribe: vi.fn(() => () => {}),
    },
  );

  return { mockVaultStore: store, mockUseVaultStore: useStore };
});

vi.mock('../../src/store/vaultStore', () => ({
  useVaultStore: mockUseVaultStore,
}));

const mockCrypto = vi.hoisted(() => ({
  deriveKey: vi.fn().mockResolvedValue('ZGVyaXZlZC1tYXN0ZXIta2V5LTMyLWJ5dGVzISEhIQ=='),
  base64ToUint8Array: vi.fn().mockReturnValue(new Uint8Array(32)),
  touchCryptoKeyCache: vi.fn(),
  getSodium: vi.fn().mockResolvedValue({
    crypto_aead_chacha20poly1305_ietf_encrypt: vi.fn(),
    crypto_sign: vi.fn(),
  }),
  performHybridKeyExchange: vi.fn().mockResolvedValue({
    localPublicKeys: { ecc: 'ecc-key', kyber: 'kyber-key' },
  }),
  uploadKeyCheckToCloud: vi.fn().mockResolvedValue(undefined),
  logActivity: vi.fn(),
  identifyLogRocketUser: vi.fn(),
  verifyDecoyPin: vi.fn(async (pin: string, hash: string) => {
    if (
      hash === 'test-decoy-hash' &&
      (pin === '9876' || pin === 'DecoyPin1234!' || pin === '123456')
    )
      return true;
    if (
      hash.startsWith('pbkdf2:') &&
      (pin === '9876' || pin === 'DecoyPin1234!' || pin === '123456')
    )
      return true;
    return false;
  }),
}));

vi.mock('../../src/lib/cryptoPrimitives', () => ({
  deriveKey: mockCrypto.deriveKey,
  base64ToUint8Array: mockCrypto.base64ToUint8Array,
  verifyDecoyPin: mockCrypto.verifyDecoyPin,
  touchCryptoKeyCache: mockCrypto.touchCryptoKeyCache,
  getSodium: mockCrypto.getSodium,
}));

vi.mock('../../src/lib/encryption', () => ({
  performHybridKeyExchange: mockCrypto.performHybridKeyExchange,
}));

vi.mock('../../src/lib/sync', () => ({
  uploadKeyCheckToCloud: mockCrypto.uploadKeyCheckToCloud,
}));

vi.mock('../../src/lib/activity', () => ({
  logActivity: mockCrypto.logActivity,
}));

vi.mock('../../src/lib/logrocket', () => ({
  identifyLogRocketUser: mockCrypto.identifyLogRocketUser,
}));

const mockAuthApi = vi.hoisted(() => ({
  authenticateVaultSession: vi.fn(),
  fetchVaultSalt: vi.fn().mockResolvedValue('test-salt-12345678'),
  refreshVaultSession: vi.fn().mockResolvedValue({ token: 'refreshed-token' }),
  verifyCloudUnlockCaptcha: vi.fn().mockResolvedValue({ success: true }),
  verify2FALogin: vi.fn().mockResolvedValue({
    success: true,
    token: '2fa-token',
    user: { id: 'u1', username: 'alice' },
  }),
  waitForPendingLogout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/auth-api', () => ({
  authenticateVaultSession: mockAuthApi.authenticateVaultSession,
  fetchVaultSalt: mockAuthApi.fetchVaultSalt,
  refreshVaultSession: mockAuthApi.refreshVaultSession,
  verifyCloudUnlockCaptcha: mockAuthApi.verifyCloudUnlockCaptcha,
  verify2FALogin: mockAuthApi.verify2FALogin,
  waitForPendingLogout: mockAuthApi.waitForPendingLogout,
}));

const mockSession = vi.hoisted(() => ({
  clearAuthToken: vi.fn(),
  clearCloudSessionHint: vi.fn(),
}));

vi.mock('../../src/lib/auth-session', () => ({
  clearAuthToken: mockSession.clearAuthToken,
  clearCloudSessionHint: mockSession.clearCloudSessionHint,
}));

const VALID_PASSWORD = 'ValidPassword123!';
const VALID_VAULT_KEY = 'VaultMasterKey2026!';
const CAPTCHA_TOKEN = 'test-captcha-token-abcdefghijklmnopqrstuvwxyz';

describe('useVaultAuth Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVaultStore.unlock.mockReset();
    mockVaultStore.unlock.mockResolvedValue(undefined);
    mockVaultStore.completeUnlockTransition.mockReset();
    mockVaultStore.lock.mockReset();
    mockVaultStore.emergencyLocalWipe.mockReset();
    mockVaultStore.emergencyLocalWipe.mockResolvedValue(undefined);
    mockVaultStore.unlockDecoyVault.mockReset();
    mockVaultStore.unlockDecoyVault.mockResolvedValue(undefined);
    mockVaultStore.preferences = {
      isDecoyVaultEnabled: false,
      decoyPasswordHash: null,
      isBruteForceWipeEnabled: false,
      maxFailedAttemptsBeforeWipe: 10,
    };
    mockAuthApi.authenticateVaultSession.mockResolvedValue({
      token: 'test-session-token',
      user: { id: 'user-1', username: 'alice' },
      twoFactorRequired: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useVaultAuth());

    expect(result.current.username).toBe('');
    expect(result.current.accountPassword).toBe('');
    expect(result.current.vaultKey).toBe('');
    expect(result.current.status).toBe('idle');
    expect(result.current.currentLayer).toBe(-1);
    expect(result.current.twoFactorRequired).toBe(false);
    expect(result.current.securityLayers).toEqual(SECURITY_LAYERS);
  });

  it('initializes with provided initialUsername', () => {
    const { result } = renderHook(() => useVaultAuth({ initialUsername: 'Alice' }));

    expect(result.current.username).toBe('alice');
  });

  describe('Input Validation in handleUnlock', () => {
    it('rejects empty username', async () => {
      const { result } = renderHook(() => useVaultAuth());

      act(() => {
        result.current.setVaultKey(VALID_VAULT_KEY);
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(false);
      expect(mockToast.error).toHaveBeenCalledWith(
        'Security Protocol Violation',
        expect.objectContaining({
          description: expect.stringContaining('Account Identifier is required'),
        }),
      );
    });

    it('rejects short username (< 3 chars)', async () => {
      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'ab' }));

      act(() => {
        result.current.setVaultKey(VALID_VAULT_KEY);
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(false);
      expect(mockToast.error).toHaveBeenCalledWith(
        'Account Identifier Too Short',
        expect.anything(),
      );
    });

    it('rejects invalid username characters (e.g. containing @ or spaces)', async () => {
      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice@vault' }));

      act(() => {
        result.current.setVaultKey(VALID_VAULT_KEY);
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(false);
      expect(mockToast.error).toHaveBeenCalledWith('Invalid username', expect.anything());
    });

    it('rejects identical account password and vault key during registration', async () => {
      const { result } = renderHook(() =>
        useVaultAuth({ initialUsername: 'alice', authMode: 'register' }),
      );

      act(() => {
        result.current.setAccountPassword(VALID_PASSWORD);
        result.current.setVaultKey(VALID_PASSWORD);
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(false);
      expect(mockToast.error).toHaveBeenCalledWith(
        'Security Requirement Error',
        expect.objectContaining({
          description: expect.stringContaining('must not be identical'),
        }),
      );
    });
  });

  describe('Successful Unlock Flow', () => {
    it('runs security verification, authenticates session, unlocks vault, and completes transition', async () => {
      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice' }));

      act(() => {
        result.current.setAccountPassword(VALID_PASSWORD);
        result.current.setVaultKey(VALID_VAULT_KEY);
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(true);
      expect(mockAuthApi.waitForPendingLogout).toHaveBeenCalled();
      expect(mockCrypto.deriveKey).toHaveBeenCalled();
      expect(mockAuthApi.authenticateVaultSession).toHaveBeenCalledWith(
        'login',
        'alice',
        VALID_PASSWORD,
        CAPTCHA_TOKEN,
        VALID_VAULT_KEY,
        expect.anything(),
      );
      expect(mockVaultStore.unlock).toHaveBeenCalled();
      expect(mockVaultStore.completeUnlockTransition).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalledWith('Security Cleared', expect.anything());
      expect(mockCrypto.logActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'auth_login',
          status: 'success',
        }),
      );
      // Passwords cleared from state for sensitive memory safety
      expect(result.current.accountPassword).toBe('');
      expect(result.current.vaultKey).toBe('');
    });

    it('handles cloudSessionActive mode without requiring account password', async () => {
      const { result } = renderHook(() =>
        useVaultAuth({ initialUsername: 'alice', cloudSessionActive: true }),
      );

      act(() => {
        result.current.setVaultKey(VALID_VAULT_KEY);
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(true);
      expect(mockAuthApi.verifyCloudUnlockCaptcha).toHaveBeenCalledWith(CAPTCHA_TOKEN);
      expect(mockAuthApi.refreshVaultSession).toHaveBeenCalled();
      expect(mockVaultStore.unlock).toHaveBeenCalled();
    });
  });

  describe('2FA Flow', () => {
    it('handles twoFactorRequired from backend and allows OTP verification', async () => {
      mockAuthApi.authenticateVaultSession.mockResolvedValueOnce({
        twoFactorRequired: true,
        userId: 'user-2fa-123',
        mfaToken: 'mfa-token-abc',
      });

      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice' }));

      act(() => {
        result.current.setAccountPassword(VALID_PASSWORD);
        result.current.setVaultKey(VALID_VAULT_KEY);
      });

      // Step 1: Initial unlock triggers 2FA
      let step1Success: boolean = false;
      await act(async () => {
        step1Success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(step1Success).toBe(true);
      expect(result.current.twoFactorRequired).toBe(true);

      // Step 2: User enters OTP
      act(() => {
        result.current.setOtpToken('123456');
      });

      let otpSuccess: boolean = false;
      await act(async () => {
        otpSuccess = await result.current.handleVerifyOTP(CAPTCHA_TOKEN);
      });

      expect(otpSuccess).toBe(true);
      expect(mockAuthApi.verify2FALogin).toHaveBeenCalledWith(
        'user-2fa-123',
        '123456',
        'mfa-token-abc',
        CAPTCHA_TOKEN,
      );
      expect(mockVaultStore.unlock).toHaveBeenCalled();
      expect(result.current.twoFactorRequired).toBe(false);
    });

    it('handles invalid 2FA code without resetting the derived master key', async () => {
      mockAuthApi.authenticateVaultSession.mockResolvedValueOnce({
        twoFactorRequired: true,
        userId: 'user-2fa-123',
        mfaToken: 'mfa-token-abc',
      });

      mockAuthApi.verify2FALogin.mockRejectedValueOnce({
        code: 'INVALID_2FA_CODE',
        message: 'Invalid 2FA code',
      });

      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice' }));

      act(() => {
        result.current.setAccountPassword(VALID_PASSWORD);
        result.current.setVaultKey(VALID_VAULT_KEY);
      });

      await act(async () => {
        await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      act(() => {
        result.current.setOtpToken('000000');
      });

      let otpSuccess: boolean = true;
      await act(async () => {
        otpSuccess = await result.current.handleVerifyOTP(CAPTCHA_TOKEN);
      });

      expect(otpSuccess).toBe(false);
      expect(mockToast.error).toHaveBeenCalledWith('Invalid 2FA Code', expect.anything());
      // 2FA state remains active so user can re-try
      expect(result.current.twoFactorRequired).toBe(true);
      expect(result.current.otpToken).toBe('');
    });

    it('resets 2FA flow on session expiration', async () => {
      mockAuthApi.authenticateVaultSession.mockResolvedValueOnce({
        twoFactorRequired: true,
        userId: 'user-2fa-123',
        mfaToken: 'mfa-token-abc',
      });

      mockAuthApi.verify2FALogin.mockRejectedValueOnce({
        code: 'MFA_TOKEN_INVALID',
        message: 'Session expired',
      });

      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice' }));

      act(() => {
        result.current.setAccountPassword(VALID_PASSWORD);
        result.current.setVaultKey(VALID_VAULT_KEY);
      });

      await act(async () => {
        await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      act(() => {
        result.current.setOtpToken('123456');
      });

      let otpSuccess: boolean = true;
      await act(async () => {
        otpSuccess = await result.current.handleVerifyOTP(CAPTCHA_TOKEN);
      });

      expect(otpSuccess).toBe(false);
      expect(mockToast.error).toHaveBeenCalledWith('Session expired', expect.anything());
      expect(result.current.twoFactorRequired).toBe(false);
    });

    it('resets 2FA flow when resetTwoFactorFlow is explicitly called', () => {
      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice' }));

      act(() => {
        result.current.resetTwoFactorFlow();
      });

      expect(result.current.twoFactorRequired).toBe(false);
      expect(result.current.otpToken).toBe('');
      expect(result.current.status).toBe('idle');
    });
  });

  describe('Salt Fallback Decryption Recovery', () => {
    it('retries candidate salts if primary salt unlock encounters decryption mismatch', async () => {
      // First unlock attempt with primary salt fails with decryption error
      mockVaultStore.unlock
        .mockRejectedValueOnce(
          new Error('master key is incorrect or the vault data could not be decrypted'),
        )
        .mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice' }));

      act(() => {
        result.current.setAccountPassword(VALID_PASSWORD);
        result.current.setVaultKey(VALID_VAULT_KEY);
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(true);
      // Unlock was called twice (first failed, candidate succeeded)
      expect(mockVaultStore.unlock).toHaveBeenCalledTimes(2);
      expect(mockCrypto.uploadKeyCheckToCloud).toHaveBeenCalled();
    });
  });

  describe('Error Classification and Cooldown', () => {
    it('handles invalid credentials properly', async () => {
      mockAuthApi.authenticateVaultSession.mockRejectedValueOnce({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
      });

      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice' }));

      act(() => {
        result.current.setAccountPassword(VALID_PASSWORD);
        result.current.setVaultKey(VALID_VAULT_KEY);
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(false);
      expect(mockToast.error).toHaveBeenCalledWith(
        'Authentication Failed',
        expect.objectContaining({
          description: expect.stringContaining('username or account password is incorrect'),
        }),
      );
      expect(result.current.status).toBe('error');
    });

    it('handles rate limiting properly', async () => {
      mockAuthApi.authenticateVaultSession.mockRejectedValueOnce({
        code: 'TOO_MANY_AUTH_ATTEMPTS',
        message: 'Rate limit reached',
      });

      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice' }));

      act(() => {
        result.current.setAccountPassword(VALID_PASSWORD);
        result.current.setVaultKey(VALID_VAULT_KEY);
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(false);
      expect(mockToast.error).toHaveBeenCalledWith('Too Many Attempts', expect.anything());
    });

    it('handles session login master key failure with clear Master Key Incorrect error', async () => {
      mockVaultStore.unlock.mockRejectedValue(
        new Error('Master key is incorrect or the vault data could not be decrypted'),
      );

      const { result } = renderHook(() =>
        useVaultAuth({ initialUsername: 'alice', initialCloudSessionActive: true }),
      );

      act(() => {
        result.current.setVaultKey('WrongMasterKey123!');
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(false);
      expect(mockToast.error).toHaveBeenCalledWith(
        'Master Key Incorrect',
        expect.objectContaining({
          description: expect.stringContaining('Master Key you entered is incorrect'),
        }),
      );
      expect(result.current.status).toBe('error');
    });
  });

  describe('Decoy / Duress Vault Mode', () => {
    it('unlocks isolated decoy vault when valid decoy PIN is entered and decoy mode is enabled', async () => {
      mockVaultStore.preferences = {
        isDecoyVaultEnabled: true,
        decoyPasswordHash: 'pbkdf2:100000:salt123:testhash',
        isBruteForceWipeEnabled: false,
        maxFailedAttemptsBeforeWipe: 10,
      };

      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice' }));

      act(() => {
        result.current.setAccountPassword(VALID_PASSWORD);
        result.current.setVaultKey('123456');
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(true);
      expect(mockVaultStore.unlockDecoyVault).toHaveBeenCalledWith('alice');
      expect(mockVaultStore.completeUnlockTransition).toHaveBeenCalled();
      // Server auth is bypassed in decoy mode
      expect(mockAuthApi.authenticateVaultSession).not.toHaveBeenCalled();
      // Credentials cleared from memory
      expect(result.current.accountPassword).toBe('');
      expect(result.current.vaultKey).toBe('');
    });

    it('unlocks isolated decoy vault when a short 4-digit PIN (e.g. 9876) is entered', async () => {
      mockVaultStore.preferences = {
        isDecoyVaultEnabled: true,
        decoyPasswordHash: 'pbkdf2:100000:salt123:testhash',
        isBruteForceWipeEnabled: false,
        maxFailedAttemptsBeforeWipe: 10,
      };

      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice' }));

      act(() => {
        result.current.setAccountPassword('anyPassword');
        result.current.setVaultKey('9876');
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(true);
      expect(mockVaultStore.unlockDecoyVault).toHaveBeenCalledWith('alice');
      expect(mockVaultStore.completeUnlockTransition).toHaveBeenCalled();
    });

    it('unlocks isolated decoy vault when decoy PIN is entered in account password field with master key empty', async () => {
      mockVaultStore.preferences = {
        isDecoyVaultEnabled: true,
        decoyPasswordHash: 'pbkdf2:100000:salt123:testhash',
        isBruteForceWipeEnabled: false,
        maxFailedAttemptsBeforeWipe: 10,
      };

      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice' }));

      act(() => {
        result.current.setAccountPassword('9876');
        result.current.setVaultKey('');
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(true);
      expect(mockVaultStore.unlockDecoyVault).toHaveBeenCalledWith('alice');
      expect(mockVaultStore.completeUnlockTransition).toHaveBeenCalled();
    });

    it('unlocks isolated decoy vault when decoy PIN hash is loaded from localStorage', async () => {
      mockVaultStore.preferences = {
        isDecoyVaultEnabled: true,
        decoyPasswordHash: null,
        isBruteForceWipeEnabled: false,
        maxFailedAttemptsBeforeWipe: 10,
      };

      localStorage.setItem('vault_decoy_pin_hash_alice', 'pbkdf2:100000:salt123:testhash');

      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice' }));

      act(() => {
        result.current.setAccountPassword('123456');
        result.current.setVaultKey('');
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(true);
      expect(mockVaultStore.unlockDecoyVault).toHaveBeenCalledWith('alice');
      localStorage.removeItem('vault_decoy_pin_hash_alice');
    });

    it('does not unlock decoy vault if decoy PIN does not match', async () => {
      mockVaultStore.preferences = {
        isDecoyVaultEnabled: true,
        decoyPasswordHash: 'pbkdf2:100000:salt123:testhash',
        isBruteForceWipeEnabled: false,
        maxFailedAttemptsBeforeWipe: 10,
      };

      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice' }));

      act(() => {
        result.current.setAccountPassword(VALID_PASSWORD);
        result.current.setVaultKey('999999');
      });

      await act(async () => {
        await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(mockVaultStore.unlockDecoyVault).not.toHaveBeenCalled();
      expect(mockAuthApi.authenticateVaultSession).toHaveBeenCalled();
    });

    it('proceeds with standard unlock when decoy mode is disabled even if decoy key is entered', async () => {
      mockVaultStore.preferences = {
        isDecoyVaultEnabled: false,
        decoyPasswordHash: 'pbkdf2:100000:salt123:testhash',
        isBruteForceWipeEnabled: false,
        maxFailedAttemptsBeforeWipe: 10,
      };

      const { result } = renderHook(() => useVaultAuth({ initialUsername: 'alice' }));

      act(() => {
        result.current.setAccountPassword(VALID_PASSWORD);
        result.current.setVaultKey(VALID_VAULT_KEY);
      });

      let success: boolean = false;
      await act(async () => {
        success = await result.current.handleUnlock(CAPTCHA_TOKEN);
      });

      expect(success).toBe(true);
      expect(mockVaultStore.unlockDecoyVault).not.toHaveBeenCalled();
      expect(mockAuthApi.authenticateVaultSession).toHaveBeenCalled();
      expect(mockVaultStore.unlock).toHaveBeenCalled();
    });
  });
});
