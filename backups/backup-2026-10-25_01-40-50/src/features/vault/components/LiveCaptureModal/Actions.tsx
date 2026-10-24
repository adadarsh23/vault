import React from 'react';
import { motion } from 'framer-motion';
import {
  CloudUpload,
  Check,
  Plus,
  Square,
  Pause,
  Play,
  Camera,
  User,
  FlipHorizontal,
  Crop,
  RectangleVertical,
  SquareDashed,
  Shield,
  Gauge,
  MoveDiagonal2,
  CameraIcon,
  RotateCcw,
} from 'lucide-react';

import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../lib/utils';
import { CaptureType, CaptureRatio, CaptureQuality, CaptureSize, BurstOption } from './types';

interface ActionsProps {
  type: CaptureType;
  capturedBlob: Blob | null;
  isSaving: boolean;
  isSuccess: boolean;
  isEncrypting: boolean;
  isRecording: boolean;
  isPaused?: boolean;
  isInfoEnabled: boolean;
  onRetake: () => void;
  onSave: () => void;
  onTakePhoto: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onTogglePause?: () => void;
  onTakeSnapshot?: () => void;
  burstCount?: BurstOption;
  onToggleInfo: () => void;
  onToggleCamera: () => void;
  onToggleHorizontalFlip: () => void;
  cameraFacing: 'user' | 'environment';
  isHorizontallyFlipped: boolean;
  captureRatio: CaptureRatio;
  captureQuality: CaptureQuality;
  captureSize: CaptureSize;
  onCycleCaptureRatio: () => void;
  onCycleCaptureQuality: () => void;
  onCycleCaptureSize: () => void;
  isTimelapse?: boolean;
}

