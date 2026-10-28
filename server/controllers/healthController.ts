import express from 'express';
import mongoose from 'mongoose';
import { ensureMongoReady } from '../mongo.ts';
import { multiClusterPool } from '../services/multiClusterPool.ts';
import { logger } from '../utils/logger.ts';

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

const sanitizeDatabaseHost = (host: string | null | undefined): string | null => {
  if (!host) return null;
  if (process.env.NODE_ENV === 'production') {
    // In production, mask internal host details to prevent network topology disclosure
    return host.includes('.') ? `***.${host.split('.').slice(-2).join('.')}` : 'configured';
  }
  return host;
};

export const getHealthStatus = async (_req: express.Request, res: express.Response) => {
  writeHealthHeaders(res);

  let ready = false;
  try {
    ready = isMongoOptionalMode() ? true : await ensureMongoReady();
  } catch (error) {
    logger.warn('[HealthController] ensureMongoReady check failed', { error });
    ready = false;
  }

  let clusterSummaries: Array<{
    id: string;
    name: string;
    host: string;
    healthy: boolean;
    full: boolean;
    lastPingMs?: number;
  }> = [];

  try {
    clusterSummaries = multiClusterPool.getAllNodes().map((n) => ({
      id: n.id,
      name: n.name,
      host: sanitizeDatabaseHost(n.host) || 'unknown',
      healthy: n.isHealthy,
      full: n.isFull,
      lastPingMs: n.lastPingMs,
    }));
  } catch (poolErr) {
    logger.debug('[HealthController] multiClusterPool.getAllNodes failed', { poolErr });
  }

  return res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'connected' : 'disconnected',
    database: {
      name: mongoose.connection.name || DEFAULT_DB_NAME,
      readyState: mongoose.connection.readyState,
      host: sanitizeDatabaseHost(mongoose.connection.host),
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
  writeHealthHeaders(res);

  const mongoOptional = isMongoOptionalMode();
  let mongoReady = false;
  try {
    mongoReady = mongoOptional ? true : await ensureMongoReady();
  } catch (error) {
    logger.warn('[HealthController] ensureMongoReady check failed in readiness', { error });
    mongoReady = false;
  }

  const hasJwtSecret = Boolean(process.env.JWT_SECRET?.trim());
  const hasMongoUri = mongoOptional
    ? true
    : Boolean(process.env.MONGODB_URI?.trim() || process.env.MONGODB_URL?.trim());
  const ready = mongoReady && hasJwtSecret && hasMongoUri;

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
