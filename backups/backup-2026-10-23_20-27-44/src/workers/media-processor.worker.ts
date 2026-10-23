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
  if (!buffer || buffer.byteLength < 4) {
    return buffer;
  }

  const view = new DataView(buffer);
  if (view.getUint16(0) !== 0xffd8) {
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

    if (offset + 2 > view.byteLength) {
      // Truncated header segment - preserve original buffer to prevent image corruption
      return buffer;
    }

    const length = view.getUint16(offset);
    if (length < 2 || offset + length > view.byteLength) {
      return buffer;
    }

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
  if (!buffer || buffer.byteLength < 8) {
    return buffer;
  }

  const bytes = new Uint8Array(buffer);
  if (
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
      return buffer; // Truncated chunk: preserve original buffer safely
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
  if (!buffer || buffer.byteLength < 12) {
    return buffer;
  }

  const bytes = new Uint8Array(buffer);
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
      return buffer; // Corrupted chunk boundary: fall back to original
    }

    if (chunkType !== 'EXIF' && chunkType !== 'XMP ') {
      let chunkData = bytes.subarray(offset, Math.min(offset + totalChunkSize, bytes.length));
      if (chunkType === 'VP8X' && chunkData.length >= 16) {
        chunkData = new Uint8Array(chunkData);
        chunkData[8] = chunkData[8] & ~0x08; // Clear EXIF flag
        chunkData[8] = chunkData[8] & ~0x04; // Clear XMP flag
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

const BASE83_CHARS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

function encode83(value: number, length: number): string {
  let result = '';
  for (let i = 1; i <= length; i++) {
    const digit = Math.floor(value / Math.pow(83, length - i)) % 83;
    result += BASE83_CHARS[digit];
  }
  return result;
}

// Precomputed sRGB-to-Linear conversion LUT (0-255)
const SRGB_TO_LINEAR_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  SRGB_TO_LINEAR_LUT[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  return v <= 0.0031308
    ? Math.round(v * 12.92 * 255)
    : Math.round((1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
}

function signPow(val: number, exp: number): number {
  return Math.sign(val) * Math.pow(Math.abs(val), exp);
}

/**
 * Calculates a fully specification-compliant BlurHash representation for an ImageData array
 * with precomputed cosine matrices and lookup tables for high performance.
 */
function calculateBlurhash(imageData: ImageData, compX = 4, compY = 3): string {
  const { width, height, data } = imageData;
  const numPixels = width * height;
  if (numPixels === 0) return 'L00000fQ00fQ00fQ00fQ';

  const safeCompX = Math.max(1, Math.min(9, compX));
  const safeCompY = Math.max(1, Math.min(9, compY));

  // Convert pixel channels to linear representation once
  const linearR = new Float32Array(numPixels);
  const linearG = new Float32Array(numPixels);
  const linearB = new Float32Array(numPixels);

  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    linearR[i] = SRGB_TO_LINEAR_LUT[data[idx] & 255];
    linearG[i] = SRGB_TO_LINEAR_LUT[data[idx + 1] & 255];
    linearB[i] = SRGB_TO_LINEAR_LUT[data[idx + 2] & 255];
  }

  // Precompute 1D cosine basis tables
  const cosX: Float64Array[] = [];
  for (let x = 0; x < safeCompX; x++) {
    const table = new Float64Array(width);
    for (let px = 0; px < width; px++) {
      table[px] = Math.cos((Math.PI * x * px) / width);
    }
    cosX.push(table);
  }

  const cosY: Float64Array[] = [];
  for (let y = 0; y < safeCompY; y++) {
    const table = new Float64Array(height);
    for (let py = 0; py < height; py++) {
      table[py] = Math.cos((Math.PI * y * py) / height);
    }
    cosY.push(table);
  }

  const factors: Array<[number, number, number]> = [];

  for (let y = 0; y < safeCompY; y++) {
    const tableY = cosY[y];
    for (let x = 0; x < safeCompX; x++) {
      const tableX = cosX[x];
      let r = 0;
      let g = 0;
      let b = 0;
      const normalisation = x === 0 && y === 0 ? 1 : 2;

      let pixelIdx = 0;
      for (let py = 0; py < height; py++) {
        const basisY = tableY[py];
        for (let px = 0; px < width; px++) {
          const basis = tableX[px] * basisY;
          r += basis * linearR[pixelIdx];
          g += basis * linearG[pixelIdx];
          b += basis * linearB[pixelIdx];
          pixelIdx++;
        }
      }

      const scale = normalisation / numPixels;
      factors.push([r * scale, g * scale, b * scale]);
    }
  }

  const dc = factors[0];
  const ac = factors.slice(1);

  let hash = '';
  const sizeFlag = safeCompX - 1 + (safeCompY - 1) * 9;
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

  // Correctly encode full DC RGB components
  const quantiseDc = (val: number) => {
    const srgb = linearToSrgb(val);
    return Math.round(srgb) & 0xff;
  };
  const dcR = quantiseDc(dc[0]);
  const dcG = quantiseDc(dc[1]);
  const dcB = quantiseDc(dc[2]);
  const dcValue = (dcR << 16) + (dcG << 8) + dcB;
  hash += encode83(dcValue, 4);

  // Correctly encode AC components according to the BlurHash specification
  const maxVal = maxAc === 0 ? 1 : maxAc;
  for (const factor of ac) {
    const quantR = Math.floor(
      Math.max(0, Math.min(18, Math.floor(signPow(factor[0] / maxVal, 0.5) * 9 + 9.5))),
    );
    const quantG = Math.floor(
      Math.max(0, Math.min(18, Math.floor(signPow(factor[1] / maxVal, 0.5) * 9 + 9.5))),
    );
    const quantB = Math.floor(
      Math.max(0, Math.min(18, Math.floor(signPow(factor[2] / maxVal, 0.5) * 9 + 9.5))),
    );
    const acValue = quantR * 19 * 19 + quantG * 19 + quantB;
    hash += encode83(acValue, 2);
  }

  return hash;
}

/**
 * Detect image format from magic bytes or mime fallback
 */
function detectImageFormat(
  buffer: ArrayBuffer,
  mimeType: string,
): 'jpeg' | 'png' | 'webp' | 'other' {
  if (buffer && buffer.byteLength >= 2) {
    const bytes = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
    if (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return 'png';
    }
    if (
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return 'webp';
    }
  }

  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpeg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'other';
}

self.onmessage = async (event: MessageEvent<MediaProcessorRequest>) => {
  if (!event.data || typeof event.data !== 'object') {
    return;
  }

  const req = event.data;
  let imageBitmap: ImageBitmap | null = null;
  let canvas: OffscreenCanvas | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | null = null;

  try {
    if (!req.id || !req.type) {
      throw new Error('Invalid worker request: missing id or type');
    }

    if (req.type === 'STRIP_EXIF') {
      const format = detectImageFormat(req.fileBuffer, req.mimeType);

      if (format === 'jpeg') {
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

      if (format === 'png') {
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

      if (format === 'webp') {
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

    if (
      !req.fileBuffer ||
      !(req.fileBuffer instanceof ArrayBuffer) ||
      req.fileBuffer.byteLength === 0
    ) {
      throw new Error('fileBuffer is empty or invalid ArrayBuffer');
    }

    const blob = new Blob([req.fileBuffer], { type: req.mimeType || 'image/jpeg' });
    imageBitmap = await createImageBitmap(blob);

    if (req.type === 'GENERATE_THUMBNAIL') {
      const maxWidth = Math.max(16, req.maxWidth || 300);
      const maxHeight = Math.max(16, req.maxHeight || 300);

      let width = imageBitmap.width;
      let height = imageBitmap.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }

      canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d canvas context');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imageBitmap, 0, 0, width, height);

      // Close source image bitmap immediately after drawing
      imageBitmap.close();
      imageBitmap = null;

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
      return;
    }

    if (req.type === 'GENERATE_BLURHASH') {
      const sampleWidth = 32;
      const sampleHeight = 32;
      canvas = new OffscreenCanvas(sampleWidth, sampleHeight);
      ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Could not get 2d canvas context');

      ctx.drawImage(imageBitmap, 0, 0, sampleWidth, sampleHeight);
      const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);

      // Close source bitmap
      imageBitmap.close();
      imageBitmap = null;

      const blurhash = calculateBlurhash(imageData, req.componentX || 4, req.componentY || 3);

      const response: MediaProcessorResponse = {
        id: req.id,
        ok: true,
        type: 'GENERATE_BLURHASH',
        blurhash,
      };
      (self as any).postMessage(response);
      return;
    }

    if (req.type === 'COMPRESS_IMAGE') {
      const maxWidth = Math.max(32, req.maxWidth || 1920);
      const maxHeight = Math.max(32, req.maxHeight || 1080);
      const quality = Math.max(0.05, Math.min(1.0, req.quality || 0.8));

      let width = imageBitmap.width;
      let height = imageBitmap.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }

      canvas = new OffscreenCanvas(width, height);
      ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d canvas context');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imageBitmap, 0, 0, width, height);

      imageBitmap.close();
      imageBitmap = null;

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
      return;
    }

    if (req.type === 'STRIP_EXIF') {
      canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
      ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get 2d canvas context');

      ctx.drawImage(imageBitmap, 0, 0, imageBitmap.width, imageBitmap.height);

      imageBitmap.close();
      imageBitmap = null;

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
      return;
    }
  } catch (err: any) {
    const errorResponse: MediaProcessorResponse = {
      id: req?.id || 'unknown',
      ok: false,
      error: err?.message || 'Worker processing failed',
    };
    (self as any).postMessage(errorResponse);
  } finally {
    // Guarantees zero memory leaks on all code paths
    if (imageBitmap) {
      imageBitmap.close();
      imageBitmap = null;
    }
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas = null;
    }
    ctx = null;
  }
};

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('error', (event: Event) => {
    const errorEvent = event as ErrorEvent;
    (self as any).postMessage({
      id: 'unknown',
      ok: false,
      error: errorEvent.message || 'Media processor worker uncaught runtime error',
    });
  });

  self.addEventListener('unhandledrejection', (event: Event) => {
    const rejectionEvent = event as PromiseRejectionEvent;
    (self as any).postMessage({
      id: 'unknown',
      ok: false,
      error:
        rejectionEvent.reason?.message || 'Unhandled promise rejection in media processor worker',
    });
  });
}
