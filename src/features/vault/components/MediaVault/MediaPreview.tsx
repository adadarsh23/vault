import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { GlobalNavigator } from '../../../../components/vault/GlobalNavigator';
import { SafeMedia } from './SafeMedia';
import { ErrorBoundary } from './ErrorBoundary';
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
  modalRef: React.RefObject<HTMLDivElement>;
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
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  modalRef,
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const closeRequestedRef = useRef(false);

  const stopActiveMediaImmediately = useCallback(() => {
    try {
      window.dispatchEvent(
        new CustomEvent('vault-audio-play', { detail: { playerId: '__stop_all__' } })
      );
    } catch {
      // Ignore event dispatch failure
    }
    const root = modalRef.current;
    if (!root) return;

    const mediaElements = root.querySelectorAll('video, audio');
    mediaElements.forEach((node) => {
      const media = node as HTMLMediaElement;
      try {
        media.pause();
      } catch {
        // Ignore media pause failures.
      }
      try {
        media.currentTime = 0;
      } catch {
        // Ignore seek failures.
      }
      try {
        media.srcObject = null;
      } catch {
        // Ignore srcObject assignment failures.
      }
      try {
        media.removeAttribute('src');
      } catch {
        // Ignore src attribute cleanup failures.
      }
      try {
        media.load();
      } catch {
        // Ignore load reset failures.
      }
    });
  }, [modalRef]);

  const handleImmediateClose = useCallback(() => {
    if (closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    setIsClosing(true);
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

  return (
    <AnimatePresence>
      {previewItem && (
        <motion.div
          key="media-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={`${previewedMedia?.title || 'Media'} preview`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/95 backdrop-blur-2xl p-4 transition-colors duration-300"
          ref={modalRef}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
              e.stopPropagation();
              handleImmediateClose();
            }
          }}
        >
          <div className="absolute right-4 top-4 z-50 flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close preview"
              disabled={isClosing}
              className="rounded-full bg-white/5 hover:bg-white/10 text-white disabled:opacity-80"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleImmediateClose();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleImmediateClose();
              }}
            >
              {isClosing ? <Loader2 className="h-5 w-5 animate-spin" /> : <X className="h-6 w-6" />}
            </Button>
          </div>

          <GlobalNavigator
            canPrevious={canPrevious}
            canNext={canNext}
            onPrevious={handlePrevious}
            onNext={handleNext}
            layout="overlay"
            className="rounded-full bg-white/5 hover:bg-white/10"
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              'relative flex items-center justify-center bg-black/90 overflow-hidden',
              'h-[100svh] w-[100vw] rounded-none border-0 shadow-none'
            )}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <div className="w-full h-full overflow-hidden touch-pan-y flex items-center justify-center">
              {isPreparingPreview ? (
                <div className="flex h-64 w-64 flex-col items-center justify-center gap-3 text-white/70">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-xs uppercase tracking-wider">Opening preview...</p>
                </div>
              ) : previewedMedia ? (
                <div className="relative h-full w-full flex items-center justify-center">
                  <ErrorBoundary
                    fallback={
                      <div className="flex flex-col items-center justify-center p-20 text-red-400/60">
                        <AlertTriangle className="h-10 w-10 mb-2" />
                        <p>Playback failed</p>
                      </div>
                    }
                  >
                    {masterKey && (
                      <SafeMedia
                        item={previewedMedia}
                        masterKey={masterKey}
                        type={type}
                        isThumbnail={false}
                        autoPlayVideo={isMediaAutoplayEnabled}
                        lowDataMode={isLowDataModeEnabled}
                        networkAwareAutoplay={isNetworkAwareAutoplayEnabled}
                        performanceHud={isPerformanceHudEnabled}
                        className="max-w-full max-h-full flex items-center justify-center"
                      />
                    )}
                  </ErrorBoundary>
                  {type === 'photo' && previewedMedia.title && (
                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 pt-12 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none z-10">
                      <h3 className="text-white text-center text-sm md:text-base font-bold truncate drop-shadow-xl">
                        {previewedMedia.title}
                      </h3>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-64 w-64 items-center justify-center text-white/20">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
