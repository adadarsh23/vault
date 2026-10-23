import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  apiClient,
  authApi,
  vaultApi,
  systemApi,
  securityApi,
  normalizeApiError,
  isApiClientError,
  isApiResponse,
} from '../../src/api';

vi.mock('../../src/api/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/api/apiClient')>();
  const mockClientInstance: any = vi.fn();
  mockClientInstance.get = vi.fn().mockResolvedValue({ data: { success: true, data: {} } });
  mockClientInstance.post = vi.fn().mockResolvedValue({ data: { success: true, data: {} } });
  mockClientInstance.put = vi.fn().mockResolvedValue({ data: { success: true, data: {} } });
  mockClientInstance.patch = vi.fn().mockResolvedValue({ data: { success: true, data: {} } });
  mockClientInstance.delete = vi.fn().mockResolvedValue({ data: { success: true, data: {} } });
  mockClientInstance.head = vi.fn().mockResolvedValue({ headers: { 'upload-offset': '1024' } });
  mockClientInstance.interceptors = {
    request: { use: vi.fn(), eject: vi.fn() },
    response: { use: vi.fn(), eject: vi.fn() },
  };

  return {
    ...actual,
    default: mockClientInstance,
    apiClient: mockClientInstance,
  };
});

describe('src/api module enhancements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('normalizeApiError', () => {
    it('normalizes standard ApiResponse error structures', () => {
      const err = {
        response: {
          status: 400,
          data: {
            success: false,
            message: 'Invalid credentials provided',
            error: {
              code: 'INVALID_CREDENTIALS',
              requestId: 'req-123',
              details: { attempt: 3 },
            },
          },
        },
        message: 'Request failed with status code 400',
      };

      const normalized = normalizeApiError(err);
      expect(normalized.success).toBe(false);
      expect(normalized.code).toBe('INVALID_CREDENTIALS');
      expect(normalized.message).toBe('Invalid credentials provided');
      expect(normalized.status).toBe(400);
      expect(normalized.error.requestId).toBe('req-123');
    });

    it('normalizes flat error payloads (e.g. rate limiters)', () => {
      const err = {
        response: {
          status: 429,
          data: {
            error: 'Too many requests. Please slow down.',
          },
        },
        message: 'Request failed with status code 429',
      };

      const normalized = normalizeApiError(err);
      expect(normalized.success).toBe(false);
      expect(normalized.code).toBe('HTTP_429');
      expect(normalized.message).toBe('Too many requests. Please slow down.');
      expect(normalized.status).toBe(429);
    });

    it('identifies ApiClientError using isApiClientError', () => {
      const normalized = normalizeApiError(new Error('Network error'));
      expect(isApiClientError(normalized)).toBe(true);
      expect(isApiClientError({ foo: 'bar' })).toBe(false);
    });

    it('validates ApiResponse structure using isApiResponse', () => {
      expect(isApiResponse({ success: true, message: 'ok', data: 123 })).toBe(true);
      expect(isApiResponse(null)).toBe(false);
      expect(isApiResponse('string')).toBe(false);
    });
  });

  describe('authApi', () => {
    it('calls login with validated credentials', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { success: true, message: 'OK', data: { token: 'jwt-token' } },
      } as any);

      const res = await authApi.login({ username: 'alice', password: 'secretpassword' });
      expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
        username: 'alice',
        password: 'secretpassword',
      });
      expect(res.data.token).toBe('jwt-token');
    });

    it('throws TypeError if credentials username is empty', async () => {
      await expect(authApi.login({ username: '  ', password: 'secretpassword' })).rejects.toThrow(
        TypeError,
      );
    });

    it('calls checkUsername with query parameters', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: { success: true, message: 'OK', data: { available: true } },
      } as any);

      const res = await authApi.checkUsername('bob_vault');
      expect(apiClient.get).toHaveBeenCalledWith('/auth/username-check', {
        params: { username: 'bob_vault' },
      });
      expect(res.data.available).toBe(true);
    });

    it('calls getSalt with trimmed username', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: { success: true, message: 'OK', data: { salt: 'salt123' } },
      } as any);

      const res = await authApi.getSalt('bob_vault ');
      expect(apiClient.get).toHaveBeenCalledWith('/auth/salt', {
        params: { username: 'bob_vault' },
      });
      expect(res.data.salt).toBe('salt123');
    });

    it('calls revokeSessions with payload', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { success: true, message: 'OK', data: { revokedCount: 2 } },
      } as any);

      const res = await authApi.revokeSessions({ allOthers: true });
      expect(apiClient.post).toHaveBeenCalledWith('/auth/sessions/revoke', { allOthers: true });
      expect(res.data.revokedCount).toBe(2);
    });
  });

  describe('vaultApi', () => {
    it('creates TUS upload with international utf-8 metadata safely', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        headers: { location: '/files/tus/upload-session-xyz' },
        data: {},
      } as any);

      const result = await vaultApi.createTusUpload(1048576, {
        filename: 'résumé-🔐.pdf',
        filetype: 'application/pdf',
      });

      expect(result.uploadId).toBe('upload-session-xyz');
      expect(apiClient.post).toHaveBeenCalledWith(
        '/vault/files/tus',
        {},
        expect.objectContaining({
          headers: expect.objectContaining({
            'Tus-Resumable': '1.0.0',
            'Upload-Length': '1048576',
          }),
        }),
      );
    });

    it('calls getSignedUrl with encoded segment', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: { success: true, data: { signedUrl: 'https://cdn.example.com/asset' } },
      } as any);

      const res = await vaultApi.getSignedUrl('item/test#1');
      expect(apiClient.get).toHaveBeenCalledWith('/vault/files/signed-url/item%2Ftest%231');
      expect(res.data.signedUrl).toBe('https://cdn.example.com/asset');
    });

    it('calls getIntegrityStatus', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: { activeRootHash: 'hash-blake3', lastAuditStatus: 'clean' },
        },
      } as any);

      const res = await vaultApi.getIntegrityStatus();
      expect(apiClient.get).toHaveBeenCalledWith('/vault/integrity/status');
      expect(res.data.activeRootHash).toBe('hash-blake3');
    });

    it('calls verifyIntegrity with specified algorithm', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { success: true, data: { status: 'clean', totalChecked: 45 } },
      } as any);

      const res = await vaultApi.verifyIntegrity('blake3');
      expect(apiClient.post).toHaveBeenCalledWith('/vault/integrity/verify', {
        algorithm: 'blake3',
      });
      expect(res.data.totalChecked).toBe(45);
    });
  });

  describe('systemApi', () => {
    it('normalizes logs options and executes request', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: {
          success: true,
          logs: [
            { id: '1', level: 'info', message: 'Ready', timestamp: '2026-10-23T00:00:00.000Z' },
          ],
          hasMore: false,
          nextCursor: null,
        },
      } as any);

      const res = await systemApi.getLogs({ limit: 100, cursor: '50' });
      expect(apiClient.get).toHaveBeenCalledWith('/system/logs', {
        params: { limit: 100, cursor: '50' },
        signal: undefined,
      });
      expect(res.logs).toHaveLength(1);
    });

    it('clamps limit to maximum allowable range', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: { success: true, logs: [], hasMore: false, nextCursor: null },
      } as any);

      await systemApi.getLogs({ limit: 9999 });
      expect(apiClient.get).toHaveBeenCalledWith('/system/logs', {
        params: { limit: 200 },
        signal: undefined,
      });
    });
  });

  describe('securityApi', () => {
    it('calls getDevices', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: { success: true, data: { devices: [] } },
      } as any);

      const res = await securityApi.getDevices();
      expect(apiClient.get).toHaveBeenCalledWith('/security/devices');
      expect(res.data.devices).toEqual([]);
    });

    it('calls verifyDevice with encoded id and token', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { success: true, data: { success: true, message: 'Verified' } },
      } as any);

      await securityApi.verifyDevice('device:123', '123456');
      expect(apiClient.post).toHaveBeenCalledWith('/security/devices/device%3A123/verify', {
        token: '123456',
      });
    });

    it('calls forgetAllOtherDevices', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: { success: true, data: { success: true, message: 'Logged out' } },
      } as any);

      await securityApi.forgetAllOtherDevices();
      expect(apiClient.post).toHaveBeenCalledWith('/security/devices/forget-all');
    });
  });
});
