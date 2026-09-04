import { DualCameraLayout, PipPosition } from './types';
import { logger } from '../../../../lib/logger';

export interface DualCameraManager {
  secondaryStream: MediaStream | null;
  secondaryVideo: HTMLVideoElement;
  startSecondaryStream: (
    primaryFacing: 'user' | 'environment',
    secondaryDeviceId?: string,
  ) => Promise<MediaStream | null>;
  stopSecondaryStream: () => void;
  renderComposite: (
    targetCanvas: HTMLCanvasElement,
    primaryVideo: HTMLVideoElement,
    layout: DualCameraLayout,
    pipPosition: PipPosition,
    isSwapped: boolean,
    primaryFacing: 'user' | 'environment',
    isPrimaryFlipped: boolean,
    filterCss?: string,
  ) => void;
  takeDualSnapshot: (
    primaryVideo: HTMLVideoElement,
    layout: DualCameraLayout,
    pipPosition: PipPosition,
    isSwapped: boolean,
    primaryFacing: 'user' | 'environment',
    isPrimaryFlipped: boolean,
    filterCss?: string,
    quality?: number,
  ) => Promise<Blob | null>;
}

export function createDualCameraManager(): DualCameraManager {
  let secondaryStream: MediaStream | null = null;
  const secondaryVideo = document.createElement('video');
  secondaryVideo.autoplay = true;
  secondaryVideo.playsInline = true;
  secondaryVideo.muted = true;

  const startSecondaryStream = async (
    primaryFacing: 'user' | 'environment',
    secondaryDeviceId?: string,
  ): Promise<MediaStream | null> => {
    stopSecondaryStream();
    if (!navigator.mediaDevices?.getUserMedia) return null;

    try {
      const targetFacing = primaryFacing === 'user' ? 'environment' : 'user';
      const constraints: MediaStreamConstraints = {
        video: secondaryDeviceId
          ? { deviceId: { exact: secondaryDeviceId } }
          : { facingMode: { ideal: targetFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };

      secondaryStream = await navigator.mediaDevices.getUserMedia(constraints);
      secondaryVideo.srcObject = secondaryStream;
      await secondaryVideo.play().catch(() => {});
      return secondaryStream;
    } catch (err) {
      logger.warn('Failed to start secondary camera for Dual Camera mode', { err });
      return null;
    }
  };

  const stopSecondaryStream = () => {
    if (secondaryStream) {
      secondaryStream.getTracks().forEach((track) => track.stop());
      secondaryStream = null;
    }
    secondaryVideo.srcObject = null;
  };

  const renderComposite = (
    targetCanvas: HTMLCanvasElement,
    primaryVideo: HTMLVideoElement,
    layout: DualCameraLayout,
    pipPosition: PipPosition,
    isSwapped: boolean,
    primaryFacing: 'user' | 'environment',
    isPrimaryFlipped: boolean,
    filterCss = 'none',
  ) => {
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    const mainVid = isSwapped ? secondaryVideo : primaryVideo;
    const subVid = isSwapped ? primaryVideo : secondaryVideo;
    const isMainFront = isSwapped ? primaryFacing !== 'user' : primaryFacing === 'user';
    const isSubFront = !isMainFront;

    const w = targetCanvas.width;
    const h = targetCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.filter = filterCss;

    if (layout === 'split-horizontal') {
      // Left / Right 50% split
      const halfW = w / 2;

      // Draw Main on Left
      if (mainVid && mainVid.readyState >= 2) {
        try {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, halfW, h);
          ctx.clip();
          if (isMainFront !== isPrimaryFlipped) {
            ctx.translate(halfW, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(mainVid, 0, 0, halfW, h);
          } else {
            ctx.drawImage(mainVid, 0, 0, halfW, h);
          }
          ctx.restore();
        } catch {
          /* ignore frame drawing glitch */
        }
      }

      // Draw Sub on Right
      if (subVid && subVid.readyState >= 2) {
        try {
          ctx.save();
          ctx.beginPath();
          ctx.rect(halfW, 0, halfW, h);
          ctx.clip();
          if (isSubFront) {
            ctx.translate(w + halfW, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(subVid, 0, 0, halfW, h);
          } else {
            ctx.drawImage(subVid, halfW, 0, halfW, h);
          }
          ctx.restore();
        } catch {
          /* ignore frame drawing glitch */
        }
      }

      // Divider Line
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(halfW, 0);
      ctx.lineTo(halfW, h);
      ctx.stroke();
      ctx.restore();
    } else if (layout === 'split-vertical') {
      // Top / Bottom 50% split
      const halfH = h / 2;

      // Draw Main on Top
      if (mainVid && mainVid.readyState >= 2) {
        try {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, w, halfH);
          ctx.clip();
          if (isMainFront !== isPrimaryFlipped) {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(mainVid, 0, 0, w, halfH);
          } else {
            ctx.drawImage(mainVid, 0, 0, w, halfH);
          }
          ctx.restore();
        } catch {
          /* ignore frame drawing glitch */
        }
      }

      // Draw Sub on Bottom
      if (subVid && subVid.readyState >= 2) {
        try {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, halfH, w, halfH);
          ctx.clip();
          if (isSubFront) {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(subVid, 0, halfH, w, halfH);
          } else {
            ctx.drawImage(subVid, 0, halfH, w, halfH);
          }
          ctx.restore();
        } catch {
          /* ignore frame drawing glitch */
        }
      }

      // Divider Line
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, halfH);
      ctx.lineTo(w, halfH);
      ctx.stroke();
      ctx.restore();
    } else {
      // Picture-in-Picture (PiP)
      // 1. Draw Background full video
      if (mainVid && mainVid.readyState >= 2) {
        try {
          ctx.save();
          if (isMainFront !== isPrimaryFlipped) {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(mainVid, 0, 0, w, h);
          } else {
            ctx.drawImage(mainVid, 0, 0, w, h);
          }
          ctx.restore();
        } catch {
          /* ignore frame drawing glitch */
        }
      }

      // 2. Draw Sub-camera in PiP bubble
      if (subVid && subVid.readyState >= 2) {
        const pipW = Math.round(w * 0.28);
        const pipH = Math.round(h * 0.28);
        const margin = Math.round(w * 0.04);

        let pipX = w - pipW - margin;
        let pipY = margin;

        if (pipPosition === 'top-left') {
          pipX = margin;
          pipY = margin;
        } else if (pipPosition === 'bottom-left') {
          pipX = margin;
          pipY = h - pipH - margin;
        } else if (pipPosition === 'bottom-right') {
          pipX = w - pipW - margin;
          pipY = h - pipH - margin;
        }

        const radius = 16;
        try {
          ctx.save();

          // Shadow & Border
          ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 6;

          ctx.beginPath();
          ctx.roundRect(pipX, pipY, pipW, pipH, radius);
          ctx.fillStyle = '#000';
          ctx.fill();

          // Clip & Draw Secondary Feed
          ctx.beginPath();
          ctx.roundRect(pipX, pipY, pipW, pipH, radius);
          ctx.clip();

          if (isSubFront) {
            ctx.translate(pipX * 2 + pipW, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(subVid, pipX, pipY, pipW, pipH);
          } else {
            ctx.drawImage(subVid, pipX, pipY, pipW, pipH);
          }
          ctx.restore();

          // Glowing border around PiP bubble
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(pipX, pipY, pipW, pipH, radius);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.restore();
        } catch {
          /* ignore frame drawing glitch */
        }
      }
    }
  };

  const takeDualSnapshot = async (
    primaryVideo: HTMLVideoElement,
    layout: DualCameraLayout,
    pipPosition: PipPosition,
    isSwapped: boolean,
    primaryFacing: 'user' | 'environment',
    isPrimaryFlipped: boolean,
    filterCss = 'none',
    quality = 0.92,
  ): Promise<Blob | null> => {
    const canvas = document.createElement('canvas');
    canvas.width = primaryVideo.videoWidth || 1920;
    canvas.height = primaryVideo.videoHeight || 1080;

    renderComposite(
      canvas,
      primaryVideo,
      layout,
      pipPosition,
      isSwapped,
      primaryFacing,
      isPrimaryFlipped,
      filterCss,
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    });
  };

  return {
    get secondaryStream() {
      return secondaryStream;
    },
    secondaryVideo,
    startSecondaryStream,
    stopSecondaryStream,
    renderComposite,
    takeDualSnapshot,
  };
}
