import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCw,
  FlipHorizontal,
  Volume2,
  VolumeX,
  Check,
  X,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../lib/utils';
import { CAMERA_FILTERS, getFilterCss } from './filters';
import { CameraFilter } from './types';
import { triggerHaptic } from './haptics';
import { toast } from 'sonner';

interface VideoEditorProps {
  initialBlob: Blob;
  initialUrl: string;
  onSave: (editedBlob: Blob, editedUrl: string) => void;
  onCancel: () => void;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({
  initialBlob,
  initialUrl,
  onSave,
  onCancel,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const filterScrollRef = useRef<HTMLDivElement | null>(null);
  const activeFilterBtnRef = useRef<HTMLButtonElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [activeFilter, setActiveFilter] = useState<CameraFilter>('none');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);

  // Auto-scroll active filter into view
  useEffect(() => {
    if (activeFilterBtnRef.current && filterScrollRef.current) {
      activeFilterBtnRef.current.scrollIntoView?.({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }
  }, [activeFilter]);

  const handleFilterWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && filterScrollRef.current) {
      filterScrollRef.current.scrollLeft += e.deltaY;
    }
  };

  const scrollFilters = (direction: 'left' | 'right') => {
    if (!filterScrollRef.current) return;
    const scrollAmount = direction === 'left' ? -220 : 220;
    filterScrollRef.current.scrollBy?.({ left: scrollAmount, behavior: 'smooth' });
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      setIsPlaying(false);
      if (video) {
        video.currentTime = 0;
      }
    };

    video.addEventListener('ended', handleEnded);
    return () => {
      video.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    triggerHaptic('light');

    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    triggerHaptic('light');
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleRotate = () => {
    triggerHaptic('light');
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleFlip = () => {
    triggerHaptic('light');
    setIsFlipped((prev) => !prev);
  };

  // Export & Bake Filter & Transforms onto Video via Canvas Stream
  const handleApplySave = async () => {
    const sourceVideo = videoRef.current;
    if (!sourceVideo) return;

    const hasFilter = activeFilter !== 'none';
    const hasTransform = rotation !== 0 || isFlipped;

    // Fast-path: if no changes made at all, keep original
    if (!hasFilter && !hasTransform) {
      triggerHaptic('success');
      onSave(initialBlob, initialUrl);
      return;
    }

    triggerHaptic('medium');
    setIsProcessing(true);
    setProcessProgress(0);
    const toastId = toast.loading('Applying filter & rendering video...');

    let audioCtx: AudioContext | null = null;
    try {
      sourceVideo.pause();
      setIsPlaying(false);

      const isRotatedSideways = rotation % 180 !== 0;
      const targetWidth = isRotatedSideways
        ? sourceVideo.videoHeight || 720
        : sourceVideo.videoWidth || 1280;
      const targetHeight = isRotatedSideways
        ? sourceVideo.videoWidth || 1280
        : sourceVideo.videoHeight || 720;

      const renderCanvas = document.createElement('canvas');
      renderCanvas.width = targetWidth;
      renderCanvas.height = targetHeight;
      const ctx = renderCanvas.getContext('2d', { alpha: false });
      if (!ctx) {
        throw new Error('Canvas 2D context not available');
      }

      let canvasStream: MediaStream;
      if (typeof (renderCanvas as any).captureStream === 'function') {
        canvasStream = (renderCanvas as any).captureStream(30);
      } else {
        throw new Error('Canvas captureStream not supported in this browser');
      }

      // Add audio track from video if available
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioCtx = new AudioContextClass();
          const sourceNode = audioCtx.createMediaElementSource(sourceVideo);
          const dest = audioCtx.createMediaStreamDestination();
          sourceNode.connect(dest);
          dest.stream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
        }
      } catch {
        // Fallback: try captureStream on video element directly
        try {
          const vidStream =
            (sourceVideo as any).captureStream?.() || (sourceVideo as any).mozCaptureStream?.();
          vidStream
            ?.getAudioTracks()
            ?.forEach((track: MediaStreamTrack) => canvasStream.addTrack(track));
        } catch {
          /* ignore audio capture fallback */
        }
      }

      const mimeType =
        initialBlob.type && MediaRecorder.isTypeSupported(initialBlob.type)
          ? initialBlob.type
          : MediaRecorder.isTypeSupported('video/mp4')
            ? 'video/mp4'
            : 'video/webm';

      const recorder = new MediaRecorder(canvasStream, { mimeType });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      const totalProcessDuration = Math.max(0.1, sourceVideo.duration || 1);

      sourceVideo.currentTime = 0;
      await new Promise((resolve) => {
        const onSeeked = () => {
          sourceVideo.removeEventListener('seeked', onSeeked);
          resolve(true);
        };
        sourceVideo.addEventListener('seeked', onSeeked);
      });

      recorder.start(100);

      let rafId: number | null = null;
      let isRecordingDone = false;

      const drawFrame = () => {
        if (isRecordingDone) return;

        ctx.save();
        ctx.clearRect(0, 0, renderCanvas.width, renderCanvas.height);

        // Apply Filter
        ctx.filter = getFilterCss(activeFilter);

        // Apply Transforms
        ctx.translate(renderCanvas.width / 2, renderCanvas.height / 2);
        if (rotation !== 0) {
          ctx.rotate((rotation * Math.PI) / 180);
        }
        if (isFlipped) {
          ctx.scale(-1, 1);
        }

        ctx.drawImage(
          sourceVideo,
          -sourceVideo.videoWidth / 2,
          -sourceVideo.videoHeight / 2,
          sourceVideo.videoWidth,
          sourceVideo.videoHeight,
        );
        ctx.restore();

        const currentElapsed = Math.max(0, sourceVideo.currentTime);
        const percent = Math.min(99, Math.round((currentElapsed / totalProcessDuration) * 100));
        setProcessProgress(percent);

        if (sourceVideo.currentTime >= sourceVideo.duration || sourceVideo.ended) {
          isRecordingDone = true;
          sourceVideo.pause();
          if (recorder.state === 'recording') {
            recorder.stop();
          }
          return;
        }

        rafId = requestAnimationFrame(drawFrame);
      };

      await sourceVideo.play();
      drawFrame();

      const resultBlob = await new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          if (rafId) cancelAnimationFrame(rafId);
          canvasStream.getTracks().forEach((t) => t.stop());
          const finalBlob = new Blob(chunks, { type: mimeType });
          resolve(finalBlob);
        };
        recorder.onerror = (err) => {
          if (rafId) cancelAnimationFrame(rafId);
          reject(err);
        };
      });

