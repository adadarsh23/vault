import { getFolderModel } from '../models/folder.ts';
import { logger } from '../utils/logger.ts';
import { encryptFolderName, hashFolderName } from './folderCryptoService.ts';

type FolderSeedDefinition = {
  name: string;
  itemType: string;
  children?: FolderSeedDefinition[];
};

export const isProtectedFolderName = (name: string): boolean =>
  name.trim().toLowerCase().startsWith('saved');

const DEFAULT_FOLDER_TREE: FolderSeedDefinition[] = [
  {
    name: 'Personal_data',
    itemType: 'system',
    children: [
      { name: 'Saved note', itemType: 'note' },
      { name: 'Saved chats', itemType: 'chat' },
      { name: 'Saved todo', itemType: 'todo' },
      { name: 'Saved contact', itemType: 'contact' },
      { name: 'Saved passwords', itemType: 'password' },
      { name: 'Saved secrets', itemType: 'secret' },
      { name: 'Saved locations', itemType: 'location' },
      { name: 'Saved cards', itemType: 'card' },
      { name: 'Saved identities', itemType: 'identity' },
      { name: 'Saved wifi', itemType: 'wifi' },
    ],
  },
  {
    name: 'Media',
    itemType: 'system',
    children: [
      { name: 'Saved photos', itemType: 'photo' },
      { name: 'Saved videos', itemType: 'video' },
      { name: 'Saved audios', itemType: 'audio' },
      { name: 'Saved documents', itemType: 'document' },
      { name: 'Saved files', itemType: 'file' },
      { name: 'Saved other_files', itemType: 'other-files' },
    ],
  },
  {
    name: 'System',
    itemType: 'system',
    children: [{ name: 'Saved_settings', itemType: 'settings' }],
  },
  {
    name: 'Activity',
    itemType: 'logs',
    children: [{ name: 'Saved_logs', itemType: 'logs' }],
  },
  {
    name: 'Misc',
    itemType: 'system',
    children: [
      { name: 'Saved system', itemType: 'system' },
      { name: 'Saved users', itemType: 'users' },
    ],
  },
  { name: 'Users', itemType: 'users' },
];

const ensureFolder = async (
  userId: string,
  username: string,
  name: string,
  itemType: string,
  parentId: string | null
) => {
  const Folder = getFolderModel(username);
  const nameHash = hashFolderName(name);
  const encryptedName = encryptFolderName(name);
  return await Folder.findOneAndUpdate(
    { userId, nameHash, itemType, parentId },
    { userId, username, name: encryptedName, nameHash, itemType, parentId },
    { upsert: true, returnDocument: 'after' }
  );
};

const ensureFolderTree = async (
  userId: string,
  username: string,
  parentId: string,
  definitions: FolderSeedDefinition[]
) => {
  for (const definition of definitions) {
    const folder = await ensureFolder(
      userId,
      username,
      definition.name,
      definition.itemType,
      parentId
    );

    if (definition.children?.length) {
      await ensureFolderTree(userId, username, folder._id.toString(), definition.children);
    }
  }
};

export const initializeDefaultUserFolders = async (userId: string, username: string) => {
  try {
    const rootFolder = await ensureFolder(userId, username, 'vault_items', 'system', null);

    const userFolder = await ensureFolder(
      userId,
      username,
      username,
      'system',
      rootFolder._id.toString()
    );

    await ensureFolderTree(userId, username, userFolder._id.toString(), DEFAULT_FOLDER_TREE);

    logger.info('Folder structure initialized for user', { username, userId });
  } catch (error) {
    logger.error('Failed to initialize folders for user', {
      username,
      userId,
      error,
    });
    throw error;
  }
};
