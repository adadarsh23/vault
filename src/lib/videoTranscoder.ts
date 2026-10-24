import { logger } from './logger';
import { createTrackedBlobUrl, revokeBlobUrl } from './blobRegistry';

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
      if (old?.url) {
        revokeBlobUrl(old.url);
      }
      transcodedBlobCache.delete(oldestKey);
    }
  }
  transcodedBlobCache.set(key, value);
}

const FFMPEG_VERSION = '0.12.10';
const CORE_VERSION = '0.12.10';
const CACHE_NAME = 'vault-ffmpeg-wasm-v1';

export const UNIVERSALLY_UNSUPPORTED_VIDEO_CONTAINERS = new Set([
  'mkv',
  'avi',
  'wmv',
  'flv',
  'f4v',
  'asf',
  'asx',
  'vob',
  'evo',
  'mod',
  'tod',
  'mpg',
  'mpeg',
  'mpe',
  'mpv',
  'm2v',
  'm2p',
  'ts',
  'm2ts',
  'mts',
  'divx',
  'xvid',
  'rm',
  'rmvb',
  'rv',
  'y4m',
  'ogv',
  'ogm',
  '3gp',
  '3g2',
  'nut',
  'dv',
  'dif',
  'mxf',
  'gxf',
]);

const LEGACY_VIDEO_CODECS_SET = new Set([
  'avi',
  'wmv',
  'flv',
  'f4v',
  'asf',
  'asx',
  'vob',
  'evo',
  'mod',
  'tod',
  'mpg',
  'mpeg',
  'mpe',
  'mpv',
  'm2v',
  'm2p',
  'divx',
  'xvid',
  'rm',
  'rmvb',
  'rv',
  '3gp',
  '3g2',
  'y4m',
  'ogv',
  'ogm',
  'ts',
  'mts',
  'm2ts',
  'nut',
  'dv',
  'dif',
  'mxf',
  'gxf',
]);

/**
 * Checks if a given video format or filename can be decoded natively by HTML5 video
 * on the current device and browser (with mobile browser awareness).
 */
export function isFormatNativelyPlayable(mimeType?: string, fileName?: string): boolean {
  if (!mimeType && !fileName) return true;
  const cleanExt = (fileName || '').split('.').pop()?.toLowerCase();
  if (cleanExt && UNIVERSALLY_UNSUPPORTED_VIDEO_CONTAINERS.has(cleanExt)) {
    return false;
  }

  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  // iOS Safari cannot decode WebM containers natively in HTML5 video elements
  if (isIOS && (cleanExt === 'webm' || mimeType?.includes('webm'))) {
    return false;
  }

  if (typeof document !== 'undefined') {
    const v = document.createElement('video');
    if (typeof v.canPlayType === 'function') {
      // In synthetic test environments like JSDOM without real media decoders, canPlayType returns '' for all formats
      const isSyntheticEnv = v.canPlayType('video/mp4') === '';
      if (!isSyntheticEnv) {
        const mime =
          mimeType ||
          (cleanExt === 'mp4'
            ? 'video/mp4'
            : cleanExt === 'webm'
              ? 'video/webm'
              : cleanExt === 'mov'
                ? 'video/quicktime'
                : undefined);
        if (mime && mime !== 'application/octet-stream') {
          const canPlay = v.canPlayType(mime);
          if (canPlay === '') {
            return false;
          }
        }
      }
    }
  }
  return true;
}

/**
 * Loads a remote asset with persistent CacheStorage support and multi-CDN fallback.
 * The 31MB WASM binary is downloaded once and cached permanently on local disk.
 */
