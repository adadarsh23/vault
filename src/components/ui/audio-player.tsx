'use client';

import React, { useRef, useState, useEffect, useCallback, memo, useId, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './Button';
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  Download,
  Sparkles,
  Check,
  Loader2,
  AudioLines,
  ChevronUp,
  Repeat,
  RefreshCw,
  ShieldCheck,
  Mic,
  Sliders,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { logger } from '../../lib/logger';
import {
  attachVoiceClarityToMediaElement,
  VoiceClarityPreset,
  VOICE_CLARITY_PRESETS,
} from '../../lib/audioDsp';

/* ---------------- SECURITY & HELPERS ---------------- */

export const isSafeDownloadUrl = (url: string): boolean => {
  if (!url) return false;
  if (url.startsWith('blob:') || url.startsWith('data:audio/')) return true;
  try {
    const parsed = new URL(
      url,
      typeof window !== 'undefined' ? window.location.href : 'http://localhost',
    );
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

/* ---------------- TIME FORMATTER ---------------- */

export const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

/* ---------------- CUSTOM SLIDER ---------------- */

export interface CustomSliderProps {
  value: number; // 0 to 100
  onChange: (value: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: (value: number) => void;
  className?: string;
  trackClassName?: string;
  activeColor?: string;
  ariaLabel?: string;
  duration?: number;
  showHoverTooltip?: boolean;
  disabled?: boolean;
  thumbSize?: 'sm' | 'md' | 'lg';
}

export const CustomSlider = memo(
  ({
    value,
    onChange,
    onSeekStart,
    onSeekEnd,
    className,
    trackClassName,
    activeColor = 'bg-primary',
    ariaLabel = 'Slider',
    duration = 0,
    showHoverTooltip = false,
    disabled = false,
    thumbSize = 'md',
  }: CustomSliderProps) => {
    const sliderRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const [dragPercent, setDragPercent] = useState<number | null>(null);
    const rafRef = useRef<number | null>(null);
    const [hoverPercent, setHoverPercent] = useState<number | null>(null);
    const [isPointerInside, setIsPointerInside] = useState(false);

    const getPercent = useCallback((clientX: number) => {
      const rect = sliderRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return 0;
      const x = clientX - rect.left;
      return Math.min(Math.max((x / rect.width) * 100, 0), 100);
    }, []);

    const scheduleUpdate = useCallback(
      (clientX: number) => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const pct = getPercent(clientX);
          onChange(pct);
          setHoverPercent(pct);
        });
      },
      [getPercent, onChange],
    );

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || (e.button !== undefined && e.button !== 0)) return;
      isDragging.current = true;
      onSeekStart?.();
      const pct = getPercent(e.clientX);
      setDragPercent(pct);
      scheduleUpdate(e.clientX);

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* fallback */
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (isDragging.current) {
        const pct = getPercent(e.clientX);
        setDragPercent(pct);
        scheduleUpdate(e.clientX);
      } else {
        const pct = getPercent(e.clientX);
        setHoverPercent(pct);
      }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDragging.current) {
        isDragging.current = false;
        const finalPct = getPercent(e.clientX);
        onChange(finalPct);
        onSeekEnd?.(finalPct);
        setDragPercent(null);
      }
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* fallback */
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const step = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = Math.min(value + step, 100);
        onChange(next);
        onSeekEnd?.(next);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.max(value - step, 0);
        onChange(next);
        onSeekEnd?.(next);
      } else if (e.key === 'Home') {
        e.preventDefault();
        onChange(0);
        onSeekEnd?.(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        onChange(100);
        onSeekEnd?.(100);
      }
    };

    useEffect(() => {
      return () => {
        isDragging.current = false;
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    }, []);

    const activePercent = isDragging.current && dragPercent !== null ? dragPercent : value;
    const clampedValue = Math.min(100, Math.max(0, isFinite(activePercent) ? activePercent : 0));
    const activeHoverPercent = isDragging.current ? clampedValue : hoverPercent;
    const hoverTime =
      activeHoverPercent !== null && duration > 0 ? (activeHoverPercent / 100) * duration : null;
    const clampedTooltipPercent =
      activeHoverPercent !== null ? Math.min(Math.max(activeHoverPercent, 8), 92) : 50;

    // Extract track height if passed via className (e.g. h-2, h-1.5) so outer container keeps comfortable hit target
    const heightMatch = className?.match(/\bh-(?:[0-9.]+|full)\b/);
    const resolvedTrackHeight =
      trackClassName || (heightMatch ? heightMatch[0] : thumbSize === 'sm' ? 'h-1.5' : 'h-2');
    const containerClasses = className
      ? className.replace(/\bh-(?:[0-9.]+|full)\b/g, '').trim()
      : '';

    return (
      <div
        ref={sliderRef}
        role="slider"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clampedValue)}
        aria-valuetext={
          duration > 0
            ? formatTime((clampedValue / 100) * duration)
            : `${Math.round(clampedValue)}%`
        }
        tabIndex={disabled ? -1 : 0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={() => {
          if (isDragging.current) {
            isDragging.current = false;
            setDragPercent(null);
          }
        }}
        onPointerEnter={() => setIsPointerInside(true)}
        onPointerLeave={() => {
          setIsPointerInside(false);
          if (!isDragging.current) setHoverPercent(null);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          'group/slider relative w-full h-7 flex items-center cursor-pointer touch-none outline-none select-none focus-visible:ring-2 focus-visible:ring-primary/60 transition-all',
          disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
          containerClasses,
        )}
      >
        {/* Track container */}
        <div
          className={cn(
            'relative w-full rounded-full bg-white/15 overflow-hidden',
            resolvedTrackHeight,
            trackClassName,
          )}
        >
          {/* Ghost hover bar */}
          {showHoverTooltip && hoverPercent !== null && isPointerInside && (
            <div
              className="absolute top-0 left-0 h-full bg-white/20 rounded-full pointer-events-none"
              style={{ width: `${hoverPercent}%` }}
            />
          )}

          {/* Active fill */}
          <div
            className={cn(
              'absolute top-0 left-0 h-full rounded-full shadow-[0_0_10px_rgba(0,242,254,0.3)] transition-[width] duration-75',
              activeColor,
            )}
            style={{ width: `${clampedValue}%` }}
          />
        </div>

        {/* Round Circle Thumb (Gol Circle UI) */}
        <div
          data-testid="slider-thumb"
          className={cn(
            'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white transition-all duration-100 ease-out cursor-grab active:cursor-grabbing pointer-events-none z-20 flex items-center justify-center opacity-100',
            thumbSize === 'sm'
              ? 'w-2.5 h-2.5 ring-1.5 ring-white/80 shadow-sm'
              : 'w-3 h-3 sm:w-3.5 sm:h-3.5 ring-2 ring-primary shadow-[0_0_10px_rgba(0,242,254,0.7)]',
            isDragging.current || isPointerInside
              ? 'scale-125 shadow-[0_0_14px_rgba(0,242,254,0.9)]'
              : 'scale-100',
          )}
          style={{
            left: `${clampedValue}%`,
          }}
        >
          {/* Inner core circle dot */}
          {thumbSize !== 'sm' && <div className="w-1 h-1 rounded-full bg-primary/90" />}
        </div>

        {/* Scrubbing preview tooltip */}
        {showHoverTooltip && (isPointerInside || isDragging.current) && hoverTime !== null && (
          <div
            className="absolute bottom-full mb-2 -translate-x-1/2 pointer-events-none flex flex-col items-center select-none z-30"
            style={{ left: `${clampedTooltipPercent}%` }}
          >
            <div className="px-2 py-0.5 bg-black/90 text-white font-mono text-[11px] font-semibold rounded-md shadow-xl border border-white/20 backdrop-blur-md whitespace-nowrap">
              {formatTime(hoverTime)}
            </div>
            <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-black/90 mt-[-1px]" />
          </div>
        )}
      </div>
    );
  },
);

