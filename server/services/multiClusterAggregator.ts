import mongoose from 'mongoose';
import { getVaultItemModel, VaultItemType } from '../models/vaultItem.ts';
import { getActivityLogModel, ActivityLogType } from '../models/activityLog.ts';
import { getUserModel } from '../models/user.ts';
import { multiClusterPool, ClusterNode } from './multiClusterPool.ts';
import { logger } from '../utils/logger.ts';

export interface AggregatedVaultItem extends VaultItemType {
  _id?: any;
  _clusterHost?: string;
  _clusterId?: string;
}

export interface LocatedVaultItem {
  item: AggregatedVaultItem;
  node: ClusterNode;
}

export interface LocatedUser {
  user: any;
  node: ClusterNode;
}

/**
 * Executes a query across all available clusters in parallel, merges results,
 * deduplicates by itemId (latest updatedAt wins), and sorts by updatedAt desc.
 */
export const aggregateVaultItems = async (
  username: string,
  userId: string,
  filter: Record<string, any> = {},
): Promise<AggregatedVaultItem[]> => {
  await multiClusterPool.initialize();
  const nodes = multiClusterPool.getHealthyNodes();
  const targetNodes = nodes.length > 0 ? nodes : multiClusterPool.getAllNodes();

  if (targetNodes.length === 0) {
    // Fallback to default mongoose connection
    const defaultModel = getVaultItemModel(username);
    return (await defaultModel
      .find({ userId, isDeleted: false, ...filter })
      .allowDiskUse(true)
      .lean()
      .exec()) as AggregatedVaultItem[];
  }

  const queryPromises = targetNodes.map(async (node) => {
    try {
      const DynamicModel = getVaultItemModel(username, node.connection);
      const docs = await DynamicModel.find({ userId, isDeleted: false, ...filter })
        .allowDiskUse(true)
        .lean()
        .exec();

      return docs.map((doc) => ({
        ...doc,
        _clusterHost: node.host,
        _clusterId: node.id,
      })) as AggregatedVaultItem[];
    } catch (err: any) {
      logger.warn(`[Aggregator] Query failed on node ${node.name} (${node.host}): ${err?.message}`);
      return [] as AggregatedVaultItem[];
    }
  });

  const settleResults = await Promise.allSettled(queryPromises);
  const itemMap = new Map<string, AggregatedVaultItem>();

  for (const res of settleResults) {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      for (const item of res.value) {
        if (!item.itemId) continue;

        const existing = itemMap.get(item.itemId);
        if (!existing) {
          itemMap.set(item.itemId, item);
        } else {
          // Compare update dates to pick the freshest version
          const existingDate = new Date(
            existing.updatedAt || existing.clientUpdatedAt || 0,
          ).getTime();
          const incomingDate = new Date(item.updatedAt || item.clientUpdatedAt || 0).getTime();

          if (incomingDate > existingDate) {
            itemMap.set(item.itemId, item);
          }
        }
      }
    }
  }

  const mergedItems = Array.from(itemMap.values());

  // Sort: pinned items first, then by updatedAt descending
  mergedItems.sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
      return a.isPinned ? -1 : 1;
    }
    const dateA = new Date(a.updatedAt || a.clientUpdatedAt || 0).getTime();
    const dateB = new Date(b.updatedAt || b.clientUpdatedAt || 0).getTime();
    return dateB - dateA;
  });

  return mergedItems;
};

/**
 * Finds a single vault item across all available clusters.
 * Returns the item along with the ClusterNode that hosts it.
 */
export const findVaultItemAcrossClusters = async (
  username: string,
  userId: string,
  itemId: string,
): Promise<LocatedVaultItem | null> => {
  await multiClusterPool.initialize();
  const nodes = multiClusterPool.getHealthyNodes();
  const targetNodes = nodes.length > 0 ? nodes : multiClusterPool.getAllNodes();

  if (targetNodes.length === 0) {
    const defaultModel = getVaultItemModel(username);
    const item = await defaultModel.findOne({ userId, itemId }).lean().exec();
    if (!item) return null;
    return {
      item: item as AggregatedVaultItem,
      node: {
        id: 'primary',
        name: 'Primary',
        uri: '',
        host: 'default',
        priority: 1,
        connection: mongoose.connection,
        isHealthy: true,
        isFull: false,
        lastPingMs: 0,
        lastCheckedAt: new Date(),
      },
    };
  }

  const searchPromises = targetNodes.map(async (node) => {
    try {
      const DynamicModel = getVaultItemModel(username, node.connection);
      const doc = await DynamicModel.findOne({ userId, itemId }).lean().exec();
      if (doc) {
        return {
          item: {
            ...doc,
            _clusterHost: node.host,
            _clusterId: node.id,
          } as AggregatedVaultItem,
          node,
        };
      }
    } catch {
      // ignore
    }
    return null;
  });

  const results = await Promise.allSettled(searchPromises);
  const foundItems: LocatedVaultItem[] = [];

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      foundItems.push(r.value);
    }
  }

  if (foundItems.length === 0) return null;
  if (foundItems.length === 1) return foundItems[0];

  // If found in multiple clusters, pick the one with freshest updatedAt
  foundItems.sort((a, b) => {
    const dateA = new Date(a.item.updatedAt || a.item.clientUpdatedAt || 0).getTime();
    const dateB = new Date(b.item.updatedAt || b.item.clientUpdatedAt || 0).getTime();
    return dateB - dateA;
  });

  return foundItems[0];
};

