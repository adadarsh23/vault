import { describe, it, expect, beforeEach } from 'vitest';
import { useGlobalNavigationStore } from '../../src/store/globalNavigationStore';

describe('useGlobalNavigationStore', () => {
  beforeEach(() => {
    useGlobalNavigationStore.getState().resetStore();
  });

  it('initializes with null targetItemId', () => {
    expect(useGlobalNavigationStore.getState().targetItemId).toBeNull();
  });

  it('sets and sanitizes targetItemId correctly', () => {
    useGlobalNavigationStore.getState().setTargetItemId('item-123\u0000');
    expect(useGlobalNavigationStore.getState().targetItemId).toBe('item-123');
  });

  it('normalizes empty strings or non-string IDs to null', () => {
    useGlobalNavigationStore.getState().setTargetItemId('   ');
    expect(useGlobalNavigationStore.getState().targetItemId).toBeNull();

    useGlobalNavigationStore.getState().setTargetItemId(null);
    expect(useGlobalNavigationStore.getState().targetItemId).toBeNull();
  });

  it('clears target item id and resets store', () => {
    useGlobalNavigationStore.getState().setTargetItemId('item-999');
    expect(useGlobalNavigationStore.getState().targetItemId).toBe('item-999');

    useGlobalNavigationStore.getState().clearTargetItemId();
    expect(useGlobalNavigationStore.getState().targetItemId).toBeNull();

    useGlobalNavigationStore.getState().setTargetItemId('item-888');
    useGlobalNavigationStore.getState().resetStore();
    expect(useGlobalNavigationStore.getState().targetItemId).toBeNull();
  });
});
