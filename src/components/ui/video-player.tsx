'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
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
  FlipHorizontal,
  ChevronDown,
  VideoOff,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Gauge,
  X,
  GripHorizontal,
  Maximize,
  Bookmark,
  Layers,
  Camera,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import apiClient from '../../api/apiClient';
import { logger } from '../../lib/logger';
import { toast } from 'sonner';
import Hls from 'hls.js';
import { transcodeVideoInBrowser } from '../../lib/videoTranscoder';
import { resolveApiBaseUrl } from '../../lib/apiBaseUrl';

export type VideoVisualFilter = string;
export interface VideoFilterOption {
  id: string;
  label: string;
  shortLabel: string;
  css: string;
}
export const VIDEO_FILTER_OPTIONS: readonly VideoFilterOption[] = [
  { id: 'none', label: 'Normal', shortLabel: 'Normal', css: 'none' },
];

/* ---------------- UTIL ---------------- */

export const formatTime = (seconds: number) => {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '00:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

const finiteOrZero = (value: number) => (Number.isFinite(value) ? value : 0);

export const getMimeTypeFromUrl = (url: string): string | undefined => {
  if (!url) return undefined;
  const cleanUrl = url.split('?')[0].split('#')[0];
  const ext = cleanUrl.split('.').pop()?.toLowerCase();
  if (!ext) return undefined;

  const map: Record<string, string> = {
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    mov: 'video/quicktime',
    qt: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    mka: 'video/x-matroska',
    mks: 'video/x-matroska',
    avi: 'video/x-msvideo',
    divx: 'video/x-msvideo',
    xvid: 'video/x-msvideo',
    wmv: 'video/x-ms-wmv',
    asf: 'video/x-ms-asf',
    asx: 'video/x-ms-asf',
    mpg: 'video/mpeg',
    mpeg: 'video/mpeg',
    mpe: 'video/mpeg',
    mpv: 'video/mpeg',
    m2v: 'video/mpeg',
    m2p: 'video/mpeg',
    mts: 'video/mp2t',
    m2ts: 'video/mp2t',
    ts: 'video/mp2t',
    vob: 'video/dvd',
    evo: 'video/mp2t',
    mod: 'video/mp2t',
    tod: 'video/mp2t',
    '3gp': 'video/3gpp',
    '3g2': 'video/3gpp2',
    f4v: 'video/x-f4v',
    f4p: 'video/mp4',
    f4a: 'video/mp4',
    f4b: 'video/mp4',
    flv: 'video/x-flv',
    swf: 'application/x-shockwave-flash',
    ogv: 'video/ogg',
    ogm: 'video/ogg',
    rm: 'application/vnd.rn-realmedia',
    rmvb: 'application/vnd.rn-realmedia-vbr',
    rv: 'video/vnd.rn-realvideo',
    dat: 'video/mpeg',
    mxf: 'application/mxf',
    gxf: 'application/gxf',
    lxf: 'video/mp2t',
    nut: 'video/x-nut',
    dv: 'video/x-dv',
    dif: 'video/x-dv',
    y4m: 'video/x-yuv4mpeg',
    h264: 'video/h264',
    '264': 'video/h264',
    h265: 'video/h265',
    '265': 'video/h265',
    hevc: 'video/h265',
    av1: 'video/av1',
    vp8: 'video/x-vnd.on2.vp8',
    vp9: 'video/x-vnd.on2.vp9',
    r3d: 'video/x-r3d',
    braw: 'video/x-braw',
    cine: 'application/octet-stream',
    ari: 'application/octet-stream',
    arx: 'application/octet-stream',
    mjp2: 'video/mj2',
    mj2: 'video/mj2',
    m3u8: 'application/x-mpegURL',
  };
  return map[ext];
};

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
    if (!allowedMediaDomains || allowedMediaDomains.length === 0) return true;
    const host = parsed.hostname.toLowerCase();
    const normalizedAllowed = allowedMediaDomains.map((domain) => domain.toLowerCase());
    if (host === window.location.hostname.toLowerCase()) return true;

    try {
      const apiHost = new URL(resolveApiBaseUrl(), window.location.href).hostname.toLowerCase();
      if (host === apiHost) return true;
    } catch {
      /* ignore */
    }

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

export interface CustomSliderProps {
  value: number;
  onChange: (value: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  className?: string;
  label: string;
  thumbClassName?: string;
  duration?: number;
  showHoverTooltip?: boolean;
  pointA?: number | null;
  pointB?: number | null;
}

export const CustomSlider = ({
  value,
  onChange,
  onDragStart,
  onDragEnd,
  className,
  label,
  thumbClassName,
  duration = 0,
  showHoverTooltip = true,
  pointA = null,
  pointB = null,
}: CustomSliderProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [isPointerInside, setIsPointerInside] = useState(false);

  const getPercent = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const x = clientX - rect.left;
    return Math.min(Math.max((x / rect.width) * 100, 0), 100);
  };

  const update = (clientX: number) => {
    const pct = getPercent(clientX);
    onChange(pct);
    setHoverPercent(pct);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    onDragStart?.();
    update(e.clientX);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pct = getPercent(e.clientX);
    setHoverPercent(pct);
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

  const activeHoverPercent = isDragging.current ? value : hoverPercent;
  const hoverTime =
    activeHoverPercent !== null && duration > 0 ? (activeHoverPercent / 100) * duration : null;

  // Clamped tooltip X position (percentage) to prevent edge cut-off
  const clampedTooltipPercent =
    activeHoverPercent !== null ? Math.min(Math.max(activeHoverPercent, 6), 94) : 50;

  // A-B repeat range coordinates
  const pointAPercent = pointA !== null && duration > 0 ? (pointA / duration) * 100 : null;
  const pointBPercent = pointB !== null && duration > 0 ? (pointB / duration) * 100 : null;

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
        'group/slider relative w-full h-2 sm:h-1.5 rounded-full cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-primary/60 bg-white/20 overflow-visible transition-all duration-150',
        className
      )}
      onPointerEnter={() => setIsPointerInside(true)}
      onPointerLeave={() => {
        setIsPointerInside(false);
        if (!isDragging.current) setHoverPercent(null);
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {/* Ghost hover bar marker */}
      {hoverPercent !== null && isPointerInside && (
        <div
          className="absolute top-0 left-0 h-full bg-white/30 rounded-full transition-opacity duration-150 pointer-events-none"
          style={{ width: `${hoverPercent}%` }}
        />
      )}

      {/* A-B Repeat Segment Highlight */}
      {pointAPercent !== null && pointBPercent !== null && pointBPercent > pointAPercent && (
        <div
          className="absolute top-0 h-full bg-primary/40 rounded-sm z-[1] pointer-events-none"
          style={{
            left: `${pointAPercent}%`,
            width: `${pointBPercent - pointAPercent}%`,
          }}
        />
      )}

      {/* Point A Flag Marker */}
      {pointAPercent !== null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 z-[3] w-1.5 h-3.5 bg-emerald-400 rounded-xs shadow-md ring-1 ring-black/40 pointer-events-none"
          style={{ left: `${pointAPercent}%` }}
          title={`Point A: ${formatTime(pointA!)}`}
        />
      )}

      {/* Point B Flag Marker */}
      {pointBPercent !== null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 z-[3] w-1.5 h-3.5 bg-amber-400 rounded-xs shadow-md ring-1 ring-black/40 pointer-events-none"
          style={{ left: `${pointBPercent}%` }}
          title={`Point B: ${formatTime(pointB!)}`}
        />
      )}

      {/* Active progress bar */}
      <div
        className="absolute top-0 left-0 h-full bg-primary rounded-full z-[1]"
        style={{ width: `${value}%` }}
      />

      {/* Thumb */}
      <div
        className={cn(
          'absolute z-[4] top-1/2 h-3.5 w-3.5 rounded-full bg-white shadow-lg ring-2 ring-primary/60 transition-transform hover:scale-125 active:scale-110',
          thumbClassName
        )}
        style={{
          left: `${value}%`,
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Hover / Scrubbing Tooltip */}
      {showHoverTooltip && (isPointerInside || isDragging.current) && hoverTime !== null && (
        <div
          data-testid="timeline-scrub-tooltip"
          className="absolute bottom-full mb-2.5 z-[20] -translate-x-1/2 pointer-events-none flex flex-col items-center select-none animate-in fade-in zoom-in-95 duration-150"
          style={{ left: `${clampedTooltipPercent}%` }}
        >
          <div className="px-2 py-1 bg-black/90 text-white font-mono text-[11px] font-semibold rounded-md shadow-xl border border-white/20 backdrop-blur-md whitespace-nowrap flex items-center gap-1.5">
            <span>{formatTime(hoverTime)}</span>
          </div>
          {/* Tooltip Caret */}
          <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-black/90 mt-[-1px]" />
        </div>
      )}
    </div>
  );
};

