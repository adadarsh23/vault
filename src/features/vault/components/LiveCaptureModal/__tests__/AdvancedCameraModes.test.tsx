/* @vitest-environment jsdom */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyBarcodeContent,
  saveBarcodeToEncryptedVaultNote,
  BarcodeScannerEngine,
} from '../qrScannerEngine';
import { GyroLevelerOverlay } from '../GyroLevelerOverlay';
import { DualCameraOverlay } from '../DualCameraOverlay';
import { Header } from '../Header';
import { QRScannerOverlay } from '../QRScannerOverlay';
import { CameraFeed } from '../CameraFeed';
import { RecordingStatus } from '../RecordingStatus';
import { getSupportedMimeType } from '../types';

describe('Advanced Camera & Recording Modes Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. ⏳ Time-Lapse & Fast-Motion Engine', () => {
    it('renders time-lapse toggle button in Header for video mode', () => {
      const onToggleTimelapse = vi.fn();
      render(
        <Header
          type="video"
          isRecording={false}
          capturedBlob={null}
          isClosing={false}
          onClose={vi.fn()}
          isTimelapseEnabled={true}
          timelapseInterval={2}
          onToggleTimelapse={onToggleTimelapse}
        />
      );

      const timelapseBtn = screen.getByTitle(/Time-Lapse: 2s/i);
      expect(timelapseBtn).toBeTruthy();
      expect(screen.getByText('2s')).toBeTruthy();

      fireEvent.click(timelapseBtn);
      expect(onToggleTimelapse).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. 🤳 Dual Camera Mode (Picture-in-Picture & Split Screen)', () => {
    it('renders dual camera button in Header and triggers toggle', () => {
      const onToggleDual = vi.fn();
      render(
        <Header
          type="photo"
          isRecording={false}
          capturedBlob={null}
          isClosing={false}
          onClose={vi.fn()}
          isDualCameraEnabled={true}
          onToggleDualCamera={onToggleDual}
          burstCount={5}
          onCycleBurst={vi.fn()}
        />
      );

      const dualBtn = screen.getByLabelText(/Toggle Dual Camera Mode/i);
      expect(dualBtn).toBeTruthy();
      const burstBtn = screen.getByLabelText(/Burst shoot 5 photos/i);
      expect(burstBtn).toBeTruthy();

      fireEvent.click(dualBtn);
      expect(onToggleDual).toHaveBeenCalledTimes(1);
    });

    it('renders DualCameraOverlay in PiP mode and supports position cycling and swap', () => {
      const onToggleLayout = vi.fn();
      const onCyclePip = vi.fn();
      const onSwap = vi.fn();
      const videoRef = { current: document.createElement('video') };

      render(
        <DualCameraOverlay
          enabled={true}
          secondaryVideoRef={videoRef}
          layout="pip"
          pipPosition="top-right"
          isSwapped={false}
          onToggleLayout={onToggleLayout}
          onCyclePipPosition={onCyclePip}
          onSwapCameras={onSwap}
          primaryFacing="user"
        />
      );

      expect(screen.getByText('PiP')).toBeTruthy();
      const swapBtn = screen.getByTitle(/Swap Main & PiP Cameras/i);
      expect(swapBtn).toBeTruthy();
      fireEvent.click(swapBtn);
      expect(onSwap).toHaveBeenCalledTimes(1);

      const layoutBtn = screen.getByTitle(/Switch Dual Layout/i);
      fireEvent.click(layoutBtn);
      expect(onToggleLayout).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. 📐 Gyroscopic Leveler (Horizon Line)', () => {
    it('renders gyroscopic horizon button in Header', () => {
      const onToggleGyro = vi.fn();
      render(
        <Header
          type="photo"
          isRecording={false}
          capturedBlob={null}
          isClosing={false}
          onClose={vi.fn()}
          isGyroLevelerEnabled={true}
          onToggleGyroLeveler={onToggleGyro}
        />
      );

      const gyroBtn = screen.getByLabelText(/Toggle Gyroscopic Horizon Leveler/i);
      expect(gyroBtn).toBeTruthy();
      fireEvent.click(gyroBtn);
      expect(onToggleGyro).toHaveBeenCalledTimes(1);
    });

    it('renders GyroLevelerOverlay indicator and updates with motion/orientation events', async () => {
      const onLevelStateChange = vi.fn();
      render(<GyroLevelerOverlay enabled={true} onLevelStateChange={onLevelStateChange} />);
      expect(screen.getByText(/0.0° LEVEL/i)).toBeTruthy();

      // Trigger devicemotion event
      act(() => {
        const motionEvent = new Event('devicemotion') as any;
        motionEvent.accelerationIncludingGravity = { x: 0, y: 9.8, z: 0 };
        window.dispatchEvent(motionEvent);
      });

      expect(screen.getByText(/0.0° LEVEL/i)).toBeTruthy();
    });
  });

  describe('4. 🔍 QR Code & Barcode Instant Scanner', () => {
    it('correctly classifies various barcode types', () => {
      // URL
      const urlRes = classifyBarcodeContent('https://vault.secure.app/credentials');
      expect(urlRes.type).toBe('url');
      expect(urlRes.title).toContain('vault.secure.app');

      // WiFi
      const wifiRes = classifyBarcodeContent('WIFI:S:MyVaultNetwork;T:WPA;P:SuperSecretPass;;');
      expect(wifiRes.type).toBe('wifi');
      expect(wifiRes.parsedData?.['SSID']).toBe('MyVaultNetwork');
      expect(wifiRes.parsedData?.['Password']).toBe('SuperSecretPass');

      // OTP Auth
      const otpRes = classifyBarcodeContent(
        'otpauth://totp/Vault:alice@example.com?secret=JBSWY3DPEHPK3PXP'
      );
      expect(otpRes.type).toBe('otp');
      expect(otpRes.title).toContain('2FA Authenticator');

      // Secret Key
      const secretRes = classifyBarcodeContent(
        '0x4f35569a909ef4c34d092100868f000109012398492084923482390482039482'
      );
      expect(secretRes.type).toBe('secret');

      // Plain Text
      const textRes = classifyBarcodeContent('Meeting room access code: 492019');
      expect(textRes.type).toBe('text');
    });

    it('formats and encrypts scanned barcode result into a Vault Note', async () => {
      const mockKey = {} as CryptoKey;
      const mockAddItem = vi.fn().mockResolvedValue({ id: 'note-123' });

      const barcodeResult = {
        rawValue: 'https://example.com/private-invite',
        format: 'qr_code',
        type: 'url' as const,
        title: 'URL: example.com',
        timestamp: Date.now(),
      };

      const noteId = await saveBarcodeToEncryptedVaultNote(barcodeResult, mockKey, mockAddItem);
      expect(noteId).toBe('note-123');
      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'note',
          title: expect.stringContaining('QR: URL: example.com'),
        })
      );
    });

    it('instantiates BarcodeScannerEngine and reports support', () => {
      const engine = new BarcodeScannerEngine();
      expect(engine.isSupported).toBe(true);
    });

    it('renders QRScannerOverlay scan reticle and actions', () => {
      const onSaveNote = vi.fn();
      const videoRef = { current: document.createElement('video') };

      render(
        <QRScannerOverlay
          enabled={true}
          videoRef={videoRef}
          onSaveToNote={onSaveNote}
        />
      );

      expect(screen.getByText(/Point at QR \/ Barcode/i)).toBeTruthy();
    });
  });

  describe('5. 📹 MIME Type Resolution Engine', () => {
    it('returns image/jpeg for photo capture type', () => {
      expect(getSupportedMimeType('photo')).toBe('image/jpeg');
    });

    it('returns supported video mime type when MediaRecorder is available', () => {
      const originalMediaRecorder = window.MediaRecorder;
      (window as any).MediaRecorder = {
        isTypeSupported: vi.fn((mime: string) => mime.includes('webm;codecs=vp9,opus')),
      };

      const result = getSupportedMimeType('video');
      expect(result).toBe('video/webm;codecs=vp9,opus');

      window.MediaRecorder = originalMediaRecorder;
    });

    it('returns supported audio mime type when MediaRecorder is available', () => {
      const originalMediaRecorder = window.MediaRecorder;
      (window as any).MediaRecorder = {
        isTypeSupported: vi.fn((mime: string) => mime.includes('audio/webm;codecs=opus')),
      };

      const result = getSupportedMimeType('audio');
      expect(result).toBe('audio/webm;codecs=opus');

      window.MediaRecorder = originalMediaRecorder;
    });

    it('falls back to empty string if no candidate is supported or MediaRecorder is not defined', () => {
      const originalMediaRecorder = window.MediaRecorder;
      (window as any).MediaRecorder = {
        isTypeSupported: vi.fn(() => false),
      };

      expect(getSupportedMimeType('video')).toBe('');
      expect(getSupportedMimeType('audio')).toBe('');

      window.MediaRecorder = originalMediaRecorder;
    });
  });

  describe('6. 🎙️ Video Mode Responsive Audio Visualizer & Indicator', () => {
    it('renders responsive live audio visualizer when type is video and unmuted', () => {
      const onToggleMute = vi.fn();
      const videoRef = { current: document.createElement('video') };

      render(
        <CameraFeed
          videoRef={videoRef}
          isInitializing={false}
          cameraFacing="environment"
          isHorizontallyFlipped={false}
          captureRatio="16:9"
          type="video"
          onFileSelect={vi.fn()}
          audioLevels={[120, 150, 180, 200, 220, 255]}
          isMuted={false}
          onToggleMute={onToggleMute}
        />
      );

      const indicator = screen.getByRole('status');
      expect(indicator).toBeTruthy();
      expect(indicator.getAttribute('aria-label')).toBe('Microphone audio level indicator');

      fireEvent.click(indicator);
      expect(onToggleMute).toHaveBeenCalledTimes(1);
    });

    it('renders muted state with VolumeX and "Muted" badge when isMuted is true', () => {
      const onToggleMute = vi.fn();
      const videoRef = { current: document.createElement('video') };

      render(
        <CameraFeed
          videoRef={videoRef}
          isInitializing={false}
          cameraFacing="environment"
          isHorizontallyFlipped={false}
          captureRatio="16:9"
          type="video"
          onFileSelect={vi.fn()}
          audioLevels={[0, 0, 0, 0, 0, 0]}
          isMuted={true}
          onToggleMute={onToggleMute}
        />
      );

      const indicator = screen.getByRole('status');
      expect(indicator).toBeTruthy();
      expect(screen.getByText('Muted')).toBeTruthy();
      expect(indicator.getAttribute('aria-label')).toBe('Microphone muted');

      fireEvent.click(indicator);
      expect(onToggleMute).toHaveBeenCalledTimes(1);
    });

    it('does not render audio visualizer in photo mode or during initialization', () => {
      const videoRef = { current: document.createElement('video') };

      const { rerender } = render(
        <CameraFeed
          videoRef={videoRef}
          isInitializing={false}
          cameraFacing="environment"
          isHorizontallyFlipped={false}
          captureRatio="16:9"
          type="photo"
          onFileSelect={vi.fn()}
        />
      );

      expect(screen.queryByRole('status')).toBeNull();

      rerender(
        <CameraFeed
          videoRef={videoRef}
          isInitializing={true}
          cameraFacing="environment"
          isHorizontallyFlipped={false}
          captureRatio="16:9"
          type="video"
          onFileSelect={vi.fn()}
        />
      );

      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  describe('7. ⏺️ Recording Status Top HUD Pill', () => {
    it('renders REC status, elapsed time, and MB size cleanly at the top without green bars', () => {
      render(
        <RecordingStatus
          recordingTime={45}
          recordingSize={4194304}
          formatTime={(s) => `00:${s < 10 ? '0' : ''}${s}`}
          formatSize={(b) => `${(b / (1024 * 1024)).toFixed(1)} MB`}
          isPaused={false}
        />
      );

      expect(screen.getByText('REC')).toBeTruthy();
      expect(screen.getByText('00:45')).toBeTruthy();
      expect(screen.getByText('4.0 MB')).toBeTruthy();
      expect(screen.queryByLabelText('Microphone activity')).toBeNull();
    });

    it('renders PAUSED state with amber badge', () => {
      render(
        <RecordingStatus
          recordingTime={12}
          recordingSize={1048576}
          formatTime={(s) => `00:${s < 10 ? '0' : ''}${s}`}
          formatSize={(b) => `${(b / (1024 * 1024)).toFixed(1)} MB`}
          isPaused={true}
        />
      );

      expect(screen.getByText('PAUSED')).toBeTruthy();
      expect(screen.getByText('00:12')).toBeTruthy();
      expect(screen.getByText('1.0 MB')).toBeTruthy();
    });
  });

  describe('8. 🗣️ Live Transcription Engine (Hindi & English, Default Off, Compact Bottom UI)', () => {
    it('renders compact live transcription subtitle at bottom when active', () => {
      const videoRef = { current: document.createElement('video') };

      render(
        <CameraFeed
          videoRef={videoRef}
          isInitializing={false}
          cameraFacing="environment"
          isHorizontallyFlipped={false}
          captureRatio="16:9"
          type="video"
          onFileSelect={vi.fn()}
          isTranscribing={true}
          transcriptLang="hi-IN"
          liveTranscript="नमस्ते यह एक टेस्ट है"
        />
      );

      expect(screen.getByText('"नमस्ते यह एक टेस्ट है"')).toBeTruthy();
      expect(screen.getByText('HI')).toBeTruthy();
    });

    it('does not render subtitle pill when isTranscribing is false (default off)', () => {
      const videoRef = { current: document.createElement('video') };

      render(
        <CameraFeed
          videoRef={videoRef}
          isInitializing={false}
          cameraFacing="environment"
          isHorizontallyFlipped={false}
          captureRatio="16:9"
          type="video"
          onFileSelect={vi.fn()}
          isTranscribing={false}
          liveTranscript="Hello world"
        />
      );

      expect(screen.queryByText('"Hello world"')).toBeNull();
    });
  });
});

