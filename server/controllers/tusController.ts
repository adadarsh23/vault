import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import { AppError } from '../utils/appError.ts';

const DEFAULT_TUS_TMP_ROOT =
  process.platform === 'win32'
    ? path.join(process.cwd(), 'vault-tmp', 'tus-uploads')
    : '/tmp/vault/tus-uploads';
const TUS_TMP_ROOT = path.resolve(process.env.TUS_TMP_ROOT || DEFAULT_TUS_TMP_ROOT);
const MAX_TUS_FILE_SIZE = Math.max(1, Number(process.env.MAX_FILE_SIZE_MB || 4096) * 1024 * 1024);
const TUS_SESSION_TTL_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.TUS_SESSION_TTL_MS || 2 * 60 * 60 * 1000),
);

const SAFE_UPLOAD_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,128}$/;

const assertSafeUploadId = (id: unknown): string => {
  if (typeof id !== 'string' || !SAFE_UPLOAD_ID_PATTERN.test(id)) {
    throw AppError.badRequest('Invalid TUS upload identifier.', 'INVALID_UPLOAD_ID');
  }
  return id;
};

interface TusSession {
  uploadId: string;
  userId: string;
  username: string;
  fileSize: number;
  offset: number;
  metadata: Record<string, string>;
  filePath: string;
  createdAt: number;
  updatedAt: number;
}

const tusSessions = new Map<string, TusSession>();

