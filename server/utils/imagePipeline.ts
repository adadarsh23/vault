import path from 'path';
import { logger } from './logger.ts';

type SharpLike = {
  (input: Buffer): {
    rotate: () => any;
    withMetadata: (metadata?: any) => any;
    jpeg: (opts?: any) => any;
    webp: (opts?: any) => any;
    avif: (opts?: any) => any;
    toBuffer: () => Promise<Buffer>;
  };
};

const PHOTO_NORMALIZATION_ENABLED =
  (process.env.PHOTO_NORMALIZATION_ENABLED?.trim().toLowerCase() || 'false') === 'true';
const DEFAULT_KEEP_PHOTO_METADATA =
  (process.env.DEFAULT_KEEP_PHOTO_METADATA?.trim().toLowerCase() || 'false') === 'true';
const PHOTO_NORMALIZATION_FORMAT = (process.env.PHOTO_NORMALIZATION_FORMAT?.trim().toLowerCase() ||
  'jpeg') as 'jpeg' | 'webp' | 'avif';

const JPEG_SOI = 0xff;
const JPEG_MARKER = 0xd8;

const loadSharp = async (): Promise<SharpLike | null> => {
  try {
    const dynamicImport = new Function('moduleName', 'return import(moduleName)') as (
      moduleName: string
    ) => Promise<{ default: SharpLike }>;
    const sharpModule = await dynamicImport('sharp');
    return sharpModule.default;
  } catch {
    return null;
  }
};

const isJpeg = (buffer: Buffer) =>
  buffer.length > 4 && buffer[0] === JPEG_SOI && buffer[1] === JPEG_MARKER;

const stripExifFromJpeg = (buffer: Buffer): Buffer => {
  if (!isJpeg(buffer)) {
    return buffer;
  }
  const chunks: Buffer[] = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      break;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xda) {
      chunks.push(buffer.subarray(offset));
      break;
    }
    if (marker === 0xd9) {
      chunks.push(buffer.subarray(offset, offset + 2));
      break;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) {
      return buffer;
    }
    const nextOffset = offset + 2 + segmentLength;
    // Strip APP1..APP15 (0xE1..0xEF) and COM (0xFE) metadata segments
    const isMetadataSegment = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadataSegment) {
      chunks.push(buffer.subarray(offset, nextOffset));
    }
    offset = nextOffset;
  }
  return Buffer.concat(chunks);
};

const normalizedExtension = (format: 'jpeg' | 'webp' | 'avif') =>
  format === 'jpeg' ? 'jpg' : format;
const normalizedMimeType = (format: 'jpeg' | 'webp' | 'avif') =>
  format === 'jpeg' ? 'image/jpeg' : `image/${format}`;

export interface PhotoPipelineResult {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  keepMetadata: boolean;
}

export const processPhotoUpload = async (input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  keepMetadata?: boolean;
}): Promise<PhotoPipelineResult> => {
  const keepMetadata =
    typeof input.keepMetadata === 'boolean' ? input.keepMetadata : DEFAULT_KEEP_PHOTO_METADATA;

  let nextBuffer = input.buffer;
  let nextName = input.fileName;
  let nextMimeType = input.mimeType;

  if (!keepMetadata) {
    nextBuffer = stripExifFromJpeg(nextBuffer);
  }

  if (PHOTO_NORMALIZATION_ENABLED) {
    const sharp = await loadSharp();
    if (!sharp) {
      logger.warn('PHOTO_NORMALIZATION_ENABLED is true but sharp is not installed.');
    } else {
      try {
        const transformer = sharp(nextBuffer).rotate();
        if (keepMetadata) {
          transformer.withMetadata();
        } else {
          transformer.withMetadata({});
        }
        if (PHOTO_NORMALIZATION_FORMAT === 'webp') {
          nextBuffer = await transformer.webp({ quality: 88 }).toBuffer();
        } else if (PHOTO_NORMALIZATION_FORMAT === 'avif') {
          nextBuffer = await transformer.avif({ quality: 60 }).toBuffer();
        } else {
          nextBuffer = await transformer.jpeg({ quality: 90 }).toBuffer();
        }
        const ext = normalizedExtension(PHOTO_NORMALIZATION_FORMAT);
        nextName = `${path.parse(nextName).name}.${ext}`;
        nextMimeType = normalizedMimeType(PHOTO_NORMALIZATION_FORMAT);
      } catch (error) {
        logger.error('Photo normalization failed; keeping original processed bytes.', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    buffer: nextBuffer,
    fileName: nextName,
    mimeType: nextMimeType,
    keepMetadata,
  };
};
