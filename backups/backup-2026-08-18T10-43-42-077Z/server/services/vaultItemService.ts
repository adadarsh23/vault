import { getVaultItemModel } from '../models/vaultItem.ts';
import { aggregateVaultItems, deleteVaultItemAcrossClusters } from './multiClusterAggregator.ts';
import mongoose from 'mongoose';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';
import { encryptBuffer } from '../utils/crypto.ts';

const MAX_TEXT_PAYLOAD_BYTES = Math.max(
  1_000_000,
  Number(process.env.MAX_SCOPED_TEXT_PAYLOAD_BYTES || 4 * 1024 * 1024)
);

const CATEGORY_ALIAS_MAP: Record<string, string> = {
  note: 'note',
  notes: 'note',
  chat: 'chat',
  chats: 'chat',
  todo: 'todo',
  todos: 'todo',
  password: 'password',
  passwords: 'password',
  secret: 'secret',
  secrets: 'secret',
  secretkey: 'secret',
  secretkeys: 'secret',
  contact: 'contact',
  contacts: 'contact',
  location: 'location',
  locations: 'location',
  photo: 'photo',
  photos: 'photo',
  video: 'video',
  videos: 'video',
  audio: 'audio',
  audios: 'audio',
  document: 'document',
  documents: 'document',
  file: 'file',
  files: 'file',
  other: 'other',
  'other-files': 'other-files',
  other_files: 'other-files',
  otherfile: 'other-files',
  otherfiles: 'other-files',
  settings: 'settings',
  system: 'system',
  users: 'users',
  v2_items: 'file',
};

const ALLOWED_SCOPED_CATEGORIES = new Set([
  'audio',
  'card',
  'chat',
  'contact',
  'document',
  'file',
  'identity',
  'location',
  'note',
  'other',
  'other-files',
  'password',
  'photo',
  'secret',
  'settings',
  'system',
  'todo',
  'users',
  'video',
  'wifi',
]);

const normalizeCategory = (rawCategory: string): string => {
  const normalized = (rawCategory || '').trim().toLowerCase();
  const category = CATEGORY_ALIAS_MAP[normalized] || '';
  if (!category || !ALLOWED_SCOPED_CATEGORIES.has(category)) {
    throw AppError.badRequest('Unsupported vault category.', 'UNSUPPORTED_CATEGORY');
  }
  return category;
};

const parseMetadataSafe = (value: unknown): Record<string, unknown> => {
  if (!value) return {};

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
};

/**
 * Service for managing vault items (Photos, Notes, Passwords, etc.)
 */