const cleanupExpiredTusSessions = async () => {
  const now = Date.now();
  for (const [uploadId, session] of tusSessions.entries()) {
    if (now - session.updatedAt > TUS_SESSION_TTL_MS) {
      tusSessions.delete(uploadId);
      if (session.filePath) {
        try {
          const uploadDir = path.dirname(session.filePath);
          const resolvedDir = path.resolve(uploadDir);
          if (resolvedDir.startsWith(TUS_TMP_ROOT) && resolvedDir !== TUS_TMP_ROOT) {
            await fs.rm(resolvedDir, { recursive: true, force: true });
          }
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
};

const tusCleanupInterval = setInterval(
  () => {
    void cleanupExpiredTusSessions();
  },
  10 * 60 * 1000,
);
tusCleanupInterval.unref();

export const optionsTusController = async (_req: express.Request, res: express.Response) => {
  res.setHeader('Tus-Resumable', '1.0.0');
  res.setHeader('Tus-Version', '1.0.0');
  res.setHeader('Tus-Max-Size', MAX_TUS_FILE_SIZE.toString());
  res.setHeader('Tus-Extension', 'creation,termination');
  return res.status(204).end();
};

export const createTusUploadController = async (
  req: AuthenticatedRequest,
  res: express.Response,
) => {
  const userId = req.user.userId;
  const username = req.user.username;

  const lengthHeader = req.headers['upload-length'];
  const metadataHeader = req.headers['upload-metadata'];

  const fileSize = parseInt(
    (Array.isArray(lengthHeader) ? lengthHeader[0] : lengthHeader) || '0',
    10,
  );
  if (isNaN(fileSize) || fileSize <= 0) {
    res.setHeader('Tus-Resumable', '1.0.0');
    throw AppError.badRequest('Missing or invalid Upload-Length header.', 'INVALID_TUS_LENGTH');
  }
  if (fileSize > MAX_TUS_FILE_SIZE) {
    res.setHeader('Tus-Resumable', '1.0.0');
    throw AppError.badRequest(
      'TUS upload exceeds the configured file size limit.',
      'FILE_TOO_LARGE',
    );
  }

  const metadata: Record<string, string> = {};
  const rawMeta = Array.isArray(metadataHeader) ? metadataHeader[0] : metadataHeader;
  if (rawMeta) {
    const pairs = rawMeta.split(',');
    for (const pair of pairs) {
      const parts = pair.trim().split(' ');
      if (parts[0]) {
        const key = parts[0].replace(/[^a-zA-Z0-9_-]/g, '');
        const valB64 = parts[1] || '';
        try {
          metadata[key] = Buffer.from(valB64, 'base64').toString('utf-8');
        } catch {
          metadata[key] = valB64;
        }
      }
    }
  }

  const uploadId = `tus_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const uploadDir = path.join(TUS_TMP_ROOT, uploadId);
  const filePath = path.join(uploadDir, 'chunk_data.bin');

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(filePath, Buffer.alloc(0));

  const session: TusSession = {
    uploadId,
    userId,
    username,
    fileSize,
    offset: 0,
    metadata,
    filePath,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  tusSessions.set(uploadId, session);

  const location = `/api/vault/files/tus/${uploadId}`;
  res.setHeader('Tus-Resumable', '1.0.0');
  res.setHeader('Location', location);
  return res.status(201).end();
};

export const getTusOffsetController = async (req: AuthenticatedRequest, res: express.Response) => {
  res.setHeader('Tus-Resumable', '1.0.0');

  const rawId = Array.isArray(req.params.uploadId) ? req.params.uploadId[0] : req.params.uploadId;
  const uploadId = assertSafeUploadId(rawId);
  const session = tusSessions.get(uploadId);

  if (!session || session.userId !== req.user.userId) {
    return res.status(404).end();
  }

  res.setHeader('Upload-Offset', session.offset.toString());
  res.setHeader('Upload-Length', session.fileSize.toString());
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).end();
};

export const uploadTusChunkController = async (
  req: AuthenticatedRequest,
  res: express.Response,
) => {
  res.setHeader('Tus-Resumable', '1.0.0');

  const rawId = Array.isArray(req.params.uploadId) ? req.params.uploadId[0] : req.params.uploadId;
  const uploadId = assertSafeUploadId(rawId);
  const session = tusSessions.get(uploadId);

  if (!session || session.userId !== req.user.userId) {
    throw AppError.notFound('TUS upload session not found.', 'TUS_SESSION_NOT_FOUND');
  }

  const offsetHeader = req.headers['upload-offset'];
  const reqOffset = parseInt(
    (Array.isArray(offsetHeader) ? offsetHeader[0] : offsetHeader) || '-1',
    10,
  );

  if (isNaN(reqOffset) || reqOffset < 0) {
    throw AppError.badRequest('Missing or invalid Upload-Offset header.', 'INVALID_UPLOAD_OFFSET');
  }

  if (reqOffset !== session.offset) {
    return res.status(409).json({
      error: 'Upload-Offset mismatch',
      currentOffset: session.offset,
    });
  }

  if (Buffer.isBuffer(req.body) || req.body instanceof Uint8Array) {
    const chunkBuffer = Buffer.from(req.body);
    if (session.offset + chunkBuffer.length > session.fileSize) {
      throw AppError.badRequest('TUS chunk exceeds the declared upload size.', 'TUS_SIZE_MISMATCH');
    }
    await fs.appendFile(session.filePath, chunkBuffer);
    session.offset += chunkBuffer.length;
  } else {
    for await (const chunk of req) {
      const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (session.offset + chunkBuffer.length > session.fileSize) {
        throw AppError.badRequest(
          'TUS chunk exceeds the declared upload size.',
          'TUS_SIZE_MISMATCH',
        );
      }
      await fs.appendFile(session.filePath, chunkBuffer);
      session.offset += chunkBuffer.length;
    }
  }
  session.updatedAt = Date.now();

  res.setHeader('Upload-Offset', session.offset.toString());
  return res.status(204).end();
};

export const getTusSessionBuffer = async (
  uploadId: string,
  userId?: string,
): Promise<Buffer | null> => {
  if (!SAFE_UPLOAD_ID_PATTERN.test(uploadId)) {
    return null;
  }
  const session = tusSessions.get(uploadId);
  if (session) {
    if (userId && session.userId !== userId) return null;
    try {
      return await fs.readFile(session.filePath);
    } catch {
      return null;
    }
  }
  return null;
};
