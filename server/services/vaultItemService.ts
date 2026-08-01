import { getVaultItemModel } from '../models/vaultItem.ts';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';
import { encryptBuffer } from '../utils/crypto.ts';
import fs from 'fs/promises';
import path from 'path';

const STORAGE_ROOT = path.join(process.cwd(), 'vault-storage');
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
  'photo',
  'video',
  'audio',
  'document',
  'note',
  'chat',
  'todo',
  'password',
  'secret',
  'contact',
  'location',
  'file',
  'other-files',
  'other',
  'settings',
  'system',
  'users',
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

  if (isBinary) {
    // Binary uploads via express.raw() put the whole Buffer in 'payload'
    // Metadata/Title are in headers (handled by controller and passed as input if possible)
    // Here we check for GridFS need
    if (payload.length > 12 * 1024 * 1024) {
      // We need a way to upload to GridFS here too.
      // For now, let's at least ensure we don't try to Base64 a 17MB buffer if we can avoid it,
      // though ScopedVaultItem is better for this.
      finalPayload = payload.toString('base64');
      encoding = 'base64';
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
  const DynamicVaultModel = getVaultItemModel(username);
  const items = await DynamicVaultModel.find({ userId, isDeleted: false }).lean().exec();
  return items;
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
  const { userId, itemId } = input;

  const DynamicVaultModel = getVaultItemModel(input.username);
  const result = await DynamicVaultModel.findOneAndUpdate(
    { userId, itemId },
    {
      isDeleted: true,
      deletedAt: new Date(),
      deviceId: input.deviceId,
      ipAddress: input.ipAddress,
    },
    { returnDocument: 'after' }
  );

  if (!result) {
    throw AppError.notFound('Vault item not found.', 'ITEM_NOT_FOUND');
  }

  return result;
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
  const userStorageDir = path.join(STORAGE_ROOT, userId.toString(), category);
  await fs.mkdir(userStorageDir, { recursive: true });

  logger.info(`Encrypting and saving file: ${file.originalname}`, {
    userId,
    category,
    size: file.size,
  });

  // 1. Encrypt Buffer with AES-256-GCM
  const encrypted = encryptBuffer(file.buffer);

  // 2. Save Encrypted CipherText to Disk
  const fileName = `${itemId}-${file.originalname}.enc`;
  const filePath = path.join(userStorageDir, fileName);

  await fs.writeFile(filePath, JSON.stringify(encrypted));

  // 3. Register in MongoDB with encryption metadata
  const DynamicVaultModel = getVaultItemModel(input.username);
  const newItem = new DynamicVaultModel({
    userId,
    itemId,
    category,
    folder: folder || null,
    file: {
      fileName: file.originalname,
      filePath: filePath, // Stores path to encrypted file
      mimeType: file.mimetype,
      size: file.size,
      encryptionIv: encrypted.iv,
      encryptionTag: encrypted.tag,
    },
    deviceId: input.deviceId,
    ipAddress: input.ipAddress,
  });

  return await newItem.save();
};
