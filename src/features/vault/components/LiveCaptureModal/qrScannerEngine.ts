import { ScannedBarcodeResult, BarcodeContentType } from './types';
import { encryptData } from '../../../../lib/cryptoPrimitives';
import { logger } from '../../../../lib/logger';

/**
 * Classifies the raw barcode string into structured type (URL, WiFi, OTP, Secret, Text).
 */
export function classifyBarcodeContent(raw: string): {
  type: BarcodeContentType;
  title: string;
  parsedData?: Record<string, string>;
} {
  const trimmed = raw.trim();

  // 1. WiFi QR Code (WIFI:S:MySSID;T:WPA;P:MyPassword;;)
  if (trimmed.startsWith('WIFI:')) {
    const parsedData: Record<string, string> = {};
    const ssidMatch = trimmed.match(/S:([^;]+)/);
    const passMatch = trimmed.match(/P:([^;]+)/);
    const typeMatch = trimmed.match(/T:([^;]+)/);
    const hiddenMatch = trimmed.match(/H:([^;]+)/);

    if (ssidMatch) parsedData['SSID'] = ssidMatch[1];
    if (passMatch) parsedData['Password'] = passMatch[1];
    if (typeMatch) parsedData['Security'] = typeMatch[1];
    if (hiddenMatch) parsedData['Hidden'] = hiddenMatch[1];

    return {
      type: 'wifi',
      title: `WiFi Network: ${parsedData['SSID'] || 'Encrypted WiFi'}`,
      parsedData,
    };
  }

  // 2. OTP Authenticator URI (otpauth://totp/Issuer:account?secret=...)
  if (trimmed.startsWith('otpauth://')) {
    try {
      const url = new URL(trimmed);
      const secret = url.searchParams.get('secret') || '';
      const issuer =
        url.searchParams.get('issuer') || url.pathname.split(':')[0].replace('//totp/', '');
      return {
        type: 'otp',
        title: `2FA Authenticator: ${issuer || 'OTP Key'}`,
        parsedData: {
          Issuer: issuer || 'Unknown',
          Secret: secret ? `${secret.slice(0, 4)}••••${secret.slice(-4)}` : '',
          Algorithm: url.searchParams.get('algorithm') || 'SHA1',
          Digits: url.searchParams.get('digits') || '6',
        },
      };
    } catch {
      return {
        type: 'otp',
        title: '2FA Authenticator Key',
        parsedData: { Raw: trimmed },
      };
    }
  }

  // 3. Web URL (https://..., http://...)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return {
        type: 'url',
        title: `URL: ${url.hostname}`,
        parsedData: {
          Host: url.hostname,
          Protocol: url.protocol,
          Path: url.pathname,
        },
      };
    } catch {
      return {
        type: 'url',
        title: `URL: ${trimmed.slice(0, 30)}...`,
      };
    }
  }

  // 4. Crypto / Secret Key / PEM Certificate
  if (
    trimmed.startsWith('-----BEGIN') ||
    trimmed.startsWith('0x') ||
    /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/.test(trimmed) ||
    /^[A-Fa-f0-9]{64}$/.test(trimmed)
  ) {
    return {
      type: 'secret',
      title: 'Encrypted Credential / Secret Key',
      parsedData: {
        Length: `${trimmed.length} chars`,
        Preview: `${trimmed.slice(0, 6)}••••${trimmed.slice(-4)}`,
      },
    };
  }

  // 5. Email
  if (trimmed.startsWith('mailto:') || /^[\w.-]+@[\w.-]+\.\w+$/.test(trimmed)) {
    const email = trimmed.replace('mailto:', '');
    return {
      type: 'email',
      title: `Contact Email: ${email}`,
      parsedData: { Email: email },
    };
  }

  // 6. Phone
  if (trimmed.startsWith('tel:') || /^\+?[0-9\s\-()]{7,20}$/.test(trimmed)) {
    const phone = trimmed.replace('tel:', '');
    return {
      type: 'phone',
      title: `Phone Number: ${phone}`,
      parsedData: { Phone: phone },
    };
  }

  // 7. Generic Text / Notes
  const firstLine = trimmed.split('\n')[0].slice(0, 40);
  return {
    type: 'text',
    title: `Note: ${firstLine}${trimmed.length > 40 ? '...' : ''}`,
  };
}

