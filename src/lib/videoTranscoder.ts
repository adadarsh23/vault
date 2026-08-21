import { logger } from './logger';
import { createTrackedBlobUrl } from './blobRegistry';

export type TranscodeProgressStage = 'loading' | 'remuxing' | 'transcoding' | 'done';

export interface TranscodeProgressEvent {
  progress: number; // 0 to 100
  stage: TranscodeProgressStage;
  message: string;
}

let ffmpegInstance: any = null;
let ffmpegLoadingPromise: Promise<any> | null = null;
const MAX_TRANSCODE_CACHE_ENTRIES = 8;
const transcodedBlobCache = new Map<string, { url: string; blob: Blob }>();

function setBoundedTranscodeCache(key: string, value: { url: string; blob: Blob }) {
  if (transcodedBlobCache.size >= MAX_TRANSCODE_CACHE_ENTRIES && !transcodedBlobCache.has(key)) {
    const oldestKey = transcodedBlobCache.keys().next().value;
    if (oldestKey) {
      const old = transcodedBlobCache.get(oldestKey);
      if (old?.url?.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(old.url);
        } catch {
          /* ignore */
        }
      }
      transcodedBlobCache.delete(oldestKey);
    }
  }
  transcodedBlobCache.set(key, value);
}

const FFMPEG_VERSION = '0.12.10';
const FFMPEG_BASE_URL = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm`;
const FFMPEG_ESM_URL = `${FFMPEG_BASE_URL}/index.js`;
const CORE_VERSION = '0.12.10';
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
const CACHE_NAME = 'vault-ffmpeg-wasm-v1';

/**
 * Loads a remote asset with persistent CacheStorage support.
 * The 31MB WASM binary is downloaded once and cached permanently on local disk.
 */
async function toCachedBlobURL(url: string, mimeType: string): Promise<string> {
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME);
      const match = await cache.match(url);
      if (match) {
        const blob = await match.blob();
        return URL.createObjectURL(new Blob([blob], { type: mimeType }));
      }
      const res = await fetch(url);
      if (res.ok) {
        cache.put(url, res.clone()).catch(() => {});
        const blob = await res.blob();
        return URL.createObjectURL(new Blob([blob], { type: mimeType }));
      }
    } catch {
      // Fallback to direct fetch on cache error
    }
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load WASM asset from ${url} (${res.status})`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(new Blob([blob], { type: mimeType }));
}

async function fetchFileData(src: string | Blob): Promise<Uint8Array> {
  if (src instanceof Blob) {
    return new Uint8Array(await src.arrayBuffer());
  }
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`Failed to read video stream from source (${res.status})`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Pre-warms the FFmpeg WebAssembly engine in idle time.
 */
export function preloadFFmpeg(): void {
  if (ffmpegInstance || ffmpegLoadingPromise) return;
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => {
      getFFmpegInstance().catch(() => {});
    });
  } else {
    setTimeout(() => {
      getFFmpegInstance().catch(() => {});
    }, 2000);
  }
}

/**
 * Loads the FFmpeg WebAssembly instance on-demand with caching.
 */
