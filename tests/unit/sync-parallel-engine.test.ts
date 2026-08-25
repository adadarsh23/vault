import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  runInSyncWriteQueue,
  runInParallelPool,
  DEFAULT_MAX_PARALLEL_SYNC_WRITES,
} from '../../src/lib/sync/core.ts';
import { uploadLogsToCloud } from '../../src/lib/sync/activitySync.ts';
import { useActivityStore } from '../../src/store/activityStore.ts';
import { setAuthToken, clearAuthToken } from '../../src/lib/auth-session.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Parallel Sync Engine (Core & Pool)', () => {
  it('executes tasks for different keys concurrently in parallel', async () => {
    let activeTasks = 0;
    let maxParallelSeen = 0;

    const task = async (key: string) => {
      activeTasks += 1;
      maxParallelSeen = Math.max(maxParallelSeen, activeTasks);
      await sleep(50);
      activeTasks -= 1;
      return `done-${key}`;
    };

    const results = await Promise.all([
      runInSyncWriteQueue(() => task('item-A'), 'item-A'),
      runInSyncWriteQueue(() => task('item-B'), 'item-B'),
      runInSyncWriteQueue(() => task('item-C'), 'item-C'),
    ]);

    expect(results).toEqual(['done-item-A', 'done-item-B', 'done-item-C']);
    // All 3 items should have executed in parallel
    expect(maxParallelSeen).toBe(3);
  });

  it('sequences tasks on the SAME key in strict FIFO order', async () => {
    const executionOrder: string[] = [];

    const task = async (label: string, delayMs: number) => {
      await sleep(delayMs);
      executionOrder.push(label);
      return label;
    };

    // Queue 3 tasks on the same item ID 'item-X'
    const p1 = runInSyncWriteQueue(() => task('first', 30), 'item-X');
    const p2 = runInSyncWriteQueue(() => task('second', 10), 'item-X');
    const p3 = runInSyncWriteQueue(() => task('third', 5), 'item-X');

    await Promise.all([p1, p2, p3]);

    // Despite second and third having shorter delays, they must finish in order
    expect(executionOrder).toEqual(['first', 'second', 'third']);
  });

  it('respects bounded concurrency limit across different keys', async () => {
    let activeTasks = 0;
    let maxParallelSeen = 0;
    const concurrencyLimit = 3;

    const task = async (id: number) => {
      activeTasks += 1;
      maxParallelSeen = Math.max(maxParallelSeen, activeTasks);
      await sleep(30);
      activeTasks -= 1;
      return id;
    };

    const promises = Array.from({ length: 8 }, (_, i) =>
      runInSyncWriteQueue(() => task(i), `item-${i}`, concurrencyLimit),
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(8);
    expect(maxParallelSeen).toBeLessThanOrEqual(concurrencyLimit);
  });

  it('runInParallelPool distributes work concurrently and preserves result indices', async () => {
    const items = [10, 20, 30, 40, 50];
    let peakConcurrency = 0;
    let currentConcurrency = 0;

    const results = await runInParallelPool(
      items,
      async (num, index) => {
        currentConcurrency += 1;
        peakConcurrency = Math.max(peakConcurrency, currentConcurrency);
        await sleep(25);
        currentConcurrency -= 1;
        return `val:${num * 2}:idx:${index}`;
      },
      3,
    );

    expect(results).toEqual([
      'val:20:idx:0',
      'val:40:idx:1',
      'val:60:idx:2',
      'val:80:idx:3',
      'val:100:idx:4',
    ]);
    expect(peakConcurrency).toBe(3);
  });

  it('handles empty input gracefully in runInParallelPool', async () => {
    const results = await runInParallelPool([], async (x) => x);
    expect(results).toEqual([]);
  });
});

describe('Parallel Activity Sync', () => {
  beforeEach(() => {
    setAuthToken('mock-auth-token');
    useActivityStore.getState().clearActivity();
  });

  afterEach(() => {
    clearAuthToken();
    vi.restoreAllMocks();
  });

  it('uploads unsynced logs in parallel and updates store status', async () => {
    let peakParallel = 0;
    let currentParallel = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      currentParallel += 1;
      peakParallel = Math.max(peakParallel, currentParallel);
      await sleep(30);
      currentParallel -= 1;
      return {
        ok: true,
        status: 201,
        json: async () => ({ success: true }),
        headers: new Headers(),
      } as Response;
    });

    const logs = [
      { id: 'log-1', actionType: 'file_upload', itemName: 'Doc1', isSynced: false },
      { id: 'log-2', actionType: 'auth_login', itemName: 'App', isSynced: false },
      { id: 'log-3', actionType: 'password_create', itemName: 'Pass1', isSynced: false },
      { id: 'log-4', actionType: 'item_update', itemName: 'Note1', isSynced: false },
    ];

    useActivityStore.setState({
      entries: logs.map((l) => ({
        ...l,
        timestamp: Date.now(),
        userOrSessionId: 'test-device',
        status: 'success' as const,
        description: 'Test log',
      })),
      count: 4,
    });

    await uploadLogsToCloud(logs, 4);

    expect(peakParallel).toBeGreaterThanOrEqual(2);
    const storeEntries = useActivityStore.getState().entries;
    expect(storeEntries.every((e) => e.isSynced === true)).toBe(true);
  });
});
