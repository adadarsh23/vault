import React from 'react';
import { motion } from 'framer-motion';
import {
  CloudUpload,
  Check,
  Plus,
  Square,
  Info,
  Camera,
  User,
  FlipHorizontal,
  Crop,
  RectangleVertical,
  SquareDashed,
  Shield,
  Gauge,
  MoveDiagonal2,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../lib/utils';
import { CaptureType } from './types';

interface ActionsProps {
  type: CaptureType;
  capturedBlob: Blob | null;
  isSaving: boolean;
  isSuccess: boolean;
  isEncrypting: boolean;
  isRecording: boolean;
  isInfoEnabled: boolean;
  onRetake: () => void;
  onSave: () => void;
  onTakePhoto: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onToggleInfo: () => void;
  onToggleCamera: () => void;
  onToggleHorizontalFlip: () => void;
  cameraFacing: 'user' | 'environment';
  isHorizontallyFlipped: boolean;
  captureRatio: '1:1' | '4:5' | '3:4' | '4:3' | '2:3' | '3:2' | '9:16' | '16:9' | '21:9';
  captureQuality: 'high' | 'balanced' | 'low';
  captureSize: 'full' | 'medium' | 'compact';
  onCycleCaptureRatio: () => void;
  onCycleCaptureQuality: () => void;
  onCycleCaptureSize: () => void;
}

export const Actions: React.FC<ActionsProps> = ({
  type,
  capturedBlob,
  isSaving,
  isSuccess,
  isEncrypting,
  isRecording,
  isInfoEnabled,
  onRetake,
  onSave,
  onTakePhoto,
  onStartRecording,
  onStopRecording,
  onToggleInfo,
  onToggleCamera,
  onToggleHorizontalFlip,
  cameraFacing,
  isHorizontallyFlipped,
  captureRatio,
  captureQuality,
  captureSize,
  onCycleCaptureRatio,
  onCycleCaptureQuality,
  onCycleCaptureSize,
}) => {
  const qualityLabel =
    captureQuality === 'high' ? 'High' : captureQuality === 'balanced' ? 'Balanced' : 'Low';

  const sizeLabel =
    captureSize === 'full' ? 'Full' : captureSize === 'medium' ? 'Medium' : 'Compact';
  const isVideoMode = type === 'video';
  const isVideoRecording = isVideoMode && isRecording;
  const disableCaptureTuning = isVideoRecording;
  const isFrontCamera = cameraFacing === 'user';
  const RatioIcon =
    captureRatio === '1:1'
      ? SquareDashed
      : captureRatio === '4:5'
        ? RectangleVertical
        : captureRatio === '3:4'
          ? RectangleVertical
          : captureRatio === '4:3'
            ? Crop
            : captureRatio === '2:3'
              ? RectangleVertical
              : captureRatio === '3:2'
                ? Crop
                : captureRatio === '21:9'
                  ? Crop
                  : Crop;

  return (
    <div className="z-10 flex items-center justify-center p-2 md:p-4 bg-black/30 border-t border-white/20 backdrop-blur-3xl relative">
      <div className="absolute inset-0 bg-linear-to-t from-primary/10 to-transparent pointer-events-none opacity-60" />

      {capturedBlob ? (
        <div className="flex w-full max-w-xl items-center justify-center gap-3 md:gap-6 relative z-10">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onRetake}
            className="h-11 md:h-14 flex-1 rounded-xl md:rounded-2xl bg-white/3 px-4 md:px-8 text-white/60 hover:bg-white/10 hover:text-white border border-white/5 font-black uppercase tracking-widest text-[9px] md:text-xs transition-all active:scale-95"
          >
            Retake
          </Button>
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={onSave}
            disabled={isSaving || isSuccess}
            className={cn(
              'group relative h-11 md:h-14 flex-[1.5] overflow-hidden rounded-xl md:rounded-2xl px-6 md:px-10 text-black transition-all active:scale-95 shadow-2xl',
              isSuccess ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-primary shadow-primary/20',
              (isSaving || isSuccess) && 'cursor-not-allowed opacity-80'
            )}
          >
            <div className="relative z-10 flex items-center justify-center gap-2 md:gap-3">
              {isEncrypting ? (
                <Shield className="h-4 w-4 md:h-5 md:w-5 animate-pulse fill-black/10" />
              ) : isSaving ? (
                <CloudUpload className="h-4 w-4 md:h-5 md:w-5 animate-bounce" />
              ) : isSuccess ? (
                <Check className="h-4 w-4 md:h-5 md:w-5 stroke-[4px]" />
              ) : (
                <Plus className="h-4 w-4 md:h-5 md:w-5 stroke-[3px]" />
              )}
              <div className="flex flex-col items-start leading-none text-left">
                <span className="text-xs md:text-sm font-black uppercase tracking-widest">
                  {isEncrypting
                    ? 'Encrypting'
                    : isSaving
                      ? 'Syncing'
                      : isSuccess
                        ? 'Transmitted'
                        : 'Upload'}
                </span>
                {!isEncrypting && !isSaving && !isSuccess && (
                  <span
                    key="e2ee-badge"
                    className="hidden sm:block text-[8px] md:text-[9px] font-bold opacity-70 tracking-wider"
                  >
                    E2EE
                  </span>
                )}
              </div>
            </div>

            {!isSaving && !isSuccess && (
              <motion.div
                animate={{ x: ['-100%', '200%'] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                className="absolute inset-0 bg-linear-to-r from-transparent via-white/40 to-transparent w-full pointer-events-none"
              />
            )}
          </Button>
        </div>
      ) : (
        <div className="relative w-full">
          {(type === 'photo' || type === 'video') && (
            <div className="grid grid-cols-3 items-center gap-2">
              <div className="flex items-center gap-2 justify-start">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onToggleInfo}
                  className={cn(
                    'h-9 w-9 md:h-10 md:w-10 rounded-full bg-black/40 text-white/60 border border-white/10 hover:bg-black/60 hover:text-white transition-transform duration-200',
                    isInfoEnabled && 'text-primary border-primary/20 bg-primary/10'
                  )}
                  disabled={isVideoRecording}
                  title="Capture info"
                  aria-label="Toggle capture info overlay"
                >
                  <Info className="h-4 w-4 md:h-4 md:w-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onCycleCaptureRatio}
                  disabled={disableCaptureTuning}
                  className={cn(
                    'h-9 w-9 md:h-10 md:w-10 rounded-full bg-black/40 text-white/80 border border-white/10 hover:bg-black/60 hover:text-white transition-transform duration-200',
                    'text-primary border-primary/20 bg-primary/10'
                  )}
                  title={`Aspect ratio: ${captureRatio}`}
                  aria-label={`Aspect ratio: ${captureRatio}`}
                >
                  <RatioIcon className="h-4 w-4 md:h-4 md:w-4" />
                </Button>
                <span
                  className="hidden lg:inline-flex min-w-[46px] items-center justify-center rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold tracking-wide text-primary"
                  aria-label={`Current ratio ${captureRatio}`}
                >
                  {captureRatio}
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onCycleCaptureSize}
                  disabled={disableCaptureTuning}
                  className={cn(
                    'h-9 w-9 md:h-10 md:w-10 rounded-full bg-black/40 text-white/60 border border-white/10 hover:bg-black/60 hover:text-white transition-transform duration-200',
                    captureSize === 'full'
                      ? 'text-sky-300 border-sky-400/30 bg-sky-500/10'
                      : captureSize === 'medium'
                        ? 'text-violet-300 border-violet-400/30 bg-violet-500/10'
                        : 'text-white/70'
                  )}
                  title={`Size: ${sizeLabel}`}
                  aria-label={`Capture size: ${sizeLabel}`}
                >
                  <MoveDiagonal2 className="h-4 w-4 md:h-4 md:w-4" />
                </Button>
              </div>

              <div className="flex items-center justify-center">
                {type === 'photo' ? (
                  <button
                    type="button"
                    onClick={onTakePhoto}
                    className="group relative flex h-14 w-14 md:h-16 md:w-16 items-center justify-center rounded-full border-[5px] border-white transition-all hover:scale-110 active:scale-90 shadow-2xl"
                  >
                    <div className="h-11 w-11 md:h-12 md:w-12 rounded-full bg-white group-hover:scale-90 transition-transform" />
                    <div className="absolute -inset-4 rounded-full border border-white/5 animate-ping opacity-20 pointer-events-none" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={isRecording ? onStopRecording : onStartRecording}
                    className={cn(
                      'group relative flex h-14 w-14 md:h-16 md:w-16 items-center justify-center rounded-full border-[5px] transition-all hover:scale-110 active:scale-90 shadow-2xl',
                      isRecording
                        ? 'border-red-500 shadow-red-500/20'
                        : 'border-white shadow-white/5'
                    )}
                  >
                    {isRecording ? (
                      <Square className="h-6 w-6 md:h-8 md:w-8 fill-red-500 text-red-500 rounded-sm" />
                    ) : (
                      <div
                        className={cn(
                          'h-10 w-10 md:h-12 md:w-12 rounded-full transition-all group-hover:scale-90',
                          type === 'video' ? 'bg-red-500' : 'bg-primary'
                        )}
                      />
                    )}
                    {isRecording && (
                      <div className="absolute -inset-4 rounded-full border border-red-500/20 animate-ping pointer-events-none" />
                    )}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onCycleCaptureQuality}
                  disabled={disableCaptureTuning}
                  className={cn(
                    'h-9 w-9 md:h-10 md:w-10 rounded-full bg-black/40 text-white/60 border border-white/10 hover:bg-black/60 hover:text-white transition-transform duration-200',
                    captureQuality === 'high'
                      ? 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10'
                      : captureQuality === 'balanced'
                        ? 'text-yellow-300 border-yellow-400/30 bg-yellow-500/10'
                        : 'text-white/70'
                  )}
                  title={`Quality: ${qualityLabel}`}
                  aria-label={`Capture quality: ${qualityLabel}`}
                >
                  <Gauge className="h-4 w-4 md:h-4 md:w-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onToggleHorizontalFlip}
                  disabled={isVideoRecording}
                  className={cn(
                    'h-9 w-9 md:h-10 md:w-10 rounded-full bg-black/40 text-white/60 border border-white/10 hover:bg-black/60 hover:text-white transition-transform duration-200',
                    isHorizontallyFlipped && 'text-primary border-primary/20 bg-primary/10'
                  )}
                  title={
                    isHorizontallyFlipped
                      ? 'Left-right flip active. Tap to restore.'
                      : 'Flip view left-right'
                  }
                  aria-label={
                    isHorizontallyFlipped
                      ? 'Left-right flip active, tap to restore'
                      : 'Flip view left-right'
                  }
                >
                  <FlipHorizontal className="h-4 w-4 md:h-4 md:w-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onToggleCamera}
                  disabled={isVideoRecording}
                  className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-black/40 text-white/60 border border-white/10 hover:bg-black/60 hover:text-white transition-transform duration-200"
                  title={
                    isFrontCamera
                      ? 'Front camera active. Tap to switch to back camera.'
                      : 'Back camera active. Tap to switch to front camera.'
                  }
                  aria-label={
                    isFrontCamera
                      ? 'Front camera active, flip to back camera'
                      : 'Back camera active, flip to front camera'
                  }
                >
                  {isFrontCamera ? (
                    <User className="h-4 w-4 md:h-4 md:w-4" />
                  ) : (
                    <Camera className="h-4 w-4 md:h-4 md:w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {type === 'audio' && (
            <div className="h-14 flex flex-col items-center justify-center">
              <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.5em]">
                Session Link Active
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
