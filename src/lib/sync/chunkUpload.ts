import { uploadWithRetry } from './core';

const CHUNK_UPLOAD_THRESHOLD_BYTES = 8 * 1024 * 1024;
const DEFAULT_CHUNK_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_CHUNK_UPLOAD_SIZE_BYTES = 8 * 1024 * 1024;
const MIN_CHUNK_UPLOAD_SIZE_BYTES = 1 * 1024 * 1024;
const DEFAULT_CHUNK_PARALLELISM = 3;
const CHUNK_SESSION_STORAGE_PREFIX = 'vault:chunk-upload:';
const CHUNK_SESSION_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_CHUNK_SESSION_RESTARTS = 2;

type ChunkUploadSession = {
  uploadId: string;
  chunkSize: number;
  chunkCount: number;
  completed: boolean[];
  createdAt: number;
};

const getChunkSessionStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const getChunkSessionStorageKey = (uploadKey: string) =>
  `${CHUNK_SESSION_STORAGE_PREFIX}${uploadKey}`;

const createChunkUploadId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall back to non-cryptographic id generation below.
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const isValidChunkSession = (
  session: Partial<ChunkUploadSession>
): session is ChunkUploadSession => {
  if (!session || typeof session.uploadId !== 'string' || !session.uploadId.trim()) {
    return false;
  }

  const chunkSize = session.chunkSize;
  const chunkCount = session.chunkCount;

  if (!Number.isInteger(chunkSize)) {
    return false;
  }
  const resolvedChunkSize = chunkSize as number;

  if (
    resolvedChunkSize < MIN_CHUNK_UPLOAD_SIZE_BYTES ||
    resolvedChunkSize > MAX_CHUNK_UPLOAD_SIZE_BYTES
  ) {
    return false;
  }

  if (!Number.isInteger(chunkCount)) {
    return false;
  }
  const resolvedChunkCount = chunkCount as number;

  if (resolvedChunkCount <= 0 || resolvedChunkCount > 100_000) {
    return false;
  }

  if (
    !Array.isArray(session.completed) ||
    session.completed.length !== resolvedChunkCount ||
    !session.completed.every((value) => typeof value === 'boolean') ||
    typeof session.createdAt !== 'number' ||
    !Number.isFinite(session.createdAt)
  ) {
    return false;
  }

  if (Date.now() - session.createdAt > CHUNK_SESSION_TTL_MS) {
    return false;
  }

  return true;
};

const cleanupExpiredChunkSessions = () => {
  const storage = getChunkSessionStorage();
  if (!storage) {
    return;
  }

  const staleKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(CHUNK_SESSION_STORAGE_PREFIX)) {
      continue;
    }

    const raw = storage.getItem(key);
    if (!raw) {
      staleKeys.push(key);
      continue;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<ChunkUploadSession>;
      if (!isValidChunkSession(parsed)) {
        staleKeys.push(key);
      }
    } catch {
      staleKeys.push(key);
    }
  }

  for (const staleKey of staleKeys) {
    try {
      storage.removeItem(staleKey);
    } catch {
      // Ignore localStorage failures.
    }
  }
};

const loadChunkSession = (uploadKey: string): ChunkUploadSession | null => {
  cleanupExpiredChunkSessions();
  const storage = getChunkSessionStorage();
  if (!storage) {
    return null;
  }

  const key = getChunkSessionStorageKey(uploadKey);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ChunkUploadSession>;
    if (!isValidChunkSession(parsed)) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const saveChunkSession = (uploadKey: string, session: ChunkUploadSession) => {
  const storage = getChunkSessionStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(getChunkSessionStorageKey(uploadKey), JSON.stringify(session));
  } catch {
    // Best-effort persistence for resumable uploads.
  }
};

const clearChunkSession = (uploadKey: string) => {
  const storage = getChunkSessionStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(getChunkSessionStorageKey(uploadKey));
  } catch {
    // Ignore localStorage failures.
  }
};

const detectChunkSizeBytes = (totalSize: number) => {
  if (typeof navigator === 'undefined') {
    return DEFAULT_CHUNK_UPLOAD_SIZE_BYTES;
  }
  const navAny = navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; saveData?: boolean };
  };
  const conn = navAny.connection;
  if (conn?.saveData) return MIN_CHUNK_UPLOAD_SIZE_BYTES;
  if (conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') {
    return MIN_CHUNK_UPLOAD_SIZE_BYTES;
  }
  if (conn?.effectiveType === '3g') return DEFAULT_CHUNK_UPLOAD_SIZE_BYTES;
  if (totalSize > 512 * 1024 * 1024 || (conn?.downlink || 0) >= 20) {
    return MAX_CHUNK_UPLOAD_SIZE_BYTES;
  }
  return DEFAULT_CHUNK_UPLOAD_SIZE_BYTES;
};

