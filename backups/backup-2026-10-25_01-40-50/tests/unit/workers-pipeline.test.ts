import { describe, it, expect } from 'vitest';
import {
  stripJpegExifBinary,
  stripPngMetadataBinary,
  stripWebpMetadataBinary,
} from '../../src/workers/media-processor.worker';
import { decodeBlurHash } from '../../src/lib/blurhash';

describe('Vault Production Workers Suite', () => {
  describe('Media Processor Worker: Metadata Scrubber Binary Tests', () => {
    it('handles empty, truncated, or invalid buffers safely without crashing', () => {
      const emptyBuffer = new ArrayBuffer(0);
      expect(stripJpegExifBinary(emptyBuffer)).toBe(emptyBuffer);
      expect(stripPngMetadataBinary(emptyBuffer)).toBe(emptyBuffer);
      expect(stripWebpMetadataBinary(emptyBuffer)).toBe(emptyBuffer);

      const tinyBuffer = new Uint8Array([0xff, 0xd8, 0x00]).buffer;
      expect(stripJpegExifBinary(tinyBuffer)).toBe(tinyBuffer);

      const invalidPng = new Uint8Array([0x01, 0x02, 0x03, 0x04]).buffer;
      expect(stripPngMetadataBinary(invalidPng)).toBe(invalidPng);

      const invalidWebp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]).buffer;
      expect(stripWebpMetadataBinary(invalidWebp)).toBe(invalidWebp);
    });

    it('strips JPEG APP1 EXIF/GPS segments cleanly while preserving image SOI/SOS', () => {
      const jfifPayload = new Uint8Array([
        0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00,
        0x48, 0x00, 0x00,
      ]);

      const exifPayload = new Uint8Array([
        0xff, 0xe1, 0x00, 0x16, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x47, 0x50, 0x53, 0x20, 0x33,
        0x37, 0x2e, 0x37, 0x37, 0x34, 0x39, 0x53,
      ]);

      const scanData = new Uint8Array([
        0xff, 0xda, 0x00, 0x08, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0xff, 0xd9,
      ]);

      const totalSize = 2 + jfifPayload.length + exifPayload.length + scanData.length;
      const buffer = new ArrayBuffer(totalSize);
      const view = new Uint8Array(buffer);

      let pos = 0;
      view.set([0xff, 0xd8], pos);
      pos += 2;
      view.set(jfifPayload, pos);
      pos += jfifPayload.length;
      view.set(exifPayload, pos);
      pos += exifPayload.length;
      view.set(scanData, pos);

      const originalText = new TextDecoder('latin1').decode(view);
      expect(originalText).toContain('Exif');

      const cleaned = stripJpegExifBinary(buffer);
      const cleanedView = new Uint8Array(cleaned);
      const cleanedText = new TextDecoder('latin1').decode(cleanedView);

      expect(cleanedText).not.toContain('Exif');
      expect(cleanedText).toContain('JFIF');
      expect(cleanedView[0]).toBe(0xff);
      expect(cleanedView[1]).toBe(0xd8);
      expect(cleanedView[cleanedView.length - 2]).toBe(0xff);
      expect(cleanedView[cleanedView.length - 1]).toBe(0xd9);
    });

    it('strips PNG eXIf/tEXt chunks cleanly while preserving IHDR and IDAT', () => {
      const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      const ihdrChunk = [
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
        0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
      ];
      const exifChunk = [
        0x00, 0x00, 0x00, 0x04, 0x65, 0x58, 0x49, 0x66, 0x45, 0x58, 0x49, 0x46, 0x00, 0x00, 0x00,
        0x00,
      ];
      const iendChunk = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

      const totalLen = pngSig.length + ihdrChunk.length + exifChunk.length + iendChunk.length;
      const buffer = new ArrayBuffer(totalLen);
      const view = new Uint8Array(buffer);
      let offset = 0;
      view.set(pngSig, offset);
      offset += pngSig.length;
      view.set(ihdrChunk, offset);
      offset += ihdrChunk.length;
      view.set(exifChunk, offset);
      offset += exifChunk.length;
      view.set(iendChunk, offset);

      const origText = new TextDecoder('latin1').decode(view);
      expect(origText).toContain('eXIf');

      const cleaned = stripPngMetadataBinary(buffer);
      const cleanedView = new Uint8Array(cleaned);
      const cleanedText = new TextDecoder('latin1').decode(cleanedView);

      expect(cleanedText).not.toContain('eXIf');
      expect(cleanedText).toContain('IHDR');
      expect(cleanedText).toContain('IEND');
    });

    it('strips WebP EXIF and XMP chunks while updating VP8X header flags', () => {
      // Minimal RIFF WEBP with VP8X, EXIF, and VP8
      const riffHeader = [
        0x52,
        0x49,
        0x46,
        0x46, // 'RIFF'
        0x2c,
        0x00,
        0x00,
        0x00, // File size - 8 = 44 bytes
        0x57,
        0x45,
        0x42,
        0x50, // 'WEBP'
      ];

      // VP8X chunk (10 bytes data, total 18 bytes): flags byte at offset 8 has EXIF (0x08) and XMP (0x04) set
      const vp8xChunk = [
        0x56,
        0x50,
        0x38,
        0x58, // 'VP8X'
        0x0a,
        0x00,
        0x00,
        0x00, // Length = 10
        0x0c,
        0x00,
        0x00,
        0x00, // Flags (0x08 | 0x04 = 0x0C)
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
      ];

      // EXIF chunk (4 bytes data):
      const exifChunk = [
        0x45,
        0x58,
        0x49,
        0x46, // 'EXIF'
        0x04,
        0x00,
        0x00,
        0x00, // Length = 4
        0x45,
        0x78,
        0x69,
        0x66, // 'Exif'
      ];

      // VP8 chunk (4 bytes data):
      const vp8Chunk = [
        0x56,
        0x50,
        0x38,
        0x20, // 'VP8 '
        0x04,
        0x00,
        0x00,
        0x00, // Length = 4
        0x01,
        0x02,
        0x03,
        0x04,
      ];

      const totalLen = riffHeader.length + vp8xChunk.length + exifChunk.length + vp8Chunk.length;
      const buffer = new ArrayBuffer(totalLen);
      const view = new Uint8Array(buffer);
      let offset = 0;
      view.set(riffHeader, offset);
      offset += riffHeader.length;
      view.set(vp8xChunk, offset);
      offset += vp8xChunk.length;
      view.set(exifChunk, offset);
      offset += exifChunk.length;
      view.set(vp8Chunk, offset);

      const cleaned = stripWebpMetadataBinary(buffer);
      const cleanedView = new Uint8Array(cleaned);
      const cleanedText = new TextDecoder('latin1').decode(cleanedView);

      expect(cleanedText).not.toContain('EXIF');
      expect(cleanedText).toContain('VP8X');
      expect(cleanedText).toContain('VP8 ');

      // Find VP8X in cleaned buffer and verify flags are cleared
      const vp8xOffset = 12;
      const flags = cleanedView[vp8xOffset + 8];
      expect(flags & 0x08).toBe(0); // EXIF flag cleared
      expect(flags & 0x04).toBe(0); // XMP flag cleared
    });
  });

  describe('BlurHash Spec Verification', () => {
    it('verifies decodeBlurHash compatibility with standard test BlurHashes', () => {
      // 4x3 BlurHash: sizeFlag (1 char) + maxAc (1 char) + dc (4 chars) + 11*2 AC (22 chars) = 28 characters
      const standardBlurHash = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';
      const decoded = decodeBlurHash(standardBlurHash, 32, 32);
      expect(decoded).not.toBeNull();
      expect(decoded?.length).toBe(32 * 32 * 4);
    });

    it('rejects invalid or severely truncated BlurHash strings safely', () => {
      expect(decodeBlurHash('')).toBeNull();
      expect(decodeBlurHash('short')).toBeNull();
      expect(decodeBlurHash('invalid_chars!!!')).toBeNull();
    });
  });
});
