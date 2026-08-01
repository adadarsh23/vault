import express from "express";
import { getFolderModel } from "../models/folder.ts";
import { AuthenticatedRequest } from "../utils/requestTypes.ts";
import { initializeDefaultUserFolders, isProtectedFolderName } from "../services/folderService.ts";
import { logger } from "../utils/logger.ts";
import {
  decryptFolderName,
  encryptFolderName,
  hashFolderName,
} from "../services/folderCryptoService.ts";

const normalizeFolderName = (value: unknown): string => String(value ?? "").trim();
const normalizeFolderItemTypeInput = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const FOLDER_ITEM_TYPE_ALIASES: Record<string, string[]> = {
  note: ["note", "notes"],
  chat: ["chat", "chats"],
  todo: ["todo", "todos"],
  password: ["password", "passwords"],
  secret: ["secret", "secrets", "secretkey", "secretkeys"],
  contact: ["contact", "contacts"],
  location: ["location", "locations"],
  photo: ["photo", "photos"],
  video: ["video", "videos"],
  audio: ["audio", "audios"],
  document: ["document", "documents"],
  file: ["file", "files"],
  "other-files": ["other-files", "other_files", "otherfile", "otherfiles"],
  card: ["card", "cards"],
  identity: ["identity", "identities"],
  wifi: ["wifi", "wifis"],
};

const resolveCanonicalFolderItemType = (value: unknown): string => {
  const normalized = normalizeFolderItemTypeInput(value);
  if (!normalized) return "";

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
      name: decrypted || (typeof folder.name === "string" ? folder.name : ""),
      itemType: normalizedItemType || folder.itemType,
    };
  } catch {
    return {
      ...folder,
      name: typeof folder.name === "string" ? folder.name : "",
      itemType: normalizedItemType || folder.itemType,
    };
  }
};

const loadHydratedFolders = async (username: string, userId: string) => {
  const Folder = getFolderModel(username);
  const folders = await Folder.find({ userId }).lean();
  const deduped = new Map<string, any>();

  for (const folder of folders.map(hydrateFolder)) {
    const folderName = normalizeFolderName(folder.name).toLowerCase();
    const folderType = resolveCanonicalFolderItemType(folder.itemType || "");
    const parentId = typeof folder.parentId === "string" ? folder.parentId : "root";
    const key = `${folderType}|${folderName}|${parentId}`;
    if (!deduped.has(key)) {
      deduped.set(key, folder);
    }
  }

  return Array.from(deduped.values());
};

export const initializeFoldersController = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    await initializeDefaultUserFolders(req.user.userId, req.user.username);
    const hydrated = await loadHydratedFolders(req.user.username, req.user.userId);
    return res.json({ success: true, data: hydrated });
  } catch (error) {
    logger.error("Failed to initialize folders", {
      userId: req.user.userId,
      username: req.user.username,
      error,
    });
    return res.status(500).json({
      success: false,
      error: { message: "Failed to initialize folders" },
    });
  }
};

export const getFoldersController = async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    await initializeDefaultUserFolders(req.user.userId, req.user.username);
    const hydrated = await loadHydratedFolders(req.user.username, req.user.userId);
    return res.json({ success: true, data: hydrated });
  } catch (error) {
    logger.error("Failed to fetch folders", {
      userId: req.user.userId,
      username: req.user.username,
      error,
    });
    return res.status(500).json({
      success: false,
      error: { message: "Failed to fetch folders" },
    });
  }
};

