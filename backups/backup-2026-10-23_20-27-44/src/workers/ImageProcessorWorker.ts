// ImageProcessorWorker.ts
// Web Worker for enterprise profile photo processing pipeline

export interface ImageProcessorRequest {
  id: string;
  type: 'PROCESS_IMAGE';
  fileBuffer: ArrayBuffer;
  fileName: string;
  mimeType: string;
  targetSize?: number; // default 400
  quality?: number; // default 0.78
}

export interface ImageProcessorSuccessResponse {
  id: string;
  ok: true;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  mimeType: string;
  blurHash: string;
  fileSize: number;
}

export interface ImageProcessorErrorResponse {
  id: string;
  ok: false;
  error: string;
}

export type ImageProcessorResponse = ImageProcessorSuccessResponse | ImageProcessorErrorResponse;

// Base83 Encoding for BlurHash
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

// Precomputed sRGB-to-Linear conversion table (0-255)
// Eliminates tens of thousands of Math.pow calls per image
const SRGB_TO_LINEAR_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  SRGB_TO_LINEAR_LUT[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function srgbToLinearFast(byteValue: number): number {
  return SRGB_TO_LINEAR_LUT[byteValue & 255];
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
 * Ultra-fast BlurHash encoder with precomputed cosine matrices and linear lookups.
 */
function encodeBlurHash(imageData: ImageData, componentX = 4, componentY = 3): string {
  const { width, height, data } = imageData;
  const numPixels = width * height;
  if (numPixels === 0) return 'L00000fQ00fQ00fQ00fQ';

  // Pre-convert pixel channels to linear float representation once
  const linearR = new Float32Array(numPixels);
  const linearG = new Float32Array(numPixels);
  const linearB = new Float32Array(numPixels);

  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    linearR[i] = srgbToLinearFast(data[idx]);
    linearG[i] = srgbToLinearFast(data[idx + 1]);
    linearB[i] = srgbToLinearFast(data[idx + 2]);
  }

  // Precompute 1D cosine basis tables for X and Y components
  const cosX: Float64Array[] = [];
  for (let x = 0; x < componentX; x++) {
    const table = new Float64Array(width);
    for (let px = 0; px < width; px++) {
      table[px] = Math.cos((Math.PI * x * px) / width);
    }
    cosX.push(table);
  }

  const cosY: Float64Array[] = [];
  for (let y = 0; y < componentY; y++) {
    const table = new Float64Array(height);
    for (let py = 0; py < height; py++) {
      table[py] = Math.cos((Math.PI * y * py) / height);
    }
    cosY.push(table);
  }

  const factors: Array<[number, number, number]> = [];

  for (let y = 0; y < componentY; y++) {
    const tableY = cosY[y];
    for (let x = 0; x < componentX; x++) {
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
  const sizeFlag = componentX - 1 + (componentY - 1) * 9;
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

  // Encode DC
  const quantiseDc = (val: number) => {
    const srgb = linearToSrgb(val);
    return Math.round(srgb) & 0xff;
  };
  const dcR = quantiseDc(dc[0]);
  const dcG = quantiseDc(dc[1]);
  const dcB = quantiseDc(dc[2]);
  const dcValue = (dcR << 16) + (dcG << 8) + dcB;
  hash += encode83(dcValue, 4);

  // Encode AC
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
 * Validates raw binary signatures (Magic Bytes)
 */
function validateMagicBytes(
  buffer: ArrayBuffer,
  mimeType: string,
): { valid: boolean; detectedFormat: string } {
  if (!buffer || buffer.byteLength < 4) {
    return { valid: false, detectedFormat: 'empty-or-truncated' };
  }

  const bytes = new Uint8Array(buffer, 0, Math.min(32, buffer.byteLength));

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, detectedFormat: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { valid: true, detectedFormat: 'image/png' };
  }

  // GIF: GIF87a or GIF89a
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { valid: true, detectedFormat: 'image/gif' };
  }

  // BMP / DIB: BM
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { valid: true, detectedFormat: 'image/bmp' };
  }

  // WebP: RIFF ... WEBP (bytes 0-3 = 'RIFF', bytes 8-11 = 'WEBP')
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
    return { valid: true, detectedFormat: 'image/webp' };
  }

  // TIFF / RAW (CR2, NEF, ARW, DNG, PEF, ORF, RW2, etc.): II*\0 or MM\0*
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
  ) {
    return { valid: true, detectedFormat: 'image/tiff' };
  }

  // Fuji RAF
  if (bytes[0] === 0x46 && bytes[1] === 0x55 && bytes[2] === 0x4a && bytes[3] === 0x49) {
    return { valid: true, detectedFormat: 'image/x-fuji-raf' };
  }

  // HEIC / HEIF / AVIF / CR3: ftyp box at offset 4
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
    if (['avif', 'avis'].some((b) => brand.startsWith(b))) {
      return { valid: true, detectedFormat: 'image/avif' };
    }
    if (['heic', 'heix', 'hevc', 'hevx', 'heif', 'mif1', 'msf1'].some((b) => brand.startsWith(b))) {
      return { valid: true, detectedFormat: 'image/heic' };
    }
    return { valid: true, detectedFormat: 'image/heif' };
  }

  // ICO / CUR
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    (bytes[2] === 0x01 || bytes[2] === 0x02) &&
    bytes[3] === 0x00
  ) {
    return { valid: true, detectedFormat: 'image/x-icon' };
  }

  // Photoshop PSD: 8BPS
  if (bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53) {
    return { valid: true, detectedFormat: 'image/vnd.adobe.photoshop' };
  }

  // JPEG 2000 (JP2, J2K)
  if (
    (bytes.length >= 6 &&
      bytes[0] === 0x00 &&
      bytes[1] === 0x00 &&
      bytes[2] === 0x00 &&
      bytes[3] === 0x0c &&
      bytes[4] === 0x6a &&
      bytes[5] === 0x50) ||
    (bytes[0] === 0xff && bytes[1] === 0x4f && bytes[2] === 0xff && bytes[3] === 0x51)
  ) {
    return { valid: true, detectedFormat: 'image/jp2' };
  }

  // JPEG XR (JXR, HDP, WDP)
  if (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0xbc) {
    return { valid: true, detectedFormat: 'image/jxr' };
  }

  // DDS
  if (bytes[0] === 0x44 && bytes[1] === 0x44 && bytes[2] === 0x53 && bytes[3] === 0x20) {
    return { valid: true, detectedFormat: 'image/vnd-ms.dds' };
  }

  // OpenEXR
  if (bytes[0] === 0x76 && bytes[1] === 0x2f && bytes[2] === 0x31 && bytes[3] === 0x01) {
    return { valid: true, detectedFormat: 'image/x-exr' };
  }

  // Radiance HDR
  if (bytes[0] === 0x23 && bytes[1] === 0x3f && (bytes[2] === 0x52 || bytes[2] === 0x72)) {
    return { valid: true, detectedFormat: 'image/vnd.radiance' };
  }

  // Apple ICNS
  if (bytes[0] === 0x69 && bytes[1] === 0x63 && bytes[2] === 0x6e && bytes[3] === 0x73) {
    return { valid: true, detectedFormat: 'image/x-icns' };
  }

  // SVGZ (GZIP)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return { valid: true, detectedFormat: 'image/svg+xml' };
  }

  // SVG: Inspect text content for <svg tag
  try {
    const textDecoder = new TextDecoder('utf-8');
    const sampleText = textDecoder
      .decode(new Uint8Array(buffer, 0, Math.min(1024, buffer.byteLength)))
      .trim();
    if (sampleText.toLowerCase().includes('<svg') || sampleText.toLowerCase().startsWith('<?xml')) {
      return { valid: true, detectedFormat: 'image/svg+xml' };
    }
  } catch {
    // Non-decodable text
  }

  // Fallback: If mimeType is an image format, allow if buffer isn't completely zeroed out
  if (mimeType && mimeType.startsWith('image/')) {
    return { valid: true, detectedFormat: mimeType };
  }

  return { valid: false, detectedFormat: 'unknown' };
}

