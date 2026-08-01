import React, { useState, useRef, useEffect, useMemo } from 'react';
import VideoPlayer from '../../../../components/ui/video-player';
import { Button } from '../../../../components/ui/Button';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useVaultStore } from '../../../../store/vaultStore';
import { cn } from '../../../../lib/utils';
import {
  describeVaultPreviewError,
  getVaultItemPreviewRevision,
  getVaultItemPreviewUrl,
  vaultItemHasServerFileReference,
} from '../../../../lib/filePreview';
import { VaultItem } from '../../../../lib/storage';
import { getHlsPlaylistUrl, getSignedUrl } from '../../../../lib/sync';

interface SafeMediaProps {
  item: VaultItem;
  masterKey: string | CryptoKey;
  type: 'photo' | 'video';
  className?: string;
  isThumbnail?: boolean;
  autoPlayVideo?: boolean;
  lowDataMode?: boolean;
  networkAwareAutoplay?: boolean;
  performanceHud?: boolean;
}

type Heic2AnyFn = (options: {
  blob: Blob;
  toType?: string;
  quality?: number;
}) => Promise<Blob | Blob[]>;

function safeRevoke(url: string | null | undefined) {
  if (url?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

let heic2anyLoader: Promise<Heic2AnyFn> | null = null;

const loadHeic2any = async (): Promise<Heic2AnyFn> => {
  if (!heic2anyLoader) {
    heic2anyLoader = import('heic2any').then((mod) => mod.default as Heic2AnyFn);
  }
  return heic2anyLoader;
};

type IdleDeadlineLike = { timeRemaining: () => number; didTimeout: boolean };
type WindowWithIdle = Window & {
  requestIdleCallback?: (
    callback: (deadline: IdleDeadlineLike) => void,
    options?: { timeout: number }
  ) => number;
  cancelIdleCallback?: (id: number) => void;
};

const HLS_WARM_CACHE_MAX = 3;
const hlsWarmCache = new Map<string, string>();
const PREVIEW_REQUEST_TIMEOUT_MS = 10000;
const HLS_READY_WAIT_MAX_MS = 30000;
const HLS_READY_RETRY_DELAY_MS = 3000;

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutErrorMessage: string
): Promise<T> => {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutErrorMessage)), timeoutMs)
    ),
  ]);
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const touchWarmCache = (key: string, url: string) => {
  if (hlsWarmCache.has(key)) {
    hlsWarmCache.delete(key);
  }
  hlsWarmCache.set(key, url);
  if (hlsWarmCache.size > HLS_WARM_CACHE_MAX) {
    const oldest = hlsWarmCache.keys().next().value;
    if (oldest) hlsWarmCache.delete(oldest);
  }
};

const getWarmHlsUrl = (itemId: string): string | null => {
  const cached = hlsWarmCache.get(itemId);
  if (!cached) return null;
  touchWarmCache(itemId, cached);
  return cached;
};

const normalizePhotoPreviewUrl = async (
  sourceUrl: string,
  isHeicMime: boolean,
  signal?: AbortSignal
): Promise<string> => {
  if (!sourceUrl) {
    return sourceUrl;
  }

  // Convert data URLs into Blob URLs to avoid giant in-memory strings in <img src>.
  if (sourceUrl.startsWith('data:')) {
    const response = await fetch(sourceUrl, { signal });
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }

  if (!isHeicMime) {
    return sourceUrl;
  }

  // HEIC/HEIF needs conversion for cross-browser rendering.
  const response = await fetch(sourceUrl, { signal });
  if (!response.ok) {
    throw new Error(`Preview fetch failed (${response.status})`);
  }
  const blob = await response.blob();

  try {
    const heic2any = await loadHeic2any();
    const convertedBlob = await heic2any({
      blob,
      toType: 'image/jpeg',
      quality: 0.85,
    });
    const jpegBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
    return URL.createObjectURL(jpegBlob);
  } catch {
    // If conversion fails due to CSP/worker/browser limits, let browser try native HEIC.
    return sourceUrl;
  }
};