CustomSlider.displayName = 'CustomSlider';

/* ---------------- INTERACTIVE WAVEFORM ---------------- */

interface InteractiveWaveformProps {
  peaks: number[];
  progress: number; // 0 to 100
  duration: number;
  onSeek: (percent: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: (percent: number) => void;
  isGenerating?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

const InteractiveWaveform = memo(
  ({
    peaks,
    progress,
    duration,
    onSeek,
    onSeekStart,
    onSeekEnd,
    isGenerating = false,
    disabled = false,
    compact = false,
  }: InteractiveWaveformProps) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const [dragPercent, setDragPercent] = useState<number | null>(null);
    const rafRef = useRef<number | null>(null);
    const [hoverPercent, setHoverPercent] = useState<number | null>(null);
    const [isHovered, setIsHovered] = useState(false);

    const getPercent = useCallback((clientX: number) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return 0;
      const x = clientX - rect.left;
      return Math.min(Math.max((x / rect.width) * 100, 0), 100);
    }, []);

    const scheduleSeek = useCallback(
      (clientX: number) => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const pct = getPercent(clientX);
          onSeek(pct);
          setHoverPercent(pct);
        });
      },
      [getPercent, onSeek],
    );

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || isGenerating || (e.button !== undefined && e.button !== 0)) return;
      isDragging.current = true;
      onSeekStart?.();
      const pct = getPercent(e.clientX);
      setDragPercent(pct);
      scheduleSeek(e.clientX);

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* fallback */
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || isGenerating) return;
      if (isDragging.current) {
        const pct = getPercent(e.clientX);
        setDragPercent(pct);
        scheduleSeek(e.clientX);
      } else {
        const pct = getPercent(e.clientX);
        setHoverPercent(pct);
      }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDragging.current) {
        isDragging.current = false;
        const finalPct = getPercent(e.clientX);
        onSeek(finalPct);
        onSeekEnd?.(finalPct);
        setDragPercent(null);
      }
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* fallback */
      }
    };

    useEffect(() => {
      return () => {
        isDragging.current = false;
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    }, []);

    const activeProgress = isDragging.current && dragPercent !== null ? dragPercent : progress;
    const clampedProgress = Math.min(
      100,
      Math.max(0, isFinite(activeProgress) ? activeProgress : 0),
    );
    const activeHoverPercent = isDragging.current ? clampedProgress : hoverPercent;
    const hoverTime =
      activeHoverPercent !== null && duration > 0 ? (activeHoverPercent / 100) * duration : null;
    const clampedTooltipPercent =
      activeHoverPercent !== null ? Math.min(Math.max(activeHoverPercent, 8), 92) : 50;

    // Loading skeleton placeholder with animated waves
    if (isGenerating || peaks.length === 0) {
      return (
        <div
          className={cn(
            'relative w-full rounded-2xl bg-white/[0.04] border border-white/5 flex items-center justify-center overflow-hidden px-4 select-none',
            compact ? 'h-10' : 'h-14 sm:h-16',
          )}
        >
          <div className="flex items-center gap-1 w-full justify-between opacity-50">
            {Array.from({ length: 48 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 bg-gradient-to-t from-primary/30 to-primary/60 rounded-full animate-pulse"
                style={{
                  height: `${20 + Math.sin(i * 0.35) * 45 + (i % 5) * 8}%`,
                  animationDelay: `${(i % 12) * 80}ms`,
                  animationDuration: '1.2s',
                }}
              />
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] gap-2 text-xs font-medium text-white/70">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="text-[11px] tracking-wide uppercase font-semibold">
              Generating Waveform...
            </span>
          </div>
        </div>
      );
    }

    return (
      <div
        ref={rootRef}
        role="slider"
        aria-label="Waveform seek bar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clampedProgress)}
        aria-valuetext={formatTime((clampedProgress / 100) * duration)}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={() => {
          if (isDragging.current) {
            isDragging.current = false;
            setDragPercent(null);
          }
        }}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => {
          setIsHovered(false);
          if (!isDragging.current) setHoverPercent(null);
        }}
        className={cn(
          'group/waveform relative w-full rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-colors cursor-pointer touch-none select-none px-2 sm:px-3 flex items-center overflow-hidden',
          compact ? 'h-11' : 'h-14 sm:h-16',
          disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
        )}
      >
        {/* Bars Container */}
        <div className="flex items-center gap-[1.5px] sm:gap-[2.5px] w-full h-full py-2">
          {peaks.map((peak, idx) => {
            const barPercent = (idx / peaks.length) * 100;
            const isPlayed = barPercent <= clampedProgress;
            const isHoverPreview =
              activeHoverPercent !== null &&
              barPercent > clampedProgress &&
              barPercent <= activeHoverPercent;

            const heightPct = Math.max(12, Math.min(100, Math.round(peak * 100)));

            return (
              <div
                key={idx}
                className={cn(
                  'flex-1 min-w-[1.5px] rounded-full transition-colors duration-100',
                  isPlayed
                    ? 'bg-primary shadow-[0_0_8px_rgba(0,242,254,0.4)]'
                    : isHoverPreview
                      ? 'bg-primary/50'
                      : 'bg-white/20 group-hover/waveform:bg-white/30',
                )}
                style={{
                  height: `${heightPct}%`,
                }}
              />
            );
          })}
        </div>

        {/* Playhead Indicator Line & Round Circle Thumb (Gol Circle UI) */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-primary shadow-[0_0_10px_rgba(0,242,254,0.8)] pointer-events-none z-10"
          style={{ left: `${clampedProgress}%` }}
        >
          {/* Round Circle Playhead Knob */}
          <div
            data-testid="waveform-thumb"
            className={cn(
              'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-white ring-2 ring-primary shadow-[0_0_10px_rgba(0,242,254,0.8)] transition-all duration-100 ease-out z-20 flex items-center justify-center pointer-events-none opacity-100',
              isHovered || isDragging.current
                ? 'scale-125 shadow-[0_0_14px_rgba(0,242,254,0.95)]'
                : 'scale-100',
            )}
          >
            <div className="w-1 h-1 rounded-full bg-primary/90" />
          </div>
        </div>

        {/* Hover Needle Line */}
        {(isHovered || isDragging.current) && activeHoverPercent !== null && (
          <div
            className="absolute top-0 bottom-0 w-[1px] bg-white/60 pointer-events-none z-10"
            style={{ left: `${activeHoverPercent}%` }}
          />
        )}

        {/* Hover Tooltip */}
        {(isHovered || isDragging.current) && hoverTime !== null && (
          <div
            className="absolute bottom-full mb-2 -translate-x-1/2 pointer-events-none flex flex-col items-center select-none z-30 animate-in fade-in zoom-in-95 duration-100"
            style={{ left: `${clampedTooltipPercent}%` }}
          >
            <div className="px-2 py-0.5 bg-black/95 text-white font-mono text-[11px] font-semibold rounded-md shadow-xl border border-white/20 backdrop-blur-md whitespace-nowrap">
              {formatTime(hoverTime)}
            </div>
            <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-black/95 mt-[-1px]" />
          </div>
        )}
      </div>
    );
  },
);

InteractiveWaveform.displayName = 'InteractiveWaveform';

/* ---------------- AUDIO PLAYER ---------------- */

export interface AudioPlayerProps {
  src: string;
  title?: string;
  className?: string;
  isWaveformEnabled?: boolean;
  compact?: boolean;
  fileSize?: number;
  autoPlay?: boolean;
  loop?: boolean;
  initialVoiceClarityPreset?: VoiceClarityPreset;
  initialDuration?: number;
  onEnded?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
}

export const AudioPlayer = ({
  src,
  title,
  className,
  isWaveformEnabled = false,
  compact = false,
  fileSize,
  autoPlay = false,
  loop = false,
  initialVoiceClarityPreset,
  initialDuration,
  onEnded,
  onPlay,
  onPause,
}: AudioPlayerProps) => {
  const playerId = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const lastVolume = useRef(1);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(
    initialDuration && isFinite(initialDuration) && initialDuration > 0 ? initialDuration : 0,
  );
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(loop);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isWaiting, setIsWaiting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showRemainingTime, setShowRemainingTime] = useState(false);

  // Waveform state
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [isGeneratingWaveform, setIsGeneratingWaveform] = useState(false);
  const [waveformFailed, setWaveformFailed] = useState(false);
  const isSeekingRef = useRef(false);

  useEffect(() => {
    if (initialDuration && isFinite(initialDuration) && initialDuration > 0) {
      setDuration((prev) => (prev <= 0 || !isFinite(prev) ? initialDuration : prev));
    }
  }, [initialDuration]);

  // Voice Clarity DSP
  const [voiceClarityPreset, setVoiceClarityPreset] = useState<VoiceClarityPreset>(
    initialVoiceClarityPreset && initialVoiceClarityPreset in VOICE_CLARITY_PRESETS
      ? initialVoiceClarityPreset
      : 'off',
  );
  const [isDspMenuOpen, setIsDspMenuOpen] = useState(false);
  const dspMenuRef = useRef<HTMLDivElement>(null);
  const dspButtonRef = useRef<HTMLButtonElement>(null);
  const dspPopoverRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{
    bottom?: number;
    top?: number;
    left: number;
    width: number;
    arrowLeft: number;
    placement: 'up' | 'down';
  }>({
    bottom: 50,
    left: 16,
    width: 215,
    arrowLeft: 20,
    placement: 'up',
  });
  const dspControllerRef = useRef<{
    setPreset: (p: VoiceClarityPreset) => void;
    destroy: () => void;
  } | null>(null);

  const MAX_WAVEFORM_SIZE = 8 * 1024 * 1024; // 8 MB
  const isTooLarge = fileSize !== undefined && fileSize > MAX_WAVEFORM_SIZE;
  const shouldShowWaveform =
    isWaveformEnabled && !isTooLarge && !waveformFailed && waveformPeaks.length > 0;
  const isLive = !isFinite(duration) || (duration === 0 && currentTime > 0);
  const showSpinner = (isLoading || isWaiting) && isPlaying;

  // Track / File Name label
  const displayName = useMemo(() => {
    if (title) return title;
    if (!src || src.startsWith('blob:') || src.startsWith('data:')) return 'Audio Recording';
    try {
      const clean = src.split('?')[0].split('#')[0];
      const filename = clean.split('/').pop();
      return filename ? decodeURIComponent(filename) : 'Audio Track';
    } catch {
      return 'Audio Track';
    }
  }, [title, src]);

  const updateMenuPosition = useCallback(() => {
    if (!dspButtonRef.current || typeof window === 'undefined') return;
    const rect = dspButtonRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Popover target width (ultra-compact: 215px)
    const targetWidth = Math.min(215, viewportWidth - 24);

    const spaceAbove = rect.top;
    const spaceBelow = viewportHeight - rect.bottom;

    // Prefer opening upward as requested, only flip downward if space above is tight (< 260px) and space below has more room
    const shouldOpenDownward = spaceAbove < 260 && spaceBelow > spaceAbove;
    const placement: 'up' | 'down' = shouldOpenDownward ? 'down' : 'up';

    // Horizontal positioning: align with button left, but clamp within viewport boundaries
    const idealLeft = rect.left;
    const clampedLeft = Math.max(12, Math.min(idealLeft, viewportWidth - targetWidth - 12));

    // Arrow notch alignment pointing straight to the DSP button center
    const buttonCenterX = rect.left + rect.width / 2;
    const arrowLeft = Math.max(16, Math.min(buttonCenterX - clampedLeft - 6, targetWidth - 28));

    if (placement === 'up') {
      setMenuPosition({
        bottom: viewportHeight - rect.top + 8,
        left: clampedLeft,
        width: targetWidth,
        arrowLeft,
        placement: 'up',
      });
    } else {
      setMenuPosition({
        top: rect.bottom + 8,
        left: clampedLeft,
        width: targetWidth,
        arrowLeft,
        placement: 'down',
      });
    }
  }, []);

  const toggleDspMenu = useCallback(() => {
    setIsDspMenuOpen((prev) => {
      const next = !prev;
      if (next) {
        updateMenuPosition();
      }
      return next;
    });
  }, [updateMenuPosition]);

  // Track window resize and scroll to keep portaled popover aligned with trigger button
  useEffect(() => {
    if (!isDspMenuOpen) return;
    updateMenuPosition();

    const handleScrollOrResize = () => {
      updateMenuPosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isDspMenuOpen, updateMenuPosition]);

  // Handle Preset Change with Web Audio Single-Source Lifecycle
  const handleSelectPreset = useCallback((preset: VoiceClarityPreset) => {
    const audio = audioRef.current;
    if (!audio) return;

    setVoiceClarityPreset(preset);
    setIsDspMenuOpen(false);

    if (!dspControllerRef.current) {
      if (preset !== 'off') {
        dspControllerRef.current = attachVoiceClarityToMediaElement(audio, preset);
      }
    } else {
      dspControllerRef.current.setPreset(preset);
    }
  }, []);

  // Close DSP menu when clicking outside or pressing Escape (supports portaled popover ref)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        (dspButtonRef.current && dspButtonRef.current.contains(target)) ||
        (dspMenuRef.current && dspMenuRef.current.contains(target)) ||
        (dspPopoverRef.current && dspPopoverRef.current.contains(target))
      ) {
        return;
      }
      setIsDspMenuOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDspMenuOpen(false);
      }
    };

    if (isDspMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside, { passive: true });
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDspMenuOpen]);

  // Coordinate playing instances across the app so only one track plays at a time
  useEffect(() => {
    const handleOtherAudioPlay = (e: Event) => {
      const customEvent = e as CustomEvent<{ playerId: string }>;
      if (customEvent.detail?.playerId !== playerId) {
        if (audioRef.current && !audioRef.current.paused) {
          try {
            audioRef.current.pause();
          } catch {
            /* ignore */
          }
          setIsPlaying(false);
        }
      }
    };

    window.addEventListener('vault-audio-play', handleOtherAudioPlay);
    return () => {
      window.removeEventListener('vault-audio-play', handleOtherAudioPlay);
    };
  }, [playerId]);

  // Sync state with audio element changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleRateChange = () => setPlaybackSpeed(audio.playbackRate);
    const handleWaiting = () => setIsWaiting(true);
    const handlePlaying = () => {
      setIsWaiting(false);
      setIsLoading(false);
      setIsPlaying(true);
      setHasError(false);
      onPlay?.();
    };
    const handlePlay = () => {
      setIsPlaying(true);
      setHasError(false);
    };
    const handlePause = () => {
      setIsPlaying(false);
      onPause?.();
    };
    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };
    const handleCanPlay = () => {
      setIsLoading(false);
      setIsWaiting(false);
      setHasError(false);
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const handleDurationChange = () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const syncVolume = () => {
      setVolume(audio.volume);
      setIsMuted(audio.muted);
    };

    if (audio.readyState >= 2) {
      setIsLoading(false);
      setIsWaiting(false);
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    }

    audio.addEventListener('ratechange', handleRateChange);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('volumechange', syncVolume);

    return () => {
      audio.removeEventListener('ratechange', handleRateChange);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('volumechange', syncVolume);
    };
  }, [onPlay, onPause, onEnded]);

  // MediaSession API integration
  useEffect(() => {
    if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: displayName,
          artist: 'Vault Audio',
        });

        navigator.mediaSession.setActionHandler('play', () => {
          const audio = audioRef.current;
          if (audio) {
            playPromiseRef.current = audio.play();
            playPromiseRef.current
              ?.then(() => {
                window.dispatchEvent(new CustomEvent('vault-audio-play', { detail: { playerId } }));
              })
              .catch(() => {});
          }
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          audioRef.current?.pause();
        });
      } catch {
        /* ignore */
      }
    }
  }, [playerId, displayName]);

  // Clean unmount teardown
  useEffect(() => {
    return () => {
      if (dspControllerRef.current) {
        dspControllerRef.current.destroy();
        dspControllerRef.current = null;
      }
      const audio = audioRef.current;
      if (audio) {
        if (playPromiseRef.current) {
          playPromiseRef.current.catch(() => {});
        }
        try {
          audio.pause();
        } catch {
          /* ignore */
        }
        try {
          audio.removeAttribute('src');
          audio.load();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  // Source change handling with AbortController
  useEffect(() => {
    const abortController = new AbortController();
    setHasError(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsLoading(true);
    setIsWaiting(false);
    setWaveformPeaks([]);
    setWaveformFailed(false);

    if (audioRef.current && src) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current.playbackRate = 1;
        audioRef.current.load();
      } catch {
        /* ignore */
      }
    } else {
      setIsLoading(false);
    }

    if (shouldShowWaveform && src) {
      void generateWaveform(src, abortController.signal);
    }

    return () => {
      abortController.abort();
    };
  }, [src, shouldShowWaveform]);

  // Generate normalized peaks for waveform visualization
  const generateWaveform = async (audioUrl: string, signal: AbortSignal) => {
    if (!audioUrl) return;
    setIsGeneratingWaveform(true);
    let audioCtx: AudioContext | null = null;

    try {
      const response = await fetch(audioUrl, { signal });
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size > MAX_WAVEFORM_SIZE) {
          setWaveformFailed(true);
          return;
        }
      }

      const arrayBuffer = await response.arrayBuffer();
      if (signal.aborted) return;

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        setWaveformFailed(true);
        return;
      }

      audioCtx = new AudioCtxClass();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      if (signal.aborted) return;
      if (!audioBuffer || audioBuffer.numberOfChannels === 0 || audioBuffer.length === 0) {
        setWaveformFailed(true);
        return;
      }

      const channelData = audioBuffer.getChannelData(0);
      const samples = 84;
      const blockSize = Math.floor(channelData.length / samples);
      const rawPeaks: number[] = [];

      const step = Math.max(1, Math.floor(blockSize / 20));
      for (let i = 0; i < samples; i++) {
        let max = 0;
        const start = i * blockSize;
        for (let j = 0; j < blockSize; j += step) {
          const val = Math.abs(channelData[start + j]);
          if (val > max) max = val;
        }
        rawPeaks.push(max);
      }

      // Normalize peaks so quiet audio memos still look crisp and dynamic
      const maxPeak = Math.max(...rawPeaks, 0.001);
      const normalizedPeaks = rawPeaks.map((p) => Math.min(1, p / maxPeak));

      if (isFinite(audioBuffer.duration) && audioBuffer.duration > 0) {
        setDuration((prev) => (prev <= 0 || !isFinite(prev) ? audioBuffer.duration : prev));
      }

      if (!signal.aborted) {
        setWaveformPeaks(normalizedPeaks);
      }
    } catch (err: any) {
      if (!signal.aborted && err?.name !== 'AbortError') {
        setWaveformFailed(true);
        logger.warn('Waveform generation fallback to standard seekbar', { error: err?.message });
      }
    } finally {
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
      if (!signal.aborted) {
        setIsGeneratingWaveform(false);
      }
    }
  };

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    if (hasError) {
      setHasError(false);
      setIsLoading(true);
      try {
        audio.load();
        playPromiseRef.current = audio.play();
        await playPromiseRef.current;
        setIsPlaying(true);
        window.dispatchEvent(new CustomEvent('vault-audio-play', { detail: { playerId } }));
      } catch (e: any) {
        if (e?.name !== 'AbortError' && e?.name !== 'NotAllowedError') {
          setHasError(true);
          logger.warn('Audio retry playback failed', { error: e });
        } else if (e?.name === 'NotAllowedError') {
          setIsPlaying(false);
        }
        setIsLoading(false);
      } finally {
        playPromiseRef.current = null;
      }
      return;
    }

    if (audio.paused) {
      try {
        setIsWaiting(false);
        playPromiseRef.current = audio.play();
        await playPromiseRef.current;
        setIsPlaying(true);
        setHasError(false);
        window.dispatchEvent(new CustomEvent('vault-audio-play', { detail: { playerId } }));
      } catch (e: any) {
        if (e?.name !== 'AbortError' && e?.name !== 'NotAllowedError') {
          setHasError(true);
          logger.warn('Audio playback initiation failed', { error: e });
        } else if (e?.name === 'NotAllowedError') {
          setIsPlaying(false);
        }
      } finally {
        playPromiseRef.current = null;
      }
    } else {
      if (playPromiseRef.current) {
        try {
          await playPromiseRef.current;
        } catch {
          /* ignore */
        }
      }
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      setIsPlaying(false);
    }
  }, [src, hasError, playerId]);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      if (!isSeekingRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
      const d = audioRef.current.duration;
      if (isFinite(d) && d > 0 && d !== duration) {
        setDuration(d);
      }
    }
  }, [duration]);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      const d = audioRef.current.duration;
      if (isFinite(d) && d > 0) {
        setDuration(d);
      }
      setIsLoading(false);
      setIsWaiting(false);
      setHasError(false);
      if (playbackSpeed !== 1) {
        audioRef.current.playbackRate = playbackSpeed;
      }
      if (autoPlay) {
        void togglePlay();
      }
    }
  }, [autoPlay, playbackSpeed, togglePlay]);

  const handleError = useCallback(() => {
    if (!src) return;
    setIsPlaying(false);
    setIsLoading(false);
    setIsWaiting(false);
    setHasError(true);
    const errCode = audioRef.current?.error?.code;
    logger.warn('HTML5 Audio playback error encountered', { code: errCode, src: displayName });
  }, [src, displayName]);

  const handleSeekStart = useCallback(() => {
    isSeekingRef.current = true;
  }, []);

  const handleSeek = useCallback(
    (percent: number) => {
      const audio = audioRef.current;
      if (audio && !hasError) {
        const d = duration || audio.duration || 0;
        if (!isFinite(d) || d <= 0) return;

        const clampedPercent = Math.min(100, Math.max(0, percent));
        const time = (clampedPercent / 100) * d;
        if (isFinite(time)) {
          setCurrentTime(time);
        }
      }
    },
    [duration, hasError],
  );

  const handleSeekEnd = useCallback(
    (percent: number) => {
      const audio = audioRef.current;
      if (audio && !hasError) {
        const d = duration || audio.duration || 0;
        if (isFinite(d) && d > 0) {
          const clampedPercent = Math.min(100, Math.max(0, percent));
          const time = (clampedPercent / 100) * d;
          if (isFinite(time)) {
            try {
              audio.currentTime = time;
            } catch {
              /* ignore */
            }
            setCurrentTime(time);
          }
        }
      }
      isSeekingRef.current = false;
    },
    [duration, hasError],
  );

  const handleVolumeChange = useCallback((value: number) => {
    const v = Math.min(1, Math.max(0, value / 100));
    if (v > 0) lastVolume.current = v;
    if (audioRef.current) {
      try {
        audioRef.current.volume = v;
        audioRef.current.muted = v === 0;
      } catch {
        /* iOS Safari disallows volume modifications on HTMLMediaElement */
      }
    }
    setVolume(v);
    setIsMuted(v === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const newMuted = !isMuted;
    try {
      audio.muted = newMuted;
    } catch {
      /* ignore */
    }
    setIsMuted(newMuted);

    if (!newMuted && volume === 0) {
      const restored = lastVolume.current > 0 ? lastVolume.current : 0.7;
      try {
        audio.volume = restored;
      } catch {
        /* ignore */
      }
      setVolume(restored);
    }
  }, [isMuted, volume]);

  const handleSpeedChange = useCallback(() => {
    const speeds = [1, 1.25, 1.5, 2];
    const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
    setPlaybackSpeed(nextSpeed);
  }, [playbackSpeed]);

  const toggleLoop = useCallback(() => {
    setIsLooping((prev) => !prev);
  }, []);

  const skip = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (isLive) {
        audio.currentTime = Math.max(0, audio.currentTime + seconds);
        return;
      }

      const d = duration || audio.duration || 0;
      const newTime = Math.min(Math.max(audio.currentTime + seconds, 0), d);
      audio.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration, isLive],
  );

  const handleDownload = useCallback(async () => {
    if (!src || !isSafeDownloadUrl(src)) return;
    try {
      const link = document.createElement('a');
      link.href = src;
      const cleanName =
        displayName.endsWith('.mp3') ||
        displayName.endsWith('.wav') ||
        displayName.endsWith('.m4a') ||
        displayName.endsWith('.ogg') ||
        displayName.endsWith('.webm')
          ? displayName
          : `${displayName}.mp3`;
      link.download = cleanName;
      link.rel = 'noopener noreferrer';
      if (!src.startsWith('blob:') && !src.startsWith('data:')) {
        link.target = '_blank';
      }
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      const link = document.createElement('a');
      link.href = src;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
    }
  }, [src, displayName]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }

    if (e.key === 'Escape' && isDspMenuOpen) {
      e.preventDefault();
      setIsDspMenuOpen(false);
      return;
    }

    if (e.target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) {
      return;
    }

    if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      void togglePlay();
    } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
      e.preventDefault();
      skip(e.shiftKey ? -10 : -5);
    } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
      e.preventDefault();
      skip(e.shiftKey ? 10 : 5);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleVolumeChange(Math.min(100, (volume + 0.05) * 100));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleVolumeChange(Math.max(0, (volume - 0.05) * 100));
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleMute();
    } else if (e.key === 'Home') {
      e.preventDefault();
      handleSeek(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      handleSeek(100);
    }
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label={`Audio player: ${displayName}`}
      className={cn(
        'w-full max-w-lg bg-card/70 backdrop-blur-2xl border border-white/10 rounded-3xl p-3.5 sm:p-5 md:p-6 shadow-2xl relative outline-none focus-visible:ring-2 focus-visible:ring-primary/40 select-none transition-all',
        compact && 'p-2.5 sm:p-3.5 rounded-2xl max-w-none',
        className,
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        loop={isLooping}
        playsInline
        {...({ 'webkit-playsinline': 'true' } as any)}
        crossOrigin={
          src && (src.startsWith('blob:') || src.startsWith('data:')) ? undefined : 'anonymous'
        }
        controls={false}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={() => {
          setIsLoading(false);
          setIsWaiting(false);
          setHasError(false);
        }}
        onError={handleError}
        onPlay={() => {
          setIsPlaying(true);
          setHasError(false);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* TOP BAR: TRACK STATUS & TIME */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-3.5',
          compact && 'mb-2',
        )}
      >
        {/* Left Status Badge */}
        <div className="flex items-center gap-2 min-w-0">
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 shrink-0"
          >
            {hasError ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider">
                  Load Error
                </span>
              </>
            ) : isWaiting ? (
              <>
                <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
                <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                  Buffering
                </span>
              </>
            ) : isLoading ? (
              <>
                <Loader2 className="h-2.5 w-2.5 animate-spin text-white/50" />
                <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">
                  Loading
                </span>
              </>
            ) : isGeneratingWaveform ? (
              <>
                <AudioLines className="h-2.5 w-2.5 text-cyan-400 animate-pulse" />
                <span className="text-[10px] font-semibold text-cyan-300 uppercase tracking-wider">
                  Analyzing
                </span>
              </>
            ) : isPlaying ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
                <span className="text-[10px] font-semibold text-emerald-300 uppercase tracking-wider">
                  Playing
                </span>
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                <span className="text-[10px] font-semibold text-white/50 uppercase tracking-wider">
                  {isLive ? 'Live' : 'Ready'}
                </span>
              </>
            )}
          </div>

          {/* Active DSP Indicator Chip */}
          {voiceClarityPreset !== 'off' && (
            <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-[10px] font-semibold text-cyan-300 shrink-0 animate-in fade-in duration-200">
              <Sparkles className="h-2.5 w-2.5 text-cyan-400" />
              <span>{VOICE_CLARITY_PRESETS[voiceClarityPreset].name.split(' ')[0]}</span>
            </div>
          )}
        </div>

        {/* Right Time Display */}
        <div className="flex items-center justify-end font-mono text-xs tabular-nums text-right select-none shrink-0">
          <span className="text-primary font-bold text-sm leading-none" aria-label="Current time">
            {!duration || hasError ? '0:00' : formatTime(currentTime)}
          </span>
          {!isLive && (
            <>
              <span className="text-white/20 mx-1">/</span>
              <button
                type="button"
                onClick={() => setShowRemainingTime((prev) => !prev)}
                title="Click to toggle remaining time"
                className="text-white/50 hover:text-white/80 transition-colors text-xs cursor-pointer"
                aria-label={showRemainingTime ? 'Time remaining' : 'Total duration'}
              >
                {!duration || hasError
                  ? '--:--'
                  : showRemainingTime
                    ? `-${formatTime(Math.max(0, duration - currentTime))}`
                    : formatTime(duration)}
              </button>
            </>
          )}
        </div>
      </div>

      {/* SCRUBBER AREA: WAVEFORM OR SLEEK SLIDER */}
      {!isLive && (
        <div className={cn('w-full mb-3.5 sm:mb-5', compact && 'mb-2.5')}>
          {shouldShowWaveform ? (
            <InteractiveWaveform
              peaks={waveformPeaks}
              progress={progressPercent}
              duration={duration}
              onSeek={handleSeek}
              onSeekStart={handleSeekStart}
              onSeekEnd={handleSeekEnd}
              isGenerating={isGeneratingWaveform}
              disabled={hasError || !duration}
              compact={compact}
            />
          ) : (
            <div className="py-1">
              <CustomSlider
                value={progressPercent}
                onChange={handleSeek}
                onSeekStart={handleSeekStart}
                onSeekEnd={handleSeekEnd}
                duration={duration}
                showHoverTooltip={true}
                disabled={hasError || !duration}
                ariaLabel="Seek audio timeline"
                className="w-full"
                trackClassName="h-2"
              />
            </div>
          )}
        </div>
      )}

      {/* CONTROLS BAR: RESPONSIVE FOR MOBILE AND DESKTOP */}
      <div className="flex flex-col gap-3 sm:gap-0 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-3 md:gap-4">
        {/* PRIMARY PLAYBACK CONTROLS: (Center on Desktop, Top on Mobile) */}
        <div className="flex items-center justify-center shrink-0 order-1 sm:order-2">
          {/* Primary Play / Pause Button */}
          <Button
            data-testid="audio-play-pause-btn"
            onClick={togglePlay}
            disabled={!src}
            aria-label={hasError ? 'Retry loading audio' : isPlaying ? 'Pause' : 'Play'}
            title={hasError ? 'Retry loading audio' : isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            className={cn(
              'h-12 w-12 sm:h-13 sm:w-13 md:h-14 md:w-14 rounded-full bg-primary text-black hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 shrink-0 font-bold',
              compact && 'h-9 w-9 sm:h-10 sm:w-10',
              hasError && 'bg-amber-400 text-black hover:bg-amber-300 shadow-amber-400/20',
            )}
            size="icon"
          >
            {showSpinner ? (
              <Loader2 className={cn('h-5 w-5 animate-spin', compact && 'h-4 w-4')} />
            ) : hasError ? (
              <RefreshCw className={cn('h-5 w-5', compact && 'h-4 w-4')} />
            ) : isPlaying ? (
              <Pause className={cn('h-5 w-5 fill-current', compact && 'h-4 w-4')} />
            ) : (
              <Play className={cn('h-5 w-5 fill-current ml-0.5', compact && 'h-4 w-4 ml-0.5')} />
            )}
          </Button>
        </div>

        {/* SECONDARY UTILITY BAR: (Responsive row on Mobile, Left & Right columns on Desktop) */}
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-2 w-full sm:w-auto sm:contents order-2',
            isDspMenuOpen && 'relative z-40',
          )}
        >
          {/* LEFT COLUMN: SPEED, REPEAT & DSP VOICE CLARITY */}
          <div className="flex items-center gap-1.5 sm:gap-2 justify-start min-w-0 sm:order-1">
            {/* Speed Button */}
            <button
              type="button"
              onClick={handleSpeedChange}
              disabled={hasError}
              title="Playback Speed (Click to cycle)"
              aria-label={`Playback speed: ${playbackSpeed}x`}
              className={cn(
                'h-8 px-2 sm:px-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 flex items-center justify-center shrink-0 border select-none',
                playbackSpeed !== 1
                  ? 'bg-primary/20 text-primary border-primary/40 shadow-[0_0_8px_rgba(0,242,254,0.2)]'
                  : 'bg-white/5 text-white/70 border-white/10 hover:text-white hover:bg-white/10',
              )}
            >
              {playbackSpeed}x
            </button>

            {/* Loop/Repeat Button */}
            <button
              type="button"
              onClick={toggleLoop}
              disabled={hasError}
              title={isLooping ? 'Loop is ON' : 'Loop is OFF'}
              aria-label={isLooping ? 'Disable loop' : 'Enable loop'}
              className={cn(
                'h-8 w-8 rounded-xl text-xs transition-all active:scale-95 flex items-center justify-center shrink-0 border select-none',
                isLooping
                  ? 'bg-primary/20 text-primary border-primary/40 shadow-[0_0_8px_rgba(0,242,254,0.2)]'
                  : 'bg-white/5 text-white/70 border-white/10 hover:text-white hover:bg-white/10',
              )}
            >
              <Repeat className="h-3.5 w-3.5" />
            </button>

            {/* DSP Voice Clarity Popover Menu */}
            <div className={cn('relative', isDspMenuOpen ? 'z-50' : 'z-10')} ref={dspMenuRef}>
              <button
                ref={dspButtonRef}
                type="button"
                onClick={toggleDspMenu}
                disabled={hasError}
                aria-haspopup="listbox"
                aria-expanded={isDspMenuOpen}
                title={`Voice Clarity DSP: ${VOICE_CLARITY_PRESETS[voiceClarityPreset].name}`}
                aria-label={`Voice Clarity DSP filter: ${VOICE_CLARITY_PRESETS[voiceClarityPreset].name}`}
                className={cn(
                  'group/dsp relative h-8 px-2 sm:px-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5 shrink-0 border select-none',
                  voiceClarityPreset !== 'off'
                    ? 'bg-gradient-to-r from-cyan-500/25 via-cyan-500/15 to-blue-500/15 text-cyan-300 border-cyan-400/50 shadow-[0_0_12px_rgba(6,182,212,0.3)] ring-1 ring-cyan-400/30'
                    : 'bg-white/5 text-white/70 border-white/10 hover:text-white hover:bg-white/10 hover:border-white/20',
                  isDspMenuOpen &&
                    'ring-2 ring-cyan-400/60 border-cyan-400 shadow-[0_0_16px_rgba(6,182,212,0.4)]',
                )}
              >
                {voiceClarityPreset !== 'off' ? (
                  <span className="relative flex h-2 w-2 mr-0.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,1)]" />
                  </span>
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-white/50 group-hover/dsp:text-white/80 transition-colors" />
                )}
                <span className="text-[11px] font-bold tracking-wide inline">DSP</span>
                <ChevronUp
                  className={cn(
                    'h-3 w-3 transition-transform duration-200 text-white/40',
                    isDspMenuOpen
                      ? 'rotate-180 text-cyan-300'
                      : 'text-white/50 group-hover/dsp:text-white',
                  )}
                />
              </button>

              {/* DSP Dropdown Menu Portaled to document.body for zero-clipping & maximum z-index in preview and modals */}
              {typeof document !== 'undefined' &&
                createPortal(
                  <AnimatePresence>
                    {isDspMenuOpen && (
                      <motion.div
                        ref={dspPopoverRef}
                        role="listbox"
                        aria-label="Voice Clarity DSP filter presets"
                        initial={{
                          opacity: 0,
                          y: menuPosition.placement === 'up' ? 10 : -10,
                          scale: 0.95,
                        }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{
                          opacity: 0,
                          y: menuPosition.placement === 'up' ? 6 : -6,
                          scale: 0.95,
                        }}
                        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                        style={{
                          position: 'fixed',
                          ...(menuPosition.placement === 'up'
                            ? { bottom: `${menuPosition.bottom}px` }
                            : { top: `${menuPosition.top}px` }),
                          left: `${menuPosition.left}px`,
                          width: `${menuPosition.width}px`,
                          transformOrigin:
                            menuPosition.placement === 'up' ? 'bottom left' : 'top left',
                          zIndex: 99999,
                        }}
                        className="select-none"
                      >
                        <div className="relative rounded-xl bg-zinc-950/95 backdrop-blur-2xl border border-cyan-500/30 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.9),0_0_20px_rgba(6,182,212,0.2)] ring-1 ring-cyan-500/20 flex flex-col gap-1 overflow-hidden">
                          {/* Compact Popover Header */}
                          <div className="px-1.5 py-1 border-b border-white/10 flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/90 flex items-center gap-1.5">
                              <Sparkles className="h-3 w-3 text-cyan-400" />
                              Voice DSP
                            </span>
                            <button
                              type="button"
                              onClick={() => setIsDspMenuOpen(false)}
                              className="h-4 w-4 rounded text-white/40 hover:text-white flex items-center justify-center transition-colors"
                              aria-label="Close DSP menu"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>

                          {/* Presets List - Ultra Compact */}
                          <div className="flex flex-col gap-0.5">
                            {(
                              [
                                {
                                  id: 'crystal' as VoiceClarityPreset,
                                  title: 'Crystal Voice',
                                  icon: Sparkles,
                                  color: 'text-cyan-400',
                                },
                                {
                                  id: 'aggressive' as VoiceClarityPreset,
                                  title: 'Heavy Noise Gate',
                                  icon: ShieldCheck,
                                  color: 'text-amber-400',
                                },
                                {
                                  id: 'warm-interview' as VoiceClarityPreset,
                                  title: 'Warm Interview',
                                  icon: Mic,
                                  color: 'text-purple-400',
                                },
                                {
                                  id: 'off' as VoiceClarityPreset,
                                  title: 'Bypass (Raw Audio)',
                                  icon: Sliders,
                                  color: 'text-zinc-400',
                                },
                              ] as const
                            ).map((option) => {
                              const isSelected = voiceClarityPreset === option.id;
                              const Icon = option.icon;
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  role="option"
                                  aria-selected={isSelected}
                                  onClick={() => handleSelectPreset(option.id)}
                                  className={cn(
                                    'group/opt relative w-full text-left px-2 py-1.5 rounded-lg transition-all duration-100 flex items-center justify-between gap-2 select-none text-xs',
                                    isSelected
                                      ? 'bg-cyan-500/20 text-white font-semibold shadow-[0_0_10px_rgba(6,182,212,0.15)] border border-cyan-500/40'
                                      : 'hover:bg-white/10 text-white/70 hover:text-white',
                                  )}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Icon
                                      className={cn(
                                        'h-3.5 w-3.5 shrink-0',
                                        isSelected ? 'text-cyan-300' : option.color,
                                      )}
                                    />
                                    <span className="truncate text-[11px] leading-tight">
                                      {option.title}
                                    </span>
                                  </div>

                                  <div
                                    className={cn(
                                      'h-3.5 w-3.5 rounded-full border flex items-center justify-center shrink-0 transition-all',
                                      isSelected
                                        ? 'border-cyan-400 bg-cyan-500 text-black shadow-[0_0_6px_rgba(6,182,212,0.6)]'
                                        : 'border-white/20 bg-white/5 opacity-0 group-hover/opt:opacity-60',
                                    )}
                                  >
                                    {isSelected && <Check className="h-2 w-2 stroke-[3.5]" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Anchor arrow pointing directly to the DSP button */}
                        {menuPosition.placement === 'up' ? (
                          <div
                            className="absolute -bottom-1 w-2.5 h-2.5 rotate-45 bg-zinc-950 border-r border-b border-cyan-500/40 shadow-sm pointer-events-none"
                            style={{ left: `${menuPosition.arrowLeft}px` }}
                          />
                        ) : (
                          <div
                            className="absolute -top-1 w-2.5 h-2.5 rotate-45 bg-zinc-950 border-l border-t border-cyan-500/40 shadow-sm pointer-events-none"
                            style={{ left: `${menuPosition.arrowLeft}px` }}
                          />
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>,
                  document.body,
                )}
            </div>
          </div>

          {/* RIGHT COLUMN: VOLUME SLIDER & DOWNLOAD */}
          <div className="flex items-center gap-1.5 sm:gap-2 justify-end min-w-0 sm:order-3">
            {/* Integrated Volume Control */}
            <div className="flex items-center gap-1 sm:gap-1.5 group/volume shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 rounded-xl shrink-0"
                onClick={toggleMute}
                title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4 text-amber-400/90" />
                ) : volume > 0.5 ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <Volume1 className="h-4 w-4" />
                )}
              </Button>

              {/* Inline Volume Slider */}
              <div className="hidden sm:block w-14 sm:w-16 md:w-20">
                <CustomSlider
                  value={isMuted ? 0 : volume * 100}
                  onChange={handleVolumeChange}
                  activeColor="bg-white/70"
                  ariaLabel="Volume level"
                  className="w-full"
                  trackClassName="h-1.5"
                  thumbSize="sm"
                  disabled={hasError}
                />
              </div>
            </div>

            {/* Download Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 rounded-xl shrink-0"
              onClick={handleDownload}
              title="Download Audio"
              aria-label="Download audio"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudioPlayer;