/* ---------------- VIDEO PLAYER ---------------- */

export interface VideoPlayerProps {
  src: string;
  mimeType?: string;
  itemId?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
  aspectRatio?: number | string;
  autoPlay?: boolean;
  loop?: boolean;
  lowDataMode?: boolean;
  networkAwareAutoplay?: boolean;
  showPerformanceHud?: boolean;
  allowDownload?: boolean;
  allowPiP?: boolean;
  allowFullscreen?: boolean;
  allowSpeedChange?: boolean;
  allowFloating?: boolean;
  allowFilters?: boolean;
  initialFilter?: string;
  onFilterChange?: (filter: any) => void;
  isFloating?: boolean;
  onToggleFloating?: (floating: boolean) => void;
  allowedMediaDomains?: string[];
  onClose?: () => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  itemId,
  title,
  className,
  style,
  aspectRatio,
  autoPlay = false,
  loop = false,
  lowDataMode = false,
  networkAwareAutoplay = true,
  showPerformanceHud = false,
  allowDownload = true,
  allowPiP = true,
  allowFullscreen = true,
  allowSpeedChange = true,
  allowFloating = true,
  allowFilters,
  initialFilter,
  onFilterChange,
  isFloating: controlledFloating,
  onToggleFloating,
  allowedMediaDomains = [],
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [activeSrc, setActiveSrc] = useState(src);
  const fallbackAttemptedRef = useRef(false);
  const managedFallbackBlobRef = useRef<string | null>(null);

  useEffect(() => {
    if (managedFallbackBlobRef.current) {
      try {
        URL.revokeObjectURL(managedFallbackBlobRef.current);
      } catch {
        /* ignore */
      }
      managedFallbackBlobRef.current = null;
    }
    setActiveSrc(src);
    fallbackAttemptedRef.current = false;
    setCurrentTime(0);
    if (videoRef.current) {
      try {
        videoRef.current.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }, [src]);

  useEffect(() => {
    return () => {
      if (managedFallbackBlobRef.current) {
        try {
          URL.revokeObjectURL(managedFallbackBlobRef.current);
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  const [isTranscoding, setIsTranscoding] = useState(false);
  const [transcodeProgress, setTranscodeProgress] = useState<{
    progress: number;
    message: string;
  } | null>(null);

  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPiP, setIsPiP] = useState(false);
  const [internalFloating, setInternalFloating] = useState(false);
  const isFloating = controlledFloating !== undefined ? controlledFloating : internalFloating;
  const [isLooping, setIsLooping] = useState(loop);
  const [abRepeat, setAbRepeat] = useState<{
    active: boolean;
    pointA: number | null;
    pointB: number | null;
  }>({ active: false, pointA: null, pointB: null });

  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);

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

  // Center HUD Badge State for quick hotkey/gesture visual feedback
  const [hudBadge, setHudBadge] = useState<{
    id: number;
    icon: React.ReactNode;
    text: string;
  } | null>(null);
  const hudBadgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerHudBadge = useCallback((icon: React.ReactNode, text: string) => {
    if (hudBadgeTimer.current) clearTimeout(hudBadgeTimer.current);
    setHudBadge({ id: Date.now(), icon, text });
    hudBadgeTimer.current = setTimeout(() => {
      setHudBadge(null);
    }, 850);
  }, []);

  const captureSnapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    triggerHudBadge(<Camera className="w-5 h-5" />, 'Snapshot Captured');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (isMirrored) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const timestamp = Math.floor(currentTime);
          link.download = `${(title || 'video').replace(/[^a-z0-9_-]/gi, '_')}_snapshot_${timestamp}s.jpg`;
          link.href = url;
          link.rel = 'noopener';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          toast.success('Snapshot downloaded');
        },
        'image/jpeg',
        0.95
      );
    } catch (e) {
      toast.error('Could not capture frame');
    }
  }, [isMirrored, currentTime, title, triggerHudBadge]);

