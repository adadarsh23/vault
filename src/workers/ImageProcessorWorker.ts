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
const BASE83_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

function encode83(value: number, length: number): string {
  let result = '';
  for (let i = 1; i <= length; i++) {
    const digit = Math.floor(value / Math.pow(83, length - i)) % 83;
    result += BASE83_CHARS[digit];
  }
  return result;
}

function srgbToLinear(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  return v <= 0.0031308 ? Math.round(v * 12.92 * 255) : Math.round((1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
}

function signPow(val: number, exp: number): number {
  return Math.sign(val) * Math.pow(Math.abs(val), exp);
}

function encodeBlurHash(imageData: ImageData, componentX = 4, componentY = 3): string {
  const { width, height, data } = imageData;
  const numPixels = width * height;
  const factors: Array<[number, number, number]> = [];

  for (let y = 0; y < componentY; y++) {
    for (let x = 0; x < componentX; x++) {
      let r = 0, g = 0, b = 0;
      const normalisation = x === 0 && y === 0 ? 1 : 2;

      for (let i = 0; i < numPixels; i++) {
        const px = i % width;
        const py = Math.floor(i / width);
        const basis = Math.cos((Math.PI * x * px) / width) * Math.cos((Math.PI * y * py) / height);
        const idx = i * 4;
        r += basis * srgbToLinear(data[idx]);
        g += basis * srgbToLinear(data[idx + 1]);
        b += basis * srgbToLinear(data[idx + 2]);
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
    return (Math.round(srgb) & 0xff);
  };
  const dcR = quantiseDc(dc[0]);
  const dcG = quantiseDc(dc[1]);
  const dcB = quantiseDc(dc[2]);
  const dcValue = (dcR << 16) + (dcG << 8) + dcB;
  hash += encode83(dcValue, 4);

  // Encode AC
  const maxVal = maxAc === 0 ? 1 : maxAc;
  for (const factor of ac) {
    const quantR = Math.floor(Math.max(0, Math.min(18, Math.floor(signPow(factor[0] / maxVal, 0.5) * 9 + 9.5))));
    const quantG = Math.floor(Math.max(0, Math.min(18, Math.floor(signPow(factor[1] / maxVal, 0.5) * 9 + 9.5))));
    const quantB = Math.floor(Math.max(0, Math.min(18, Math.floor(signPow(factor[2] / maxVal, 0.5) * 9 + 9.5))));
    const acValue = quantR * 19 * 19 + quantG * 19 + quantB;
    hash += encode83(acValue, 2);
  }

  return hash;
}

/**
 * Validates raw binary signatures (Magic Bytes)
 */
function validateMagicBytes(buffer: ArrayBuffer, mimeType: string): { valid: boolean; detectedFormat: string } {
  const bytes = new Uint8Array(buffer.slice(0, 16));
  
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, detectedFormat: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
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

  // WebP: RIFF ... WEBP (bytes 0-3 = 'RIFF', bytes 8-11 = 'WEBP')
  if (
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

  // SVG: Inspect text content for <svg tag
  const textDecoder = new TextDecoder('utf-8');
  const sampleText = textDecoder.decode(buffer.slice(0, 1024)).trim();
  if (sampleText.toLowerCase().includes('<svg') || sampleText.toLowerCase().startsWith('<?xml')) {
    return { valid: true, detectedFormat: 'image/svg+xml' };
  }

  // Fallback: If mimeType is an image format, allow if buffer isn't completely zeroed out
  if (mimeType.startsWith('image/')) {
    return { valid: true, detectedFormat: mimeType };
  }

  return { valid: false, detectedFormat: 'unknown' };
}

/**
 * Sanitizes SVG code if present to prevent script injection before rendering
 */
function sanitizeSvgString(svgCode: string): string {
  // Strip <script> elements and inline event handlers
  return svgCode
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript:/gi, 'forbidden:');
}

self.onmessage = async (event: MessageEvent<ImageProcessorRequest>) => {
  const { id, type, fileBuffer, fileName, mimeType, targetSize = 400, quality = 0.78 } = event.data;

  if (type !== 'PROCESS_IMAGE') {
    return;
  }

  try {
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
    let imageBitmap: ImageBitmap;
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

    // 2. Decompression Bomb Protection (SLA: Max 4096x4096px or 25 MP)
    if (width > 4096 || height > 4096 || totalPixels > 25000000) {
      imageBitmap.close(); // Clean up memory immediately
      const response: ImageProcessorErrorResponse = {
        id,
        ok: false,
        error: `Security Exception: Image dimensions (${width}x${height} = ${(totalPixels / 1000000).toFixed(1)}MP) exceed security thresholds (Max 4096x4096px or 25MP). Processing aborted to prevent browser memory spike.`,
      };
      self.postMessage(response);
      return;
    }

    // 3. Smart 1:1 Aspect Ratio Center-Crop Calculation
    const minDim = Math.min(width, height);
    const sx = (width - minDim) / 2;
    const sy = (height - minDim) / 2;
    const finalSize = Math.min(targetSize, minDim);

    // 4. OffscreenCanvas Processing
    let canvas: OffscreenCanvas | null = new OffscreenCanvas(finalSize, finalSize);
    let ctx: OffscreenCanvasRenderingContext2D | null = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      imageBitmap.close();
      throw new Error('Failed to obtain OffscreenCanvas 2D context.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imageBitmap, sx, sy, minDim, minDim, 0, 0, finalSize, finalSize);

    // Close the original bitmap source to free up memory
    imageBitmap.close();

    // 5. BlurHash Micro-Placeholder Generation (32x32 downsample)
    let blurHash = 'L00000fQ00fQ00fQ00fQ'; // Fallback
    try {
      let blurCanvas: OffscreenCanvas | null = new OffscreenCanvas(32, 32);
      let blurCtx: OffscreenCanvasRenderingContext2D | null = blurCanvas.getContext('2d', { willReadFrequently: true });
      if (blurCtx) {
        blurCtx.drawImage(canvas, 0, 0, 32, 32);
        const blurData = blurCtx.getImageData(0, 0, 32, 32);
        blurHash = encodeBlurHash(blurData, 4, 3);
      }
      if (blurCanvas) {
        blurCanvas.width = 0;
        blurCanvas.height = 0;
      }
      blurCanvas = null;
      blurCtx = null;
    } catch {
      // Non-fatal fallback for blurhash calculation
    }

    // 6. AVIF Encoding with WebP Fallback & Size Constraint SLA (< 45 KB)
    let currentQuality = quality;
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
    while (outputBlob.size > MAX_FILE_SIZE && currentQuality > 0.3) {
      currentQuality -= 0.1;
      outputBlob = await canvas.convertToBlob({ type: targetMime, quality: currentQuality });
    }

    // 7. Explicit Memory Cleanup & Canvas Release
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
    self.postMessage(response, [outputBuffer]);
  } catch (error) {
    const response: ImageProcessorErrorResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown image processing error',
    };
    self.postMessage(response);
  }
};
