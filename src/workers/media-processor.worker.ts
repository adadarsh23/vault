// Web Worker for offloading image thumbnail generation, blurhash computation, and file compression
// to background threads to prevent UI freezing during bulk file imports.

export type MediaProcessorRequest =
  | {
      id: string;
      type: 'GENERATE_THUMBNAIL';
      fileBuffer: ArrayBuffer;
      mimeType: string;
      maxWidth?: number;
      maxHeight?: number;
    }
  | {
      id: string;
      type: 'GENERATE_BLURHASH';
      fileBuffer: ArrayBuffer;
      mimeType: string;
      componentX?: number;
      componentY?: number;
    }
  | {
      id: string;
      type: 'COMPRESS_IMAGE';
      fileBuffer: ArrayBuffer;
      mimeType: string;
      quality?: number;
      maxWidth?: number;
      maxHeight?: number;
    };

export type MediaProcessorResponse =
  | {
      id: string;
      ok: true;
      type: 'GENERATE_THUMBNAIL';
      thumbnailBuffer: ArrayBuffer;
      mimeType: string;
    }
  | { id: string; ok: true; type: 'GENERATE_BLURHASH'; blurhash: string }
  | {
      id: string;
      ok: true;
      type: 'COMPRESS_IMAGE';
      compressedBuffer: ArrayBuffer;
      mimeType: string;
    }
  | { id: string; ok: false; error: string };

function encode83(value: number, length: number): string {
  const characters =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
  let result = '';
  for (let i = 1; i <= length; i++) {
    const digit = Math.floor(value / Math.pow(83, length - i)) % 83;
    result += characters[digit];
  }
  return result;
}

/**
 * Calculates a lightweight blurhash representation for an ImageData array.
 */
function calculateBlurhash(imageData: ImageData, compX = 4, compY = 3): string {
  const { width, height, data } = imageData;
  const numPixels = width * height;
  const factors: Array<[number, number, number]> = [];

  for (let y = 0; y < compY; y++) {
    for (let x = 0; x < compX; x++) {
      let r = 0,
        g = 0,
        b = 0;
      const normalisation = x === 0 && y === 0 ? 1 : 2;

      for (let i = 0; i < numPixels; i++) {
        const px = i % width;
        const py = Math.floor(i / width);
        const basis = Math.cos((Math.PI * x * px) / width) * Math.cos((Math.PI * y * py) / height);
        const idx = i * 4;
        r += basis * Math.pow(data[idx] / 255, 2.2);
        g += basis * Math.pow(data[idx + 1] / 255, 2.2);
        b += basis * Math.pow(data[idx + 2] / 255, 2.2);
      }

      const scale = normalisation / numPixels;
      factors.push([r * scale, g * scale, b * scale]);
    }
  }

  const dc = factors[0];
  const ac = factors.slice(1);

  let hash = '';
  const sizeFlag = compX - 1 + (compY - 1) * 9;
  hash += encode83(sizeFlag, 1);

  let maxAc = 0;
  if (ac.length > 0) {
    for (const factor of ac) {
      maxAc = Math.max(maxAc, Math.abs(factor[0]), Math.abs(factor[1]), Math.abs(factor[2]));
    }
    const quantisedMaxAc = Math.floor(Math.max(0, Math.min(82, Math.floor(maxAc * 166 - 0.5))));
    hash += encode83(quantisedMaxAc, 1);
  } else {
    hash += encode83(0, 1);
  }

  const linearToSrgb = (v: number) =>
    v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;

  const quantiseDc = (val: number) => {
    const srgb = linearToSrgb(Math.max(0, Math.min(1, val)));
    return (
      (Math.floor(srgb * 255) << 16) +
      (Math.floor(linearToSrgb(Math.max(0, Math.min(1, val))) * 255) << 8) +
      Math.floor(srgb * 255)
    );
  };

  hash += encode83(quantiseDc(dc[0]), 4);
  return hash;
}

self.onmessage = async (event: MessageEvent<MediaProcessorRequest>) => {
  const req = event.data;

  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      throw new Error(
        'OffscreenCanvas or createImageBitmap is not supported in Web Worker environment'
      );
    }

    const blob = new Blob([req.fileBuffer], { type: req.mimeType });
    const imageBitmap = await createImageBitmap(blob);

    if (req.type === 'GENERATE_THUMBNAIL') {
      const maxWidth = req.maxWidth || 300;
      const maxHeight = req.maxHeight || 300;

      let width = imageBitmap.width;
      let height = imageBitmap.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d canvas context');

      ctx.drawImage(imageBitmap, 0, 0, width, height);
      const thumbnailBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
      const thumbnailBuffer = await thumbnailBlob.arrayBuffer();

      const response: MediaProcessorResponse = {
        id: req.id,
        ok: true,
        type: 'GENERATE_THUMBNAIL',
        thumbnailBuffer,
        mimeType: 'image/jpeg',
      };
      (self as any).postMessage(response, [thumbnailBuffer]);
      imageBitmap.close();
      return;
    }

    if (req.type === 'GENERATE_BLURHASH') {
      const sampleWidth = 32;
      const sampleHeight = 32;
      const canvas = new OffscreenCanvas(sampleWidth, sampleHeight);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d canvas context');

      ctx.drawImage(imageBitmap, 0, 0, sampleWidth, sampleHeight);
      const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);

      const blurhash = calculateBlurhash(imageData, req.componentX || 4, req.componentY || 3);

      const response: MediaProcessorResponse = {
        id: req.id,
        ok: true,
        type: 'GENERATE_BLURHASH',
        blurhash,
      };
      (self as any).postMessage(response);
      imageBitmap.close();
      return;
    }

    if (req.type === 'COMPRESS_IMAGE') {
      const maxWidth = req.maxWidth || 1920;
      const maxHeight = req.maxHeight || 1080;
      const quality = req.quality || 0.8;

      let width = imageBitmap.width;
      let height = imageBitmap.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d canvas context');

      ctx.drawImage(imageBitmap, 0, 0, width, height);
      const targetMime = req.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      const compressedBlob = await canvas.convertToBlob({ type: targetMime, quality });
      const compressedBuffer = await compressedBlob.arrayBuffer();

      const response: MediaProcessorResponse = {
        id: req.id,
        ok: true,
        type: 'COMPRESS_IMAGE',
        compressedBuffer,
        mimeType: targetMime,
      };
      (self as any).postMessage(response, [compressedBuffer]);
      imageBitmap.close();
      return;
    }
  } catch (err: any) {
    const errorResponse: MediaProcessorResponse = {
      id: req.id,
      ok: false,
      error: err.message || 'Worker processing failed',
    };
    (self as any).postMessage(errorResponse);
  }
};
