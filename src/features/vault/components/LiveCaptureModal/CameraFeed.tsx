import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  Plus,
  ShieldAlert,
  RotateCcw,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import {
  CaptureType,
  ZoomCapabilities,
  CameraFilter,
  DualCameraSettings,
  ScannedBarcodeResult,
} from './types';
import { getFilterCss, getFilterPreset } from './filters';
import { triggerHaptic } from './haptics';
import { GyroLevelerOverlay } from './GyroLevelerOverlay';
import { QRScannerOverlay } from './QRScannerOverlay';
import { DualCameraOverlay } from './DualCameraOverlay';

interface CameraFeedProps {
  videoRef: any;
  isInitializing: boolean;
  permissionError?: string | null;
  onRetryPermission?: () => void;
  cameraFacing: 'user' | 'environment';
  isHorizontallyFlipped: boolean;
  captureRatio: '1:1' | '4:5' | '3:4' | '4:3' | '2:3' | '3:2' | '9:16' | '16:9' | '21:9';
  type: CaptureType;
  onFileSelect: (file: File) => void;
  // Features
  isGridEnabled?: boolean;
  isCountingDown?: boolean;
  countdownRemaining?: number;
  onCancelCountdown?: () => void;
  zoomCapabilities?: ZoomCapabilities;
  onZoomChange?: (zoom: number) => void;
  audioLevels?: number[];
  isMuted?: boolean;
  onToggleMute?: () => void;
  activeFilter?: CameraFilter;
  liveTranscript?: string;
  isTranscribing?: boolean;
  transcriptLang?: 'en-IN' | 'hi-IN';
  // 📸 Advanced Camera Modes
  isGyroLevelerEnabled?: boolean;
  isQRScannerEnabled?: boolean;
  onSaveQRToNote?: (result: ScannedBarcodeResult) => Promise<void>;
  isSavingQRNote?: boolean;
  dualCamera?: DualCameraSettings;
  secondaryVideoRef?: React.RefObject<HTMLVideoElement | null>;
  onToggleDualLayout?: () => void;
  onCyclePipPosition?: () => void;
  onSwapDualCameras?: () => void;
}

