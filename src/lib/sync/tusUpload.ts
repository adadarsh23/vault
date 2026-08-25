import { vaultApi } from '../../api/vaultApi';
import { getOrCreateCryptoKey, AES_GCM_IV_LENGTH, AES_GCM_AAD } from '../cryptoPrimitives';

const TUS_STORAGE_PREFIX = 'vault:tus-session:';
const DEFAULT_TUS_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunk size for smooth resumability
const MAX_RETRIES = 4;
const RETRY_BASE_DELAY_MS = 1000;

export interface TusUploadOptions {
  file: File;
  masterKey: string | CryptoKey;
  chunkSize?: number;
  metadata?: Record<string, string>;
  onProgress?: (bytesUploaded: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

export interface TusSession {
  uploadId: string;
  location: string;
  fileSize: number;
  fileName: string;
  mimeType: string;
  createdAt: number;
  rawOffset?: number;
  encryptedOffset?: number;
}

function getSessionKey(file: File): string {
  return `${TUS_STORAGE_PREFIX}${file.name}:${file.size}:${file.lastModified}`;
}

function saveTusSession(key: string, session: TusSession): void {
  try {
    localStorage.setItem(key, JSON.stringify(session));
  } catch {
    // Ignore storage quota errors
  }
}

function loadTusSession(key: string): TusSession | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as TusSession;
  } catch {
    return null;
  }
}

function clearTusSession(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore cleanup errors
  }
}

async function encryptChunk(chunkData: Uint8Array, cryptoKey: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv.buffer as ArrayBuffer,
      additionalData: AES_GCM_AAD.buffer as ArrayBuffer,
    },
    cryptoKey,
    chunkData.buffer as ArrayBuffer,
  );

  const encrypted = new Uint8Array(iv.length + ciphertext.byteLength);
  encrypted.set(iv, 0);
  encrypted.set(new Uint8Array(ciphertext), iv.length);
  return encrypted;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Resumable Encrypted File Upload using the TUS Protocol (v1.0.0).
 * Handles network drops, pause/resume, and chunk-level AES-GCM encryption.
 * Uses dual-pointer offset tracking to separate raw unencrypted file slicing from server encrypted bytes.
 */
export async function uploadFileTus(
  options: TusUploadOptions,
): Promise<{ uploadId: string; location: string }> {
  const {
    file,
    masterKey,
    chunkSize = DEFAULT_TUS_CHUNK_SIZE,
    metadata = {},
    onProgress,
    signal,
  } = options;

  const cryptoKey = await getOrCreateCryptoKey(masterKey);
  if (!cryptoKey) {
    throw new Error('Invalid cryptographic key for TUS upload');
  }

  const sessionKey = getSessionKey(file);
  let session = loadTusSession(sessionKey);
  let uploadId = session?.uploadId || '';
  let location = session?.location || '';
  let rawOffset = session?.rawOffset || 0;
  let encryptedOffset = session?.encryptedOffset || 0;

  // Step 1: Query existing session or create a new upload
  if (session && uploadId) {
    try {
      const serverOffset = await vaultApi.getTusOffset(uploadId);
      encryptedOffset = serverOffset;
      if (serverOffset === 0) {
        rawOffset = 0;
      }
    } catch {
      // If server session expired or invalid, reset session
      session = null;
      rawOffset = 0;
      encryptedOffset = 0;
      clearTusSession(sessionKey);
    }
  }

  if (!session || !uploadId) {
    const fileMetadata: Record<string, string> = {
      filename: file.name,
      filetype: file.type || 'application/octet-stream',
      ...metadata,
    };

    const chunkOverhead = AES_GCM_IV_LENGTH + 16; // 12-byte IV + 16-byte AES-GCM Tag
    const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
    const totalEncryptedSize = file.size + totalChunks * chunkOverhead;

    const created = await vaultApi.createTusUpload(totalEncryptedSize, fileMetadata);
    uploadId = created.uploadId;
    location = created.location;

    rawOffset = 0;
    encryptedOffset = 0;
    session = {
      uploadId,
      location,
      fileSize: totalEncryptedSize,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      createdAt: Date.now(),
      rawOffset: 0,
      encryptedOffset: 0,
    };
    saveTusSession(sessionKey, session);
  }

  // Step 2: Upload remaining file chunks starting from rawOffset
  const totalSize = file.size;

  while (rawOffset < totalSize) {
    if (signal?.aborted) {
      throw new Error('TUS upload aborted by caller');
    }

    const start = rawOffset;
    const end = Math.min(start + chunkSize, totalSize);
    const rawChunkSlice = await file.slice(start, end).arrayBuffer();
    const rawChunkBytes = new Uint8Array(rawChunkSlice);

    // Encrypt chunk bytes prior to transmit over network
    const encryptedChunk = await encryptChunk(rawChunkBytes, cryptoKey);

    let retryCount = 0;
    let nextServerOffset: number | null = null;

    while (retryCount <= MAX_RETRIES) {
      if (signal?.aborted) throw new Error('TUS upload aborted');
      try {
        nextServerOffset = await vaultApi.uploadTusChunk(uploadId, encryptedOffset, encryptedChunk);
        break; // Success
      } catch (err: any) {
        retryCount++;
        if (retryCount > MAX_RETRIES) {
          throw new Error(`TUS upload chunk failed after ${MAX_RETRIES} retries: ${err.message}`);
        }
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, retryCount - 1));
      }
    }

    if (nextServerOffset !== null) {
      rawOffset += rawChunkBytes.length;
      encryptedOffset = nextServerOffset;
      session.rawOffset = rawOffset;
      session.encryptedOffset = encryptedOffset;
      saveTusSession(sessionKey, session);

      if (onProgress) {
        onProgress(rawOffset, totalSize);
      }
    }
  }

  // Cleanup completed session
  clearTusSession(sessionKey);
  return { uploadId, location };
}
