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
    }
  | {
      id: string;
      type: 'STRIP_EXIF';
      fileBuffer: ArrayBuffer;
      mimeType: string;
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
  | {
      id: string;
      ok: true;
      type: 'STRIP_EXIF';
      cleanedBuffer: ArrayBuffer;
      mimeType: string;
    }
  | { id: string; ok: false; error: string };

/**
 * Strips EXIF/GPS segments, Camera Model, Device Serial Numbers, Lens specifications,
 * XMP, IPTC, and Comment markers (APP1..APP15, COM) directly from JPEG binaries.
 */
export function stripJpegExifBinary(buffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
    return buffer;
  }

  const pieces: Uint8Array[] = [];
  pieces.push(new Uint8Array(buffer, 0, 2)); // SOI (0xFFD8)

  let offset = 2;
  while (offset < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) {
      pieces.push(new Uint8Array(buffer, offset));
      break;
    }

    // Skip any consecutive 0xFF padding bytes
    while (offset < view.byteLength && view.getUint8(offset) === 0xff) {
      offset++;
    }

    if (offset >= view.byteLength) break;
    const markerByte = view.getUint8(offset);
    const marker = 0xff00 | markerByte;
    offset++;

    // SOS (Start of Scan - 0xFFDA) - rest is entropy-coded image data
    if (marker === 0xffda) {
      pieces.push(new Uint8Array(buffer, offset - 2));
      break;
    }

    // EOI (End of Image - 0xFFD9)
    if (marker === 0xffd9) {
      pieces.push(new Uint8Array(buffer, offset - 2, 2));
      break;
    }

    // Restart markers (RST0..RST7) without payload length
    if (marker >= 0xffd0 && marker <= 0xffd7) {
      pieces.push(new Uint8Array(buffer, offset - 2, 2));
      continue;
    }

    if (offset + 2 > view.byteLength) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > view.byteLength) break;

    // Filter out metadata markers:
    // APP1 (0xFFE1: EXIF, GPS IFD, Camera Make/Model, Device Serials, XMP)
    // APP2 (0xFFE2: ICC, FlashPix)
    // APP3-APP12 (0xFFE3-0xFFEC: Camera maker notes, private hardware tags)
    // APP13 (0xFFED: IPTC, Photoshop IRB)
    // APP14-APP15 (0xFFEE-0xFFEF: Adobe/Extended metadata)
    // COM (0xFFFE: User comment / caption text)
    const isMetadataMarker = (marker >= 0xffe1 && marker <= 0xffef) || marker === 0xfffe;

    if (!isMetadataMarker) {
      pieces.push(new Uint8Array(buffer, offset - 2, 2 + length));
    }

    offset += length;
  }

  const totalLength = pieces.reduce((sum, p) => sum + p.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const piece of pieces) {
    result.set(piece, pos);
    pos += piece.byteLength;
  }
  return result.buffer;
}

/**
 * Strips EXIF (eXIf), text (tEXt, zTXt, iTXt), and modification timestamp (tIME)
 * chunks directly from PNG binaries.
 */
export function stripPngMetadataBinary(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  chunks.push(bytes.subarray(0, 8)); // PNG Signature

  const metadataChunkNames = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
  let offset = 8;
  const view = new DataView(buffer);

  while (offset + 12 <= bytes.length) {
    const chunkLength = view.getUint32(offset);
    const chunkType = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );

    const totalChunkLength = 12 + chunkLength;
    if (offset + totalChunkLength > bytes.length) {
      break;
    }

    if (!metadataChunkNames.has(chunkType)) {
      chunks.push(bytes.subarray(offset, offset + totalChunkLength));
    }

    offset += totalChunkLength;
    if (chunkType === 'IEND') {
      break;
    }
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return result.buffer;
}

/**
 * Strips EXIF and XMP chunks from WebP RIFF containers.
 */
export function stripWebpMetadataBinary(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12) return buffer;

  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (riff !== 'RIFF' || webp !== 'WEBP') {
    return buffer;
  }

  const view = new DataView(buffer);
  const chunks: Uint8Array[] = [];
  let offset = 12;

  while (offset + 8 <= bytes.length) {
    const chunkType = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const paddedSize = chunkSize + (chunkSize % 2);
    const totalChunkSize = 8 + paddedSize;

    if (offset + 8 + chunkSize > bytes.length) {
      break;
    }

    if (chunkType !== 'EXIF' && chunkType !== 'XMP ') {
      let chunkData = bytes.subarray(offset, Math.min(offset + totalChunkSize, bytes.length));
      if (chunkType === 'VP8X' && chunkData.length >= 16) {
        chunkData = new Uint8Array(chunkData);
        chunkData[8] = chunkData[8] & ~0x08;
        chunkData[8] = chunkData[8] & ~0x04;
      }
      chunks.push(chunkData);
    }

    offset += totalChunkSize;
  }

  const payloadLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const totalLength = 12 + payloadLength;
  const result = new Uint8Array(totalLength);

  result.set(bytes.subarray(0, 4), 0);
  const outView = new DataView(result.buffer);
  outView.setUint32(4, totalLength - 8, true);
  result.set(bytes.subarray(8, 12), 8);

  let pos = 12;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.byteLength;
  }

  return result.buffer;
}

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
    if (req.type === 'STRIP_EXIF') {
      const isJpeg =
        req.mimeType === 'image/jpeg' ||
        req.mimeType === 'image/jpg' ||
        req.mimeType === 'image/pjpeg';
      const isPng = req.mimeType === 'image/png';
      const isWebp = req.mimeType === 'image/webp';

      if (isJpeg) {
        const cleanedBuffer = stripJpegExifBinary(req.fileBuffer);
        const response: MediaProcessorResponse = {
          id: req.id,
          ok: true,
          type: 'STRIP_EXIF',
          cleanedBuffer,
          mimeType: 'image/jpeg',
        };
        (self as any).postMessage(response, [cleanedBuffer]);
        return;
      }

      if (isPng) {
        const cleanedBuffer = stripPngMetadataBinary(req.fileBuffer);
        const response: MediaProcessorResponse = {
          id: req.id,
          ok: true,
          type: 'STRIP_EXIF',
          cleanedBuffer,
          mimeType: 'image/png',
        };
        (self as any).postMessage(response, [cleanedBuffer]);
        return;
      }

      if (isWebp) {
        const cleanedBuffer = stripWebpMetadataBinary(req.fileBuffer);
        const response: MediaProcessorResponse = {
          id: req.id,
          ok: true,
          type: 'STRIP_EXIF',
          cleanedBuffer,
          mimeType: 'image/webp',
        };
        (self as any).postMessage(response, [cleanedBuffer]);
        return;
      }
    }

    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      throw new Error(
        'OffscreenCanvas or createImageBitmap is not supported in Web Worker environment',
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

    if (req.type === 'STRIP_EXIF') {
      const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d canvas context');

      ctx.drawImage(imageBitmap, 0, 0, imageBitmap.width, imageBitmap.height);
      const targetMime = req.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
      const cleanBlob = await canvas.convertToBlob({ type: targetMime, quality: 0.98 });
      const cleanedBuffer = await cleanBlob.arrayBuffer();

      const response: MediaProcessorResponse = {
        id: req.id,
        ok: true,
        type: 'STRIP_EXIF',
        cleanedBuffer,
        mimeType: targetMime,
      };
      (self as any).postMessage(response, [cleanedBuffer]);
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
