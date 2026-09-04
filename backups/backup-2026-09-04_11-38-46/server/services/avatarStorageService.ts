// avatarStorageService.ts
// Centralized MongoDB Atlas GridFS storage service for avatar binary files

import mongoose from 'mongoose';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';

/**
 * Returns GridFSBucket for avatar storage if MongoDB connection is ready
 */
export const getAvatarGridFsBucket = (): mongoose.mongo.GridFSBucket | null => {
  if (mongoose.connection && mongoose.connection.readyState === 1 && mongoose.connection.db) {
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'avatars',
    });
  }
  return null;
};

export const getContentTypeFromExt = (ext: string): string => {
  const normalized = ext.toLowerCase().replace(/^\./, '');
  if (normalized === 'avif') return 'image/avif';
  if (normalized === 'webp') return 'image/webp';
  if (normalized === 'png') return 'image/png';
  if (normalized === 'gif') return 'image/gif';
  if (normalized === 'svg') return 'image/svg+xml';
  return 'image/jpeg';
};

export const getExtFromMimeType = (mimeType: string): string => {
  const lower = mimeType.toLowerCase();
  if (lower.includes('avif')) return 'avif';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('png')) return 'png';
  if (lower.includes('gif')) return 'gif';
  if (lower.includes('svg')) return 'svg';
  return 'jpeg';
};

/**
 * Magic Byte Inspector for Security & Content Integrity
 */
export const isValidImageMagicBytes = (buffer: Buffer): boolean => {
  if (!buffer || buffer.length < 4) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
    return true;

  // GIF: GIF87a / GIF89a (47 49 46 38)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38)
    return true;

  // WebP: RIFF (52 49 46 46) ... WEBP (57 45 42 50 at offset 8)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return true;
  }

  // AVIF / HEIC: ftyp at offset 4 (66 74 79 70)
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return true;
  }

  // SVG: <?xml or <svg
  const snippet = buffer.subarray(0, 100).toString('utf8').trim().toLowerCase();
  if (snippet.startsWith('<?xml') || snippet.startsWith('<svg') || snippet.includes('<svg')) {
    return true;
  }

  return false;
};

/**
 * Stores avatar binary buffer to MongoDB Atlas GridFS (with disk fallback)
 * Returns the immutable public avatar URL path
 */
export async function storeAvatarBuffer(
  userId: string,
  buffer: Buffer,
  mimeOrExt: string,
  customHash?: string,
): Promise<{ publicPath: string; contentHash: string; filename: string }> {
  const sanitizedUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '') || 'u_default';
  const ext = mimeOrExt.includes('/')
    ? getExtFromMimeType(mimeOrExt)
    : mimeOrExt.replace(/^\./, '');
  const contentType = getContentTypeFromExt(ext);

  if (!isValidImageMagicBytes(buffer)) {
    throw new Error('Invalid image binary magic bytes: payload is corrupted or not an image.');
  }

  const contentHash =
    customHash?.replace(/[^a-zA-Z0-9_-]/g, '') ||
    crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);

  const gridFsFilename = `${sanitizedUserId}/${contentHash}.${ext}`;
  const bucket = getAvatarGridFsBucket();
  let wroteToGridFs = false;

  if (bucket) {
    try {
      const existingFiles = await bucket.find({ filename: gridFsFilename }).toArray();
      for (const file of existingFiles) {
        await bucket.delete(file._id).catch(() => {});
      }

      const uploadStream = bucket.openUploadStream(gridFsFilename, {
        contentType,
        metadata: {
          userId: sanitizedUserId,
          contentHash,
          ext,
          uploadedAt: new Date(),
        },
      } as any);

      await new Promise<void>((resolve, reject) => {
        uploadStream.on('finish', () => resolve());
        uploadStream.on('error', (err) => reject(err));
        uploadStream.end(buffer);
      });
      wroteToGridFs = true;
    } catch (cloudErr) {
      console.error(
        'Failed to write avatar to MongoDB Atlas GridFS, falling back to disk:',
        cloudErr,
      );
    }
  }

  if (!wroteToGridFs) {
    const localDir = path.join(process.cwd(), 'uploads', 'avatars', sanitizedUserId);
    await fs.mkdir(localDir, { recursive: true });
    const localFilePath = path.join(localDir, `${contentHash}.${ext}`);
    await fs.writeFile(localFilePath, buffer);
  }

  const publicPath = `/api/avatar/raw/${sanitizedUserId}/${contentHash}.${ext}`;
  return { publicPath, contentHash, filename: gridFsFilename };
}

/**
 * Converts a base64 data URI (e.g. data:image/png;base64,...) to binary buffer,
 * stores it into MongoDB GridFS, and returns the clean /api/avatar/raw/... path.
 */
export async function convertBase64ToAvatar(
  userId: string,
  base64DataUri: string,
): Promise<string | null> {
  if (!base64DataUri || typeof base64DataUri !== 'string') {
    return null;
  }

  const match = base64DataUri.match(/^data:(image\/[a-zA-Z0-9.+\-]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const mimeType = match[1];
  const base64Data = match[2];

  try {
    const buffer = Buffer.from(base64Data, 'base64');
    if (!buffer || buffer.length === 0 || !isValidImageMagicBytes(buffer)) {
      return null;
    }

    const { publicPath } = await storeAvatarBuffer(userId, buffer, mimeType);
    return publicPath;
  } catch (err) {
    console.error('Failed to convert base64 profile photo to GridFS avatar:', err);
    return null;
  }
}
