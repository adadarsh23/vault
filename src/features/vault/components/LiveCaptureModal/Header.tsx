import React from 'react';
import { motion } from 'framer-motion';
import {
  Camera,
  Video,
  Mic,
  MicOff,
  X,
  Loader2,
  Zap,
  Timer,
  Grid3X3,
  SlidersHorizontal,
  Keyboard,
  Info,
  Sparkles,
  Images,
  PictureInPicture2,
  Subtitles,
  Compass,
  QrCode,
  FastForward,
  AudioLines,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../lib/utils';
import { CaptureType, TimerOption, CameraFilter, BurstOption } from './types';
import { getFilterPreset } from './filters';

interface HeaderProps {
  type: CaptureType;
  isRecording: boolean;
  capturedBlob: Blob | null;
  isClosing: boolean;
  onClose: () => void;
  torchSupported?: boolean;
  torchActive?: boolean;
  onToggleTorch?: () => void;
  timerSeconds?: TimerOption;
  onCycleTimer?: () => void;
  isGridEnabled?: boolean;
  onToggleGrid?: () => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onOpenDeviceSelector?: () => void;
  onOpenShortcuts?: () => void;
  isInfoEnabled?: boolean;
  onToggleInfo?: () => void;
  hasMultipleDevices?: boolean;
  // Pro Suite Additions
  activeFilter?: CameraFilter;
  onOpenFilterPicker?: () => void;
  burstCount?: BurstOption;
  onCycleBurst?: () => void;
  isTranscribing?: boolean;
  transcriptLang?: 'en-IN' | 'hi-IN';
  onToggleTranscribe?: () => void;
  voiceClarityPreset?: string;
  onCycleVoiceClarity?: () => void;
  // 📸 Advanced Camera Modes
  isTimelapseEnabled?: boolean;
  timelapseInterval?: 1 | 2 | 5;
  onToggleTimelapse?: () => void;
  isDualCameraEnabled?: boolean;
  onToggleDualCamera?: () => void;
  isGyroLevelerEnabled?: boolean;
  onToggleGyroLeveler?: () => void;
  isQRScannerEnabled?: boolean;
  onToggleQRScanner?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  type,
  isRecording,
  capturedBlob,
  isClosing,
  onClose,
  torchSupported = false,
  torchActive = false,
  onToggleTorch,
  timerSeconds = 0,
  onCycleTimer,
  isGridEnabled = false,
  onToggleGrid,
  isMuted = false,
  onToggleMute,
  onOpenDeviceSelector,
  onOpenShortcuts,
  isInfoEnabled = false,
  onToggleInfo,
  hasMultipleDevices = false,
  activeFilter = 'none',
  onOpenFilterPicker,
  burstCount = 1,
  onCycleBurst,
  isTranscribing = false,
  transcriptLang = 'en-IN',
  onToggleTranscribe,
  voiceClarityPreset = 'crystal',
  onCycleVoiceClarity,
  isTimelapseEnabled = false,
  timelapseInterval = 1,
  onToggleTimelapse,
  isDualCameraEnabled = false,
  onToggleDualCamera,
  isGyroLevelerEnabled = false,
  onToggleGyroLeveler,
  isQRScannerEnabled = false,
  onToggleQRScanner,
}) => {
  const headingLabel = type === 'photo' ? 'Photo' : type === 'video' ? 'Video' : 'Audio';

  return (
    <div className="z-30 flex items-center justify-between p-2 px-2.5 sm:px-4 bg-zinc-950/90 border-b border-white/10 backdrop-blur-3xl shadow-lg gap-1.5 sm:gap-2">
      {/* Left: Type Indicator & Label */}
      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 shrink-0">
        <div className="flex h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 items-center justify-center rounded-lg md:rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-inner shrink-0">
          {type === 'photo' && <Camera className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
          {type === 'video' && <Video className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
          {type === 'audio' && <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
        </div>
        <div className="hidden xs:block">
          <h3 className="text-xs sm:text-sm font-black text-white tracking-wide flex items-center gap-1.5 leading-none">
            {headingLabel}
            {isRecording && (
              <motion.span
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]"
              />
            )}
          </h3>
          <p className="hidden md:block text-[9px] font-bold text-white/40 tracking-wider uppercase mt-0.5">
            {capturedBlob ? 'Review' : `Secure ${headingLabel}`}
          </p>
        </div>
      </div>

      {/* Center/Right Quick Icon Pills - Scrollable & Responsive */}
      {!capturedBlob && (
        <div className="flex-1 min-w-0 mx-1 sm:mx-2 overflow-hidden flex items-center justify-end">
          <div
            role="toolbar"
            aria-label="Camera quick controls"
            className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full justify-start sm:justify-end scroll-smooth touch-pan-x"
          >
            {/* Torch / Flash Toggle (if supported) */}
            {torchSupported && type !== 'audio' && onToggleTorch && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleTorch}
                className={cn(
                  'h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 rounded-full border transition-all shrink-0',
                  torchActive
                    ? 'border-amber-400/50 bg-amber-400/20 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.4)]'
                    : 'border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white',
                )}
                title={torchActive ? 'Turn off flashlight' : 'Turn on flashlight'}
                aria-label="Toggle flashlight"
              >
                <Zap className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Self-Timer Cycle */}
            {type !== 'audio' && onCycleTimer && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onCycleTimer}
                disabled={isRecording}
                className={cn(
                  'relative h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 rounded-full border transition-all shrink-0',
                  timerSeconds > 0
                    ? 'border-primary/50 bg-primary/20 text-primary shadow-[0_0_10px_rgba(0,242,254,0.3)]'
                    : 'border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white',
                )}
                title={`Self-Timer: ${timerSeconds > 0 ? `${timerSeconds}s` : 'Off'}`}
                aria-label={`Timer ${timerSeconds > 0 ? `${timerSeconds} seconds` : 'Off'}`}
              >
                <Timer className="h-3.5 w-3.5" />
                {timerSeconds > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-black text-black">
                    {timerSeconds}
                  </span>
                )}
              </Button>
            )}

            {/* 3x3 Grid Toggle */}
            {type !== 'audio' && onToggleGrid && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleGrid}
                className={cn(
                  'h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 rounded-full border transition-all shrink-0',
                  isGridEnabled
                    ? 'border-primary/50 bg-primary/20 text-primary'
                    : 'border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white',
                )}
                title={isGridEnabled ? 'Hide 3x3 Grid' : 'Show 3x3 Framing Grid'}
                aria-label="Toggle 3x3 framing grid"
              >
                <Grid3X3 className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Mic Mute in Video Mode */}
            {type === 'video' && onToggleMute && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleMute}
                className={cn(
                  'h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 rounded-full border transition-all shrink-0',
                  isMuted
                    ? 'border-red-500/50 bg-red-500/20 text-red-400'
                    : 'border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white',
                )}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                aria-label="Toggle microphone mute"
              >
                {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </Button>
            )}

            {/* Hardware Device Selector Trigger */}
            {hasMultipleDevices && onOpenDeviceSelector && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onOpenDeviceSelector}
                disabled={isRecording}
                className="h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 rounded-full border border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white transition-all shrink-0"
                title="Select Camera / Mic Hardware"
                aria-label="Select media devices"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Desktop Keyboard Shortcuts Modal Trigger */}
            {onOpenShortcuts && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onOpenShortcuts}
                className="hidden md:flex h-8 w-8 min-w-8 rounded-full border border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white transition-all shrink-0"
                title="Keyboard Shortcuts Guide"
                aria-label="Open keyboard shortcuts"
              >
                <Keyboard className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Live Camera Filters Chooser with Dynamic Active Icon */}
            {type !== 'audio' &&
              onOpenFilterPicker &&
              (() => {
                const activePreset = getFilterPreset(activeFilter);
                const FilterIcon = activeFilter !== 'none' ? activePreset.icon : Sparkles;
                return (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={onOpenFilterPicker}
                    className={cn(
                      'h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 rounded-full border transition-all active:scale-90 shrink-0',
                      activeFilter !== 'none'
                        ? 'border-primary/60 bg-primary/20 text-primary shadow-[0_0_10px_rgba(0,242,254,0.35)] ring-1 ring-primary/30'
                        : 'border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white',
                    )}
                    title={`Filter: ${activePreset.label}`}
                    aria-label="Choose camera filter"
                  >
                    <FilterIcon className="h-3.5 w-3.5" />
                  </Button>
                );
              })()}

            {/* Burst Mode in Photo */}
            {type === 'photo' && onCycleBurst && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onCycleBurst}
                className={cn(
                  'relative h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 rounded-full border transition-all shrink-0',
                  burstCount > 1
                    ? 'border-amber-400/50 bg-amber-400/20 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.3)]'
                    : 'border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white',
                )}
                title={`Burst Mode: ${burstCount} shots`}
                aria-label={`Burst shoot ${burstCount} photos`}
              >
                <Images className="h-3.5 w-3.5" />
                {burstCount > 1 && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[8px] font-black text-black">
                    {burstCount}
                  </span>
                )}
              </Button>
            )}

            {/* Live Speech-to-Text Transcription in Video/Audio */}
            {type !== 'photo' && onToggleTranscribe && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleTranscribe}
                className={cn(
                  'relative h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 rounded-full border transition-all shrink-0',
                  isTranscribing
                    ? 'border-emerald-400/50 bg-emerald-400/20 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.3)]'
                    : 'border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white',
                )}
                title={
                  isTranscribing
                    ? `Live Transcription: ${transcriptLang === 'hi-IN' ? 'हिन्दी (Hindi)' : 'English / Hinglish'} (Click to cycle / turn off)`
                    : 'Live Speech-to-Text (Off - Click for English / Hindi)'
                }
                aria-label="Toggle speech to text"
              >
                <Subtitles className="h-3.5 w-3.5" />
                {isTranscribing && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-400 px-0.5 text-[7px] font-black text-black">
                    {transcriptLang === 'hi-IN' ? 'HI' : 'EN'}
                  </span>
                )}
              </Button>
            )}

            {/* 🎙️ Voice Clarity DSP & Noise Gate in Audio/Video Mode */}
            {type !== 'photo' && onCycleVoiceClarity && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onCycleVoiceClarity}
                disabled={isRecording}
                className={cn(
                  'relative h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 rounded-full border transition-all active:scale-90 shrink-0',
                  voiceClarityPreset && voiceClarityPreset !== 'off'
                    ? 'border-cyan-400/60 bg-cyan-400/20 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.4)] ring-1 ring-cyan-400/30'
                    : 'border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white',
                )}
                title={`Voice Clarity & Noise Gate: ${voiceClarityPreset ? voiceClarityPreset.toUpperCase() : 'CRYSTAL'} (Fan & Hum Auto-Suppression)`}
                aria-label="Toggle voice clarity filter preset"
              >
                <AudioLines className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* ⏳ Time-Lapse / Fast-Motion in Video Mode */}
            {type === 'video' && onToggleTimelapse && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleTimelapse}
                disabled={isRecording}
                className={cn(
                  'relative h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 rounded-full border transition-all shrink-0',
                  isTimelapseEnabled
                    ? 'border-amber-400/60 bg-amber-400/20 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.35)]'
                    : 'border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white',
                )}
                title={`Time-Lapse: ${isTimelapseEnabled ? `${timelapseInterval}s / frame (${timelapseInterval * 30}x speed)` : 'Disabled'}`}
                aria-label="Toggle Time-Lapse Recording Mode"
              >
                <FastForward className="h-3.5 w-3.5" />
                {isTimelapseEnabled && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-400 px-0.5 text-[8px] font-black text-black">
                    {timelapseInterval}s
                  </span>
                )}
              </Button>
            )}

            {/* 🤳 Dual Camera Mode in Photo/Video */}
            {type !== 'audio' && onToggleDualCamera && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleDualCamera}
                disabled={isRecording}
                className={cn(
                  'h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 rounded-full border transition-all shrink-0',
                  isDualCameraEnabled
                    ? 'border-sky-400/60 bg-sky-400/20 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.35)]'
                    : 'border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white',
                )}
                title={
                  isDualCameraEnabled
                    ? 'Disable Dual Camera'
                    : 'Enable Dual Camera (Picture-in-Picture / Split)'
                }
                aria-label="Toggle Dual Camera Mode"
              >
                <PictureInPicture2 className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* 📐 Gyroscopic Horizon Leveler in Photo/Video */}
            {type !== 'audio' && onToggleGyroLeveler && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleGyroLeveler}
                className={cn(
                  'h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 rounded-full border transition-all shrink-0',
                  isGyroLevelerEnabled
                    ? 'border-emerald-400/60 bg-emerald-400/20 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.35)]'
                    : 'border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white',
                )}
                title={
                  isGyroLevelerEnabled
                    ? 'Hide Gyro Horizon Leveler'
                    : 'Show Gyroscopic Horizon Leveler'
                }
                aria-label="Toggle Gyroscopic Horizon Leveler"
              >
                <Compass className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* 🔍 QR Code & Barcode Instant Scanner in Photo/Video */}
            {type !== 'audio' && onToggleQRScanner && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleQRScanner}
                className={cn(
                  'h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 rounded-full border transition-all shrink-0',
                  isQRScannerEnabled
                    ? 'border-primary/60 bg-primary/20 text-primary shadow-[0_0_10px_rgba(0,242,254,0.35)]'
                    : 'border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white',
                )}
                title={
                  isQRScannerEnabled
                    ? 'Disable QR / Barcode Scanner'
                    : 'Enable Instant QR & Barcode Scanner'
                }
                aria-label="Toggle QR and Barcode Scanner"
              >
                <QrCode className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Security Info Overlay Toggle */}
            {onToggleInfo && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onToggleInfo}
                className={cn(
                  'h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 rounded-full border transition-all shrink-0',
                  isInfoEnabled
                    ? 'border-primary/50 bg-primary/20 text-primary'
                    : 'border-white/10 bg-black/40 text-white/60 hover:bg-white/10 hover:text-white',
                )}
                title="Toggle Security Info"
                aria-label="Toggle security info overlay"
              >
                <Info className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Right: Close Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        disabled={isClosing}
        className="h-7 w-7 min-w-7 sm:h-8 sm:w-8 sm:min-w-8 md:h-9 md:w-9 md:min-w-9 rounded-full text-white/50 hover:bg-white/10 hover:text-white transition-all shrink-0"
        aria-label="Close modal"
      >
        {isClosing ? (
          <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" />
        ) : (
          <X className="h-4 w-4 md:h-5 md:w-5" />
        )}
      </Button>
    </div>
  );
};
