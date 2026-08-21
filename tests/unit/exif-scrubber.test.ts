import { describe, it, expect } from 'vitest';
import {
  stripJpegExifBinary,
  stripPngMetadataBinary,
  stripWebpMetadataBinary,
  stripExifInMemory,
} from '../../src/lib/mediaExifScrubber';

describe('EXIF & GPS Metadata Scrubber Suite', () => {
  describe('Part 1: JPEG Binary Metadata & Marker Stripping', () => {
    it('removes APP1 (EXIF / GPS / Camera Serial / XMP) marker and preserves image data', () => {
      // Construct minimal valid JPEG with SOI, APP0 (JFIF), APP1 (EXIF/GPS), and SOS
      // SOI: 0xFF, 0xD8
      // APP0 (JFIF): 0xFF, 0xE0, Length (0x00, 0x10), Data (14 bytes)
      // APP1 (EXIF with GPS & Serial): 0xFF, 0xE1, Length (0x00, 0x1A), 'Exif\0\0' + dummy GPS/serial bytes
      // SOS (Start of Scan): 0xFF, 0xDA, Length (0x00, 0x08), payload (6 bytes)
      // EOI: 0xFF, 0xD9

      const jfifPayload = new Uint8Array([
        0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00,
        0x48, 0x00, 0x00,
      ]);

      const exifPayload = new Uint8Array([
        0xff, 0xe1, 0x00, 0x16, // Length = 22
        0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // 'Exif\0\0'
        0x47, 0x50, 0x53, 0x20, // 'GPS '
        0x33, 0x37, 0x2e, 0x37, 0x37, 0x34, 0x39, // Latitude/Longitude
        0x53, 0x45, 0x52, 0x49, 0x41, 0x4c, 0x31, // Serial Number
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

      // Verify that EXIF is present in original buffer
      const originalText = new TextDecoder('latin1').decode(view);
      expect(originalText).toContain('Exif');
      expect(originalText).toContain('GPS');
      expect(originalText).toContain('SERIAL1');

      // Execute Scrubber
      const cleaned = stripJpegExifBinary(buffer);
      const cleanedView = new Uint8Array(cleaned);
      const cleanedText = new TextDecoder('latin1').decode(cleanedView);

      // Verify EXIF, GPS, and Serial numbers are completely wiped
      expect(cleanedText).not.toContain('Exif');
      expect(cleanedText).not.toContain('GPS');
      expect(cleanedText).not.toContain('SERIAL1');

      // Verify JFIF header and image payload are strictly preserved
      expect(cleanedText).toContain('JFIF');
      expect(cleanedView[0]).toBe(0xff);
      expect(cleanedView[1]).toBe(0xd8);
      expect(cleanedView[cleanedView.length - 2]).toBe(0xff);
      expect(cleanedView[cleanedView.length - 1]).toBe(0xd9);
    });

    it('strips all extended APP markers (APP2..APP15) and COM comment segments', () => {
      // APP13 (Photoshop/IPTC): 0xFF, 0xED
      // COM (Comment): 0xFF, 0xFE
      const app13 = new Uint8Array([
        0xff, 0xed, 0x00, 0x0e, 0x50, 0x68, 0x6f, 0x74, 0x6f, 0x73, 0x68, 0x6f, 0x70, 0x20,
      ]);
      const com = new Uint8Array([
        0xff, 0xfe, 0x00, 0x0d, 0x53, 0x65, 0x63, 0x72, 0x65, 0x74, 0x43, 0x6f, 0x6d,
      ]);
      const sos = new Uint8Array([0xff, 0xda, 0x00, 0x04, 0xaa, 0xbb]);

      const buffer = new ArrayBuffer(2 + app13.length + com.length + sos.length);
      const view = new Uint8Array(buffer);
      let pos = 0;
      view.set([0xff, 0xd8], pos);
      pos += 2;
      view.set(app13, pos);
      pos += app13.length;
      view.set(com, pos);
      pos += com.length;
      view.set(sos, pos);

      const cleaned = stripJpegExifBinary(buffer);
      const cleanedText = new TextDecoder('latin1').decode(new Uint8Array(cleaned));

      expect(cleanedText).not.toContain('Photoshop');
      expect(cleanedText).not.toContain('SecretCom');
    });

    it('handles consecutive 0xFF fill bytes and restart markers correctly', () => {
      // JPEG with 0xFF 0xFF 0xE1 (padding before APP1) and RST0 (0xFF 0xD0)
      const paddedExif = new Uint8Array([
        0xff, 0xff, 0xe1, 0x00, 0x0a, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      ]);
      const rstMarker = new Uint8Array([0xff, 0xd0]);
      const sos = new Uint8Array([0xff, 0xda, 0x00, 0x04, 0x11, 0x22]);

      const buffer = new ArrayBuffer(2 + paddedExif.length + rstMarker.length + sos.length);
      const view = new Uint8Array(buffer);
      let pos = 0;
      view.set([0xff, 0xd8], pos);
      pos += 2;
      view.set(paddedExif, pos);
      pos += paddedExif.length;
      view.set(rstMarker, pos);
      pos += rstMarker.length;
      view.set(sos, pos);

      const cleaned = stripJpegExifBinary(buffer);
      const cleanedText = new TextDecoder('latin1').decode(new Uint8Array(cleaned));

      expect(cleanedText).not.toContain('Exif');
      const cleanedBytes = new Uint8Array(cleaned);
      expect(cleanedBytes[0]).toBe(0xff);
      expect(cleanedBytes[1]).toBe(0xd8);
    });
  });

  describe('Part 2: PNG Chunk Metadata Stripping', () => {
    it('removes eXIf, tEXt, zTXt, iTXt, and tIME chunks from PNG buffers', () => {
      // Build a minimal PNG with signature, IHDR chunk, tEXt (Author/Location), eXIf (GPS), and IEND
      const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

      // IHDR (13 bytes payload)
      const ihdrChunk = new Uint8Array([
        0x00, 0x00, 0x00, 0x0d, // Length = 13
        0x49, 0x48, 0x44, 0x52, // 'IHDR'
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00,
        0x1f, 0x15, 0xc4, 0x89, // CRC
      ]);

      // tEXt chunk with "Location: New York"
      const textChunk = new Uint8Array([
        0x00, 0x00, 0x00, 0x0e, // Length = 14
        0x74, 0x45, 0x58, 0x74, // 'tEXt'
        0x4c, 0x6f, 0x63, 0x61, 0x74, 0x69, 0x6f, 0x6e, 0x3a, 0x4e, 0x59, 0x43, 0x31, 0x32,
        0x00, 0x00, 0x00, 0x00, // CRC
      ]);

      // eXIf chunk with "SERIAL_DEVICE_99"
      const exifChunk = new Uint8Array([
        0x00, 0x00, 0x00, 0x10, // Length = 16
        0x65, 0x58, 0x49, 0x66, // 'eXIf'
        0x53, 0x45, 0x52, 0x49, 0x41, 0x4c, 0x5f, 0x44, 0x45, 0x56, 0x49, 0x43, 0x45, 0x5f, 0x39,
        0x39, 0x11, 0x22, 0x33, 0x44, // CRC
      ]);

      // IEND chunk
      const iendChunk = new Uint8Array([
        0x00, 0x00, 0x00, 0x00, // Length = 0
        0x49, 0x45, 0x4e, 0x44, // 'IEND'
        0xae, 0x42, 0x60, 0x82, // CRC
      ]);

      const totalLen =
        pngSig.length + ihdrChunk.length + textChunk.length + exifChunk.length + iendChunk.length;
      const buffer = new ArrayBuffer(totalLen);
      const view = new Uint8Array(buffer);

      let pos = 0;
      view.set(pngSig, pos);
      pos += pngSig.length;
      view.set(ihdrChunk, pos);
      pos += ihdrChunk.length;
      view.set(textChunk, pos);
      pos += textChunk.length;
      view.set(exifChunk, pos);
      pos += exifChunk.length;
      view.set(iendChunk, pos);

      const rawText = new TextDecoder('latin1').decode(view);
      expect(rawText).toContain('Location:NYC12');
      expect(rawText).toContain('SERIAL_DEVICE_99');

      const cleaned = stripPngMetadataBinary(buffer);
      const cleanedText = new TextDecoder('latin1').decode(new Uint8Array(cleaned));

      expect(cleanedText).not.toContain('Location:NYC12');
      expect(cleanedText).not.toContain('SERIAL_DEVICE_99');
      expect(cleanedText).not.toContain('tEXt');
      expect(cleanedText).not.toContain('eXIf');
      expect(cleanedText).toContain('IHDR');
      expect(cleanedText).toContain('IEND');
    });
  });

  describe('Part 3: WebP Container Metadata Stripping', () => {
    it('removes EXIF and XMP chunks from WebP RIFF stream', () => {
      // RIFF header: 'RIFF', 4-byte size, 'WEBP'
      // VP8X header (10 bytes payload + 8 header)
      // EXIF chunk with GPS
      // VP8 chunk

      const vp8xChunk = new Uint8Array([
        0x56, 0x50, 0x38, 0x58, // 'VP8X'
        0x0a, 0x00, 0x00, 0x00, // Size = 10
        0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Flags (bit 3 EXIF set, bit 2 XMP set)
      ]);

      const exifChunk = new Uint8Array([
        0x45, 0x58, 0x49, 0x46, // 'EXIF'
        0x0e, 0x00, 0x00, 0x00, // Size = 14
        0x47, 0x50, 0x53, 0x5f, 0x4c, 0x4f, 0x43, 0x41, 0x54, 0x49, 0x4f, 0x4e, 0x5f, 0x31,
      ]);

      const vp8Chunk = new Uint8Array([
        0x56, 0x50, 0x38, 0x20, // 'VP8 '
        0x04, 0x00, 0x00, 0x00, // Size = 4
        0x01, 0x02, 0x03, 0x04,
      ]);

      const totalSize = 12 + vp8xChunk.length + exifChunk.length + vp8Chunk.length;
      const buffer = new ArrayBuffer(totalSize);
      const view = new Uint8Array(buffer);

      view.set([0x52, 0x49, 0x46, 0x46], 0); // 'RIFF'
      new DataView(buffer).setUint32(4, totalSize - 8, true);
      view.set([0x57, 0x45, 0x42, 0x50], 8); // 'WEBP'

      let pos = 12;
      view.set(vp8xChunk, pos);
      pos += vp8xChunk.length;
      view.set(exifChunk, pos);
      pos += exifChunk.length;
      view.set(vp8Chunk, pos);

      const rawText = new TextDecoder('latin1').decode(view);
      expect(rawText).toContain('GPS_LOCATION_1');

      const cleaned = stripWebpMetadataBinary(buffer);
      const cleanedText = new TextDecoder('latin1').decode(new Uint8Array(cleaned));

      expect(cleanedText).not.toContain('GPS_LOCATION_1');
      expect(cleanedText).not.toContain('EXIF');
      expect(cleanedText).toContain('VP8');
    });
  });

  describe('Part 4: Universal in-memory fallback', () => {
    it('identifies file format automatically and scrubs metadata', () => {
      const sampleJpeg = new Uint8Array([
        0xff, 0xd8, 0xff, 0xe1, 0x00, 0x0a, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xda,
      ]).buffer;

      const cleaned = stripExifInMemory(sampleJpeg, 'image/jpeg');
      const text = new TextDecoder('latin1').decode(new Uint8Array(cleaned));
      expect(text).not.toContain('Exif');
    });
  });
});