export async function getFFmpegInstance(
  onProgress?: (event: TranscodeProgressEvent) => void
): Promise<any> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }

  if (ffmpegLoadingPromise) {
    return ffmpegLoadingPromise;
  }

  ffmpegLoadingPromise = (async () => {
    onProgress?.({
      progress: 5,
      stage: 'loading',
      message: 'Loading high-performance video engine...',
    });

    const ffmpegModule = await import(/* @vite-ignore */ FFMPEG_ESM_URL);
    const FFmpegClass = ffmpegModule.FFmpeg;
    const ffmpeg = new FFmpegClass();

    ffmpeg.on('log', ({ message }: { message: string }) => {
      logger.debug('[FFmpeg WASM]', { message });
    });

    onProgress?.({
      progress: 15,
      stage: 'loading',
      message: 'Loading WebAssembly core from cache...',
    });

    const [classWorkerURL, coreURL, wasmURL] = await Promise.all([
      toCachedBlobURL(`${FFMPEG_BASE_URL}/worker.js`, 'text/javascript'),
      toCachedBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      toCachedBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    ]);

    onProgress?.({
      progress: 25,
      stage: 'loading',
      message: 'Initializing video pipeline...',
    });

    await ffmpeg.load({
      classWorkerURL,
      coreURL,
      wasmURL,
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await ffmpegLoadingPromise;
  } finally {
    ffmpegLoadingPromise = null;
  }
}

/**
 * Ultra-fast video remuxer & transcoder for browser playback.
 *
 * Performance Acceleration Strategy:
 * 1. Cache Check: Instant hit (0ms) if already converted this session.
 * 2. Tier 1 (Pure Stream Copy: <0.3s): Copies both video and audio directly into MP4 without re-encoding.
 * 3. Tier 2 (Video Copy + Audio Transcode: ~1-2s): Keeps video track as-is (H.264/HEVC) and converts AC3/DTS to AAC.
 * 4. Tier 3 (Ultrafast Transcode Fallback): Uses -preset ultrafast -tune zerolatency with multi-threading.
 */
export async function transcodeVideoInBrowser(
  videoUrlOrBlob: string | Blob,
  inputFileName = 'input_video.mkv',
  onProgress?: (event: TranscodeProgressEvent) => void,
  cacheKey?: string
): Promise<{ url: string; blob: Blob }> {
  // Check memory cache
  const key = cacheKey || (typeof videoUrlOrBlob === 'string' ? videoUrlOrBlob : inputFileName);
  if (transcodedBlobCache.has(key)) {
    const cached = transcodedBlobCache.get(key)!;
    onProgress?.({ progress: 100, stage: 'done', message: 'Ready' });
    return cached;
  }

  const ffmpeg = await getFFmpegInstance(onProgress);

  onProgress?.({
    progress: 30,
    stage: 'remuxing',
    message: 'Loading media streams into memory...',
  });

  const fileData = await fetchFileData(videoUrlOrBlob);
  const extMatch = inputFileName.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'mkv';
  const inputName = `in_${Date.now()}.${ext}`;
  const outputName = `out_${Date.now()}.mp4`;

  await ffmpeg.writeFile(inputName, fileData);

  const progressHandler = ({ progress }: { progress: number }) => {
    const rawPercent = Math.max(0, Math.min(100, Math.round((progress || 0) * 100)));
    const mappedPercent = 35 + Math.round(rawPercent * 0.6);
    onProgress?.({
      progress: mappedPercent,
      stage: 'transcoding',
      message: `Accelerated conversion (${rawPercent}%)...`,
    });
  };

  ffmpeg.on('progress', progressHandler);

  try {
    // --- TIER 1: Pure Stream Copy (Instant Remux: <0.3s) ---
    onProgress?.({
      progress: 35,
      stage: 'remuxing',
      message: 'Instant stream remuxing...',
    });

    let execResult = await ffmpeg.exec([
      '-i',
      inputName,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outputName,
    ]);

    // --- TIER 2: Video Copy + Audio Transcode (~1s for AC3/DTS audio in MKV) ---
    if (execResult !== 0) {
      onProgress?.({
        progress: 45,
        stage: 'remuxing',
        message: 'Copying video stream & converting audio track...',
      });

      try {
        await ffmpeg.deleteFile(outputName);
      } catch {
        /* ignore */
      }

      execResult = await ffmpeg.exec([
        '-i',
        inputName,
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outputName,
      ]);
    }

    // --- TIER 3: Ultrafast Video Transcode Fallback ---
    if (execResult !== 0) {
      onProgress?.({
        progress: 55,
        stage: 'transcoding',
        message: 'Ultrafast hardware-tuned transcoding...',
      });

      try {
        await ffmpeg.deleteFile(outputName);
      } catch {
        /* ignore */
      }

      execResult = await ffmpeg.exec([
        '-i',
        inputName,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-tune',
        'zerolatency',
        '-crf',
        '28',
        '-threads',
        '0',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        outputName,
      ]);

      if (execResult !== 0) {
        throw new Error(`FFmpeg conversion failed with exit code ${execResult}`);
      }
    }

    onProgress?.({
      progress: 98,
      stage: 'done',
      message: 'Finalizing playback stream...',
    });

    const outputData = await ffmpeg.readFile(outputName);
    const convertedBlob = new Blob([outputData], { type: 'video/mp4' });
    const convertedUrl = createTrackedBlobUrl(convertedBlob);

    const result = {
      url: convertedUrl,
      blob: convertedBlob,
    };

    setBoundedTranscodeCache(key, result);

    onProgress?.({
      progress: 100,
      stage: 'done',
      message: 'Ready!',
    });

    return result;
  } finally {
    ffmpeg.off('progress', progressHandler);
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      /* ignore */
    }
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      /* ignore */
    }
  }
}
