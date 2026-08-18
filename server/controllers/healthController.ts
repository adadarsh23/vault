import express from 'express';
import mongoose from 'mongoose';
import { ensureMongoReady } from '../mongo.ts';
import { multiClusterPool } from '../services/multiClusterPool.ts';

const DEFAULT_DB_NAME = process.env.MONGODB_DB_NAME?.trim() || 'vault';

const writeHealthHeaders = (res: express.Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

const isTestRuntime = (): boolean => {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return true;
  }

  return process.argv.some((arg) => arg.includes('vitest'));
};

const isMongoOptionalMode = (): boolean => {
  const raw = process.env.SKIP_MONGO_CONNECT?.trim().toLowerCase();
  const skipMongo = raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  return skipMongo && !isTestRuntime();
};

export const getHealthStatus = async (_req: express.Request, res: express.Response) => {
  const ready = isMongoOptionalMode() ? true : await ensureMongoReady();
  writeHealthHeaders(res);

  const clusterSummaries = multiClusterPool.getAllNodes().map((n) => ({
    id: n.id,
    name: n.name,
    host: n.host,
    healthy: n.isHealthy,
    full: n.isFull,
    lastPingMs: n.lastPingMs,
  }));

  return res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'connected' : 'disconnected',
    database: {
      name: mongoose.connection.name || DEFAULT_DB_NAME,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host || null,
      multiCluster: {
        totalConfigured: clusterSummaries.length,
        healthyCount: clusterSummaries.filter((c) => c.healthy).length,
        clusters: clusterSummaries,
      },
    },
    timestamp: new Date().toISOString(),
  });
};

export const getReadinessStatus = async (_req: express.Request, res: express.Response) => {
  const mongoOptional = isMongoOptionalMode();
  const mongoReady = mongoOptional ? true : await ensureMongoReady();
  const hasJwtSecret = Boolean(process.env.JWT_SECRET?.trim());
  const hasMongoUri = mongoOptional
    ? true
    : Boolean(process.env.MONGODB_URI?.trim() || process.env.MONGODB_URL?.trim());
  const ready = mongoReady && hasJwtSecret && hasMongoUri;

  writeHealthHeaders(res);

  return res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'ready' : 'not_ready',
    checks: {
      mongo: mongoReady,
      jwtSecret: hasJwtSecret,
      mongoUri: hasMongoUri,
    },
    timestamp: new Date().toISOString(),
  });
};
