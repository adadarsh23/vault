import { useState, useMemo } from 'react';
import { useVaultStore } from '../store/vaultStore';
import { VaultItemType } from '../lib/storage';
import { sortPinnedFirst } from '../lib/pinning';
import { logger } from '../lib/logger';

const normalizeTitle = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export const useVaultItems = (
  itemType: VaultItemType | VaultItemType[],
  currentFolder: string | null
) => {
  const items = useVaultStore((state) => state.items);
  const [searchQuery, setSearchQuery] = useState('');

  const types = useMemo(
    () => Array.from(new Set(Array.isArray(itemType) ? itemType : [itemType])),
    [itemType]
  );

  const typedItems = useMemo(() => items.filter((i) => types.includes(i.type)), [items, types]);

  const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const filteredItems = useMemo(() => {
    const filtered = typedItems.filter((m) => {
      const transcript =
        typeof m.metadata?.transcript === 'string' ? m.metadata.transcript.toLowerCase() : '';
      const matchesTranscript = transcript.includes(normalizedSearchQuery);
      const matchesSearch =
        normalizedSearchQuery.length === 0 ||
        normalizeTitle(m.title).includes(normalizedSearchQuery) ||
        matchesTranscript;

      // If currentFolder is null, show absolutely everything of this type (All View)
      if (currentFolder === null) return matchesSearch;

      // Standard folder filtering
      const folder = typeof m.folder === 'string' ? m.folder : null;
      const matchesFolder = folder === currentFolder;
      return matchesSearch && matchesFolder;
    });

    try {
      return sortPinnedFirst(filtered);
    } catch (error) {
      logger.warn('Failed to sort vault items by pinning state', { error });
      return filtered;
    }
  }, [typedItems, normalizedSearchQuery, currentFolder]);

  return {
    searchQuery,
    setSearchQuery,
    typedItems,
    filteredItems,
  };
};
