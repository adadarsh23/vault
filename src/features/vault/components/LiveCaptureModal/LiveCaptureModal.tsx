import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useVaultStore } from '../../../../store/vaultStore';
import { encryptFileE2EE } from '../../../../lib/encryption';
import { cn } from '../../../../lib/utils';
import { logger } from '../../../../lib/logger';
import { CaptureType, getSupportedMimeType } from './types';
import { Header } from './Header';
import { InfoOverlays } from './InfoOverlays';
import { PreviewContent } from './PreviewContent';
import { CameraFeed } from './CameraFeed';
import { AudioRecording } from './AudioRecording';
import { RecordingStatus } from './RecordingStatus';
import { Actions } from './Actions';
import { useMediaQuery } from '../../../../hooks/use-media-query';

interface LiveCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File, isEncrypted: boolean) => void;
  type: CaptureType;
}

type CaptureRatio = '1:1' | '4:5' | '3:4' | '4:3' | '2:3' | '3:2' | '9:16' | '16:9' | '21:9';
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
  const { preferences, updatePreferences, rsaKeyPair } = useVaultStore();
  const isInfoEnabled = preferences.isLiveCaptureInfoEnabled;

  const [isRecording, setIsRecording] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>(
    () => defaultCameraFacing
  );
  const [captureRatio, setCaptureRatio] = useState<CaptureRatio>(() => defaultCaptureRatio);
  const [captureQuality, setCaptureQuality] = useState<'high' | 'balanced' | 'low'>('high');
  const [captureSize, setCaptureSize] = useState<'full' | 'medium' | 'compact'>('full');
  const [isSaving, setIsSaving] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isHorizontallyFlipped, setIsHorizontallyFlipped] = useState(false);
  const [recordingSize, setRecordingSize] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(12).fill(0));
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  const isIOS =
    typeof window !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const MAX_RECORDING_SIZE_MB = preferences.maxRecordingSizeMB || (isIOS ? 150 : 500);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastSizeUpdateRef = useRef<number>(0);
  const wakeLockRef = useRef<any>(null);
  const totalSizeRef = useRef<number>(0);
  const CAPTURE_SETTINGS_KEY = isMobileViewport
    ? 'vault.liveCapture.settings.mobile.v2'
    : 'vault.liveCapture.settings.desktop.v2';

  const getCaptureProfile = (
    quality: 'high' | 'balanced' | 'low',
    size: 'full' | 'medium' | 'compact',
    ratio: CaptureRatio
  ) => {
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

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

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
        quality: 'high' | 'balanced' | 'low';
        size: 'full' | 'medium' | 'compact';
        facing: 'user' | 'environment';
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
    } catch (error) {
      logger.warn('Failed to restore live capture settings from local storage', {
        error,
      });
    }
  }, [CAPTURE_SETTINGS_KEY, defaultCaptureRatio, defaultCameraFacing]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        CAPTURE_SETTINGS_KEY,
        JSON.stringify({
          ratio: captureRatio,
          quality: captureQuality,
          size: captureSize,
          facing: cameraFacing,
        })
      );
    } catch (error) {
      logger.warn('Failed to persist live capture settings to local storage', {
        error,
      });
    }
  }, [CAPTURE_SETTINGS_KEY, cameraFacing, captureRatio, captureQuality, captureSize]);

  useEffect(() => {
    if (isOpen) {
      setIsInitializing(true);
      startCamera().finally(() => setIsInitializing(false));
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, type, cameraFacing, captureQuality, captureSize, captureRatio]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (isRecording) stopRecording();
        stopCamera();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [stream, isRecording]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!isOpen) {
      setIsClosing(false);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setCapturedBlob(null);
      setIsRecording(false);
      setRecordingTime(0);
      setRecordingSize(0);
    }
  }, [isOpen, previewUrl]);

  useEffect(() => {
    const MAX_DURATION = 5 * 60; // 5 minutes
    if (isRecording && recordingTime >= MAX_DURATION) {
      toast.error('Max duration reached');
      stopRecording();
    }
  }, [recordingTime, isRecording]);

  const startCamera = async () => {
    try {
      stopCamera();

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('MediaDevices API not supported');
      }

      const profile = getCaptureProfile(captureQuality, captureSize, captureRatio);
      const scaled = clampDimensions(profile.width * profile.scale, profile.height * profile.scale);

      const buildConstraints = (
        preferredFacing?: 'user' | 'environment'
      ): MediaStreamConstraints => ({
        video:
          type !== 'audio'
            ? {
                ...(preferredFacing ? { facingMode: { ideal: preferredFacing } } : {}),
                width: { ideal: scaled.width },
                height: { ideal: scaled.height },
                frameRate: { ideal: profile.frameRate },
              }
            : false,
        audio:
          type !== 'photo'
            ? {
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

      setStream(newStream);
    } catch (err: any) {
      console.error(err);
      if (err.name === 'NotAllowedError') {
        toast.error('Permission denied. Please allow camera/mic access.');
      } else if (err.name === 'NotFoundError') {
        toast.error('No camera or microphone found.');
      } else {
        toast.error('Failed to initialize media devices.');
      }
      onClose();
    }
  };

  const stopCamera = () => {
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
    setRecordingTime(0);
    setRecordingSize(0);
    totalSizeRef.current = 0;
    setAudioLevels(new Array(12).fill(0));
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

  const takePhoto = () => {
    if (!videoRef.current) return;
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

    // Center-crop source frame to requested ratio so saved photo matches UI ratio.
    if (sourceRatio > targetRatio) {
      sourceCropWidth = height * targetRatio;
      sourceCropX = (width - sourceCropWidth) / 2;
    } else if (sourceRatio < targetRatio) {
      sourceCropHeight = width / targetRatio;
      sourceCropY = (height - sourceCropHeight) / 2;
    }

    const scaled = clampDimensions(
      sourceCropWidth * profile.scale,
      sourceCropHeight * profile.scale
    );
    canvas.width = scaled.width;
    canvas.height = scaled.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
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
        canvas.height
      );
      canvas.toBlob(
        (blob) => {
          if (blob) {
            setCapturedBlob(blob);
            setPreviewUrl(URL.createObjectURL(blob));
            stopCamera();
          }
        },
        'image/jpeg',
        profile.photoJpegQuality
      );
    }
  };

  const startRecording = () => {
    if (!stream) return;
    const mimeType = getSupportedMimeType(type);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      recorder = new MediaRecorder(stream);
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

    if (type === 'audio') setupAudioAnalyser(stream);

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
    totalSizeRef.current = 0;
    lastSizeUpdateRef.current = 0;
    timerRef.current = setInterval(() => {
      setRecordingTime((t) => t + 1);
    }, 1000);
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
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
      if (audioContextRef.current) {
        audioContextRef.current.close().catch((error) => {
          logger.warn('Failed to close AudioContext while stopping recording', {
            error,
          });
        });
        audioContextRef.current = null;
      }
      setAudioLevels(new Array(12).fill(0));
    }
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
    blob: Blob
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
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let filename = '';
    if (type === 'photo') {
      filename = `photo_${timestamp}.jpg`;
    } else {
      const ext =
        capturedBlob.type.split('/')[1]?.split(';')[0] || (type === 'video' ? 'webm' : 'webm');
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
      await onCapture(file, wasEncrypted);
      setIsSuccess(true);
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
    setCameraFacing((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    onClose();
  };

  const setupAudioAnalyser = async (stream: MediaStream) => {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') await audioContext.resume();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 32;
    source.connect(analyser);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const update = () => {
      analyser.getByteFrequencyData(dataArray);
      const levels = Array.from(dataArray).slice(0, 12);
      setAudioLevels(levels);
      animationFrameRef.current = requestAnimationFrame(update);
    };
    update();
    audioContextRef.current = audioContext;
  };

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
              : 'items-center justify-center p-6 lg:p-8'
          )}
        >
          <div
            className={cn(
              'relative flex h-full w-full flex-col overflow-hidden border-white/10 bg-black shadow-3xl',
              isMobileViewport
                ? 'max-w-none border-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
                : 'max-w-5xl md:h-[720px] md:max-h-[90vh] md:border',
              !capturedBlob && !isMobileViewport && 'md:rounded-[32px]'
            )}
          >
            <Header
              type={type}
              isRecording={isRecording}
              capturedBlob={capturedBlob}
              isClosing={isClosing}
              onClose={handleClose}
            />

            <div className="relative flex-1 min-h-0 bg-black overflow-hidden group/container">
              <div className="absolute inset-0 pointer-events-none z-10 shadow-[inner_0_0_100px_rgba(0,0,0,0.8)]" />

              {isInfoEnabled && (
                <InfoOverlays rsaKeyPair={rsaKeyPair} isEncrypting={isEncrypting} />
              )}

              {capturedBlob ? (
                <PreviewContent type={type} previewUrl={previewUrl!} />
              ) : (
                <>
                  {type !== 'audio' ? (
                    <CameraFeed
                      videoRef={videoRef}
                      isInitializing={isInitializing}
                      cameraFacing={cameraFacing}
                      isHorizontallyFlipped={isHorizontallyFlipped}
                      captureRatio={captureRatio}
                      type={type}
                      onFileSelect={(file) => {
                        setCapturedBlob(file);
                        setPreviewUrl(URL.createObjectURL(file));
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
                    />
                  )}

                  {isRecording && type !== 'audio' && (
                    <RecordingStatus
                      recordingTime={recordingTime}
                      recordingSize={recordingSize}
                      formatTime={formatTime}
                      formatSize={formatSize}
                    />
                  )}
                </>
              )}
            </div>

            <Actions
              type={type}
              capturedBlob={capturedBlob}
              isSaving={isSaving}
              isSuccess={isSuccess}
              isEncrypting={isEncrypting}
              isRecording={isRecording}
              isInfoEnabled={isInfoEnabled}
              captureRatio={captureRatio}
              captureQuality={captureQuality}
              captureSize={captureSize}
              onRetake={() => {
                if (previewUrl) {
                  URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }
                setCapturedBlob(null);
                startCamera();
              }}
              onSave={handleSave}
              onTakePhoto={takePhoto}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onToggleInfo={() =>
                updatePreferences({
                  isLiveCaptureInfoEnabled: !isInfoEnabled,
                })
              }
              onToggleCamera={toggleCamera}
              onToggleHorizontalFlip={() => setIsHorizontallyFlipped((prev) => !prev)}
              cameraFacing={cameraFacing}
              isHorizontallyFlipped={isHorizontallyFlipped}
              onCycleCaptureRatio={() =>
                setCaptureRatio((prev) => {
                  const currentIndex = CAPTURE_RATIOS.indexOf(prev);
                  const next = CAPTURE_RATIOS[(currentIndex + 1) % CAPTURE_RATIOS.length];
                  toast.info(`Aspect ratio: ${next}`);
                  return next;
                })
              }
              onCycleCaptureQuality={() =>
                setCaptureQuality((prev) => {
                  const next = prev === 'high' ? 'balanced' : prev === 'balanced' ? 'low' : 'high';
                  toast.info(
                    `Quality: ${next === 'high' ? 'High' : next === 'balanced' ? 'Balanced' : 'Low'}`
                  );
                  return next;
                })
              }
              onCycleCaptureSize={() =>
                setCaptureSize((prev) => {
                  const next = prev === 'full' ? 'medium' : prev === 'medium' ? 'compact' : 'full';
                  toast.info(
                    `Size: ${next === 'full' ? 'Full' : next === 'medium' ? 'Medium' : 'Compact'}`
                  );
                  return next;
                })
              }
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
