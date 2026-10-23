import { create } from 'zustand';

export interface GlobalNavigationState {
  targetItemId: string | null;
  setTargetItemId: (id: string | null) => void;
  clearTargetItemId: () => void;
  resetStore: () => void;
}

const MAX_TARGET_ITEM_ID_LENGTH = 256;

const normalizeTargetItemId = (id: string | null): string | null => {
  if (typeof id !== 'string') {
    return null;
  }

  const trimmed = id.trim();
  if (!trimmed) {
    return null;
  }

  const sanitized = trimmed.replace(/[\u0000-\u001f\u007f]/g, '');
  if (!sanitized) {
    return null;
  }

  return sanitized.slice(0, MAX_TARGET_ITEM_ID_LENGTH);
};

export const useGlobalNavigationStore = create<GlobalNavigationState>((set) => ({
  targetItemId: null,
  setTargetItemId: (id) =>
    set((state) => {
      const nextTargetItemId = normalizeTargetItemId(id);
      if (state.targetItemId === nextTargetItemId) {
        return state;
      }

      return { targetItemId: nextTargetItemId };
    }),
  clearTargetItemId: () =>
    set((state) => {
      if (state.targetItemId === null) {
        return state;
      }

      return { targetItemId: null };
    }),
  resetStore: () =>
    set((state) => {
      if (state.targetItemId === null) {
        return state;
      }

      return { targetItemId: null };
    }),
}));
