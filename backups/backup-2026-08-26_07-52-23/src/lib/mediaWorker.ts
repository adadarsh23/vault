import type {
  MediaProcessorRequest,
  MediaProcessorResponse,
} from '../workers/media-processor.worker';
import { stripExifInMemory } from './mediaExifScrubber';

export { stripExifInMemory };

let requestIdCounter = 0;

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

/**
 * Offloads thumbnail generation to a background Web Worker.
 * Falls back to main thread canvas if Workers/OffscreenCanvas are unavailable.
 */
export async function generateThumbnailInWorker(
  file: File,
  maxWidth = 300,
  maxHeight = 300,
): Promise<Blob> {
  const worker = createWorker();
  if (!worker) {
    return generateThumbnailMainThread(file, maxWidth, maxHeight);
  }

  const id = `thumb-${Date.now()}-${++requestIdCounter}`;
  const fileBuffer = await file.arrayBuffer();

  try {
    const response = await new Promise<MediaProcessorResponse>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<MediaProcessorResponse>) => {
        if (e.data.id === id) resolve(e.data);
      };
      worker.onerror = (e) => reject(new Error(e.message || 'Media worker thumbnail failed'));

      const request: MediaProcessorRequest = {
        id,
        type: 'GENERATE_THUMBNAIL',
        fileBuffer,
        mimeType: file.type || 'image/jpeg',
        maxWidth,
        maxHeight,
      };
      worker.postMessage(request, [fileBuffer]);
    });

    if (!response.ok || response.type !== 'GENERATE_THUMBNAIL') {
      throw new Error(response.ok === false ? response.error : 'Invalid worker response');
    }

    return new Blob([response.thumbnailBuffer], { type: response.mimeType });
  } catch {
    return generateThumbnailMainThread(file, maxWidth, maxHeight);
  } finally {
    worker.terminate();
  }
}

/**
 * Offloads blurhash computation to a background Web Worker.
 * Falls back to main thread calculation if Workers are unavailable.
 */
export async function generateBlurhashInWorker(file: File): Promise<string | null> {
  const worker = createWorker();
  if (!worker) {
    return null;
  }

  const id = `blur-${Date.now()}-${++requestIdCounter}`;
  const fileBuffer = await file.arrayBuffer();

  try {
    const response = await new Promise<MediaProcessorResponse>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<MediaProcessorResponse>) => {
        if (e.data.id === id) resolve(e.data);
      };
      worker.onerror = (e) => reject(new Error(e.message || 'Media worker blurhash failed'));

      const request: MediaProcessorRequest = {
        id,
        type: 'GENERATE_BLURHASH',
        fileBuffer,
        mimeType: file.type || 'image/jpeg',
      };
      worker.postMessage(request, [fileBuffer]);
    });

    if (!response.ok || response.type !== 'GENERATE_BLURHASH') {
      return null;
    }

    return response.blurhash;
  } catch {
    return null;
  } finally {
    worker.terminate();
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
  const nonCompressableExtensions = new Set([
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

  if (
    !file.type.startsWith('image/') ||
    file.type === 'image/svg+xml' ||
    file.type === 'image/gif' ||
    nonCompressableExtensions.has(ext)
  ) {
    return file;
  }

  const worker = createWorker();
  if (!worker) {
    return file;
  }

  const id = `comp-${Date.now()}-${++requestIdCounter}`;
  const fileBuffer = await file.arrayBuffer();

  try {
    const response = await new Promise<MediaProcessorResponse>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<MediaProcessorResponse>) => {
        if (e.data.id === id) resolve(e.data);
      };
      worker.onerror = (e) => reject(new Error(e.message || 'Media worker compression failed'));

      const request: MediaProcessorRequest = {
        id,
        type: 'COMPRESS_IMAGE',
        fileBuffer,
        mimeType: file.type,
        quality,
        maxWidth,
        maxHeight,
      };
      worker.postMessage(request, [fileBuffer]);
    });

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
  } finally {
    worker.terminate();
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
      let width = img.width;
      let height = img.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
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
  const worker = createWorker();

  if (!worker) {
    const cleanedBuffer = stripExifInMemory(fileBuffer, file.type);
    const mime = file.type || 'image/jpeg';
    const blob = new Blob([cleanedBuffer], { type: mime });
    return new File([blob], file.name, {
      type: mime,
      lastModified: file.lastModified,
    });
  }

  const id = `strip-${Date.now()}-${++requestIdCounter}`;

  try {
    const workerTransferBuffer = fileBuffer.slice(0);
    const response = await new Promise<MediaProcessorResponse>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<MediaProcessorResponse>) => {
        if (e.data.id === id) resolve(e.data);
      };
      worker.onerror = (e) => reject(new Error(e.message || 'Media worker EXIF strip failed'));

      const request: MediaProcessorRequest = {
        id,
        type: 'STRIP_EXIF',
        fileBuffer: workerTransferBuffer,
        mimeType: file.type || 'image/jpeg',
      };
      worker.postMessage(request, [workerTransferBuffer]);
    });

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
  } finally {
    worker.terminate();
  }
}
