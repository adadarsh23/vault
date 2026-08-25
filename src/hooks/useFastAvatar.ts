// useFastAvatar.ts
// React Hook for high-performance zero-jank offline-first profile photo ingestion and upload

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ImageProcessorResponse } from '../workers/ImageProcessorWorker';
import {
  queueOfflineAvatar,
  getPendingAvatars,
  removeQueuedAvatar,
  registerAvatarSync,
} from '../lib/avatarDb';

// Isolated Registry for Blob Lifecycle Revocation to guarantee zero memory leaks
class BlobLifecycleRegistry {
  private static activeUrls = new Set<string>();
  private static blobMap = new WeakMap<Blob, string>();

  public static createTrackedUrl(blob: Blob): string {
    const existing = this.blobMap.get(blob);
    if (existing) return existing;

    const url = URL.createObjectURL(blob);
    this.activeUrls.add(url);
    this.blobMap.set(blob, url);
    return url;
  }

  public static revokeTrackedUrl(url: string | null | undefined): void {
    if (!url || !url.startsWith('blob:')) return;
    if (this.activeUrls.has(url)) {
      URL.revokeObjectURL(url);
      this.activeUrls.delete(url);
    }
  }

  public static cleanupAll(): void {
    this.activeUrls.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    this.activeUrls.clear();
  }
}

export interface FastAvatarOptions {
  userId: string;
  initialAvatarUrl?: string | null;
  initialBlurHash?: string | null;
  presignEndpoint?: string; // default '/api/avatar/presign'
  onUploadSuccess?: (avatarUrl: string, blurHash: string) => void;
  onUploadError?: (error: Error) => void;
}

export interface FastAvatarState {
  avatarUrl: string | null;
  blurHash: string | null;
  isProcessing: boolean;
  isUploading: boolean;
  isOfflineQueued: boolean;
  error: string | null;
}