export const saveEncryptedVaultItem = async (input: {
  userId: string;
  username: string;
  category: string;
  itemId?: string;
  folder?: string;
  payload: any;
  deviceId?: string;
  ipAddress?: string;
}) => {
  const { userId, category, folder, itemId, payload } = input;
  const normalizedCategory = normalizeCategory(category);
  const isBinary = Buffer.isBuffer(payload);
  let encoding = payload.encoding || 'utf-8';
  let finalPayload = '';
  let modernPayload = null;
  const itemTitle = typeof payload?.title === 'string' ? payload.title.trim().slice(0, 512) : '';
  const itemMetadata = parseMetadataSafe(payload?.metadata);

  let gridFsId: string | null = null;
  let filePath = `cloud://${itemId || Date.now()}`;

  if (isBinary) {
    if (
      payload.length > 8 * 1024 * 1024 &&
      mongoose.connection &&
      mongoose.connection.readyState === 1 &&
      mongoose.connection.db
    ) {
      try {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
          bucketName: 'vault_item_files',
        });
        const filename = `${userId}/${normalizedCategory}/${itemId || Date.now()}`;
        const uploadStream = bucket.openUploadStream(filename, {
          metadata: {
            userId,
            itemId: itemId || Date.now().toString(),
            category: normalizedCategory,
            folder: folder || itemMetadata.folder || null,
            size: payload.length,
          },
        });
        await new Promise<void>((resolve, reject) => {
          uploadStream.on('error', reject);
          uploadStream.on('finish', resolve);
          uploadStream.end(payload);
        });
        gridFsId = uploadStream.id?.toString?.() ?? itemId ?? null;
        if (gridFsId) {
          filePath = `cloud://${gridFsId}`;
        }
        encoding = 'gridfs-binary';
        finalPayload = '';
      } catch (gridErr) {
        logger.warn('Failed to stream large binary to GridFS, falling back to base64', {
          itemId,
          error: gridErr,
        });
        finalPayload = payload.toString('base64');
        encoding = 'base64';
      }
    } else {
      finalPayload = payload.toString('base64');
      encoding = 'base64';
    }
  } else {
    // Check if it's a modern V2 payload
    const rawPayload = payload.payload || '';
    if (typeof rawPayload === 'string' && rawPayload.startsWith('V2_MODERN:')) {
      modernPayload = rawPayload;
      encoding = 'modern';
    } else {
      finalPayload = typeof payload === 'string' ? payload : payload.payload || '';
    }
  }

  if (!isBinary && typeof finalPayload === 'string') {
    const payloadBytes = Buffer.byteLength(finalPayload, 'utf8');
    if (payloadBytes > MAX_TEXT_PAYLOAD_BYTES) {
      throw AppError.badRequest(
        'Encrypted payload exceeds secure size limits.',
        'PAYLOAD_TOO_LARGE'
      );
    }
  }

  const performUpsert = async () => {
    const isSingleton = itemId && ['__settings__', '__profile__', '__keycheck__'].includes(itemId);
    const isPinned = Boolean((itemMetadata as any)?.isPinned);
    const pinnedAtRaw = (itemMetadata as any)?.pinnedAt;
    const pinnedAt =
      isPinned && pinnedAtRaw
        ? new Date(pinnedAtRaw as string | number | Date)
        : isPinned
          ? new Date()
          : null;

    try {
      const DynamicVaultModel = getVaultItemModel(input.username);
      return await DynamicVaultModel.findOneAndUpdate(
        { userId, itemId: itemId || `item-${Date.now()}` },
        {
          userId,
          itemId,
          category: normalizedCategory,
          folder: folder || itemMetadata.folder || null,
          payload: finalPayload,
          modernPayload,
          encoding,
          title: itemTitle,
          file: {
            fileName:
              itemTitle ||
              (itemMetadata as any)?.fileName ||
              (itemMetadata as any)?.originalName ||
              'file',
            filePath,
            mimeType: (itemMetadata as any)?.mimeType || 'application/octet-stream',
            size: (itemMetadata as any)?.size || (isBinary ? payload.length : 0),
          },
          gridFsId: gridFsId || undefined,
          metadata: itemMetadata,
          isPinned,
          pinnedAt,
          deviceId: input.deviceId,
          ipAddress: input.ipAddress,
          updatedAt: new Date(),
          isDeleted: false,
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
    } catch (err: any) {
      const DynamicVaultModel = getVaultItemModel(input.username);
      if (err.code === 11000) {
        logger.warn(
          `Duplicate key error during upsert for item ${itemId}. Retrying with delete-and-insert for consistency.`,
          {
            userId,
            itemId,
            error: err.message,
          }
        );

        if (isSingleton) {
          // For singletons, we can be more aggressive to ensure they exist exactly once
          await DynamicVaultModel.deleteOne({ userId, itemId }).catch((error) => {
            logger.warn('Failed to delete singleton before upsert retry', {
              userId,
              itemId,
              error,
            });
          });
          const newItem = new DynamicVaultModel({
            userId,
            itemId,
            category: normalizedCategory,
            folder: folder || itemMetadata.folder || null,
            payload: finalPayload,
            modernPayload,
            encoding,
            title: itemTitle,
            metadata: itemMetadata,
            deviceId: input.deviceId,
            ipAddress: input.ipAddress,
          });
          return await newItem.save();
        }

        // Standard retry for non-singletons
        return await DynamicVaultModel.findOneAndUpdate(
          { userId, itemId },
          {
            category: normalizedCategory,
            folder: folder || itemMetadata.folder || null,
            payload: finalPayload,
            modernPayload,
            encoding,
            title: itemTitle,
            metadata: itemMetadata,
            deviceId: input.deviceId,
            ipAddress: input.ipAddress,
            updatedAt: new Date(),
          },
          { upsert: true, returnDocument: 'after' }
        );
      }
      throw err;
    }
  };

  const updatedItem = await performUpsert();

  return updatedItem;
};

export const getVaultSnapshot = async (userId: string, username: string) => {
  return aggregateVaultItems(username, userId);
};

export const deleteVaultItemByCategory = async (input: {
  userId: string;
  username: string;
  category: string;
  itemId: string;
  deviceId?: string;
  ipAddress?: string;
  clientUpdatedAt?: string;
}) => {
  const { userId, itemId, username } = input;

  const deletedCount = await deleteVaultItemAcrossClusters(username, userId, itemId, false);
  if (deletedCount === 0) {
    throw AppError.notFound('Vault item not found.', 'ITEM_NOT_FOUND');
  }

  return { itemId, isDeleted: true, deletedCount };
};

/**
 * For file uploads
 */
export const saveFileToVault = async (input: {
  userId: string;
  username: string;
  category: string;
  folder?: string;
  file: any; // Express.Multer.File with buffer
  clientUpdatedAt?: string;
  deviceId?: string;
  ipAddress?: string;
}) => {
  let { userId, category, folder, file } = input;

  if (!file.buffer) {
    throw AppError.badRequest('File data is missing from the request.', 'FILE_DATA_MISSING');
  }

  // Auto-detect category from MIME type if it's 'other-files' or 'other' or 'file'
  if (['other-files', 'other', 'file', 'v2_items'].includes(category)) {
    const mime = file.mimetype.toLowerCase();
    if (mime.startsWith('image/')) category = 'photo';
    else if (mime.startsWith('video/')) category = 'video';
    else if (mime.startsWith('audio/')) category = 'audio';
    else if (mime.startsWith('application/pdf') || mime.startsWith('text/')) category = 'document';
    else category = 'other-files';
  }

  const itemId = `file-${Date.now()}`;
  if (!mongoose.connection || mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    throw new AppError(503, 'DB_UNAVAILABLE', 'Database connection lost. Please try again later.');
  }

  logger.info(`Encrypting and streaming file to MongoDB GridFS: ${file.originalname}`, {
    userId,
    category,
    size: file.size,
  });

  const encrypted = encryptBuffer(file.buffer);
  const encryptedPayload = Buffer.from(JSON.stringify(encrypted), 'utf8');
  const filename = `${userId}/${category}/${itemId}-${file.originalname}`;
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'vault_item_files',
  });

  const uploadStream = bucket.openUploadStream(filename, {
    metadata: {
      userId,
      itemId,
      category,
      folder: folder || null,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      encryption: {
        algorithm: 'aes-256-gcm',
        iv: encrypted.iv,
        authTag: encrypted.tag,
        keyVersion: 'v1',
        keyId: 'vault-file-v1',
      },
    },
  });

  await new Promise<void>((resolve, reject) => {
    uploadStream.on('error', reject);
    uploadStream.on('finish', resolve);
    uploadStream.end(encryptedPayload);
  });

  const gridFsId = uploadStream.id?.toString?.() ?? itemId;
  const cloudFilePath = `cloud://${gridFsId}`;
  const DynamicVaultModel = getVaultItemModel(input.username);
  const newItem = new DynamicVaultModel({
    userId,
    itemId,
    category,
    folder: folder || null,
    file: {
      fileName: file.originalname,
      filePath: cloudFilePath,
      mimeType: file.mimetype,
      size: file.size,
      encryptionIv: encrypted.iv,
      encryptionTag: encrypted.tag,
    },
    gridFsId,
    encoding: 'gridfs-binary',
    deviceId: input.deviceId,
    ipAddress: input.ipAddress,
  });

  try {
    return await newItem.save();
  } finally {
    file.buffer.fill(0);
  }
};
