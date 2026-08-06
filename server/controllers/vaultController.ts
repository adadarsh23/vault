import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { AppError } from '../utils/appError.ts';
import { sendSuccess } from '../responses.ts';
import { saveActivityLog, getUserActivityLogs } from '../services/activityLogService.ts';
import {
  deleteVaultItemByCategory,
  getVaultSnapshot,
  saveEncryptedVaultItem,
} from '../services/vaultItemService.ts'; // Updated path
import { saveFileToVault } from '../services/vaultService.ts';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { processHlsAdaptive } from '../services/transcodingService.ts';
import { logger } from '../utils/logger.ts';
import {
  assertFileContentMatchesCategory,
  getFileExtension,
  maxUploadFileSizeBytes,
} from '../utils/fileStorage.ts';

const getUserId = (req: AuthenticatedRequest): string => req.user.userId;
const getUsername = (req: AuthenticatedRequest): string => req.user.username;
const DEFAULT_MULTIPART_TMP_ROOT = path.join(process.cwd(), 'vault-tmp', 'multipart-uploads');
const MULTIPART_ROOT = path.resolve(process.env.MULTIPART_TMP_ROOT || DEFAULT_MULTIPART_TMP_ROOT);
const MULTIPART_PART_SIZE_BYTES = Math.max(
  5 * 1024 * 1024,
  Number(process.env.MULTIPART_PART_SIZE_BYTES || 8 * 1024 * 1024)
);
const MAX_ACTIVE_MULTIPART_SESSIONS_PER_USER = Math.max(
  1,
  Number(process.env.MAX_ACTIVE_MULTIPART_SESSIONS_PER_USER || 4)
);
const MULTIPART_SESSION_TTL_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.MULTIPART_SESSION_TTL_MS || 2 * 60 * 60 * 1000)
);
const MULTIPART_MAX_FILE_SIZE_BYTES = maxUploadFileSizeBytes;
const MULTIPART_MAX_PARTS = Math.max(1, Number(process.env.MULTIPART_MAX_PARTS || 2000));
const FILE_CATEGORY_SET = new Set(['photo', 'video', 'audio', 'document', 'other-files']);
const MULTIPART_SECURE_CLEANUP =
  (process.env.MULTIPART_SECURE_CLEANUP?.trim().toLowerCase() || 'true') === 'true';
const MEMORY_ONLY_MULTIPART_UPLOADS =
  (process.env.MEMORY_ONLY_MULTIPART_UPLOADS ?? 'true').trim().toLowerCase() !== 'false';

const getRouteParam = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

type MultipartSessionRecord = {
  uploadId: string;
  userId: string;
  username: string;
  category: string;
  folder: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  keepMetadata: boolean;
  partSize: number;
  createdAt: number;
  updatedAt: number;
  parts: Record<string, { size: number; sha256: string }>;
};

const uploadAnomalyCounters = new Map<
  string,
  {
    windowStart: number;
    invalidTypeCount: number;
    hashMismatchCount: number;
    rapidLargeUploadCount: number;
  }
>();
const ANOMALY_WINDOW_MS = 10 * 60 * 1000;
const HASH_MISMATCH_ALERT_THRESHOLD = 5;
const INVALID_TYPE_ALERT_THRESHOLD = 5;
const RAPID_LARGE_UPLOAD_THRESHOLD = 4;
const LARGE_UPLOAD_BYTES = 100 * 1024 * 1024;

