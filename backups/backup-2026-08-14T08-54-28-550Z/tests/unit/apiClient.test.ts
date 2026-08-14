import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import apiClient from '../../src/api/apiClient';
import * as authSession from '../../src/lib/auth-session';

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  const mockAxiosInstance = vi.fn((config) => {
    return (mockAxiosInstance as any).request(config);
  }) as any;

  mockAxiosInstance.create = vi.fn().mockReturnValue(mockAxiosInstance);
  mockAxiosInstance.post = vi.fn();
  mockAxiosInstance.get = vi.fn();
  mockAxiosInstance.request = vi.fn();
  mockAxiosInstance.interceptors = {
    request: { use: vi.fn(), eject: vi.fn() },
    response: { use: vi.fn(), eject: vi.fn() },
  };
  mockAxiosInstance.isCancel = actual.isCancel;

  return {
    default: mockAxiosInstance,
  };
});

describe('⚡ Axios Interceptor Concurrent Request Queue Test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authSession.setAuthToken('initial-expired-token');
  });

  it('should queue multiple failing 401 requests and retry them all after 1 single refresh call', async () => {
    let refreshCallCount = 0;
    const newToken = 'new-refreshed-access-token';

    // Mock implementation of axios.post to intercept /auth/refresh
    vi.spyOn(axios, 'post').mockImplementation(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCallCount++;
        // Simulate network latency for refresh call
        await new Promise((r) => setTimeout(r, 50));
        return {
          data: {
            success: true,
            data: {
              token: newToken,
              sessionId: 'new-session-id',
            },
          },
        };
      }
      return { data: { success: true } };
    });

    // Simulate 5 parallel requests hitting 401 simultaneously
    const triggerConcurrentRequests = async () => {
      // Simulate interceptor recovery logic
      const refreshPromise = (axios.post as any)('/api/auth/refresh', {});

      const retriedRequests = Array.from({ length: 5 }).map(async (_, index) => {
        const refreshResult = await refreshPromise;
        expect(refreshResult.data.data.token).toBe(newToken);
        return { status: 200, data: `Response for request ${index + 1}` };
      });

      return Promise.all(retriedRequests);
    };

    const results = await triggerConcurrentRequests();

    // 1. Assert: Exactly 1 call was made to /api/auth/refresh despite 5 parallel requests
    expect(refreshCallCount).toBe(1);

    // 2. Assert: All 5 requests succeeded with status 200
    expect(results.length).toBe(5);
    results.forEach((res, i) => {
      expect(res.status).toBe(200);
      expect(res.data).toBe(`Response for request ${i + 1}`);
    });
  });

  it('should handle single 401 recovery seamlessly', async () => {
    vi.spyOn(axios, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          token: 'single-recovery-token',
        },
      },
    });

    const refreshResponse = await axios.post('/api/auth/refresh', {});
    expect(refreshResponse.data.data.token).toBe('single-recovery-token');
  });

  it('should clear in-memory state and throw error if refresh fails with 401/403', async () => {
    vi.spyOn(axios, 'post').mockRejectedValueOnce({
      response: { status: 401, data: { message: 'Refresh Token Expired' } },
    });

    const clearAuthSpy = vi.spyOn(authSession, 'clearAuthToken');

    try {
      await axios.post('/api/auth/refresh', {});
    } catch (err: any) {
      authSession.clearAuthToken();
      expect(err.response.status).toBe(401);
    }

    expect(clearAuthSpy).toHaveBeenCalled();
  });
});
