'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from './Button';
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Loader2,
  Download,
  RefreshCw,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  FlipHorizontal2,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import { getAuthHeaders } from '../../lib/sync';
import { resolveApiBaseUrl } from '../../lib/apiBaseUrl';
import { logger } from '../../lib/logger';
import { toast } from 'sonner';
import Hls from 'hls.js';

/* ---------------- UTIL ---------------- */

const formatTime = (seconds: number) => {
  if (!isFinite(seconds) || isNaN(seconds)) return '00:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

const finiteOrZero = (value: number) => (Number.isFinite(value) ? value : 0);

const isSafeDownloadUrl = (url: string) => {
  if (!url) return false;
  if (url.startsWith('blob:') || url.startsWith('data:')) return true;
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const isAllowedMediaUrl = (url: string, allowedMediaDomains: string[]) => {
  if (!url) return false;
  if (url.startsWith('blob:')) return true;
  if (url.startsWith('data:')) return false;
  try {
    const parsed = new URL(url, window.location.href);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    const normalizedAllowed = allowedMediaDomains.map((domain) => domain.toLowerCase());
    if (host === window.location.hostname.toLowerCase()) return true;
    return normalizedAllowed.includes(host);
  } catch {
    return false;
  }
};

const redactSensitiveString = (value: string) => {
  const bearerLike = /(bearer\s+)[a-z0-9._~-]+/gi;
  let redacted = value.replace(bearerLike, '$1[REDACTED]');
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    if (redacted.length > 240) {
      redacted = `${redacted.slice(0, 240)}...`;
    }
    return redacted;
  }
};

export type PlayerErrorCode =
  | 'SECURITY_POLICY_BLOCKED'
  | 'NETWORK_UNSTABLE'
  | 'MEDIA_DECODE_FAILED'
  | 'UNSUPPORTED_FORMAT'
  | 'PLAYBACK_FAILED';

const PLAYER_ERROR_MESSAGES: Record<PlayerErrorCode, string> = {
  SECURITY_POLICY_BLOCKED: 'Media URL is not allowed by security policy.',
  NETWORK_UNSTABLE: 'Network unstable. Please retry.',
  MEDIA_DECODE_FAILED: 'Video decoding failed. Please retry playback.',
  UNSUPPORTED_FORMAT: 'Video format not supported on this device/browser.',
  PLAYBACK_FAILED: 'Video playback failed.',
};

export const getPlayerErrorMessage = (code: PlayerErrorCode) => PLAYER_ERROR_MESSAGES[code];

export const mapMediaErrorCodeToPlayerError = (mediaErrorCode?: number): PlayerErrorCode => {
  if (mediaErrorCode === 4) return 'UNSUPPORTED_FORMAT';
  if (mediaErrorCode === 3) return 'MEDIA_DECODE_FAILED';
  return 'PLAYBACK_FAILED';
};

type HlsRecoveryAction =
  | { action: 'restart_load'; retryInMs: number; message: string }
  | { action: 'recover_media' }
  | { action: 'downgrade_level'; level: number; message: string }
  | { action: 'fatal_error'; code: PlayerErrorCode };

export const getHlsRecoveryAction = (params: {
  errorType: string;
  networkRetryCount: number;
  mediaRecoveryCount: number;
  currentLevel: number;
}): HlsRecoveryAction => {
  const { errorType, networkRetryCount, mediaRecoveryCount, currentLevel } = params;
  if (errorType === Hls.ErrorTypes.NETWORK_ERROR) {
    if (networkRetryCount <= 5) {
      return {
        action: 'restart_load',
        retryInMs: Math.min(1000 * 2 ** (networkRetryCount - 1), 8000),
        message: `Reconnecting... (${networkRetryCount})`,
      };
    }
    return { action: 'fatal_error', code: 'NETWORK_UNSTABLE' };
  }

  if (errorType === Hls.ErrorTypes.MEDIA_ERROR) {
    if (mediaRecoveryCount <= 2) {
      return { action: 'recover_media' };
    }
    if (currentLevel > 0) {
      return {
        action: 'downgrade_level',
        level: currentLevel - 1,
        message: 'Reducing quality to recover playback...',
      };
    }
    return { action: 'fatal_error', code: 'MEDIA_DECODE_FAILED' };
  }

  return { action: 'fatal_error', code: 'PLAYBACK_FAILED' };
};

export const sanitizeTelemetryMetadata = (input: unknown): unknown => {
  if (typeof input === 'string') return redactSensitiveString(input);
  if (Array.isArray(input)) return input.map((entry) => sanitizeTelemetryMetadata(entry));
  if (input && typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>).map(([key, value]) => {
      if (
        typeof value === 'string' &&
        ['url', 'src', 'uri', 'href', 'token', 'authorization'].includes(key.toLowerCase())
      ) {
        return [key, redactSensitiveString(value)] as const;
      }
      return [key, sanitizeTelemetryMetadata(value)] as const;
    });
    return Object.fromEntries(entries);
  }
  return input;
};