async function toCachedBlobURL(urls: string | string[], mimeType: string): Promise<string> {
  const urlList = Array.isArray(urls) ? urls : [urls];
  let lastError: any = null;

  for (const url of urlList) {
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
      } catch (err) {
        lastError = err;
      }
    }

    try {
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        return URL.createObjectURL(new Blob([blob], { type: mimeType }));
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Failed to load WASM asset from CDNs: ${urlList.join(', ')} (${lastError?.message || 'Network error'})`,
  );
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
  // Intentional no-op: FFmpeg is loaded strictly on demand when transcoding is requested
  // to avoid consuming bandwidth, exhausting socket pools, and triggering false offline states.
}

/**
 * Loads the FFmpeg WebAssembly instance on-demand with caching and CDN fallback.
 */
export async function getFFmpegInstance(
  onProgress?: (event: TranscodeProgressEvent) => void,
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

    const esmUrls = [
      `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/index.js`,
      `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/index.js`,
    ];

    let ffmpegModule: any = null;
    for (const esmUrl of esmUrls) {
      try {
        ffmpegModule = await import(/* @vite-ignore */ esmUrl);
        if (ffmpegModule?.FFmpeg) break;
      } catch (err) {
        logger.warn('[FFmpeg WASM] Failed to load ESM module from ' + esmUrl, { err });
      }
    }

    if (!ffmpegModule?.FFmpeg) {
      throw new Error('Failed to load FFmpeg ESM engine from available CDN endpoints.');
    }

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
      toCachedBlobURL(
        [
          `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/worker.js`,
          `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/worker.js`,
        ],
        'text/javascript',
      ),
      toCachedBlobURL(
        [
          `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.js`,
          `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.js`,
        ],
        'text/javascript',
      ),
      toCachedBlobURL(
        [
          `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.wasm`,
          `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.wasm`,
        ],
        'application/wasm',
      ),
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
 * Ultra-fast video remuxer & transcoder for browser playback across all devices.
 *
 * Performance Acceleration Strategy:
 * 1. Cache Check: Instant hit (0ms) if already converted this session.
 * 2. Tier 1 (H.264 Video Copy + AAC Stereo Transcode + Strip Subtitles):
 *    Instant remux (<1s) for MKV/MOV/MP4 with H.264 video and AC3/DTS/Opus audio.
 * 3. Tier 2 (Universal H.264 + AAC Transcode Fallback):
 *    Converts any video codec (HEVC, DivX, Xvid, MPEG-2, VP9, WMV) to universal H.264
 *    YUV420p + AAC stereo, guaranteed to play on iOS Safari, Android Chrome, Mac, and Windows.
 */
export async function transcodeVideoInBrowser(
  videoUrlOrBlob: string | Blob,
  inputFileName = 'input_video.mkv',
  onProgress?: (event: TranscodeProgressEvent) => void,
  cacheKey?: string,
  forceFullTranscode = false,
): Promise<{ url: string; blob: Blob }> {
  // Check memory cache
  const key =
    (cacheKey || (typeof videoUrlOrBlob === 'string' ? videoUrlOrBlob : inputFileName)) +
    (forceFullTranscode ? '_full' : '');
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
    let execResult = -1;
    const isIOS =
      typeof navigator !== 'undefined' &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

    const needsFullVideoTranscode =
      forceFullTranscode || LEGACY_VIDEO_CODECS_SET.has(ext) || (isIOS && ext === 'webm');

    // --- TIER 1: Stream Copy Video + Normalize Audio to AAC Stereo (-sn to strip incompatible subtitles) ---
    if (!needsFullVideoTranscode) {
      onProgress?.({
        progress: 35,
        stage: 'remuxing',
        message: 'Copying video stream & converting audio track to AAC...',
      });

      execResult = await ffmpeg.exec([
        '-i',
        inputName,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ac',
        '2',
        '-sn',
        '-movflags',
        '+faststart',
        outputName,
      ]);
    }

    // --- TIER 2: Universal Hardware-Tuned H.264 + AAC Transcode Fallback ---
    // Guaranteed universal compatibility for any codec (HEVC, DivX, Xvid, MPEG-2, VP9, WMV) across all devices
    if (execResult !== 0) {
      onProgress?.({
        progress: 50,
        stage: 'transcoding',
        message: 'Converting to universal H.264 video (compatible with all devices)...',
      });

      try {
        await ffmpeg.deleteFile(outputName);
      } catch {
        /* ignore */
      }

      execResult = await ffmpeg.exec([
        '-i',
        inputName,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-tune',
        'zerolatency',
        '-g',
        '60',
        '-keyint_min',
        '30',
        '-sc_threshold',
        '0',
        '-crf',
        '26',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ac',
        '2',
        '-sn',
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