      toast.success('Video filter applied & saved!', { id: toastId });
      const newUrl = URL.createObjectURL(resultBlob);
      onSave(resultBlob, newUrl);
    } catch (err) {
      console.error('Failed to export edited video:', err);
      toast.error('Failed to render video edits, preserving original', { id: toastId });
      onSave(initialBlob, initialUrl);
    } finally {
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
      setIsProcessing(false);
    }
  };

  const transformStyle: React.CSSProperties = {
    filter: getFilterCss(activeFilter),
    transform: `rotate(${rotation}deg) scaleX(${isFlipped ? -1 : 1})`,
    transition: 'filter 0.2s ease, transform 0.2s ease',
  };

  return (
    <div className="relative flex flex-col h-full w-full bg-zinc-950 text-white overflow-hidden select-none">
      {/* Video Workspace */}
      <div
        ref={containerRef}
        className="relative flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden bg-black"
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={initialUrl}
          playsInline
          muted={isMuted}
          style={transformStyle}
          className="max-h-full max-w-full object-contain rounded-xl shadow-2xl transition-all cursor-pointer"
        />

        {/* Center Play Indicator overlay if paused */}
        {!isPlaying && !isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 border border-white/20 backdrop-blur-md shadow-2xl text-white">
              <Play className="h-8 w-8 translate-x-0.5 fill-white" />
            </div>
          </div>
        )}

        {/* Rendering Progress Overlay */}
        {isProcessing && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-6 text-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm font-semibold tracking-wide text-white">
              Baking Filter & Rendering Video ({processProgress}%)...
            </p>
            <div className="w-48 sm:w-64 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-150 shadow-[0_0_10px_rgba(0,242,254,0.8)]"
                style={{ width: `${processProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Dedicated Effects / Filter Carousel Strip */}
      <div className="relative w-full border-t border-white/10 bg-zinc-950/90 backdrop-blur-2xl z-20 py-2 px-2 sm:px-3">
        {/* Left scroll chevron indicator for desktop */}
        <button
          type="button"
          onClick={() => scrollFilters('left')}
          disabled={isProcessing}
          className="hidden md:flex absolute left-1 top-1/2 -translate-y-1/2 z-30 h-7 w-7 items-center justify-center rounded-full bg-black/80 border border-white/15 text-white/80 hover:bg-black hover:text-white shadow-xl backdrop-blur-md transition-all active:scale-90 disabled:opacity-30"
          title="Scroll left"
          aria-label="Scroll effects left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Horizontal Scroll Area */}
        <div
          ref={filterScrollRef}
          onWheel={handleFilterWheel}
          className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth touch-pan-x px-1 sm:px-6 py-0.5 w-full"
        >
          {CAMERA_FILTERS.map((f) => {
            const isSelected = activeFilter === f.id;
            const IconComponent = f.icon;
            return (
              <button
                key={f.id}
                ref={isSelected ? activeFilterBtnRef : null}
                type="button"
                onClick={() => {
                  triggerHaptic('tick');
                  setActiveFilter(f.id);
                }}
                disabled={isProcessing}
                className={cn(
                  'group flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border transition-all shrink-0 active:scale-95 select-none',
                  isSelected
                    ? 'bg-primary/20 border-primary/70 text-primary shadow-[0_0_12px_rgba(0,242,254,0.35)] ring-1 ring-primary/40'
                    : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/20',
                )}
                title={f.label}
                aria-label={f.label}
              >
                <div
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full transition-transform group-hover:scale-110',
                    isSelected ? 'bg-primary/20 text-primary' : 'bg-white/5',
                  )}
                >
                  <IconComponent
                    className={cn('h-3.5 w-3.5', isSelected ? f.iconColor : 'text-white/80')}
                  />
                </div>
                <span
                  className={cn(
                    'text-xs font-semibold tracking-wide whitespace-nowrap',
                    isSelected ? 'text-white font-bold' : 'text-white/70',
                  )}
                >
                  {f.shortLabel || f.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right scroll chevron indicator for desktop */}
        <button
          type="button"
          onClick={() => scrollFilters('right')}
          disabled={isProcessing}
          className="hidden md:flex absolute right-1 top-1/2 -translate-y-1/2 z-30 h-7 w-7 items-center justify-center rounded-full bg-black/80 border border-white/15 text-white/80 hover:bg-black hover:text-white shadow-xl backdrop-blur-md transition-all active:scale-90 disabled:opacity-30"
          title="Scroll right"
          aria-label="Scroll effects right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Bottom Actions Bar */}
      <div className="flex items-center justify-between p-2 px-3 sm:px-5 bg-zinc-950/98 border-t border-white/10 backdrop-blur-2xl z-20 pb-[max(env(safe-area-inset-bottom),0.75rem)] gap-2">
        {/* Left: Discard */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isProcessing}
          className="h-9 px-3 rounded-full text-white/60 hover:bg-white/10 hover:text-white transition-all active:scale-95 gap-1.5"
          title="Discard edits"
          aria-label="Cancel editing"
        >
          <X className="h-4 w-4" />
          <span className="hidden sm:inline text-xs font-medium">Discard</span>
        </Button>

        {/* Center: Tools (Play/Pause, Mute, Rotate, Flip) */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Play / Pause */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={togglePlay}
            disabled={isProcessing}
            className="h-9 w-9 rounded-full border border-white/10 bg-black/40 text-white/80 hover:bg-white/10 hover:text-white transition-all active:scale-90"
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause video' : 'Play video'}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4 fill-white" />
            ) : (
              <Play className="h-4 w-4 fill-white" />
            )}
          </Button>

          {/* Mute Toggle */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            disabled={isProcessing}
            className="h-9 w-9 rounded-full border border-white/10 bg-black/40 text-white/80 hover:bg-white/10 hover:text-white transition-all active:scale-90"
            title={isMuted ? 'Unmute' : 'Mute'}
            aria-label="Toggle mute"
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>

          {/* Rotate 90° */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleRotate}
            disabled={isProcessing}
            className="h-9 w-9 rounded-full border border-white/10 bg-black/40 text-white/80 hover:bg-white/10 hover:text-white transition-all active:scale-90"
            title="Rotate 90°"
            aria-label="Rotate 90 degrees"
          >
            <RotateCw className="h-4 w-4" />
          </Button>

          {/* Flip Horizontal */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleFlip}
            disabled={isProcessing}
            className={cn(
              'h-9 w-9 rounded-full border transition-all active:scale-90',
              isFlipped
                ? 'border-primary/60 bg-primary/20 text-primary'
                : 'border-white/10 bg-black/40 text-white/80 hover:bg-white/10 hover:text-white',
            )}
            title="Flip Horizontal"
            aria-label="Flip horizontal"
          >
            <FlipHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {/* Right: Apply & Save */}
        <Button
          type="button"
          variant="primary"
          onClick={handleApplySave}
          disabled={isProcessing}
          className="h-9 px-4 rounded-full bg-primary text-black hover:scale-105 active:scale-95 shadow-lg shadow-primary/25 font-bold text-xs flex items-center gap-1.5"
          title="Apply & Save"
          aria-label="Apply video edits"
        >
          {isProcessing ? (
            <Loader2 className="h-4 w-4 animate-spin text-black" />
          ) : (
            <Check className="h-4 w-4 stroke-[3px]" />
          )}
          <span>{isProcessing ? 'Rendering...' : 'Apply'}</span>
        </Button>
      </div>
    </div>
  );
};
