import type {
  MediaProcessorRequest,
  MediaProcessorResponse,
} from '../workers/media-processor.worker';
import { stripExifInMemory } from './mediaExifScrubber';

export { stripExifInMemory };

let requestIdCounter = 0;
const WORKER_TIMEOUT_MS = 15_000;

const NON_COMPRESSIBLE_EXTENSIONS = new Set([
  'svg',
  'svgz',
  'gif',
  'apng',
  'ico',
  'cur',
  'psd',
  'raw',
  'cr2',
  'cr3',
  'nef',
  'nrw',
  'arw',
  'sr2',
  'srf',
  'raf',
  'orf',
  'rw2',
  'pef',
  'dng',
  'x3f',
  '3fr',
  'fff',
  'iiq',
  'erf',
  'kdc',
  'mef',
  'mos',
  'mrw',
  'rwl',
  'dcr',
  'bay',
  'gpr',
  'exr',
  'hdr',
  'dds',
  'tif',
  'tiff',
  'tga',
  'pcx',
  'icns',
]);

function createWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('../workers/media-processor.worker.ts', import.meta.url), {
      type: 'module',
    });
  } catch {
    return null;
  }
}

async function executeWorkerTask(
  request: MediaProcessorRequest,
  transferList: Transferable[],
): Promise<MediaProcessorResponse> {
  const worker = createWorker();
  if (!worker) {
    throw new Error('Worker unavailable');
  }

  return new Promise<MediaProcessorResponse>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        worker.terminate();
      } catch {}
      reject(new Error(`Worker request ${request.type} timed out`));
    }, WORKER_TIMEOUT_MS);

    worker.onmessage = (e: MessageEvent<MediaProcessorResponse>) => {
      if (settled) return;
      if (e.data.id === request.id) {
        settled = true;
        clearTimeout(timer);
        try {
          worker.terminate();
        } catch {}
        resolve(e.data);
      }
    };

    worker.onerror = (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        worker.terminate();
      } catch {}
      reject(new Error(e.message || `Media worker failed on ${request.type}`));
    };

    worker.postMessage(request, transferList);
  });
}

/**
 * Offloads thumbnail generation to a background Web Worker.
 * Falls back to main thread canvas if Workers/OffscreenCanvas are unavailable.
 */
export async function generateThumbnailInWorker(
  file: File,
  maxWidth = 300,
  maxHeight = 300,
): Promise<Blob> {
  const id = `thumb-${Date.now()}-${++requestIdCounter}`;
  try {
    const fileBuffer = await file.arrayBuffer();
    const response = await executeWorkerTask(
      {
        id,
        type: 'GENERATE_THUMBNAIL',
        fileBuffer,
        mimeType: file.type || 'image/jpeg',
        maxWidth,
        maxHeight,
      },
      [fileBuffer],
    );

    if (!response.ok || response.type !== 'GENERATE_THUMBNAIL') {
      throw new Error(response.ok === false ? response.error : 'Invalid worker response');
    }

    return new Blob([response.thumbnailBuffer], { type: response.mimeType });
  } catch {
    return generateThumbnailMainThread(file, maxWidth, maxHeight);
  }
}

/**
 * Offloads blurhash computation to a background Web Worker.
 * Falls back to main thread calculation if Workers are unavailable.
 */
export async function generateBlurhashInWorker(file: File): Promise<string | null> {
  const id = `blur-${Date.now()}-${++requestIdCounter}`;
  try {
    const fileBuffer = await file.arrayBuffer();
    const response = await executeWorkerTask(
      {
        id,
        type: 'GENERATE_BLURHASH',
        fileBuffer,
        mimeType: file.type || 'image/jpeg',
      },
      [fileBuffer],
    );

    if (!response.ok || response.type !== 'GENERATE_BLURHASH') {
      return null;
    }

    return response.blurhash;
  } catch {
    return null;
  }
}

/**
 * Offloads file image compression to a background Web Worker.
 * Falls back to original file if Workers/OffscreenCanvas are unavailable or unneeded.
 */
export async function compressFileInWorker(
  file: File,
  quality = 0.8,
  maxWidth = 1920,
  maxHeight = 1080,
): Promise<File> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  if (
    !file.type.startsWith('image/') ||
    file.type === 'image/svg+xml' ||
    file.type === 'image/gif' ||
    NON_COMPRESSIBLE_EXTENSIONS.has(ext)
  ) {
    return file;
  }

  const id = `comp-${Date.now()}-${++requestIdCounter}`;
  try {
    const fileBuffer = await file.arrayBuffer();
    const response = await executeWorkerTask(
      {
        id,
        type: 'COMPRESS_IMAGE',
        fileBuffer,
        mimeType: file.type,
        quality,
        maxWidth,
        maxHeight,
      },
      [fileBuffer],
    );

    if (!response.ok || response.type !== 'COMPRESS_IMAGE') {
      return file;
    }

    const blob = new Blob([response.compressedBuffer], { type: response.mimeType });
    return new File([blob], file.name, {
      type: response.mimeType,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

async function generateThumbnailMainThread(
  file: File,
  maxWidth: number,
  maxHeight: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let width = Math.max(1, img.width);
      let height = Math.max(1, img.height);

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2d context unavailable'));
        img.src = '';
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Thumbnail blob creation failed'));
          img.src = '';
        },
        'image/jpeg',
        0.8,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      img.src = '';
      reject(new Error('Image loading failed'));
    };

    img.src = url;
  });
}

/**
 * Strips EXIF metadata and GPS coordinates from a photo in a background Web Worker,
 * with deterministic in-memory fallback to guarantee zero unscrubbed leaks.
 */
export async function stripExifInWorker(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  const fileBuffer = await file.arrayBuffer();
  const id = `strip-${Date.now()}-${++requestIdCounter}`;

  try {
    const workerTransferBuffer = fileBuffer.slice(0);
    const response = await executeWorkerTask(
      {
        id,
        type: 'STRIP_EXIF',
        fileBuffer: workerTransferBuffer,
        mimeType: file.type || 'image/jpeg',
      },
      [workerTransferBuffer],
    );

    if (!response.ok || response.type !== 'STRIP_EXIF') {
      const cleanedBuffer = stripExifInMemory(fileBuffer, file.type);
      const mime = file.type || 'image/jpeg';
      const blob = new Blob([cleanedBuffer], { type: mime });
      return new File([blob], file.name, {
        type: mime,
        lastModified: file.lastModified,
      });
    }

    const blob = new Blob([response.cleanedBuffer], { type: response.mimeType });
    return new File([blob], file.name, {
      type: response.mimeType,
      lastModified: file.lastModified,
    });
  } catch {
    const cleanedBuffer = stripExifInMemory(fileBuffer, file.type);
    const mime = file.type || 'image/jpeg';
    const blob = new Blob([cleanedBuffer], { type: mime });
    return new File([blob], file.name, {
      type: mime,
      lastModified: file.lastModified,
    });
  }
}
