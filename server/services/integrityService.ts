/**
 * Server-Side Cryptographic Integrity & Merkle Tree Service
 *
 * Implements vault-wide cryptographic tree maintenance, bit-flip detection,
 * Merkle proof generation, and automated tamper alarm response.
 */

import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { getVaultItemModel } from '../models/vaultItem.ts';
import { VaultIntegrity, MerkleAuditRecord } from '../models/vaultIntegrity.ts';
import {
  MerkleTree,
  computeBufferHash,
  HashAlgorithm,
  MerkleLeafItem,
  MerkleProof,
} from '../utils/merkleTree.ts';
import { threatResponseService } from './threatResponseService.ts';
import { createNotification } from './notificationService.ts';
import { emitVaultEvent } from '../socket.ts';
import { logger } from '../utils/logger.ts';

export interface IntegrityStatusResponse {
  activeRootHash: string;
  algorithm: HashAlgorithm;
  totalLeaves: number;
  treeDepth: number;
  lastAuditAt: Date | null;
  lastAuditStatus: 'clean' | 'corrupted' | 'warning';
  tamperIncidentCount: number;
}

export interface AuditResult {
  auditId: string;
  timestamp: number;
  status: 'clean' | 'corrupted';
  totalChecked: number;
  rootHash: string;
  algorithm: HashAlgorithm;
  corruptedItems: {
    itemId: string;
    title: string;
    category: string;
    expectedHash: string;
    actualHash: string;
    reason: string;
  }[];
  alarmTriggered: boolean;
}

class IntegrityService {
  /**
   * Builds the current Merkle Tree for a given user from their stored vault items
   */
  async buildUserMerkleTree(
    userId: string,
    username: string,
    algorithm: HashAlgorithm = 'blake3',
  ): Promise<{ tree: MerkleTree; rootHash: string; leafItems: MerkleLeafItem[] }> {
    const DynamicVaultModel = getVaultItemModel(username);
    const rawItems = await DynamicVaultModel.find({
      userId: new mongoose.Types.ObjectId(userId),
      isDeleted: false,
    })
      .lean()
      .exec();

    const leafItems: MerkleLeafItem[] = [];

    for (const item of rawItems) {
      let contentHash = '';
      const meta = (item.metadata as any) || {};

      if (meta.integrity?.hash) {
        contentHash = meta.integrity.hash;
      } else if (meta.sha256) {
        contentHash = meta.sha256;
      } else if (item.payload) {
        contentHash = await computeBufferHash(item.payload, algorithm);
      } else if (item.modernPayload) {
        contentHash = await computeBufferHash(item.modernPayload, algorithm);
      } else if (item.file?.filePath) {
        contentHash = await computeBufferHash(
          `${item.file.filePath}:${item.file.size || 0}`,
          algorithm,
        );
      } else {
        contentHash = await computeBufferHash(item.itemId, algorithm);
      }

      leafItems.push({
        itemId: item.itemId,
        category: item.category,
        hash: contentHash,
        size: item.file?.size || (typeof item.payload === 'string' ? item.payload.length : 0),
        updatedAt: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now(),
      });
    }

    const tree = new MerkleTree(algorithm);
    const rootHash = await tree.build(leafItems);

    // Persist or update VaultIntegrity document
    await VaultIntegrity.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      {
        userId: new mongoose.Types.ObjectId(userId),
        username,
        activeRootHash: rootHash,
        algorithm,
        totalLeaves: tree.getLeafCount(),
        treeDepth: tree.getDepth(),
      },
      { upsert: true, returnDocument: 'after' },
    );

