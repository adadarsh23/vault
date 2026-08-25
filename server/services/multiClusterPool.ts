import mongoose from 'mongoose';
import { logger } from '../utils/logger.ts';

export interface ClusterNode {
  id: string;
  name: string;
  uri: string;
  host: string;
  priority: number;
  connection: mongoose.Connection;
  isHealthy: boolean;
  isFull: boolean;
  lastPingMs: number;
  lastCheckedAt: Date;
}

interface DiscoveredTarget {
  id: string;
  name: string;
  uri: string;
  priority: number;
}

const resolveDatabaseName = (mongoUri: string): string => {
  const configured = (
    process.env.MONGODB_DB_NAME ||
    process.env.MONGODB_DB ||
    process.env.MONGO_DB_NAME ||
    process.env.MONGO_DB
  )?.trim();

  if (configured && configured.toLowerCase() !== 'admin') {
    return configured;
  }
  if (mongoUri) {
    try {
      const match = mongoUri.match(/(?:mongodb(?:\+srv)?:\/\/[^\/]+\/)([^?\/]+)/i);
      if (match && match[1] && match[1].toLowerCase() !== 'admin') {
        return match[1].trim();
      }
    } catch {
      // ignore
    }
  }
  return 'vault';
};

const extractClusterHost = (uri: string): string => {
  try {
    const match = uri.match(/@([^/?#]+)/);
    if (match && match[1]) {
      return match[1].split(',')[0];
    }
  } catch {
    // ignore
  }
  return 'unknown-host';
};

export const maskUri = (uri: string): string => {
  return uri.replace(/(:\/\/)(.*)(@)/, '$1***:***$3');
};

export const discoverClusterTargets = (
  env: NodeJS.ProcessEnv = process.env,
): DiscoveredTarget[] => {
  const targets: DiscoveredTarget[] = [];
  const seenUris = new Set<string>();

  const addTarget = (id: string, name: string, rawUri: string | undefined, priority: number) => {
    const uri = rawUri?.trim();
    if (uri && (uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'))) {
      if (!seenUris.has(uri)) {
        seenUris.add(uri);
        targets.push({ id, name, uri, priority });
      }
    }
  };

  // 1. Primary Cluster (Priority 1)
  const primaryUri = (env.MONGODB_URI || env.MONGO_URI || env.MONGODB_URL || env.MONGO_URL)?.trim();
  addTarget('primary', 'Primary (Cluster 1)', primaryUri, 1);

  // 2. Secondary Fallback (Priority 2)
  const fallbackUri = (
    env.MONGODB_URI_FALLBACK ||
    env.MONGODB_URL_FALLBACK ||
    env.MONGO_URI_FALLBACK ||
    env.MONGO_URL_FALLBACK
  )?.trim();
  addTarget('fallback', 'Fallback (Cluster 2)', fallbackUri, 2);

  // 3. Numbered Additional Clusters (Priority 3, 4, 5...)
  const numberedKeys = Object.keys(env)
    .filter((k) => /^(?:MONGODB|MONGO)_(?:URI|URL)_(\d+)$/i.test(k))
    .sort((a, b) => {
      const numA = Number.parseInt(a.match(/\d+$/)?.[0] || '0', 10);
      const numB = Number.parseInt(b.match(/\d+$/)?.[0] || '0', 10);
      return numA - numB;
    });

  let currentPriority = 3;
  for (const key of numberedKeys) {
    const num = key.match(/\d+$/)?.[0] || String(currentPriority);
    addTarget(
      `backup_${num}`,
      `Backup ${num} (Cluster ${currentPriority})`,
      env[key],
      currentPriority,
    );
    currentPriority += 1;
  }

  // 4. Direct non-SRV Fallback (if set)
  if (env.MONGODB_URI_DIRECT) {
    addTarget('direct', 'Direct Non-SRV', env.MONGODB_URI_DIRECT, currentPriority);
  }

  return targets;
};

class MultiClusterPoolManager {
  private nodes: Map<string, ClusterNode> = new Map();
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const targets = discoverClusterTargets();
      logger.info(`[MultiClusterPool] Initializing pool with ${targets.length} target(s)...`);

      for (const target of targets) {
        try {
          const dbName = resolveDatabaseName(target.uri);
          const host = extractClusterHost(target.uri);

          const connection = mongoose.createConnection(target.uri, {
            dbName,
            autoIndex: process.env.NODE_ENV !== 'production',
            serverSelectionTimeoutMS: 10_000,
            connectTimeoutMS: 10_000,
            maxPoolSize: 10,
          });

          // Prevent unhandled error events
          connection.on('error', (err) => {
            logger.warn(`[MultiClusterPool] Error on ${target.name}: ${err?.message || err}`);
            const node = this.nodes.get(target.id);
            if (node) node.isHealthy = false;
          });

          connection.on('connected', () => {
            const node = this.nodes.get(target.id);
            if (node) node.isHealthy = true;
          });

          const node: ClusterNode = {
            id: target.id,
            name: target.name,
            uri: target.uri,
            host,
            priority: target.priority,
            connection,
            isHealthy: false,
            isFull: false,
            lastPingMs: 0,
            lastCheckedAt: new Date(),
          };

          this.nodes.set(target.id, node);
        } catch (err) {
          logger.error(`[MultiClusterPool] Failed to create connection for ${target.name}:`, err);
        }
      }

      this.isInitialized = true;
      // Trigger background initial ping across all nodes
      void this.pingAllNodes();
    })();

    return this.initPromise;
  }

  public async pingAllNodes(): Promise<ClusterNode[]> {
    const promises = Array.from(this.nodes.values()).map(async (node) => {
      const start = Date.now();
      try {
        await node.connection.asPromise();
        await node.connection.db?.admin().ping();
        node.isHealthy = true;
        node.lastPingMs = Date.now() - start;
        node.lastCheckedAt = new Date();
      } catch (err: any) {
        node.isHealthy = false;
        node.lastPingMs = Date.now() - start;
        node.lastCheckedAt = new Date();
        logger.warn(
          `[MultiClusterPool] Node ${node.name} ping failed (${node.lastPingMs}ms): ${err?.message}`,
        );
      }
      return node;
    });

    return Promise.all(promises);
  }

  public getAllNodes(): ClusterNode[] {
    return Array.from(this.nodes.values()).sort((a, b) => a.priority - b.priority);
  }

  public getHealthyNodes(): ClusterNode[] {
    return this.getAllNodes().filter((node) => node.isHealthy && node.connection.readyState === 1);
  }

  public async getWriteNode(): Promise<ClusterNode> {
    await this.initialize();
    const healthy = this.getHealthyNodes();

    // Find the highest priority healthy node that is NOT full
    const candidate = healthy.find((node) => !node.isFull);
    if (candidate) {
      return candidate;
    }

    // Fallback: If all healthy nodes are marked full or readyState is still connecting,
    // return the primary node or the first available healthy node
    const all = this.getAllNodes();
    if (healthy.length > 0) {
      return healthy[0];
    }
    if (all.length > 0) {
      return all[0];
    }

    throw new Error('No MongoDB cluster nodes available in multi-cluster pool.');
  }

  public markNodeFull(nodeIdOrUri: string): void {
    for (const node of this.nodes.values()) {
      if (node.id === nodeIdOrUri || node.uri === nodeIdOrUri || node.host === nodeIdOrUri) {
        node.isFull = true;
        logger.warn(`[MultiClusterPool] Node ${node.name} (${node.host}) marked as STORAGE_FULL.`);
      }
    }
  }

  public getNodeByHost(host: string): ClusterNode | undefined {
    return Array.from(this.nodes.values()).find(
      (node) => node.host.includes(host) || host.includes(node.host),
    );
  }

  public getNodeById(id: string): ClusterNode | undefined {
    return this.nodes.get(id);
  }
}

export const multiClusterPool = new MultiClusterPoolManager();
