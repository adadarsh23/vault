import { useState, useMemo } from 'react';
import { useVaultStore } from '../store/vaultStore';
import { VaultItemType } from '../lib/storage';
import { sortPinnedFirst } from '../lib/pinning';
import { logger } from '../lib/logger';

const normalizeTitle = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

export const useVaultItems = (
  itemType: VaultItemType | VaultItemType[],
  currentFolder: string | null,
) => {
  const items = useVaultStore((state) => state.items);
  const [searchQuery, setSearchQuery] = useState('');

  const typeKey = Array.isArray(itemType) ? itemType.slice().sort().join(',') : itemType;

  const typeSet = useMemo(
    () => new Set(Array.isArray(itemType) ? itemType : [itemType]),
    [typeKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const typedItems = useMemo(() => items.filter((i) => typeSet.has(i.type)), [items, typeSet]);

  const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

  const filteredItems = useMemo(() => {
    const isSearching = normalizedSearchQuery.length > 0;

    const filtered = typedItems.filter((m) => {
      // Standard folder filtering first (fast path)
      if (currentFolder !== null) {
        const folder = typeof m.folder === 'string' ? m.folder : null;
        if (folder !== currentFolder) return false;
      }

      // If not searching, passes folder check
      if (!isSearching) return true;

      // Search query check: title first, transcript fallback
      if (normalizeTitle(m.title).includes(normalizedSearchQuery)) {
        return true;
      }

      const transcript =
        typeof m.metadata?.transcript === 'string' ? m.metadata.transcript.toLowerCase() : '';
      return transcript.includes(normalizedSearchQuery);
    });

    if (filtered.length <= 1) {
      return filtered;
    }

    try {
      return sortPinnedFirst(filtered);
    } catch (error) {
      logger.warn('Failed to sort vault items by pinning state', { error });
      return filtered;
    }
  }, [typedItems, normalizedSearchQuery, currentFolder]);

  return useMemo(
    () => ({
      searchQuery,
      setSearchQuery,
      typedItems,
      filteredItems,
    }),
    [filteredItems, searchQuery, typedItems],
  );
};
