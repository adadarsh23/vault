import React, { useState, useRef, useEffect, useMemo } from 'react';
import VideoPlayer from '../../../../components/ui/video-player';
import { Button } from '../../../../components/ui/Button';
import { Loader2, AlertTriangle, Video } from 'lucide-react';
import { useVaultStore } from '../../../../store/vaultStore';
import { cn } from '../../../../lib/utils';
import {
  describeVaultPreviewError,
  getVaultItemPreviewRevision,
  getVaultItemPreviewUrl,
  vaultItemHasServerFileReference,
} from '../../../../lib/filePreview';
import { VaultItem } from '../../../../lib/storage';
import { getSignedUrl } from '../../../../lib/sync';

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
  onAspectRatioLoaded?: (aspectRatio: number) => void;
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

// Atlas GridFS envelope decryption reads large encrypted videos before the
// browser can decrypt them. Do not classify a healthy large-file response as
// a format error after the old 10-second timeout.
const PREVIEW_REQUEST_TIMEOUT_MS = 60000;

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
    onAspectRatioLoaded,
  }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [thumbnailError, setThumbnailError] = useState(false);
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

    const isClientEncrypted =
      typeof item.metadata === 'object' && item.metadata !== null
        ? Boolean(
            (item.metadata as Record<string, unknown>).isE2EE === true ||
            (item.metadata as Record<string, unknown>).clientEncrypted === true
          )
        : false;
    const hasServerFile = !isClientEncrypted && vaultItemHasServerFileReference(itemRef.current);

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
      let effectBlobUrl: string | null = null;
      let effectSourceUrl: string | null = null;

      const setManagedBlob = (next: string | null) => {
        const resolved = next?.startsWith('blob:') ? next : null;
        if (effectBlobUrl && effectBlobUrl !== resolved) {
          safeRevoke(effectBlobUrl);
        }
        effectBlobUrl = resolved;
        managedBlobRef.current = resolved;
      };

      const run = async () => {
        setIsLoading(true);
        setErrorMessage(null);

        try {
          const current = itemRef.current;

          if (hasServerFile) {
            if (type === 'video') {
              // MongoDB/GridFS cloud media is served directly. HLS is only
              // valid when transcoded variant files are actually available.
              const directUrl = await withTimeout(
                getSignedUrl(current.id, 'view'),
                PREVIEW_REQUEST_TIMEOUT_MS,
                'SIGNED_URL_TIMEOUT'
              );

              if (cancelled) return;
              setManagedBlob(null);
              effectSourceUrl = directUrl;
              setUrl(directUrl);
              return;
            }
            const result = await withTimeout(
              getSignedUrl(current.id, 'view'),
              PREVIEW_REQUEST_TIMEOUT_MS,
              'SIGNED_URL_TIMEOUT'
            );
            if (!result) {
              throw new Error('Preview unavailable for this file type');
            }

            const finalResultUrl = await normalizePhotoPreviewUrl(
              result,
              isHeicMime,
              abortController.signal
            );

            // If normalizePhotoPreviewUrl created a new URL, we must revoke the original result to prevent a leak
            if (finalResultUrl !== result && result.startsWith('blob:')) {
              safeRevoke(result);
            }

            if (cancelled) {
              safeRevoke(finalResultUrl.startsWith('blob:') ? finalResultUrl : null);
              return;
            }

            setManagedBlob(finalResultUrl);
            effectSourceUrl = finalResultUrl;
            setUrl(finalResultUrl);
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

          if (displayUrl !== result && result.startsWith('blob:')) {
            safeRevoke(result);
          }

          if (cancelled) {
            safeRevoke(displayUrl.startsWith('blob:') ? displayUrl : null);
            return;
          }

          setManagedBlob(displayUrl);
          effectSourceUrl = displayUrl;
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
              effectSourceUrl = fallbackUrl;
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
          if (effectBlobUrl) safeRevoke(effectBlobUrl);
          setUrl((currentUrl) => (currentUrl === effectSourceUrl ? null : currentUrl));
          if (managedBlobRef.current === effectBlobUrl) managedBlobRef.current = null;
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
        // Do not revoke a URL created by a newer preview effect.
        if (effectBlobUrl) safeRevoke(effectBlobUrl);
        setUrl((currentUrl) => (currentUrl === effectSourceUrl ? null : currentUrl));
        if (managedBlobRef.current === effectBlobUrl) managedBlobRef.current = null;
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
      const ext = (item.title?.split('.').pop() || '').toUpperCase();
      if (isHeicMime) {
        setErrorMessage(
          'HEIC preview is not supported in this browser. Use download to view or convert this file.'
        );
        return;
      }
      const rawOrSpecialized = [
        'PSD',
        'RAW',
        'CR2',
        'CR3',
        'NEF',
        'NRW',
        'ARW',
        'SR2',
        'SRF',
        'RAF',
        'ORF',
        'RW2',
        'PEF',
        'DNG',
        'X3F',
        '3FR',
        'FFF',
        'IIQ',
        'ERF',
        'KDC',
        'MEF',
        'MOS',
        'MRW',
        'RWL',
        'DCR',
        'BAY',
        'GPR',
        'JP2',
        'J2K',
        'JPF',
        'JPM',
        'JXR',
        'HDP',
        'WDP',
        'DDS',
        'EXR',
        'HDR',
        'PIC',
        'PCT',
        'PCX',
        'TGA',
        'ICNS',
        'TIF',
        'TIFF',
      ];
      if (rawOrSpecialized.includes(ext)) {
        setErrorMessage(
          `${ext} image is securely preserved. Download the file to view in full resolution.`
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
          loading={isThumbnail ? 'lazy' : 'eager'}
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
        if (thumbnailError) {
          return (
            <div
              className={cn(
                'flex items-center justify-center bg-black/40 text-white/40',
                className
              )}
            >
              <Video className="w-8 h-8 opacity-60" />
            </div>
          );
        }
        return (
          <video
            ref={mediaElementRef as React.RefObject<HTMLVideoElement>}
            src={url}
            className={cn(className, 'pointer-events-none')}
            muted
            playsInline
            preload="metadata"
            aria-label="Video thumbnail"
            onError={() => setThumbnailError(true)}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth && v.videoHeight && onAspectRatioLoaded) {
                onAspectRatioLoaded(v.videoWidth / v.videoHeight);
              }
            }}
          />
        );
      }

      return (
        <div
          className={cn(
            'relative flex items-center justify-center w-full h-full max-w-full max-h-full',
            className
          )}
        >
          <VideoPlayer
            src={url}
            mimeType={mimeType || undefined}
            itemId={item.id}
            title={item.title}
            aspectRatio={item.metadata?.aspectRatio}
            autoPlay={autoPlayVideo}
            lowDataMode={lowDataMode}
            networkAwareAutoplay={networkAwareAutoplay}
            showPerformanceHud={performanceHud}
            allowDownload={true}
            className="w-full h-full"
          />
        </div>
      );
    }

    return null;
  }
);
