import express from 'express';
import mongoose from 'mongoose';
import { getFolderModel } from '../models/folder.ts';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import { initializeDefaultUserFolders, isProtectedFolderName } from '../services/folderService.ts';
import { logger } from '../utils/logger.ts';
import {
  decryptFolderName,
  encryptFolderName,
  hashFolderName,
} from '../services/folderCryptoService.ts';
import { AppError } from '../utils/appError.ts';
import { sendSuccess } from '../responses.ts';

const MAX_FOLDER_NAME_LENGTH = 100;

const normalizeFolderName = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeFolderItemTypeInput = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const FOLDER_ITEM_TYPE_ALIASES: Record<string, string[]> = {
  note: ['note', 'notes'],
  chat: ['chat', 'chats'],
  todo: ['todo', 'todos'],
  password: ['password', 'passwords'],
  secret: ['secret', 'secrets', 'secretkey', 'secretkeys'],
  contact: ['contact', 'contacts'],
  location: ['location', 'locations'],
  photo: ['photo', 'photos'],
  video: ['video', 'videos'],
  audio: ['audio', 'audios'],
  document: ['document', 'documents'],
  file: ['file', 'files'],
  'other-files': ['other-files', 'other_files', 'otherfile', 'otherfiles'],
  card: ['card', 'cards'],
  identity: ['identity', 'identities'],
  wifi: ['wifi', 'wifis'],
};

const resolveCanonicalFolderItemType = (value: unknown): string => {
  const normalized = normalizeFolderItemTypeInput(value);
  if (!normalized) return '';

  for (const [canonical, aliases] of Object.entries(FOLDER_ITEM_TYPE_ALIASES)) {
    if (aliases.includes(normalized)) {
      return canonical;
    }
  }

  return normalized;
};

const resolveFolderItemTypeCandidates = (value: unknown): string[] => {
  const canonical = resolveCanonicalFolderItemType(value);
  if (!canonical) return [];
  const aliases = FOLDER_ITEM_TYPE_ALIASES[canonical] || [canonical];
  return Array.from(new Set([canonical, ...aliases]));
};

const hydrateFolder = (folder: any) => {
  const normalizedItemType = resolveCanonicalFolderItemType(folder.itemType);
  try {
    const decrypted = decryptFolderName(folder.name);
    return {
      ...folder,
      name: decrypted || (typeof folder.name === 'string' ? folder.name : ''),
      itemType: normalizedItemType || folder.itemType,
    };
  } catch {
    return {
      ...folder,
      name: typeof folder.name === 'string' ? folder.name : '',
      itemType: normalizedItemType || folder.itemType,
    };
  }
};

const loadHydratedFolders = async (username: string, userId: string) => {
  const Folder = getFolderModel(username);
  const folders = await Folder.find({ userId }).lean().exec();
  const deduped = new Map<string, any>();

  for (const folder of folders.map(hydrateFolder)) {
    const folderName = normalizeFolderName(folder.name).toLowerCase();
    const folderType = resolveCanonicalFolderItemType(folder.itemType || '');
    const parentId = typeof folder.parentId === 'string' ? folder.parentId : 'root';
    const key = `${folderType}|${folderName}|${parentId}`;
    if (!deduped.has(key)) {
      deduped.set(key, folder);
    }
  }

  return Array.from(deduped.values());
};

export const initializeFoldersController = async (
  req: AuthenticatedRequest,
  res: express.Response,
) => {
  const { userId, username } = req.user;
  try {
    await initializeDefaultUserFolders(userId, username);
    const hydrated = await loadHydratedFolders(username, userId);
    return sendSuccess(res, hydrated, 'Folders initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize folders', { userId, username, error });
    throw AppError.internal('Failed to initialize folders', 'FOLDER_INIT_FAILED');
  }
};

export const getFoldersController = async (req: AuthenticatedRequest, res: express.Response) => {
  const { userId, username } = req.user;
  try {
    await initializeDefaultUserFolders(userId, username);
    const hydrated = await loadHydratedFolders(username, userId);
    return sendSuccess(res, hydrated, 'Folders fetched successfully');
  } catch (error) {
    logger.error('Failed to fetch folders', { userId, username, error });
    throw AppError.internal('Failed to fetch folders', 'FOLDER_FETCH_FAILED');
  }
};