export const SafeMedia: React.FC<SafeMediaProps> = React.memo(
  ({
    item,
    masterKey,
    type,
    className,
    isThumbnail,
    autoPlayVideo = false,
    lowDataMode = false,
    networkAwareAutoplay = true,
    performanceHud = false,
  }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [isNearViewport, setIsNearViewport] = useState(!isThumbnail);
    const managedBlobRef = useRef<string | null>(null);
    const mediaElementRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
    const itemRef = useRef(item);
    itemRef.current = item;
    const rsaKeyPair = useVaultStore((state) => state.rsaKeyPair);

    const mimeType = item.metadata?.mimeType ?? '';
    const isHeicMime =
      mimeType === 'image/heic' ||
      mimeType === 'image/heif' ||
      item.title?.toLowerCase().endsWith('.heic') ||
      item.title?.toLowerCase().endsWith('.heif');

    const previewRevision = useMemo(
      () => getVaultItemPreviewRevision(item),
      [
        item.id,
        item.updatedAt,
        item.content instanceof Uint8Array ? item.content.byteLength : 0,
        typeof item.content === 'string' ? item.content.length : 0,
        mimeType,
      ]
    );

    const hasServerFile = vaultItemHasServerFileReference(itemRef.current);

    const handleRefresh = () => {
      safeRevoke(managedBlobRef.current);
      managedBlobRef.current = null;
      setUrl(null);
      setErrorMessage(null);
      setIsLoading(true);
      setRefreshTrigger((prev) => prev + 1);
    };

    useEffect(() => {
      if (!isThumbnail) {
        return;
      }

      const target = mediaElementRef.current;
      if (!target || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
        setIsNearViewport(true);
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting) {
            setIsNearViewport(true);
            observer.disconnect();
          }
        },
        { rootMargin: '320px 0px', threshold: 0.01 }
      );

      observer.observe(target);
      return () => observer.disconnect();
    }, [isThumbnail, item.id]);

    useEffect(() => {
      if (isThumbnail && !isNearViewport) {
        return;
      }

      let cancelled = false;
      const abortController = new AbortController();

      const setManagedBlob = (next: string | null) => {
        const resolved = next?.startsWith('blob:') ? next : null;
        if (managedBlobRef.current && managedBlobRef.current !== resolved) {
          safeRevoke(managedBlobRef.current);
        }
        managedBlobRef.current = resolved;
      };

      const run = async () => {
        setIsLoading(true);
        setErrorMessage(null);

        try {
          const current = itemRef.current;

          if (hasServerFile) {
            if (type === 'video') {
              const cached = getWarmHlsUrl(current.id);
              if (cached) {
                if (cancelled) return;
                setManagedBlob(null);
                setUrl(cached);
                setIsLoading(false);
                return;
              }

              const hlsStart = Date.now();
              let hlsUrl: string | null = null;
              while (!hlsUrl && !cancelled) {
                try {
                  hlsUrl = await withTimeout(getHlsPlaylistUrl(current.id), 3500, 'HLS_TIMEOUT');
                } catch {
                  const waited = Date.now() - hlsStart;
                  if (waited >= HLS_READY_WAIT_MAX_MS) {
                    break;
                  }
                  await sleep(HLS_READY_RETRY_DELAY_MS);
                }
              }

              if (!hlsUrl) {
                // If HLS is still not ready, fallback to direct signed playback URL.
                hlsUrl = await withTimeout(
                  getSignedUrl(current.id, 'view'),
                  PREVIEW_REQUEST_TIMEOUT_MS,
                  'SIGNED_URL_TIMEOUT'
                );
              }

              if (cancelled) return;
              touchWarmCache(current.id, hlsUrl);
              setManagedBlob(null);
              setUrl(hlsUrl);
              return;
            }
            const signedUrl = await withTimeout(
              getSignedUrl(current.id, 'view'),
              PREVIEW_REQUEST_TIMEOUT_MS,
              'SIGNED_URL_TIMEOUT'
            );
            if (cancelled) return;
            const displayUrl = await normalizePhotoPreviewUrl(
              signedUrl,
              isHeicMime,
              abortController.signal
            );
            if (cancelled) {
              safeRevoke(displayUrl.startsWith('blob:') ? displayUrl : null);
              return;
            }
            setManagedBlob(displayUrl);
            setUrl(displayUrl);
            return;
          }

          const result = await withTimeout(
            getVaultItemPreviewUrl(
              current,
              masterKey,
              mimeType || undefined,
              rsaKeyPair?.privateKey ?? undefined
            ),
            PREVIEW_REQUEST_TIMEOUT_MS,
            'DECRYPT_PREVIEW_TIMEOUT'
          );
          if (!result) {
            throw new Error('Could not decrypt media for preview.');
          }

          const displayUrl =
            type === 'photo'
              ? await normalizePhotoPreviewUrl(result, isHeicMime, abortController.signal)
              : result;

          if (cancelled) {
            safeRevoke(displayUrl.startsWith('blob:') ? displayUrl : null);
            return;
          }

          setManagedBlob(displayUrl);
          setUrl(displayUrl);
        } catch (e: any) {
          const isAlreadyReadableError =
            e?.code === 1 &&
            typeof e?.message === 'string' &&
            e.message.toLowerCase().includes('already browser readable');

          if (isAlreadyReadableError && itemRef.current.content instanceof Uint8Array) {
            const fallbackUrl = URL.createObjectURL(
              new Blob([new Uint8Array(itemRef.current.content)], {
                type: mimeType || 'application/octet-stream',
              })
            );
            if (!cancelled) {
              setManagedBlob(fallbackUrl);
              setUrl(fallbackUrl);
              setErrorMessage(null);
              return;
            }
            safeRevoke(fallbackUrl);
            return;
          }

          if (!cancelled) {
            console.error('[SafeMedia]', e);
            setErrorMessage(describeVaultPreviewError(e));
          }
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      };

      let idleId: number | null = null;
      const win = window as WindowWithIdle;
      if (isThumbnail && win.requestIdleCallback) {
        idleId = win.requestIdleCallback(
          () => {
            void run();
          },
          { timeout: 500 }
        );
      } else if (isThumbnail) {
        const timeoutId = window.setTimeout(() => {
          void run();
        }, 80);
        return () => {
          cancelled = true;
          clearTimeout(timeoutId);
          safeRevoke(managedBlobRef.current);
          managedBlobRef.current = null;
        };
      } else {
        void run();
      }

      return () => {
        cancelled = true;
        abortController.abort();
        if (idleId !== null && win.cancelIdleCallback) {
          win.cancelIdleCallback(idleId);
        }
        safeRevoke(managedBlobRef.current);
        managedBlobRef.current = null;
      };
    }, [
      hasServerFile,
      masterKey,
      mimeType,
      previewRevision,
      refreshTrigger,
      rsaKeyPair?.privateKey,
      type,
      isHeicMime,
      isThumbnail,
      isNearViewport,
    ]);

    const onImgError = () => {
      if (isHeicMime) {
        setErrorMessage(
          'HEIC preview is not supported in this browser. Use download to view or convert this file.'
        );
        return;
      }
      setErrorMessage('Image failed to load. Use Try again or download the file.');
    };

    if (isLoading) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-white/5 animate-pulse">
          <Loader2 className="h-6 w-6 animate-spin text-text/20" />
        </div>
      );
    }

    if (errorMessage) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center bg-red-400/10 p-4 text-center gap-3">
          <AlertTriangle className="mb-2 h-6 w-6 text-red-400/60" />
          <span className="text-[10px] font-medium text-red-400/80 leading-tight">
            {errorMessage}
          </span>
          <Button
            onClick={handleRefresh}
            size="sm"
            className="mt-2 bg-red-400/20 hover:bg-red-400/30 text-red-300 border border-red-400/30"
          >
            Try again
          </Button>
        </div>
      );
    }

    if (!url) {
      if (isThumbnail && !isNearViewport) {
        return (
          <div
            ref={mediaElementRef as React.RefObject<HTMLDivElement>}
            className={cn(className, 'bg-white/5')}
            aria-hidden="true"
          />
        );
      }
      return (
        <div className="flex h-full w-full items-center justify-center bg-white/5 animate-pulse">
          <Loader2 className="h-6 w-6 animate-spin text-text/20" />
        </div>
      );
    }

    if (type === 'photo') {
      return (
        <img
          ref={mediaElementRef as React.RefObject<HTMLImageElement>}
          src={url}
          loading="lazy"
          decoding="async"
          fetchPriority={isThumbnail ? 'low' : 'high'}
          className={cn(className, isThumbnail ? 'pointer-events-none' : '')}
          alt={item.title || 'Vault image'}
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          onError={onImgError}
        />
      );
    }

    if (type === 'video') {
      if (isThumbnail) {
        return (
          <video
            ref={mediaElementRef as React.RefObject<HTMLVideoElement>}
            src={url}
            className={cn(className, 'pointer-events-none')}
            muted
            playsInline
            preload="metadata"
            aria-label="Video thumbnail"
          />
        );
      }

      return (
        <div className={cn(className, 'relative')}>
          <VideoPlayer
            src={url}
            itemId={item.id}
            title={item.title}
            autoPlay={autoPlayVideo}
            lowDataMode={lowDataMode}
            networkAwareAutoplay={networkAwareAutoplay}
            showPerformanceHud={performanceHud}
          />
        </div>
      );
    }

    return null;
  }
);