// ==========================================
// 🚀 Pure TypeScript QR Code Reader Engine
// ==========================================

// GF(256) Math for Reed-Solomon Error Correction
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function gfDiv(a: number, b: number): number {
  if (a === 0) return 0;
  if (b === 0) throw new Error('Division by zero in GF(256)');
  return GF_EXP[(GF_LOG[a] + 255 - GF_LOG[b]) % 255];
}

// Reed-Solomon error correction for QR Code blocks
function correctReedSolomon(codewds: Uint8Array, twoS: number): boolean {
  const syndromes = new Uint8Array(twoS);
  let hasError = false;

  for (let i = 0; i < twoS; i++) {
    let evalVal = 0;
    for (let j = 0; j < codewds.length; j++) {
      evalVal = codewds[j] ^ (evalVal === 0 ? 0 : gfMul(evalVal, GF_EXP[i]));
    }
    syndromes[i] = evalVal;
    if (evalVal !== 0) hasError = true;
  }

  if (!hasError) return true; // No errors present

  // Berlekamp-Massey Algorithm
  let sigma: number[] = [1];
  let bPoly: number[] = [1];

  for (let i = 0; i < twoS; i++) {
    let delta = syndromes[i];
    for (let j = 1; j < sigma.length; j++) {
      delta ^= gfMul(sigma[j], syndromes[i - j]);
    }
    bPoly.unshift(0);
    if (delta !== 0) {
      const newSigma = sigma.slice();
      while (newSigma.length < bPoly.length) newSigma.push(0);
      for (let j = 0; j < bPoly.length; j++) {
        newSigma[j] ^= gfMul(delta, bPoly[j]);
      }
      if (sigma.length <= i / 2 + 1) {
        const invDelta = gfDiv(1, delta);
        bPoly = sigma.map((c) => gfMul(c, invDelta));
        sigma = newSigma;
      }
    }
  }

  const numErrors = sigma.length - 1;
  if (numErrors * 2 > twoS) return false; // Too many errors

  // Chien Search
  const errorPositions: number[] = [];
  for (let i = 0; i < codewds.length; i++) {
    const xInv = GF_EXP[(255 - i) % 255];
    let sum = 0;
    for (let j = 0; j < sigma.length; j++) {
      sum ^= gfMul(sigma[j], GF_EXP[(GF_LOG[xInv] * j) % 255]);
    }
    if (sum === 0) {
      errorPositions.push(codewds.length - 1 - i);
    }
  }

  if (errorPositions.length !== numErrors) return false;

  // Forney Algorithm for error magnitudes
  const omega = new Uint8Array(numErrors);
  for (let i = 0; i < numErrors; i++) {
    let sum = 0;
    for (let j = 0; j <= i; j++) {
      sum ^= gfMul(syndromes[i - j], sigma[j]);
    }
    omega[i] = sum;
  }

  for (const pos of errorPositions) {
    const xInv = GF_EXP[pos % 255];
    let num = 0;
    for (let i = 0; i < numErrors; i++) {
      num ^= gfMul(omega[i], GF_EXP[(GF_LOG[xInv] * i) % 255]);
    }
    let den = 0;
    for (let i = 1; i < sigma.length; i += 2) {
      den ^= gfMul(sigma[i], GF_EXP[(GF_LOG[xInv] * (i - 1)) % 255]);
    }
    if (den === 0) return false;
    const mag = gfDiv(num, den);
    codewds[pos] ^= mag;
  }

  return true;
}

