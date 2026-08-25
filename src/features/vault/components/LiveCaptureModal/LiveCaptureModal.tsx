import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useVaultStore } from '../../../../store/vaultStore';
import { encryptFileE2EE } from '../../../../lib/encryption';
import { cn } from '../../../../lib/utils';
import { logger } from '../../../../lib/logger';
import {
  CaptureType,
  CaptureRatio,
  CaptureQuality,
  CaptureSize,
  TimerOption,
  BurstOption,
  CameraFilter,
  ZoomCapabilities,
  MediaDeviceInfoItem,
  getSupportedMimeType,
  TimelapseInterval,
  TimelapseStats,
  DualCameraSettings,
  DualCameraLayout,
  PipPosition,
  ScannedBarcodeResult,
} from './types';
import { startTimelapseSession, TimelapseController } from './timelapseEngine';
import { createDualCameraManager, DualCameraManager } from './dualCameraEngine';
import { saveBarcodeToEncryptedVaultNote } from './qrScannerEngine';
import { Header } from './Header';
import { InfoOverlays } from './InfoOverlays';
import { PreviewContent } from './PreviewContent';
import { CameraFeed } from './CameraFeed';
import { AudioRecording } from './AudioRecording';
import { RecordingStatus } from './RecordingStatus';
import { Actions } from './Actions';
import { DeviceSelectorModal } from './DeviceSelectorModal';
import { ShortcutsModal } from './ShortcutsModal';
import { FilterPickerModal } from './FilterPickerModal';
import { getFilterCss } from './filters';
import { triggerHaptic } from './haptics';
import { useMediaQuery } from '../../../../hooks/use-media-query';
import {
  VoiceClarityPreset,
  createFilteredMediaStream,
  FilteredStreamResult,
  VOICE_CLARITY_PRESETS,
} from '../../../../lib/audioDsp';

interface LiveCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (
    file: File,
    isEncrypted: boolean,
    additionalMetadata?: Record<string, any>,
  ) => void | Promise<void>;
  type: CaptureType;
}

const CAPTURE_RATIOS: CaptureRatio[] = [
  '1:1',
  '4:5',
  '3:4',
  '4:3',
  '2:3',
  '3:2',
  '9:16',
  '16:9',
  '21:9',
];

const getDefaultCaptureRatio = (type: CaptureType, isMobileViewport: boolean): CaptureRatio => {
  if (type === 'photo') {
    return isMobileViewport ? '3:4' : '4:3';
  }

  if (type === 'video') {
    return isMobileViewport ? '9:16' : '16:9';
  }

  return isMobileViewport ? '9:16' : '16:9';
};

const getDefaultCameraFacing = (isMobileViewport: boolean): 'user' | 'environment' =>
  isMobileViewport ? 'environment' : 'user';

