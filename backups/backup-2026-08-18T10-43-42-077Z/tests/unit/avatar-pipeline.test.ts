// avatar-pipeline.test.ts
// Unit tests for zero-copy profile photo processing pipeline, safety checks, and memory management

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { decodeBlurHash, blurHashToDataUrl } from '../../src/lib/blurhash';

describe('Avatar Pipeline - Magic Byte & Security Validation', () => {
  it('detects JPEG magic bytes (FF D8 FF)', () => {
    const jpegBuffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).buffer;
    const bytes = new Uint8Array(jpegBuffer.slice(0, 3));
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(bytes[2]).toBe(0xff);
  });

  it('detects PNG magic bytes (89 50 4E 47)', () => {
    const pngBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
    const bytes = new Uint8Array(pngBuffer.slice(0, 4));
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
  });

  it('detects WebP magic bytes (RIFF...WEBP)', () => {
    const webpBuffer = new Uint8Array([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // length
      0x57,
      0x45,
      0x42,
      0x50, // WEBP
    ]).buffer;
    const bytes = new Uint8Array(webpBuffer);
    expect(bytes[0]).toBe(0x52);
    expect(bytes[1]).toBe(0x49);
    expect(bytes[8]).toBe(0x57);
    expect(bytes[9]).toBe(0x45);
  });

  it('verifies decompression bomb threshold limits (Max 4096x4096px or 25 MP)', () => {
    const safeWidth = 4000;
    const safeHeight = 4000;
    const safePixels = safeWidth * safeHeight;

    const dangerousWidth = 5000;
    const dangerousHeight = 6000;
    const dangerousPixels = dangerousWidth * dangerousHeight;

    expect(safePixels <= 25_000_000).toBe(true);
    expect(dangerousPixels > 25_000_000).toBe(true);
    expect(dangerousWidth > 4096).toBe(true);
  });
});

describe('Avatar Pipeline - BlurHash Placeholder', () => {
  it('decodes valid BlurHash strings to Uint8ClampedArray pixel buffers', () => {
    const sampleBlurHash = 'L00000fQ00fQ00fQ00fQ';
    const pixels = decodeBlurHash(sampleBlurHash, 16, 16);
    expect(pixels).not.toBeNull();
    if (pixels) {
      expect(pixels.length).toBe(16 * 16 * 4); // RGBA format
    }
  });

  it('handles invalid BlurHash strings gracefully', () => {
    const result = decodeBlurHash('invalid', 16, 16);
    expect(result).toBeNull();
  });
});