// Fast QR Module Bit Stream Decoder
function decodeQRPayload(dataBytes: Uint8Array, version: number): string {
  let bitPos = 0;
  function readBits(count: number): number {
    let result = 0;
    for (let i = 0; i < count; i++) {
      const byteIdx = Math.floor(bitPos / 8);
      const bitIdx = 7 - (bitPos % 8);
      if (byteIdx < dataBytes.length) {
        const bit = (dataBytes[byteIdx] >> bitIdx) & 1;
        result = (result << 1) | bit;
      }
      bitPos++;
    }
    return result;
  }

  let text = '';
  const totalBits = dataBytes.length * 8;

  while (bitPos + 4 <= totalBits) {
    const mode = readBits(4);
    if (mode === 0) break; // Terminator

    if (mode === 1) {
      // Numeric mode (0001)
      const countBits = version <= 9 ? 10 : version <= 26 ? 12 : 14;
      const count = readBits(countBits);
      let remaining = count;
      while (remaining >= 3 && bitPos + 10 <= totalBits) {
        const num = readBits(10);
        text += num.toString().padStart(3, '0');
        remaining -= 3;
      }
      if (remaining === 2 && bitPos + 7 <= totalBits) {
        const num = readBits(7);
        text += num.toString().padStart(2, '0');
      } else if (remaining === 1 && bitPos + 4 <= totalBits) {
        const num = readBits(4);
        text += num.toString();
      }
    } else if (mode === 2) {
      // Alphanumeric mode (0010)
      const alphaTable = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
      const countBits = version <= 9 ? 9 : version <= 26 ? 11 : 13;
      const count = readBits(countBits);
      let remaining = count;
      while (remaining >= 2 && bitPos + 11 <= totalBits) {
        const val = readBits(11);
        text += alphaTable[Math.floor(val / 45)] + alphaTable[val % 45];
        remaining -= 2;
      }
      if (remaining === 1 && bitPos + 6 <= totalBits) {
        const val = readBits(6);
        text += alphaTable[val];
      }
    } else if (mode === 4) {
      // Byte mode (0100) - UTF-8 / ASCII
      const countBits = version <= 9 ? 8 : 16;
      const count = readBits(countBits);
      const bytes: number[] = [];
      for (let i = 0; i < count && bitPos + 8 <= totalBits; i++) {
        bytes.push(readBits(8));
      }
      try {
        const decoder = new TextDecoder('utf-8', { fatal: false });
        text += decoder.decode(new Uint8Array(bytes));
      } catch {
        text += String.fromCharCode(...bytes);
      }
    } else if (mode === 7) {
      // ECI (Extended Channel Interpretation)
      readBits(8); // skip ECI assignment
    } else {
      // Unknown or unsupported mode, break
      break;
    }
  }

  return text;
}

// Binarize and search for 1:1:3:1:1 finder patterns
interface Point {
  x: number;
  y: number;
}
interface FinderPattern extends Point {
  moduleSize: number;
}