export const createFolderController = async (req: AuthenticatedRequest, res: express.Response) => {
  const { name, itemType, parentId } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw AppError.badRequest('Folder name is required', 'FOLDER_NAME_REQUIRED');
  }

  if (!itemType || typeof itemType !== 'string' || !itemType.trim()) {
    throw AppError.badRequest('itemType is required', 'ITEM_TYPE_REQUIRED');
  }

  const folderName = normalizeFolderName(name);
  if (folderName.length > MAX_FOLDER_NAME_LENGTH) {
    throw AppError.badRequest(
      `Folder name must not exceed ${MAX_FOLDER_NAME_LENGTH} characters`,
      'FOLDER_NAME_TOO_LONG',
    );
  }

  const canonicalItemType = resolveCanonicalFolderItemType(itemType);
  const itemTypeCandidates = resolveFolderItemTypeCandidates(itemType);

  if (!canonicalItemType) {
    throw AppError.badRequest('itemType is invalid', 'INVALID_ITEM_TYPE');
  }

  if (isProtectedFolderName(folderName)) {
    throw AppError.forbidden(
      'Saved folders are reserved and cannot be created manually',
      'RESERVED_FOLDER_NAME',
    );
  }

  const { userId, username } = req.user;
  try {
    await initializeDefaultUserFolders(userId, username);

    const Folder = getFolderModel(username);
    const folderNameHash = hashFolderName(folderName);
    const encryptedFolderName = encryptFolderName(folderName);

    // 1. Resolve "vault_items" root folder
    const rootFolder = await Folder.findOne({
      userId,
      nameHash: hashFolderName('vault_items'),
      itemType: 'system',
      parentId: null,
    })
      .lean()
      .exec();

    if (!rootFolder) {
      throw AppError.internal('Root folder missing after initialization', 'ROOT_FOLDER_MISSING');
    }

    // 2. Resolve username folder inside "vault_items"
    const userFolder = await Folder.findOne({
      userId,
      nameHash: hashFolderName(username),
      itemType: 'system',
      parentId: rootFolder._id.toString(),
    })
      .lean()
      .exec();

    if (!userFolder) {
      throw AppError.internal('User folder missing after initialization', 'USER_FOLDER_MISSING');
    }

    // 3. Validate parentId authorization: if provided, verify it belongs to this user
    let targetParentId = userFolder._id.toString();
    if (parentId && typeof parentId === 'string' && parentId.trim()) {
      const cleanParentId = parentId.trim();
      if (cleanParentId !== targetParentId) {
        const parentQuery = mongoose.Types.ObjectId.isValid(cleanParentId)
          ? { _id: cleanParentId, userId }
          : { _id: cleanParentId, userId };
        const parentExists = await Folder.findOne(parentQuery).lean().exec();
        if (!parentExists) {
          throw AppError.badRequest(
            'Target parent folder does not exist or does not belong to you',
            'INVALID_PARENT_FOLDER',
          );
        }
        targetParentId = cleanParentId;
      }
    }

    // Normalize legacy alias rows (for example `todos`) to canonical item types.
    const legacyAliasFolder = await Folder.findOne({
      userId,
      nameHash: folderNameHash,
      itemType: { $in: itemTypeCandidates },
      parentId: targetParentId,
    }).exec();

    if (legacyAliasFolder && legacyAliasFolder.itemType !== canonicalItemType) {
      legacyAliasFolder.itemType = canonicalItemType;
      await legacyAliasFolder.save();
    }

    const newFolder = await Folder.findOneAndUpdate(
      { userId, nameHash: folderNameHash, itemType: canonicalItemType, parentId: targetParentId },
      {
        userId,
        username,
        name: encryptedFolderName,
        nameHash: folderNameHash,
        itemType: canonicalItemType,
        parentId: targetParentId,
      },
      { upsert: true, returnDocument: 'after' },
    );

    if (!newFolder) {
      throw AppError.internal('Folder creation failed', 'FOLDER_CREATE_FAILED');
    }

    const safeFolder = {
      ...newFolder.toObject(),
      name: folderName,
    };
    return sendSuccess(res, safeFolder, 'Folder created successfully', 201);
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Folder creation error', {
      userId,
      username,
      itemType: canonicalItemType,
      folderName,
      error,
    });
    throw AppError.internal('Failed to create folder', 'FOLDER_CREATE_FAILED');
  }
};

export const deleteFolderController = async (req: AuthenticatedRequest, res: express.Response) => {
  const { name, itemType } = req.query;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw AppError.badRequest('Name is required', 'FOLDER_NAME_REQUIRED');
  }

  if (!itemType || typeof itemType !== 'string' || !itemType.trim()) {
    throw AppError.badRequest('itemType is required', 'ITEM_TYPE_REQUIRED');
  }

  const folderName = normalizeFolderName(name);
  const canonicalItemType = resolveCanonicalFolderItemType(itemType);
  const itemTypeCandidates = resolveFolderItemTypeCandidates(itemType);
  const normalizedLowerName = folderName.toLowerCase();

  if (isProtectedFolderName(folderName)) {
    throw AppError.forbidden(
      'Saved folders are protected and cannot be deleted',
      'PROTECTED_FOLDER',
    );
  }

  if (!canonicalItemType) {
    throw AppError.badRequest('itemType is invalid', 'INVALID_ITEM_TYPE');
  }

  const { userId, username } = req.user;
  try {
    const Folder = getFolderModel(username);
    const folderNameHash = hashFolderName(folderName);

    const directDelete = await Folder.deleteMany({
      userId,
      itemType: { $in: itemTypeCandidates },
      $or: [{ nameHash: folderNameHash }, { name: folderName }],
    });

    if (directDelete.deletedCount && directDelete.deletedCount > 0) {
      return sendSuccess(res, { deleted: true }, 'Folder deleted successfully');
    }

    // Legacy fallback: old rows may be plaintext with case variations and no hash.
    const legacyCandidates = await Folder.find({
      userId,
      itemType: { $in: itemTypeCandidates },
    })
      .lean()
      .exec();

    const target = legacyCandidates.find((entry: any) => {
      const resolvedName = normalizeFolderName(decryptFolderName(entry.name));
      return resolvedName.toLowerCase() === normalizedLowerName;
    });

    if (target) {
      await Folder.deleteOne({ _id: target._id, userId });
    }

    return sendSuccess(res, { deleted: true }, 'Folder deleted successfully');
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Folder deletion error', {
      userId,
      username,
      folderName,
      itemType: canonicalItemType,
      error,
    });
    throw AppError.internal('Failed to delete folder', 'FOLDER_DELETE_FAILED');
  }
};
