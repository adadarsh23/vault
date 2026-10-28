import { describe, it, expect } from 'vitest';
import {
  isRecord,
  isNonEmptyString,
  isEncryptedFieldPayload,
  isEncryptedEnvelopePayload,
  isAuthenticatedUser,
  isAccessTokenPayload,
  isRefreshTokenPayload,
  isMfaTokenPayload,
  isVaultCategory,
  isFileCategory,
  isEncryptedCategory,
  isApiSuccessResponse,
  isApiErrorResponse,
  isSecurityContext,
} from '../../server/types/guards.ts';

describe('Server Types & Runtime Type Guards', () => {
  describe('isRecord & isNonEmptyString', () => {
    it('correctly identifies valid records', () => {
      expect(isRecord({})).toBe(true);
      expect(isRecord({ key: 'value' })).toBe(true);
      expect(isRecord(null)).toBe(false);
      expect(isRecord(undefined)).toBe(false);
      expect(isRecord('string')).toBe(false);
      expect(isRecord(123)).toBe(false);
      expect(isRecord([])).toBe(false);
    });

    it('correctly validates non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
    });
  });

  describe('isEncryptedFieldPayload', () => {
    it('validates a complete AES-256-GCM payload', () => {
      const valid = {
        cipherText: 'c29tZWNpcGhlcg==',
        iv: '123456789012',
        authTag: 'abcdefghijklmnop',
        algorithm: 'aes-256-gcm',
        keyVersion: 'v1',
      };
      expect(isEncryptedFieldPayload(valid)).toBe(true);
    });

    it('rejects incomplete or malformed payloads', () => {
      expect(isEncryptedFieldPayload(null)).toBe(false);
      expect(isEncryptedFieldPayload({})).toBe(false);
      expect(isEncryptedFieldPayload({ cipherText: 'abc' })).toBe(false);
      expect(isEncryptedFieldPayload({ cipherText: 'abc', iv: 'def' })).toBe(false);
      expect(isEncryptedFieldPayload({ cipherText: '', iv: 'def', authTag: 'ghi' })).toBe(false);
    });
  });

  describe('isEncryptedEnvelopePayload', () => {
    it('validates a complete modern envelope payload', () => {
      const validEnvelope = {
        algorithm: 'aes-256-gcm',
        iv: 'iv_val',
        authTag: 'tag_val',
        cipherText: 'cipher_val',
        wrappedDek: 'wrapped_val',
        wrapIv: 'wrap_iv_val',
        wrapTag: 'wrap_tag_val',
        keyVersion: 'v1',
        keyId: 'key_123',
      };
      expect(isEncryptedEnvelopePayload(validEnvelope)).toBe(true);
    });

    it('rejects envelopes with unsupported algorithms or missing DEK parameters', () => {
      const invalid = {
        algorithm: 'des',
        iv: 'iv_val',
        authTag: 'tag_val',
        cipherText: 'cipher_val',
        wrappedDek: 'wrapped_val',
        wrapIv: 'wrap_iv_val',
        wrapTag: 'wrap_tag_val',
        keyVersion: 'v1',
        keyId: 'key_123',
      };
      expect(isEncryptedEnvelopePayload(invalid)).toBe(false);
    });
  });

  describe('User & Token Type Guards', () => {
    it('validates authenticated user structures', () => {
      expect(isAuthenticatedUser({ userId: 'u123', username: 'alice' })).toBe(true);
      expect(isAuthenticatedUser({ userId: 'u123', username: '' })).toBe(false);
      expect(isAuthenticatedUser({ userId: '', username: 'alice' })).toBe(false);
      expect(isAuthenticatedUser(null)).toBe(false);
    });

    it('validates access token payloads', () => {
      const accessPayload = {
        sub: 'usr_1',
        username: 'alice',
        sessionId: 'sess_1',
        type: 'access',
      };
      expect(isAccessTokenPayload(accessPayload)).toBe(true);
      expect(isAccessTokenPayload({ ...accessPayload, type: 'refresh' })).toBe(false);
      expect(isAccessTokenPayload({ ...accessPayload, sub: '' })).toBe(false);
    });

    it('validates refresh token payloads', () => {
      const refreshPayload = {
        sub: 'usr_1',
        username: 'alice',
        sessionId: 'sess_1',
        deviceId: 'dev_1',
        type: 'refresh',
      };
      expect(isRefreshTokenPayload(refreshPayload)).toBe(true);
      expect(isRefreshTokenPayload({ ...refreshPayload, deviceId: '' })).toBe(false);
    });

    it('validates MFA token payloads', () => {
      const mfaPayload = {
        sub: 'usr_1',
        username: 'alice',
        type: 'mfa',
      };
      expect(isMfaTokenPayload(mfaPayload)).toBe(true);
      expect(isMfaTokenPayload({ ...mfaPayload, type: 'access' })).toBe(false);
    });
  });

  describe('Vault Categories', () => {
    it('validates vault category taxonomy', () => {
      expect(isVaultCategory('photo')).toBe(true);
      expect(isVaultCategory('video')).toBe(true);
      expect(isVaultCategory('note')).toBe(true);
      expect(isVaultCategory('password')).toBe(true);
      expect(isVaultCategory('other-files')).toBe(true);
      expect(isVaultCategory('wifi')).toBe(true);
      expect(isVaultCategory('invalid-category')).toBe(false);
    });

    it('validates file categories subset', () => {
      expect(isFileCategory('photo')).toBe(true);
      expect(isFileCategory('video')).toBe(true);
      expect(isFileCategory('note')).toBe(false);
      expect(isFileCategory('password')).toBe(false);
    });

    it('validates encrypted categories subset', () => {
      expect(isEncryptedCategory('note')).toBe(true);
      expect(isEncryptedCategory('password')).toBe(true);
      expect(isEncryptedCategory('todo')).toBe(true);
      expect(isEncryptedCategory('photo')).toBe(false);
    });
  });

  describe('API Response Shapes', () => {
    it('validates ApiSuccessResponse', () => {
      expect(isApiSuccessResponse({ success: true, message: 'OK', data: { id: 1 } })).toBe(true);
      expect(isApiSuccessResponse({ success: false, message: 'Failed', error: {} })).toBe(false);
    });

    it('validates ApiErrorResponse', () => {
      expect(
        isApiErrorResponse({
          success: false,
          message: 'Not found',
          error: { code: 'NOT_FOUND' },
        }),
      ).toBe(true);
      expect(isApiErrorResponse({ success: true, message: 'OK', data: {} })).toBe(false);
      expect(isApiErrorResponse({ success: false, message: 'Failed', error: {} })).toBe(false);
    });
  });

  describe('Security Context', () => {
    it('validates SecurityContext structure', () => {
      const validContext = {
        requestId: 'req_123',
        fingerprint: 'fp_456',
        riskScore: 12,
        anomalies: ['ip_drift'],
        recommendedAction: 'allow' as const,
      };
      expect(isSecurityContext(validContext)).toBe(true);

      const invalidAction = {
        ...validContext,
        recommendedAction: 'unknown_action',
      };
      expect(isSecurityContext(invalidAction)).toBe(false);
    });
  });
});
