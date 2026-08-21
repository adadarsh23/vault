export type CaptureType = 'photo' | 'video' | 'audio';
export type TimerOption = 0 | 3 | 5 | 10;
export type BurstOption = 1 | 5 | 10;
export type CameraFilter =
  | 'none'
  | 'document'
  | 'noir'
  | 'vivid'
  | 'warm'
  | 'cyberpunk'
  | 'moe'
  | 'sepia'
  | 'cool'
  | 'dramatic'
  | 'emerald'
  | 'sunset'
  | 'vintage-film'
  | 'cinema-teal'
  | 'matte-black'
  | 'lavender-dream'
  | 'cyber-neon'
  | 'desert-gold'
  | 'arctic-frost'
  | 'polaroid'
  | 'infrared'
  | 'night-vision'
  | 'golden-hour'
  | 'matrix-green'
  | 'deep-ocean'
  | 'ruby-noir'
  | 'high-key-bw'
  | 'pastel-bloom'
  | 'chroma-synth'
  | 'kodak-gold'
  | 'midnight-fog'
  | 'warm-espresso';

export type CaptureRatio =
  | '1:1'
  | '4:5'
  | '3:4'
  | '4:3'
  | '2:3'
  | '3:2'
  | '9:16'
  | '16:9'
  | '21:9';
export type CaptureQuality = 'high' | 'balanced' | 'low';
export type CaptureSize = 'full' | 'medium' | 'compact';

export interface ZoomCapabilities {
  min: number;
  max: number;
  step: number;
  current: number;
  supported: boolean;
}

export interface TorchCapabilities {
  supported: boolean;
  active: boolean;
}

export interface MediaDeviceInfoItem {
  deviceId: string;
  label: string;
  kind: 'videoinput' | 'audioinput';
  groupId?: string;
}

export interface SnapshotItem {
  id: string;
  url: string;
  blob: Blob;
  timestamp: number;
}

// ⏳ Time-Lapse & Fast-Motion Types
export type TimelapseInterval = 1 | 2 | 5; // seconds per frame
export interface TimelapseStats {
  framesCaptured: number;
  realDurationSec: number;
  outputDurationSec: number;
  speedMultiplier: number;
}

// 🤳 Dual Camera Types
export type DualCameraLayout = 'pip' | 'split-horizontal' | 'split-vertical';
export type PipPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export interface DualCameraSettings {
  enabled: boolean;
  layout: DualCameraLayout;
  pipPosition: PipPosition;
  isSwapped: boolean;
  secondaryDeviceId?: string;
}

// 📐 Gyroscopic Leveler Types
export interface GyroLevelState {
  roll: number; // degrees
  pitch: number; // degrees
  isLevel: boolean;
  supported: boolean;
  permissionGranted: boolean;
}

// 🔍 QR Code & Barcode Scanner Types
export type BarcodeContentType = 'url' | 'wifi' | 'secret' | 'otp' | 'text' | 'email' | 'phone';
export interface ScannedBarcodeResult {
  rawValue: string;
  format: string;
  type: BarcodeContentType;
  title: string;
  parsedData?: Record<string, string>;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  timestamp: number;
}

export const getSupportedMimeType = (type: CaptureType): string => {
  if (type === 'photo') return 'image/jpeg';
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) {
    return '';
  }

  const isIOS =
    typeof window !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  // Prioritize MP4 on iOS/Safari for native hardware encoder compatibility
  const videoCandidates = isIOS
    ? [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=avc1',
        'video/mp4;codecs=h264',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ]
    : [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=h264',
        'video/mp4',
        'video/x-matroska;codecs=avc1',
      ];

  const audioCandidates = isIOS
    ? [
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
        'audio/aac',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/wav',
      ]
    : [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/mp4',
        'audio/wav',
      ];

  const candidates = type === 'audio' ? audioCandidates : videoCandidates;

  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return '';
};

export interface CaptureMetadata {
  transcript?: string;
  voiceClarityPreset?: string;
  hasVoiceClarity?: boolean;
  [key: string]: any;
}


