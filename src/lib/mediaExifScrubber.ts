/**
 * Pure TypeScript Zero-Dependency EXIF & GPS Metadata Scrubber
 *
 * Auto-wipes GPS coordinates, camera make/model, device serial numbers,
 * lens specifications, XMP packets, IPTC headers, and comment segments
 * directly at the binary stream level before client-side encryption.
 */

const PNG_METADATA_CHUNK_NAMES = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

/**
 * Strips all metadata markers (APP1..APP15, COM) directly from JPEG binary buffers.
 * Preserves SOI, JFIF, DQT, SOF, DHT, DRI, and SOS image stream segments.
 */
export function stripJpegExifBinary(buffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) {
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

    if (offset + 2 > view.byteLength) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > view.byteLength) break;

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
 * Strips EXIF (eXIf), text (tEXt, zTXt, iTXt), and timestamp (tIME) chunks
 * directly from PNG binary buffers.
 */
export function stripPngMetadataBinary(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (
    bytes.length < 8 ||
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

    const totalChunkLength = 12 + chunkLength; // 4 len + 4 type + data + 4 crc
    if (offset + totalChunkLength > bytes.length) {
      break;
    }

    if (!PNG_METADATA_CHUNK_NAMES.has(chunkType)) {
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
 * Strips EXIF and XMP chunks from WebP RIFF binary containers.
 */
export function stripWebpMetadataBinary(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12) return buffer;

  // Direct byte comparison: 'RIFF' and 'WEBP'
  const isWebp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  if (!isWebp) {
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
      break;
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

  result.set(bytes.subarray(0, 4), 0); // 'RIFF'
  const outView = new DataView(result.buffer);
  outView.setUint32(4, totalLength - 8, true);
  result.set(bytes.subarray(8, 12), 8); // 'WEBP'

  let pos = 12;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.byteLength;
  }

  return result.buffer;
}

/**
 * Universal synchronous in-memory metadata scrubber.
 * Handles JPEG, PNG, WebP binary formats deterministically.
 */
export function stripExifInMemory(buffer: ArrayBuffer, mimeType?: string): ArrayBuffer {
  const normalizedMime = (mimeType || '').toLowerCase();
  const bytes = new Uint8Array(buffer);

  // Check JPEG signature
  if (
    normalizedMime.includes('jpeg') ||
    normalizedMime.includes('jpg') ||
    (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8)
  ) {
    return stripJpegExifBinary(buffer);
  }

  // Check PNG signature
  if (
    normalizedMime.includes('png') ||
    (bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47)
  ) {
    return stripPngMetadataBinary(buffer);
  }

  // Check WebP signature
  if (
    normalizedMime.includes('webp') ||
    (bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50)
  ) {
    return stripWebpMetadataBinary(buffer);
  }

  return buffer;
}