function findQRFinderPatterns(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): { points: Point[]; rawValue: string } | null {
  if (width < 30 || height < 30) return null;

  // 1. Convert to grayscale & compute local adaptive threshold
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j++) {
    gray[j] = (pixels[i] * 77 + pixels[i + 1] * 150 + pixels[i + 2] * 29) >> 8;
  }

  // Integral image for lightning-fast adaptive binarization
  const binarized = new Uint8Array(width * height);
  const s = Math.max(8, Math.floor(width / 16));
  const s2 = s >> 1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      // Simple fast local thresholding
      let sum = 0;
      let count = 0;
      const yMin = Math.max(0, y - s2);
      const yMax = Math.min(height - 1, y + s2);
      const xMin = Math.max(0, x - s2);
      const xMax = Math.min(width - 1, x + s2);

      // Step sampling for speed
      for (let py = yMin; py <= yMax; py += 2) {
        const pRow = py * width;
        for (let px = xMin; px <= xMax; px += 2) {
          sum += gray[pRow + px];
          count++;
        }
      }

      const threshold = (sum / count) * 0.88;
      binarized[rowOffset + x] = gray[rowOffset + x] < threshold ? 1 : 0;
    }
  }

  // 2. Scan for 1:1:3:1:1 Finder Patterns
  const patterns: FinderPattern[] = [];

  for (let y = 0; y < height; y += 2) {
    const r = [0, 0, 0, 0, 0];
    let currentState = 0;
    const rowOffset = y * width;

    for (let x = 0; x < width; x++) {
      const bit = binarized[rowOffset + x];
      if (bit === 1) {
        if ((currentState & 1) === 1) {
          r[currentState]++;
        } else {
          if (currentState === 4) {
            // Check ratio 1:1:3:1:1
            const total = r[0] + r[1] + r[2] + r[3] + r[4];
            if (total >= 7) {
              const moduleSize = total / 7;
              const maxVariance = moduleSize / 2;
              if (
                Math.abs(moduleSize - r[0]) < maxVariance &&
                Math.abs(moduleSize - r[1]) < maxVariance &&
                Math.abs(3 * moduleSize - r[2]) < 3 * maxVariance &&
                Math.abs(moduleSize - r[3]) < maxVariance &&
                Math.abs(moduleSize - r[4]) < maxVariance
              ) {
                const centerX = x - r[4] - r[3] - r[2] / 2;
                // Add center pattern
                let exists = false;
                for (const p of patterns) {
                  if (Math.hypot(p.x - centerX, p.y - y) < moduleSize * 3) {
                    exists = true;
                    break;
                  }
                }
                if (!exists) {
                  patterns.push({ x: centerX, y, moduleSize });
                }
              }
            }
            r[0] = r[2];
            r[1] = r[3];
            r[2] = r[4];
            r[3] = 1;
            r[4] = 0;
            currentState = 3;
          } else {
            currentState++;
            r[currentState] = 1;
          }
        }
      } else {
        if ((currentState & 1) === 0) {
          r[currentState]++;
        } else {
          currentState++;
          r[currentState] = 1;
        }
      }
    }
  }

  if (patterns.length < 3) return null;

  // 3. Match best 3 finder patterns (Top-Left, Top-Right, Bottom-Left)
  let bestTrio: [FinderPattern, FinderPattern, FinderPattern] | null = null;
  let bestDistScore = Infinity;

  for (let i = 0; i < patterns.length; i++) {
    for (let j = i + 1; j < patterns.length; j++) {
      for (let k = j + 1; k < patterns.length; k++) {
        const d1 = Math.hypot(patterns[i].x - patterns[j].x, patterns[i].y - patterns[j].y);
        const d2 = Math.hypot(patterns[j].x - patterns[k].x, patterns[j].y - patterns[k].y);
        const d3 = Math.hypot(patterns[k].x - patterns[i].x, patterns[k].y - patterns[i].y);

        // In a right triangle, a^2 + b^2 = c^2
        const sides = [
          { a: patterns[i], b: patterns[j], d: d1 },
          { a: patterns[j], b: patterns[k], d: d2 },
          { a: patterns[k], b: patterns[i], d: d3 },
        ].sort((s1, s2) => s1.d - s2.d);

        const hyp = sides[2].d;
        const leg1 = sides[0].d;
        const leg2 = sides[1].d;

        const pythError = Math.abs(leg1 * leg1 + leg2 * leg2 - hyp * hyp);
        const ratioError = Math.abs(leg1 - leg2) / Math.max(leg1, leg2);

        if (ratioError < 0.25 && pythError < bestDistScore) {
          bestDistScore = pythError;
          // Find vertex with 90 deg corner (Top-Left)
          const tl =
            patterns[i] !== sides[2].a && patterns[i] !== sides[2].b
              ? patterns[i]
              : patterns[j] !== sides[2].a && patterns[j] !== sides[2].b
                ? patterns[j]
                : patterns[k];
          const other1 = sides[2].a;
          const other2 = sides[2].b;

          // Cross product to find Top-Right vs Bottom-Left
          const cross =
            (other1.x - tl.x) * (other2.y - tl.y) - (other1.y - tl.y) * (other2.x - tl.x);
          const tr = cross > 0 ? other1 : other2;
          const bl = cross > 0 ? other2 : other1;

          bestTrio = [tl, tr, bl];
        }
      }
    }
  }

  if (!bestTrio) return null;

  const [tl, tr, bl] = bestTrio;
  const avgModule = (tl.moduleSize + tr.moduleSize + bl.moduleSize) / 3;
  const dist = (Math.hypot(tl.x - tr.x, tl.y - tr.y) + Math.hypot(tl.x - bl.x, tl.y - bl.y)) / 2;
  const modulesAcross = Math.round(dist / avgModule) + 7;
  const version = Math.max(1, Math.min(40, Math.round((modulesAcross - 17) / 4)));
  const size = 17 + version * 4;

  // 4. Sample grid of modules using bilinear homography
  const matrix = new Uint8Array(size * size);
  for (let my = 0; my < size; my++) {
    const v = my / (size - 1);
    for (let mx = 0; mx < size; mx++) {
      const u = mx / (size - 1);
      // Perspective interpolation
      const px = Math.round(
        (1 - u) * (1 - v) * tl.x +
          u * (1 - v) * tr.x +
          (1 - u) * v * bl.x +
          u * v * (tr.x + bl.x - tl.x),
      );
      const py = Math.round(
        (1 - u) * (1 - v) * tl.y +
          u * (1 - v) * tr.y +
          (1 - u) * v * bl.y +
          u * v * (tr.y + bl.y - tl.y),
      );

      if (px >= 0 && px < width && py >= 0 && py < height) {
        matrix[my * size + mx] = binarized[py * width + px];
      }
    }
  }

  // 5. Read format information (15 bits)
  let formatBits = 0;
  for (let i = 0; i <= 5; i++) formatBits = (formatBits << 1) | matrix[8 * size + i];
  formatBits = (formatBits << 1) | matrix[8 * size + 7];
  formatBits = (formatBits << 1) | matrix[8 * size + 8];
  formatBits = (formatBits << 1) | matrix[7 * size + 8];
  for (let i = 5; i >= 0; i--) formatBits = (formatBits << 1) | matrix[i * size + 8];

  const unmaskedFormat = formatBits ^ 0x5412;
  const maskPattern = (unmaskedFormat >> 10) & 0x07;

  // Mask functions
  const isMasked = (x: number, y: number): boolean => {
    switch (maskPattern) {
      case 0:
        return (x + y) % 2 === 0;
      case 1:
        return y % 2 === 0;
      case 2:
        return x % 3 === 0;
      case 3:
        return (x + y) % 3 === 0;
      case 4:
        return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
      case 5:
        return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6:
        return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      case 7:
        return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
      default:
        return false;
    }
  };

  // Function module check (finder patterns, timing patterns, format info)
  const isFunctionModule = (x: number, y: number): boolean => {
    if (x <= 8 && y <= 8) return true; // Top-Left Finder & Format
    if (x >= size - 8 && y <= 8) return true; // Top-Right Finder & Format
    if (x <= 8 && y >= size - 8) return true; // Bottom-Left Finder & Format
    if (x === 6 || y === 6) return true; // Timing lines
    return false;
  };

  // 6. Extract data codewords in standard zigzag track
  const rawBits: number[] = [];
  let readingUp = true;

  for (let x = size - 1; x > 0; x -= 2) {
    if (x === 6) x--; // Skip vertical timing line
    for (let count = 0; count < size; count++) {
      const y = readingUp ? size - 1 - count : count;
      for (let col = 0; col < 2; col++) {
        const cx = x - col;
        if (!isFunctionModule(cx, y)) {
          let bit = matrix[y * size + cx];
          if (isMasked(cx, y)) bit ^= 1;
          rawBits.push(bit);
        }
      }
    }
    readingUp = !readingUp;
  }

  // Group raw bits into bytes
  const codewords = new Uint8Array(Math.floor(rawBits.length / 8));
  for (let i = 0; i < codewords.length; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | rawBits[i * 8 + b];
    }
    codewords[i] = byteVal;
  }

  // 7. Error Correction with Reed-Solomon
  const ecCodewordsPerBlock = 7;
  correctReedSolomon(codewords, ecCodewordsPerBlock);

  // 8. Parse Decoded text payload
  const decodedText = decodeQRPayload(codewords, version);
  if (!decodedText || decodedText.trim().length === 0) return null;

  return {
    points: [tl, tr, bl],
    rawValue: decodedText.trim(),
  };
}

