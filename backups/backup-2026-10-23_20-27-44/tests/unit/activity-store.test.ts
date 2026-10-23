import { beforeEach, describe, expect, it } from 'vitest';
import { useActivityStore } from '../../src/store/activityStore';

const buildEntry = (overrides: Record<string, unknown> = {}) =>
  ({
    actionType: 'item_create',
    itemName: 'Document',
    userOrSessionId: 'session-1',
    status: 'success',
    description: 'Created item',
    ...overrides,
  }) as const;

describe('activityStore', () => {
  beforeEach(() => {
    useActivityStore.getState().clearActivity();
  });

  it('logs activity entries and keeps newest first', () => {
    useActivityStore.getState().logActivity(buildEntry({ timestamp: 1_700_000_000_000 }));
    useActivityStore
      .getState()
      .logActivity(buildEntry({ itemName: 'Second', timestamp: 1_700_000_000_100 }));

    const { entries, count } = useActivityStore.getState();
    expect(count).toBe(2);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.itemName).toBe('Second');
    expect(entries[1]?.itemName).toBe('Document');
    expect(entries[0]?.isSynced).toBe(false);
  });

  it('merges entries by id and prefers newer timestamps', () => {
    const now = Date.now();
    useActivityStore.getState().mergeEntries([
      {
        id: 'shared-id',
        actionType: 'item_create',
        itemName: 'Old',
        timestamp: now - 100,
        userOrSessionId: 'session-old',
        status: 'success',
        description: 'old',
        isSynced: false,
      },
      {
        id: 'shared-id',
        actionType: 'item_update',
        itemName: 'New',
        timestamp: now,
        userOrSessionId: 'session-new',
        status: 'success',
        description: 'new',
        isSynced: true,
      },
    ]);

    const { entries, count } = useActivityStore.getState();
    expect(count).toBe(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('shared-id');
    expect(entries[0]?.itemName).toBe('New');
    expect(entries[0]?.isSynced).toBe(true);
  });

  it('normalizes invalid merged entries safely', () => {
    useActivityStore.getState().mergeEntries([
      {
        id: '',
        actionType: 'not-real' as any,
        itemName: '',
        timestamp: NaN,
        userOrSessionId: '',
        status: 'unknown' as any,
        description: '',
      } as any,
    ]);

    const { entries, count } = useActivityStore.getState();
    expect(count).toBe(1);
    expect(typeof entries[0]?.id).toBe('string');
    expect(entries[0]?.id.length).toBeGreaterThan(0);
    expect(entries[0]?.actionType).toBe('error');
    expect(entries[0]?.status).toBe('failure');
    expect(entries[0]?.itemName).toBe('Unknown item');
    expect(entries[0]?.userOrSessionId).toBe('unknown');
  });

  it('marks specific entries as synced', () => {
    useActivityStore.getState().mergeEntries([
      {
        id: 'a',
        actionType: 'item_create',
        itemName: 'A',
        timestamp: 1,
        userOrSessionId: 's1',
        status: 'success',
        description: 'A',
        isSynced: false,
      },
      {
        id: 'b',
        actionType: 'item_delete',
        itemName: 'B',
        timestamp: 2,
        userOrSessionId: 's2',
        status: 'failure',
        description: 'B',
        isSynced: false,
      },
    ]);

    useActivityStore.getState().markAsSynced(['b']);
    const { entries, count } = useActivityStore.getState();

    expect(count).toBe(2);
    const entryA = entries.find((entry) => entry.id === 'a');
    const entryB = entries.find((entry) => entry.id === 'b');
    expect(entryA?.isSynced).toBe(false);
    expect(entryB?.isSynced).toBe(true);
  });

  it('keeps the full activity timeline instead of trimming to a small recent slice', () => {
    const entries = Array.from({ length: 750 }, (_, index) => ({
      id: `entry-${index}`,
      actionType: 'item_create' as const,
      itemName: `Document ${index}`,
      timestamp: 1_700_000_000_000 + index,
      userOrSessionId: 'session-1',
      status: 'success' as const,
      description: 'Created item',
      isSynced: true,
    }));

    useActivityStore.getState().mergeEntries(entries);

    const { entries: storedEntries, count } = useActivityStore.getState();
    expect(count).toBe(750);
    expect(storedEntries).toHaveLength(750);
    expect(storedEntries[0]?.id).toBe('entry-749');
    expect(storedEntries[749]?.id).toBe('entry-0');
  });
});
