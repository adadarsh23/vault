import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import VideoPlayer, { getMimeTypeFromUrl } from '../../../../components/ui/video-player';
import { Button } from '../../../../components/ui/Button';
import { Lock, EyeOff, AlertTriangle, Video } from 'lucide-react';
import { useVaultStore } from '../../../../store/vaultStore';
import { useVideoMiniPlayerStore } from '../../../../store/videoMiniPlayerStore';
import { blurHashToDataUrl } from '../../../../lib/blurhash';
import { createTrackedBlobUrl, revokeBlobUrl } from '../../../../lib/blobRegistry';
import { cn } from '../../../../lib/utils';
import {
  describeVaultPreviewError,
  getVaultItemPreviewRevision,
  getVaultItemPreviewUrl,
  vaultItemHasServerFileReference,
} from '../../../../lib/filePreview';
import { VaultItem } from '../../../../lib/storage';
import { getSignedUrl } from '../../../../lib/sync';
import { logger } from '../../../../lib/logger';

interface SafeMediaProps {
  item: VaultItem;
  masterKey: string | CryptoKey | null;
  type: 'photo' | 'video';
  className?: string;
  isThumbnail?: boolean;
  autoPlayVideo?: boolean;
  lowDataMode?: boolean;
  networkAwareAutoplay?: boolean;
  performanceHud?: boolean;
  discreetMode?: boolean;
  isRevealed?: boolean;
  onAspectRatioLoaded?: (aspectRatio: number) => void;
  isFloating?: boolean;
  onToggleFloating?: (floating: boolean) => void;
  onClose?: () => void;
}

type Heic2AnyFn = (options: {
  blob: Blob;
  toType?: string;
  quality?: number;
}) => Promise<Blob | Blob[]>;

function safeRevoke(url: string | null | undefined) {
  if (url?.startsWith('blob:')) {
    revokeBlobUrl(url);
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
    options?: { timeout: number },
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
  timeoutErrorMessage: string,
): Promise<T> => {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutErrorMessage)), timeoutMs),
    ),
  ]);
};