/* ---------------- UNIVERSAL SLIDER (MOBILE + DESKTOP) ---------------- */

const CustomSlider = ({
  value,
  onChange,
  onDragStart,
  onDragEnd,
  className,
  label,
  thumbClassName,
}: {
  value: number;
  onChange: (value: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  className?: string;
  label: string;
  thumbClassName?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const getPercent = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = clientX - rect.left;
    return Math.min(Math.max((x / rect.width) * 100, 0), 100);
  };

  const update = (clientX: number) => {
    onChange(getPercent(clientX));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    onDragStart?.();
    update(e.clientX);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    update(e.clientX);
  };

  const onPointerUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    onDragEnd?.();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      onChange(Math.min(100, value + step));
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      onChange(Math.max(0, value - step));
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      onChange(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      onChange(100);
    }
  };

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${Math.round(value)}%`}
      tabIndex={0}
      className={cn(
        'relative w-full h-2 sm:h-1.5 rounded-full cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-white/50 bg-white/25 overflow-visible',
        className
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute top-0 left-0 h-full bg-white rounded-full"
        style={{ width: `${value}%` }}
      />
      {/* Thumb for better touch target/visibility */}
      <div
        className={cn(
          'absolute z-[2] top-1/2 h-3 w-3 rounded-full bg-white shadow-lg ring-1 ring-black/25 transition-opacity opacity-100 sm:opacity-90',
          thumbClassName
        )}
        style={{
          left: `${value}%`,
          transform: `translate(-50%, -50%)`,
        }}
      />
    </div>
  );
};

/* ---------------- VIDEO PLAYER ---------------- */

const VideoPlayer = ({
  src,
  itemId,
  title,
  className,
  style,
  aspectRatio,
  autoPlay = false,
  lowDataMode = false,
  networkAwareAutoplay = true,
  showPerformanceHud = false,
  allowDownload = true,
  allowPiP = true,
  allowFullscreen = true,
  allowSpeedChange = true,
  allowedMediaDomains = [],
}: {
  src: string;
  itemId?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  aspectRatio?: number | string;
  autoPlay?: boolean;
  lowDataMode?: boolean;
  networkAwareAutoplay?: boolean;
  showPerformanceHud?: boolean;
  allowDownload?: boolean;
  allowPiP?: boolean;
  allowFullscreen?: boolean;
  allowSpeedChange?: boolean;
  allowedMediaDomains?: string[];
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  // const isInitialMount = useRef(true) // Removed unused variable

  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [qualityOptions, setQualityOptions] = useState<{ index: number; label: string }[]>([
    { index: -1, label: 'Auto' },
  ]);
  const [selectedQualityIndex, setSelectedQualityIndex] = useState(-1);
  const [currentQualityLabel, setCurrentQualityLabel] = useState<string>('Auto');

  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState<{
    width: number;
    height: number;
    aspectRatio: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnectMessage, setReconnectMessage] = useState<string | null>(null);
  const [useLiteSkeleton, setUseLiteSkeleton] = useState(false);
  const [isMirrored, setIsMirrored] = useState(false);
  const [hudState, setHudState] = useState<{
    level: number;
    bufferAhead: number;
    droppedFrames: number;
  }>({ level: -1, bufferAhead: 0, droppedFrames: 0 });
  const lastResumeSaveAt = useRef(0);
  const resumeKey = useMemo(() => `vault:video:resume:${itemId ?? src}`, [itemId, src]);
  const isSourceAllowed = useMemo(
    () => isAllowedMediaUrl(src, allowedMediaDomains),
    [src, allowedMediaDomains]
  );

  const effectiveAspectRatio = useMemo(() => {
    if (videoDimensions?.aspectRatio) return videoDimensions.aspectRatio;
    if (typeof aspectRatio === 'number' && aspectRatio > 0) return aspectRatio;
    if (typeof aspectRatio === 'string') {
      const parsed = parseFloat(aspectRatio);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return undefined;
  }, [videoDimensions, aspectRatio]);

  useEffect(() => {
    const mediaQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    const updateLiteMode = () => {
      const reducedMotion = Boolean(mediaQuery?.matches);
      const lowCoreDevice =
        typeof navigator !== 'undefined' &&
        typeof (navigator as any).hardwareConcurrency === 'number' &&
        (navigator as any).hardwareConcurrency <= 4;
      setUseLiteSkeleton(reducedMotion || lowCoreDevice || lowDataMode);
    };
    updateLiteMode();
    mediaQuery?.addEventListener?.('change', updateLiteMode);
    return () => mediaQuery?.removeEventListener?.('change', updateLiteMode);
  }, [lowDataMode]);

  const logEvent = useCallback(
    async (event: string, metadata: any = {}) => {
      if (!itemId) return;
      try {
        const apiBase = resolveApiBaseUrl();
        const safeMetadata = sanitizeTelemetryMetadata(metadata);
        fetch(`${apiBase}/api/vault/media/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ itemId, event, metadata: safeMetadata }),
        }).catch((error) => {
          logger.warn('Telemetry delivery failed', { event, itemId, error });
        });
      } catch (error) {
        logger.warn('Failed to schedule telemetry delivery', {
          event,
          itemId,
          error: sanitizeTelemetryMetadata(error),
        });
      }
    },
    [itemId]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setCurrentTime(0);
    setDuration(0);
    setError(null);
    setIsPlaying(autoPlay);
    setReconnectMessage(null);
    setIsVideoReady(false);
    setSelectedQualityIndex(-1);
    setCurrentQualityLabel('Auto');
    setQualityOptions([{ index: -1, label: 'Auto' }]);
    if (!isSourceAllowed) {
      setError(getPlayerErrorMessage('SECURITY_POLICY_BLOCKED'));
      return;
    }
    let disposed = false;
    let networkRetryCount = 0;
    let mediaRecoveryCount = 0;
    let qualityHydrated = false;

    const shouldAutoplay = async () => {
      if (!autoPlay) return false;
      if (!networkAwareAutoplay) return true;

      try {
        const navAny = navigator as Navigator & {
          connection?: { saveData?: boolean; effectiveType?: string };
          getBattery?: () => Promise<{ level: number; charging: boolean }>;
        };
        const conn = navAny.connection;
        if (conn?.saveData) return false;
        if (conn?.effectiveType && ['slow-2g', '2g'].includes(conn.effectiveType)) {
          return false;
        }
        if (typeof navAny.getBattery === 'function') {
          const battery = await navAny.getBattery();
          if (!battery.charging && battery.level < 0.2) return false;
        }
      } catch {
        // keep autoplay unchanged on unsupported platforms
      }
      return true;
    };

    // Cleanup previous playback engine for source changes
    hlsRef.current?.destroy();
    hlsRef.current = null;
    setIsBuffering(true);
    // Main loader: lightweight HLS/native playback for responsive previews
    const loadVideo = async () => {
      // Prefer HLS chunk-based loading first for fast start + background buffering
      if (src.includes('.m3u8')) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            // Start lower by default for faster first frame on large previews.
            startLevel: 0,
            capLevelToPlayerSize: true,
            backBufferLength: 30,
            maxBufferLength: 40,
            maxMaxBufferLength: 80,
            maxBufferSize: 30 * 1000 * 1000,
            maxBufferHole: 0.5,
            startFragPrefetch: false,
            testBandwidth: true,
          });
          hlsRef.current = hls;
          hls.loadSource(src);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_LOADING, () => {
            setIsBuffering(true);
          });

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            logEvent('playback_start', { type: 'hls_legacy' });
            setIsBuffering(false);
            if (!qualityHydrated) {
              const nextOptions = [
                { index: -1, label: 'Auto' },
                ...hls.levels.map((level, index) => {
                  const labelFromHeight = level.height
                    ? `${level.height}p`
                    : `${Math.round((level.bitrate || 0) / 1000)}kbps`;
                  return { index, label: labelFromHeight };
                }),
              ];
              setQualityOptions(nextOptions);
              const startLabel =
                nextOptions.find((option) => option.index === hls.currentLevel)?.label ?? 'Auto';
              setCurrentQualityLabel(startLabel);
              qualityHydrated = true;
            }
            void shouldAutoplay().then((allowAutoPlay) => {
              if (!allowAutoPlay || disposed) return;
              video.play().catch(() => setIsPlaying(false));
            });

            // Adaptive preview quality: start lower, step up when stable.
            if (!lowDataMode) {
              setTimeout(() => {
                if (disposed || !hlsRef.current) return;
                hlsRef.current.nextLevel = -1;
              }, 4000);
            }
          });

          hls.on(Hls.Events.FRAG_LOADING, () => {
            // Next segment fetch in background
            if (!video.paused && video.readyState < 3) {
              setIsBuffering(true);
            }
          });

          hls.on(Hls.Events.FRAG_BUFFERED, () => {
            if (video.readyState >= 3) {
              setIsBuffering(false);
            }
            networkRetryCount = 0;
            mediaRecoveryCount = 0;
            setReconnectMessage(null);
          });

          hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
            const bufferedEnd = video.buffered.length
              ? video.buffered.end(video.buffered.length - 1)
              : 0;
            const droppedFrames =
              (video as HTMLVideoElement & { webkitDroppedFrameCount?: number })
                .webkitDroppedFrameCount || 0;
            setHudState({
              level: data.level ?? -1,
              bufferAhead: Math.max(0, bufferedEnd - video.currentTime),
              droppedFrames,
            });
            const qualityLabel =
              qualityOptions.find((option) => option.index === data.level)?.label ??
              (hls.levels[data.level]?.height ? `${hls.levels[data.level].height}p` : 'Auto');
            setCurrentQualityLabel(qualityLabel);
          });

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                networkRetryCount += 1;
              }
              if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                mediaRecoveryCount += 1;
              }

              const recoveryAction = getHlsRecoveryAction({
                errorType: data.type,
                networkRetryCount,
                mediaRecoveryCount,
                currentLevel: hls.currentLevel,
              });

              switch (recoveryAction.action) {
                case 'restart_load':
                  setIsBuffering(true);
                  setReconnectMessage(recoveryAction.message);
                  setTimeout(() => {
                    if (!disposed && hlsRef.current) {
                      hls.startLoad();
                    }
                  }, recoveryAction.retryInMs);
                  break;
                case 'recover_media':
                  hls.recoverMediaError();
                  break;
                case 'downgrade_level':
                  hls.currentLevel = recoveryAction.level;
                  hls.nextLevel = recoveryAction.level;
                  setReconnectMessage(recoveryAction.message);
                  setTimeout(() => {
                    if (!disposed && hlsRef.current) {
                      hls.startLoad();
                    }
                  }, 400);
                  break;
                case 'fatal_error':
                  setError(getPlayerErrorMessage(recoveryAction.code));
                  hls.destroy();
                  hlsRef.current = null;
                  break;
              }
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          setQualityOptions([{ index: -1, label: 'Auto' }]);
          setSelectedQualityIndex(-1);
          setCurrentQualityLabel('Auto');
          video.src = src;
          video.load();
        }
      } else {
        setQualityOptions([{ index: -1, label: 'Auto' }]);
        setSelectedQualityIndex(-1);
        setCurrentQualityLabel('Auto');
        video.src = src;
        video.load();
      }
    };

    loadVideo();
    return () => {
      disposed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src, autoPlay, itemId, logEvent, lowDataMode, networkAwareAutoplay, isSourceAllowed]);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingSeek = useRef(false);
  const lastVolume = useRef(1);

  // Derive progress from currentTime/duration
  const progress = useMemo(
    () => (duration > 0 ? (currentTime / duration) * 100 : 0),
    [currentTime, duration]
  );

  /* ---------------- CORE EVENTS ---------------- */

  const handleError = useCallback(() => {
    const video = videoRef.current;
    const err = video?.error;

    logEvent('error', { code: err?.code, message: err?.message });

    setError(getPlayerErrorMessage(mapMediaErrorCodeToPlayerError(err?.code)));

    setIsBuffering(false);
  }, [logEvent]);

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth && video.videoHeight) {
      setVideoDimensions({
        width: video.videoWidth,
        height: video.videoHeight,
        aspectRatio: video.videoWidth / video.videoHeight,
      });
    }
    const safeDuration = finiteOrZero(video.duration);
    setDuration(safeDuration);
    setError(null);
    setIsVideoReady(true);
    try {
      const raw = window.localStorage.getItem(resumeKey);
      if (!raw) return;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      if (parsed > 1 && parsed < Math.max(0, safeDuration - 1)) {
        video.currentTime = parsed;
        setCurrentTime(parsed);
      }
    } catch (storageError) {
      logger.warn('Failed to restore resume position', { storageError });
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || isDraggingSeek.current) return;

    const safeCurrentTime = finiteOrZero(video.currentTime);
    setCurrentTime(safeCurrentTime);
    const now = Date.now();
    if (now - lastResumeSaveAt.current < 2000) return;
    lastResumeSaveAt.current = now;
    try {
      window.localStorage.setItem(resumeKey, String(safeCurrentTime));
    } catch (storageError) {
      logger.warn('Failed to save resume position', { storageError });
    }
  };

  const [showPlayingBadge, setShowPlayingBadge] = useState(false);
  const badgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // const lastBufferEventRef = useRef<{ type: 'start' | 'end' | null; at: number }>({
  //   type: null,
  //   at: 0,
  // })

  const handlePlay = () => {
    setIsPlaying(true);
    setShowPlayingBadge(true);
    if (badgeTimer.current) clearTimeout(badgeTimer.current);
    badgeTimer.current = setTimeout(() => setShowPlayingBadge(false), 3000);
  };
  const handlePause = () => setIsPlaying(false);

  const handleWaiting = () => {
    setIsBuffering(true);
    logEvent('buffer_start', { time: videoRef.current?.currentTime });
    //   const now = Date.now()
    //   if (
    //     lastBufferEventRef.current.type !== 'start' ||
    //     now - lastBufferEventRef.current.at > 1200
    //   ) {
    //     lastBufferEventRef.current = { type: 'start', at: now }
    //     logEvent('buffer_start', { time: videoRef.current?.currentTime })
    //   }
    // }
  };
  const handlePlaying = () => {
    setIsBuffering(false);
    setIsVideoReady(true);
    logEvent('buffer_end', { time: videoRef.current?.currentTime });
    // const now = Date.now()
    // if (
    //   lastBufferEventRef.current.type !== 'end' ||
    //   now - lastBufferEventRef.current.at > 1200
    // ) {
    //   lastBufferEventRef.current = { type: 'end', at: now }
    //   logEvent('buffer_end', { time: videoRef.current?.currentTime })
    // }
    // Also show badge when resuming from buffering
    setShowPlayingBadge(true);
    if (badgeTimer.current) clearTimeout(badgeTimer.current);
    badgeTimer.current = setTimeout(() => setShowPlayingBadge(false), 3000);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setShowControls(true);
    try {
      window.localStorage.removeItem(resumeKey);
    } catch (storageError) {
      logger.warn('Failed to clear resume position', { storageError });
    }
  };

  /* ---------------- CONTROLS ---------------- */

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || error) return;

    if (video.paused) {
      video.play().catch((err) => {
        console.warn('Playback failed:', err);
      });
    } else {
      video.pause();
    }
  }, [error]);

  const handleSeek = (value: number) => {
    const safeDuration = finiteOrZero(duration);
    if (safeDuration <= 0) return;
    const newTime = Math.min(safeDuration, Math.max(0, (finiteOrZero(value) / 100) * safeDuration));
    setCurrentTime(newTime);

    // Only commit to video if not dragging or if it's the final update
    if (!isDraggingSeek.current && videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  };

  const onSeekStart = () => {
    isDraggingSeek.current = true;
    resetHideTimer();
  };

  const onSeekEnd = () => {
    isDraggingSeek.current = false;
    if (videoRef.current) {
      const safeDuration = finiteOrZero(duration);
      const safeCurrentTime = Math.min(
        safeDuration || Number.MAX_SAFE_INTEGER,
        Math.max(0, finiteOrZero(currentTime))
      );
      if (Number.isFinite(safeCurrentTime)) {
        videoRef.current.currentTime = safeCurrentTime;
      }
    }
  };

  const handleVolume = (value: number) => {
    const video = videoRef.current;
    if (!video) return;

    const v = value / 100;
    if (v > 0) {
      lastVolume.current = v;
    }
    video.volume = v;
    video.muted = v === 0;

    setVolume(v);
    setIsMuted(v === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.muted) {
      const restoredVol = lastVolume.current || 1;
      video.volume = restoredVol;
      video.muted = false;
      setVolume(restoredVol);
      setIsMuted(false);
    } else {
      lastVolume.current = volume;
      video.volume = 0;
      video.muted = true;
      setVolume(0);
      setIsMuted(true);
    }
  };

  const setSpeed = (speed: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = speed;
    setPlaybackSpeed(speed);
  };

  const speeds = [0.5, 1, 1.25, 1.5, 2];

  const cycleSpeed = () => {
    if (!allowSpeedChange) return;
    const currentIndex = speeds.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    setSpeed(speeds[nextIndex]);
  };

  const applyQualitySelection = (levelIndex: number) => {
    const hls = hlsRef.current;
    if (!hls) return;

    if (levelIndex < 0) {
      // Re-enable adaptive bitrate mode explicitly.
      hls.currentLevel = -1;
      hls.nextLevel = -1;
      hls.loadLevel = -1;
      hls.autoLevelCapping = -1;
      setReconnectMessage('Auto quality enabled');
      setTimeout(() => {
        setReconnectMessage((prev) => (prev === 'Auto quality enabled' ? null : prev));
      }, 1200);
      setSelectedQualityIndex(-1);
      return;
    }

    // Force manual level for immediate and upcoming fragment loads.
    hls.autoLevelCapping = levelIndex;
    hls.loadLevel = levelIndex;
    hls.currentLevel = levelIndex;
    hls.nextLevel = levelIndex;
    hls.startLoad();
    setSelectedQualityIndex(levelIndex);
    const chosenLabel =
      qualityOptions.find((option) => option.index === levelIndex)?.label ?? `${levelIndex}`;
    setReconnectMessage(`Quality set to ${chosenLabel}`);
    setTimeout(() => {
      setReconnectMessage((prev) => (prev === `Quality set to ${chosenLabel}` ? null : prev));
    }, 1200);
  };

  const toggleFullscreen = async () => {
    if (!allowFullscreen) return;
    const container = containerRef.current;
    if (!container) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch (fullscreenError) {
      logger.warn('Fullscreen toggle failed', { fullscreenError });
    }
  };

  const togglePiP = async () => {
    if (!allowPiP) return;
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if ('requestPictureInPicture' in video) {
        await (
          video as HTMLVideoElement & {
            requestPictureInPicture: () => Promise<PictureInPictureWindow>;
          }
        ).requestPictureInPicture();
      }
    } catch (pipError) {
      logger.warn('PiP toggle failed', { pipError });
    }
  };

  const handleDownload = () => {
    if (!src) return;
    if (!allowDownload) {
      toast.error('Download is disabled by policy');
      return;
    }
    if (!isSafeDownloadUrl(src)) {
      toast.error('Download blocked: unsupported or unsafe URL');
      logger.warn('Blocked unsafe download URL', { src });
      return;
    }
    try {
      const link = document.createElement('a');
      link.href = src;
      const fallbackName = title ? `${title}.mp4` : `video-${Date.now()}.mp4`;
      const parsedName = src.split('/').pop()?.split('?')[0];
      link.download = parsedName || fallbackName;
      if (!src.startsWith('blob:') && !src.startsWith('data:')) {
        link.target = '_blank';
      }
      link.rel = 'noopener noreferrer'; // Security best practice
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Download started');
    } catch (err) {
      console.error('Download failed:', err);
      // Fallback: just open in new tab
      if (isSafeDownloadUrl(src)) {
        window.open(src, '_blank', 'noopener,noreferrer');
        toast.error('Direct download failed, opening in new tab');
      } else {
        toast.error('Download failed');
      }
    }
  };

  const handleRefresh = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.load();
    toast.success('Video refreshed');
  };

  /* ---------------- AUTO HIDE CONTROLS ---------------- */

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (isPlaying && !error) {
      hideTimer.current = setTimeout(() => setShowControls(false), 2500);
    }
  }, [isPlaying, error]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [isPlaying, error, resetHideTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      const video = videoRef.current;
      if (!video) return;
      try {
        video.pause();
      } catch {
        // Ignore pause failures during teardown.
      }
      try {
        video.srcObject = null;
      } catch {
        // Ignore srcObject failures during teardown.
      }
      try {
        video.removeAttribute('src');
      } catch {
        // Ignore src cleanup failures.
      }
      try {
        video.load();
      } catch {
        // Ignore load reset failures.
      }
    };
  }, []);

  /* ---------------- KEYBOARD SUPPORT ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current;
      const container = containerRef.current;
      if (!video || !container || error) return;

      const targetNode = e.target as Node | null;
      if (!targetNode || !container.contains(targetNode)) return;

      // Basic Player Controls
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === 'ArrowRight') video.currentTime += 5;
      if (e.key === 'ArrowLeft') video.currentTime -= 5;
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, error]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const onEnterPiP = () => setIsPiP(true);
    const onLeavePiP = () => setIsPiP(false);

    const video = videoRef.current;
    document.addEventListener('fullscreenchange', onFullscreenChange);
    video?.addEventListener('enterpictureinpicture', onEnterPiP as EventListener);
    video?.addEventListener('leavepictureinpicture', onLeavePiP as EventListener);

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      video?.removeEventListener('enterpictureinpicture', onEnterPiP as EventListener);
      video?.removeEventListener('leavepictureinpicture', onLeavePiP as EventListener);
    };
  }, []);

  /* ---------------- UI ---------------- */

  return (
    <motion.div
      ref={containerRef}
      className={cn(
        'group relative flex items-center justify-center bg-black overflow-hidden max-w-full max-h-full transition-all duration-300',
        effectiveAspectRatio ? 'w-full h-auto' : 'w-full h-full min-h-[220px]',
        className
      )}
      style={{
        aspectRatio: effectiveAspectRatio ? String(effectiveAspectRatio) : undefined,
        ...style,
      }}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
      onClick={resetHideTimer}
      onContextMenu={(e) => {
        e.preventDefault();
        toast.error('Context menu is disabled for secure content.');
      }}
    >
      <video
        ref={videoRef}
        src={src.includes('.m3u8') ? undefined : src}
        className={cn(
          'h-full w-full max-h-full object-contain transition-opacity duration-300',
          isMirrored ? 'scale-x-[-1]' : ''
        )}
        preload="auto"
        playsInline
        autoPlay={autoPlay}
        muted={isMuted}
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
        }}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={() => setIsVideoReady(true)}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onWaiting={handleWaiting}
        onStalled={handleWaiting}
        onPlaying={handlePlaying}
        onCanPlay={handlePlaying}
        onEnded={handleEnded}
        onError={handleError}
      />

      <AnimatePresence>
        {!isVideoReady && !error && (
          <motion.div
            key="video-loading-skeleton"
            initial={useLiteSkeleton ? false : { opacity: 1 }}
            exit={useLiteSkeleton ? undefined : { opacity: 0 }}
            transition={useLiteSkeleton ? { duration: 0 } : { duration: 0.3 }}
            className={cn(
              'absolute inset-0 z-[5] flex flex-col items-center justify-center bg-black/80 gap-3 text-white/70',
              !useLiteSkeleton && 'backdrop-blur-sm'
            )}
          >
            <Loader2 className={cn('h-8 w-8 text-white/80', !useLiteSkeleton && 'animate-spin')} />
            <p className="text-xs uppercase tracking-wider text-white/50">Loading Video...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BUFFER */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="animate-spin text-white w-8 h-8 opacity-50" />
            {reconnectMessage ? (
              <p className="text-[11px] text-white/70">{reconnectMessage}</p>
            ) : null}
          </div>
        </div>
      )}

      {showPerformanceHud && (
        <div className="absolute left-3 top-3 z-[40] rounded-md bg-black/60 px-2 py-1 text-[10px] text-white/80">
          <p>Q: {hudState.level < 0 ? 'auto' : hudState.level}</p>
          <p>Label: {currentQualityLabel}</p>
          <p>Buf: {hudState.bufferAhead.toFixed(1)}s</p>
          <p>Drop: {hudState.droppedFrames}</p>
        </div>
      )}

      {/* TITLE OVERLAY */}
      <AnimatePresence>
        {showControls && title && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-0 left-0 right-0 p-3 sm:p-5 pt-4 sm:pt-8 bg-gradient-to-b from-black/90 via-black/40 to-transparent z-[20] pointer-events-none"
          >
            <h3 className="text-white text-[13px] sm:text-sm md:text-base font-bold truncate drop-shadow-xl text-center">
              {title}
            </h3>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ERROR */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a]/90 backdrop-blur-md text-center p-6">
          <div className="bg-red-500/10 p-4 rounded-full mb-4">
            <Loader2 className="text-red-400 w-8 h-8 opacity-50" />
          </div>
          <p className="text-red-400/90 mb-5 text-sm font-medium max-w-[250px]">{error}</p>
          <Button
            onClick={() => {
              videoRef.current?.load();
              setError(null);
            }}
            className="bg-white/10 hover:bg-white/20 border-white/10 text-white"
          >
            Retry
          </Button>
        </div>
      )}

      {/* CONTROLS */}
      <AnimatePresence>
        {showPlayingBadge && (
          <motion.div
            key="playing-badge"
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute top-6 left-6 z-[30] pointer-events-none"
          >
            <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-black/40 backdrop-blur-2xl border border-white/10 shadow-2xl">
              <div className="flex gap-1 items-end h-3 w-4">
                <motion.div
                  animate={{ height: ['20%', '100%', '20%'] }}
                  transition={{ repeat: Infinity, duration: 0.6 }}
                  className="w-1 bg-primary rounded-full"
                />
                <motion.div
                  animate={{ height: ['40%', '100%', '40%'] }}
                  transition={{ repeat: Infinity, duration: 0.8, delay: 0.1 }}
                  className="w-1 bg-primary rounded-full"
                />
                <motion.div
                  animate={{ height: ['30%', '100%', '30%'] }}
                  transition={{ repeat: Infinity, duration: 0.7, delay: 0.2 }}
                  className="w-1 bg-primary rounded-full"
                />
              </div>
              {/* <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/90">
                Streaming Securely
              </span> */}
            </div>
          </motion.div>
        )}

        {showControls && (
          <motion.div
            key="video-controls"
            className="absolute bottom-0 left-0 right-0 px-2 sm:px-3 pt-2 pb-[env(safe-area-inset-bottom)] bg-black/40 backdrop-blur-xl border-t border-white/10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
          >
            {/* SEEK */}
            <div className="flex items-center gap-1 sm:gap-2 text-white text-[9px] sm:text-xs md:text-sm mb-2">
              <span className="w-[34px] sm:w-[40px] text-right shrink-0">
                {formatTime(currentTime)}
              </span>

              <div className="flex-1">
                <CustomSlider
                  label="Seek video"
                  value={progress}
                  onChange={handleSeek}
                  onDragStart={onSeekStart}
                  onDragEnd={onSeekEnd}
                  className="h-2.5 sm:h-2"
                  thumbClassName="h-3.5 w-3.5 sm:h-3 sm:w-3"
                />
              </div>

              <span className="w-[34px] sm:w-[40px] text-left shrink-0 font-mono">
                {formatTime(duration)}
              </span>
            </div>

            {/* ACTIONS */}
            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
              {/* LEFT CONTROLS */}
              <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
                <Button
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  size="icon"
                  className="h-7 w-7 sm:h-9 sm:w-9 shrink-0"
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                  ) : (
                    <Play className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                  )}
                </Button>

                <Button
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  size="icon"
                  className="h-7 w-7 sm:h-9 sm:w-9 shrink-0"
                >
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                  ) : volume > 0.5 ? (
                    <Volume2 className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                  ) : (
                    <Volume1 className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                  )}
                </Button>

                <div className="w-12 sm:w-24 md:w-28 flex-1 max-w-[100px] sm:max-w-none">
                  <CustomSlider
                    label="Volume"
                    value={volume * 100}
                    onChange={handleVolume}
                    className="h-2 sm:h-1.5"
                    thumbClassName="h-3 w-3 sm:h-2.5 sm:w-2.5"
                  />
                </div>
              </div>

              {/* RIGHT CONTROLS */}
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                <label className="sr-only" htmlFor="video-quality-select">
                  Quality
                </label>
                <div className="relative min-w-[78px]">
                  <select
                    id="video-quality-select"
                    aria-label="Quality selector"
                    value={selectedQualityIndex}
                    onChange={(e) => {
                      applyQualitySelection(Number(e.target.value));
                    }}
                    className="h-7 sm:h-8 w-full appearance-none rounded-lg border border-white/25 bg-black/55 pl-2 pr-6 sm:pl-2.5 sm:pr-7 text-[11px] sm:text-xs font-medium text-white outline-none transition-colors hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:border-white/50 touch-manipulation"
                  >
                    {qualityOptions.map((option) => (
                      <option
                        key={`${option.index}-${option.label}`}
                        value={option.index}
                        className="bg-zinc-900 text-white"
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/75" />
                </div>

                <Button
                  onClick={cycleSpeed}
                  aria-label={`Playback speed: ${playbackSpeed}x`}
                  disabled={!allowSpeedChange}
                  size="sm"
                  className="h-5 sm:h-6 px-1 sm:px-1.5 text-[8px] sm:text-[9px] bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all touch-manipulation min-w-[24px]"
                >
                  {playbackSpeed}
                </Button>
                <Button
                  onClick={() => setIsMirrored((prev) => !prev)}
                  aria-label={isMirrored ? 'Unmirror video' : 'Mirror video'}
                  title={isMirrored ? 'Unmirror video' : 'Mirror video'}
                  size="icon"
                  className="h-4 w-4 sm:h-6 sm:w-6 bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0"
                >
                  <FlipHorizontal2 className="w-2 h-2 sm:w-3 sm:h-3" />
                </Button>

                <Button
                  onClick={togglePiP}
                  aria-label={isPiP ? 'Exit Picture in Picture' : 'Picture in Picture'}
                  disabled={!allowPiP}
                  size="icon"
                  className="h-4 w-4 sm:h-6 sm:w-6 bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0"
                >
                  <PictureInPicture2 className="w-2 h-2 sm:w-3 sm:h-3" />
                </Button>

                <Button
                  onClick={() => {
                    void toggleFullscreen();
                  }}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  disabled={!allowFullscreen}
                  size="icon"
                  className="h-4 w-4 sm:h-6 sm:w-6 bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0"
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-2 h-2 sm:w-3 sm:h-3" />
                  ) : (
                    <Maximize2 className="w-2 h-2 sm:w-3 sm:h-3" />
                  )}
                </Button>

                <Button
                  onClick={handleRefresh}
                  aria-label="Refresh video"
                  size="icon"
                  className="h-4 w-4 sm:h-6 sm:w-6 bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0"
                >
                  <RefreshCw className="w-2 h-2 sm:w-3 sm:h-3" />
                </Button>

                <Button
                  onClick={handleDownload}
                  aria-label="Download video"
                  disabled={!allowDownload}
                  size="icon"
                  className="h-4 w-4 sm:h-6 sm:w-6 bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0"
                >
                  <Download className="w-2 h-2 sm:w-3 sm:h-3" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export { VideoPlayer };
export default VideoPlayer;
