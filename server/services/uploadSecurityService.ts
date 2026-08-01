import crypto from 'crypto';
import mongoose from 'mongoose';
import { ensureMongoReady } from '../mongo.ts';
import { getVaultItemModel } from '../models/vaultItem.ts';
import { logger } from '../utils/logger.ts';

type ArtifactVerdict = 'clean' | 'malicious';

interface UploadSecurityJob {
  userId: string;
  username: string;
  itemId: string;
  category: string;
  fileName: string;
  mimeType: string;
  payload: Buffer;
}

const MALWARE_PATTERNS = (process.env.MALWARE_SIGNATURE_PATTERNS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const PHASH_BYTES = 32;

const getSecurityCollection = async () => {
  const ready = await ensureMongoReady();
  if (!ready || !mongoose.connection.db) {
    throw new Error('MongoDB not ready for upload security collection.');
  }
  return mongoose.connection.db.collection('upload_security_artifacts');
};

const hex = (buffer: Buffer) => buffer.toString('hex');
const sha256 = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const perceptualHash = (buffer: Buffer): string => {
  const hash = crypto.createHash('sha256').update(buffer).digest();
  return hex(hash.subarray(0, PHASH_BYTES));
};

const isLikelyMalicious = (buffer: Buffer): { malicious: boolean; reason: string | null } => {
  const ascii = buffer.toString('latin1');
  if (ascii.includes(EICAR_SIGNATURE)) {
    return { malicious: true, reason: 'eicar_signature_detected' };
  }
  for (const signature of MALWARE_PATTERNS) {
    if (signature && ascii.includes(signature)) {
      return { malicious: true, reason: `pattern:${signature.slice(0, 32)}` };
    }
  }
  return { malicious: false, reason: null };
};

const updateScanState = async (
  username: string,
  userId: string,
  itemId: string,
  patch: Record<string, unknown>
) => {
  const model = getVaultItemModel(username);
  await model.updateOne(
    { userId, itemId },
    {
      $set: Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [`metadata.uploadSecurity.${key}`, value])
      ),
    }
  );
};

const persistArtifactVerdict = async (input: {
  sha256: string;
  perceptualHash: string;
  verdict: ArtifactVerdict;
  reason?: string | null;
}) => {
  const collection = await getSecurityCollection();
  const now = new Date();
  await collection.createIndex({ sha256: 1 }, { unique: true, sparse: true });
  await collection.createIndex({ perceptualHash: 1 }, { sparse: true });
  await collection.updateOne(
    { sha256: input.sha256 },
    {
      $set: {
        sha256: input.sha256,
        perceptualHash: input.perceptualHash,
        verdict: input.verdict,
        reason: input.reason || null,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );
};

const lookupPriorMalicious = async (sha: string, pHash: string) => {
  const collection = await getSecurityCollection();
  const matched = await collection.findOne({
    verdict: 'malicious',
    $or: [{ sha256: sha }, { perceptualHash: pHash }],
  });
  return matched;
};

const executeUploadSecurityJob = async (job: UploadSecurityJob) => {
  const fileSha = sha256(job.payload);
  const filePHash = perceptualHash(job.payload);

  await updateScanState(job.username, job.userId, job.itemId, {
    scanStatus: 'scanning',
    scannedAt: null,
    verdict: null,
    reason: null,
    sha256: fileSha,
    perceptualHash: filePHash,
  });

  const previousMalicious = await lookupPriorMalicious(fileSha, filePHash);
  if (previousMalicious) {
    await updateScanState(job.username, job.userId, job.itemId, {
      scanStatus: 'blocked',
      verdict: 'malicious',
      reason: 'matched_prior_malicious_artifact',
      scannedAt: new Date().toISOString(),
      isActive: false,
    });
    return;
  }

  const malwareCheck = isLikelyMalicious(job.payload);
  if (malwareCheck.malicious) {
    await persistArtifactVerdict({
      sha256: fileSha,
      perceptualHash: filePHash,
      verdict: 'malicious',
      reason: malwareCheck.reason,
    });
    await updateScanState(job.username, job.userId, job.itemId, {
      scanStatus: 'blocked',
      verdict: 'malicious',
      reason: malwareCheck.reason,
      scannedAt: new Date().toISOString(),
      isActive: false,
    });
    return;
  }

  await persistArtifactVerdict({
    sha256: fileSha,
    perceptualHash: filePHash,
    verdict: 'clean',
    reason: null,
  });
  await updateScanState(job.username, job.userId, job.itemId, {
    scanStatus: 'active',
    verdict: 'clean',
    reason: null,
    scannedAt: new Date().toISOString(),
    isActive: true,
  });
};

export const enqueueUploadSecurityScan = (job: UploadSecurityJob) => {
  setTimeout(() => {
    executeUploadSecurityJob(job).catch((error) => {
      logger.error('Upload security scan failed', {
        userId: job.userId,
        itemId: job.itemId,
        error: error instanceof Error ? error.message : String(error),
      });
      updateScanState(job.username, job.userId, job.itemId, {
        scanStatus: 'error',
        verdict: null,
        reason: 'scan_execution_error',
        scannedAt: new Date().toISOString(),
        isActive: false,
      }).catch(() => {
        // best effort
      });
    });
  }, 0);
};
