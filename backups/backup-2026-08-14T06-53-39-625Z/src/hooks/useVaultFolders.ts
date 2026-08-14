import { useState, useCallback, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { useVaultStore } from '../store/vaultStore';
import { logActivity } from '../lib/activity';
import { VaultItemType } from '../lib/storage';
import { vaultApi } from '../api/vaultApi';
import { isSavedFolderName, sortFoldersSavedFirst } from '../lib/folderGuards';
import { logger } from '../lib/logger';

type VaultFolderRecord = {
  name?: unknown;
  itemType?: unknown;
};

const FOLDER_FETCH_CACHE = new Map<VaultItemType, string[]>();
const FOLDER_FETCH_IN_FLIGHT = new Map<VaultItemType, Promise<string[]>>();
const FOLDER_FETCH_LAST_WARN_AT = new Map<VaultItemType, number>();
const FOLDER_WARN_THROTTLE_MS = 30_000;
const FOLDER_NAME_MAX_LENGTH = 120;

const normalizeFolderName = (value: string): string => value.trim().replace(/\s+/g, ' ');

const resolveApiErrorMessage = (error: unknown, fallback: string): string => {
  const candidate = error as
    { message?: string; response?: { data?: { error?: { message?: string } } } } | undefined;

  const apiMessage = candidate?.response?.data?.error?.message;
  if (typeof apiMessage === 'string' && apiMessage.trim()) return apiMessage;
  if (typeof candidate?.message === 'string' && candidate.message.trim()) {
    return candidate.message;
  }
  return fallback;
};

const shouldLogFolderFetchWarning = (itemType: VaultItemType) => {
  const now = Date.now();
  const lastWarnAt = FOLDER_FETCH_LAST_WARN_AT.get(itemType) ?? 0;
  if (now - lastWarnAt < FOLDER_WARN_THROTTLE_MS) {
    return false;
  }
  FOLDER_FETCH_LAST_WARN_AT.set(itemType, now);
  return true;
};

const extractFoldersForItemType = (payload: unknown, itemType: VaultItemType): string[] => {
  if (!Array.isArray(payload)) {
    return [];
  }

  const names: string[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as VaultFolderRecord;
    if (record.itemType !== itemType || typeof record.name !== 'string') continue;
    const normalized = normalizeFolderName(record.name);
    if (normalized.length > 0) {
      names.push(normalized);
    }
  }

  return Array.from(new Set(names));
};

const updateFolderCache = (itemType: VaultItemType, folders: string[]) => {
  const unique = Array.from(
    new Set(folders.map((name) => normalizeFolderName(name)).filter((name) => name.length > 0))
  );
  FOLDER_FETCH_CACHE.set(itemType, unique);
};

export const useVaultFolders = (itemType: VaultItemType) => {
  const items = useVaultStore((state) => state.items);
  const updateItem = useVaultStore((state) => state.updateItem);
  const batchUpdateItems = useVaultStore((state) => state.batchUpdateItems);
  const syncLogs = useVaultStore((state) => state.syncLogs);
  const isUnlocked = useVaultStore((state) => state.isUnlocked);

  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [sessionFolders, setSessionFolders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const mergeSessionFolders = useCallback(
    (incoming: string[]) => {
      if (incoming.length === 0) return;

      setSessionFolders((prev) => {
        const next = Array.from(
          new Set([...prev, ...incoming.map((name) => normalizeFolderName(name))])
        ).filter((name) => name.length > 0);
        updateFolderCache(itemType, next);
        return next;
      });
    },
    [itemType]
  );

  const itemsOfType = useMemo(
    () => items.filter((item) => item.type === itemType),
    [items, itemType]
  );

  const folders = useMemo(() => {
    const existingFolders = Array.from(
      new Set(itemsOfType.map((i) => i.folder).filter(Boolean) as string[])
    );

    const deduped = Array.from(new Set([...existingFolders, ...sessionFolders]));

    return sortFoldersSavedFirst(deduped);
  }, [itemsOfType, sessionFolders]);

  // Fetch folders on mount
  useEffect(() => {
    if (!isUnlocked) return;
    let cancelled = false;

    const cached = FOLDER_FETCH_CACHE.get(itemType);
    if (cached) {
      if (!cancelled) {
        mergeSessionFolders(cached);
      }
      return () => {
        cancelled = true;
      };
    }

    const fetchFolders = async () => {
      try {
        let inFlight = FOLDER_FETCH_IN_FLIGHT.get(itemType);
        if (!inFlight) {
          inFlight = (async () => {
            const response = await vaultApi.getFolders();
            if (!response.success) return [];
            const unique = extractFoldersForItemType(response.data, itemType);
            updateFolderCache(itemType, unique);
            return unique;
          })();
          FOLDER_FETCH_IN_FLIGHT.set(itemType, inFlight);
        }

        const fetchedFolders = await inFlight;
        if (!cancelled) {
          mergeSessionFolders(fetchedFolders);
        }
      } catch (error) {
        if (shouldLogFolderFetchWarning(itemType)) {
          logger.warn('Failed to fetch folders', {
            itemType,
            error,
          });
        }
      } finally {
        FOLDER_FETCH_IN_FLIGHT.delete(itemType);
      }
    };
    void fetchFolders();
    return () => {
      cancelled = true;
    };
  }, [itemType, isUnlocked, mergeSessionFolders]);

  const handleCreateFolder = useCallback(async () => {
    if (isLoading) return;

    const name = normalizeFolderName(newFolderName);
    if (!name) return;
    if (name.length > FOLDER_NAME_MAX_LENGTH) {
      toast.error(`Folder name must be ${FOLDER_NAME_MAX_LENGTH} characters or less`);
      return;
    }

    if (isSavedFolderName(name)) {
      toast.error('Saved folders are reserved and cannot be created manually');
      return;
    }

    if (folders.some((folder) => folder.toLowerCase() === name.toLowerCase())) {
      toast.error('A folder with this name already exists');
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading(`Creating folder...`);

    try {
      await vaultApi.createFolder({ name, itemType });
      mergeSessionFolders([name]);
      setCurrentFolder(name);
      setNewFolderName('');
      setIsAddingFolder(false);
      toast.success(`Folder "${name}" created`, { id: toastId });

      logActivity({
        actionType: 'item_create',
        itemName: name,
        description: `New category created: ${name}`,
        status: 'success',
      });
      void syncLogs();
    } catch (error: unknown) {
      toast.error(resolveApiErrorMessage(error, 'Failed to create folder'), { id: toastId });
    } finally {
      setIsLoading(false);
    }
  }, [newFolderName, itemType, folders, syncLogs, mergeSessionFolders, isLoading]);

  const handleRenameFolder = useCallback(
    async (oldName: string) => {
      if (isLoading) return;

      if (isSavedFolderName(oldName)) {
        toast.error('Saved folders cannot be renamed');
        setEditingFolder(null);
        return;
      }

      const newName = normalizeFolderName(editingFolderName);
      if (!newName || oldName === newName) {
        setEditingFolder(null);
        return;
      }
      if (newName.length > FOLDER_NAME_MAX_LENGTH) {
        toast.error(`Folder name must be ${FOLDER_NAME_MAX_LENGTH} characters or less`);
        return;
      }
      if (isSavedFolderName(newName)) {
        toast.error('Saved folders are reserved and cannot be used as custom names');
        return;
      }
      if (
        folders.some(
          (folder) =>
            folder.toLowerCase() === newName.toLowerCase() &&
            folder.toLowerCase() !== oldName.toLowerCase()
        )
      ) {
        toast.error('A folder with this name already exists');
        return;
      }

      const itemsInFolder = itemsOfType.filter((i) => i.folder === oldName);
      const toastId = toast.loading(`Renaming folder...`);
      setIsLoading(true);

      try {
        // 1. Create new folder
        await vaultApi.createFolder({ name: newName, itemType });

        // 2. Batch update items to the new folder
        const batchUpdates = itemsInFolder.map((item) => ({
          id: item.id,
          updates: { folder: newName },
        }));
        await batchUpdateItems(batchUpdates);

        // 3. Delete old folder
        await vaultApi.deleteFolder(oldName, itemType);

        setSessionFolders((prev) => {
          const next = Array.from(new Set(prev.map((f) => (f === oldName ? newName : f))));
          updateFolderCache(itemType, next);
          return next;
        });
        if (currentFolder === oldName) setCurrentFolder(newName);

        setEditingFolder(null);
        toast.success(`Renamed to "${newName}"`, { id: toastId });

        logActivity({
          actionType: 'item_update',
          itemName: oldName,
          description: `Folder renamed to ${newName}`,
          status: 'success',
        });
        void syncLogs();
      } catch (error: unknown) {
        toast.error(resolveApiErrorMessage(error, 'Failed to rename folder'), { id: toastId });
      } finally {
        setIsLoading(false);
      }
    },
    [
      editingFolderName,
      itemsOfType,
      batchUpdateItems,
      currentFolder,
      itemType,
      syncLogs,
      folders,
      isLoading,
    ]
  );

  const handleDeleteFolder = useCallback(
    async (folderName: string) => {
      if (isLoading) return;

      if (isSavedFolderName(folderName)) {
        toast.error('Saved folders cannot be deleted');
        return;
      }

      const confirmed =
        typeof window === 'undefined'
          ? true
          : window.confirm(
              `Are you sure you want to delete "${folderName}"? Items will be moved to Uncategorized.`
            );
      if (!confirmed) return;

      const itemsInFolder = itemsOfType.filter((i) => i.folder === folderName);
      const toastId = toast.loading(`Removing folder...`);
      setIsLoading(true);

      try {
        // Move items to uncategorized locally & sync
        const batchUpdates = itemsInFolder.map((item) => ({
          id: item.id,
          updates: { folder: undefined },
        }));

        if (batchUpdates.length > 0) {
          await batchUpdateItems(batchUpdates);
        }

        // Delete from cloud
        await vaultApi.deleteFolder(folderName, itemType);

        setSessionFolders((prev) => {
          const next = prev.filter((f) => f !== folderName);
          updateFolderCache(itemType, next);
          return next;
        });
        if (currentFolder === folderName) setCurrentFolder(null);

        toast.success(`Folder removed`, { id: toastId });
        logActivity({
          actionType: 'item_delete',
          itemName: folderName,
          description: 'Folder removed',
          status: 'success',
        });
        void syncLogs();
      } catch (error: unknown) {
        toast.error(resolveApiErrorMessage(error, 'Failed to remove folder'), { id: toastId });
      } finally {
        setIsLoading(false);
      }
    },
    [itemsOfType, batchUpdateItems, currentFolder, itemType, syncLogs, isLoading]
  );

  const handleMoveToFolder = useCallback(
    async (itemId: string, folderName: string | null) => {
      const item = itemsOfType.find((i) => i.id === itemId);
      if (!item) {
        toast.error('Item not found.');
        return;
      }

      const normalizedFolderName =
        typeof folderName === 'string' ? normalizeFolderName(folderName) : null;

      try {
        await updateItem(itemId, { folder: normalizedFolderName || undefined });
        toast.success(
          normalizedFolderName ? `Moved to ${normalizedFolderName}` : 'Moved to Uncategorized'
        );

        const destName = normalizedFolderName || 'Uncategorized';
        logActivity({
          actionType: 'item_update',
          itemName: item.title || 'Unknown',
          description: `Moved to ${destName}`,
          status: 'success',
        });
        void syncLogs();
      } catch (error: unknown) {
        toast.error(resolveApiErrorMessage(error, 'Failed to move item'));
      }
    },
    [itemsOfType, updateItem, syncLogs]
  );

  return {
    folders,
    currentFolder,
    setCurrentFolder,
    isAddingFolder,
    setIsAddingFolder,
    newFolderName,
    setNewFolderName,
    editingFolder,
    setEditingFolder,
    editingFolderName,
    setEditingFolderName,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveToFolder,
    isLoading,
  };
};
