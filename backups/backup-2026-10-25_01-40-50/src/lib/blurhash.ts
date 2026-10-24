// blurhash.ts
// Utility for decoding BlurHash strings into Data URLs for micro-placeholder rendering

const BASE83_CHARS =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

const BASE83_MAP = new Int16Array(256).fill(-1);
for (let i = 0; i < BASE83_CHARS.length; i++) {
  BASE83_MAP[BASE83_CHARS.charCodeAt(i)] = i;
}

function decode83(str: string): number {
  let value = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    const digit = code < 256 ? BASE83_MAP[code] : -1;
    if (digit !== -1) {
      value = value * 83 + digit;
    }
  }
  return value;
}

function srgbToLinear(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
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

export function decodeBlurHash(
  blurHash: string,
  width: number = 16,
  height: number = 16,
): Uint8ClampedArray | null {
  if (!blurHash || blurHash.length < 6 || (blurHash.length - 6) % 2 !== 0) return null;
  for (let i = 0; i < blurHash.length; i++) {
    const code = blurHash.charCodeAt(i);
    if (code >= 256 || BASE83_MAP[code] === -1) return null;
  }

  try {
    const sizeFlag = decode83(blurHash[0]);
    const numY = Math.floor(sizeFlag / 9) + 1;
    const numX = (sizeFlag % 9) + 1;

    const quantisedMaxValue = decode83(blurHash[1]);
    const maxValue = (quantisedMaxValue + 1) / 166;

    const colors: Array<[number, number, number]> = new Array(numX * numY);

    const dcValue = decode83(blurHash.substring(2, 6));
    const r = srgbToLinear((dcValue >> 16) & 255);
    const g = srgbToLinear((dcValue >> 8) & 255);
    const b = srgbToLinear(dcValue & 255);
    colors[0] = [r, g, b];

    let index = 6;
    for (let i = 1; i < numX * numY; i++) {
      if (index >= blurHash.length) break;
      const acValue = decode83(blurHash.substring(index, index + 2));
      const quantR = Math.floor(acValue / (19 * 19));
      const quantG = Math.floor(acValue / 19) % 19;
      const quantB = acValue % 19;

      colors[i] = [
        signPow((quantR - 9) / 9, 2) * maxValue,
        signPow((quantG - 9) / 9, 2) * maxValue,
        signPow((quantB - 9) / 9, 2) * maxValue,
      ];
      index += 2;
    }

    const pixels = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0,
          g = 0,
          b = 0;

        for (let j = 0; y < height && j < numY; j++) {
          for (let i = 0; i < numX; i++) {
            const basis =
              Math.cos((Math.PI * x * i) / width) * Math.cos((Math.PI * y * j) / height);
            const color = colors[j * numX + i] || [0, 0, 0];
            r += color[0] * basis;
            g += color[1] * basis;
            b += color[2] * basis;
          }
        }

        const intR = linearToSrgb(r);
        const intG = linearToSrgb(g);
        const intB = linearToSrgb(b);

        const pixelIndex = (y * width + x) * 4;
        pixels[pixelIndex] = intR;
        pixels[pixelIndex + 1] = intG;
        pixels[pixelIndex + 2] = intB;
        pixels[pixelIndex + 3] = 255;
      }
    }

    return pixels;
  } catch {
    return null;
  }
}

const MAX_BLURHASH_CACHE = 256;
const blurHashDataUrlCache = new Map<string, string>();
let sharedCanvas: HTMLCanvasElement | null = null;

/**
 * Renders a blurHash into a Data URL for <img> src or canvas rendering
 */
export function blurHashToDataUrl(blurHash: string, width = 16, height = 16): string | null {
  const cacheKey = `${blurHash}:${width}x${height}`;
  const cached = blurHashDataUrlCache.get(cacheKey);
  if (cached) return cached;

  const pixels = decodeBlurHash(blurHash, width, height);
  if (!pixels) return null;

  if (typeof document === 'undefined') return null;

  try {
    if (!sharedCanvas) {
      sharedCanvas = document.createElement('canvas');
    }
    sharedCanvas.width = width;
    sharedCanvas.height = height;
    const ctx = sharedCanvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(width, height);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);

    const dataUrl = sharedCanvas.toDataURL();
    sharedCanvas.width = 0;
    sharedCanvas.height = 0;

    if (blurHashDataUrlCache.size >= MAX_BLURHASH_CACHE) {
      const firstKey = blurHashDataUrlCache.keys().next().value;
      if (firstKey) blurHashDataUrlCache.delete(firstKey);
    }
    blurHashDataUrlCache.set(cacheKey, dataUrl);

    return dataUrl;
  } catch {
    return null;
  }
}
