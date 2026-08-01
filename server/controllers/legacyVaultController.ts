import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { sendRequestError } from '../responses.ts';
import {
  deleteScopedVaultItemByUsername,
  deleteLegacyVaultItem,
  listScopedVaultItemsByUsername,
  listLegacyVaultItems,
  saveScopedVaultItem,
  saveLegacyVaultItem,
  setScopedVaultItemPinByUsername,
} from '../services/legacyVaultService.ts';
import { AppError } from '../utils/appError.ts';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import {
  parseCategory,
  parseMetadataHeader,
  safeDecodeURIComponent,
} from '../utils/vaultParsers.ts';

const MAX_LEGACY_ID_LENGTH = 256;
const SAFE_LEGACY_ID_PATTERN = /^[a-zA-Z0-9:_-]+$/;
const LEGACY_RAW_LIMIT = `${Number(process.env.LEGACY_RAW_LIMIT_MB || process.env.MAX_FILE_SIZE_MB || 500)}mb`;
const MAX_SCOPED_TEXT_PAYLOAD_BYTES = Math.max(
  1_000_000,
  Number(process.env.MAX_SCOPED_TEXT_PAYLOAD_BYTES || 4 * 1024 * 1024)
);
const ALLOWED_SCOPED_CATEGORIES = new Set([
  'photo',
  'video',
  'audio',
  'document',
  'note',
  'chat',
  'todo',
  'password',
  'secret',
  'contact',
  'location',
  'file',
  'other-files',
  'other',
  'settings',
  'card',
  'identity',
  'wifi',
  'system',
  'users',
]);
const CHUNK_UPLOAD_ROOT = path.join(process.cwd(), 'vault-tmp', 'chunk-uploads');
const CHUNK_UPLOAD_TTL_MS = Math.max(
  60_000,
  Number(process.env.CHUNK_UPLOAD_TTL_MS || 30 * 60 * 1000)
);
const CHUNK_UPLOAD_COMPLETION_MARKER_TTL_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.CHUNK_UPLOAD_COMPLETION_MARKER_TTL_MS || 6 * 60 * 60 * 1000)
);
const CHUNK_UPLOAD_MAX_CHUNKS = Math.max(1, Number(process.env.CHUNK_UPLOAD_MAX_CHUNKS || 4096));
const CHUNK_UPLOAD_MAX_PART_BYTES = Math.max(
  256 * 1024,
  Number(process.env.CHUNK_UPLOAD_MAX_PART_BYTES || 12 * 1024 * 1024)
);
const LEGACY_MAX_FILE_SIZE_BYTES = Math.max(
  1,
  Number(process.env.MAX_FILE_SIZE_MB || 500) * 1024 * 1024
);
const CHUNK_ASSEMBLY_LOCK_STALE_MS = Math.max(
  5_000,
  Number(process.env.CHUNK_ASSEMBLY_LOCK_STALE_MS || 2 * 60 * 1000)
);
const CHUNK_COMPLETION_MARKER_PREFIX = 'completed-';

const safeRm = async (targetPath: string) => {
  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch {
    // Best effort cleanup; ignore failures.
  }
};

const safeUnlink = async (targetPath: string) => {
  try {
    await fs.unlink(targetPath);
  } catch {
    // Best effort cleanup; ignore failures.
  }
};

const tryAcquireChunkAssemblyLock = async (lockPath: string) => {
  try {
    await fs.writeFile(lockPath, String(Date.now()), { flag: 'wx' });
    return true;
  } catch {
    // Handle orphaned locks from interrupted requests.
  }

  try {
    const stat = await fs.stat(lockPath);
    if (Date.now() - stat.mtimeMs > CHUNK_ASSEMBLY_LOCK_STALE_MS) {
      await safeUnlink(lockPath);
      await fs.writeFile(lockPath, String(Date.now()), { flag: 'wx' });
      return true;
    }
  } catch {
    // Lock was removed by another request while checking staleness.
    try {
      await fs.writeFile(lockPath, String(Date.now()), { flag: 'wx' });
      return true;
    } catch {
      // Another request acquired lock first.
    }
  }

  return false;
};