export const Actions: React.FC<ActionsProps> = ({
  type,
  capturedBlob,
  isSaving,
  isSuccess,
  isEncrypting,
  isRecording,
  isPaused = false,
  isInfoEnabled: _isInfoEnabled,
  onRetake,
  onSave,
  onTakePhoto,
  onStartRecording,
  onStopRecording,
  onTogglePause,
  onTakeSnapshot,
  burstCount = 1,
  onToggleInfo: _onToggleInfo,
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
  isTimelapse = false,
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
      : captureRatio === '4:5' || captureRatio === '3:4' || captureRatio === '2:3'
        ? RectangleVertical
        : Crop;

  return (
    <div className="z-15 shrink-0 flex items-center justify-center p-2.5 sm:p-3 md:p-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] bg-zinc-950/95 border-t border-white/15 backdrop-blur-3xl relative select-none">
      <div className="absolute inset-0 bg-linear-to-t from-primary/10 to-transparent pointer-events-none opacity-60" />

      {capturedBlob ? (
        <div className="flex w-full max-w-md items-center justify-center gap-2 sm:gap-4 relative z-10 px-2">
          {/* Retake Button */}
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onRetake}
            className="h-11 sm:h-12 flex-1 rounded-2xl bg-white/5 px-3 sm:px-6 text-white/70 hover:bg-white/10 hover:text-white border border-white/10 font-bold uppercase tracking-wider text-[11px] sm:text-xs transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <RotateCcw className="h-4 w-4 shrink-0" />
            <span>Retake</span>
          </Button>

          {/* Upload / Save to Vault Button */}
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={onSave}
            disabled={isSaving || isSuccess}
            className={cn(
              'group relative h-11 sm:h-12 flex-[1.4] overflow-hidden rounded-2xl px-4 sm:px-8 text-black transition-all active:scale-95 shadow-xl',
              isSuccess ? 'bg-emerald-500 shadow-emerald-500/20' : 'bg-primary shadow-primary/20',
              (isSaving || isSuccess) && 'cursor-not-allowed opacity-80',
            )}
          >
            <div className="relative z-10 flex items-center justify-center gap-2">
              {isEncrypting ? (
                <Shield className="h-4 w-4 sm:h-5 sm:w-5 animate-pulse fill-black/10 shrink-0" />
              ) : isSaving ? (
                <CloudUpload className="h-4 w-4 sm:h-5 sm:w-5 animate-bounce shrink-0" />
              ) : isSuccess ? (
                <Check className="h-4 w-4 sm:h-5 sm:w-5 stroke-[4px] shrink-0" />
              ) : (
                <Plus className="h-4 w-4 sm:h-5 sm:w-5 stroke-[3px] shrink-0" />
              )}
              <span className="text-xs sm:text-sm font-black uppercase tracking-wider truncate">
                {isEncrypting
                  ? 'Encrypting'
                  : isSaving
                    ? 'Syncing'
                    : isSuccess
                      ? 'Saved'
                      : 'Save Vault'}
              </span>
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
            <div className="grid grid-cols-3 items-center gap-1 sm:gap-2">
              {/* Left Controls: Ratio & Size & Info */}
              <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 justify-start">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onCycleCaptureRatio}
                  disabled={disableCaptureTuning}
                  className={cn(
                    'h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 rounded-full bg-black/40 text-white/80 border border-white/10 hover:bg-black/60 hover:text-white transition-transform duration-200 active:scale-90',
                    'text-primary border-primary/20 bg-primary/10',
                  )}
                  title={`Aspect ratio: ${captureRatio}`}
                  aria-label={`Aspect ratio: ${captureRatio}`}
                >
                  <RatioIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onCycleCaptureSize}
                  disabled={disableCaptureTuning}
                  className={cn(
                    'h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 rounded-full bg-black/40 text-white/60 border border-white/10 hover:bg-black/60 hover:text-white transition-transform duration-200 active:scale-90',
                    captureSize === 'full'
                      ? 'text-sky-300 border-sky-400/30 bg-sky-500/10'
                      : captureSize === 'medium'
                        ? 'text-violet-300 border-violet-400/30 bg-violet-500/10'
                        : 'text-white/70',
                  )}
                  title={`Size: ${sizeLabel}`}
                  aria-label={`Capture size: ${sizeLabel}`}
                >
                  <MoveDiagonal2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>
              </div>

              {/* Center Shutter / Record & Pause Controls */}
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                {type === 'photo' ? (
                  <button
                    type="button"
                    onClick={onTakePhoto}
                    className={cn(
                      'group relative flex h-14 w-14 sm:h-15 sm:w-15 md:h-16 md:w-16 items-center justify-center rounded-full border-[4px] sm:border-[5px] transition-all hover:scale-105 active:scale-95 shadow-2xl shrink-0',
                      burstCount > 1
                        ? 'border-amber-400 shadow-amber-400/20'
                        : 'border-white shadow-white/10',
                    )}
                    aria-label={burstCount > 1 ? `Take ${burstCount} Burst Photos` : 'Take Photo'}
                  >
                    <div
                      className={cn(
                        'h-10 w-10 sm:h-11 sm:w-11 md:h-12 md:w-12 rounded-full group-hover:scale-90 transition-transform shadow-inner',
                        burstCount > 1 ? 'bg-amber-400' : 'bg-white',
                      )}
                    />
                    {burstCount > 1 && (
                      <span className="absolute text-[10px] font-black text-black select-none pointer-events-none">
                        {burstCount}x
                      </span>
                    )}
                    <div className="absolute -inset-3 rounded-full border border-white/10 animate-ping opacity-20 pointer-events-none" />
                  </button>
                ) : (
                  <div className="flex items-center gap-2 sm:gap-3">
                    {/* In-Video Snapshot Button during active recording */}
                    {isRecording && onTakeSnapshot && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={onTakeSnapshot}
                        className="h-10 w-10 sm:h-11 sm:w-11 rounded-full border border-white/20 bg-black/60 text-white hover:bg-white/10 hover:text-primary transition-all shadow-lg active:scale-90"
                        title="Take Still Photo while recording"
                        aria-label="Take Still Photo"
                      >
                        <CameraIcon className="h-4 w-4" />
                      </Button>
                    )}

                    {/* Main Record / Stop Button */}
                    <button
                      type="button"
                      onClick={isRecording ? onStopRecording : onStartRecording}
                      className={cn(
                        'group relative flex h-14 w-14 sm:h-15 sm:w-15 md:h-16 md:w-16 items-center justify-center rounded-full border-[4px] sm:border-[5px] transition-all hover:scale-105 active:scale-95 shadow-2xl shrink-0',
                        isRecording
                          ? isTimelapse
                            ? 'border-amber-400 shadow-amber-400/40'
                            : 'border-red-500 shadow-red-500/30'
                          : isTimelapse
                            ? 'border-amber-300 shadow-amber-300/30'
                            : 'border-white shadow-white/10',
                      )}
                      aria-label={isRecording ? 'Stop Recording' : 'Start Recording'}
                    >
                      {isRecording ? (
                        <Square
                          className={cn(
                            'h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7 rounded-sm',
                            isTimelapse
                              ? 'fill-amber-400 text-amber-400'
                              : 'fill-red-500 text-red-500',
                          )}
                        />
                      ) : (
                        <div
                          className={cn(
                            'h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11 rounded-full transition-all group-hover:scale-90 shadow-inner',
                            isTimelapse
                              ? 'bg-amber-400'
                              : type === 'video'
                                ? 'bg-red-500'
                                : 'bg-primary',
                          )}
                        />
                      )}
                      {isRecording && !isPaused && (
                        <div
                          className={cn(
                            'absolute -inset-3 rounded-full border animate-ping pointer-events-none',
                            isTimelapse ? 'border-amber-400/40' : 'border-red-500/30',
                          )}
                        />
                      )}
                    </button>

                    {/* Pause / Resume Button during active recording */}
                    {isRecording && onTogglePause && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={onTogglePause}
                        className={cn(
                          'h-10 w-10 sm:h-11 sm:w-11 rounded-full border transition-all shadow-lg',
                          isPaused
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 hover:bg-amber-500/30'
                            : 'bg-black/60 border-white/20 text-white hover:bg-white/10',
                        )}
                        title={isPaused ? 'Resume Recording' : 'Pause Recording'}
                        aria-label={isPaused ? 'Resume Recording' : 'Pause Recording'}
                      >
                        {isPaused ? (
                          <Play className="h-4 w-4 fill-amber-300 text-amber-300" />
                        ) : (
                          <Pause className="h-4 w-4 fill-white text-white" />
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Right Controls: Quality & Mirror & Flip Camera */}
              <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onCycleCaptureQuality}
                  disabled={disableCaptureTuning}
                  className={cn(
                    'h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 rounded-full bg-black/40 text-white/60 border border-white/10 hover:bg-black/60 hover:text-white transition-transform duration-200',
                    captureQuality === 'high'
                      ? 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10'
                      : captureQuality === 'balanced'
                        ? 'text-yellow-300 border-yellow-400/30 bg-yellow-500/10'
                        : 'text-white/70',
                  )}
                  title={`Quality: ${qualityLabel}`}
                  aria-label={`Capture quality: ${qualityLabel}`}
                >
                  <Gauge className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onToggleHorizontalFlip}
                  disabled={isVideoRecording}
                  className={cn(
                    'h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 rounded-full bg-black/40 text-white/60 border border-white/10 hover:bg-black/60 hover:text-white transition-transform duration-200',
                    isHorizontallyFlipped && 'text-primary border-primary/20 bg-primary/10',
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
                  <FlipHorizontal className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onToggleCamera}
                  disabled={isVideoRecording}
                  className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 rounded-full bg-black/40 text-white/60 border border-white/10 hover:bg-black/60 hover:text-white transition-transform duration-200"
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
                    <User className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  ) : (
                    <Camera className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {type === 'audio' && (
            <div className="h-12 flex flex-col items-center justify-center">
              <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">
                Live Audio Interlink Active
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