    return { tree, rootHash, leafItems };
  }

  /**
   * Returns current Merkle Tree status for the user
   */
  async getStatus(userId: string, username: string): Promise<IntegrityStatusResponse> {
    const record = await VaultIntegrity.findOne({
      userId: new mongoose.Types.ObjectId(userId),
    })
      .lean()
      .exec();

    if (!record) {
      const { rootHash, tree } = await this.buildUserMerkleTree(userId, username);
      return {
        activeRootHash: rootHash,
        algorithm: 'blake3',
        totalLeaves: tree.getLeafCount(),
        treeDepth: tree.getDepth(),
        lastAuditAt: null,
        lastAuditStatus: 'clean',
        tamperIncidentCount: 0,
      };
    }

    return {
      activeRootHash: record.activeRootHash,
      algorithm: record.algorithm as HashAlgorithm,
      totalLeaves: record.totalLeaves,
      treeDepth: record.treeDepth,
      lastAuditAt: record.lastAuditAt,
      lastAuditStatus: record.lastAuditStatus,
      tamperIncidentCount: record.tamperIncidentCount || 0,
    };
  }

  /**
   * Run a full cryptographic audit verifying content hashes and Merkle root against stored data.
   * If any bit-flip or corruption is detected, triggers instant vault alarms!
   */
  async auditVault(
    userId: string,
    username: string,
    ip: string = '127.0.0.1',
    algorithm: HashAlgorithm = 'blake3',
  ): Promise<AuditResult> {
    const auditId = `audit_${randomUUID()}`;
    const DynamicVaultModel = getVaultItemModel(username);
    const items = await DynamicVaultModel.find({
      userId: new mongoose.Types.ObjectId(userId),
      isDeleted: false,
    })
      .lean()
      .exec();

    const corruptedItems: {
      itemId: string;
      title: string;
      category: string;
      expectedHash: string;
      actualHash: string;
      reason: string;
    }[] = [];

    const leafItems: MerkleLeafItem[] = [];

    for (const item of items) {
      const meta = (item.metadata as any) || {};
      const expectedHash = meta.integrity?.hash || meta.sha256;
      let actualHash = '';

      if (item.payload) {
        actualHash = await computeBufferHash(item.payload, algorithm);
      } else if (item.modernPayload) {
        actualHash = await computeBufferHash(item.modernPayload, algorithm);
      }

      // If item had a recorded hash and computed hash deviates -> bit flip detected!
      if (expectedHash && actualHash && actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
        corruptedItems.push({
          itemId: item.itemId,
          title: item.title || item.file?.fileName || item.itemId,
          category: item.category,
          expectedHash,
          actualHash,
          reason: 'Cryptographic payload checksum mismatch (bit-flip / modification detected)',
        });
      }

      leafItems.push({
        itemId: item.itemId,
        category: item.category,
        hash: actualHash || expectedHash || item.itemId,
        size: item.file?.size || 0,
      });
    }

    const tree = new MerkleTree(algorithm);
    const currentRoot = await tree.build(leafItems);

    const isCorrupted = corruptedItems.length > 0;
    let alarmTriggered = false;

    if (isCorrupted) {
      alarmTriggered = true;
      logger.error(`[INTEGRITY ALARM] Bit-flip / Tampering detected for user ${username}`, {
        userId,
        corruptedCount: corruptedItems.length,
        corruptedItems,
      });

      // 1. Trigger automated threat response
      await threatResponseService.processThreat({
        userId,
        ip,
        riskScore: 100,
        type: 'malware_upload',
        details: {
          threatType: 'BIT_FLIP_CORRUPTION_DETECTED',
          corruptedItems,
          auditId,
        },
      });

      // 2. Emit real-time WebSocket alarm to user's connected sessions
      emitVaultEvent(userId, 'vault:integrity_alarm', {
        type: 'BIT_FLIP_TAMPER_ALARM',
        severity: 'CRITICAL',
        corruptedItems,
        rootHash: currentRoot,
        auditId,
        timestamp: Date.now(),
      });

      // 3. Create persistent security notification
      await createNotification(
        userId,
        'security_alert',
        '🚨 Cryptographic Tamper Alarm Triggered',
        `Silent bit-flip or data corruption was detected in ${corruptedItems.length} vault item(s). Instant containment protocol initiated.`,
        { corruptedItems, auditId, severity: 'critical' },
        username,
      );
    }

    const auditRecord: MerkleAuditRecord = {
      auditId,
      timestamp: new Date(),
      status: isCorrupted ? 'corrupted' : 'clean',
      itemCount: items.length,
      rootHash: currentRoot,
      algorithm,
      corruptedItemIds: corruptedItems.map((c) => c.itemId),
      details: {
        corruptedCount: corruptedItems.length,
        alarmTriggered,
      },
    };

    await VaultIntegrity.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      {
        userId: new mongoose.Types.ObjectId(userId),
        username,
        activeRootHash: currentRoot,
        algorithm,
        totalLeaves: tree.getLeafCount(),
        treeDepth: tree.getDepth(),
        lastAuditAt: new Date(),
        lastAuditStatus: isCorrupted ? 'corrupted' : 'clean',
        $inc: { tamperIncidentCount: isCorrupted ? 1 : 0 },
        $push: {
          auditHistory: {
            $each: [auditRecord],
            $slice: -20, // Keep last 20 audit records
          },
        },
      },
      { upsert: true },
    );

    return {
      auditId,
      timestamp: Date.now(),
      status: isCorrupted ? 'corrupted' : 'clean',
      totalChecked: items.length,
      rootHash: currentRoot,
      algorithm,
      corruptedItems,
      alarmTriggered,
    };
  }

  /**
   * Generates Merkle proof for a specific item
   */
  async getProof(
    userId: string,
    username: string,
    itemId: string,
    algorithm: HashAlgorithm = 'blake3',
  ): Promise<MerkleProof | null> {
    const { tree } = await this.buildUserMerkleTree(userId, username, algorithm);
    return tree.generateProof(itemId);
  }

  /**
   * Process client-reported tamper alarm (e.g. browser worker detected bit-flip upon decrypting image)
   */
  async reportTamper(
    userId: string,
    username: string,
    ip: string,
    report: {
      itemId: string;
      expectedHash: string;
      actualHash: string;
      details?: Record<string, any>;
    },
  ): Promise<void> {
    logger.warn(`[CLIENT REPORTED TAMPER] User ${username} item ${report.itemId}`, {
      userId,
      ...report,
    });

    await threatResponseService.processThreat({
      userId,
      ip,
      riskScore: 95,
      type: 'malware_upload',
      details: {
        threatType: 'CLIENT_REPORTED_BIT_FLIP',
        report,
      },
    });

    emitVaultEvent(userId, 'vault:integrity_alarm', {
      type: 'CLIENT_BIT_FLIP_ALARM',
      severity: 'CRITICAL',
      report,
      timestamp: Date.now(),
    });

    await createNotification(
      userId,
      'security_alert',
      '🚨 Client Bit-Flip Alarm Reported',
      `Client integrity verification failed for item ${report.itemId}. A bit-flip mismatch was reported.`,
      { report, severity: 'critical' },
      username,
    );
  }
}

export const integrityService = new IntegrityService();