const cleanupExpiredChunkUploads = async (userChunkRoot: string) => {
  let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
  try {
    entries = await fs.readdir(userChunkRoot, { withFileTypes: true });
  } catch {
    return;
  }

  const now = Date.now();
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(userChunkRoot, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        if (entry.isDirectory()) {
          if (now - stat.mtimeMs > CHUNK_UPLOAD_TTL_MS) {
            await safeRm(fullPath);
          }
          return;
        }
        if (
          entry.name.startsWith(CHUNK_COMPLETION_MARKER_PREFIX) &&
          now - stat.mtimeMs > CHUNK_UPLOAD_COMPLETION_MARKER_TTL_MS
        ) {
          await safeUnlink(fullPath);
        }
      } catch {
        // Ignore per-entry stat/remove failures.
      }
    })
  );
};

const sanitizeMarkerSegment = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);

const getChunkCompletionMarkerPath = (userChunkRoot: string, uploadId: string, itemId: string) =>
  path.join(
    userChunkRoot,
    `${CHUNK_COMPLETION_MARKER_PREFIX}${sanitizeMarkerSegment(uploadId)}-${sanitizeMarkerSegment(itemId)}.json`
  );

const wasChunkUploadCompleted = async (
  userChunkRoot: string,
  uploadId: string,
  itemId: string
): Promise<boolean> => {
  const markerPath = getChunkCompletionMarkerPath(userChunkRoot, uploadId, itemId);
  try {
    const stat = await fs.stat(markerPath);
    if (Date.now() - stat.mtimeMs > CHUNK_UPLOAD_COMPLETION_MARKER_TTL_MS) {
      await safeUnlink(markerPath);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const markChunkUploadCompleted = async (
  userChunkRoot: string,
  uploadId: string,
  itemId: string
) => {
  const markerPath = getChunkCompletionMarkerPath(userChunkRoot, uploadId, itemId);
  await fs.writeFile(markerPath, JSON.stringify({ uploadId, itemId, completedAt: Date.now() }));
};

const assertLegacyId = (value: string, fieldName: string) => {
  if (!value || value.length > MAX_LEGACY_ID_LENGTH || !SAFE_LEGACY_ID_PATTERN.test(value)) {
    throw new AppError(400, 'INVALID_IDENTIFIER', `${fieldName} is invalid.`);
  }
};

const getRouteParam = (value: string | string[] | undefined, fieldName: string) => {
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_IDENTIFIER', `${fieldName} is invalid.`);
  }

  assertLegacyId(value, fieldName);
  return value;
};

const assertScopedCategory = (category: string) => {
  if (!ALLOWED_SCOPED_CATEGORIES.has(category)) {
    throw new AppError(400, 'UNSUPPORTED_CATEGORY', 'Unsupported vault category for scoped item.');
  }
};

export const parseLegacyPayloadFromRequest = async (
  req: express.Request,
  res: express.Response
) => {
  let payload: unknown;
  let category = 'v2_items';
  let folder: string | null = null;
  let title: string | null = null;
  let metadata: Record<string, unknown> | null = null;
  let chunkUploadCleanupPath: string | null = null;

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  const isBinary = contentType.startsWith('application/octet-stream');

  if (isBinary) {
    try {
      await new Promise<void>((resolve, reject) => {
        express.raw({
          type: 'application/octet-stream',
          limit: LEGACY_RAW_LIMIT,
        })(req, res, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      const maybeStatus = (error as { status?: unknown })?.status;
      const statusCode = typeof maybeStatus === 'number' ? maybeStatus : 400;
      const rawMessage = (error as Error)?.message?.toLowerCase?.() || '';
      const isTooLarge = statusCode === 413 || rawMessage.includes('too large');

      throw new AppError(
        isTooLarge ? 413 : 400,
        isTooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_PAYLOAD',
        isTooLarge
          ? `Binary upload exceeded limit (${LEGACY_RAW_LIMIT}).`
          : 'Failed to parse binary upload payload.'
      );
    }

    payload = req.body;
    let binaryPayload: Buffer | null = null;
    if (Buffer.isBuffer(payload)) {
      binaryPayload = payload;
    } else if (payload instanceof Uint8Array) {
      binaryPayload = Buffer.from(payload);
    } else if (payload instanceof ArrayBuffer) {
      binaryPayload = Buffer.from(payload);
    }
    if (!binaryPayload) {
      throw new AppError(400, 'INVALID_PAYLOAD', 'Binary upload payload is missing or invalid.');
    }
    payload = binaryPayload;

    const chunkedHeader = String(req.headers['x-vault-chunked'] || '')
      .trim()
      .toLowerCase();
    const isChunked = chunkedHeader === '1' || chunkedHeader === 'true' || chunkedHeader === 'yes';

    if (isChunked) {
      const uploadId = String(req.headers['x-vault-upload-id'] || '').trim();
      const chunkIndex = Number.parseInt(String(req.headers['x-vault-chunk-index'] || '-1'), 10);
      const chunkCount = Number.parseInt(String(req.headers['x-vault-chunk-count'] || '-1'), 10);
      const declaredTotalSize = Number.parseInt(
        String(req.headers['x-vault-total-size'] || '-1'),
        10
      );

      if (
        !uploadId ||
        chunkIndex < 0 ||
        chunkCount <= 0 ||
        chunkIndex >= chunkCount ||
        chunkCount > CHUNK_UPLOAD_MAX_CHUNKS
      ) {
        throw new AppError(400, 'INVALID_CHUNK_HEADERS', 'Invalid chunk upload headers.');
      }
      if (
        !Number.isFinite(declaredTotalSize) ||
        declaredTotalSize <= 0 ||
        declaredTotalSize > LEGACY_MAX_FILE_SIZE_BYTES
      ) {
        throw new AppError(
          400,
          'INVALID_CHUNK_HEADERS',
          'Invalid or unsupported total upload size.'
        );
      }
      if (binaryPayload.length === 0 || binaryPayload.length > CHUNK_UPLOAD_MAX_PART_BYTES) {
        throw new AppError(400, 'INVALID_CHUNK_SIZE', 'Chunk size is invalid for secure upload.');
      }

      const expectedChunkHash = String(req.headers['x-vault-chunk-sha256'] || '').trim();
      if (!/^[a-f0-9]{64}$/i.test(expectedChunkHash)) {
        throw new AppError(
          400,
          'INVALID_CHUNK_HASH',
          'Chunk integrity hash is missing or invalid.'
        );
      }

      const scopedUserId = (req as any)?.user?.userId || 'anon';
      const userChunkRoot = path.join(CHUNK_UPLOAD_ROOT, String(scopedUserId));
      await fs.mkdir(userChunkRoot, { recursive: true });
      await cleanupExpiredChunkUploads(userChunkRoot);
      const routeItemId =
        typeof req.params?.itemId === 'string' && req.params.itemId.trim()
          ? req.params.itemId.trim()
          : null;
      const chunkUploadState = { uploadId, chunkIndex, chunkCount };
      if (routeItemId && (await wasChunkUploadCompleted(userChunkRoot, uploadId, routeItemId))) {
        return {
          payload: '',
          category: parseCategory(req.headers['x-vault-category']),
          folder: null,
          title: null,
          metadata: null,
          chunkUploadAlreadyCompleted: true,
          chunkUploadState,
          chunkUploadCleanupPath: null,
        } as any;
      }
      const uploadDir = path.join(userChunkRoot, uploadId);
      await fs.mkdir(uploadDir, { recursive: true });
      const chunkPath = path.join(uploadDir, `${chunkIndex}.part`);
      const chunkBuffer = binaryPayload;
      const computedHash = crypto.createHash('sha256').update(chunkBuffer).digest('hex');
      if (computedHash !== expectedChunkHash.toLowerCase()) {
        throw new AppError(400, 'CHUNK_INTEGRITY_FAILED', 'Chunk integrity verification failed.');
      }

      await fs.writeFile(chunkPath, chunkBuffer);
      const dirEntries = await fs.readdir(uploadDir);
      const partCount = dirEntries.filter((name) => name.endsWith('.part')).length;

      if (partCount < chunkCount) {
        return {
          payload: '',
          category: parseCategory(req.headers['x-vault-category']),
          folder: null,
          title: null,
          metadata: null,
          chunkUploadPending: true,
          chunkUploadState,
          chunkUploadCleanupPath: null,
        } as any;
      }

      const lockPath = path.join(uploadDir, '.assembling.lock');
      const hasLock = await tryAcquireChunkAssemblyLock(lockPath);
      if (!hasLock) {
        // Another request is assembling/finalizing right now.
        return {
          payload: '',
          category: parseCategory(req.headers['x-vault-category']),
          folder: null,
          title: null,
          metadata: null,
          chunkUploadPending: true,
          chunkUploadState,
          chunkUploadCleanupPath: null,
        } as any;
      }

      try {
        const partSizes: number[] = [];
        let assembledSize = 0;
        for (let i = 0; i < chunkCount; i += 1) {
          const partPath = path.join(uploadDir, `${i}.part`);
          const partStat = await fs.stat(partPath);
          if (partStat.size <= 0 || partStat.size > CHUNK_UPLOAD_MAX_PART_BYTES) {
            throw new AppError(400, 'INVALID_CHUNK_SIZE', `Chunk ${i} size is invalid.`);
          }
          partSizes.push(partStat.size);
          assembledSize += partStat.size;
        }
        if (assembledSize !== declaredTotalSize) {
          throw new AppError(
            400,
            'CHUNK_SIZE_MISMATCH',
            'Assembled chunk size does not match declared upload size.'
          );
        }

        const assembled = Buffer.allocUnsafe(assembledSize);
        let offset = 0;
        for (let i = 0; i < chunkCount; i += 1) {
          const partPath = path.join(uploadDir, `${i}.part`);
          const chunk = await fs.readFile(partPath);
          if (chunk.length !== partSizes[i]) {
            throw new AppError(
              400,
              'CHUNK_SIZE_MISMATCH',
              `Chunk ${i} size changed during assembly.`
            );
          }
          chunk.copy(assembled, offset);
          offset += chunk.length;
        }
        payload = assembled;
        chunkUploadCleanupPath = uploadDir;
      } finally {
        await safeUnlink(lockPath);
      }

      metadata = {
        ...(metadata || {}),
        _chunkUpload: {
          uploadId,
          chunkCount,
          chunkIndex,
          userChunkRoot,
          routeItemId,
        },
      };
    }

    category = parseCategory(req.headers['x-vault-category']);
    const rawFolderHeader = req.headers['x-vault-folder'];
    folder =
      typeof rawFolderHeader === 'string' && rawFolderHeader.trim()
        ? safeDecodeURIComponent(rawFolderHeader.trim())
        : null;
    title = safeDecodeURIComponent((req.headers['x-vault-title'] as string) || '');
    metadata = parseMetadataHeader(req.headers['x-vault-metadata']);
  } else {
    payload = req.body?.payload;
    category = parseCategory(req.body?.category);
    const titleHeader =
      typeof req.headers['x-vault-title'] === 'string' ? req.headers['x-vault-title'] : '';
    const metadataHeader =
      typeof req.headers['x-vault-metadata'] === 'string' ? req.headers['x-vault-metadata'] : '';
    const encryptedTitleHeader = titleHeader.trim().startsWith('V2_ENC:');
    const encryptedMetadataHeader = metadataHeader.trim().startsWith('V2_ENC:');
    const folderHeader =
      typeof req.headers['x-vault-folder'] === 'string'
        ? safeDecodeURIComponent(req.headers['x-vault-folder'])
        : null;
    const folderBody = typeof req.body?.folder === 'string' ? req.body.folder : null;

    folder = encryptedMetadataHeader ? folderHeader : folderBody || folderHeader || null;
    title = encryptedTitleHeader
      ? titleHeader
      : req.body?.title || safeDecodeURIComponent(titleHeader || '');

    let parsedMetadata = parseMetadataHeader(metadataHeader);
    if (!encryptedMetadataHeader && req.body?.metadata) {
      if (typeof req.body.metadata === 'object') {
        parsedMetadata = { ...parsedMetadata, ...req.body.metadata };
      } else if (typeof req.body.metadata === 'string') {
        try {
          parsedMetadata = {
            ...parsedMetadata,
            ...JSON.parse(req.body.metadata),
          };
        } catch {
          // Fallback if it's just raw text
          parsedMetadata = {
            ...parsedMetadata,
            _rawMetadata: req.body.metadata,
          };
        }
      }
    }

    // Support flat field extraction mapping for plaintext legacy payloads.
    if (!encryptedMetadataHeader && req.body) {
      const {
        username,
        id,
        ip,
        created,
        createdAt,
        update,
        updatedAt,
        deleted,
        deletedAt,
        browser,
      } = req.body;
      const extractText = {
        username,
        id,
        ip,
        created,
        createdAt,
        update,
        updatedAt,
        deleted,
        deletedAt,
        browser,
      };

      let hasExtra = false;
      for (const val of Object.values(extractText)) {
        if (val !== undefined && val !== null) hasExtra = true;
      }

      if (hasExtra) {
        parsedMetadata = { ...parsedMetadata, ...extractText };
      }
    }

    metadata = parsedMetadata && Object.keys(parsedMetadata).length > 0 ? parsedMetadata : null;
  }

  if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) {
    return null;
  }

  if (typeof payload === 'string') {
    const payloadSize = Buffer.byteLength(payload, 'utf8');
    if (payloadSize > MAX_SCOPED_TEXT_PAYLOAD_BYTES) {
      throw new AppError(
        413,
        'PAYLOAD_TOO_LARGE',
        'Encrypted text payload exceeds secure size limits.'
      );
    }
  }

  // Also check metadata for folder if not found elsewhere
  if (!folder && metadata?.folder) {
    folder = String(metadata.folder);
  }

  return {
    payload,
    category,
    folder,
    title,
    metadata,
    chunkUploadCleanupPath,
  };
};

export const upsertLegacyVaultItem = async (req: express.Request, res: express.Response) => {
  const vaultId = getRouteParam(req.params.vaultId, 'vaultId');
  const itemId = getRouteParam(req.params.itemId, 'itemId');

  const parsed = await parseLegacyPayloadFromRequest(req, res);
  if (!parsed) {
    return sendRequestError(req, res, 400, {
      code: 'INVALID_PAYLOAD',
      message: 'Payload is required.',
    });
  }
  if ((parsed as any).chunkUploadPending) {
    return res.status(202).json({
      success: true,
      data: (parsed as any).chunkUploadState,
      message: 'Chunk accepted',
    });
  }
  if ((parsed as any).chunkUploadAlreadyCompleted) {
    return res.json({
      success: true,
      data: (parsed as any).chunkUploadState,
      message: 'Chunk upload already finalized',
    });
  }

  const parsedMetadata =
    (parsed as any)?.metadata && typeof (parsed as any).metadata === 'object'
      ? { ...((parsed as any).metadata as Record<string, unknown>) }
      : null;
  const chunkMeta = parsedMetadata?._chunkUpload as
    { uploadId?: string; userChunkRoot?: string; routeItemId?: string } | undefined;
  if (parsedMetadata && '_chunkUpload' in parsedMetadata) {
    delete (parsedMetadata as any)._chunkUpload;
  }

  const result = await saveLegacyVaultItem({
    vaultId,
    username: (req as any).user.username,
    itemId,
    payload: parsed.payload,
    category: parsed.category,
    folder: parsed.folder,
    title: parsed.title,
    metadata: parsedMetadata,
  });
  if (chunkMeta?.uploadId && chunkMeta.userChunkRoot && chunkMeta.routeItemId) {
    await markChunkUploadCompleted(
      chunkMeta.userChunkRoot,
      chunkMeta.uploadId,
      chunkMeta.routeItemId
    );
  }

  if (typeof (parsed as any).chunkUploadCleanupPath === 'string') {
    await safeRm((parsed as any).chunkUploadCleanupPath);
  }

  return res.json({ success: true, data: result });
};

export const getLegacyVaultItems = async (req: express.Request, res: express.Response) => {
  const vaultId = getRouteParam(req.params.vaultId, 'vaultId');
  const username = (req as any).user.username;
  const items = await listLegacyVaultItems(vaultId, username);
  return res.json({ success: true, items });
};

export const removeLegacyVaultItem = async (req: express.Request, res: express.Response) => {
  const vaultId = getRouteParam(req.params.vaultId, 'vaultId');
  const itemId = getRouteParam(req.params.itemId, 'itemId');
  const username = (req as any).user.username;
  const deleted = await deleteLegacyVaultItem(vaultId, itemId, username);
  return res.json({ success: true, data: { deleted } });
};

export const upsertScopedVaultItem = async (req: AuthenticatedRequest, res: express.Response) => {
  const itemId = getRouteParam(req.params.itemId, 'itemId');

  const parsed = await parseLegacyPayloadFromRequest(req, res);
  if (!parsed) {
    return sendRequestError(req, res, 400, {
      code: 'INVALID_PAYLOAD',
      message: 'Payload is required.',
    });
  }

  if ((parsed as any).chunkUploadPending) {
    return res.status(202).json({
      success: true,
      data: (parsed as any).chunkUploadState,
      message: 'Chunk accepted',
    });
  }
  if ((parsed as any).chunkUploadAlreadyCompleted) {
    return res.json({
      success: true,
      data: (parsed as any).chunkUploadState,
      message: 'Chunk upload already finalized',
    });
  }

  const parsedMetadata =
    (parsed as any)?.metadata && typeof (parsed as any).metadata === 'object'
      ? { ...((parsed as any).metadata as Record<string, unknown>) }
      : null;
  const chunkMeta = parsedMetadata?._chunkUpload as
    { uploadId?: string; userChunkRoot?: string; routeItemId?: string } | undefined;
  if (parsedMetadata && '_chunkUpload' in parsedMetadata) {
    delete (parsedMetadata as any)._chunkUpload;
  }

  assertScopedCategory(parsed.category);

  const result = await saveScopedVaultItem({
    userId: req.user.userId,
    username: req.user.username,
    itemId,
    payload: parsed.payload,
    category: parsed.category,
    folder: parsed.folder,
    title: parsed.title,
    metadata: parsedMetadata,
  });
  if (chunkMeta?.uploadId && chunkMeta.userChunkRoot && chunkMeta.routeItemId) {
    await markChunkUploadCompleted(
      chunkMeta.userChunkRoot,
      chunkMeta.uploadId,
      chunkMeta.routeItemId
    );
  }

  if (typeof (parsed as any).chunkUploadCleanupPath === 'string') {
    await safeRm((parsed as any).chunkUploadCleanupPath);
  }

  return res.json({ success: true, data: result });
};

export const getScopedVaultItems = async (req: AuthenticatedRequest, res: express.Response) => {
  const items = await listScopedVaultItemsByUsername(req.user.userId, req.user.username);
  return res.json({ success: true, items });
};

export const removeScopedVaultItem = async (req: AuthenticatedRequest, res: express.Response) => {
  const itemId = getRouteParam(req.params.itemId, 'itemId');
  const deleted = await deleteScopedVaultItemByUsername(req.user.userId, req.user.username, itemId);
  return res.json({ success: true, data: { deleted } });
};

export const toggleScopedVaultItemPin = async (
  req: AuthenticatedRequest,
  res: express.Response
) => {
  const itemId = getRouteParam(req.params.itemId, 'itemId');
  if (typeof req.body?.isPinned !== 'boolean') {
    throw AppError.badRequest('isPinned must be a boolean value.', 'INVALID_PIN_PAYLOAD');
  }
  const isPinned = req.body.isPinned as boolean;

  const data = await setScopedVaultItemPinByUsername(
    req.user.userId,
    req.user.username,
    itemId,
    isPinned
  );

  return res.json({ success: true, data });
};