const calculateChunkHash = async (chunk: Uint8Array): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new Uint8Array(chunk));
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const uploadBinaryInChunks = async (
  url: string,
  method: string,
  baseHeaders: Record<string, string>,
  body: Uint8Array,
  context: string,
  onProgress?: (progress: number) => void,
  options?: { uploadKey?: string; notFoundRestartCount?: number }
) => {
  const totalSize = body.byteLength;
  if (totalSize <= CHUNK_UPLOAD_THRESHOLD_BYTES) {
    await uploadWithRetry(
      url,
      {
        method,
        headers: baseHeaders,
        body: body as unknown as BodyInit,
      },
      context,
      onProgress
    );
    return;
  }

  const uploadKey = options?.uploadKey || `${url}:${totalSize}`;
  const detectedChunkSize = detectChunkSizeBytes(totalSize);
  const existingSession = loadChunkSession(uploadKey);
  let session: ChunkUploadSession;
  if (!existingSession) {
    const chunkCount = Math.ceil(totalSize / detectedChunkSize);
    session = {
      uploadId: createChunkUploadId(),
      chunkSize: detectedChunkSize,
      chunkCount,
      completed: Array.from({ length: chunkCount }, () => false),
      createdAt: Date.now(),
    };
    saveChunkSession(uploadKey, session);
  } else {
    const expectedChunkCount = Math.ceil(totalSize / existingSession.chunkSize);
    if (existingSession.chunkCount !== expectedChunkCount) {
      // The payload shape changed (or a stale session is present) so start clean.
      const chunkCount = Math.ceil(totalSize / detectedChunkSize);
      session = {
        uploadId: createChunkUploadId(),
        chunkSize: detectedChunkSize,
        chunkCount,
        completed: Array.from({ length: chunkCount }, () => false),
        createdAt: Date.now(),
      };
      saveChunkSession(uploadKey, session);
    } else {
      // Keep session chunk size sticky across retries/resume to avoid restarting
      // uploads when network conditions fluctuate.
      const normalizedCompleted = Array.from({ length: expectedChunkCount }, (_, index) =>
        Boolean(existingSession.completed[index])
      );
      session = {
        ...existingSession,
        completed: normalizedCompleted,
        chunkCount: expectedChunkCount,
      };
      saveChunkSession(uploadKey, session);
    }
  }

  const chunkCount = session.chunkCount;
  const chunkSize = session.chunkSize;
  const pendingIndexes = Array.from({ length: chunkCount }, (_, index) => index).filter(
    (index) => !session.completed[index]
  );

  let completedCount = session.completed.filter(Boolean).length;
  if (onProgress) {
    onProgress(Math.round((completedCount / chunkCount) * 100));
  }

  let cursor = 0;
  const workerCount = Math.max(1, Math.min(DEFAULT_CHUNK_PARALLELISM, pendingIndexes.length));
  const uploadWorker = async () => {
    while (cursor < pendingIndexes.length) {
      const myCursor = cursor;
      cursor += 1;
      const chunkIndex = pendingIndexes[myCursor];
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, totalSize);
      const chunk = body.slice(start, end);
      const chunkHash = await calculateChunkHash(chunk);

      await uploadWithRetry(
        url,
        {
          method,
          headers: {
            ...baseHeaders,
            'X-Vault-Chunked': '1',
            'X-Vault-Upload-Id': session.uploadId,
            'X-Vault-Chunk-Index': String(chunkIndex),
            'X-Vault-Chunk-Count': String(chunkCount),
            'X-Vault-Chunk-Size': String(chunk.byteLength),
            'X-Vault-Total-Size': String(totalSize),
            'X-Vault-Chunk-SHA256': chunkHash,
          },
          body: chunk as unknown as BodyInit,
        },
        `${context} (chunk ${chunkIndex + 1}/${chunkCount})`,
        undefined
      );

      session.completed[chunkIndex] = true;
      completedCount += 1;
      saveChunkSession(uploadKey, session);
      if (onProgress) {
        onProgress(Math.round((completedCount / chunkCount) * 100));
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: workerCount }, () => uploadWorker()));
    clearChunkSession(uploadKey);
  } catch (error) {
    const status = (error as { status?: number })?.status;
    const restartCount = options?.notFoundRestartCount || 0;

    // Some servers can transiently drop chunk sessions during finalization.
    // Restart the upload session and retry end-to-end with a bounded limit.
    if (
      (status === 404 || status === 409 || status === 410 || status === 412) &&
      restartCount < MAX_CHUNK_SESSION_RESTARTS
    ) {
      clearChunkSession(uploadKey);
      await uploadBinaryInChunks(url, method, baseHeaders, body, context, onProgress, {
        uploadKey,
        notFoundRestartCount: restartCount + 1,
      });
      return;
    }

    throw error;
  }
};