export const CameraFeed: React.FC<CameraFeedProps> = ({
  videoRef,
  isInitializing,
  permissionError,
  onRetryPermission,
  cameraFacing,
  isHorizontallyFlipped,
  captureRatio,
  type,
  onFileSelect,
  isGridEnabled = false,
  isCountingDown = false,
  countdownRemaining = 0,
  onCancelCountdown,
  zoomCapabilities,
  onZoomChange,
  audioLevels = [],
  isMuted = false,
  onToggleMute,
  activeFilter = 'none',
  liveTranscript,
  isTranscribing = false,
  transcriptLang = 'en-IN',
  isGyroLevelerEnabled = false,
  isQRScannerEnabled = false,
  onSaveQRToNote,
  isSavingQRNote = false,
  dualCamera,
  secondaryVideoRef,
  onToggleDualLayout,
  onCyclePipPosition,
  onSwapDualCameras,
}) => {
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);
  const [focusTarget, setFocusTarget] = useState<{ x: number; y: number } | null>(null);
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aspectRatioValue =
    captureRatio === '1:1'
      ? '1 / 1'
      : captureRatio === '4:5'
        ? '4 / 5'
        : captureRatio === '3:4'
          ? '3 / 4'
          : captureRatio === '4:3'
            ? '4 / 3'
            : captureRatio === '2:3'
              ? '2 / 3'
              : captureRatio === '3:2'
                ? '3 / 2'
                : captureRatio === '9:16'
                  ? '9 / 16'
                  : captureRatio === '21:9'
                    ? '21 / 9'
                    : '16 / 9';

  // Pinch-to-zoom touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && zoomCapabilities?.supported) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = zoomCapabilities.current;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (
      e.touches.length === 2 &&
      touchStartDistRef.current !== null &&
      zoomCapabilities?.supported &&
      onZoomChange
    ) {
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const scale = currentDist / touchStartDistRef.current;
      const targetZoom = Math.min(
        zoomCapabilities.max,
        Math.max(zoomCapabilities.min, touchStartZoomRef.current * scale),
      );
      onZoomChange(targetZoom);
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = null;
  };

  // Tap-to-focus click handler
  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isCountingDown || isInitializing || permissionError) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setFocusTarget({ x, y });
    triggerHaptic('tick');

    if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    focusTimeoutRef.current = setTimeout(() => {
      setFocusTarget(null);
    }, 1200);
  };

  const avgAudioLevel =
    audioLevels.length > 0
      ? audioLevels.reduce((acc, val) => acc + val, 0) / audioLevels.length / 255
      : 0;

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-black select-none touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Loading State Overlay */}
      {isInitializing && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black">
          <Loader2 className="h-8 w-8 md:h-12 md:w-12 animate-spin text-primary/40" />
          <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.3em]">
            Establishing Link...
          </p>
        </div>
      )}

      {/* Permission Error / Dismissed Overlay */}
      {permissionError && !isInitializing && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-6 text-center backdrop-blur-2xl">
          <div className="mb-4 rounded-full bg-amber-500/10 p-4 text-amber-400 border border-amber-500/20">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <h3 className="mb-2 text-base md:text-lg font-bold text-white uppercase tracking-wider">
            Permission Required
          </h3>
          <p className="mb-6 max-w-md text-xs md:text-sm text-white/70 leading-relaxed">
            {permissionError}
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {onRetryPermission && (
              <button
                type="button"
                onClick={onRetryPermission}
                className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-black transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/20"
              >
                <RotateCcw className="h-4 w-4" />
                RETRY PERMISSION
              </button>
            )}
            <label className="flex cursor-pointer items-center gap-2 rounded-full bg-white/10 px-6 py-3 font-semibold text-white transition-all hover:bg-white/20 active:scale-95 border border-white/10 text-xs md:text-sm">
              <Upload className="h-4 w-4" />
              CHOOSE FILE INSTEAD
              <input
                type="file"
                accept={type === 'photo' ? 'image/*' : 'video/*'}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onFileSelect(file);
                  }
                }}
              />
            </label>
          </div>
        </div>
      )}

      {/* Video Preview Container */}
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black p-2 sm:p-3 md:p-4">
        <div
          onClick={handlePreviewClick}
          className={cn(
            'relative h-full w-auto max-w-full overflow-hidden rounded-xl border border-white/10 bg-black md:rounded-2xl cursor-crosshair',
          )}
          style={{ aspectRatio: aspectRatioValue }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ filter: getFilterCss(activeFilter) }}
            className={cn(
              'absolute inset-0 h-full w-full object-contain transition-all duration-700 pointer-events-none',
              (cameraFacing === 'user') !== isHorizontallyFlipped && 'scale-x-[-1]',
              isInitializing || permissionError
                ? 'opacity-0 scale-95 blur-xl'
                : 'opacity-100 scale-100 blur-0',
            )}
          />

          {/* Tap-to-Focus Reticle Target */}
          {focusTarget && (
            <motion.div
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute pointer-events-none z-30 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: focusTarget.x, top: focusTarget.y }}
            >
              <div className="h-full w-full rounded-full border-2 border-primary shadow-[0_0_15px_rgba(0,242,254,0.6)] animate-pulse" />
              <span className="absolute h-2 w-px bg-primary -top-1" />
              <span className="absolute h-2 w-px bg-primary -bottom-1" />
              <span className="absolute w-2 h-px bg-primary -left-1" />
              <span className="absolute w-2 h-px bg-primary -right-1" />
            </motion.div>
          )}

          {/* 3x3 Rule-of-Thirds Framing Grid Overlay */}
          {isGridEnabled && !isInitializing && !permissionError && (
            <div className="absolute inset-0 pointer-events-none z-20 grid grid-cols-3 grid-rows-3">
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />

              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />

              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div />

              {/* Center Power Point Crosshairs */}
              <div className="absolute left-1/3 top-1/3 -translate-x-1/2 -translate-y-1/2 w-3 h-3 flex items-center justify-center">
                <span className="w-2.5 h-px bg-white/40 absolute" />
                <span className="h-2.5 w-px bg-white/40 absolute" />
              </div>
              <div className="absolute left-2/3 top-1/3 -translate-x-1/2 -translate-y-1/2 w-3 h-3 flex items-center justify-center">
                <span className="w-2.5 h-px bg-white/40 absolute" />
                <span className="h-2.5 w-px bg-white/40 absolute" />
              </div>
              <div className="absolute left-1/3 top-2/3 -translate-x-1/2 -translate-y-1/2 w-3 h-3 flex items-center justify-center">
                <span className="w-2.5 h-px bg-white/40 absolute" />
                <span className="h-2.5 w-px bg-white/40 absolute" />
              </div>
              <div className="absolute left-2/3 top-2/3 -translate-x-1/2 -translate-y-1/2 w-3 h-3 flex items-center justify-center">
                <span className="w-2.5 h-px bg-white/40 absolute" />
                <span className="h-2.5 w-px bg-white/40 absolute" />
              </div>
            </div>
          )}

          {/* 📐 Gyroscopic Leveler Overlay */}
          {isGyroLevelerEnabled && !isInitializing && !permissionError && (
            <GyroLevelerOverlay enabled={isGyroLevelerEnabled} />
          )}

          {/* 🤳 Dual Camera Overlay (Picture-in-Picture & Split Screen) */}
          {dualCamera?.enabled && secondaryVideoRef && !isInitializing && !permissionError && (
            <DualCameraOverlay
              enabled={dualCamera.enabled}
              secondaryVideoRef={secondaryVideoRef}
              layout={dualCamera.layout}
              pipPosition={dualCamera.pipPosition}
              isSwapped={dualCamera.isSwapped}
              onToggleLayout={onToggleDualLayout || (() => {})}
              onCyclePipPosition={onCyclePipPosition || (() => {})}
              onSwapCameras={onSwapDualCameras || (() => {})}
              primaryFacing={cameraFacing}
            />
          )}

          {/* 🔍 QR Code & Barcode Instant Scanner Overlay */}
          {isQRScannerEnabled && !isInitializing && !permissionError && onSaveQRToNote && (
            <QRScannerOverlay
              enabled={isQRScannerEnabled}
              videoRef={videoRef}
              onSaveToNote={onSaveQRToNote}
              isSavingNote={isSavingQRNote}
            />
          )}

          {/* Live Speech-to-Text Transcription Subtitles - Compact & Responsive at Bottom */}
          {isTranscribing && liveTranscript && !isInitializing && (
            <div className="absolute bottom-3 sm:bottom-4 md:bottom-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none max-w-[92%] sm:max-w-[80%] md:max-w-[70%]">
              <div className="flex items-center gap-1.5 rounded-full bg-black/85 px-2.5 sm:px-3 py-0.5 sm:py-1 backdrop-blur-2xl border border-white/15 shadow-2xl text-center">
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-[8px] font-black uppercase text-emerald-400/90 tracking-wider shrink-0">
                  {transcriptLang === 'hi-IN' ? 'HI' : 'EN'}
                </span>
                <p className="text-[10px] sm:text-xs font-medium text-white/90 truncate max-w-[200px] sm:max-w-[340px] md:max-w-[420px] leading-tight">
                  "{liveTranscript}"
                </p>
              </div>
            </div>
          )}

          {/* Live Audio Level Visualizer & Mic Control in Video Mode */}
          {type === 'video' && !isInitializing && !permissionError && (
            <div
              role="status"
              onClick={(e) => {
                if (onToggleMute) {
                  e.stopPropagation();
                  onToggleMute();
                }
              }}
              className={cn(
                'absolute z-30 flex items-center gap-1 sm:gap-1.5 rounded-full px-2 sm:px-2.5 py-0.5 sm:py-1 backdrop-blur-2xl border shadow-2xl transition-all duration-150',
                onToggleMute
                  ? 'cursor-pointer pointer-events-auto hover:scale-105 active:scale-95 select-none'
                  : 'pointer-events-none',
                isMuted
                  ? 'bg-black/90 border-white/10 text-white/50'
                  : avgAudioLevel > 0.03
                    ? 'bg-black/90 border-white/25 text-white ring-1 ring-white/15'
                    : 'bg-black/80 border-white/10 text-white/70',
                // Responsive and collision-free positioning across devices and dual camera layouts
                dualCamera?.enabled &&
                  dualCamera.pipPosition === 'top-left' &&
                  dualCamera.layout === 'pip'
                  ? 'top-28 sm:top-36 left-2 sm:left-3'
                  : 'top-2 sm:top-3 left-2 sm:left-3',
              )}
              title={
                isMuted
                  ? 'Microphone muted - Click to unmute'
                  : onToggleMute
                    ? `Voice active (${Math.round(avgAudioLevel * 100)}%) - Click to mute`
                    : 'Voice active'
              }
              aria-label={isMuted ? 'Microphone muted' : 'Microphone audio level indicator'}
            >
              {isMuted ? (
                <VolumeX className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white/50 shrink-0" />
              ) : (
                <Volume2
                  className={cn(
                    'h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0 transition-colors duration-100',
                    avgAudioLevel > 0.03 ? 'text-white' : 'text-white/40',
                  )}
                />
              )}

              {isMuted ? (
                <span className="text-[8px] sm:text-[9px] font-bold text-white/50 uppercase tracking-wider pr-0.5">
                  Muted
                </span>
              ) : (
                <div className="flex items-end gap-[2px] sm:gap-[2.5px] h-3 sm:h-3.5 pb-0.5">
                  {Array.from({ length: 6 }).map((_, i) => {
                    const rawVal = audioLevels[i] ?? 0;
                    const normalized = Math.min(1, (rawVal / 255) * 1.5);
                    const curveWeights = [0.85, 1.2, 1.5, 1.35, 1.1, 0.8];
                    const weight = curveWeights[i] || 1;
                    const finalLevel = Math.min(1, normalized * weight);
                    const height = Math.max(2.5, Math.min(12, Math.round(2.5 + finalLevel * 9.5)));

                    return (
                      <span
                        key={i}
                        className={cn(
                          'w-0.5 sm:w-[2px] rounded-full transition-[height,opacity,background-color] duration-75 ease-out origin-bottom shrink-0',
                          finalLevel > 0.6
                            ? 'bg-white shadow-[0_0_4px_rgba(255,255,255,0.7)] opacity-100'
                            : finalLevel > 0.25
                              ? 'bg-white/85 opacity-90'
                              : avgAudioLevel > 0.03 || finalLevel > 0.05
                                ? 'bg-white/60 opacity-75'
                                : 'bg-white/25 opacity-40',
                        )}
                        style={{ height: `${height}px` }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Active Filter Pill Badge with Dedicated Icon */}
          {activeFilter !== 'none' &&
            !isInitializing &&
            !permissionError &&
            (() => {
              const preset = getFilterPreset(activeFilter);
              const Icon = preset.icon;
              return (
                <div
                  className={cn(
                    'absolute z-30 flex items-center gap-1 sm:gap-1.5 rounded-full bg-black/75 px-2 sm:px-2.5 py-0.5 sm:py-1 backdrop-blur-xl border border-white/15 text-[8px] sm:text-[9px] font-black uppercase tracking-wider shadow-lg pointer-events-none',
                    dualCamera?.enabled &&
                      dualCamera.pipPosition === 'top-right' &&
                      dualCamera.layout === 'pip'
                      ? 'top-28 sm:top-36 right-2 sm:right-3'
                      : 'top-2 sm:top-3 right-2 sm:right-3',
                  )}
                >
                  <Icon className={cn('h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0', preset.iconColor)} />
                  <span className="text-white/90 truncate max-w-[60px] sm:max-w-none">
                    {preset.shortLabel}
                  </span>
                </div>
              );
            })()}

          {/* Zoom Control Pill Bar (when zoom supported) */}
          {zoomCapabilities?.supported && onZoomChange && !isInitializing && !permissionError && (
            <div className="absolute bottom-2 sm:bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 sm:gap-1 rounded-full bg-black/60 p-0.5 sm:p-1 backdrop-blur-xl border border-white/10 shadow-lg max-w-[90%]">
              <button
                type="button"
                onClick={() =>
                  onZoomChange(Math.max(zoomCapabilities.min, zoomCapabilities.current - 0.5))
                }
                className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white active:scale-90"
                title="Zoom Out"
                aria-label="Zoom Out"
              >
                <ZoomOut className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              </button>

              {[1, 2, 3].map((z) => {
                if (z > zoomCapabilities.max && z !== 1) return null;
                const isSelected = Math.abs(zoomCapabilities.current - z) < 0.2;
                return (
                  <button
                    key={z}
                    type="button"
                    onClick={() => onZoomChange(z)}
                    className={cn(
                      'flex h-5 min-w-5 sm:h-6 sm:min-w-6 items-center justify-center rounded-full px-1 sm:px-1.5 text-[9px] sm:text-[10px] font-black transition-all',
                      isSelected
                        ? 'bg-primary text-black shadow-md'
                        : 'text-white/60 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    {z}x
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() =>
                  onZoomChange(Math.min(zoomCapabilities.max, zoomCapabilities.current + 0.5))
                }
                className="flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white active:scale-90"
                title="Zoom In"
                aria-label="Zoom In"
              >
                <ZoomIn className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              </button>
            </div>
          )}

          {/* Self-Timer Countdown Overlay */}
          <AnimatePresence>
            {isCountingDown && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/50 backdrop-blur-xs"
              >
                <motion.div
                  key={countdownRemaining}
                  initial={{ scale: 1.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="flex h-28 w-28 md:h-36 md:w-36 items-center justify-center rounded-full border-4 border-primary/60 bg-black/60 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,242,254,0.4)]"
                >
                  <span className="font-mono text-5xl md:text-7xl font-black text-primary tabular-nums">
                    {countdownRemaining}
                  </span>
                </motion.div>

                {onCancelCountdown && (
                  <button
                    type="button"
                    onClick={onCancelCountdown}
                    className="mt-6 flex items-center gap-1.5 rounded-full bg-white/20 px-4 py-2 text-xs font-bold text-white backdrop-blur-md transition-all hover:bg-white/30 active:scale-95"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel Countdown
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Fallback for cases where camera is not available or blocked */}
      {!permissionError && (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) && (
        <div className="absolute inset-0 z-60 flex flex-col items-center justify-center bg-black/90 p-6 text-center backdrop-blur-3xl">
          <p className="mb-6 text-sm md:text-base font-bold text-white/40 uppercase tracking-widest leading-relaxed max-w-xs md:max-w-md">
            Hardware Interlink Unavailable or Access Denied
          </p>
          <label className="flex cursor-pointer items-center gap-3 rounded-full bg-primary px-10 py-5 font-black text-black transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-primary/40">
            <Plus className="h-5 w-5" />
            EXTERNAL SOURCE UPLOAD
            <input
              type="file"
              accept={type === 'photo' ? 'image/*' : 'video/*'}
              capture={cameraFacing === 'user' ? 'user' : 'environment'}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onFileSelect(file);
                }
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
};