const recordUploadAnomaly = (
  userId: string,
  kind: 'invalid_type' | 'hash_mismatch' | 'rapid_large_upload',
  context: Record<string, unknown> = {}
) => {
  const now = Date.now();
  const state = uploadAnomalyCounters.get(userId);
  const baseline =
    !state || now - state.windowStart > ANOMALY_WINDOW_MS
      ? {
          windowStart: now,
          invalidTypeCount: 0,
          hashMismatchCount: 0,
          rapidLargeUploadCount: 0,
        }
      : state;

  if (kind === 'invalid_type') baseline.invalidTypeCount += 1;
  if (kind === 'hash_mismatch') baseline.hashMismatchCount += 1;
  if (kind === 'rapid_large_upload') baseline.rapidLargeUploadCount += 1;
  uploadAnomalyCounters.set(userId, baseline);

  const shouldAlert =
    baseline.invalidTypeCount >= INVALID_TYPE_ALERT_THRESHOLD ||
    baseline.hashMismatchCount >= HASH_MISMATCH_ALERT_THRESHOLD ||
    baseline.rapidLargeUploadCount >= RAPID_LARGE_UPLOAD_THRESHOLD;
  if (shouldAlert) {
    logger.warn('Upload security anomaly threshold exceeded', {
      userId,
      ...baseline,
      context,
    });
  }
};

const multipartSessionPath = (userId: string, uploadId: string) =>
  path.join(MULTIPART_ROOT, userId, uploadId, 'session.json');

const multipartPartsDir = (userId: string, uploadId: string) =>
  path.join(MULTIPART_ROOT, userId, uploadId, 'parts');

const multipartMemorySessions = new Map<string, MultipartSessionRecord>();
const multipartMemoryParts = new Map<string, Buffer>();

const multipartMemoryKey = (userId: string, uploadId: string) => `${userId}:${uploadId}`;
const multipartPartMemoryKey = (userId: string, uploadId: string, partNumber: number) =>
  `${multipartMemoryKey(userId, uploadId)}:${partNumber}`;

const safeRm = async (target: string): Promise<{ filesDeleted: number; bytesDeleted: number }> => {
  const absoluteTarget = path.resolve(target);
  if (!absoluteTarget.startsWith(MULTIPART_ROOT)) {
    return { filesDeleted: 0, bytesDeleted: 0 };
  }
  let filesDeleted = 0;
  let bytesDeleted = 0;
  if (MULTIPART_SECURE_CLEANUP) {
    const walk = async (current: string) => {
      let stats;
      try {
        stats = await fs.stat(current);
      } catch {
        return;
      }
      if (stats.isDirectory()) {
        const entries = await fs.readdir(current);
        for (const entry of entries) {
          await walk(path.join(current, entry));
        }
      } else {
        bytesDeleted += stats.size;
        filesDeleted += 1;
      }
    };
    await walk(absoluteTarget);
  }
  try {
    await fs.rm(absoluteTarget, { recursive: true, force: true });
  } catch {
    // Best effort.
  }
  return { filesDeleted, bytesDeleted };
};

const cleanupExpiredMultipartSessions = async (userId: string) => {
  const userDir = path.join(MULTIPART_ROOT, userId);
  let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
  try {
    entries = await fs.readdir(userDir, { withFileTypes: true });
  } catch {
    return;
  }
  const now = Date.now();
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const sessionFile = path.join(userDir, entry.name, 'session.json');
        try {
          const raw = await fs.readFile(sessionFile, 'utf8');
          const parsed = JSON.parse(raw) as MultipartSessionRecord;
          if (now - parsed.updatedAt > MULTIPART_SESSION_TTL_MS) {
            const metrics = await safeRm(path.join(userDir, entry.name));
            if (metrics.filesDeleted > 0) {
              logger.info('Expired multipart session cleaned', {
                userId,
                uploadId: entry.name,
                ...metrics,
              });
            }
          }
        } catch {
          await safeRm(path.join(userDir, entry.name));
        }
      })
  );
};

const loadMultipartSession = async (
  userId: string,
  uploadId: string
): Promise<MultipartSessionRecord | null> => {
  if (MEMORY_ONLY_MULTIPART_UPLOADS) {
    return multipartMemorySessions.get(multipartMemoryKey(userId, uploadId)) ?? null;
  }

  try {
    const raw = await fs.readFile(multipartSessionPath(userId, uploadId), 'utf8');
    return JSON.parse(raw) as MultipartSessionRecord;
  } catch {
    return null;
  }
};