/**
 * Aggregates activity logs across all clusters, deduplicates and sorts.
 */
export const aggregateActivityLogs = async (
  username: string,
  userId: string,
  limit = 100,
): Promise<ActivityLogType[]> => {
  await multiClusterPool.initialize();
  const nodes = multiClusterPool.getHealthyNodes();
  const targetNodes = nodes.length > 0 ? nodes : multiClusterPool.getAllNodes();

  const queryPromises = targetNodes.map(async (node) => {
    try {
      const DynamicLogModel = getActivityLogModel(username, node.connection);
      const docs = await DynamicLogModel.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .allowDiskUse(true)
        .lean()
        .exec();
      return docs as ActivityLogType[];
    } catch {
      return [] as ActivityLogType[];
    }
  });

  const results = await Promise.allSettled(queryPromises);
  const logMap = new Map<string, ActivityLogType>();

  for (const res of results) {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      for (const log of res.value) {
        const idKey =
          (log as any)._id?.toString() ||
          `${log.userId}_${log.action}_${new Date(log.createdAt || 0).getTime()}`;
        if (!logMap.has(idKey)) {
          logMap.set(idKey, log);
        }
      }
    }
  }

  const merged = Array.from(logMap.values());
  merged.sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
  );

  return merged.slice(0, limit);
};

/**
 * Finds user account across all clusters in priority order.
 */
export const findUserAcrossClusters = async (
  query: Record<string, any>,
): Promise<LocatedUser | null> => {
  await multiClusterPool.initialize();
  const nodes = multiClusterPool.getHealthyNodes();
  const targetNodes = nodes.length > 0 ? nodes : multiClusterPool.getAllNodes();

  for (const node of targetNodes) {
    try {
      const UserModel = getUserModel(node.connection);
      const user = await UserModel.findOne(query).exec();
      if (user) {
        return { user, node };
      }
    } catch {
      // try next node
    }
  }

  return null;
};

/**
 * Mirrors user document to all healthy cluster nodes in the background.
 */
export const mirrorUserToAllClusters = async (userDoc: any): Promise<void> => {
  if (!userDoc || !userDoc.username) return;

  await multiClusterPool.initialize();
  const nodes = multiClusterPool.getHealthyNodes();

  const userObj = typeof userDoc.toObject === 'function' ? userDoc.toObject() : { ...userDoc };
  delete userObj.__v;

  const mirrorPromises = nodes.map(async (node) => {
    try {
      const UserModel = getUserModel(node.connection);
      await UserModel.findOneAndUpdate(
        { username: userObj.username },
        { $set: userObj },
        { upsert: true, setDefaultsOnInsert: true },
      ).exec();
    } catch (err: any) {
      logger.warn(`[Aggregator] User mirror failed on node ${node.name}: ${err?.message}`);
    }
  });

  void Promise.allSettled(mirrorPromises);
};

/**
 * Soft-deletes or hard-deletes a vault item across all clusters in parallel.
 */
export const deleteVaultItemAcrossClusters = async (
  username: string,
  userId: string,
  itemId: string,
  hardDelete = false,
): Promise<number> => {
  await multiClusterPool.initialize();
  const nodes = multiClusterPool.getHealthyNodes();
  const targetNodes = nodes.length > 0 ? nodes : multiClusterPool.getAllNodes();

  const deletePromises = targetNodes.map(async (node) => {
    try {
      const DynamicModel = getVaultItemModel(username, node.connection);
      if (hardDelete) {
        const res = await DynamicModel.deleteOne({ userId, itemId });
        return res.deletedCount || 0;
      } else {
        const res = await DynamicModel.updateOne(
          { userId, itemId },
          { $set: { isDeleted: true, deletedAt: new Date(), updatedAt: new Date() } },
        );
        return res.modifiedCount || 0;
      }
    } catch {
      return 0;
    }
  });

  const results = await Promise.allSettled(deletePromises);
  return results.reduce((acc, r) => acc + (r.status === 'fulfilled' ? r.value : 0), 0);
};
