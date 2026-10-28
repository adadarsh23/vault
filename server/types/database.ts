/**
 * Database, Mongoose, and Multi-Cluster Pool Type Definitions
 *
 * Provides type contracts for MongoDB ObjectIds, lean documents,
 * audit timestamps, soft-delete metadata, and multi-cluster connection health.
 */

import type { Document, Types } from 'mongoose';

/**
 * Universal MongoDB identifier type (ObjectId instance or hex string)
 */
export type MongoId = Types.ObjectId | string;

/**
 * Common timestamps present on persisted documents
 */
export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Standard soft-delete tracking fields
 */
export interface SoftDeletable {
  isDeleted: boolean;
  deletedAt?: Date | null;
}

/**
 * Base database document attributes
 */
export interface BaseDocument extends Timestamps {
  _id: Types.ObjectId;
}

/**
 * Utility type to extract a lean, plain JavaScript object shape from a Document
 */
export type LeanDocument<T> = Omit<T, keyof Document> & {
  _id: Types.ObjectId | string;
};

/**
 * Database connection readiness states
 */
export type ConnectionState =
  'disconnected' | 'connected' | 'connecting' | 'disconnecting' | 'uninitialized';

/**
 * Health and diagnostics for a MongoDB cluster connection
 */
export interface ClusterHealthInfo {
  clusterIndex: number;
  uriSnippet: string;
  state: ConnectionState;
  isAvailable: boolean;
  pingMs?: number;
  error?: string | null;
  lastCheckedAt: Date;
}

/**
 * Multi-Cluster Smart Pool runtime metrics
 */
export interface MultiClusterPoolMetrics {
  totalClusters: number;
  healthyClusters: number;
  activeClusterIndex: number;
  clusters: ClusterHealthInfo[];
  totalQueriesRouted: number;
  failoverCount: number;
  lastFailoverAt?: Date | null;
}
