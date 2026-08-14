'use client';

import { useRef, useState, useEffect, useCallback, memo } from 'react';
import { Button } from './Button';
import { Play, Pause, Volume2, Volume1, VolumeX, RotateCcw, Download } from 'lucide-react';
import { cn } from '../../lib/utils';

/* ---------------- UTIL ---------------- */
const formatTime = (seconds: number) => {
  if (!isFinite(seconds)) return 'Live';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

/* ---------------- SLIDER ---------------- */
const CustomSlider = memo(
  ({
    value,
    onChange,
    className,
    activeColor = 'bg-primary',
    ariaLabel = 'Slider',
    duration = 0,
  }: {
    value: number;
    onChange: (value: number) => void;
    className?: string;
    activeColor?: string;
    ariaLabel?: string;
    duration?: number;
  }) => {
    const sliderRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const rafRef = useRef<number | null>(null);
    const handlersRef = useRef<{
      move: (e: PointerEvent) => void;
      up: (e: PointerEvent) => void;
    } | null>(null);

    const updateValue = useCallback(
      (clientX: number) => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        rafRef.current = requestAnimationFrame(() => {
          const rect = sliderRef.current?.getBoundingClientRect();
          if (!rect || rect.width === 0) return;
          const raw = (clientX - rect.left) / rect.width;
          const percentage = Math.min(100, Math.max(0, raw * 100));
          onChange(percentage);
        });
      },
      [onChange]
    );

    const handlePointerMove = useCallback(
      (e: PointerEvent) => {
        updateValue(e.clientX);
      },
      [updateValue]
    );

    const handlePointerUp = useCallback((e: PointerEvent) => {
      isDragging.current = false;

      // Release pointer capture if supported
      try {
        if (e.target instanceof Element && e.target.hasPointerCapture(e.pointerId)) {
          e.target.releasePointerCapture(e.pointerId);
        }
      } catch (err) {
        // Ignore capture errors
      }

      if (handlersRef.current) {
        window.removeEventListener('pointermove', handlersRef.current.move);
        window.removeEventListener('pointerup', handlersRef.current.up);
        window.removeEventListener('pointercancel', handlersRef.current.up);
      }
    }, []);

    // Keep handlersRef in sync with latest handlers
    useEffect(() => {
      handlersRef.current = { move: handlePointerMove, up: handlePointerUp };
    }, [handlePointerMove, handlePointerUp]);

    const handlePointerDown = (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      isDragging.current = true;
      updateValue(e.clientX);

      // Set pointer capture for robustness
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {
        // Fallback to standard window listeners
      }

      if (handlersRef.current) {
        window.addEventListener('pointermove', handlersRef.current.move);
        window.addEventListener('pointerup', handlersRef.current.up);
        window.addEventListener('pointercancel', handlersRef.current.up);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        onChange(Math.min(value + 1, 100));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onChange(Math.max(value - 1, 0));
      } else if (e.key === 'Home') {
        e.preventDefault();
        onChange(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        onChange(100);
      }
    };

    useEffect(() => {
      return () => {
        isDragging.current = false;
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        if (handlersRef.current) {
          window.removeEventListener('pointermove', handlersRef.current.move);
          window.removeEventListener('pointerup', handlersRef.current.up);
          window.removeEventListener('pointercancel', handlersRef.current.up);
        }
        // Absolute fallback cleanup for extreme edge cases
        window.onpointermove = null;
        window.onpointerup = null;
      };
    }, []);

    return (
      <div
        ref={sliderRef}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        aria-orientation="horizontal"
        aria-label={ariaLabel}
        aria-valuetext={
          ariaLabel === 'Seek audio'
            ? formatTime((value / 100) * (duration || 0))
            : `${Math.round(value)}%`
        }
        className={cn(
          'relative w-full h-1.5 bg-white/10 rounded-full cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          className
        )}
      >
        <div
          className={cn(
            'absolute top-0 left-0 h-full rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-300 ease-out',
            activeColor
          )}
          style={{ width: `${value}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-grab active:cursor-grabbing hover:scale-125"
          style={{ left: `calc(${value}% - 8px)` }}
        />
      </div>
    );
  }
);

/* ---------------- AUDIO PLAYER ---------------- */
export const AudioPlayer = ({
  src,
  className,
  isWaveformEnabled = false,
  compact = false,
  fileSize,
}: {
  src: string;
  className?: string;
  isWaveformEnabled?: boolean;
  compact?: boolean;
  fileSize?: number;
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastVolume = useRef(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isWaiting, setIsWaiting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [isGeneratingWaveform, setIsGeneratingWaveform] = useState(false);

  const isLive = !isFinite(duration) || (duration === 0 && currentTime > 0);
  const showSpinner = (isLoading || isWaiting) && isPlaying;

  const MAX_WAVEFORM_SIZE = 8 * 1024 * 1024; // 8 MB
  const isTooLarge = fileSize !== undefined && fileSize > MAX_WAVEFORM_SIZE;
  const shouldShowWaveform = isWaveformEnabled && !isTooLarge;

  // Sync state with audio element changes from external sources & media keys
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
    };
    const handlePlay = () => {
      setIsPlaying(true);
      setHasError(false);
    };
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);
    const handleCanPlay = () => {
      setIsLoading(false);
      setHasError(false);
    };
    const syncVolume = () => {
      setVolume(audio.volume);
      setIsMuted(audio.muted);
    };

    if (audio.readyState >= 2) {
      setIsLoading(false);
    }

    audio.addEventListener('ratechange', handleRateChange);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('volumechange', syncVolume);

    return () => {
      audio.removeEventListener('ratechange', handleRateChange);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('volumechange', syncVolume);
    };
  }, []);

  // Hardware / System MediaSession API integration
  useEffect(() => {
    if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          audioRef.current?.play().catch(() => {});
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          audioRef.current?.pause();
        });
      } catch {
        /* Ignore unsupported media session actions */
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch {
          /* ignore */
        }
        try {
          audioRef.current.removeAttribute('src');
          audioRef.current.load();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    setHasError(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsLoading(true);
    setWaveformPeaks([]);

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
      generateWaveform(src, () => isCancelled);
    }

    return () => {
      isCancelled = true;
    };
  }, [src, shouldShowWaveform]);

  const generateWaveform = async (audioUrl: string, isCancelled: () => boolean) => {
    if (!audioUrl) return;
    setIsGeneratingWaveform(true);
    try {
      const response = await fetch(audioUrl);

      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size > 8 * 1024 * 1024) {
          console.warn(
            'Audio file size is too large for waveform generation. Skipping to prevent main thread blocking.'
          );
          return;
        }
      }

      const arrayBuffer = await response.arrayBuffer();
      if (isCancelled()) return;

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      const audioCtx = new AudioCtxClass();
      try {
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        if (isCancelled()) return;

        const channelData = audioBuffer.getChannelData(0);
        const samples = 100;
        const blockSize = Math.floor(channelData.length / samples);
        const peaks = [];

        const step = Math.max(1, Math.floor(blockSize / 20));
        for (let i = 0; i < samples; i++) {
          let max = 0;
          const start = i * blockSize;
          for (let j = 0; j < blockSize; j += step) {
            const val = Math.abs(channelData[start + j]);
            if (val > max) max = val;
          }
          peaks.push(max);
        }

        if (!isCancelled()) {
          setWaveformPeaks(peaks);
        }
      } finally {
        audioCtx.close().catch(() => {});
      }
    } catch (err) {
      console.warn('Waveform generation failed:', err);
    } finally {
      if (!isCancelled()) {
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
        await audio.play();
        setIsPlaying(true);
      } catch (e) {
        console.error('Audio Playback Retry Error:', e);
        if (e instanceof Error && e.name !== 'AbortError') {
          setHasError(true);
        }
        setIsLoading(false);
      }
      return;
    }

    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
        setHasError(false);
      } catch (e) {
        console.error('Audio Playback Error:', e);
        if (e instanceof Error && e.name !== 'AbortError' && e.name !== 'NotAllowedError') {
          setHasError(true);
        }
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [src, hasError]);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setIsLoading(false);
      setHasError(false);
    }
  }, []);

  const handleError = useCallback(() => {
    if (!src) return;
    const mediaErr = audioRef.current?.error;
    setIsPlaying(false);
    setIsLoading(false);
    setHasError(true);
    console.error(
      'Audio Load Error for src:',
      src,
      mediaErr ? `(MediaError code ${mediaErr.code}: ${mediaErr.message})` : ''
    );
  }, [src]);

  const handleSeek = useCallback(
    (value: number) => {
      const audio = audioRef.current;
      if (audio && !hasError) {
        const d = duration || audio.duration || 0;
        if (d === 0) return;

        const time = (value / 100) * d;
        audio.currentTime = time;
        setCurrentTime(time);
      }
    },
    [duration, hasError]
  );

  const handleVolumeChange = useCallback((value: number) => {
    const v = value / 100;
    if (v > 0) lastVolume.current = v;
    if (audioRef.current) {
      audioRef.current.volume = v;
      audioRef.current.muted = v === 0;
    }
    setVolume(v);
    setIsMuted(v === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const newMuted = !isMuted;
    audio.muted = newMuted;
    setIsMuted(newMuted);

    // Sync volume slider: if unmuting and volume is 0, restore last known volume
    if (!newMuted && volume === 0) {
      const restoredVolume = lastVolume.current > 0 ? lastVolume.current : 0.5;
      audio.volume = restoredVolume;
      setVolume(restoredVolume);
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

  const handleDownload = useCallback(async () => {
    try {
      const link = document.createElement('a');
      link.href = src;
      link.download = src.split('/').pop()?.split('?')[0] || 'audio-file';
      link.rel = 'noopener noreferrer';
      if (!src.startsWith('blob:') && !src.startsWith('data:')) {
        link.target = '_blank';
      }

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.warn('Download link failed, using fallback:', err);
      const link = document.createElement('a');
      link.href = src;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
    }
  }, [src]);

  const skip = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (isLive) {
        // Seekable check is ideal, but heuristic for live is just offset
        audio.currentTime = Math.max(0, audio.currentTime + seconds);
        return;
      }

      const newTime = Math.min(
        Math.max(audio.currentTime + seconds, 0),
        duration || audio.duration || 0
      );

      audio.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration, isLive]
  );

  return (
    <div
      className={cn(
        'w-full max-w-md bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl relative',
        compact && 'p-4',
        className
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        controls={false}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onCanPlay={() => {
          setIsLoading(false);
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

      {/* Info & Timer */}
      <div className={cn('flex justify-between items-end mb-4', compact && 'mb-2')}>
        <div>
          <p
            className={cn(
              'text-[10px] uppercase tracking-wider font-semibold',
              hasError ? 'text-amber-400 font-bold' : 'text-white/40'
            )}
            aria-live={hasError ? 'assertive' : 'polite'}
          >
            {hasError
              ? 'Unable to load audio'
              : isWaiting
                ? 'Buffering...'
                : isLoading
                  ? 'Optimizing Audio...'
                  : isGeneratingWaveform
                    ? 'Generating Waveform...'
                    : isLive
                      ? 'Live Stream'
                      : 'High Quality Audio'}
          </p>
        </div>
        <div className="text-right">
          <span
            className="text-primary font-mono text-sm leading-none tabular-nums"
            aria-label="Current time"
          >
            {!duration || hasError ? '--:--' : formatTime(currentTime)}
          </span>
          {!isLive && (
            <span className="text-white/20 font-mono text-xs ml-1" aria-label="Total duration">
              / {!duration || hasError ? '--:--' : formatTime(duration)}
            </span>
          )}
        </div>
      </div>

      {/* Progress Slider / Waveform */}
      {!isLive && (
        <div className={cn('relative w-full', compact ? 'mb-2 h-8' : 'mb-8 h-12')}>
          {shouldShowWaveform && waveformPeaks.length > 0 ? (
            <div
              className="absolute inset-0 flex items-center gap-[2px] cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                handleSeek((x / rect.width) * 100);
              }}
            >
              {waveformPeaks.map((peak, i) => {
                const progress = duration ? (currentTime / duration) * 100 : 0;
                const isPlayed = (i / waveformPeaks.length) * 100 < progress;
                return (
                  <div
                    key={i}
                    className={cn(
                      'flex-1 transition-all duration-300',
                      isPlayed ? 'bg-primary' : 'bg-white/10'
                    )}
                    style={{
                      height: `${Math.max(8, peak * 100)}%`,
                      opacity: isPlayed ? 1 : 0.4,
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <CustomSlider
              value={duration ? (currentTime / duration) * 100 : 0}
              onChange={handleSeek}
              className={cn(
                'absolute top-1/2 -translate-y-1/2',
                (hasError || !duration) && 'opacity-50 pointer-events-none'
              )}
              ariaLabel="Seek audio"
              duration={duration}
            />
          )}
        </div>
      )}

      {/* Controls Container */}
      <div className={cn('flex flex-col gap-6', compact ? 'gap-2' : 'gap-6')}>
        <div className="flex items-center justify-between">
          {/* Left - Speed & Skip */}
          <div className="flex items-center gap-2 flex-1 justify-start">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => skip(-10)}
              disabled={!duration}
              aria-label="Skip back 10 seconds"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>

            <button
              type="button"
              onClick={handleSpeedChange}
              disabled={hasError}
              title="Change Playback Speed"
              aria-label={`Playback speed: ${playbackSpeed}x`}
              className="text-[10px] font-bold text-white/60 hover:text-white bg-white/5 px-2 py-1 rounded-md min-w-[36px] disabled:opacity-30"
            >
              {playbackSpeed}x
            </button>
          </div>

          <div className="flex items-center justify-center relative">
            <Button
              onClick={togglePlay}
              aria-label={hasError ? 'Retry loading audio' : isPlaying ? 'Pause' : 'Play'}
              title={hasError ? 'Retry loading audio' : isPlaying ? 'Pause' : 'Play'}
              className={cn(
                'h-14 w-14 rounded-full bg-primary text-black hover:scale-105 transition-transform shadow-xl shadow-primary/20 disabled:opacity-50 disabled:scale-100',
                compact && 'h-10 w-10',
                hasError && 'bg-amber-400 hover:bg-amber-300'
              )}
              size="icon"
            >
              {showSpinner ? (
                <div
                  className={cn(
                    'h-6 w-6 border-2 border-black/20 border-t-black rounded-full animate-spin',
                    compact && 'h-4 w-4'
                  )}
                />
              ) : isPlaying ? (
                <Pause className={cn('h-6 w-6 fill-current', compact && 'h-4 w-4')} />
              ) : (
                <Play className={cn('h-6 w-6 fill-current ml-1', compact && 'h-4 w-4 ml-0.5')} />
              )}
            </Button>
          </div>

          {/* Right - Volume & Download */}
          <div className="flex items-center gap-2 flex-1 justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/60 hover:text-white"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/60 hover:text-white"
              onClick={handleDownload}
              title="Download"
              aria-label="Download audio"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Volume Slider */}
        <div className="flex items-center gap-3 px-2">
          <Volume1 className="h-3 w-3 text-white/20" />
          <CustomSlider
            value={isMuted ? 0 : volume * 100}
            onChange={handleVolumeChange}
            activeColor="bg-white/40"
            className={cn('h-1', hasError && 'opacity-50 pointer-events-none')}
            ariaLabel="Volume control"
          />
          <Volume2 className="h-3 w-3 text-white/20" />
        </div>
      </div>
    </div>
  );
};