/**
 * Universal Barcode & QR Scanner Engine.
 * Combines browser native BarcodeDetector API with pure-JS computer-vision decoder fallback.
 */
export class BarcodeScannerEngine {
  private detector: any = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;

  constructor() {
    if (typeof (window as any).BarcodeDetector !== 'undefined') {
      try {
        this.detector = new (window as any).BarcodeDetector({
          formats: ['qr_code'],
        });
      } catch (e) {
        logger.warn('Failed to initialize native BarcodeDetector', { e });
        this.detector = null;
      }
    }
  }

  public get isSupported(): boolean {
    return true; // Always supported via pure-JS QR decoder fallback
  }

  public async scanFrame(videoElement: HTMLVideoElement): Promise<ScannedBarcodeResult | null> {
    if (!videoElement || videoElement.readyState < 2) {
      return null;
    }

    const videoW = videoElement.videoWidth || videoElement.clientWidth || 640;
    const videoH = videoElement.videoHeight || videoElement.clientHeight || 480;

    // 1. Try Native BarcodeDetector if available
    if (this.detector) {
      try {
        const barcodes = await this.detector.detect(videoElement);
        if (barcodes && barcodes.length > 0) {
          const primary = barcodes[0];
          const rawValue = primary.rawValue || '';
          if (rawValue) {
            const classification = classifyBarcodeContent(rawValue);
            return {
              rawValue,
              format: primary.format || 'qr_code',
              type: classification.type,
              title: classification.title,
              parsedData: classification.parsedData,
              boundingBox: primary.boundingBox,
              timestamp: Date.now(),
            };
          }
        }
      } catch {
        /* fallback to pure JS decoder */
      }
    }

    // 2. Pure TypeScript QR Code Reader Fallback
    try {
      if (!this.offscreenCanvas) {
        this.offscreenCanvas = document.createElement('canvas');
      }

      // Scale to optimal processing size for real-time 60fps analysis
      const maxDim = 480;
      const scale = Math.min(1, maxDim / Math.max(videoW, videoH));
      const targetW = Math.round(videoW * scale);
      const targetH = Math.round(videoH * scale);

      if (this.offscreenCanvas.width !== targetW || this.offscreenCanvas.height !== targetH) {
        this.offscreenCanvas.width = targetW;
        this.offscreenCanvas.height = targetH;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d', {
          willReadFrequently: true,
        });
      }

