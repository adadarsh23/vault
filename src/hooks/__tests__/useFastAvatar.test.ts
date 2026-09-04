/* @vitest-environment jsdom */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useFastAvatar } from '../useFastAvatar';
import * as avatarDb from '../../lib/avatarDb';

vi.mock('../../lib/avatarDb', () => ({
  queueOfflineAvatar: vi.fn().mockResolvedValue(undefined),
  getPendingAvatars: vi.fn().mockResolvedValue([]),
  removeQueuedAvatar: vi.fn().mockResolvedValue(undefined),
  registerAvatarSync: vi.fn().mockResolvedValue(true),
}));

if (typeof window !== 'undefined') {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-avatar-preview');
  window.URL.revokeObjectURL = vi.fn();
}
if (typeof globalThis.URL !== 'undefined') {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-avatar-preview');
  globalThis.URL.revokeObjectURL = vi.fn();
}

describe('useFastAvatar Hook - Production Readiness Suite', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });
  });

  it('initializes with default props accurately', () => {
    const { result } = renderHook(() =>
      useFastAvatar({
        userId: 'user_123',
        initialAvatarUrl: 'https://cdn.example.com/avatar.png',
        initialBlurHash: 'LEHLk~WB2yk8pyo0adR*.7kCMdnj',
      }),
    );

    expect(result.current.avatarUrl).toBe('https://cdn.example.com/avatar.png');
    expect(result.current.blurHash).toBe('LEHLk~WB2yk8pyo0adR*.7kCMdnj');
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.isUploading).toBe(false);
    expect(result.current.uploadProgress).toBe(0);
    expect(result.current.isOfflineQueued).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('synchronizes avatar state when initialAvatarUrl changes externally', () => {
    let currentInitialUrl = 'https://cdn.example.com/old.png';

    const { result, rerender } = renderHook(() =>
      useFastAvatar({
        userId: 'user_123',
        initialAvatarUrl: currentInitialUrl,
      }),
    );

    expect(result.current.avatarUrl).toBe('https://cdn.example.com/old.png');

    currentInitialUrl = 'https://cdn.example.com/new.png';
    rerender();

    expect(result.current.avatarUrl).toBe('https://cdn.example.com/new.png');
  });

  it('resets error state cleanly via resetError()', () => {
    const { result } = renderHook(() =>
      useFastAvatar({
        userId: 'user_123',
      }),
    );

    act(() => {
      result.current.resetError();
    });

    expect(result.current.error).toBeNull();
  });

  it('handles cancelUpload without crashing and reverts state', () => {
    const { result } = renderHook(() =>
      useFastAvatar({
        userId: 'user_123',
        initialAvatarUrl: 'https://cdn.example.com/original.png',
      }),
    );

    act(() => {
      result.current.cancelUpload();
    });

    expect(result.current.avatarUrl).toBe('https://cdn.example.com/original.png');
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.isUploading).toBe(false);
    expect(result.current.uploadProgress).toBe(0);
  });

  it('queues avatar offline when navigator.onLine is false', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
      writable: true,
    });

    try {
      const { result } = renderHook(() =>
        useFastAvatar({
          userId: 'user_offline_test',
          presignEndpoint: '/api/avatar/presign',
        }),
      );

      const dummyFile = new File(['fake-image-data'], 'test.png', { type: 'image/png' });

      await act(async () => {
        await result.current.processAndUploadAvatar(dummyFile);
      });

      expect(avatarDb.queueOfflineAvatar).toHaveBeenCalled();
      expect(result.current.isOfflineQueued).toBe(true);
      expect(result.current.isUploading).toBe(false);
    } finally {
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true,
        writable: true,
      });
    }
  });

  it('synchronizes offline queue on demand or when coming back online', async () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });

    const mockPending = [
      {
        id: 'queued_1',
        userId: 'user_offline_test',
        contentHash: 'abc123hash',
        blob: new Blob(['data'], { type: 'image/webp' }),
        mimeType: 'image/webp',
        blurHash: 'LEHLk~WB2yk8pyo0adR*.7kCMdnj',
        timestamp: Date.now(),
        retryCount: 0,
      },
    ];

    vi.mocked(avatarDb.getPendingAvatars).mockResolvedValue(mockPending);

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/presign')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              uploadUrl: 'https://s3.example.com/upload-target',
              publicUrl: 'https://cdn.example.com/synced-avatar.webp',
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
      });
    });

    globalThis.fetch = mockFetch as any;

    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useFastAvatar({
        userId: 'user_offline_test',
        onUploadSuccess: onSuccess,
      }),
    );

    await act(async () => {
      await result.current.syncOfflineQueue();
    });

    expect(avatarDb.removeQueuedAvatar).toHaveBeenCalledWith('queued_1');
    expect(result.current.avatarUrl).toBe('https://cdn.example.com/synced-avatar.webp');
    expect(result.current.isOfflineQueued).toBe(false);
    expect(onSuccess).toHaveBeenCalledWith(
      'https://cdn.example.com/synced-avatar.webp',
      'LEHLk~WB2yk8pyo0adR*.7kCMdnj',
    );
  });
});
