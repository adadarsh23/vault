import { describe, expect, it } from 'vitest';
import {
  CIRCULAR_PLACEHOLDER,
  FILTERED_PLACEHOLDER,
  MAX_DEPTH_PLACEHOLDER,
  isSensitiveKey,
  redactSensitiveData,
  sanitizeTags,
  sanitizeUrl,
  sanitizeUserContext,
} from '../../server/lib/sanitizer.ts';

describe('server/lib/sanitizer', () => {
  describe('isSensitiveKey', () => {
    it('identifies exact sensitive keys in various casings', () => {
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('PASSWORD')).toBe(true);
      expect(isSensitiveKey('masterKey')).toBe(true);
      expect(isSensitiveKey('MASTERKEY')).toBe(true);
      expect(isSensitiveKey('authorization')).toBe(true);
      expect(isSensitiveKey('dek')).toBe(true);
      expect(isSensitiveKey('kek')).toBe(true);
      expect(isSensitiveKey('salt')).toBe(true);
      expect(isSensitiveKey('candidatePin')).toBe(true);
      expect(isSensitiveKey('decoyPin')).toBe(true);
    });

    it('identifies substring sensitive patterns', () => {
      expect(isSensitiveKey('user_password_hash')).toBe(true);
      expect(isSensitiveKey('client_secret')).toBe(true);
      expect(isSensitiveKey('backup_codes_list')).toBe(true);
      expect(isSensitiveKey('twofactor_token')).toBe(true);
    });

    it('allows non-sensitive keys', () => {
      expect(isSensitiveKey('id')).toBe(false);
      expect(isSensitiveKey('name')).toBe(false);
      expect(isSensitiveKey('status')).toBe(false);
      expect(isSensitiveKey('createdAt')).toBe(false);
    });

    it('supports custom sensitive keys', () => {
      const custom = new Set(['tenant_internal_id', 'custom_secret_key']);
      expect(isSensitiveKey('tenant_internal_id', custom)).toBe(true);
    });
  });

  describe('sanitizeUrl', () => {
    it('sanitizes sensitive query parameters', () => {
      const url = '/api/auth/verify?token=secret123&uid=42&auth_token=jwtXYZ';
      const sanitized = sanitizeUrl(url);
      expect(sanitized).toBe('/api/auth/verify?token=[Filtered]&uid=42&auth_token=[Filtered]');
    });

    it('sanitizes basic auth credentials in URLs', () => {
      const url = 'https://admin:SuperSecretPassword123@vault.internal/api/items';
      const sanitized = sanitizeUrl(url);
      expect(sanitized).toBe('https://admin:[Filtered]@vault.internal/api/items');
    });

    it('leaves safe URLs unchanged', () => {
      const url = '/api/health?check=database&limit=10';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('handles edge case inputs (null, undefined, non-strings)', () => {
      expect(sanitizeUrl(null)).toBe('');
      expect(sanitizeUrl(undefined)).toBe('');
      expect(sanitizeUrl(12345 as any)).toBe('');
    });
  });

  describe('redactSensitiveData', () => {
    it('redacts sensitive fields in nested objects and arrays', () => {
      const input = {
        id: 'user_1',
        password: 'my-plaintext-password',
        auth: {
          token: 'jwt-header.payload.signature',
          cookie: 'session_cookie_secret',
        },
        items: [
          {
            name: 'note 1',
            masterKey: 'mk-sensitive-secret',
            ciphertext: 'aes-encrypted-string',
          },
        ],
      };

      const result = redactSensitiveData(input) as typeof input;

      expect(result.id).toBe('user_1');
      expect(result.password).toBe(FILTERED_PLACEHOLDER);
      expect(result.auth.token).toBe(FILTERED_PLACEHOLDER);
      expect(result.auth.cookie).toBe(FILTERED_PLACEHOLDER);
      expect(result.items[0].name).toBe('note 1');
      expect(result.items[0].masterKey).toBe(FILTERED_PLACEHOLDER);
      expect(result.items[0].ciphertext).toBe(FILTERED_PLACEHOLDER);
    });

    it('prevents call stack overflow on circular references', () => {
      const circularObj: any = { name: 'parent', count: 10 };
      circularObj.self = circularObj;
      circularObj.child = { parent: circularObj };

      expect(() => {
        const result = redactSensitiveData(circularObj) as any;
        expect(result.name).toBe('parent');
        expect(result.self).toBe(CIRCULAR_PLACEHOLDER);
        expect(result.child.parent).toBe(CIRCULAR_PLACEHOLDER);
      }).not.toThrow();
    });

    it('protects against prototype pollution', () => {
      const maliciousPayload = JSON.parse(
        '{"name": "test", "__proto__": {"polluted": true}, "constructor": "evil"}',
      );

      const result = redactSensitiveData(maliciousPayload) as any;
      expect(result.name).toBe('test');
      expect(result.__proto__).toBe(Object.prototype);
      expect((Object.prototype as any).polluted).toBeUndefined();
    });

    it('safely handles Buffer and TypedArray without dumping bytes', () => {
      const buf = Buffer.from('super-secret-raw-encryption-key-data');
      const typedArray = new Uint8Array([1, 2, 3, 4, 5]);

      const result = redactSensitiveData({ keyBuffer: buf, keyBytes: typedArray }) as any;

      expect(result.keyBuffer).toContain('[Buffer:');
      expect(result.keyBuffer).not.toContain('super-secret');
      expect(result.keyBytes).toContain('[TypedArray:');
    });

    it('safely handles Error objects with sensitive messages', () => {
      const err = new Error('Failed to verify token: /api/verify?token=secretToken123');
      err.stack = 'Error at test.ts:10';
      (err as any).extraSecret = 'sensitive-meta';

      const result = redactSensitiveData(err) as any;

      expect(result.name).toBe('Error');
      expect(result.message).toContain('token=[Filtered]');
      expect(result.extraSecret).toBe(FILTERED_PLACEHOLDER);
    });

    it('preserves Date instances', () => {
      const now = new Date();
      const result = redactSensitiveData({ date: now }) as any;
      expect(result.date).toBeInstanceOf(Date);
      expect(result.date.getTime()).toBe(now.getTime());
    });

    it('enforces maximum depth limits to avoid excessive recursion', () => {
      let deep: any = { depth: 0 };
      let current = deep;
      for (let i = 1; i <= 15; i++) {
        current.next = { depth: i };
        current = current.next;
      }

      const result = redactSensitiveData(deep, { maxDepth: 5 }) as any;
      let check = result;
      for (let i = 0; i < 5; i++) {
        check = check.next;
      }
      expect(check.next).toBe(MAX_DEPTH_PLACEHOLDER);
    });
  });

  describe('sanitizeUserContext', () => {
    it('extracts only safe identity fields and discards secrets', () => {
      const rawUser = {
        _id: 'mongo-id-123',
        id: 'mongo-id-123',
        username: 'alice',
        email: 'alice@example.com',
        role: 'user',
        passwordHash: '$2a$12$superSecretHashString',
        twoFactorSecret: 'TOTPSECRET123',
        masterKeyEnvelope: { encryptedDek: 'xyz' },
        refreshToken: 'rt-123',
        salt: 'pqc-salt-456',
      };

      const sanitized = sanitizeUserContext(rawUser);

      expect(sanitized).toEqual({
        _id: 'mongo-id-123',
        id: 'mongo-id-123',
        username: 'alice',
        email: 'alice@example.com',
        role: 'user',
      });
      expect(sanitized).not.toHaveProperty('passwordHash');
      expect(sanitized).not.toHaveProperty('twoFactorSecret');
      expect(sanitized).not.toHaveProperty('masterKeyEnvelope');
      expect(sanitized).not.toHaveProperty('refreshToken');
      expect(sanitized).not.toHaveProperty('salt');
    });

    it('returns null for empty or invalid user input', () => {
      expect(sanitizeUserContext(null)).toBeNull();
      expect(sanitizeUserContext(undefined)).toBeNull();
      expect(sanitizeUserContext('invalid')).toBeNull();
      expect(sanitizeUserContext({ password: 'only-secret' })).toBeNull();
    });
  });

  describe('sanitizeTags', () => {
    it('extracts only safe primitive tags and redacts URLs', () => {
      const context = {
        service: 'auth',
        statusCode: 401,
        success: false,
        url: '/api/v1/resource?token=secretToken',
        password: 'should-be-omitted',
        token: 'should-be-omitted',
        complexObject: { not: 'primitive' },
      };

      const tags = sanitizeTags(context);

      expect(tags).toEqual({
        service: 'auth',
        statusCode: 401,
        success: false,
        url: '/api/v1/resource?token=[Filtered]',
      });
      expect(tags).not.toHaveProperty('password');
      expect(tags).not.toHaveProperty('token');
      expect(tags).not.toHaveProperty('complexObject');
    });

    it('truncates excessively long tag strings', () => {
      const longStr = 'a'.repeat(300);
      const tags = sanitizeTags({ description: longStr }, 50);
      expect(tags.description).toBe(`${'a'.repeat(50)}...`);
    });
  });
});
