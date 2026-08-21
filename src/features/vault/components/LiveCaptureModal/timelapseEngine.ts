import { TimelapseInterval, TimelapseStats } from './types';
import { logger } from '../../../../lib/logger';

export interface TimelapseController {
  stop: () => Promise<Blob>;
  pause: () => void;
  resume: () => void;
  getStats: () => TimelapseStats;
}

export interface StartTimelapseOptions {
  videoElement: HTMLVideoElement;
  intervalSec: TimelapseInterval;
  mimeType: string;
  isHorizontallyFlipped?: boolean;
  filterCss?: string;
  onStatsUpdate?: (stats: TimelapseStats) => void;
  onFrameTick?: () => void;
  customDrawSource?: () => CanvasImageSource | null;
}

/**
 * Creates a Time-Lapse recording session.
 * Captures 1 frame every `intervalSec` seconds (1s, 2s, 5s) and pushes to a 30fps canvas stream.
 * 30 captured frames = 1 second of smooth fast-motion video.
 */
export function startTimelapseSession({
  videoElement,
  intervalSec,
  mimeType,
  isHorizontallyFlipped = false,
  filterCss = 'none',
  onStatsUpdate,
  onFrameTick,
  customDrawSource,
}: StartTimelapseOptions): TimelapseController {
  const canvas = document.createElement('canvas');
  const targetWidth = videoElement.videoWidth || 1280;
  const targetHeight = videoElement.videoHeight || 720;
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('Canvas 2D context not available for Time-Lapse');
  }

  // Draw initial blank or first frame
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let stream: MediaStream;
  if (typeof (canvas as any).captureStream === 'function') {
    stream = (canvas as any).captureStream(30);
  } else {
    throw new Error('Canvas captureStream not supported in this browser');
  }

  let mediaRecorder: MediaRecorder;
  try {
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    mediaRecorder = new MediaRecorder(stream);
  }

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  let framesCaptured = 0;
  let startTime = Date.now();
  let pausedElapsed = 0;
  let pauseStartTime: number | null = null;
  let isPaused = false;
  let isStopped = false;

  let intervalTimer: ReturnType<typeof setInterval> | null = null;
  let renderLoopRaf: number | null = null;
  let lastCapturedImageBitmap: ImageBitmap | HTMLCanvasElement | null = null;

  const captureSingleFrame = () => {
    if (isPaused || isStopped) return;
    try {
      const source = customDrawSource ? customDrawSource() : videoElement;
      if (!source) return;

      // Draw current video frame to an offscreen buffer
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return;

      tempCtx.filter = filterCss;
      if (isHorizontallyFlipped) {
        tempCtx.translate(tempCanvas.width, 0);
        tempCtx.scale(-1, 1);
      }
      tempCtx.drawImage(source, 0, 0, tempCanvas.width, tempCanvas.height);

      lastCapturedImageBitmap = tempCanvas;
      framesCaptured += 1;

      if (onFrameTick) {
        onFrameTick();
      }

      updateAndNotifyStats();
    } catch (err) {
      logger.warn('Failed to capture timelapse frame', { err });
    }
  };

  // Continuous loop to pump the latest frame at 30 fps to the canvas stream
  const renderLoop = () => {
    if (isStopped) return;
    if (lastCapturedImageBitmap && ctx) {
      ctx.drawImage(lastCapturedImageBitmap, 0, 0, canvas.width, canvas.height);
    }
    renderLoopRaf = requestAnimationFrame(renderLoop);
  };

  const updateAndNotifyStats = () => {
    if (!onStatsUpdate) return;
    const now = Date.now();
    const currentPaused = pauseStartTime ? now - pauseStartTime : 0;
    const realDurationSec = Math.max(
      0,
      Math.floor((now - startTime - pausedElapsed - currentPaused) / 1000)
    );
    const outputDurationSec = Number((framesCaptured / 30).toFixed(1));
    const speedMultiplier = intervalSec * 30;

    onStatsUpdate({
      framesCaptured,
      realDurationSec,
      outputDurationSec,
      speedMultiplier,
    });
  };

  // Capture very first frame immediately
  captureSingleFrame();
  mediaRecorder.start(250);
  renderLoop();

  // Set up interval for capturing succeeding frames
  intervalTimer = setInterval(() => {
    captureSingleFrame();
  }, intervalSec * 1000);

  const getStats = (): TimelapseStats => {
    const now = Date.now();
    const currentPaused = pauseStartTime ? now - pauseStartTime : 0;
    const realDurationSec = Math.max(
      0,
      Math.floor((now - startTime - pausedElapsed - currentPaused) / 1000)
    );
    return {
      framesCaptured,
      realDurationSec,
      outputDurationSec: Number((framesCaptured / 30).toFixed(1)),
      speedMultiplier: intervalSec * 30,
    };
  };

  return {
    pause: () => {
      if (isPaused || isStopped) return;
      isPaused = true;
      pauseStartTime = Date.now();
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
      }
      updateAndNotifyStats();
    },
    resume: () => {
      if (!isPaused || isStopped) return;
      isPaused = false;
      if (pauseStartTime) {
        pausedElapsed += Date.now() - pauseStartTime;
        pauseStartTime = null;
      }
      if (mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
      }
      captureSingleFrame();
      updateAndNotifyStats();
    },
    stop: () => {
      isStopped = true;
      if (intervalTimer) clearInterval(intervalTimer);
      if (renderLoopRaf) cancelAnimationFrame(renderLoopRaf);

      return new Promise<Blob>((resolve, reject) => {
        mediaRecorder.onstop = () => {
          try {
            const outputMime =
              mediaRecorder.mimeType || mimeType || 'video/webm';
            const blob = new Blob(chunks, { type: outputMime });
            stream.getTracks().forEach((track) => track.stop());
            resolve(blob);
          } catch (err) {
            reject(err);
          }
        };

        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        } else {
          const outputMime = mediaRecorder.mimeType || mimeType || 'video/webm';
          resolve(new Blob(chunks, { type: outputMime }));
        }
      });
    },
    getStats,
  };
}