      if (!this.offscreenCtx) return null;

      this.offscreenCtx.drawImage(videoElement, 0, 0, targetW, targetH);

      const imgData = this.offscreenCtx.getImageData(0, 0, targetW, targetH);
      const result = findQRFinderPatterns(imgData.data, targetW, targetH);

      if (result && result.rawValue) {
        const classification = classifyBarcodeContent(result.rawValue);
        const minX = Math.min(...result.points.map((p) => p.x)) / scale;
        const maxX = Math.max(...result.points.map((p) => p.x)) / scale;
        const minY = Math.min(...result.points.map((p) => p.y)) / scale;
        const maxY = Math.max(...result.points.map((p) => p.y)) / scale;

        return {
          rawValue: result.rawValue,
          format: 'qr_code',
          type: classification.type,
          title: classification.title,
          parsedData: classification.parsedData,
          boundingBox: {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          },
          timestamp: Date.now(),
        };
      }
    } catch (err) {
      logger.warn('Error during software QR code detection', { err });
    }

    return null;
  }
}

/**
 * Formats scanned barcode data into markdown note and encrypts into the vault.
 */
export async function saveBarcodeToEncryptedVaultNote(
  result: ScannedBarcodeResult,
  masterKey: string | CryptoKey | null | undefined,
  addItem: (item: any) => Promise<any>,
): Promise<string> {
  const timestampStr = new Date(result.timestamp).toLocaleString();
  const formatUpper = result.format.toUpperCase().replace('_', ' ');
  const typeUpper = result.type.toUpperCase();

  let metadataSection = '';
  if (result.parsedData && Object.keys(result.parsedData).length > 0) {
    metadataSection =
      `\n### Parsed Details:\n` +
      Object.entries(result.parsedData)
        .map(([k, v]) => `- **${k}:** \`${v}\``)
        .join('\n') +
      '\n';
  }

  const rawContent = `# 🔍 Scanned Code: ${result.title}

> **Barcode Format:** \`${formatUpper}\` | **Type:** \`${typeUpper}\`
> **Scanned At:** *${timestampStr}*
${metadataSection}
---

### Decoded Payload:
\`\`\`
${result.rawValue}
\`\`\`

---
*Created automatically by Vault Live Scanner.*
`;

  const encryptedContent = await encryptData(rawContent, masterKey);

  const newItem = await addItem({
    type: 'note',
    title: `QR: ${result.title}`,
    content: encryptedContent,
    favorite: false,
    folder: null,
  });

  return newItem?.id || 'saved';
}