  // Double-tap skip ripple state
  const [skipRipple, setSkipRipple] = useState<{
    side: 'left' | 'right';
    seconds: number;
    key: number;
  } | null>(null);
  const skipRippleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; side: 'left' | 'right'; count: number }>({
    time: 0,
    side: 'left',
    count: 0,
  });

  const lastResumeSaveAt = useRef(0);
  const lastBufferStartAt = useRef(0);
  const resumeKey = useMemo(() => `vault:video:resume:${itemId ?? activeSrc}`, [itemId, activeSrc]);
  const isSourceAllowed = useMemo(
    () => isAllowedMediaUrl(activeSrc, allowedMediaDomains),
    [activeSrc, allowedMediaDomains]
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

  // Click outside speed popup listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setIsSpeedMenuOpen(false);
      }
    };
    if (isSpeedMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSpeedMenuOpen]);

  const logEvent = useCallback(
    async (event: string, metadata: any = {}) => {
      if (!itemId) return;
      try {
        const safeMetadata = sanitizeTelemetryMetadata(metadata);
        await apiClient.post('/vault/media/events', {
          itemId,
          event,
          metadata: safeMetadata,
        });
      } catch (error) {
        logger.warn('Telemetry delivery failed', {
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

    hlsRef.current?.destroy();
    hlsRef.current = null;
    setIsBuffering(true);

    const loadVideo = async () => {
      if (activeSrc.includes('.m3u8')) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
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
          hls.loadSource(activeSrc);
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
              video.play()?.catch?.(() => setIsPlaying(false));
            });

            if (!lowDataMode) {
              setTimeout(() => {
                if (disposed || !hlsRef.current) return;
                hlsRef.current.nextLevel = -1;
              }, 4000);
            }
          });

          hls.on(Hls.Events.FRAG_LOADING, () => {
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
          video.src = activeSrc;
          video.load();
        }
      } else {
        setQualityOptions([{ index: -1, label: 'Auto' }]);
        setSelectedQualityIndex(-1);
        setCurrentQualityLabel('Auto');
        video.src = activeSrc;
        video.load();
      }
    };

    loadVideo();
    return () => {
      disposed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      try {
        video.pause();
      } catch {
        /* ignore */
      }
      try {
        video.srcObject = null;
      } catch {
        /* ignore */
      }
      try {
        video.removeAttribute('src');
      } catch {
        /* ignore */
      }
      try {
        video.load();
      } catch {
        /* ignore */
      }
    };
  }, [activeSrc, autoPlay, itemId, logEvent, lowDataMode, networkAwareAutoplay, isSourceAllowed]);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingSeek = useRef(false);
  const lastVolume = useRef(1);

  const progress = useMemo(
    () => (duration > 0 ? (currentTime / duration) * 100 : 0),
    [currentTime, duration]
  );

  /* ---------------- CORE EVENTS & TRANSCODING ---------------- */

  const handleTranscodeAndPlay = useCallback(async () => {
    const targetSource = activeSrc || src;
    if (!targetSource) return;

    setIsTranscoding(true);
    setError(null);
    setTranscodeProgress({ progress: 5, message: 'Initializing in-browser video engine...' });

    try {
      const result = await transcodeVideoInBrowser(
        targetSource,
        title || 'video.mkv',
        (ev) => {
          setTranscodeProgress({ progress: ev.progress, message: ev.message });
        },
        itemId || targetSource
      );

      if (managedFallbackBlobRef.current) {
        try {
          URL.revokeObjectURL(managedFallbackBlobRef.current);
        } catch {
          /* ignore */
        }
      }

      managedFallbackBlobRef.current = result.url;
      setActiveSrc(result.url);
      setIsVideoReady(false);
      setIsBuffering(true);
      setError(null);
      setIsPlaying(true);
      toast.success('Video converted successfully!');
    } catch (err: any) {
      console.error('WASM transcode error:', err);
      toast.error('Automatic conversion failed. You can still download the video.');
      setError(getPlayerErrorMessage('UNSUPPORTED_FORMAT'));
    } finally {
      setIsTranscoding(false);
      setTranscodeProgress(null);
    }
  }, [activeSrc, src, title, itemId]);

  const handleError = useCallback(async () => {
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
    video.loop = isLooping;

    // Always start playback from the absolute beginning (0:00)
    try {
      video.currentTime = 0;
    } catch {
      /* ignore */
    }
    setCurrentTime(0);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || isDraggingSeek.current) return;

    const safeCurrentTime = finiteOrZero(video.currentTime);
    setCurrentTime(safeCurrentTime);

    // Check A-B repeat boundary
    if (
      abRepeat.active &&
      abRepeat.pointA !== null &&
      abRepeat.pointB !== null &&
      abRepeat.pointB > abRepeat.pointA
    ) {
      if (safeCurrentTime >= abRepeat.pointB || safeCurrentTime < abRepeat.pointA) {
        video.currentTime = abRepeat.pointA;
        return;
      }
    }

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

  const handlePlay = () => {
    setIsPlaying(true);
    setShowPlayingBadge(true);
    if (badgeTimer.current) clearTimeout(badgeTimer.current);
    badgeTimer.current = setTimeout(() => setShowPlayingBadge(false), 3000);
  };
  const handlePause = () => setIsPlaying(false);

  const handleWaiting = () => {
    setIsBuffering(true);
    const now = Date.now();
    if (now - lastBufferStartAt.current < 1200) return;
    lastBufferStartAt.current = now;
    void logEvent('buffer_start', { time: videoRef.current?.currentTime });
  };

  const handlePlaying = () => {
    setIsBuffering(false);
    setIsVideoReady(true);
    void logEvent('buffer_end', { time: videoRef.current?.currentTime });
    setShowPlayingBadge(true);
    if (badgeTimer.current) clearTimeout(badgeTimer.current);
    badgeTimer.current = setTimeout(() => setShowPlayingBadge(false), 3000);
  };

  const handleEnded = () => {
    if (isLooping) {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play()?.catch?.(() => {});
      }
      return;
    }
    setIsPlaying(false);
    setShowControls(true);
    try {
      window.localStorage.removeItem(resumeKey);
    } catch (storageError) {
      logger.warn('Failed to clear resume position', { storageError });
    }
  };

  /* ---------------- CONTROLS & ACTIONS ---------------- */

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || error) return;

    if (video.paused) {
      video.play()?.catch?.((err) => {
        console.warn('Playback failed:', err);
      });
    } else {
      video.pause();
    }
  }, [error]);

  const seekRelative = useCallback((deltaSeconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const safeDuration = finiteOrZero(video.duration) || Number.MAX_SAFE_INTEGER;
    const nextTime = Math.min(safeDuration, Math.max(0, video.currentTime + deltaSeconds));
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const handleSeek = (value: number) => {
    const safeDuration = finiteOrZero(duration);
    if (safeDuration <= 0) return;
    const newTime = Math.min(safeDuration, Math.max(0, (finiteOrZero(value) / 100) * safeDuration));
    setCurrentTime(newTime);

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

  const handleVolume = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video) return;

    const v = Math.max(0, Math.min(1, value / 100));
    if (v > 0) {
      lastVolume.current = v;
    }
    video.volume = v;
    video.muted = v === 0;

    setVolume(v);
    setIsMuted(v === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.muted || volume === 0) {
      const restoredVol = lastVolume.current || 1;
      video.volume = restoredVol;
      video.muted = false;
      setVolume(restoredVol);
      setIsMuted(false);
      triggerHudBadge(
        <Volume2 className="w-7 h-7 text-white" />,
        `${Math.round(restoredVol * 100)}%`
      );
    } else {
      lastVolume.current = volume;
      video.volume = 0;
      video.muted = true;
      setVolume(0);
      setIsMuted(true);
      triggerHudBadge(<VolumeX className="w-7 h-7 text-white" />, 'Muted');
    }
  }, [volume, triggerHudBadge]);

  const setSpeed = useCallback(
    (speed: number) => {
      const video = videoRef.current;
      if (!video) return;

      try {
        video.playbackRate = speed;
        (video as any).preservesPitch = true;
        (video as any).mozPreservesPitch = true;
        (video as any).webkitPreservesPitch = true;
      } catch {
        /* ignore */
      }
      setPlaybackSpeed(speed);
      setIsSpeedMenuOpen(false);
      triggerHudBadge(<Gauge className="w-7 h-7 text-white" />, `${speed}x`);
    },
    [triggerHudBadge]
  );

  const toggleLoop = useCallback(() => {
    const next = !isLooping;
    setIsLooping(next);
    if (videoRef.current) {
      videoRef.current.loop = next;
    }
    triggerHudBadge(
      next ? (
        <Repeat1 className="w-7 h-7 text-primary" />
      ) : (
        <Repeat className="w-7 h-7 text-white/70" />
      ),
      next ? 'Loop On' : 'Loop Off'
    );
  }, [isLooping, triggerHudBadge]);

  const toggleABRepeat = useCallback(() => {
    const now = currentTime;
    setAbRepeat((prev) => {
      if (!prev.active || prev.pointA === null) {
        toast.success(`Point A set at ${formatTime(now)}`);
        return { active: true, pointA: now, pointB: null };
      }
      if (prev.pointB === null) {
        if (now <= prev.pointA) {
          toast.error('Point B must be after Point A');
          return prev;
        }
        toast.success(`A-B Repeat Active: ${formatTime(prev.pointA)} - ${formatTime(now)}`);
        return { active: true, pointA: prev.pointA, pointB: now };
      }
      // Reset
      toast.info('A-B Repeat Cleared');
      return { active: false, pointA: null, pointB: null };
    });
  }, [currentTime]);

  const applyQualitySelection = (levelIndex: number) => {
    const hls = hlsRef.current;
    if (!hls) return;

    if (levelIndex < 0) {
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
        triggerHudBadge(<Minimize2 className="w-7 h-7 text-white" />, 'Exit Fullscreen');
      } else {
        await container.requestFullscreen();
        triggerHudBadge(<Maximize2 className="w-7 h-7 text-white" />, 'Fullscreen');
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
        triggerHudBadge(<PictureInPicture2 className="w-7 h-7 text-white" />, 'PiP Enabled');
      }
    } catch (pipError) {
      logger.warn('PiP toggle failed', { pipError });
    }
  };

  const toggleFloating = useCallback(() => {
    if (!allowFloating) return;
    const next = !isFloating;
    if (onToggleFloating) {
      onToggleFloating(next);
    } else {
      setInternalFloating(next);
    }
    triggerHudBadge(
      <Layers className="w-7 h-7 text-white" />,
      next ? 'Mini Player' : 'Standard View'
    );
  }, [allowFloating, isFloating, onToggleFloating, triggerHudBadge]);

  const handleDownload = () => {
    const targetUrl = activeSrc || src;
    if (!targetUrl) return;
    if (!allowDownload) {
      toast.error('Download is disabled by policy');
      return;
    }
    if (!isSafeDownloadUrl(targetUrl)) {
      toast.error('Download blocked: unsupported or unsafe URL');
      logger.warn('Blocked unsafe download URL', { targetUrl });
      return;
    }
    try {
      const link = document.createElement('a');
      link.href = targetUrl;
      const fallbackName = title
        ? title.includes('.')
          ? title
          : `${title}.mp4`
        : `video-${Date.now()}.mp4`;
      const parsedName =
        !targetUrl.startsWith('blob:') && !targetUrl.startsWith('data:')
          ? targetUrl.split('/').pop()?.split('?')[0]
          : null;
      link.download = parsedName || fallbackName;
      if (!targetUrl.startsWith('blob:') && !targetUrl.startsWith('data:')) {
        link.target = '_blank';
      }
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Download started');
    } catch (err) {
      console.error('Download failed:', err);
      if (isSafeDownloadUrl(targetUrl)) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
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

  /* ---------------- ZERO-LAG INTERACTIVE GESTURE HANDLING ---------------- */

  const handleVideoAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const isLeft = clickX < rect.width / 2;
    const side = isLeft ? 'left' : 'right';
    const now = Date.now();

    // Check double tap within 300ms on the same side
    if (now - lastTapRef.current.time < 300 && lastTapRef.current.side === side) {
      const newCount = lastTapRef.current.count + 1;
      lastTapRef.current = { time: now, side, count: newCount };
      const skipSecs = 10 * newCount;

      if (side === 'left') {
        seekRelative(-10);
      } else {
        seekRelative(10);
      }

      setSkipRipple({ side, seconds: skipSecs, key: now });
      if (skipRippleTimer.current) clearTimeout(skipRippleTimer.current);
      skipRippleTimer.current = setTimeout(() => {
        setSkipRipple(null);
        lastTapRef.current = { time: 0, side: 'left', count: 0 };
      }, 700);
      return;
    }

    // Single Tap / Click: instant response with zero lag!
    lastTapRef.current = { time: now, side, count: 1 };
    if (!showControls) {
      setShowControls(true);
      resetHideTimer();
    } else {
      togglePlay();
    }
  };

  /* ---------------- AUTO HIDE CONTROLS ---------------- */

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (isPlaying && !error && !isSpeedMenuOpen) {
      hideTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPlaying, error, isSpeedMenuOpen]);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [isPlaying, error, isSpeedMenuOpen, resetHideTimer]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (badgeTimer.current) clearTimeout(badgeTimer.current);
      if (hudBadgeTimer.current) clearTimeout(hudBadgeTimer.current);
      if (skipRippleTimer.current) clearTimeout(skipRippleTimer.current);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      const video = videoRef.current;
      if (!video) return;
      try {
        video.pause();
      } catch {
        /* ignore */
      }
      try {
        video.srcObject = null;
      } catch {
        /* ignore */
      }
      try {
        video.removeAttribute('src');
      } catch {
        /* ignore */
      }
      try {
        video.load();
      } catch {
        /* ignore */
      }
    };
  }, []);

  /* ---------------- KEYBOARD SHORTCUTS ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current;
      const container = containerRef.current;
      if (!video || !container || error) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        typeof (target as any).tagName === 'string' &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      const isNode = typeof Node !== 'undefined' && target instanceof Node;
      if (
        isNode &&
        target !== document.body &&
        target !== document.documentElement &&
        !container.contains(target)
      ) {
        return;
      }

      // Space or K: Play / Pause
      if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        const wasPaused = video.paused;
        togglePlay();
        if (wasPaused) {
          triggerHudBadge(<Play className="w-7 h-7 fill-white text-white" />, 'Play');
        } else {
          triggerHudBadge(<Pause className="w-7 h-7 fill-white text-white" />, 'Pause');
        }
        return;
      }

      // J: Rewind 10s
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        seekRelative(-10);
        triggerHudBadge(<RotateCcw className="w-7 h-7 text-white" />, '-10s');
        return;
      }

      // L: Forward 10s
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        seekRelative(10);
        triggerHudBadge(<RotateCw className="w-7 h-7 text-white" />, '+10s');
        return;
      }

      // ArrowLeft / ArrowRight: Frame step or 5s seek
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          seekRelative(10);
          triggerHudBadge(<RotateCw className="w-7 h-7 text-white" />, '+10s');
        } else if (video.paused) {
          seekRelative(1 / 30);
          triggerHudBadge(<RotateCw className="w-7 h-7 text-white" />, '+1 Frame');
        } else {
          seekRelative(5);
          triggerHudBadge(<RotateCw className="w-7 h-7 text-white" />, '+5s');
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          seekRelative(-10);
          triggerHudBadge(<RotateCcw className="w-7 h-7 text-white" />, '-10s');
        } else if (video.paused) {
          seekRelative(-1 / 30);
          triggerHudBadge(<RotateCcw className="w-7 h-7 text-white" />, '-1 Frame');
        } else {
          seekRelative(-5);
          triggerHudBadge(<RotateCcw className="w-7 h-7 text-white" />, '-5s');
        }
        return;
      }

      // Frame-by-frame: comma (,) and period (.)
      if (e.key === ',') {
        e.preventDefault();
        seekRelative(-1 / 30);
        triggerHudBadge(<RotateCcw className="w-7 h-7 text-white" />, '-1 Frame');
        return;
      }
      if (e.key === '.') {
        e.preventDefault();
        seekRelative(1 / 30);
        triggerHudBadge(<RotateCw className="w-7 h-7 text-white" />, '+1 Frame');
        return;
      }

      // M: Mute toggle
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
        return;
      }

      // F: Fullscreen toggle
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        void toggleFullscreen();
        return;
      }

      // P: PiP toggle
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        void togglePiP();
        return;
      }

      // I: Mini Floating Player toggle
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        toggleFloating();
        return;
      }

      // R: Looping toggle
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        toggleLoop();
        return;
      }

      // Number keys 0-9: Jump to percentage (0% to 90%)
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        const pct = parseInt(e.key, 10) * 10;
        const videoDuration = finiteOrZero(video.duration) || duration;
        const targetSec = (pct / 100) * videoDuration;
        video.currentTime = targetSec;
        setCurrentTime(targetSec);
        triggerHudBadge(<Play className="w-7 h-7 text-white" />, `${pct}%`);
        return;
      }

      // [ / ]: Decrease / Increase speed
      if (e.key === '[') {
        e.preventDefault();
        const idx = SPEED_OPTIONS.indexOf(playbackSpeed);
        if (idx > 0) setSpeed(SPEED_OPTIONS[idx - 1]);
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        const idx = SPEED_OPTIONS.indexOf(playbackSpeed);
        if (idx < SPEED_OPTIONS.length - 1) setSpeed(SPEED_OPTIONS[idx + 1]);
        return;
      }

      // ArrowUp / ArrowDown: Volume up/down 5%
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const nextVol = Math.min(100, Math.round(volume * 100) + 5);
        handleVolume(nextVol);
        triggerHudBadge(<Volume2 className="w-7 h-7 text-white" />, `${nextVol}%`);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextVol = Math.max(0, Math.round(volume * 100) - 5);
        handleVolume(nextVol);
        triggerHudBadge(
          nextVol === 0 ? (
            <VolumeX className="w-7 h-7 text-white" />
          ) : (
            <Volume1 className="w-7 h-7 text-white" />
          ),
          `${nextVol}%`
        );
        return;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    togglePlay,
    seekRelative,
    toggleMute,
    toggleFullscreen,
    togglePiP,
    toggleFloating,
    toggleLoop,
    duration,
    playbackSpeed,
    setSpeed,
    volume,
    handleVolume,
    triggerHudBadge,
    error,
  ]);

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

  /* ---------------- UI RENDER ---------------- */

  return (
    <motion.div
      ref={containerRef}
      layout={isFloating}
      drag={isFloating}
      dragMomentum={false}
      dragElastic={0.1}
      dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
      className={cn(
        'group relative flex items-center justify-center bg-black overflow-hidden select-none transition-all duration-300',
        isFloating
          ? 'fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[9999] w-[calc(100vw-2rem)] max-w-[280px] xs:max-w-[320px] sm:max-w-[360px] md:max-w-[380px] aspect-video rounded-2xl shadow-2xl ring-1 ring-white/20 border border-white/15 bg-black/95 backdrop-blur-2xl pointer-events-auto touch-manipulation cursor-grab active:cursor-grabbing'
          : effectiveAspectRatio && !error
            ? 'w-full h-full max-w-full max-h-full'
            : 'w-full h-full min-h-[220px] sm:min-h-[300px] max-w-full max-h-full',
        className
      )}
      style={{
        aspectRatio:
          !isFloating && effectiveAspectRatio && !error ? String(effectiveAspectRatio) : undefined,
        maxHeight: !isFloating ? 'min(82vh, calc(100dvh - 5.5rem))' : undefined,
        maxWidth: !isFloating ? 'min(96vw, 1500px)' : undefined,
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
      {/* FLOATING HEADER BAR */}
      {isFloating && (
        <div className="absolute top-0 left-0 right-0 h-8 sm:h-9 bg-black/85 backdrop-blur-md z-[35] flex items-center justify-between px-2.5 sm:px-3 border-b border-white/10 select-none">
          <div className="flex items-center gap-1.5 min-w-0">
            <GripHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/50 shrink-0" />
            <span className="text-white text-[11px] sm:text-xs font-semibold truncate max-w-[140px] xs:max-w-[180px] sm:max-w-[220px]">
              {title || 'Video'}
            </span>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                toggleFloating();
              }}
              aria-label="Restore standard player"
              title="Restore standard view"
              className="h-6 w-6 sm:h-7 sm:w-7 text-white/80 hover:text-white hover:bg-white/15 rounded-md"
            >
              <Maximize className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </Button>
            {onClose && (
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                aria-label="Close floating player"
                title="Close"
                className="h-6 w-6 sm:h-7 sm:w-7 text-white/80 hover:text-red-400 hover:bg-white/15 rounded-md"
              >
                <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* VIDEO ELEMENT */}
      <video
        ref={videoRef}
        src={activeSrc.includes('.m3u8') ? undefined : activeSrc}
        className={cn(
          'h-full w-full max-h-[min(82vh,calc(100dvh-5.5rem))] max-w-full object-contain transition-opacity duration-300',
          isMirrored ? 'scale-x-[-1]' : '',
          isFloating ? 'pt-8 pb-1' : ''
        )}
        preload="auto"
        playsInline
        autoPlay={autoPlay}
        loop={isLooping}
        muted={isMuted}
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

      {/* ZERO-LAG INTERACTIVE GESTURE & CLICK OVERLAY */}
      <div
        data-testid="video-gesture-area"
        className="absolute inset-0 z-[10] cursor-pointer touch-manipulation"
        onClick={handleVideoAreaClick}
      />

      {/* CENTER BIG PLAY/PAUSE BUTTON FOR INSTANT TOUCH/CLICK */}
      <AnimatePresence>
        {!isPlaying && isVideoReady && !error && showControls && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-[22] flex items-center justify-center pointer-events-none"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              aria-label="Play video"
              className="pointer-events-auto h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-black/60 hover:bg-black/80 active:scale-95 text-white backdrop-blur-md border border-white/25 shadow-2xl flex items-center justify-center transition-all hover:scale-105"
            >
              <Play className="h-6 w-6 sm:h-7 sm:w-7 fill-white text-white translate-x-0.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* YOUTUBE-STYLE DOUBLE TAP SKIP RIPPLE */}
      <AnimatePresence>
        {skipRipple && (
          <motion.div
            key={skipRipple.key}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.25 }}
            className={cn(
              'absolute top-0 bottom-0 w-1/2 z-[25] flex flex-col items-center justify-center bg-white/15 backdrop-blur-xs pointer-events-none select-none',
              skipRipple.side === 'left' ? 'left-0 rounded-r-[100px]' : 'right-0 rounded-l-[100px]'
            )}
          >
            <div className="flex flex-col items-center gap-1.5 text-white drop-shadow-2xl">
              {skipRipple.side === 'left' ? (
                <RotateCcw className="w-8 h-8 sm:w-10 sm:h-10 animate-pulse text-white" />
              ) : (
                <RotateCw className="w-8 h-8 sm:w-10 sm:h-10 animate-pulse text-white" />
              )}
              <span className="text-xs sm:text-sm font-bold tracking-wide">
                {skipRipple.side === 'left' ? `-${skipRipple.seconds}s` : `+${skipRipple.seconds}s`}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CENTRAL HUD BADGE (HOTKEYS & GESTURES) */}
      <AnimatePresence>
        {hudBadge && (
          <motion.div
            key={hudBadge.id}
            initial={{ opacity: 0, scale: 0.7, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: -10 }}
            transition={{ type: 'spring', damping: 20, stiffness: 350 }}
            className="absolute inset-0 z-[28] flex items-center justify-center pointer-events-none select-none"
          >
            <div className="flex flex-col items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-black/75 backdrop-blur-2xl border border-white/20 shadow-2xl text-white min-w-[100px]">
              {hudBadge.icon}
              <span className="text-xs sm:text-sm font-bold tracking-wide">{hudBadge.text}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LOADING SKELETON */}
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

      {/* BUFFER SPINNER */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a]/60 backdrop-blur-sm z-[20] pointer-events-none">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="animate-spin text-white w-8 h-8 opacity-75" />
            {reconnectMessage && <p className="text-[11px] text-white/70">{reconnectMessage}</p>}
          </div>
        </div>
      )}

      {/* PERFORMANCE HUD */}
      {showPerformanceHud && (
        <div className="absolute left-3 top-3 z-[40] rounded-md bg-black/60 px-2 py-1 text-[10px] text-white/80 font-mono">
          <p>Q: {hudState.level < 0 ? 'auto' : hudState.level}</p>
          <p>Label: {currentQualityLabel}</p>
          <p>Buf: {hudState.bufferAhead.toFixed(1)}s</p>
          <p>Drop: {hudState.droppedFrames}</p>
        </div>
      )}

      {/* TITLE OVERLAY (STANDARD VIEW) */}
      <AnimatePresence>
        {!isFloating && showControls && title && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-0 left-0 right-0 p-3 sm:p-4 pt-3 sm:pt-6 bg-gradient-to-b from-black/90 via-black/40 to-transparent z-[20] pointer-events-none"
          >
            <h3 className="text-white text-xs sm:text-sm md:text-base font-bold truncate drop-shadow-xl text-center px-4">
              {title}
            </h3>
          </motion.div>
        )}
      </AnimatePresence>

      {/* IN-BROWSER TRANSCODING OVERLAY */}
      {isTranscoding && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a]/95 backdrop-blur-md text-center p-6 z-[36]">
          <div className="max-w-xs w-full flex flex-col items-center gap-4">
            <div className="relative flex items-center justify-center">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <Play className="w-4 h-4 text-white absolute fill-white" />
            </div>
            <div className="w-full">
              <h4 className="text-white text-sm font-semibold mb-1">
                Converting Video in Browser (WASM)
              </h4>
              <p className="text-white/60 text-xs mb-3">
                {transcodeProgress?.message || 'Processing video streams...'}
              </p>
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(0,242,254,0.5)]"
                  style={{ width: `${transcodeProgress?.progress || 10}%` }}
                />
              </div>
              <span className="text-[11px] font-mono text-white/50 mt-1.5 block">
                {transcodeProgress?.progress || 0}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ERROR OVERLAY */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a]/95 backdrop-blur-md text-center p-4 sm:p-6 z-[35] overflow-y-auto">
          <div className="my-auto flex flex-col items-center justify-center max-w-md w-full py-4">
            <div className="bg-red-500/10 p-3 sm:p-4 rounded-2xl mb-3 ring-1 ring-red-500/20 shadow-lg shadow-red-500/5">
              <VideoOff className="text-red-400 w-7 h-7 sm:w-8 sm:h-8" />
            </div>
            <h4 className="text-white text-base sm:text-lg font-semibold mb-1.5 px-2">
              {error === PLAYER_ERROR_MESSAGES.UNSUPPORTED_FORMAT
                ? 'Video Format Not Supported'
                : 'Playback Error'}
            </h4>
            <p className="text-white/70 mb-5 text-xs sm:text-sm font-normal max-w-sm px-4 leading-relaxed">
              {error === PLAYER_ERROR_MESSAGES.UNSUPPORTED_FORMAT
                ? 'This device or browser cannot decode this video format natively (e.g. MKV, AVI, WMV, HEVC, or AC3 audio). You can convert it directly in your browser or download the original file.'
                : error}
            </p>
            <div className="flex flex-wrap gap-3 justify-center items-center px-2">
              {error === PLAYER_ERROR_MESSAGES.UNSUPPORTED_FORMAT && (
                <Button
                  onClick={handleTranscodeAndPlay}
                  aria-label="Convert and play in browser"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm px-4 py-2 sm:py-2.5 font-medium rounded-xl shadow-lg shadow-emerald-600/20 transition-all hover:scale-105 active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 mr-1.5 inline fill-white" />
                  Convert & Play (WASM)
                </Button>
              )}
              <Button
                onClick={handleDownload}
                aria-label="Download video"
                disabled={!allowDownload}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs sm:text-sm px-4 py-2 sm:py-2.5 font-medium rounded-xl shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95"
              >
                <Download className="w-3.5 h-3.5 mr-1.5 inline" />
                Download Video
              </Button>
              <Button
                onClick={() => {
                  setError(null);
                  setIsBuffering(true);
                  if (videoRef.current) {
                    videoRef.current.currentTime = 0;
                    videoRef.current.load();
                  }
                }}
                aria-label="Retry playback"
                variant="outline"
                className="bg-white/10 hover:bg-white/20 border-white/15 text-white text-xs sm:text-sm px-4 py-2 sm:py-2.5 font-medium rounded-xl transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 inline" />
                Retry Playback
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STREAMING BADGE */}
      <AnimatePresence>
        {showPlayingBadge && !isFloating && (
          <motion.div
            key="playing-badge"
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute top-4 left-4 z-[30] pointer-events-none"
          >
            <div className="flex items-center gap-2.5 px-2.5 py-1 rounded-xl bg-black/40 backdrop-blur-2xl border border-white/10 shadow-2xl">
              <div className="flex gap-1 items-end h-2.5 w-3.5">
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RESPONSIVE CONTROLS OVERLAY */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            key="video-controls"
            className={cn(
              'absolute bottom-0 left-0 right-0 z-[30] bg-gradient-to-t from-black/95 via-black/85 to-transparent backdrop-blur-md border-t border-white/10 select-none pointer-events-auto transition-all',
              isFloating
                ? 'px-2 py-1.5'
                : 'px-2 sm:px-4 pt-2.5 sm:pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] sm:pb-[calc(env(safe-area-inset-bottom,0px)+0.6rem)]'
            )}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            transition={{ duration: 0.15 }}
            onMouseEnter={() => {
              if (hideTimer.current) clearTimeout(hideTimer.current);
            }}
            onMouseLeave={() => {
              if (isPlaying && !error && !isSpeedMenuOpen) {
                hideTimer.current = setTimeout(() => setShowControls(false), 3000);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* SEEK BAR ROW */}
            <div className="flex items-center gap-1.5 sm:gap-2 text-white text-xs sm:text-sm mb-1 sm:mb-1.5 font-medium">
              <span className="w-[32px] sm:w-[42px] text-right shrink-0 font-mono text-[10px] sm:text-xs text-white/90">
                {formatTime(currentTime)}
              </span>

              <div className="flex-1">
                <CustomSlider
                  label="Seek video"
                  value={progress}
                  duration={duration}
                  pointA={abRepeat.pointA}
                  pointB={abRepeat.pointB}
                  onChange={handleSeek}
                  onDragStart={onSeekStart}
                  onDragEnd={onSeekEnd}
                  className={cn(isFloating ? 'h-1.5' : 'h-2')}
                  thumbClassName={cn(isFloating ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5')}
                />
              </div>

              <span className="w-[32px] sm:w-[42px] text-left shrink-0 font-mono text-[10px] sm:text-xs text-white/90">
                {formatTime(duration)}
              </span>
            </div>

            {/* ACTIONS ROW */}
            <div className="flex items-center justify-between gap-1 sm:gap-2">
              {/* LEFT CONTROLS (Playback & Audio) */}
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <Button
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  size="icon"
                  className={cn(
                    'shrink-0 rounded-lg bg-white/15 text-white hover:bg-white/25 active:scale-95 transition-all shadow-sm touch-manipulation',
                    isFloating ? 'h-7 w-7' : 'h-8 w-8 sm:h-9 sm:w-9'
                  )}
                >
                  {isPlaying ? (
                    <Pause
                      className={cn(
                        isFloating ? 'w-3.5 h-3.5' : 'w-4 h-4 sm:w-4.5 sm:h-4.5',
                        'fill-white'
                      )}
                    />
                  ) : (
                    <Play
                      className={cn(
                        isFloating ? 'w-3.5 h-3.5' : 'w-4 h-4 sm:w-4.5 sm:h-4.5',
                        'fill-white'
                      )}
                    />
                  )}
                </Button>

                {/* 10s Rewind (Tablet/Desktop) */}
                {!isFloating && (
                  <Button
                    onClick={() => seekRelative(-10)}
                    aria-label="Rewind 10 seconds"
                    title="Rewind 10s (J)"
                    size="icon"
                    className="hidden sm:inline-flex h-8 w-8 bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0 rounded-lg touch-manipulation"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                )}

                {/* 10s Forward (Tablet/Desktop) */}
                {!isFloating && (
                  <Button
                    onClick={() => seekRelative(10)}
                    aria-label="Forward 10 seconds"
                    title="Forward 10s (L)"
                    size="icon"
                    className="hidden sm:inline-flex h-8 w-8 bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0 rounded-lg touch-manipulation"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </Button>
                )}

                <Button
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  title="Mute (M)"
                  size="icon"
                  className={cn(
                    'shrink-0 rounded-lg bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all touch-manipulation',
                    isFloating ? 'h-7 w-7' : 'h-8 w-8 sm:h-9 sm:w-9'
                  )}
                >
                  {isMuted ? (
                    <VolumeX className={isFloating ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                  ) : volume > 0.5 ? (
                    <Volume2 className={isFloating ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                  ) : (
                    <Volume1 className={isFloating ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                  )}
                </Button>

                {/* Volume Slider - shown on tablet & desktop */}
                {!isFloating && (
                  <div className="hidden sm:block w-14 md:w-20 shrink-0">
                    <CustomSlider
                      label="Volume"
                      value={volume * 100}
                      onChange={handleVolume}
                      showHoverTooltip={false}
                      className="h-1.5"
                      thumbClassName="h-2.5 w-2.5"
                    />
                  </div>
                )}
              </div>

              {/* RIGHT CONTROLS */}
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 relative">
                {/* HLS QUALITY SELECTOR (Desktop/Tablet) */}
                {!isFloating && qualityOptions.length > 1 && (
                  <div className="hidden sm:block relative min-w-[54px] sm:min-w-[68px]">
                    <select
                      id="video-quality-select"
                      aria-label="Quality selector"
                      value={selectedQualityIndex}
                      onChange={(e) => {
                        applyQualitySelection(Number(e.target.value));
                      }}
                      className="h-8 w-full appearance-none rounded-lg border border-white/20 bg-black/60 pl-1.5 sm:pl-2 pr-4 sm:pr-5 text-[10px] sm:text-xs font-medium text-white outline-none transition-colors hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white/60 touch-manipulation"
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
                    <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-white/75" />
                  </div>
                )}

                {/* QUICK SPEED SELECTOR POPUP */}
                {!isFloating && (
                  <div className="relative" ref={speedMenuRef}>
                    <Button
                      onClick={() => {
                        if (!allowSpeedChange) return;
                        setIsSpeedMenuOpen((prev) => !prev);
                      }}
                      aria-label={`Playback speed: ${playbackSpeed}x`}
                      title="Playback speed"
                      disabled={!allowSpeedChange}
                      size="sm"
                      className={cn(
                        'h-8 px-1.5 sm:px-2 text-[10px] sm:text-xs font-semibold text-white active:scale-95 transition-all touch-manipulation min-w-[28px] sm:min-w-[32px] rounded-lg',
                        playbackSpeed !== 1
                          ? 'bg-primary/30 text-primary border border-primary/40'
                          : 'bg-white/10 hover:bg-white/20'
                      )}
                    >
                      {playbackSpeed}x
                    </Button>

                    {/* Speed Popup */}
                    <AnimatePresence>
                      {isSpeedMenuOpen && (
                        <motion.div
                          data-testid="speed-selector-popup"
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute bottom-full right-0 mb-2 p-2.5 rounded-xl bg-black/95 backdrop-blur-2xl border border-white/20 shadow-2xl z-[50] min-w-[160px]"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-white/10">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                              Playback Speed
                            </span>
                            <span className="text-[10px] text-white/40 font-mono">[ / ]</span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5">
                            {SPEED_OPTIONS.map((speed) => (
                              <button
                                key={speed}
                                onClick={() => setSpeed(speed)}
                                className={cn(
                                  'px-2 py-1.5 rounded-lg text-xs font-medium transition-all text-center touch-manipulation',
                                  playbackSpeed === speed
                                    ? 'bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20'
                                    : 'bg-white/10 text-white hover:bg-white/20 active:scale-95'
                                )}
                              >
                                {speed}x
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* LOOP TOGGLE BUTTON */}
                {!isFloating && (
                  <Button
                    onClick={toggleLoop}
                    aria-label={isLooping ? 'Disable Loop' : 'Enable Loop'}
                    title={isLooping ? 'Disable Loop (R)' : 'Enable Loop (R)'}
                    size="icon"
                    className={cn(
                      'h-8 w-8 active:scale-95 transition-all shrink-0 rounded-lg touch-manipulation',
                      isLooping
                        ? 'bg-primary/30 text-primary border border-primary/50'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    )}
                  >
                    {isLooping ? (
                      <Repeat1 className="w-3.5 h-3.5" />
                    ) : (
                      <Repeat className="w-3.5 h-3.5" />
                    )}
                  </Button>
                )}

                {/* A-B REPEAT (DESKTOP) */}
                {!isFloating && (
                  <Button
                    onClick={toggleABRepeat}
                    aria-label={
                      abRepeat.active
                        ? abRepeat.pointB !== null
                          ? 'Clear A-B Repeat'
                          : 'Set Point B'
                        : 'Set Point A'
                    }
                    title={
                      abRepeat.active
                        ? abRepeat.pointB !== null
                          ? `A-B Repeat Active (${formatTime(abRepeat.pointA!)} - ${formatTime(abRepeat.pointB!)})`
                          : `Point A set at ${formatTime(abRepeat.pointA!)}. Click to set Point B.`
                        : 'Set Point A (A-B Repeat)'
                    }
                    size="icon"
                    className={cn(
                      'hidden lg:inline-flex h-8 w-8 active:scale-95 transition-all shrink-0 rounded-lg touch-manipulation',
                      abRepeat.active
                        ? abRepeat.pointB !== null
                          ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                          : 'bg-amber-500/30 text-amber-300 border border-amber-500/50 animate-pulse'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    )}
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                  </Button>
                )}

                {/* MIRROR TOGGLE (TABLET/DESKTOP) */}
                {!isFloating && (
                  <Button
                    onClick={() => setIsMirrored((prev) => !prev)}
                    aria-label={isMirrored ? 'Unmirror video' : 'Mirror video'}
                    title={isMirrored ? 'Unmirror video' : 'Mirror video'}
                    size="icon"
                    className="hidden sm:inline-flex h-8 w-8 bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0 rounded-lg touch-manipulation"
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                  </Button>
                )}

                {/* PICTURE IN PICTURE (TABLET/DESKTOP) */}
                {!isFloating && (
                  <Button
                    onClick={togglePiP}
                    aria-label={isPiP ? 'Exit Picture in Picture' : 'Picture in Picture'}
                    title="Picture in Picture (P)"
                    disabled={!allowPiP}
                    size="icon"
                    className="hidden md:inline-flex h-8 w-8 bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0 rounded-lg touch-manipulation"
                  >
                    <PictureInPicture2 className="w-3.5 h-3.5" />
                  </Button>
                )}

                {/* MINI FLOATING PLAYER TOGGLE */}
                {allowFloating && (
                  <Button
                    onClick={toggleFloating}
                    aria-label={isFloating ? 'Exit Floating Player' : 'Floating Mini Player'}
                    title={isFloating ? 'Expand to Full Player (I)' : 'Minimize to Mini Player (I)'}
                    size="icon"
                    className={cn(
                      'active:scale-95 transition-all shrink-0 rounded-lg touch-manipulation',
                      isFloating
                        ? 'h-7 w-7 bg-primary/30 text-primary border border-primary/50'
                        : 'h-8 w-8 bg-white/10 text-white hover:bg-white/20'
                    )}
                  >
                    {isFloating ? (
                      <Maximize className="w-3.5 h-3.5" />
                    ) : (
                      <Layers className="w-3.5 h-3.5" />
                    )}
                  </Button>
                )}

                {/* INSTANT SNAPSHOT CAPTURE */}
                {!isFloating && (
                  <Button
                    onClick={captureSnapshot}
                    aria-label="Capture Snapshot Frame"
                    title="Capture Snapshot Frame"
                    size="icon"
                    className="hidden lg:inline-flex h-8 w-8 bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0 rounded-lg touch-manipulation"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </Button>
                )}

                {/* REFRESH (DESKTOP) */}
                {!isFloating && (
                  <Button
                    onClick={handleRefresh}
                    aria-label="Refresh video"
                    title="Refresh video"
                    size="icon"
                    className="hidden lg:inline-flex h-8 w-8 bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0 rounded-lg touch-manipulation"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                )}

                {/* DOWNLOAD (DESKTOP) */}
                {!isFloating && (
                  <Button
                    onClick={handleDownload}
                    aria-label="Download video"
                    title="Download video"
                    disabled={!allowDownload}
                    size="icon"
                    className="hidden md:inline-flex h-8 w-8 bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0 rounded-lg touch-manipulation"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </Button>
                )}

                {/* FULLSCREEN */}
                {!isFloating && (
                  <Button
                    onClick={() => {
                      void toggleFullscreen();
                    }}
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                    title="Fullscreen (F)"
                    disabled={!allowFullscreen}
                    size="icon"
                    className="h-8 w-8 sm:h-9 sm:w-9 bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all shrink-0 rounded-lg touch-manipulation"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4" />
                    ) : (
                      <Maximize2 className="w-4 h-4" />
                    )}
                  </Button>
                )}
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