export function useFastAvatar({
  userId,
  initialAvatarUrl = null,
  initialBlurHash = null,
  presignEndpoint = '/api/avatar/presign',
  onUploadSuccess,
  onUploadError,
}: FastAvatarOptions) {
  const [state, setState] = useState<FastAvatarState>({
    avatarUrl: initialAvatarUrl,
    blurHash: initialBlurHash,
    isProcessing: false,
    isUploading: false,
    isOfflineQueued: false,
    error: null,
  });

  const workerRef = useRef<Worker | null>(null);
  const activeBlobUrlRef = useRef<string | null>(null);
  const previousAvatarUrlRef = useRef<string | null>(initialAvatarUrl);

  const onUploadSuccessRef = useRef(onUploadSuccess);
  const onUploadErrorRef = useRef(onUploadError);

  useEffect(() => {
    onUploadSuccessRef.current = onUploadSuccess;
    onUploadErrorRef.current = onUploadError;
  }, [onUploadSuccess, onUploadError]);

  // Sync avatar state when initialAvatarUrl prop updates externally
  useEffect(() => {
    if (!state.isProcessing && !state.isUploading) {
      setState((prev) => {
        if (prev.avatarUrl !== initialAvatarUrl) {
          return { ...prev, avatarUrl: initialAvatarUrl ?? null, error: null };
        }
        return prev;
      });
    }
  }, [initialAvatarUrl, state.isProcessing, state.isUploading]);

  // Initialize Web Worker
  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/ImageProcessorWorker.ts', import.meta.url), {
      type: 'module',
    });

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // Cleanup ObjectURLs on unmount
  useEffect(() => {
    return () => {
      if (activeBlobUrlRef.current) {
        BlobLifecycleRegistry.revokeTrackedUrl(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
      }
    };
  }, []);

  // Helper for computing WebCrypto SHA-256 hash
  const computeHash = useCallback(async (buffer: ArrayBuffer): Promise<string> => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16);
  }, []);

  // Process offline queued avatars when network reconnects
  const syncOfflineQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const pending = await getPendingAvatars(userId);
      for (const item of pending) {
        try {
          const presignRes = await fetch(presignEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: item.userId,
              contentHash: item.contentHash,
              mimeType: item.mimeType,
            }),
          });

          if (!presignRes.ok) continue;
          const { uploadUrl, publicUrl } = await presignRes.json();

          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': item.mimeType,
              'Content-Length': item.blob.size.toString(),
            },
            body: item.blob,
          });

          if (uploadRes.ok) {
            await removeQueuedAvatar(item.id);
            setState((prev) => ({
              ...prev,
              avatarUrl: publicUrl,
              isOfflineQueued: false,
            }));
            if (onUploadSuccess) onUploadSuccess(publicUrl, item.blurHash);
          }
        } catch {
          // Keep item in queue for next sync attempt
        }
      }
    } catch {
      // Ignore database read errors
    }
  }, [userId, presignEndpoint, onUploadSuccess]);

  // Listen for online events
  useEffect(() => {
    window.addEventListener('online', syncOfflineQueue);
    return () => window.removeEventListener('online', syncOfflineQueue);
  }, [syncOfflineQueue]);

  /**
   * Main Ingestion & Upload Handler
   */
  const processAndUploadAvatar = useCallback(
    async (file: File) => {
      if (!file) return;

      previousAvatarUrlRef.current = state.avatarUrl;
      setState((prev) => ({
        ...prev,
        isProcessing: true,
        error: null,
      }));

      try {
        // Read file into ArrayBuffer for worker transfer
        const fileBuffer = await file.arrayBuffer();

        if (!workerRef.current) {
          throw new Error('ImageProcessorWorker is not initialized.');
        }

        const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        // Promise wrapper for worker message
        const processedResult = await new Promise<Extract<ImageProcessorResponse, { ok: true }>>(
          (resolve, reject) => {
            const worker = workerRef.current;
            if (!worker) return reject(new Error('Worker unavailable'));

            const handleMessage = (event: MessageEvent<ImageProcessorResponse>) => {
              const data = event.data;
              if (data.id === requestId) {
                worker.removeEventListener('message', handleMessage);
                if (data.ok) {
                  resolve(data);
                } else {
                  reject(new Error(data.error));
                }
              }
            };

            worker.addEventListener('message', handleMessage);

            // Zero-copy postMessage transfer of fileBuffer
            worker.postMessage(
              {
                id: requestId,
                type: 'PROCESS_IMAGE',
                fileBuffer,
                fileName: file.name,
                mimeType: file.type,
                targetSize: 400,
                quality: 0.78,
              },
              [fileBuffer],
            );
          },
        );

        // Create Blob from zero-copy ArrayBuffer
        const processedBlob = new Blob([processedResult.buffer], {
          type: processedResult.mimeType,
        });

        // Revoke previous optimistic Blob URL if active
        if (activeBlobUrlRef.current) {
          BlobLifecycleRegistry.revokeTrackedUrl(activeBlobUrlRef.current);
        }

        // Generate tracked optimistic preview ObjectURL
        const optimisticUrl = BlobLifecycleRegistry.createTrackedUrl(processedBlob);
        activeBlobUrlRef.current = optimisticUrl;

        // Instant Sub-50ms Perceived Latency Update
        setState((prev) => ({
          ...prev,
          avatarUrl: optimisticUrl,
          blurHash: processedResult.blurHash,
          isProcessing: false,
          isUploading: true,
        }));

        // Calculate content-based hash for immutable CDN cache key
        const contentHash = await computeHash(processedResult.buffer);

        // Check Network status: If offline, queue in IndexedDB
        if (!navigator.onLine) {
          await queueOfflineAvatar({
            id: requestId,
            userId,
            contentHash,
            blob: processedBlob,
            mimeType: processedResult.mimeType,
            blurHash: processedResult.blurHash,
            timestamp: Date.now(),
          });

          await registerAvatarSync();

          setState((prev) => ({
            ...prev,
            isUploading: false,
            isOfflineQueued: true,
          }));
          return;
        }

        // Direct S3 Presigned PUT Upload Pipeline
        const presignRes = await fetch(presignEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            contentHash,
            mimeType: processedResult.mimeType,
          }),
        });

        if (!presignRes.ok) {
          throw new Error(`Failed to request presigned upload URL (${presignRes.status}).`);
        }

        const { uploadUrl, publicUrl } = await presignRes.json();

        // Binary Stream Direct Upload with Content-Length header
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': processedResult.mimeType,
            'Content-Length': processedBlob.size.toString(),
          },
          body: processedBlob,
        });

        if (!uploadRes.ok) {
          throw new Error(`Direct binary upload failed (${uploadRes.status}).`);
        }

        // Revoke temporary optimistic blob URL since CDN public URL is ready
        if (activeBlobUrlRef.current) {
          BlobLifecycleRegistry.revokeTrackedUrl(activeBlobUrlRef.current);
          activeBlobUrlRef.current = null;
        }

        setState((prev) => ({
          ...prev,
          avatarUrl: publicUrl,
          isUploading: false,
          isOfflineQueued: false,
        }));

        if (onUploadSuccessRef.current) {
          onUploadSuccessRef.current(publicUrl, processedResult.blurHash);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Avatar ingestion failed.');

        // Rollback state on unrecoverable processing error
        setState((prev) => ({
          ...prev,
          avatarUrl: previousAvatarUrlRef.current,
          isProcessing: false,
          isUploading: false,
          error: error.message,
        }));

        if (onUploadErrorRef.current) {
          onUploadErrorRef.current(error);
        }
      }
    },
    [userId, state.avatarUrl, presignEndpoint, computeHash],
  );

  return {
    ...state,
    processAndUploadAvatar,
    syncOfflineQueue,
  };
}