export const createFolderController = async (req: AuthenticatedRequest, res: express.Response) => {
  const { name, itemType, parentId } = req.body;
  if (!name || !itemType) {
    return res.status(400).json({ success: false, error: { message: "Name and itemType are required" } });
  }
  const folderName = normalizeFolderName(name);
  const canonicalItemType = resolveCanonicalFolderItemType(itemType);
  const itemTypeCandidates = resolveFolderItemTypeCandidates(itemType);
  if (!folderName) {
    return res.status(400).json({ success: false, error: { message: "Folder name is required" } });
  }
  if (!canonicalItemType) {
    return res.status(400).json({ success: false, error: { message: "itemType is invalid" } });
  }
  if (isProtectedFolderName(folderName)) {
    return res.status(403).json({
      success: false,
      error: { message: "Saved folders are reserved and cannot be created manually" },
    });
  }

  try {
    const userId = req.user.userId;
    const username = req.user.username;
    await initializeDefaultUserFolders(userId, username);

    const Folder = getFolderModel(username);
    const folderNameHash = hashFolderName(folderName);
    const encryptedFolderName = encryptFolderName(folderName);

    // 1. Resolve "vault_items" root folder
    const rootFolder = await Folder.findOne({
      userId,
      nameHash: hashFolderName("vault_items"),
      itemType: "system",
      parentId: null,
    });
    if (!rootFolder) {
      return res.status(500).json({ success: false, error: { message: "Root folder missing after initialization" } });
    }

    // 2. Resolve username folder inside "vault_items"
    const userFolder = await Folder.findOne({
      userId,
      nameHash: hashFolderName(username),
      itemType: "system",
      parentId: rootFolder._id.toString(),
    });
    if (!userFolder) {
      return res.status(500).json({ success: false, error: { message: "User folder missing after initialization" } });
    }

    // 3. Create the requested folder inside the username folder if no parentId is provided
    const targetParentId = parentId || userFolder._id.toString();

    // Normalize legacy alias rows (for example `todos`) to canonical item types.
    const legacyAliasFolder = await Folder.findOne({
      userId,
      nameHash: folderNameHash,
      itemType: { $in: itemTypeCandidates },
      parentId: targetParentId,
    });
    if (
      legacyAliasFolder &&
      legacyAliasFolder.itemType !== canonicalItemType
    ) {
      legacyAliasFolder.itemType = canonicalItemType;
      await legacyAliasFolder.save();
    }

    const newFolder = await Folder.findOneAndUpdate(
      { userId, nameHash: folderNameHash, itemType: canonicalItemType, parentId: targetParentId },
      { userId, username, name: encryptedFolderName, nameHash: folderNameHash, itemType: canonicalItemType, parentId: targetParentId },
      { upsert: true, returnDocument: 'after' }
    );
    if (!newFolder) {
      return res.status(500).json({
        success: false,
        error: { message: "Folder creation failed" },
      });
    }
    const safeFolder = {
      ...newFolder.toObject(),
      name: folderName,
    };
    return res.json({ success: true, data: safeFolder });
  } catch (error) {
    logger.error("Folder creation error", {
      userId: req.user.userId,
      username: req.user.username,
      itemType: canonicalItemType,
      folderName,
      error,
    });
    return res.status(500).json({ success: false, error: { message: "Failed to create folder" } });
  }
};

export const deleteFolderController = async (req: AuthenticatedRequest, res: express.Response) => {
  const { name, itemType } = req.query;
  if (!name || !itemType) {
    return res.status(400).json({ success: false, error: { message: "Name and itemType are required" } });
  }
  const folderName = normalizeFolderName(name);
  const canonicalItemType = resolveCanonicalFolderItemType(itemType);
  const itemTypeCandidates = resolveFolderItemTypeCandidates(itemType);
  const normalizedLowerName = folderName.toLowerCase();
  if (isProtectedFolderName(folderName)) {
    return res.status(403).json({ success: false, error: { message: "Saved folders are protected and cannot be deleted" } });
  }
  if (!canonicalItemType) {
    return res.status(400).json({ success: false, error: { message: "itemType is invalid" } });
  }

  try {
    const Folder = getFolderModel(req.user.username);
    const folderNameHash = hashFolderName(folderName);

    const directDelete = await Folder.deleteMany({
      userId: req.user.userId,
      itemType: { $in: itemTypeCandidates },
      $or: [
        { nameHash: folderNameHash },
        { name: folderName },
      ],
    });

    if (directDelete.deletedCount && directDelete.deletedCount > 0) {
      return res.json({ success: true });
    }

    // Legacy fallback: old rows may be plaintext with case variations and no hash.
    const legacyCandidates = await Folder.find({
      userId: req.user.userId,
      itemType: { $in: itemTypeCandidates },
    });

    const target = legacyCandidates.find((entry: any) => {
      const resolvedName = normalizeFolderName(decryptFolderName(entry.name));
      return resolvedName.toLowerCase() === normalizedLowerName;
    });

    if (target) {
      await Folder.deleteOne({ _id: target._id });
    }

    return res.json({ success: true });
  } catch (error) {
    logger.error("Folder deletion error", {
      userId: req.user.userId,
      username: req.user.username,
      folderName,
      itemType: canonicalItemType,
      error,
    });
    return res.status(500).json({
      success: false,
      error: { message: "Failed to delete folder" },
    });
  }
};
