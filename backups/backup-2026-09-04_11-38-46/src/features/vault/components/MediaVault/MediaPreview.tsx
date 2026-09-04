import React, { useCallback, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  AlertTriangle,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Play,
  Pause,
  Film,
  Info,
  Download,
  RefreshCw,
  ShieldAlert,
  Layers,
} from 'lucide-react';
import { useVaultStore } from '../../../../store/vaultStore';
import { useAntiScreenshotAndShield } from '../../../../hooks/useAntiScreenshotAndShield';
import { Button } from '../../../../components/ui/Button';
import { GlobalNavigator } from '../../../../components/vault/GlobalNavigator';
import { SafeMedia } from './SafeMedia';
import { ErrorBoundary } from './ErrorBoundary';
import { MediaFilmstrip } from './MediaFilmstrip';
import { MediaInspectorDrawer } from './MediaInspectorDrawer';
import { cn } from '../../../../lib/utils';
import { VaultItem } from '../../../../lib/storage';

interface MediaPreviewProps {
  previewItem: string | null;
  previewedMedia: VaultItem | null;
  isPreparingPreview: boolean;
  masterKey: string | CryptoKey | null;
  type: 'photo' | 'video';
  isMediaAutoplayEnabled: boolean;
  isLowDataModeEnabled: boolean;
  isNetworkAwareAutoplayEnabled: boolean;
  isPerformanceHudEnabled: boolean;
  canPrevious: boolean;
  canNext: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onDownload: (item: VaultItem) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
  modalRef: React.RefObject<HTMLDivElement | null>;
  allItems?: VaultItem[];
  onSelectMedia?: (id: string) => void;
  onFloatingChange?: (isFloating: boolean) => void;
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({
  previewItem,
  previewedMedia,
  isPreparingPreview,
  masterKey,
  type,
  isMediaAutoplayEnabled,
  isLowDataModeEnabled,
  isNetworkAwareAutoplayEnabled,
  isPerformanceHudEnabled,
  canPrevious,
  canNext,
  onClose,
  onPrevious,
  onNext,
  onDownload,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  modalRef,
  allItems = [],
  onSelectMedia,
  onFloatingChange,
}) => {
  const isDecoyMode = useVaultStore((state) => state.isDecoyMode);
  const [isClosing, setIsClosing] = useState(false);
  const closeRequestedRef = useRef(false);

  // Zoom & Pan state
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Transform tools state
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [isFloating, setIsFloating] = useState(false);

  useEffect(() => {
    onFloatingChange?.(isFloating);
  }, [isFloating, onFloatingChange]);

  // Slideshow state
  const [isSlideshowActive, setIsSlideshowActive] = useState(false);
  const [slideshowIntervalSec] = useState(5);
  const [slideshowProgress, setSlideshowProgress] = useState(0);

  // Security & Privacy preferences
  const isPrintBlockingEnabled = useVaultStore((state) => state.preferences.isPrintBlockingEnabled);
  const isTabSwitchShieldEnabled = useVaultStore(
    (state) => state.preferences.isTabSwitchShieldEnabled,
  );

  // Anti-Screenshot, Print Blocking & Tab Switch Shield Hook
  const { isShieldActive, shieldReason, deactivateShield } = useAntiScreenshotAndShield({
    isTabSwitchShieldEnabled: isTabSwitchShieldEnabled !== false,
    isPrintBlockingEnabled: isPrintBlockingEnabled !== false,
    isViewingSensitiveMedia: Boolean(previewItem && previewedMedia),
    customShieldMessage: '⚠️ Printing and PDF saving are prohibited for protected vault media.',
  });

  // UI Panels state
  const [isFilmstripOpen, setIsFilmstripOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  // Touch Pinch-to-zoom tracking
  const initialTouchDistanceRef = useRef<number | null>(null);
  const initialTouchScaleRef = useRef<number>(1);

  // Reset transforms & zoom when preview item changes
  useEffect(() => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setIsFloating(false);
  }, [previewItem]);

  // Non-passive wheel event listener for photo zooming
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || type !== 'photo') return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      setZoomScale((prev) => {
        const next = Math.min(Math.max(prev + delta, 1.0), 4.0);
        if (next === 1.0) setPanOffset({ x: 0, y: 0 });
        return next;
      });
    };

    stage.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      stage.removeEventListener('wheel', handleNativeWheel);
    };
  }, [type, previewItem]);

  const stopActiveMediaImmediately = useCallback(() => {
    try {
      window.dispatchEvent(
        new CustomEvent('vault-audio-play', { detail: { playerId: '__stop_all__' } }),
      );
    } catch {
      // Ignore
    }
    const root = modalRef.current;
    if (!root) return;

    const mediaElements = root.querySelectorAll('video, audio');
    mediaElements.forEach((node) => {
      const media = node as HTMLMediaElement;
      try {
        media.pause();
      } catch {
        // Ignore
      }
      try {
        media.currentTime = 0;
      } catch {
        // Ignore
      }
      try {
        media.srcObject = null;
      } catch {
        // Ignore
      }
      try {
        media.removeAttribute('src');
      } catch {
        // Ignore
      }
      try {
        media.load();
      } catch {
        // Ignore
      }
    });
  }, [modalRef]);

  const handleImmediateClose = useCallback(() => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    setIsClosing(true);
    setIsSlideshowActive(false);
    stopActiveMediaImmediately();
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => {});
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
    window.requestAnimationFrame(() => {
      onClose();
      closeRequestedRef.current = false;
      setIsClosing(false);
    });
  }, [onClose, stopActiveMediaImmediately]);

  const handlePrevious = useCallback(() => {
    stopActiveMediaImmediately();
    onPrevious();
  }, [stopActiveMediaImmediately, onPrevious]);

  const handleNext = useCallback(() => {
    stopActiveMediaImmediately();
    onNext();
  }, [stopActiveMediaImmediately, onNext]);

  // Global Keyboard Shortcuts for Production Lightbox Navigation
  useEffect(() => {
    if (!previewItem) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not intercept if user is typing in an input / textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          handleImmediateClose();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (canPrevious) {
            handlePrevious();
          } else if (allItems.length > 1 && onSelectMedia) {
            onSelectMedia(allItems[allItems.length - 1].id);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (canNext) {
            handleNext();
          } else if (allItems.length > 1 && onSelectMedia) {
            onSelectMedia(allItems[0].id);
          }
          break;
        case '+':
        case '=':
          if (type === 'photo') {
            e.preventDefault();
            handleZoomIn();
          }
          break;
        case '-':
        case '_':
          if (type === 'photo') {
            e.preventDefault();
            handleZoomOut();
          }
          break;
        case '0':
          if (type === 'photo') {
            e.preventDefault();
            handleResetZoom();
          }
          break;
        case 'r':
        case 'R':
          if (type === 'photo') {
            e.preventDefault();
            handleRotateCw();
          }
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          setIsInspectorOpen((prev) => !prev);
          break;
        case 'f':
        case 'F':
          if (allItems.length > 1) {
            e.preventDefault();
            setIsFilmstripOpen((prev) => !prev);
          }
          break;
        case ' ':
          if (type === 'photo' && allItems.length > 1) {
            e.preventDefault();
            setIsSlideshowActive((prev) => !prev);
          }
          break;
      }
    };

    const handlePanicLock = () => {
      handleImmediateClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('vault:panic-lock', handlePanicLock);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('vault:panic-lock', handlePanicLock);
    };
  }, [
    previewItem,
    canPrevious,
    canNext,
    handlePrevious,
    handleNext,
    handleImmediateClose,
    allItems,
    onSelectMedia,
    type,
  ]);

  // Slideshow timer effect
  useEffect(() => {
    if (!isSlideshowActive || !previewItem) {
      setSlideshowProgress(0);
      return;
    }

    const intervalMs = slideshowIntervalSec * 1000;
    const stepMs = 50;
    let elapsed = 0;

    const intervalId = setInterval(() => {
      elapsed += stepMs;
      setSlideshowProgress(Math.min(100, (elapsed / intervalMs) * 100));

      if (elapsed >= intervalMs) {
        elapsed = 0;
        setSlideshowProgress(0);
        if (canNext) {
          handleNext();
        } else if (allItems.length > 0 && onSelectMedia) {
          onSelectMedia(allItems[0].id);
        }
      }
    }, stepMs);

    return () => clearInterval(intervalId);
  }, [
    isSlideshowActive,
    slideshowIntervalSec,
    previewItem,
    canNext,
    handleNext,
    allItems,
    onSelectMedia,
  ]);

  // Zoom helpers
  const handleZoomIn = () => {
    setZoomScale((prev) => Math.min(prev + 0.5, 4.0));
  };

  const handleZoomOut = () => {
    setZoomScale((prev) => {
      const next = Math.max(prev - 0.5, 1.0);
      if (next === 1.0) setPanOffset({ x: 0, y: 0 });
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomScale(1.0);
    setPanOffset({ x: 0, y: 0 });
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
  };

  const handleToggleZoom = () => {
    if (zoomScale > 1.0) {
      handleResetZoom();
    } else {
      setZoomScale(2.0);
    }
  };

  // Mouse drag to pan when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomScale <= 1.0 || type !== 'photo') return;
    if (e.cancelable) e.preventDefault();
    setIsDragging(true);
    dragOriginRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...panOffset };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomScale <= 1.0) return;
    if (e.cancelable) e.preventDefault();
    const deltaX = e.clientX - dragOriginRef.current.x;
    const deltaY = e.clientY - dragOriginRef.current.y;
    setPanOffset({
      x: panStartRef.current.x + deltaX,
      y: panStartRef.current.y + deltaY,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch Pinch Gestures
  const handlePinchTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      initialTouchDistanceRef.current = dist;
      initialTouchScaleRef.current = zoomScale;
    } else if (e.touches.length === 1 && zoomScale > 1.0) {
      setIsDragging(true);
      dragOriginRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStartRef.current = { ...panOffset };
    } else {
      onTouchStart(e);
    }
  };

  const handlePinchTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialTouchDistanceRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const factor = dist / initialTouchDistanceRef.current;
      const nextScale = Math.min(Math.max(initialTouchScaleRef.current * factor, 1.0), 4.0);
      setZoomScale(nextScale);
      if (nextScale === 1.0) setPanOffset({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && isDragging && zoomScale > 1.0) {
      const deltaX = e.touches[0].clientX - dragOriginRef.current.x;
      const deltaY = e.touches[0].clientY - dragOriginRef.current.y;
      setPanOffset({
        x: panStartRef.current.x + deltaX,
        y: panStartRef.current.y + deltaY,
      });
    } else if (zoomScale === 1.0) {
      onTouchMove(e);
    }
  };

  const handlePinchTouchEnd = () => {
    initialTouchDistanceRef.current = null;
    setIsDragging(false);
    if (zoomScale === 1.0) {
      onTouchEnd();
    }
  };

  // Rotation tools
  const handleRotateCw = () => setRotation((prev) => (prev + 90) % 360);
  const handleRotateCcw = () => setRotation((prev) => (prev - 90 + 360) % 360);
  const handleFlipH = () => setFlipH((prev) => !prev);
  const handleFlipV = () => setFlipV((prev) => !prev);

  // Dynamic CSS transform string
  const transformStyle = {
    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale}) rotate(${rotation}deg) scaleX(${
      flipH ? -1 : 1
    }) scaleY(${flipV ? -1 : 1})`,
    transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
    cursor: zoomScale > 1.0 ? (isDragging ? 'grabbing' : 'grab') : 'default',
  };

  return (
    <AnimatePresence>
      {previewItem && (
        <motion.div
          key="media-preview-modal"
          role={isFloating ? 'region' : 'dialog'}
          aria-modal={!isFloating}
          aria-label={`${previewedMedia?.title || 'Media'} preview`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className={cn(
            'fixed inset-0 transition-colors duration-300 select-none overflow-hidden',
            isFloating
              ? 'z-[100] bg-transparent pointer-events-none'
              : 'z-50 bg-black/95 backdrop-blur-2xl flex items-center justify-center',
          )}
          ref={modalRef}
          onClick={(e) => {
            if (!isFloating && e.target === e.currentTarget) {
              if (e.cancelable) e.preventDefault();
              e.stopPropagation();
              handleImmediateClose();
            }
          }}
        >
          {/* Top Control Bar (Responsive on all screen sizes, only in full preview) */}
          {!isFloating && (
            <div className="absolute top-3 sm:top-4 inset-x-2 sm:inset-x-4 z-40 flex items-center justify-between gap-2 pointer-events-none">
              {/* Left: Title & Index */}
              <div className="flex items-center gap-2 pointer-events-auto min-w-0">
                <div className="rounded-full bg-black/75 px-3 py-1 sm:px-3.5 sm:py-1.5 border border-white/15 backdrop-blur-md flex items-center gap-1.5 sm:gap-2 max-w-[150px] xs:max-w-[200px] sm:max-w-xs md:max-w-md">
                  <span className="text-xs font-semibold text-white truncate">
                    {previewedMedia?.title || 'Media'}
                  </span>
                  {allItems.length > 0 && (
                    <span className="text-[10px] text-white/50 border-l border-white/10 pl-1.5 sm:pl-2 shrink-0">
                      {allItems.findIndex((i) => i.id === previewItem) + 1}/{allItems.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Right: Quick Tools, Slideshow, Info, Download, Close */}
              <div className="flex items-center gap-1 sm:gap-1.5 pointer-events-auto shrink-0">
                {/* Photo Tools (Rotate / Flip) */}
                {type === 'photo' && (
                  <div className="hidden md:flex items-center gap-0.5 rounded-full bg-black/75 p-0.5 sm:p-1 border border-white/15 backdrop-blur-md">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRotateCcw}
                      className="h-7 w-7 rounded-full text-white/70 hover:text-white hover:bg-white/10"
                      title="Rotate 90° CCW"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRotateCw}
                      className="h-7 w-7 rounded-full text-white/70 hover:text-white hover:bg-white/10"
                      title="Rotate 90° CW (R)"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleFlipH}
                      className={cn(
                        'h-7 w-7 rounded-full text-white/70 hover:text-white hover:bg-white/10',
                        flipH && 'bg-blue-500/30 text-blue-300',
                      )}
                      title="Flip Horizontal"
                    >
                      <FlipHorizontal className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleFlipV}
                      className={cn(
                        'h-7 w-7 rounded-full text-white/70 hover:text-white hover:bg-white/10',
                        flipV && 'bg-blue-500/30 text-blue-300',
                      )}
                      title="Flip Vertical"
                    >
                      <FlipVertical className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}

                {/* Slideshow Mode Button */}
                {allItems.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsSlideshowActive(!isSlideshowActive)}
                    className={cn(
                      'h-7 sm:h-8 rounded-full border px-2 sm:px-3 text-xs backdrop-blur-md flex items-center gap-1 sm:gap-1.5 transition-all',
                      isSlideshowActive
                        ? 'bg-blue-500/30 text-blue-300 border-blue-400/50 shadow-[0_0_15px_rgba(59,130,246,0.4)]'
                        : 'bg-black/75 text-white/80 border-white/15 hover:bg-white/10 hover:text-white',
                    )}
                    title={
                      isSlideshowActive ? 'Pause Slideshow (Space)' : 'Start Slideshow (Space)'
                    }
                  >
                    {isSlideshowActive ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5 text-blue-400" />
                    )}
                    <span className="hidden sm:inline">
                      {isSlideshowActive ? `${slideshowIntervalSec}s` : 'Slideshow'}
                    </span>
                  </Button>
                )}

                {/* Filmstrip Toggle Button */}
                {allItems.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsFilmstripOpen(!isFilmstripOpen)}
                    className={cn(
                      'h-7 w-7 sm:h-8 sm:w-8 rounded-full border backdrop-blur-md transition-all',
                      isFilmstripOpen
                        ? 'bg-blue-500/25 text-blue-300 border-blue-500/40'
                        : 'bg-black/75 text-white/75 border-white/15 hover:bg-white/10 hover:text-white',
                    )}
                    title={isFilmstripOpen ? 'Hide Filmstrip (F)' : 'Show Filmstrip (F)'}
                  >
                    <Film className="h-3.5 w-3.5" />
                  </Button>
                )}

                {/* Info / Inspector Drawer Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsInspectorOpen(!isInspectorOpen)}
                  className={cn(
                    'h-7 w-7 sm:h-8 sm:w-8 rounded-full border backdrop-blur-md transition-all',
                    isInspectorOpen
                      ? 'bg-blue-500/25 text-blue-300 border-blue-500/40'
                      : 'bg-black/75 text-white/75 border-white/15 hover:bg-white/10 hover:text-white',
                  )}
                  title="View EXIF & Vault Metadata (I)"
                >
                  <Info className="h-3.5 w-3.5" />
                </Button>

                {/* Download Button */}
                {previewedMedia && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDownload(previewedMedia)}
                    className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-black/75 text-white/75 border border-white/15 backdrop-blur-md hover:bg-white/10 hover:text-white"
                    title="Download File"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                )}

                {/* Minimize to Floating Mini Player Button (All Pages) */}
                {type === 'video' && previewedMedia && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setIsFloating(true);
                    }}
                    className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-black/75 text-white/75 border border-white/15 backdrop-blur-md hover:bg-primary/20 hover:text-primary hover:border-primary/40 transition-all"
                    title="Minimize to Floating Mini Player (browse all pages)"
                    aria-label="Minimize to floating mini player"
                  >
                    <Layers className="h-3.5 w-3.5" />
                  </Button>
                )}

                {/* Close Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close preview (Esc)"
                  disabled={isClosing}
                  className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/20"
                  onClick={handleImmediateClose}
                >
                  {isClosing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Slideshow Progress Bar */}
          {!isFloating && isSlideshowActive && (
            <div className="absolute top-0 inset-x-0 h-1 bg-white/10 z-50">
              <div
                className="h-full bg-blue-500 transition-all ease-linear shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                style={{ width: `${slideshowProgress}%` }}
              />
            </div>
          )}

          {/* Prev / Next Navigation Arrows */}
          {!isFloating && (
            <GlobalNavigator
              canPrevious={canPrevious}
              canNext={canNext}
              onPrevious={handlePrevious}
              onNext={handleNext}
              layout="overlay"
            />
          )}

          {/* Main Media Stage with viewport bounds ensuring no overflow under headers/bookmarks */}
          <div
            ref={stageRef}
            className={cn(
              'relative flex items-center justify-center transition-all media-stage-protected vault-media-protected',
              isFloating
                ? 'h-auto w-auto pointer-events-none'
                : 'h-[100dvh] w-[100vw] px-2 sm:px-6 pt-14 sm:pt-16 pb-10 sm:pb-12 overflow-hidden',
            )}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handlePinchTouchStart}
            onTouchMove={handlePinchTouchMove}
            onTouchEnd={handlePinchTouchEnd}
            onDoubleClick={type === 'photo' ? handleToggleZoom : undefined}
          >
            {isPreparingPreview ? (
              <div className="flex h-64 w-64 flex-col items-center justify-center gap-3 text-white/70">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                <p className="text-xs uppercase tracking-wider font-semibold">Opening preview...</p>
              </div>
            ) : previewedMedia ? (
              <div
                style={type === 'photo' ? transformStyle : undefined}
                className={cn(
                  'relative flex items-center justify-center',
                  isFloating ? 'pointer-events-auto' : 'max-w-full max-h-full w-full h-full',
                )}
              >
                <ErrorBoundary
                  fallback={
                    <div className="flex flex-col items-center justify-center p-20 text-red-400/60">
                      <AlertTriangle className="h-10 w-10 mb-2" />
                      <p>Playback failed</p>
                    </div>
                  }
                >
                  {(masterKey || isDecoyMode) && (
                    <SafeMedia
                      item={previewedMedia}
                      masterKey={masterKey}
                      type={type}
                      isThumbnail={false}
                      autoPlayVideo={isMediaAutoplayEnabled}
                      lowDataMode={isLowDataModeEnabled}
                      networkAwareAutoplay={isNetworkAwareAutoplayEnabled}
                      performanceHud={isPerformanceHudEnabled}
                      isFloating={isFloating}
                      onToggleFloating={setIsFloating}
                      onClose={handleImmediateClose}
                      className={cn(
                        'object-contain rounded-xl shadow-2xl',
                        isFloating
                          ? 'pointer-events-auto'
                          : 'max-w-[min(94vw,1440px)] max-h-[min(82vh,calc(100dvh-5.5rem))]',
                      )}
                    />
                  )}
                </ErrorBoundary>
              </div>
            ) : (
              <div className="flex h-64 w-64 items-center justify-center text-white/20">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            )}

            {/* Tab Switch Auto-Shield Overlay (Blackout against background app switcher previews) */}
            <AnimatePresence>
              {isShieldActive && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="vault-tab-switch-shield"
                  onClick={deactivateShield}
                >
                  <div className="flex flex-col items-center gap-3 p-6 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 border border-white/20 backdrop-blur-xl">
                      <ShieldAlert className="h-7 w-7 text-amber-400" />
                    </div>
                    <p className="text-base font-bold text-white tracking-wide">
                      {shieldReason === 'print-attempt'
                        ? 'Print Protection Active'
                        : 'Shield Active • Preview Protected'}
                    </p>
                    <p className="text-xs text-white/60 max-w-xs leading-relaxed">
                      {shieldReason === 'print-attempt'
                        ? 'Printing or exporting protected vault media is prohibited.'
                        : 'Media hidden to prevent background app preview & screenshot capture. Click or focus window to resume.'}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Security Notice for @media print */}
            <div className="vault-print-blocked-notice">
              <div className="flex items-center gap-2 text-red-600 mb-2">
                <ShieldAlert className="h-8 w-8" />
                <span className="text-xl font-bold">Confidential Content Protected</span>
              </div>
              <p className="text-sm text-red-800/80">
                Printing and PDF export of this vault item are blocked by Vault Security Policy.
              </p>
            </div>
          </div>

          {/* Zoom Controls HUD (Photo Mode, only when filmstrip is closed) */}
          {type === 'photo' && !isFilmstripOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                bottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))',
              }}
              className="absolute left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-full border border-white/20 bg-black/80 px-2 py-1 shadow-2xl backdrop-blur-2xl text-white"
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={handleZoomOut}
                disabled={zoomScale <= 1.0}
                className="h-7 w-7 rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
                title="Zoom Out (-)"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>

              <button
                onClick={handleToggleZoom}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white/90 hover:bg-white/10 transition-colors tabular-nums"
                title="Click to toggle 100% / 200% (or Double-Click)"
              >
                {Math.round(zoomScale * 100)}%
              </button>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleZoomIn}
                disabled={zoomScale >= 4.0}
                className="h-7 w-7 rounded-full text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30"
                title="Zoom In (+)"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>

              {(zoomScale !== 1 || rotation !== 0 || flipH || flipV) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleResetZoom}
                  className="h-7 w-7 rounded-full text-white/70 hover:text-white hover:bg-white/10 ml-0.5 border-l border-white/10"
                  title="Reset Zoom & Transforms (0)"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              )}
            </motion.div>
          )}

          {/* Bottom Filmstrip Carousel */}
          {!isFloating && (
            <MediaFilmstrip
              items={allItems}
              activeItemId={previewItem}
              masterKey={masterKey}
              type={type}
              isOpen={isFilmstripOpen}
              onToggle={() => setIsFilmstripOpen(!isFilmstripOpen)}
              onSelect={(id) => {
                if (onSelectMedia) {
                  onSelectMedia(id);
                }
              }}
            />
          )}

          {/* Info & EXIF Metadata Inspector Drawer */}
          {!isFloating && (
            <MediaInspectorDrawer
              item={previewedMedia}
              isOpen={isInspectorOpen}
              onClose={() => setIsInspectorOpen(false)}
              type={type}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