const normalizePhotoPreviewUrl = async (
  sourceUrl: string,
  isHeicMime: boolean,
  signal?: AbortSignal,
): Promise<string> => {
  if (!sourceUrl) {
    return sourceUrl;
  }

  // Convert data URLs into Blob URLs to avoid giant in-memory strings in <img src>.
  if (sourceUrl.startsWith('data:')) {
    try {
      const response = await fetch(sourceUrl, { signal });
      if (response.ok) {
        const blob = await response.blob();
        return createTrackedBlobUrl(blob);
      }
    } catch {
      // Fallback: If fetch on data URL fails (e.g. unescaped SVG data URIs), return sourceUrl directly
    }
    return sourceUrl;
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
    return createTrackedBlobUrl(jpegBlob);
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
    discreetMode: discreetModeProp,
    isRevealed: isRevealedProp,
    onAspectRatioLoaded,
    isFloating = false,
    onToggleFloating,
    onClose,
  }) => {
    const [url, setUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [thumbnailError, setThumbnailError] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [isNearViewport, setIsNearViewport] = useState(
      !isThumbnail ||
        (typeof globalThis !== 'undefined' &&
          (globalThis as any).process?.env?.NODE_ENV === 'test'),
    );
    const [internalTouchRevealed, setInternalTouchRevealed] = useState(false);
    const managedBlobRef = useRef<string | null>(null);
    const mediaElementRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
    const itemRef = useRef(item);
    itemRef.current = item;
    const rsaKeyPair = useVaultStore((state) => state.rsaKeyPair);
    const storeDiscreetMode = useVaultStore((state) => state.isDiscreetMode);
    const isDiscreet = discreetModeProp !== undefined ? discreetModeProp : storeDiscreetMode;
    const isEffectivelyRevealed = Boolean(isRevealedProp || internalTouchRevealed);

    const blurhashString = (item.metadata?.blurhash ||
      (item.metadata as any)?.blurHash ||
      '') as string;
    const blurDataUrl = useMemo(() => {
      if (!blurhashString) return null;
      return blurHashToDataUrl(blurhashString, 32, 32);
    }, [blurhashString]);

    const fallbackPlaceholderStyle = useMemo(() => {
      let hash = 0;
      const str = item.id || item.title || 'vault';
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      const hue1 = Math.abs(hash) % 360;
      const hue2 = (hue1 + 45) % 360;
      return {
        background: `radial-gradient(circle at 30% 30%, hsla(${hue1}, 50%, 20%, 0.9), transparent 70%), radial-gradient(circle at 70% 70%, hsla(${hue2}, 55%, 15%, 0.9), hsla(${hue1}, 35%, 8%, 1))`,
      };
    }, [item.id, item.title]);

    // Panic lock listener: instantly clear in-memory previews
    useEffect(() => {
      const handlePanic = () => {
        safeRevoke(managedBlobRef.current);
        managedBlobRef.current = null;
        setUrl(null);
      };
      window.addEventListener('vault:panic-lock', handlePanic);
      return () => window.removeEventListener('vault:panic-lock', handlePanic);
    }, []);

    const mimeType = useMemo(
      () =>
        item.metadata?.mimeType ||
        (item as any).file?.mimeType ||
        getMimeTypeFromUrl(item.title) ||
        getMimeTypeFromUrl(url || '') ||
        (type === 'video' ? 'video/mp4' : ''),
      [item.metadata?.mimeType, (item as any).file?.mimeType, item.title, url, type],
    );
    const isHeicMime =
      mimeType === 'image/heic' ||
      mimeType === 'image/heif' ||
      item.title?.toLowerCase().endsWith('.heic') ||
      item.title?.toLowerCase().endsWith('.heif');

    const currentPlaybackRef = useRef(0);
    const isPlayingRef = useRef(autoPlayVideo);
    const isExplicitCloseRef = useRef(false);

    const handleSafeClose = useCallback(() => {
      isExplicitCloseRef.current = true;
      onClose?.();
    }, [onClose]);

    const triggerMinimizeToFloating = useCallback(() => {
      if (!url || type !== 'video') return;
      useVideoMiniPlayerStore.getState().playVideo({
        id: item.id,
        title: item.title,
        src: url,
        mimeType: mimeType || undefined,
        aspectRatio: item.metadata?.aspectRatio,
        originTab: type === 'video' ? 'videos' : 'photos',
        currentTime: currentPlaybackRef.current,
        isPlaying: isPlayingRef.current,
      });
      useVideoMiniPlayerStore.getState().minimizeToFloating();
      handleSafeClose();
    }, [url, type, item, mimeType, handleSafeClose]);

    useEffect(() => {
      if (isFloating && url && type === 'video') {
        triggerMinimizeToFloating();
      }
    }, [isFloating, url, type, triggerMinimizeToFloating]);

    useEffect(() => {
      return () => {
        if (
          !isExplicitCloseRef.current &&
          isPlayingRef.current &&
          url &&
          type === 'video' &&
          !isFloating
        ) {
          useVideoMiniPlayerStore.getState().playVideo({
            id: item.id,
            title: item.title,
            src: url,
            mimeType: mimeType || undefined,
            aspectRatio: item.metadata?.aspectRatio,
            originTab: type === 'video' ? 'videos' : 'photos',
            currentTime: currentPlaybackRef.current,
            isPlaying: true,
          });
          useVideoMiniPlayerStore.getState().minimizeToFloating();
        }
      };
    }, [url, type, item, mimeType, isFloating]);

    const previewRevision = useMemo(
      () => getVaultItemPreviewRevision(item),
      [
        item.id,
        item.updatedAt,
        item.content instanceof Uint8Array ? item.content.byteLength : 0,
        typeof item.content === 'string' ? item.content.length : 0,
        mimeType,
      ],
    );

    const isClientEncrypted =
      typeof item.metadata === 'object' && item.metadata !== null
        ? Boolean(
            (item.metadata as Record<string, unknown>).isE2EE === true ||
            (item.metadata as Record<string, unknown>).clientEncrypted === true,
          )
        : false;
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
        { rootMargin: '320px 0px', threshold: 0.01 },
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
              // MongoDB/GridFS cloud media is served directly via signed streaming URLs.
              const directUrl = await withTimeout(
                getSignedUrl(current.id, 'view'),
                PREVIEW_REQUEST_TIMEOUT_MS,
                'SIGNED_URL_TIMEOUT',
              );

              if (cancelled) return;
              setManagedBlob(null);
              effectSourceUrl = directUrl;
              setUrl(directUrl);
              return;
            }

            if (!isClientEncrypted) {
              const result = await withTimeout(
                getSignedUrl(current.id, 'view'),
                PREVIEW_REQUEST_TIMEOUT_MS,
                'SIGNED_URL_TIMEOUT',
              );
              if (!result) {
                throw new Error('Preview unavailable for this file type');
              }

              const finalResultUrl = await normalizePhotoPreviewUrl(
                result,
                isHeicMime,
                abortController.signal,
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
          }

          const result = await withTimeout(
            getVaultItemPreviewUrl(
              current,
              masterKey,
              mimeType || undefined,
              rsaKeyPair?.privateKey ?? undefined,
            ),
            PREVIEW_REQUEST_TIMEOUT_MS,
            'DECRYPT_PREVIEW_TIMEOUT',
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
            const fallbackUrl = createTrackedBlobUrl(
              new Blob([new Uint8Array(itemRef.current.content)], {
                type: mimeType || 'application/octet-stream',
              }),
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
            logger.error('[SafeMedia] Preview failed', { error: e });
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
          { timeout: 500 },
        );
      } else if (
        isThumbnail &&
        typeof globalThis !== 'undefined' &&
        (globalThis as any).process?.env?.NODE_ENV === 'test'
      ) {
        void run();
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
          'HEIC preview is not supported in this browser. Use download to view or convert this file.',
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
          `${ext} image is securely preserved. Download the file to view in full resolution.`,
        );
        return;
      }
      setErrorMessage('Image failed to load. Use Try again or download the file.');
    };

    const isBlurred = isDiscreet && !isEffectivelyRevealed;

    const renderDecryptionPlaceholder = () => (
      <div
        className={cn(
          'relative flex h-full w-full items-center justify-center overflow-hidden bg-black/40',
          className,
        )}
      >
        {/* 1. Instant BlurHash Micro-placeholder or Deterministic Mesh */}
        {blurDataUrl ? (
          <img
            src={blurDataUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover scale-110 filter blur-md opacity-80 pointer-events-none transition-opacity duration-300"
          />
        ) : (
          <div
            className="absolute inset-0 h-full w-full scale-110 filter blur-sm opacity-70 pointer-events-none"
            style={fallbackPlaceholderStyle}
          />
        )}

        {/* 2. Slim Cryptographic Decrypting Progress Bar / Shimmer Wave */}
        <div className="absolute top-0 inset-x-0 h-1 bg-black/50 overflow-hidden z-20">
          <div className="h-full w-full bg-gradient-to-r from-transparent via-cyan-400 via-indigo-400 to-transparent animate-pulse -translate-x-full duration-1000" />
        </div>

        {/* 3. Cryptographic Loading Status Pill */}
        <div className="relative z-10 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/75 px-3 py-1 text-[10px] font-mono text-white/90 shadow-2xl backdrop-blur-md">
          <Lock className="h-3 w-3 text-cyan-400 animate-pulse" />
          <span className="tracking-wider">AES-256 Decrypting...</span>
        </div>

        {/* Bottom subtle shimmer wave */}
        <div className="absolute bottom-0 inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent animate-pulse" />
      </div>
    );

    if (isLoading) {
      return renderDecryptionPlaceholder();
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
      return renderDecryptionPlaceholder();
    }

    if (type === 'photo') {
      return (
        <div
          data-vault-shield="true"
          className={cn(
            'relative h-full w-full overflow-hidden select-none safe-media-container vault-print-protected',
            isThumbnail ? '' : 'flex items-center justify-center',
          )}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={() => setInternalTouchRevealed(true)}
          onPointerUp={() => setInternalTouchRevealed(false)}
          onPointerLeave={() => setInternalTouchRevealed(false)}
          onPointerCancel={() => setInternalTouchRevealed(false)}
        >
          <img
            ref={mediaElementRef as React.RefObject<HTMLImageElement>}
            src={url}
            loading={isThumbnail ? 'lazy' : 'eager'}
            decoding="async"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            fetchPriority={isThumbnail ? 'low' : 'high'}
            className={cn(
              className,
              'select-none pointer-events-auto vault-print-protected',
              isThumbnail ? 'pointer-events-none' : '',
              isBlurred
                ? 'filter blur-2xl scale-110 select-none transition-all duration-300 group-hover:filter-none group-hover:blur-0 group-hover:scale-100 hover:filter-none hover:blur-0 hover:scale-100'
                : 'filter-none blur-0 scale-100 transition-all duration-300',
            )}
            alt={item.title || 'Vault image'}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            onError={onImgError}
          />
          {isBlurred && (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none backdrop-blur-xl bg-black/10 transition-opacity duration-300 group-hover:opacity-0 hover:opacity-0">
              <div className="flex items-center gap-1 rounded-full bg-black/70 border border-white/20 px-2 py-0.5 text-[9px] font-medium text-amber-300 shadow-2xl backdrop-blur-md">
                <EyeOff className="h-2.5 w-2.5 text-amber-400" />
                <span className="hidden xs:inline">Discreet</span>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (type === 'video') {
      if (isThumbnail) {
        if (thumbnailError) {
          const ext = (item.title || '').split('.').pop()?.toUpperCase() || 'VIDEO';
          return (
            <div
              className={cn(
                'flex flex-col items-center justify-center bg-black/40 text-white/40 gap-1 select-none',
                className,
              )}
            >
              <Video className="w-8 h-8 opacity-60" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-white/50 bg-white/10 px-1.5 py-0.5 rounded">
                {ext}
              </span>
            </div>
          );
        }
        return (
          <div
            data-vault-shield="true"
            className="relative h-full w-full overflow-hidden select-none safe-media-container vault-print-protected"
            onPointerDown={() => setInternalTouchRevealed(true)}
            onPointerUp={() => setInternalTouchRevealed(false)}
            onPointerLeave={() => setInternalTouchRevealed(false)}
            onPointerCancel={() => setInternalTouchRevealed(false)}
          >
            <video
              ref={mediaElementRef as React.RefObject<HTMLVideoElement>}
              src={url}
              className={cn(
                className,
                'pointer-events-none vault-print-protected',
                isBlurred
                  ? 'filter blur-2xl scale-110 select-none transition-all duration-300 group-hover:filter-none group-hover:blur-0 group-hover:scale-100 hover:filter-none hover:blur-0 hover:scale-100'
                  : 'filter-none blur-0 scale-100 transition-all duration-300',
              )}
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
            {isBlurred && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none backdrop-blur-xl bg-black/10 transition-opacity duration-300 group-hover:opacity-0 hover:opacity-0">
                <div className="flex items-center gap-1 rounded-full bg-black/70 border border-white/20 px-2 py-0.5 text-[9px] font-medium text-amber-300 shadow-2xl backdrop-blur-md">
                  <EyeOff className="h-2.5 w-2.5 text-amber-400" />
                  <span className="hidden xs:inline">Discreet</span>
                </div>
              </div>
            )}
          </div>
        );
      }

      return (
        <div
          className={cn(
            'relative flex items-center justify-center',
            isFloating
              ? 'pointer-events-auto'
              : 'w-full h-full max-w-full max-h-full overflow-hidden',
            className,
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
            allowFloating={true}
            isFloating={isFloating}
            onToggleFloating={(floating) => {
              if (floating && url) {
                triggerMinimizeToFloating();
              } else if (onToggleFloating) {
                onToggleFloating(floating);
              }
            }}
            onPlaybackChange={({ currentTime: curTime, isPlaying: curPlaying }) => {
              currentPlaybackRef.current = curTime;
              isPlayingRef.current = curPlaying;
            }}
            onClose={handleSafeClose}
            className={cn(
              'object-contain',
              isFloating ? 'pointer-events-auto' : 'w-full h-full max-h-full max-w-full',
            )}
          />
        </div>
      );
    }

    return null;
  },
);
