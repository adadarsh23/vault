/**
 * mediaZipUtils.ts
 * Lightweight client-side ZIP generator for batch media downloads.
 * Uses standard ZIP format specifications (Store mode / 0 compression or native deflate)
 * with full CRC-32 integrity calculation, producing valid cross-platform ZIP files
 * without external dependencies.
 */

// CRC-32 Lookup Table
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function calculateCRC32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipFileInput {
  name: string;
  data: Uint8Array;
  lastModified?: Date;
}

/**
 * Creates a standard ZIP archive as a Blob from a list of files in memory.
 */
export async function createZipBlob(files: ZipFileInput[]): Promise<Blob> {
  const fileRecords: {
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc32: number;
    size: number;
    offset: number;
    dosTime: number;
    dosDate: number;
  }[] = [];

  let currentOffset = 0;
  const localChunks: Uint8Array[] = [];

  const encoder = new TextEncoder();

  for (const file of files) {
    const nameBytes = encoder.encode(file.name.replace(/\\/g, '/'));
    const data = file.data;
    const crc = calculateCRC32(data);
    const size = data.length;

    const modDate = file.lastModified || new Date();
    const dosTime =
      ((modDate.getHours() & 0x1f) << 11) |
      ((modDate.getMinutes() & 0x3f) << 5) |
      ((modDate.getSeconds() >> 1) & 0x1f);
    const dosDate =
      (((modDate.getFullYear() - 1980) & 0x7f) << 9) |
      (((modDate.getMonth() + 1) & 0xf) << 5) |
      (modDate.getDate() & 0x1f);

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(localHeader.buffer);

    view.setUint32(0, 0x04034b50, true); // Local file header signature
    view.setUint16(4, 20, true); // Version needed to extract (2.0)
    view.setUint16(6, 0x0800, true); // General purpose bit flag (UTF-8 filename)
    view.setUint16(8, 0, true); // Compression method: 0 = Store (no compression)
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, crc, true); // CRC-32
    view.setUint32(18, size, true); // Compressed size
    view.setUint32(22, size, true); // Uncompressed size
    view.setUint16(26, nameBytes.length, true); // File name length
    view.setUint16(28, 0, true); // Extra field length

    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader);
    localChunks.push(data);

    fileRecords.push({
      nameBytes,
      data,
      crc32: crc,
      size,
      offset: currentOffset,
      dosTime,
      dosDate,
    });

    currentOffset += localHeader.length + data.length;
  }

  // Central Directory Records
  const centralDirChunks: Uint8Array[] = [];
  let centralDirSize = 0;
  const centralDirStartOffset = currentOffset;

  for (const record of fileRecords) {
    const cdHeader = new Uint8Array(46 + record.nameBytes.length);
    const view = new DataView(cdHeader.buffer);

    view.setUint32(0, 0x02014b50, true); // Central directory file header signature
    view.setUint16(4, 20, true); // Version made by
    view.setUint16(6, 20, true); // Version needed to extract
    view.setUint16(8, 0x0800, true); // General purpose bit flag (UTF-8)
    view.setUint16(10, 0, true); // Compression method (Store)
    view.setUint16(12, record.dosTime, true);
    view.setUint16(14, record.dosDate, true);
    view.setUint32(16, record.crc32, true);
    view.setUint32(20, record.size, true);
    view.setUint32(24, record.size, true);
    view.setUint16(28, record.nameBytes.length, true);
    view.setUint16(30, 0, true); // Extra field length
    view.setUint16(32, 0, true); // File comment length
    view.setUint16(34, 0, true); // Disk number start
    view.setUint16(36, 0, true); // Internal file attributes
    view.setUint32(38, 0, true); // External file attributes
    view.setUint32(42, record.offset, true); // Relative offset of local header

    cdHeader.set(record.nameBytes, 46);

    centralDirChunks.push(cdHeader);
    centralDirSize += cdHeader.length;
  }

  // End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true); // Number of this disk
  eocdView.setUint16(6, 0, true); // Disk with central directory
  eocdView.setUint16(8, fileRecords.length, true); // Total entries on this disk
  eocdView.setUint16(10, fileRecords.length, true); // Total entries in central directory
  eocdView.setUint32(12, centralDirSize, true); // Size of central directory
  eocdView.setUint32(16, centralDirStartOffset, true); // Offset of start of central directory
  eocdView.setUint16(20, 0, true); // ZIP comment length

  const allParts = [...localChunks, ...centralDirChunks, eocd];
  return new Blob(allParts as BlobPart[], { type: 'application/zip' });
}

/**
 * Triggers a browser download of a Blob with the given filename.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
