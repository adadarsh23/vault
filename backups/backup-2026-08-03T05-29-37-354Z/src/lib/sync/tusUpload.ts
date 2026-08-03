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
    chunkData.buffer as ArrayBuffer
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
 */
export async function uploadFileTus(
  options: TusUploadOptions
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
  let currentOffset = 0;

  // Step 1: Query existing session or create a new upload
  if (session && uploadId) {
    try {
      currentOffset = await vaultApi.getTusOffset(uploadId);
    } catch {
      // If server session expired or invalid, reset session
      session = null;
      clearTusSession(sessionKey);
    }
  }

  if (!session || !uploadId) {
    const fileMetadata: Record<string, string> = {
      filename: file.name,
      filetype: file.type || 'application/octet-stream',
      ...metadata,
    };

    const created = await vaultApi.createTusUpload(file.size, fileMetadata);
    uploadId = created.uploadId;
    location = created.location;

    session = {
      uploadId,
      location,
      fileSize: file.size,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      createdAt: Date.now(),
    };
    saveTusSession(sessionKey, session);
    currentOffset = 0;
  }

  // Step 2: Upload remaining file chunks starting from currentOffset
  const totalSize = file.size;

  while (currentOffset < totalSize) {
    if (signal?.aborted) {
      throw new Error('TUS upload aborted by caller');
    }

    const start = currentOffset;
    const end = Math.min(start + chunkSize, totalSize);
    const rawChunkSlice = await file.slice(start, end).arrayBuffer();
    const rawChunkBytes = new Uint8Array(rawChunkSlice);

    // Encrypt chunk bytes prior to transmit over network
    const encryptedChunk = await encryptChunk(rawChunkBytes, cryptoKey);

    let retryCount = 0;
    let nextOffset: number | null = null;

    while (retryCount <= MAX_RETRIES) {
      if (signal?.aborted) throw new Error('TUS upload aborted');
      try {
        nextOffset = await vaultApi.uploadTusChunk(uploadId, currentOffset, encryptedChunk);
        break; // Success
      } catch (err: any) {
        retryCount++;
        if (retryCount > MAX_RETRIES) {
          throw new Error(`TUS upload chunk failed after ${MAX_RETRIES} retries: ${err.message}`);
        }
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, retryCount - 1));
      }
    }

    if (nextOffset !== null) {
      // Update currentOffset based on server-reported offset to stay in sync with encrypted chunk size
      currentOffset = nextOffset;
      if (onProgress) {
        onProgress(currentOffset, totalSize);
      }
    }
  }

  // Cleanup completed session
  clearTusSession(sessionKey);
  return { uploadId, location };
}