const saveMultipartSession = async (session: MultipartSessionRecord): Promise<void> => {
  if (MEMORY_ONLY_MULTIPART_UPLOADS) {
    multipartMemorySessions.set(multipartMemoryKey(session.userId, session.uploadId), session);
    return;
  }

  const dir = path.dirname(multipartSessionPath(session.userId, session.uploadId));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    multipartSessionPath(session.userId, session.uploadId),
    JSON.stringify(session)
  );
};

const mergeAndSaveMultipartPartMetadata = async (
  sessionOwnerUserId: string,
  uploadId: string,
  partNumber: number,
  metadata: { size: number; sha256: string }
): Promise<MultipartSessionRecord> => {
  const latest = (await loadMultipartSession(sessionOwnerUserId, uploadId)) || null;
  if (!latest) {
    throw AppError.notFound('Upload session not found.', 'UPLOAD_SESSION_NOT_FOUND');
  }
  latest.parts = {
    ...(latest.parts || {}),
    [String(partNumber)]: metadata,
  };
  latest.updatedAt = Date.now();
  await saveMultipartSession(latest);
  return latest;
};

const sha256Hex = (buffer: Buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const getMultipartPartCount = (session: MultipartSessionRecord): number =>
  Math.ceil(session.fileSize / session.partSize);

const getExpectedMultipartPartSize = (
  session: MultipartSessionRecord,
  partNumber: number
): number => {
  const partCount = getMultipartPartCount(session);
  if (partNumber < 1 || partNumber > partCount) {
    throw AppError.badRequest('partNumber is outside the upload range.', 'INVALID_PART_NUMBER');
  }
  const offset = (partNumber - 1) * session.partSize;
  return Math.min(session.partSize, session.fileSize - offset);
};

const listActiveMultipartSessions = async (userId: string): Promise<MultipartSessionRecord[]> => {
  const userDir = path.join(MULTIPART_ROOT, userId);
  let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
  try {
    entries = await fs.readdir(userDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => loadMultipartSession(userId, entry.name))
  );
  return sessions.filter((session): session is MultipartSessionRecord => Boolean(session));
};

const findMultipartSessionForIdentity = async (
  userId: string,
  uploadId: string
): Promise<{ session: MultipartSessionRecord; sessionOwnerUserId: string } | null> => {
  const exact = await loadMultipartSession(userId, uploadId);
  if (exact) {
    return { session: exact, sessionOwnerUserId: userId };
  }
  return null;
};

export const startMultipartUpload = async (req: AuthenticatedRequest, res: express.Response) => {
  const userId = getUserId(req);
  const username = getUsername(req);
  await cleanupExpiredMultipartSessions(userId);

  const { category, folder, fileName, mimeType, fileSize, resumeUploadId, keepMetadata } =
    req.body || {};

  if (
    typeof category !== 'string' ||
    typeof fileName !== 'string' ||
    typeof mimeType !== 'string' ||
    typeof fileSize !== 'number' ||
    fileSize <= 0
  ) {
    throw AppError.badRequest('Invalid multipart init payload.', 'INVALID_MULTIPART_INIT');
  }
  if (!FILE_CATEGORY_SET.has(category)) {
    throw AppError.badRequest('Unsupported multipart category.', 'UNSUPPORTED_FILE_CATEGORY');
  }
  if (fileSize > MULTIPART_MAX_FILE_SIZE_BYTES) {
    throw AppError.badRequest('File exceeds configured max upload size.', 'FILE_TOO_LARGE');
  }
  if (Math.ceil(fileSize / MULTIPART_PART_SIZE_BYTES) > MULTIPART_MAX_PARTS) {
    throw AppError.badRequest('Too many multipart segments for this upload.', 'TOO_MANY_PARTS');
  }
  const extension = getFileExtension(fileName);
  if (!extension) {
    throw AppError.badRequest(
      'File extension is required for multipart upload.',
      'MISSING_FILE_EXTENSION'
    );
  }
  if (category === 'photo' && !(mimeType || '').toLowerCase().startsWith('image/')) {
    recordUploadAnomaly(userId, 'invalid_type', { category, mimeType, fileName });
    throw AppError.badRequest('Invalid mime type for photo upload.', 'INVALID_FILE_TYPE');
  }
  if (
    category === 'video' &&
    !(
      (mimeType || '').toLowerCase().startsWith('video/') ||
      (mimeType || '').toLowerCase() === 'application/mxf'
    )
  ) {
    recordUploadAnomaly(userId, 'invalid_type', { category, mimeType, fileName });
    throw AppError.badRequest('Invalid mime type for video upload.', 'INVALID_FILE_TYPE');
  }
  if (fileSize >= LARGE_UPLOAD_BYTES) {
    recordUploadAnomaly(userId, 'rapid_large_upload', { category, fileSize });
  }

  if (typeof resumeUploadId === 'string' && resumeUploadId.trim()) {
    const existing = await loadMultipartSession(userId, resumeUploadId.trim());
    if (
      existing &&
      existing.fileName === fileName &&
      existing.fileSize === fileSize &&
      existing.mimeType === mimeType &&
      existing.category === category
    ) {
      existing.updatedAt = Date.now();
      await saveMultipartSession(existing);
      return sendSuccess(
        res,
        {
          uploadId: existing.uploadId,
          partSize: existing.partSize,
          uploadedParts: Object.keys(existing.parts).map((part) => Number(part)),
        },
        'Multipart upload resumed'
      );
    }
  }

  const activeSessions = await listActiveMultipartSessions(userId);
  if (activeSessions.length >= MAX_ACTIVE_MULTIPART_SESSIONS_PER_USER) {
    throw AppError.badRequest(
      'Too many active uploads. Complete or cancel existing uploads first.',
      'TOO_MANY_ACTIVE_UPLOADS'
    );
  }

  const uploadId = crypto.randomBytes(12).toString('hex');
  const session: MultipartSessionRecord = {
    uploadId,
    userId,
    username,
    category,
    folder: typeof folder === 'string' && folder.trim() ? folder : null,
    fileName,
    mimeType,
    fileSize,
    keepMetadata: keepMetadata === true,
    partSize: MULTIPART_PART_SIZE_BYTES,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    parts: {},
  };
  if (!MEMORY_ONLY_MULTIPART_UPLOADS) {
    await fs.mkdir(multipartPartsDir(userId, uploadId), { recursive: true });
  }
  await saveMultipartSession(session);
  return sendSuccess(
    res,
    { uploadId, partSize: MULTIPART_PART_SIZE_BYTES, uploadedParts: [] },
    'Multipart upload initialized'
  );
};

export const uploadMultipartPart = async (req: AuthenticatedRequest, res: express.Response) => {
  const userId = getUserId(req);
  const uploadId = getRouteParam(req.params.uploadId);
  const partNumberRaw = getRouteParam(req.params.partNumber);
  if (!uploadId || !partNumberRaw) {
    throw AppError.badRequest('uploadId and partNumber are required.', 'MULTIPART_PART_REQUIRED');
  }
  const partNumber = Number.parseInt(partNumberRaw, 10);
  if (!Number.isFinite(partNumber) || partNumber < 1) {
    throw AppError.badRequest('partNumber must be >= 1.', 'INVALID_PART_NUMBER');
  }
  const resolved = await findMultipartSessionForIdentity(userId, uploadId);
  if (!resolved) {
    throw AppError.notFound('Upload session not found.', 'UPLOAD_SESSION_NOT_FOUND');
  }
  const { session, sessionOwnerUserId } = resolved;
  const partCount = getMultipartPartCount(session);
  if (partNumber > partCount) {
    throw AppError.badRequest('partNumber exceeds expected chunk count.', 'INVALID_PART_NUMBER');
  }
  const partBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
  if (!partBuffer.length) {
    throw AppError.badRequest('Part payload is empty.', 'EMPTY_PART');
  }
  const expectedPartSize = getExpectedMultipartPartSize(session, partNumber);
  if (partBuffer.length !== expectedPartSize) {
    throw AppError.badRequest('Part size mismatch for upload segment.', 'PART_SIZE_MISMATCH');
  }
  const expectedSha = String(req.headers['x-part-sha256'] || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/i.test(expectedSha)) {
    throw AppError.badRequest('Missing or invalid part hash header.', 'INVALID_PART_HASH');
  }
  const computed = sha256Hex(partBuffer);
  if (computed !== expectedSha) {
    recordUploadAnomaly(userId, 'hash_mismatch', { uploadId, partNumber });
    throw AppError.badRequest('Part hash mismatch.', 'PART_HASH_MISMATCH');
  }

  if (MEMORY_ONLY_MULTIPART_UPLOADS) {
    multipartMemoryParts.set(
      multipartPartMemoryKey(sessionOwnerUserId, uploadId, partNumber),
      Buffer.from(partBuffer)
    );
  } else {
    const partFile = path.join(
      multipartPartsDir(sessionOwnerUserId, uploadId),
      `${partNumber}.part`
    );
    await fs.mkdir(path.dirname(partFile), { recursive: true });
    await fs.writeFile(partFile, partBuffer);
  }
  const persisted = await mergeAndSaveMultipartPartMetadata(
    sessionOwnerUserId,
    uploadId,
    partNumber,
    { size: partBuffer.length, sha256: computed }
  );
  return sendSuccess(
    res,
    { uploadId, partNumber, uploadedParts: Object.keys(persisted.parts).length },
    'Part uploaded'
  );
};

export const completeMultipartUpload = async (req: AuthenticatedRequest, res: express.Response) => {
  const userId = getUserId(req);
  const uploadId = getRouteParam(req.params.uploadId);
  if (!uploadId) {
    throw AppError.badRequest('uploadId is required.', 'MULTIPART_COMPLETE_REQUIRED');
  }
  const resolved = await findMultipartSessionForIdentity(userId, uploadId);
  if (!resolved) {
    throw AppError.notFound('Upload session not found.', 'UPLOAD_SESSION_NOT_FOUND');
  }
  const { session, sessionOwnerUserId } = resolved;
  const expectedFileHash =
    typeof req.body?.fileSha256 === 'string' ? req.body.fileSha256.toLowerCase() : null;
  const partCount = getMultipartPartCount(session);
  const uploadedPartNumbers = new Set(
    Object.keys(session.parts || {})
      .map((part) => Number.parseInt(part, 10))
      .filter(Number.isFinite)
  );
  if (uploadedPartNumbers.size < partCount) {
    throw AppError.badRequest('Upload is missing one or more parts.', 'MISSING_UPLOAD_PART');
  }

  const assembler = crypto.createHash('sha256');
  const finalBuffer = Buffer.allocUnsafe(session.fileSize);
  let writeOffset = 0;
  for (let i = 1; i <= partCount; i += 1) {
    let data: Buffer;
    if (MEMORY_ONLY_MULTIPART_UPLOADS) {
      const partData = multipartMemoryParts.get(
        multipartPartMemoryKey(sessionOwnerUserId, uploadId, i)
      );
      if (!partData) {
        throw AppError.badRequest(`Missing part ${i}.`, 'MISSING_UPLOAD_PART');
      }
      data = partData;
    } else {
      const partFile = path.join(multipartPartsDir(sessionOwnerUserId, uploadId), `${i}.part`);
      try {
        data = await fs.readFile(partFile);
      } catch {
        throw AppError.badRequest(`Missing part ${i}.`, 'MISSING_UPLOAD_PART');
      }
    }
    const expectedPartSize = getExpectedMultipartPartSize(session, i);
    if (data.length !== expectedPartSize) {
      throw AppError.badRequest(`Part ${i} has unexpected size.`, 'PART_SIZE_MISMATCH');
    }
    assembler.update(data);
    data.copy(finalBuffer, writeOffset);
    writeOffset += data.length;
  }
  if (writeOffset !== session.fileSize) {
    throw AppError.badRequest('Assembled size mismatch.', 'ASSEMBLED_SIZE_MISMATCH');
  }
  const finalHash = assembler.digest('hex');
  if (expectedFileHash && expectedFileHash !== finalHash) {
    throw AppError.badRequest('Final file hash mismatch.', 'FILE_HASH_MISMATCH');
  }
  if (finalBuffer.length > MULTIPART_MAX_FILE_SIZE_BYTES) {
    throw AppError.badRequest('File exceeds configured max upload size.', 'FILE_TOO_LARGE');
  }
  if (session.category === 'photo' || session.category === 'video') {
    assertFileContentMatchesCategory(
      session.category,
      session.fileName,
      session.mimeType,
      finalBuffer
    );
  }

  const result = await saveFileToVault({
    userId,
    category: session.category,
    folder: session.folder || undefined,
    file: {
      buffer: finalBuffer,
      originalname: session.fileName,
      mimetype: session.mimeType,
      size: finalBuffer.length,
    } as Express.Multer.File,
    keepMetadata: session.keepMetadata === true,
    clientUpdatedAt:
      typeof req.body?.clientUpdatedAt === 'string' ? req.body.clientUpdatedAt : undefined,
    deviceId: typeof req.body?.deviceId === 'string' ? req.body.deviceId : undefined,
    ipAddress: getClientIp(req),
  });
  const normalizedResult =
    typeof (result as any)?.toObject === 'function' ? (result as any).toObject() : result;

  if (MEMORY_ONLY_MULTIPART_UPLOADS) {
    multipartMemorySessions.delete(multipartMemoryKey(sessionOwnerUserId, uploadId));
    for (const key of Array.from(multipartMemoryParts.keys())) {
      if (key.startsWith(`${multipartMemoryKey(sessionOwnerUserId, uploadId)}:`)) {
        multipartMemoryParts.delete(key);
      }
    }
  } else {
    const cleanupMetrics = await safeRm(path.join(MULTIPART_ROOT, sessionOwnerUserId, uploadId));
    if (cleanupMetrics.filesDeleted > 0) {
      logger.info('Multipart upload temp data cleaned', {
        userId,
        uploadId,
        ...cleanupMetrics,
      });
    }
  }
  return sendSuccess(
    res,
    { ...normalizedResult, uploadId, sha256: finalHash },
    'Multipart file uploaded to vault successfully',
    201
  );
};

export const fetchVault = async (req: AuthenticatedRequest, res: express.Response) => {
  const snapshot = await getVaultSnapshot(getUserId(req), getUsername(req));
  return sendSuccess(res, snapshot, 'Vault snapshot fetched successfully');
};

export const syncVault = async (req: AuthenticatedRequest, res: express.Response) => {
  // We'll keep this simple for now, ideally get changes since a date
  const snapshot = await getVaultSnapshot(getUserId(req), getUsername(req));
  return sendSuccess(res, snapshot, 'Vault items synced successfully');
};

export const uploadVaultFile = async (req: AuthenticatedRequest, res: express.Response) => {
  const file = req.file;
  if (!file) {
    throw AppError.badRequest('A file upload is required.', 'FILE_REQUIRED');
  }

  const category = getRouteParam(req.params.category);
  if (!category) {
    throw AppError.badRequest('Vault category is required.', 'CATEGORY_REQUIRED');
  }
  if (category === 'photo' || category === 'video') {
    try {
      assertFileContentMatchesCategory(category, file.originalname, file.mimetype, file.buffer);
    } catch (error) {
      recordUploadAnomaly(getUserId(req), 'invalid_type', {
        category,
        mimeType: file.mimetype,
        fileName: file.originalname,
      });
      throw error;
    }
  }

  const result = await saveFileToVault({
    userId: getUserId(req),
    category,
    folder:
      typeof req.body.folder === 'string'
        ? req.body.folder
        : (req.headers['x-vault-folder'] as string),
    file,
    keepMetadata: req.body.keepMetadata === true || req.headers['x-keep-metadata'] === 'true',
    clientUpdatedAt:
      typeof req.body.clientUpdatedAt === 'string' ? req.body.clientUpdatedAt : undefined,
    deviceId: typeof req.body.deviceId === 'string' ? req.body.deviceId : undefined,
    ipAddress: getClientIp(req),
  });

  // Background transcoding for videos
  const directFilePath =
    ((result as any)?.file?.filePath as string | undefined) ||
    ((result as any)?.filePath as string | undefined);
  const directMimeType =
    ((result as any)?.file?.mimeType as string | undefined) ||
    (file.mimetype as string | undefined);
  const canTranscodeLocalFile =
    typeof directFilePath === 'string' &&
    directFilePath.length > 0 &&
    !directFilePath.startsWith('cloud://');
  if (
    (category === 'video' || category === 'videos' || directMimeType?.startsWith('video/')) &&
    canTranscodeLocalFile
  ) {
    const filePath = directFilePath;
    const outputDir = path.join(path.dirname(filePath), 'hls', (result as any).itemId);
    processHlsAdaptive(
      (result as any).itemId,
      getUserId(req),
      getUsername(req),
      filePath,
      outputDir
    ).catch((err) =>
      logger.error(`Background transcoding failed for ${(result as any).itemId}`, {
        err,
      })
    );
  }

  return sendSuccess(res, result, 'File uploaded to vault successfully', 201);
};

export const upsertVaultEntry = async (req: AuthenticatedRequest, res: express.Response) => {
  const category = getRouteParam(req.params.category);
  const itemId = getRouteParam(req.params.itemId);

  if (!category) {
    throw AppError.badRequest('Vault category is required.', 'CATEGORY_REQUIRED');
  }

  const result = await saveEncryptedVaultItem({
    userId: getUserId(req),
    username: getUsername(req),
    category,
    folder: typeof req.body.folder === 'string' ? req.body.folder : undefined,
    itemId,
    payload: req.body,
    deviceId: typeof req.body.deviceId === 'string' ? req.body.deviceId : undefined,
    ipAddress: getClientIp(req),
  });

  return sendSuccess(
    res,
    result,
    `Vault entry ${itemId ? 'updated' : 'created'} successfully`,
    itemId ? 200 : 201
  );
};

export const deleteVaultEntry = async (req: AuthenticatedRequest, res: express.Response) => {
  const category = getRouteParam(req.params.category);
  const itemId = getRouteParam(req.params.itemId);

  if (!category || !itemId) {
    throw AppError.badRequest('Vault category and item id are required.', 'ITEM_REQUIRED');
  }

  const result = await deleteVaultItemByCategory({
    userId: getUserId(req),
    username: getUsername(req),
    category,
    itemId,
    deviceId: typeof req.body?.deviceId === 'string' ? req.body.deviceId : undefined,
    ipAddress: getClientIp(req),
    clientUpdatedAt:
      typeof req.body?.clientUpdatedAt === 'string' ? req.body.clientUpdatedAt : undefined,
  });

  return sendSuccess(res, result, 'Vault entry deleted successfully');
};

export const saveUserActivityLog = async (req: AuthenticatedRequest, res: express.Response) => {
  const result = await saveActivityLog({
    userId: getUserId(req),
    username: getUsername(req),
    action: req.body.action || 'OTHER',
    category: req.body.category || 'system',
    itemId: req.body.itemId || null,
    deviceId: typeof req.body.deviceId === 'string' ? req.body.deviceId : undefined,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'] as string | undefined,
    status: req.body.status || 'SUCCESS',
    errorCode: req.body.errorCode,
    errorMessage: req.body.errorMessage,
    details: req.body.details || {},
  });

  return sendSuccess(res, result, 'Activity log saved successfully', 201);
};

export const getUserActivityLogsController = async (
  req: AuthenticatedRequest,
  res: express.Response
) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 500;
  const skip = req.query.skip ? parseInt(req.query.skip as string) : 0;
  const logs = await getUserActivityLogs(getUserId(req), getUsername(req), limit, skip);
  return sendSuccess(res, logs, 'Activity logs fetched successfully');
};
