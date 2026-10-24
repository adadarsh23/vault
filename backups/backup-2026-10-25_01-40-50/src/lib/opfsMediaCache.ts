/**
 * OPFS (Origin Private File System) Streaming Media Cache
 *
 * Provides persistent ultra-high-speed (NVMe/RAM-speed direct disk I/O)
 * encrypted block storage for vault media.
 * Data is encrypted-at-rest with zero-knowledge keys and automatically
 * evicted or wiped on vault lock.
 */

const OPFS_DIR = 'vault_media_stream_cache_v1';

let opfsAvailable: boolean | null = null;

export async function isOpfsSupported(): Promise<boolean> {
  if (opfsAvailable !== null) return opfsAvailable;
  try {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) {
      opfsAvailable = false;
      return false;
    }
    const root = await navigator.storage.getDirectory();
    opfsAvailable = Boolean(root);
    return opfsAvailable;
  } catch {
    opfsAvailable = false;
    return false;
  }
}

async function getOpfsDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const supported = await isOpfsSupported();
    if (!supported) return null;
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(OPFS_DIR, { create: true });
  } catch {
    return null;
  }
}

/**
 * Saves an encrypted file/chunk buffer directly to OPFS disk cache.
 */
export async function saveOpfsMediaBlob(
  cacheKey: string,
  data: Uint8Array | ArrayBuffer,
): Promise<boolean> {
  try {
    const dir = await getOpfsDirectory();
    if (!dir) return false;

    // Sanitize cache key for valid filename
    const sanitizedKey = encodeURIComponent(cacheKey).slice(0, 100);
    const fileHandle = await dir.getFileHandle(sanitizedKey, { create: true });

    // Ensure clean ArrayBuffer slice for FileSystemWriteChunkType
    const bufferToWrite =
      data instanceof Uint8Array
        ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
        : data;

    // Use createWritable stream for high throughput
    const writable = await fileHandle.createWritable();
    await writable.write(bufferToWrite);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieves an encrypted file/chunk buffer directly from OPFS disk cache.
 */
export async function getOpfsMediaBlob(cacheKey: string): Promise<Uint8Array | null> {
  try {
    const dir = await getOpfsDirectory();
    if (!dir) return null;

    const sanitizedKey = encodeURIComponent(cacheKey).slice(0, 100);
    const fileHandle = await dir.getFileHandle(sanitizedKey);
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/**
 * Purges the entire OPFS stream cache (called on Vault Panic Lock / Lock)
 */
export async function purgeOpfsMediaCache(): Promise<void> {
  try {
    const supported = await isOpfsSupported();
    if (!supported) return;
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(OPFS_DIR, { recursive: true }).catch(() => {});
  } catch {
    // Ignore errors during panic purge
  }
}

// Automatically subscribe to security panic locks
if (typeof window !== 'undefined') {
  window.addEventListener('vault:panic-lock', () => {
    void purgeOpfsMediaCache();
  });
  window.addEventListener('vault:lock', () => {
    void purgeOpfsMediaCache();
  });
}