/**
 * Sanitizes SVG code to prevent script execution and XML entity expansion attacks
 */
function sanitizeSvgString(svgCode: string): string {
  return svgCode
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!ENTITY[\s\S]*?>/gi, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript:/gi, 'forbidden:');
}

self.onmessage = async (event: MessageEvent<ImageProcessorRequest>) => {
  if (!event.data || typeof event.data !== 'object') {
    return;
  }

  const { id, type, fileBuffer, mimeType, targetSize = 400, quality = 0.78 } = event.data;

  if (type !== 'PROCESS_IMAGE') {
    return;
  }

  let imageBitmap: ImageBitmap | null = null;
  let canvas: OffscreenCanvas | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | null = null;
  let blurCanvas: OffscreenCanvas | null = null;
  let blurCtx: OffscreenCanvasRenderingContext2D | null = null;

  try {
    if (!fileBuffer || !(fileBuffer instanceof ArrayBuffer) || fileBuffer.byteLength === 0) {
      throw new Error('Image fileBuffer is invalid or empty.');
    }

    // 1. Magic Byte Validation
    const magicValidation = validateMagicBytes(fileBuffer, mimeType);
    if (!magicValidation.valid) {
      const response: ImageProcessorErrorResponse = {
        id,
        ok: false,
        error: `Invalid image signature or unsupported format (${magicValidation.detectedFormat}).`,
      };
      self.postMessage(response);
      return;
    }

    let imageSource: ImageBitmap | Blob;

    if (magicValidation.detectedFormat === 'image/svg+xml') {
      const textDecoder = new TextDecoder('utf-8');
      const rawSvg = textDecoder.decode(fileBuffer);
      const cleanSvg = sanitizeSvgString(rawSvg);
      imageSource = new Blob([cleanSvg], { type: 'image/svg+xml' });
    } else {
      imageSource = new Blob([fileBuffer], { type: magicValidation.detectedFormat });
    }

    // Create ImageBitmap to measure dimensions & check decompression bomb limits
    try {
      imageBitmap = await createImageBitmap(imageSource);
    } catch (err) {
      const response: ImageProcessorErrorResponse = {
        id,
        ok: false,
        error: `Failed to decode image bitmap: ${(err as Error).message}`,
      };
      self.postMessage(response);
      return;
    }

    const { width, height } = imageBitmap;
    const totalPixels = width * height;

    // 2. Decompression Bomb & Bounds Protection (SLA: Max 4096x4096px or 25 MP)
    if (width <= 0 || height <= 0 || width > 4096 || height > 4096 || totalPixels > 25000000) {
      imageBitmap.close();
      imageBitmap = null;
      const response: ImageProcessorErrorResponse = {
        id,
        ok: false,
        error: `Security Exception: Image dimensions (${width}x${height} = ${(totalPixels / 1000000).toFixed(1)}MP) exceed security thresholds (Max 4096x4096px or 25MP). Processing aborted to prevent browser memory spike.`,
      };
      self.postMessage(response);
      return;
    }

    // 3. Smart 1:1 Aspect Ratio Center-Crop Calculation
    const safeTargetSize = Math.max(
      16,
      Math.min(2048, Number.isFinite(targetSize) ? Math.round(targetSize) : 400),
    );
    const minDim = Math.min(width, height);
    const sx = (width - minDim) / 2;
    const sy = (height - minDim) / 2;
    const finalSize = Math.min(safeTargetSize, minDim);

    // 4. OffscreenCanvas Processing
    canvas = new OffscreenCanvas(finalSize, finalSize);
    ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      throw new Error('Failed to obtain OffscreenCanvas 2D context.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imageBitmap, sx, sy, minDim, minDim, 0, 0, finalSize, finalSize);

    // Close the original bitmap source immediately to release decoded image memory
    imageBitmap.close();
    imageBitmap = null;

    // 5. BlurHash Micro-Placeholder Generation (32x32 downsample)
    let blurHash = 'L00000fQ00fQ00fQ00fQ'; // Fallback
    try {
      blurCanvas = new OffscreenCanvas(32, 32);
      blurCtx = blurCanvas.getContext('2d', { willReadFrequently: true });
      if (blurCtx) {
        blurCtx.drawImage(canvas, 0, 0, 32, 32);
        const blurData = blurCtx.getImageData(0, 0, 32, 32);
        blurHash = encodeBlurHash(blurData, 4, 3);
      }
    } catch {
      // Non-fatal fallback for blurhash calculation
    } finally {
      if (blurCanvas) {
        blurCanvas.width = 0;
        blurCanvas.height = 0;
        blurCanvas = null;
      }
      blurCtx = null;
    }

    // 6. AVIF Encoding with WebP Fallback & Size Constraint SLA (< 45 KB)
    let currentQuality = Math.max(0.1, Math.min(1.0, Number.isFinite(quality) ? quality : 0.78));
    let outputBlob: Blob | null = null;
    let targetMime = 'image/avif';

    // Attempt AVIF conversion
    try {
      outputBlob = await canvas.convertToBlob({ type: 'image/avif', quality: currentQuality });
    } catch {
      outputBlob = null;
    }

    // Fallback to WebP if AVIF unsupported or fails
    if (!outputBlob || outputBlob.size === 0) {
      targetMime = 'image/webp';
      outputBlob = await canvas.convertToBlob({ type: 'image/webp', quality: currentQuality });
    }

    // Ensure output filesize < 45 KB (46,080 bytes)
    const MAX_FILE_SIZE = 45 * 1024; // 45 KB
    let iterations = 0;
    while (
      outputBlob &&
      outputBlob.size > MAX_FILE_SIZE &&
      currentQuality > 0.3 &&
      iterations < 5
    ) {
      iterations++;
      currentQuality = Math.round((currentQuality - 0.1) * 100) / 100;
      const nextBlob = await canvas.convertToBlob({ type: targetMime, quality: currentQuality });
      if (nextBlob && nextBlob.size > 0) {
        outputBlob = nextBlob;
      } else {
        break;
      }
    }

    if (!outputBlob || outputBlob.size === 0) {
      throw new Error('Failed to encode output image blob.');
    }

    // Explicit Memory Cleanup & Canvas Release
    canvas.width = 0;
    canvas.height = 0;
    canvas = null;
    ctx = null;

    // 8. Convert Blob to ArrayBuffer for 0-Copy Transferable Object Delivery
    const outputBuffer = await outputBlob.arrayBuffer();

    const response: ImageProcessorSuccessResponse = {
      id,
      ok: true,
      buffer: outputBuffer,
      width: finalSize,
      height: finalSize,
      mimeType: targetMime,
      blurHash,
      fileSize: outputBuffer.byteLength,
    };

    // Post message back using Transferable Objects [outputBuffer]
    (self as any).postMessage(response, [outputBuffer]);
  } catch (error) {
    const response: ImageProcessorErrorResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown image processing error',
    };
    self.postMessage(response);
  } finally {
    // Guarantee memory release on all return paths
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
    if (blurCanvas) {
      blurCanvas.width = 0;
      blurCanvas.height = 0;
      blurCanvas = null;
    }
    blurCtx = null;
  }
};

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function') {
  self.addEventListener('error', (event: Event) => {
    const errorEvent = event as ErrorEvent;
    self.postMessage({
      id: 'unknown',
      ok: false,
      error: errorEvent.message || 'Image processor worker unexpected runtime error',
    });
  });

  self.addEventListener('unhandledrejection', (event: Event) => {
    const rejectionEvent = event as PromiseRejectionEvent;
    self.postMessage({
      id: 'unknown',
      ok: false,
      error:
        rejectionEvent.reason?.message || 'Unhandled promise rejection in image processor worker',
    });
  });
}
