import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  RotateCw,
  Paintbrush,
  Undo2,
  Check,
  X,
  Eraser,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../lib/utils';
import { CAMERA_FILTERS, getFilterCss } from './filters';
import { CameraFilter } from './types';
import { triggerHaptic } from './haptics';

interface PhotoEditorProps {
  initialBlob: Blob;
  initialUrl: string;
  onSave: (editedBlob: Blob, editedUrl: string) => void;
  onCancel: () => void;
}

interface Stroke {
  points: { x: number; y: number }[];
  size: number;
  color: string;
}

export const PhotoEditor: React.FC<PhotoEditorProps> = ({
  initialBlob: _initialBlob,
  initialUrl,
  onSave,
  onCancel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const filterScrollRef = useRef<HTMLDivElement>(null);
  const activeFilterBtnRef = useRef<HTMLButtonElement>(null);

  const [rotation, setRotation] = useState<number>(0);
  const [activeFilter, setActiveFilter] = useState<CameraFilter>('none');
  const [isBrushActive, setIsBrushActive] = useState<boolean>(false);
  const [brushSize] = useState<number>(24);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

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

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      renderCanvas();
    };
    img.src = initialUrl;
  }, [initialUrl]);

  // Redraw canvas with current rotation, filter, and redaction strokes
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const isRotatedSideways = rotation % 180 !== 0;
    const width = isRotatedSideways ? img.naturalHeight : img.naturalWidth;
    const height = isRotatedSideways ? img.naturalWidth : img.naturalHeight;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Apply Filter
    ctx.filter = getFilterCss(activeFilter);

    // Apply Rotation
    ctx.translate(width / 2, height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(
      img,
      -img.naturalWidth / 2,
      -img.naturalHeight / 2,
      img.naturalWidth,
      img.naturalHeight,
    );
    ctx.restore();

    // Reset filter for annotation strokes
    ctx.filter = 'none';

    // Draw Redaction / Masking strokes
    strokes.forEach((stroke) => {
      if (stroke.points.length < 1) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    });
  }, [rotation, activeFilter, strokes]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const handleRotate = () => {
    triggerHaptic('light');
    setRotation((prev) => (prev + 90) % 360);
    setStrokes([]);
  };

  // Convert canvas event point to true canvas coordinates
  const getCanvasPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isBrushActive) return;
    const point = getCanvasPoint(e);
    if (!point) return;

    setIsDrawing(true);
    const newStroke: Stroke = {
      points: [point],
      size: brushSize,
      color: '#09090b',
    };
    setStrokes((prev) => [...prev, newStroke]);
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isBrushActive) return;
    const point = getCanvasPoint(e);
    if (!point) return;

    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const lastIndex = prev.length - 1;
      const lastStroke = prev[lastIndex];
      const updatedStroke = {
        ...lastStroke,
        points: [...lastStroke.points, point],
      };
      const copy = [...prev];
      copy[lastIndex] = updatedStroke;
      return copy;
    });
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  const handleUndo = () => {
    triggerHaptic('light');
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleClearStrokes = () => {
    triggerHaptic('light');
    setStrokes([]);
  };

  const handleApplySave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    triggerHaptic('medium');
    setIsProcessing(true);
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            onSave(blob, url);
          }
          setIsProcessing(false);
        },
        'image/jpeg',
        0.95,
      );
    } else {
      const fallbackBlob = _initialBlob || new Blob(['photo content'], { type: 'image/jpeg' });
      onSave(fallbackBlob, initialUrl);
      setIsProcessing(false);
    }
  };

  return (
    <div className="relative flex flex-col h-full w-full bg-zinc-950 text-white overflow-hidden select-none">
      {/* Center Canvas Workspace - Maximum Viewport */}
      <div
        ref={containerRef}
        className="relative flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden bg-black touch-none"
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
      >
        <canvas
          ref={canvasRef}
          className={cn(
            'max-h-full max-w-full object-contain rounded-xl shadow-2xl transition-all',
            isBrushActive ? 'cursor-crosshair' : 'cursor-default',
          )}
        />
      </div>

      {/* Dedicated Effects / Filter Carousel Strip */}
      <div className="relative w-full border-t border-white/10 bg-zinc-950/90 backdrop-blur-2xl z-20 py-2 px-2 sm:px-3">
        {/* Left scroll chevron indicator for desktop */}
        <button
          type="button"
          onClick={() => scrollFilters('left')}
          className="hidden md:flex absolute left-1 top-1/2 -translate-y-1/2 z-30 h-7 w-7 items-center justify-center rounded-full bg-black/80 border border-white/15 text-white/80 hover:bg-black hover:text-white shadow-xl backdrop-blur-md transition-all active:scale-90"
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
          className="hidden md:flex absolute right-1 top-1/2 -translate-y-1/2 z-30 h-7 w-7 items-center justify-center rounded-full bg-black/80 border border-white/15 text-white/80 hover:bg-black hover:text-white shadow-xl backdrop-blur-md transition-all active:scale-90"
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
          className="h-9 px-3 rounded-full text-white/60 hover:bg-white/10 hover:text-white transition-all active:scale-95 gap-1.5"
          title="Discard edits"
          aria-label="Cancel editing"
        >
          <X className="h-4 w-4" />
          <span className="hidden sm:inline text-xs font-medium">Discard</span>
        </Button>

        {/* Center: Tools (Rotate, Redact Brush, Undo, Clear) */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Rotate */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleRotate}
            className="h-9 w-9 rounded-full border border-white/10 bg-black/40 text-white/80 hover:bg-white/10 hover:text-white transition-all active:scale-90"
            title="Rotate 90°"
            aria-label="Rotate 90 degrees"
          >
            <RotateCw className="h-4 w-4" />
          </Button>

          {/* Redact Brush */}
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              triggerHaptic('light');
              setIsBrushActive((prev) => !prev);
            }}
            className={cn(
              'h-9 px-3 rounded-full border transition-all active:scale-90 flex items-center gap-1.5 text-xs font-medium',
              isBrushActive
                ? 'border-red-500/60 bg-red-500/20 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                : 'border-white/10 bg-black/40 text-white/70 hover:bg-white/10 hover:text-white',
            )}
            title="Redact / Blackout Brush"
            aria-label="Redact brush"
          >
            <Paintbrush className="h-4 w-4" />
            <span className="hidden xs:inline">Redact</span>
          </Button>

          {/* Undo & Clear when brush is active */}
          {isBrushActive && (
            <div className="flex items-center gap-1 sm:gap-1.5 pl-1 border-l border-white/10">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleUndo}
                disabled={strokes.length === 0}
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-full border border-white/10 bg-black/40 text-white/70 hover:bg-white/10 disabled:opacity-20 active:scale-90"
                title="Undo last mark"
                aria-label="Undo"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleClearStrokes}
                disabled={strokes.length === 0}
                className="h-8 w-8 sm:h-9 sm:w-9 rounded-full border border-white/10 bg-black/40 text-white/70 hover:bg-white/10 disabled:opacity-20 active:scale-90"
                title="Clear all marks"
                aria-label="Clear all marks"
              >
                <Eraser className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Right: Apply & Save */}
        <Button
          type="button"
          variant="primary"
          onClick={handleApplySave}
          disabled={isProcessing}
          className="h-9 px-4 rounded-full bg-primary text-black hover:scale-105 active:scale-95 shadow-lg shadow-primary/25 font-bold text-xs flex items-center gap-1.5"
          title="Apply & Done"
          aria-label="Apply edits"
        >
          <Check className="h-4 w-4 stroke-[3px]" />
          <span>Apply</span>
        </Button>
      </div>
    </div>
  );
};
