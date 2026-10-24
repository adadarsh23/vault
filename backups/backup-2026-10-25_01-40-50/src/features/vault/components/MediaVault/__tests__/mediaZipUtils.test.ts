import { describe, it, expect } from 'vitest';
import { calculateCRC32, createZipBlob } from '../mediaZipUtils';

describe('mediaZipUtils', () => {
  it('calculates accurate CRC32 for known strings', () => {
    const encoder = new TextEncoder();
    const helloData = encoder.encode('Hello World');
    const crc = calculateCRC32(helloData);
    expect(crc).toBe(0x4a17b156);
  });

  it('calculates CRC32 for empty byte array', () => {
    const crc = calculateCRC32(new Uint8Array(0));
    expect(crc).toBe(0);
  });

  it('generates a valid ZIP Blob containing multiple files with headers', async () => {
    const encoder = new TextEncoder();
    const files = [
      {
        name: 'photo1.jpg',
        data: encoder.encode('Fake JPEG Photo Content 1'),
      },
      {
        name: 'photo2.png',
        data: encoder.encode('Fake PNG Photo Content 2'),
      },
    ];

    const zipBlob = await createZipBlob(files);
    expect(zipBlob).toBeDefined();
    expect(zipBlob.type).toBe('application/zip');
    expect(zipBlob.size).toBeGreaterThan(0);

    const buffer = await zipBlob.arrayBuffer();
    const uint8 = new Uint8Array(buffer);

    // Verify ZIP magic number (PK\x03\x04)
    expect(uint8[0]).toBe(0x50);
    expect(uint8[1]).toBe(0x4b);
    expect(uint8[2]).toBe(0x03);
    expect(uint8[3]).toBe(0x04);
  });
});