export const LiveCaptureModal: React.FC<LiveCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  type,
}) => {
  const isMobileViewport = useMediaQuery('(max-width: 767px)');
  const defaultCaptureRatio = getDefaultCaptureRatio(type, isMobileViewport);
  const defaultCameraFacing = getDefaultCameraFacing(isMobileViewport);
  const { preferences, updatePreferences, rsaKeyPair, masterKey, addItem } = useVaultStore();
  const isInfoEnabled = preferences.isLiveCaptureInfoEnabled;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>(
    () => defaultCameraFacing,
  );
  const [captureRatio, setCaptureRatio] = useState<CaptureRatio>(() => defaultCaptureRatio);
  const [captureQuality, setCaptureQuality] = useState<CaptureQuality>('high');
  const [captureSize, setCaptureSize] = useState<CaptureSize>('full');
  const [isSaving, setIsSaving] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isHorizontallyFlipped, setIsHorizontallyFlipped] = useState(false);
  const [recordingSize, setRecordingSize] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(12).fill(0));
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // ⏳ Time-Lapse & Fast-Motion States
  const [isTimelapseEnabled, setIsTimelapseEnabled] = useState(false);
  const [timelapseInterval, setTimelapseInterval] = useState<TimelapseInterval>(1);
  const [timelapseStats, setTimelapseStats] = useState<TimelapseStats | null>(null);
  const timelapseSessionRef = useRef<TimelapseController | null>(null);

  // 🤳 Dual Camera States
  const [dualCamera, setDualCamera] = useState<DualCameraSettings>({
    enabled: false,
    layout: 'pip',
    pipPosition: 'top-right',
    isSwapped: false,
  });
  const dualCameraManagerRef = useRef<DualCameraManager | null>(null);
  const secondaryVideoRef = useRef<HTMLVideoElement | null>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositeRafRef = useRef<number | null>(null);
  const filteredVideoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const filteredVideoRafRef = useRef<number | null>(null);

  // 📐 Gyroscopic Horizon Leveler State
  const [isGyroLevelerEnabled, setIsGyroLevelerEnabled] = useState(false);

  // 🔍 QR Code & Barcode Scanner States
  const [isQRScannerEnabled, setIsQRScannerEnabled] = useState(false);
  const [isSavingQRNote, setIsSavingQRNote] = useState(false);

  // Pro features states
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchActive, setTorchActive] = useState(false);
  const [zoomCapabilities, setZoomCapabilities] = useState<ZoomCapabilities>({
    min: 1,
    max: 1,
    step: 0.1,
    current: 1,
    supported: false,
  });
  const [timerSeconds, setTimerSeconds] = useState<TimerOption>(0);
  const [burstCount, setBurstCount] = useState<BurstOption>(1);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState(0);
  const [isGridEnabled, setIsGridEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [activeFilter, setActiveFilter] = useState<CameraFilter>('none');
  const [isFilterPickerOpen, setIsFilterPickerOpen] = useState(false);
  const [isDeviceSelectorOpen, setIsDeviceSelectorOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfoItem[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfoItem[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string>('');
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>('');

  // Live Speech Transcription
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptLang, setTranscriptLang] = useState<'en-IN' | 'hi-IN'>('en-IN');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [activeVoicePreset, setActiveVoicePreset] = useState<VoiceClarityPreset>('crystal');
  const speechRecognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>('');
  const filteredStreamRef = useRef<FilteredStreamResult | null>(null);

  const isIOS =
    typeof window !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const MAX_RECORDING_SIZE_MB = preferences.maxRecordingSizeMB || (isIOS ? 150 : 500);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lastAudioUpdateRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastSizeUpdateRef = useRef<number>(0);
  const wakeLockRef = useRef<any>(null);
  const totalSizeRef = useRef<number>(0);
  const CAPTURE_SETTINGS_KEY = isMobileViewport
    ? 'vault.liveCapture.settings.mobile.v3'
    : 'vault.liveCapture.settings.desktop.v3';

  const getCaptureProfile = (quality: CaptureQuality, size: CaptureSize, ratio: CaptureRatio) => {
    const qualityProfiles = {
      high: { photoJpegQuality: 0.95, frameRate: 30 },
      balanced: { photoJpegQuality: 0.88, frameRate: 24 },
      low: { photoJpegQuality: 0.8, frameRate: 20 },
    } as const;

    const sizeScale = {
      full: 1,
      medium: 0.75,
      compact: 0.55,
    } as const;

    const baseByRatio = {
      '1:1': { width: 1080, height: 1080 },
      '4:5': { width: 1080, height: 1350 },
      '3:4': { width: 1080, height: 1440 },
      '4:3': { width: 1440, height: 1080 },
      '2:3': { width: 1080, height: 1620 },
      '3:2': { width: 1620, height: 1080 },
      '9:16': { width: 1080, height: 1920 },
      '16:9': { width: 1920, height: 1080 },
      '21:9': { width: 2520, height: 1080 },
    } as const;

    return {
      ...qualityProfiles[quality],
      ...baseByRatio[ratio],
      scale: sizeScale[size],
    };
  };

  const clampDimensions = (width: number, height: number) => ({
    width: Math.max(320, Math.round(width)),
    height: Math.max(240, Math.round(height)),
  });

  // Synthesize audible countdown beeps
  const playBeep = useCallback((freq = 880, duration = 0.12) => {
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
      setTimeout(
        () => {
          ctx.close().catch(() => {});
        },
        (duration + 0.1) * 1000,
      );
    } catch {
      /* ignore audio beep errors */
    }
  }, []);

  // Enumerate hardware cameras and microphones
  const enumerateDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vDevices: MediaDeviceInfoItem[] = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${i + 1}`,
          kind: 'videoinput',
          groupId: d.groupId,
        }));
      const aDevices: MediaDeviceInfoItem[] = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
          kind: 'audioinput',
          groupId: d.groupId,
        }));
      setVideoDevices(vDevices);
      setAudioDevices(aDevices);
    } catch (err) {
      logger.warn('Failed to enumerate media devices', { err });
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  // Load preferences from local storage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CAPTURE_SETTINGS_KEY);
      if (!raw) {
        setCaptureRatio(defaultCaptureRatio);
        setCameraFacing(defaultCameraFacing);
        return;
      }
      const parsed = JSON.parse(raw) as Partial<{
        ratio: CaptureRatio;
        quality: CaptureQuality;
        size: CaptureSize;
        facing: 'user' | 'environment';
        grid: boolean;
        timer: TimerOption;
        filter: CameraFilter;
        burst: BurstOption;
      }>;
      if (parsed.ratio && CAPTURE_RATIOS.includes(parsed.ratio)) {
        setCaptureRatio(parsed.ratio);
      } else {
        setCaptureRatio(defaultCaptureRatio);
      }
      if (parsed.quality === 'high' || parsed.quality === 'balanced' || parsed.quality === 'low') {
        setCaptureQuality(parsed.quality);
      }
      if (parsed.size === 'full' || parsed.size === 'medium' || parsed.size === 'compact') {
        setCaptureSize(parsed.size);
      }
      if (parsed.facing === 'user' || parsed.facing === 'environment') {
        setCameraFacing(parsed.facing);
      } else {
        setCameraFacing(defaultCameraFacing);
      }
      if (typeof parsed.grid === 'boolean') {
        setIsGridEnabled(parsed.grid);
      }
      if (parsed.timer === 0 || parsed.timer === 3 || parsed.timer === 5 || parsed.timer === 10) {
        setTimerSeconds(parsed.timer);
      }
      if (parsed.filter) {
        setActiveFilter(parsed.filter);
      }
      if (parsed.burst === 1 || parsed.burst === 5 || parsed.burst === 10) {
        setBurstCount(parsed.burst);
      }
    } catch (error) {
      logger.warn('Failed to restore live capture settings from local storage', {
        error,
      });
    }
  }, [CAPTURE_SETTINGS_KEY, defaultCaptureRatio, defaultCameraFacing]);

  // Persist preferences to local storage
  useEffect(() => {
    try {
      window.localStorage.setItem(
        CAPTURE_SETTINGS_KEY,
        JSON.stringify({
          ratio: captureRatio,
          quality: captureQuality,
          size: captureSize,
          facing: cameraFacing,
          grid: isGridEnabled,
          timer: timerSeconds,
          filter: activeFilter,
          burst: burstCount,
        }),
      );
    } catch (error) {
      logger.warn('Failed to persist live capture settings to local storage', {
        error,
      });
    }
  }, [
    CAPTURE_SETTINGS_KEY,
    cameraFacing,
    captureRatio,
    captureQuality,
    captureSize,
    isGridEnabled,
    timerSeconds,
    activeFilter,
    burstCount,
  ]);

  useEffect(() => {
    if (isOpen) {
      setIsInitializing(true);
      startCamera().finally(() => setIsInitializing(false));
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [
    isOpen,
    type,
    cameraFacing,
    captureQuality,
    captureSize,
    captureRatio,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
  ]);

  // Handle visibility change (pause or preserve stream if minimized)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (isRecording && !isPaused && mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.pause();
          setIsPaused(true);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          triggerHaptic('warning');
          toast.info('Recording paused in background');
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isRecording, isPaused]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Dual Camera Manager initialization & lifecycle
  useEffect(() => {
    dualCameraManagerRef.current = createDualCameraManager();
    secondaryVideoRef.current = dualCameraManagerRef.current.secondaryVideo;
    return () => {
      dualCameraManagerRef.current?.stopSecondaryStream();
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !dualCamera.enabled || !dualCameraManagerRef.current) {
      dualCameraManagerRef.current?.stopSecondaryStream();
      return;
    }
    dualCameraManagerRef.current
      .startSecondaryStream(cameraFacing, dualCamera.secondaryDeviceId)
      .then((secStream) => {
        if (!secStream) {
          toast.error('Secondary camera unavailable or access denied');
          setDualCamera((prev) => ({ ...prev, enabled: false }));
        } else {
          toast.success('Dual Camera Link Active (Front + Back)');
        }
      });
  }, [isOpen, dualCamera.enabled, cameraFacing, dualCamera.secondaryDeviceId]);

  // Real-time canvas compositing loop for Dual Camera mode
  useEffect(() => {
    if (!dualCamera.enabled || !videoRef.current || !isOpen) {
      if (compositeRafRef.current) {
        cancelAnimationFrame(compositeRafRef.current);
        compositeRafRef.current = null;
      }
      return;
    }

    if (!compositeCanvasRef.current) {
      compositeCanvasRef.current = document.createElement('canvas');
      compositeCanvasRef.current.width = 1280;
      compositeCanvasRef.current.height = 720;
    }

    const loop = () => {
      if (dualCameraManagerRef.current && videoRef.current && compositeCanvasRef.current) {
        dualCameraManagerRef.current.renderComposite(
          compositeCanvasRef.current,
          videoRef.current,
          dualCamera.layout,
          dualCamera.pipPosition,
          dualCamera.isSwapped,
          cameraFacing,
          (cameraFacing === 'user') !== isHorizontallyFlipped,
          getFilterCss(activeFilter),
        );
      }
      compositeRafRef.current = requestAnimationFrame(loop);
    };

    compositeRafRef.current = requestAnimationFrame(loop);
    return () => {
      if (compositeRafRef.current) {
        cancelAnimationFrame(compositeRafRef.current);
        compositeRafRef.current = null;
      }
    };
  }, [
    isOpen,
    dualCamera.enabled,
    dualCamera.layout,
    dualCamera.pipPosition,
    dualCamera.isSwapped,
    cameraFacing,
    isHorizontallyFlipped,
    activeFilter,
  ]);

  useEffect(() => {
    if (!isOpen) {
      setIsClosing(false);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setCapturedBlob(null);
      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);
      setRecordingSize(0);
      setTimelapseStats(null);
      cancelCountdown();
      stopSpeechRecognition();
      if (filteredVideoRafRef.current) {
        cancelAnimationFrame(filteredVideoRafRef.current);
        filteredVideoRafRef.current = null;
      }
      dualCameraManagerRef.current?.stopSecondaryStream();
    }
  }, [isOpen, previewUrl]);

  useEffect(() => {
    const MAX_DURATION = 5 * 60; // 5 minutes
    if (isRecording && recordingTime >= MAX_DURATION) {
      toast.error('Max duration reached');
      stopRecording();
    }
  }, [recordingTime, isRecording]);

  // Speech-to-Text Recognition Setup with Hindi & English Compatibility
  const startSpeechRecognition = useCallback(
    (lang?: 'en-IN' | 'hi-IN') => {
      const SpeechRecognitionClass =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognitionClass) {
        toast.error('Speech recognition not supported in this browser');
        return;
      }

      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
        speechRecognitionRef.current = null;
      }

      const selectedLang = lang || transcriptLang;

      try {
        const recognition = new SpeechRecognitionClass();
        recognition.continuous = true;
        recognition.interimResults = true;
        // Compatible with Indian English / Hinglish (en-IN) and Hindi (hi-IN)
        recognition.lang = selectedLang;

        recognition.onresult = (event: any) => {
          let finalTrans = '';
          let interimTrans = '';
          for (let i = 0; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) {
              finalTrans += res[0].transcript + ' ';
            } else {
              interimTrans += res[0].transcript;
            }
          }
          const full = (finalTrans + interimTrans).trim();
          if (full) {
            setLiveTranscript(full);
            transcriptRef.current = full;
          }
        };

        recognition.onerror = (event: any) => {
          logger.warn('Speech recognition error:', { error: event.error });
        };

        recognition.start();
        speechRecognitionRef.current = recognition;
        setIsTranscribing(true);
        toast.info(
          selectedLang === 'hi-IN'
            ? 'Live Transcription: हिन्दी Hindi (hi-IN)'
            : 'Live Transcription: English / Hinglish (en-IN)',
        );
      } catch (err) {
        logger.warn('Failed to start speech recognition', { err });
      }
    },
    [transcriptLang],
  );

  const stopSpeechRecognition = useCallback(() => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      speechRecognitionRef.current = null;
    }
    setIsTranscribing(false);
  }, []);

  const toggleTranscription = () => {
    triggerHaptic('light');
    if (!isTranscribing) {
      // 1st click: Start English / Hinglish (en-IN)
      setTranscriptLang('en-IN');
      startSpeechRecognition('en-IN');
    } else if (transcriptLang === 'en-IN') {
      // 2nd click: Switch to Hindi (hi-IN)
      setTranscriptLang('hi-IN');
      startSpeechRecognition('hi-IN');
    } else {
      // 3rd click: Turn off
      stopSpeechRecognition();
      toast.info('Live Transcription: Off');
    }
  };

  const cycleVoicePreset = () => {
    triggerHaptic('light');
    const presets: VoiceClarityPreset[] = ['crystal', 'aggressive', 'warm-interview', 'off'];
    const nextIdx = (presets.indexOf(activeVoicePreset) + 1) % presets.length;
    const nextPreset = presets[nextIdx];
    setActiveVoicePreset(nextPreset);
    if (filteredStreamRef.current) {
      filteredStreamRef.current.setPreset(nextPreset);
    }
    const config = VOICE_CLARITY_PRESETS[nextPreset];
    toast.info(`Voice Clarity DSP: ${config.name}`);
  };

  const setupAudioAnalyser = (mediaStream: MediaStream) => {
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.disconnect();
        } catch {}
        audioSourceRef.current = null;
      }
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch {}
        analyserRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      const audioTrack = mediaStream.getAudioTracks()[0];
      if (!audioTrack) return;

      const audioContext = new AudioContextClass();

      const tryResume = () => {
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume().catch(() => {});
        }
      };

      if (audioContext.state === 'suspended') {
        tryResume();
        const onInteraction = () => {
          tryResume();
          window.removeEventListener('click', onInteraction);
          window.removeEventListener('touchstart', onInteraction);
          window.removeEventListener('keydown', onInteraction);
        };
        window.addEventListener('click', onInteraction, { passive: true });
        window.addEventListener('touchstart', onInteraction, { passive: true });
        window.addEventListener('keydown', onInteraction, { passive: true });
      }

      const source = audioContext.createMediaStreamSource(mediaStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.25;
      source.connect(analyser);

      // Persist references on component refs to avoid V8 garbage collection
      audioSourceRef.current = source;
      analyserRef.current = analyser;
      audioContextRef.current = audioContext;

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(analyser.fftSize);

      const update = () => {
        if (!audioContextRef.current || !analyserRef.current) return;
        if (audioContext.state === 'suspended') {
          tryResume();
        }
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(timeData);

        // Compute peak & RMS amplitude from time domain
        let sumSquares = 0;
        let peak = 0;
        for (let i = 0; i < timeData.length; i++) {
          const val = Math.abs((timeData[i] - 128) / 128);
          sumSquares += val * val;
          if (val > peak) peak = val;
        }
        const rms = Math.sqrt(sumSquares / timeData.length);

        // Voice envelope: nonlinear boost with room noise floor subtraction
        const rawVolume = rms * 3.4 + peak * 1.8;
        const volume = Math.min(1, Math.pow(Math.max(0, rawVolume - 0.015) * 1.25, 0.75));

        // Build 12 dynamic audio level bins
        const levels = new Array(12);
        for (let i = 0; i < 12; i++) {
          const freqVal = (freqData[i] || 0) / 255;
          const harmonicFactor = 0.8 + Math.sin(i * 0.8) * 0.2;
          const combined = Math.min(
            255,
            Math.round(Math.max(freqVal * 255 * 1.2, volume * 255 * harmonicFactor)),
          );
          levels[i] = combined;
        }

        const now = performance.now();
        if (now - lastAudioUpdateRef.current >= 25) {
          setAudioLevels(levels);
          lastAudioUpdateRef.current = now;
        }

        animationFrameRef.current = requestAnimationFrame(update);
      };
      update();
    } catch (err) {
      logger.warn('Failed to initialize audio analyser', { err });
    }
  };

  const startCamera = async () => {
    try {
      setPermissionError(null);
      stopCamera();

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('MediaDevices API not supported');
      }

      const profile = getCaptureProfile(captureQuality, captureSize, captureRatio);
      const scaled = clampDimensions(profile.width * profile.scale, profile.height * profile.scale);

      const buildConstraints = (
        preferredFacing?: 'user' | 'environment',
      ): MediaStreamConstraints => ({
        video:
          type !== 'audio'
            ? {
                ...(selectedVideoDeviceId
                  ? { deviceId: { exact: selectedVideoDeviceId } }
                  : preferredFacing
                    ? { facingMode: { ideal: preferredFacing } }
                    : {}),
                width: { ideal: scaled.width },
                height: { ideal: scaled.height },
                frameRate: { ideal: profile.frameRate },
              }
            : false,
        audio:
          type !== 'photo'
            ? {
                ...(selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : {}),
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : false,
      });

      const alternateFacing = cameraFacing === 'user' ? 'environment' : 'user';
      const constraintsCandidates =
        type === 'audio'
          ? [buildConstraints()]
          : [buildConstraints(cameraFacing), buildConstraints(alternateFacing), buildConstraints()];

      let newStream: MediaStream | null = null;
      let streamError: unknown = null;

      for (let i = 0; i < constraintsCandidates.length; i += 1) {
        try {
          newStream = await navigator.mediaDevices.getUserMedia(constraintsCandidates[i]);
          if (i > 0) {
            logger.warn('Fell back to alternate media constraints', {
              attempt: i + 1,
              type,
              cameraFacing,
            });
          }
          break;
        } catch (error) {
          streamError = error;
          const errorName = (error as DOMException)?.name;
          const shouldRetry =
            type !== 'audio' &&
            (errorName === 'OverconstrainedError' || errorName === 'NotFoundError');
          if (!shouldRetry) {
            break;
          }
        }
      }

      if (!newStream) {
        throw streamError || new Error('Unable to initialize media stream');
      }

      newStream.getTracks().forEach((track) => {
        track.onended = () => {
          if (isOpen && !isRecording && !capturedBlob) {
            toast.error('Media stream ended unexpectedly');
            stopCamera();
          }
        };
      });

      // Detect hardware capabilities (torch, zoom)
      const videoTrack = newStream.getVideoTracks()[0];
      if (videoTrack) {
        const capabilities =
          (videoTrack.getCapabilities && (videoTrack.getCapabilities() as any)) || {};
        if (capabilities.torch) {
          setTorchSupported(true);
          setTorchActive(false);
        } else {
          setTorchSupported(false);
          setTorchActive(false);
        }

        if (capabilities.zoom) {
          setZoomCapabilities({
            min: capabilities.zoom.min || 1,
            max: capabilities.zoom.max || 5,
            step: capabilities.zoom.step || 0.1,
            current: 1,
            supported: true,
          });
        } else {
          setZoomCapabilities({ min: 1, max: 1, step: 0.1, current: 1, supported: false });
        }
      }

      // Initialize real-time audio VU meter for video and audio
      if (type !== 'photo') {
        setupAudioAnalyser(newStream);
      }

      setStream(newStream);
      setIsMuted(false);
      void enumerateDevices();
    } catch (err: any) {
      console.error('Camera initialization error:', err);
      const isPermissionErr =
        err?.name === 'NotAllowedError' ||
        err?.name === 'PermissionDeniedError' ||
        err?.name === 'SecurityError' ||
        String(err?.message || '')
          .toLowerCase()
          .includes('permission') ||
        String(err?.message || '')
          .toLowerCase()
          .includes('dismissed');

      if (isPermissionErr) {
        setPermissionError(
          'Camera or microphone permission was dismissed or blocked. Click site settings icon in address bar to allow access, then click "RETRY PERMISSION".',
        );
        toast.error(
          'Permission dismissed or denied. Please allow camera/mic access in browser settings.',
        );
      } else if (err?.name === 'NotFoundError') {
        setPermissionError('No camera or microphone device found on this system.');
        toast.error('No camera or microphone found.');
      } else {
        setPermissionError(err?.message || 'Failed to initialize media devices.');
        toast.error('Failed to initialize media devices.');
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch {
        /* ignore */
      }
    }
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (error) {
          logger.warn('Failed to stop media track cleanly', {
            kind: track.kind,
            error,
          });
        }
      });
    }
    mediaRecorderRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (filteredVideoRafRef.current) {
      cancelAnimationFrame(filteredVideoRafRef.current);
      filteredVideoRafRef.current = null;
    }
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.disconnect();
      } catch {}
      audioSourceRef.current = null;
    }
    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {}
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch((error) => {
        logger.warn('Failed to close AudioContext while stopping camera', {
          error,
        });
      });
      audioContextRef.current = null;
    }
    setStream(null);
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setRecordingSize(0);
    totalSizeRef.current = 0;
    setAudioLevels(new Array(12).fill(0));
    setTorchActive(false);
    stopSpeechRecognition();
  };

  // Robust stream synchronization
  useEffect(() => {
    if (stream && videoRef.current && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.warn('Video play interrupted:', err);
      });
    }
  }, [stream]);

  // Torch / Flashlight Toggle
  const toggleTorch = async () => {
    const videoTrack = stream?.getVideoTracks()[0];
    if (!videoTrack) return;
    try {
      triggerHaptic('light');
      const nextTorch = !torchActive;
      await (videoTrack as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchActive(nextTorch);
      toast.info(nextTorch ? 'Flashlight ON' : 'Flashlight OFF');
    } catch (err) {
      logger.warn('Failed to toggle torch', { err });
      toast.error('Flashlight not supported on this camera');
    }
  };

  // Hardware Zoom Handler
  const handleZoomChange = async (newZoom: number) => {
    const videoTrack = stream?.getVideoTracks()[0];
    if (!videoTrack || !zoomCapabilities.supported) return;
    const clamped = Math.min(zoomCapabilities.max, Math.max(zoomCapabilities.min, newZoom));
    try {
      await (videoTrack as any).applyConstraints({
        advanced: [{ zoom: clamped }],
      });
      setZoomCapabilities((prev) => ({ ...prev, current: clamped }));
      triggerHaptic('tick');
    } catch (err) {
      logger.warn('Failed to apply zoom constraint', { err });
    }
  };

  // Microphone Mute Toggle (Video mode)
  const toggleMute = () => {
    if (!stream) return;
    triggerHaptic('light');
    const audioTracks = stream.getAudioTracks();
    const nextMute = !isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !nextMute;
    });
    setIsMuted(nextMute);
    toast.info(nextMute ? 'Microphone Muted' : 'Microphone Unmuted');
  };

  // Pause / Resume Recording
  const handleTogglePause = () => {
    triggerHaptic('medium');

    // ⏳ Time-Lapse Pause / Resume
    if (isTimelapseEnabled && timelapseSessionRef.current) {
      if (isPaused) {
        timelapseSessionRef.current.resume();
        setIsPaused(false);
        timerRef.current = setInterval(() => {
          setRecordingTime((t) => t + 1);
        }, 1000);
        toast.info('Time-Lapse resumed');
      } else {
        timelapseSessionRef.current.pause();
        setIsPaused(true);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        toast.info('Time-Lapse paused');
      }
      return;
    }

    if (!mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      toast.info('Recording paused');
    } else if (mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
      toast.info('Recording resumed');
    }
  };

  // QR Code direct Vault Note save handler
  const handleSaveQRToNote = async (result: ScannedBarcodeResult) => {
    if (!masterKey && !useVaultStore.getState().isDecoyMode) {
      toast.error('Unlock vault before saving notes');
      return;
    }
    setIsSavingQRNote(true);
    try {
      await saveBarcodeToEncryptedVaultNote(result, masterKey, addItem);
      triggerHaptic('success');
    } catch (err) {
      logger.warn('Failed to save QR code note', { err });
      toast.error('Failed to create vault note');
      throw err;
    } finally {
      setIsSavingQRNote(false);
    }
  };

  // Capture single frame with applied styling & center cropping
  const captureFrameBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!videoRef.current) return resolve(null);
      const video = videoRef.current;
      const width = video.videoWidth || video.clientWidth;
      const height = video.videoHeight || video.clientHeight;
      const canvas = document.createElement('canvas');
      const profile = getCaptureProfile(captureQuality, captureSize, captureRatio);
      const targetRatio =
        captureRatio === '1:1'
          ? 1
          : captureRatio === '4:5'
            ? 4 / 5
            : captureRatio === '3:4'
              ? 3 / 4
              : captureRatio === '4:3'
                ? 4 / 3
                : captureRatio === '2:3'
                  ? 2 / 3
                  : captureRatio === '3:2'
                    ? 3 / 2
                    : captureRatio === '9:16'
                      ? 9 / 16
                      : captureRatio === '21:9'
                        ? 21 / 9
                        : 16 / 9;

      const sourceRatio = width / height;
      let sourceCropWidth = width;
      let sourceCropHeight = height;
      let sourceCropX = 0;
      let sourceCropY = 0;

      if (sourceRatio > targetRatio) {
        sourceCropWidth = height * targetRatio;
        sourceCropX = (width - sourceCropWidth) / 2;
      } else if (sourceRatio < targetRatio) {
        sourceCropHeight = width / targetRatio;
        sourceCropY = (height - sourceCropHeight) / 2;
      }

      const scaled = clampDimensions(
        sourceCropWidth * profile.scale,
        sourceCropHeight * profile.scale,
      );
      canvas.width = scaled.width;
      canvas.height = scaled.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);

      // Apply Live CSS Filter to Canvas capture
      ctx.filter = getFilterCss(activeFilter);

      if ((cameraFacing === 'user') !== isHorizontallyFlipped) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(
        video,
        sourceCropX,
        sourceCropY,
        sourceCropWidth,
        sourceCropHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', profile.photoJpegQuality);
    });
  };

  // In-Video Snapshot (take still photo while actively recording video)
  const takeInVideoSnapshot = async () => {
    triggerHaptic('shutter');
    const blob = await captureFrameBlob();
    if (!blob) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `snapshot_${timestamp}.jpg`;
    try {
      const { blob: encryptedBlobData, wasEncrypted } = await encryptBlob(blob);
      const file = new File([encryptedBlobData], filename, {
        type: wasEncrypted ? 'application/octet-stream' : blob.type,
      });
      await onCapture(file, wasEncrypted);
      triggerHaptic('success');
      toast.success('Snapshot saved to Vault during recording!');
    } catch {
      toast.error('Failed to save snapshot');
    }
  };

  // Photo Capture (Single, Dual Camera, or Burst)
  const takePhoto = async () => {
    triggerHaptic('shutter');

    // 🤳 Dual Camera Photo Snapshot
    if (dualCamera.enabled && dualCameraManagerRef.current && videoRef.current) {
      const blob = await dualCameraManagerRef.current.takeDualSnapshot(
        videoRef.current,
        dualCamera.layout,
        dualCamera.pipPosition,
        dualCamera.isSwapped,
        cameraFacing,
        (cameraFacing === 'user') !== isHorizontallyFlipped,
        getFilterCss(activeFilter),
      );
      if (blob) {
        setCapturedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        stopCamera();
      }
      return;
    }

    if (burstCount === 1) {
      const blob = await captureFrameBlob();
      if (blob) {
        setCapturedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        stopCamera();
      }
      return;
    }

    // Burst Photography Mode (5 or 10 frames)
    toast.info(`Shooting ${burstCount} burst photos...`);
    const capturedBursts: Blob[] = [];

    for (let i = 0; i < burstCount; i++) {
      triggerHaptic('tick');
      const blob = await captureFrameBlob();
      if (blob) capturedBursts.push(blob);
      await new Promise((r) => setTimeout(r, 120));
    }

    if (capturedBursts.length > 0) {
      triggerHaptic('success');
      const primaryBlob = capturedBursts[0];
      setCapturedBlob(primaryBlob);
      setPreviewUrl(URL.createObjectURL(primaryBlob));
      toast.success(`${capturedBursts.length} burst photos captured!`);
      stopCamera();
    }
  };

  const startRecording = () => {
    if (!stream && !dualCamera.enabled) return;
    triggerHaptic('medium');

    // ⏳ Time-Lapse & Fast-Motion Mode
    if (isTimelapseEnabled && videoRef.current) {
      const mimeType = getSupportedMimeType('video');
      const session = startTimelapseSession({
        videoElement: videoRef.current,
        intervalSec: timelapseInterval,
        mimeType,
        isHorizontallyFlipped: (cameraFacing === 'user') !== isHorizontallyFlipped,
        filterCss: getFilterCss(activeFilter),
        onStatsUpdate: (stats) => setTimelapseStats(stats),
        onFrameTick: () => triggerHaptic('tick'),
        customDrawSource:
          dualCamera.enabled && compositeCanvasRef.current
            ? () => compositeCanvasRef.current
            : undefined,
      });

      timelapseSessionRef.current = session;
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      setRecordingSize(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
      return;
    }

    // Standard Video, Filtered Video, or Composited Dual Camera Video
    let recordStream = stream;
    if (dualCamera.enabled && compositeCanvasRef.current) {
      const canvasStream = (compositeCanvasRef.current as any).captureStream(30);
      if (stream) {
        const audioTracks = stream.getAudioTracks();
        audioTracks.forEach((t) => canvasStream.addTrack(t));
      }
      recordStream = canvasStream;
    } else if (
      type === 'video' &&
      videoRef.current &&
      (activeFilter !== 'none' || (cameraFacing === 'user') !== isHorizontallyFlipped)
    ) {
      // Pipeline video through filtered canvas to bake filter & transforms directly into recording
      const videoEl = videoRef.current;
      const targetWidth = videoEl.videoWidth || 1280;
      const targetHeight = videoEl.videoHeight || 720;

      if (!filteredVideoCanvasRef.current) {
        filteredVideoCanvasRef.current = document.createElement('canvas');
      }
      const canvas = filteredVideoCanvasRef.current;
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d', { alpha: false });

      if (ctx && typeof (canvas as any).captureStream === 'function') {
        const isFlippedVideo = (cameraFacing === 'user') !== isHorizontallyFlipped;
        const filterCss = getFilterCss(activeFilter);

        const renderFilteredLoop = () => {
          if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
            filteredVideoRafRef.current = requestAnimationFrame(renderFilteredLoop);
            return;
          }

          ctx.save();
          ctx.filter = filterCss;
          if (isFlippedVideo) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          } else {
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          }
          ctx.restore();

          filteredVideoRafRef.current = requestAnimationFrame(renderFilteredLoop);
        };

        renderFilteredLoop();

        const canvasStream = (canvas as any).captureStream(30);
        if (stream) {
          stream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
        }
        recordStream = canvasStream;
      }
    }

    if (!recordStream) return;

    // Apply Voice Clarity & Noise Gate DSP filter to audio tracks
    if (activeVoicePreset !== 'off' && recordStream.getAudioTracks().length > 0) {
      const filtered = createFilteredMediaStream(recordStream, activeVoicePreset);
      if (filtered) {
        recordStream = filtered.filteredStream;
        filteredStreamRef.current = filtered;
      }
    }

    const mimeType = getSupportedMimeType(type);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : undefined);
    } catch {
      recorder = new MediaRecorder(recordStream);
    }
    chunksRef.current = [];
    mediaRecorderRef.current = recorder;
    lastSizeUpdateRef.current = 0;

    const acquireWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        }
      } catch (error) {
        logger.warn('Failed to acquire wake lock', { error });
      }
    };
    acquireWakeLock();

    if (stream) {
      setupAudioAnalyser(stream);
    }

    // Speech-to-text transcript capture (default OFF unless user enabled)
    transcriptRef.current = '';
    setLiveTranscript('');
    if (isTranscribing) {
      startSpeechRecognition(transcriptLang);
    }

    recorder.ondataavailable = (e) => {
      if (e.data?.size > 0) {
        chunksRef.current.push(e.data);
        totalSizeRef.current += e.data.size;
        const maxBytes = MAX_RECORDING_SIZE_MB * 1024 * 1024;
        if (totalSizeRef.current > maxBytes) {
          toast.error('Max recording size reached');
          stopRecording();
          return;
        }
        const now = Date.now();
        if (now - lastSizeUpdateRef.current > 500) {
          setRecordingSize(totalSizeRef.current);
          lastSizeUpdateRef.current = now;
        }
      }
    };

    recorder.onstop = () => {
      if (!chunksRef.current.length) {
        toast.error('Recording failed. No media data was captured.');
        setRecordingSize(0);
        totalSizeRef.current = 0;
        return;
      }
      const outputMimeType =
        recorder.mimeType || mimeType || (type === 'video' ? 'video/webm' : 'audio/webm');
      const blob = new Blob(chunksRef.current, {
        type: outputMimeType,
      });
      const url = URL.createObjectURL(blob);
      setCapturedBlob(blob);
      setPreviewUrl(url);
      stopCamera();
    };

    try {
      recorder.start(500);
    } catch {
      recorder.start();
    }
    setIsRecording(true);
    setIsPaused(false);
    totalSizeRef.current = 0;
    lastSizeUpdateRef.current = 0;
    timerRef.current = setInterval(() => {
      setRecordingTime((t) => t + 1);
    }, 1000);
  };

  const stopRecording = async () => {
    if (!isRecording) return;
    triggerHaptic('heavy');

    // ⏳ Time-Lapse Stop
    if (isTimelapseEnabled && timelapseSessionRef.current) {
      try {
        const blob = await timelapseSessionRef.current.stop();
        timelapseSessionRef.current = null;
        setCapturedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        stopCamera();
      } catch (err) {
        logger.warn('Failed to stop timelapse session', { err });
        toast.error('Failed to finalize Time-Lapse video');
      }
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        } catch (error) {
          logger.warn('Failed to release wake lock', { error });
        }
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (filteredVideoRafRef.current) {
        cancelAnimationFrame(filteredVideoRafRef.current);
        filteredVideoRafRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch((error) => {
          logger.warn('Failed to close AudioContext while stopping recording', {
            error,
          });
        });
        audioContextRef.current = null;
      }
      if (filteredStreamRef.current) {
        filteredStreamRef.current.close();
        filteredStreamRef.current = null;
      }
      setAudioLevels(new Array(12).fill(0));
      stopSpeechRecognition();
    }
  };

  // Self-Timer Countdown Trigger
  const triggerWithTimer = (action: 'photo' | 'video') => {
    triggerHaptic('light');
    if (timerSeconds === 0) {
      if (action === 'photo') void takePhoto();
      else startRecording();
      return;
    }

    setIsCountingDown(true);
    setCountdownRemaining(timerSeconds);
    playBeep(880, 0.12);

    let remaining = timerSeconds;
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdownRemaining(remaining);
        playBeep(880, 0.12);
        triggerHaptic('tick');
      } else {
        clearInterval(interval);
        countdownTimerRef.current = null;
        setIsCountingDown(false);
        setCountdownRemaining(0);
        playBeep(1760, 0.25);
        if (action === 'photo') void takePhoto();
        else startRecording();
      }
    }, 1000);

    countdownTimerRef.current = interval;
  };

  const cancelCountdown = () => {
    triggerHaptic('light');
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setIsCountingDown(false);
    setCountdownRemaining(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const encryptBlob = async (
    blob: Blob,
  ): Promise<{
    blob: Blob;
    wasEncrypted: boolean;
  }> => {
    if (!rsaKeyPair) {
      return { blob, wasEncrypted: false };
    }

    try {
      setIsEncrypting(true);
      const encryptedBundle = await encryptFileE2EE(blob, rsaKeyPair.publicKey);
      return {
        blob: new Blob([encryptedBundle.buffer as ArrayBuffer], {
          type: 'application/octet-stream',
        }),
        wasEncrypted: true,
      };
    } catch (e) {
      console.error('E2EE Encryption failed:', e);
      toast.error('Secure encryption failed, saving with vault encryption instead');
      return { blob, wasEncrypted: false };
    } finally {
      setIsEncrypting(false);
    }
  };

  const handleSave = async () => {
    if (!capturedBlob) return;
    triggerHaptic('medium');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let filename = '';
    if (type === 'photo') {
      filename = `photo_${timestamp}.jpg`;
    } else {
      const ext =
        capturedBlob.type.split('/')[1]?.split(';')[0] || (type === 'video' ? 'mp4' : 'webm');
      const finalExt = ext === 'quicktime' ? 'mov' : ext;
      filename = `${type}_${timestamp}.${finalExt}`;
    }
    setIsSaving(true);
    try {
      const safeFilename = filename.replace(/[^a-z0-9._-]/gi, '');
      const { blob: encryptedBlobData, wasEncrypted } = await encryptBlob(capturedBlob);
      const file = new File([encryptedBlobData], safeFilename, {
        type: wasEncrypted ? 'application/octet-stream' : capturedBlob.type,
      });

      const additionalMetadata: Record<string, any> = {};
      const transcriptText = (transcriptRef.current || liveTranscript || '').trim();
      if (transcriptText) {
        additionalMetadata.transcript = transcriptText;
        additionalMetadata.hasTranscript = true;
      }
      if (type !== 'photo') {
        additionalMetadata.voiceClarityPreset = activeVoicePreset;
        additionalMetadata.hasVoiceClarity = activeVoicePreset !== 'off';
      }

      await onCapture(file, wasEncrypted, additionalMetadata);
      setIsSuccess(true);
      triggerHaptic('success');
      toast.success('Securely saved to vault');
      setTimeout(() => {
        onClose();
        setIsSaving(false);
        setIsSuccess(false);
      }, 1500);
    } catch (error) {
      console.error('Failed to save to cloud:', error);
      toast.error('Cloud synchronization failed');
      setIsSaving(false);
    }
  };

  const toggleCamera = () => {
    if (type === 'video' && isRecording) {
      return;
    }
    triggerHaptic('light');
    setCameraFacing((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const handleClose = () => {
    if (isClosing) return;
    triggerHaptic('light');
    setIsClosing(true);
    onClose();
  };

  // Keyboard Shortcuts for Desktop
  useEffect(() => {
    if (!isOpen || capturedBlob) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        isDeviceSelectorOpen ||
        isShortcutsOpen ||
        isFilterPickerOpen
      ) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (type === 'photo') {
          triggerWithTimer('photo');
        } else if (type === 'video') {
          if (isRecording) stopRecording();
          else triggerWithTimer('video');
        }
      } else if (e.key === 'p' || e.key === 'P') {
        if (type === 'video' && isRecording) {
          e.preventDefault();
          handleTogglePause();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        if (type !== 'audio') {
          e.preventDefault();
          triggerHaptic('light');
          setIsHorizontallyFlipped((prev) => !prev);
        }
      } else if (e.key === 'c' || e.key === 'C') {
        if (type !== 'audio' && !isRecording) {
          e.preventDefault();
          toggleCamera();
        }
      } else if (e.key === 'm' || e.key === 'M') {
        if (type === 'video') {
          e.preventDefault();
          toggleMute();
        }
      } else if (e.key === 'g' || e.key === 'G') {
        if (type !== 'audio') {
          e.preventDefault();
          triggerHaptic('light');
          setIsGridEnabled((prev) => {
            const next = !prev;
            toast.info(next ? '3x3 Grid Enabled' : '3x3 Grid Disabled');
            return next;
          });
        }
      } else if (e.key === 't' || e.key === 'T') {
        if (type !== 'audio' && !isRecording) {
          e.preventDefault();
          triggerHaptic('light');
          setTimerSeconds((prev) => {
            const next: TimerOption = prev === 0 ? 3 : prev === 3 ? 5 : prev === 5 ? 10 : 0;
            toast.info(`Timer: ${next > 0 ? `${next}s` : 'Off'}`);
            return next;
          });
        }
      } else if (e.key === 'l' || e.key === 'L') {
        if (type === 'video' && !isRecording) {
          e.preventDefault();
          triggerHaptic('light');
          if (!isTimelapseEnabled) {
            setIsTimelapseEnabled(true);
            setTimelapseInterval(1);
            toast.info('Time-Lapse: 1s interval (30x)');
          } else if (timelapseInterval === 1) {
            setTimelapseInterval(2);
            toast.info('Time-Lapse: 2s interval (60x)');
          } else if (timelapseInterval === 2) {
            setTimelapseInterval(5);
            toast.info('Time-Lapse: 5s interval (150x)');
          } else {
            setIsTimelapseEnabled(false);
            toast.info('Time-Lapse disabled');
          }
        }
      } else if (e.key === 'd' || e.key === 'D') {
        if (type !== 'audio' && !isRecording) {
          e.preventDefault();
          triggerHaptic('light');
          setDualCamera((prev) => {
            const next = !prev.enabled;
            toast.info(next ? 'Dual Camera Enabled (PiP)' : 'Dual Camera Disabled');
            return { ...prev, enabled: next };
          });
        }
      } else if (e.key === 'h' || e.key === 'H') {
        if (type !== 'audio') {
          e.preventDefault();
          triggerHaptic('light');
          setIsGyroLevelerEnabled((prev) => {
            const next = !prev;
            toast.info(next ? 'Horizon Leveler Enabled' : 'Horizon Leveler Disabled');
            return next;
          });
        }
      } else if (e.key === 'q' || e.key === 'Q') {
        if (type !== 'audio') {
          e.preventDefault();
          triggerHaptic('light');
          setIsQRScannerEnabled((prev) => {
            const next = !prev;
            toast.info(next ? 'QR Scanner Enabled' : 'QR Scanner Disabled');
            return next;
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    capturedBlob,
    isRecording,
    type,
    isDeviceSelectorOpen,
    isShortcutsOpen,
    isFilterPickerOpen,
    isPaused,
    timerSeconds,
    isTimelapseEnabled,
    timelapseInterval,
  ]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            'fixed inset-0 z-[200] flex bg-black',
            isMobileViewport
              ? 'items-stretch justify-stretch p-0'
              : 'items-center justify-center p-4 sm:p-6 lg:p-8',
          )}
        >
          <div
            className={cn(
              'relative flex h-full w-full flex-col overflow-hidden border-white/10 bg-black shadow-3xl',
              isMobileViewport
                ? 'max-w-none border-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
                : 'max-w-5xl md:h-[720px] md:max-h-[90vh] md:border',
              !capturedBlob && !isMobileViewport && 'md:rounded-[32px]',
            )}
          >
            {/* Top Navigation / Quick Action Bar */}
            <Header
              type={type}
              isRecording={isRecording}
              capturedBlob={capturedBlob}
              isClosing={isClosing}
              onClose={handleClose}
              torchSupported={torchSupported}
              torchActive={torchActive}
              onToggleTorch={toggleTorch}
              timerSeconds={timerSeconds}
              onCycleTimer={() =>
                setTimerSeconds((prev) => {
                  triggerHaptic('light');
                  const next: TimerOption = prev === 0 ? 3 : prev === 3 ? 5 : prev === 5 ? 10 : 0;
                  toast.info(`Timer: ${next > 0 ? `${next}s` : 'Off'}`);
                  return next;
                })
              }
              isGridEnabled={isGridEnabled}
              onToggleGrid={() =>
                setIsGridEnabled((prev) => {
                  triggerHaptic('light');
                  const next = !prev;
                  toast.info(next ? '3x3 Grid Enabled' : '3x3 Grid Disabled');
                  return next;
                })
              }
              isMuted={isMuted}
              onToggleMute={toggleMute}
              onOpenDeviceSelector={() => {
                triggerHaptic('light');
                setIsDeviceSelectorOpen(true);
              }}
              onOpenShortcuts={() => {
                triggerHaptic('light');
                setIsShortcutsOpen(true);
              }}
              isInfoEnabled={isInfoEnabled}
              onToggleInfo={() => {
                triggerHaptic('light');
                updatePreferences({
                  isLiveCaptureInfoEnabled: !isInfoEnabled,
                });
              }}
              hasMultipleDevices={videoDevices.length > 1 || audioDevices.length > 1}
              activeFilter={activeFilter}
              onOpenFilterPicker={() => {
                triggerHaptic('light');
                setIsFilterPickerOpen(true);
              }}
              burstCount={burstCount}
              onCycleBurst={() => {
                triggerHaptic('light');
                setBurstCount((prev) => {
                  const next: BurstOption = prev === 1 ? 5 : prev === 5 ? 10 : 1;
                  toast.info(`Burst Shoot: ${next} photos`);
                  return next;
                });
              }}
              isTranscribing={isTranscribing}
              transcriptLang={transcriptLang}
              onToggleTranscribe={toggleTranscription}
              voiceClarityPreset={activeVoicePreset}
              onCycleVoiceClarity={cycleVoicePreset}
              isTimelapseEnabled={isTimelapseEnabled}
              timelapseInterval={timelapseInterval}
              onToggleTimelapse={() => {
                triggerHaptic('light');
                if (!isTimelapseEnabled) {
                  setIsTimelapseEnabled(true);
                  setTimelapseInterval(1);
                  toast.info('Time-Lapse: 1s interval (30x speed)');
                } else if (timelapseInterval === 1) {
                  setTimelapseInterval(2);
                  toast.info('Time-Lapse: 2s interval (60x speed)');
                } else if (timelapseInterval === 2) {
                  setTimelapseInterval(5);
                  toast.info('Time-Lapse: 5s interval (150x speed)');
                } else {
                  setIsTimelapseEnabled(false);
                  toast.info('Time-Lapse disabled');
                }
              }}
              isDualCameraEnabled={dualCamera.enabled}
              onToggleDualCamera={() => {
                triggerHaptic('light');
                setDualCamera((prev) => {
                  const next = !prev.enabled;
                  toast.info(next ? 'Dual Camera Enabled (PiP)' : 'Dual Camera Disabled');
                  return { ...prev, enabled: next };
                });
              }}
              isGyroLevelerEnabled={isGyroLevelerEnabled}
              onToggleGyroLeveler={() => {
                triggerHaptic('light');
                setIsGyroLevelerEnabled((prev) => {
                  const next = !prev;
                  toast.info(next ? 'Horizon Leveler Enabled' : 'Horizon Leveler Disabled');
                  return next;
                });
              }}
              isQRScannerEnabled={isQRScannerEnabled}
              onToggleQRScanner={() => {
                triggerHaptic('light');
                setIsQRScannerEnabled((prev) => {
                  const next = !prev;
                  toast.info(next ? 'QR / Barcode Scanner Active' : 'QR Scanner Disabled');
                  return next;
                });
              }}
            />

            {/* Viewport / Video Preview / Audio Waveform */}
            <div className="relative flex-1 min-h-0 bg-black overflow-hidden group/container">
              <div className="absolute inset-0 pointer-events-none z-10 shadow-[inner_0_0_100px_rgba(0,0,0,0.8)]" />

              {isInfoEnabled && (
                <InfoOverlays rsaKeyPair={rsaKeyPair} isEncrypting={isEncrypting} />
              )}

              {capturedBlob ? (
                <PreviewContent
                  type={type}
                  previewUrl={previewUrl!}
                  capturedBlob={capturedBlob}
                  onUpdateBlob={(blob, url) => {
                    setCapturedBlob(blob);
                    setPreviewUrl(url);
                    triggerHaptic('success');
                    toast.success('Edits applied');
                  }}
                />
              ) : (
                <>
                  {type !== 'audio' ? (
                    <CameraFeed
                      videoRef={videoRef}
                      isInitializing={isInitializing}
                      permissionError={permissionError}
                      onRetryPermission={() => {
                        setPermissionError(null);
                        setIsInitializing(true);
                        startCamera().finally(() => setIsInitializing(false));
                      }}
                      cameraFacing={cameraFacing}
                      isHorizontallyFlipped={isHorizontallyFlipped}
                      captureRatio={captureRatio}
                      type={type}
                      onFileSelect={(file) => {
                        setCapturedBlob(file);
                        setPreviewUrl(URL.createObjectURL(file));
                      }}
                      isGridEnabled={isGridEnabled}
                      isCountingDown={isCountingDown}
                      countdownRemaining={countdownRemaining}
                      onCancelCountdown={cancelCountdown}
                      zoomCapabilities={zoomCapabilities}
                      onZoomChange={handleZoomChange}
                      audioLevels={audioLevels}
                      isMuted={isMuted}
                      onToggleMute={toggleMute}
                      activeFilter={activeFilter}
                      liveTranscript={liveTranscript}
                      isTranscribing={isTranscribing}
                      transcriptLang={transcriptLang}
                      isGyroLevelerEnabled={isGyroLevelerEnabled}
                      isQRScannerEnabled={isQRScannerEnabled}
                      onSaveQRToNote={handleSaveQRToNote}
                      isSavingQRNote={isSavingQRNote}
                      dualCamera={dualCamera}
                      secondaryVideoRef={secondaryVideoRef}
                      onToggleDualLayout={() => {
                        triggerHaptic('light');
                        setDualCamera((prev) => {
                          const nextLayout: DualCameraLayout =
                            prev.layout === 'pip'
                              ? 'split-horizontal'
                              : prev.layout === 'split-horizontal'
                                ? 'split-vertical'
                                : 'pip';
                          toast.info(`Dual Layout: ${nextLayout}`);
                          return { ...prev, layout: nextLayout };
                        });
                      }}
                      onCyclePipPosition={() => {
                        triggerHaptic('light');
                        setDualCamera((prev) => {
                          const positions: PipPosition[] = [
                            'top-right',
                            'bottom-right',
                            'bottom-left',
                            'top-left',
                          ];
                          const nextPos =
                            positions[(positions.indexOf(prev.pipPosition) + 1) % positions.length];
                          return { ...prev, pipPosition: nextPos };
                        });
                      }}
                      onSwapDualCameras={() => {
                        triggerHaptic('medium');
                        setDualCamera((prev) => ({ ...prev, isSwapped: !prev.isSwapped }));
                        toast.info('Swapped Main & Secondary Cameras');
                      }}
                    />
                  ) : (
                    <AudioRecording
                      isRecording={isRecording}
                      recordingTime={recordingTime}
                      audioLevels={audioLevels}
                      onStart={startRecording}
                      onStop={stopRecording}
                      recordingSize={recordingSize}
                      isWaveformEnabled={preferences.isAudioWaveformEnabled}
                      voiceClarityPreset={activeVoicePreset}
                      liveTranscript={liveTranscript}
                      isTranscribing={isTranscribing}
                      transcriptLang={transcriptLang}
                    />
                  )}

                  {/* Recording HUD status with pause indicator */}
                  {isRecording && type !== 'audio' && (
                    <RecordingStatus
                      recordingTime={recordingTime}
                      recordingSize={recordingSize}
                      formatTime={formatTime}
                      formatSize={formatSize}
                      isPaused={isPaused}
                      audioLevels={audioLevels}
                      isTimelapse={isTimelapseEnabled}
                      timelapseStats={timelapseStats || undefined}
                    />
                  )}
                </>
              )}
            </div>

            {/* Bottom Actions Controls */}
            <Actions
              type={type}
              capturedBlob={capturedBlob}
              isSaving={isSaving}
              isSuccess={isSuccess}
              isEncrypting={isEncrypting}
              isRecording={isRecording}
              isPaused={isPaused}
              isInfoEnabled={isInfoEnabled}
              captureRatio={captureRatio}
              captureQuality={captureQuality}
              captureSize={captureSize}
              burstCount={burstCount}
              isTimelapse={isTimelapseEnabled}
              onRetake={() => {
                triggerHaptic('light');
                if (previewUrl) {
                  URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }
                setCapturedBlob(null);
                startCamera();
              }}
              onSave={handleSave}
              onTakePhoto={() => triggerWithTimer('photo')}
              onStartRecording={() => triggerWithTimer('video')}
              onStopRecording={stopRecording}
              onTogglePause={handleTogglePause}
              onTakeSnapshot={takeInVideoSnapshot}
              onToggleInfo={() => {
                triggerHaptic('light');
                updatePreferences({
                  isLiveCaptureInfoEnabled: !isInfoEnabled,
                });
              }}
              onToggleCamera={toggleCamera}
              onToggleHorizontalFlip={() => {
                triggerHaptic('light');
                setIsHorizontallyFlipped((prev) => !prev);
              }}
              cameraFacing={cameraFacing}
              isHorizontallyFlipped={isHorizontallyFlipped}
              onCycleCaptureRatio={() =>
                setCaptureRatio((prev) => {
                  triggerHaptic('light');
                  const currentIndex = CAPTURE_RATIOS.indexOf(prev);
                  const next = CAPTURE_RATIOS[(currentIndex + 1) % CAPTURE_RATIOS.length];
                  toast.info(`Aspect ratio: ${next}`);
                  return next;
                })
              }
              onCycleCaptureQuality={() =>
                setCaptureQuality((prev) => {
                  triggerHaptic('light');
                  const next: CaptureQuality =
                    prev === 'high' ? 'balanced' : prev === 'balanced' ? 'low' : 'high';
                  toast.info(
                    `Quality: ${next === 'high' ? 'High' : next === 'balanced' ? 'Balanced' : 'Low'}`,
                  );
                  return next;
                })
              }
              onCycleCaptureSize={() =>
                setCaptureSize((prev) => {
                  triggerHaptic('light');
                  const next: CaptureSize =
                    prev === 'full' ? 'medium' : prev === 'medium' ? 'compact' : 'full';
                  toast.info(
                    `Size: ${next === 'full' ? 'Full' : next === 'medium' ? 'Medium' : 'Compact'}`,
                  );
                  return next;
                })
              }
            />

            {/* Live Filter Picker Modal */}
            <FilterPickerModal
              isOpen={isFilterPickerOpen}
              onClose={() => setIsFilterPickerOpen(false)}
              selectedFilter={activeFilter}
              onSelectFilter={(f) => {
                triggerHaptic('light');
                setActiveFilter(f);
                setIsFilterPickerOpen(false);
                toast.info(`Filter applied: ${f}`);
              }}
            />

            {/* Hardware Device Selector Modal */}
            <DeviceSelectorModal
              isOpen={isDeviceSelectorOpen}
              onClose={() => setIsDeviceSelectorOpen(false)}
              videoDevices={videoDevices}
              audioDevices={audioDevices}
              selectedVideoDeviceId={selectedVideoDeviceId}
              selectedAudioDeviceId={selectedAudioDeviceId}
              onSelectVideoDevice={(devId) => {
                setSelectedVideoDeviceId(devId);
                setIsDeviceSelectorOpen(false);
                triggerHaptic('success');
                toast.success('Camera updated');
              }}
              onSelectAudioDevice={(devId) => {
                setSelectedAudioDeviceId(devId);
                setIsDeviceSelectorOpen(false);
                triggerHaptic('success');
                toast.success('Microphone updated');
              }}
              type={type}
            />

            {/* Desktop Keyboard Shortcuts Cheatsheet Modal */}
            <ShortcutsModal
              isOpen={isShortcutsOpen}
              onClose={() => setIsShortcutsOpen(false)}
              type={type}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
