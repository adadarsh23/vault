import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useVaultStore } from '../store/vaultStore';
import { useGlobalNavigationStore } from '../store/globalNavigationStore';
import { GLOBAL_NAVIGABLE_TYPES, requestGlobalItemNavigation } from '../lib/global-navigation';
import { VaultItem } from '../lib/storage';
import { logger } from '../lib/logger';

interface UseGlobalItemNavigationOptions {
  currentItemId: string | null;
  localTypes: VaultItem['type'][];
  onSelectLocalItem: (id: string) => void;
}

const toSafeTimestamp = (value: number): number => (Number.isFinite(value) ? value : 0);

export const useGlobalItemNavigation = ({
  currentItemId,
  localTypes,
  onSelectLocalItem,
}: UseGlobalItemNavigationOptions) => {
  const items = useVaultStore((state) => state.items);
  const setTargetItemId = useGlobalNavigationStore((state) => state.setTargetItemId);

  const onSelectLocalItemRef = useRef(onSelectLocalItem);
  useEffect(() => {
    onSelectLocalItemRef.current = onSelectLocalItem;
  }, [onSelectLocalItem]);

  const localTypesKey = localTypes.join(',');
  const localTypesSet = useMemo(() => new Set(localTypes), [localTypesKey]);

  const orderedItems = useMemo(
    () =>
      items
        .filter((item) => GLOBAL_NAVIGABLE_TYPES.includes(item.type))
        .sort((a, b) => toSafeTimestamp(b.updatedAt) - toSafeTimestamp(a.updatedAt)),
    [items],
  );

  const currentIndex = useMemo(
    () => (currentItemId ? orderedItems.findIndex((item) => item.id === currentItemId) : -1),
    [orderedItems, currentItemId],
  );

  const canPrevious = currentIndex > 0;
  const canNext = currentIndex >= 0 && currentIndex < orderedItems.length - 1;

  const navigateToItem = useCallback(
    (item: VaultItem | undefined) => {
      if (!item) return;

      try {
        setTargetItemId(item.id);
        if (localTypesSet.has(item.type)) {
          onSelectLocalItemRef.current(item.id);
          return;
        }

        if (typeof window !== 'undefined') {
          requestGlobalItemNavigation(item);
        }
      } catch (error) {
        logger.error('Global item navigation failed', {
          error,
          itemId: item.id,
          itemType: item.type,
        });
      }
    },
    [localTypesSet, setTargetItemId],
  );

  const goPrevious = useCallback(() => {
    if (!canPrevious) return;
    navigateToItem(orderedItems[currentIndex - 1]);
  }, [canPrevious, currentIndex, navigateToItem, orderedItems]);

  const goNext = useCallback(() => {
    if (!canNext) return;
    navigateToItem(orderedItems[currentIndex + 1]);
  }, [canNext, currentIndex, navigateToItem, orderedItems]);

  return useMemo(
    () => ({
      canPrevious,
      canNext,
      goPrevious,
      goNext,
    }),
    [canNext, canPrevious, goNext, goPrevious],
  );
};
