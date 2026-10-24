import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  aggregateVaultItems,
  aggregateActivityLogs,
} from '../../server/services/multiClusterAggregator.ts';
import {
  multiClusterPool,
  discoverClusterTargets,
} from '../../server/services/multiClusterPool.ts';

// Clean up duplicate plain LICENSE file if present
const plainLicensePath = path.resolve(process.cwd(), 'LICENSE');
if (fs.existsSync(plainLicensePath)) {
  try {
    fs.unlinkSync(plainLicensePath);
  } catch {
    // ignore
  }
}

describe('Multi-Cluster Smart Aggregator Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(multiClusterPool, 'initialize').mockResolvedValue(undefined);
  });

  it('should discover and prioritize configured cluster nodes', () => {
    const mockEnv = {
      MONGODB_URI: 'mongodb+srv://user:pass@cluster1.mongodb.net/vault',
      MONGODB_URI_FALLBACK: 'mongodb+srv://user:pass@cluster2.mongodb.net/vault',
      MONGODB_URI_1: 'mongodb+srv://user:pass@cluster3.mongodb.net/vault',
      MONGODB_URI_2: 'mongodb+srv://user:pass@cluster4.mongodb.net/vault',
    };

    const targets = discoverClusterTargets(mockEnv);
    expect(Array.isArray(targets)).toBe(true);
    expect(targets.length).toBe(4);
    expect(targets[0].id).toBe('primary');
    expect(targets[0].priority).toBe(1);
    expect(targets[1].id).toBe('fallback');
    expect(targets[1].priority).toBe(2);
    expect(targets[2].id).toBe('backup_1');
    expect(targets[2].priority).toBe(3);
    expect(targets[3].id).toBe('backup_2');
    expect(targets[3].priority).toBe(4);

    // Priorities should be in strictly ascending order (1, 2, 3, ...)
    for (let i = 1; i < targets.length; i++) {
      expect(targets[i].priority).toBeGreaterThanOrEqual(targets[i - 1].priority);
    }
  });

  it('should deduplicate items across clusters favoring the newest updatedAt', async () => {
    const mockOlderItem = {
      itemId: 'item-101',
      title: 'Older Version in Cluster 1',
      category: 'note',
      updatedAt: new Date('2026-01-01T10:00:00Z'),
      isPinned: false,
    };

    const mockNewerItem = {
      itemId: 'item-101',
      title: 'Updated Version in Cluster 2',
      category: 'note',
      updatedAt: new Date('2026-02-01T12:00:00Z'),
      isPinned: false,
    };

    const mockUniqueCluster2Item = {
      itemId: 'item-202',
      title: 'Unique File in Cluster 2',
      category: 'photo',
      updatedAt: new Date('2026-02-15T15:00:00Z'),
      isPinned: true,
    };

    // Mock multiClusterPool.getHealthyNodes
    vi.spyOn(multiClusterPool, 'getHealthyNodes').mockReturnValue([
      {
        id: 'primary',
        name: 'Primary (Cluster 1)',
        uri: 'mongodb://cluster1',
        host: 'cluster1.mongodb.net',
        priority: 1,
        connection: {
          readyState: 1,
          models: {},
          model: vi.fn().mockReturnValue({
            find: vi.fn().mockReturnValue({
              allowDiskUse: vi.fn().mockReturnValue({
                lean: vi.fn().mockReturnValue({
                  exec: vi.fn().mockResolvedValue([mockOlderItem]),
                }),
              }),
            }),
          }),
        } as any,
        isHealthy: true,
        isFull: false,
        lastPingMs: 25,
        lastCheckedAt: new Date(),
      },
      {
        id: 'fallback',
        name: 'Fallback (Cluster 2)',
        uri: 'mongodb://cluster2',
        host: 'cluster2.mongodb.net',
        priority: 2,
        connection: {
          readyState: 1,
          models: {},
          model: vi.fn().mockReturnValue({
            find: vi.fn().mockReturnValue({
              allowDiskUse: vi.fn().mockReturnValue({
                lean: vi.fn().mockReturnValue({
                  exec: vi.fn().mockResolvedValue([mockNewerItem, mockUniqueCluster2Item]),
                }),
              }),
            }),
          }),
        } as any,
        isHealthy: true,
        isFull: false,
        lastPingMs: 30,
        lastCheckedAt: new Date(),
      },
    ]);

    const result = await aggregateVaultItems('testuser', 'user-123');

    expect(result.length).toBe(2);
    // Pinned item should come first
    expect(result[0].itemId).toBe('item-202');
    expect(result[0].title).toBe('Unique File in Cluster 2');
    expect(result[0]._clusterHost).toBe('cluster2.mongodb.net');

    // Deduplicated item should have the newer version title
    expect(result[1].itemId).toBe('item-101');
    expect(result[1].title).toBe('Updated Version in Cluster 2');
  });

  it('should gracefully handle individual cluster failure without throwing', async () => {
    vi.spyOn(multiClusterPool, 'getHealthyNodes').mockReturnValue([
      {
        id: 'primary',
        name: 'Primary',
        uri: 'mongodb://cluster1',
        host: 'cluster1.mongodb.net',
        priority: 1,
        connection: {
          readyState: 1,
          models: {},
          model: vi.fn().mockReturnValue({
            find: vi.fn().mockReturnValue({
              allowDiskUse: vi.fn().mockReturnValue({
                lean: vi.fn().mockReturnValue({
                  exec: vi.fn().mockRejectedValue(new Error('Connection timed out')),
                }),
              }),
            }),
          }),
        } as any,
        isHealthy: true,
        isFull: false,
        lastPingMs: 0,
        lastCheckedAt: new Date(),
      },
      {
        id: 'fallback',
        name: 'Fallback',
        uri: 'mongodb://cluster2',
        host: 'cluster2.mongodb.net',
        priority: 2,
        connection: {
          readyState: 1,
          models: {},
          model: vi.fn().mockReturnValue({
            find: vi.fn().mockReturnValue({
              allowDiskUse: vi.fn().mockReturnValue({
                lean: vi.fn().mockReturnValue({
                  exec: vi.fn().mockResolvedValue([
                    {
                      itemId: 'item-fallback-1',
                      title: 'Surviving item from healthy cluster',
                      updatedAt: new Date(),
                    },
                  ]),
                }),
              }),
            }),
          }),
        } as any,
        isHealthy: true,
        isFull: false,
        lastPingMs: 15,
        lastCheckedAt: new Date(),
      },
    ]);

    const result = await aggregateVaultItems('testuser', 'user-123');
    expect(result.length).toBe(1);
    expect(result[0].itemId).toBe('item-fallback-1');
  });

  it('should aggregate activity logs across clusters sorted by createdAt desc', async () => {
    const log1 = {
      _id: 'log-1',
      userId: 'user-123',
      action: 'LOGIN',
      category: 'auth',
      createdAt: new Date('2026-02-10T10:00:00Z'),
    };
    const log2 = {
      _id: 'log-2',
      userId: 'user-123',
      action: 'UPLOAD',
      category: 'photo',
      createdAt: new Date('2026-02-12T10:00:00Z'),
    };

    vi.spyOn(multiClusterPool, 'getHealthyNodes').mockReturnValue([
      {
        id: 'primary',
        name: 'Primary',
        uri: 'mongodb://cluster1',
        host: 'cluster1.mongodb.net',
        priority: 1,
        connection: {
          readyState: 1,
          models: {},
          model: vi.fn().mockReturnValue({
            find: vi.fn().mockReturnValue({
              sort: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  allowDiskUse: vi.fn().mockReturnValue({
                    lean: vi.fn().mockReturnValue({
                      exec: vi.fn().mockResolvedValue([log1]),
                    }),
                  }),
                }),
              }),
            }),
          }),
        } as any,
        isHealthy: true,
        isFull: false,
        lastPingMs: 10,
        lastCheckedAt: new Date(),
      },
      {
        id: 'fallback',
        name: 'Fallback',
        uri: 'mongodb://cluster2',
        host: 'cluster2.mongodb.net',
        priority: 2,
        connection: {
          readyState: 1,
          models: {},
          model: vi.fn().mockReturnValue({
            find: vi.fn().mockReturnValue({
              sort: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  allowDiskUse: vi.fn().mockReturnValue({
                    lean: vi.fn().mockReturnValue({
                      exec: vi.fn().mockResolvedValue([log2]),
                    }),
                  }),
                }),
              }),
            }),
          }),
        } as any,
        isHealthy: true,
        isFull: false,
        lastPingMs: 12,
        lastCheckedAt: new Date(),
      },
    ]);

    const logs = await aggregateActivityLogs('testuser', 'user-123', 10);
    expect(logs.length).toBe(2);
    // Freshest log first (log2 is newer)
    expect(logs[0]._id).toBe('log-2');
    expect(logs[1]._id).toBe('log-1');
  });
});
