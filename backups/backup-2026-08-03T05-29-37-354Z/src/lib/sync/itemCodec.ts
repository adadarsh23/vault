import { VaultItem } from '../storage';
import { decryptData, base64ToUint8Array } from '../cryptoPrimitives';
import { logger } from '../logger';

const toTimestampOrFallback = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeDecodeTitle = (value: unknown, fallback: string): string => {
  const raw = typeof value === 'string' && value.length > 0 ? value : fallback;
  // Only attempt URI decoding for values that are likely percent-encoded.
  if (!raw.includes('%')) {
    return raw;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export const toCloudCategory = (type: VaultItem['type']): string => {
  switch (type) {
    case 'photo':
    case 'video':
    case 'audio':
    case 'note':
    case 'chat':
    case 'todo':
    case 'password':
    case 'secret':
    case 'contact':
    case 'document':
    case 'location':
    case 'file':
    case 'card':
    case 'identity':
    case 'wifi':
      return type;
    default:
      return 'file';
  }
};

const normalizeItemType = (
  category: unknown,
  metadata?: Record<string, unknown>
): VaultItem['type'] => {
  const normalized = typeof category === 'string' ? category.trim() : 'file';
  switch (normalized.toLowerCase()) {
    // Personal Information
    case 'identity':
    case 'identities':
      return 'identity';
    case 'contact':
    case 'contacts':
      return 'contact';
    case 'password':
    case 'passwords':
      return 'password';
    case 'card':
    case 'cards':
      return 'card';
    case 'wifi':
    case 'wifis':
      return 'wifi';
    case 'secret':
    case 'secrets':
    case 'secretkey':
    case 'secretkeys':
      return 'secret';

    // Notes & Productivity
    case 'note':
    case 'notes':
      return 'note';
    case 'todo':
    case 'todos':
      return 'todo';
    case 'chat':
    case 'chats':
      return 'chat';
    case 'location':
    case 'locations':
      return 'location';

    // Media
    case 'photo':
    case 'photos':
      return 'photo';
    case 'video':
    case 'videos':
      return 'video';
    case 'audio':
    case 'audios':
      return 'audio';

    // Documents & Files
    case 'document':
    case 'documents':
      return 'document';
    case 'file':
    case 'files':
    case 'otherfiles':
      return 'file';
    case 'settings':
    case 'system':
    case 'logs':
    case 'users':
    case 'v2_items':
    default: {
      const mimeType =
        typeof metadata?.mimeType === 'string' ? metadata.mimeType.toLowerCase() : '';
      if (mimeType.startsWith('image/')) return 'photo';
      if (mimeType.startsWith('video/')) return 'video';
      if (mimeType.startsWith('audio/')) return 'audio';
      if (mimeType.startsWith('application/pdf') || mimeType.startsWith('text/')) return 'document';

      // Advanced forensic mapping: detect locations via telemetry metadata
      if (metadata && typeof metadata === 'object') {
        const hasCoords =
          (metadata.latitude !== undefined && metadata.longitude !== undefined) ||
          (metadata.lat !== undefined && metadata.lng !== undefined);
        if (hasCoords) return 'location';
      }

      return 'file';
    }
  }
};

const isLikelyBase64 = (value: string): boolean => {
  let trimmed = value.trim();
  if (!trimmed) return false;

  if (trimmed.includes('%')) {
    try {
      trimmed = decodeURIComponent(trimmed);
    } catch {
      // keep original candidate when URI decoding fails
    }
  }

  const dataUrlMatch = trimmed.match(/^data:[^,]*;base64,(.*)$/i);
  if (dataUrlMatch) {
    trimmed = dataUrlMatch[1];
  }

  trimmed = trimmed.replace(/\s+/g, '');
  if (!trimmed) return false;

  // Support standard and URL-safe Base64 alphabets.
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(trimmed)) {
    return false;
  }

  const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  return normalized.length >= 8;
};

const getFolderFromMetadata = (metadata: unknown): string | undefined => {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const folder = (metadata as Record<string, unknown>).folder;
  return typeof folder === 'string' && folder.trim() ? folder : undefined;
};

export const parseJsonObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

class VaultItemDecodeError extends Error {
  itemId: string;

  constructor(itemId: string, message: string) {
    super(message);
    this.name = 'VaultItemDecodeError';
    this.itemId = itemId;
  }
}

const decodeBase64Payload = (
  payload: string,
  itemId: string,
  kind: 'binary' | 'payload' = 'payload'
): Uint8Array => {
  try {
    return base64ToUint8Array(payload);
  } catch {
    throw new VaultItemDecodeError(itemId, `Vault item ${kind} is not valid base64.`);
  }
};

export const downloadAllFromResponseItems = async (
  items: any[],
  masterKey: string | CryptoKey
): Promise<VaultItem[]> => {
  if (items.length === 0) return [];

  const allItems: VaultItem[] = [];
  const decodeFailures: VaultItemDecodeError[] = [];
  const decodeVaultDoc = async (doc: any): Promise<VaultItem | null> => {
    const itemId =
      (typeof doc?.itemId === 'string' && doc.itemId.trim()) ||
      (typeof doc?.id === 'string' && doc.id.trim()) ||
      (typeof doc?._id === 'string' && doc._id.trim()) ||
      'unknown-item';

    const rawCategory = doc?.category || doc?.type || doc?.kind;

    try {
      const payload = doc?.payload;
      if (typeof payload !== 'string' || payload.length === 0) {
        throw new VaultItemDecodeError(itemId, 'Vault item payload is missing.');
      }

      // Determine what to decrypt in parallel
      const titleDecryptNeeded = typeof doc?.title === 'string' && doc.title.startsWith('V2_ENC:');
      const titlePromise = titleDecryptNeeded
        ? decryptData(doc.title.substring(7), masterKey)
        : Promise.resolve(null);

      let metadataDecryptNeeded = false;
      let metadataEncryptedPayload = '';
      if (typeof doc?.metadata === 'string' && doc.metadata.startsWith('V2_ENC:')) {
        metadataDecryptNeeded = true;
        metadataEncryptedPayload = doc.metadata.substring(7);
      } else if (
        typeof doc?.metadata === 'object' &&
        doc.metadata &&
        typeof doc.metadata.payload === 'string' &&
        doc.metadata.payload.startsWith('V2_ENC:')
      ) {
        metadataDecryptNeeded = true;
        metadataEncryptedPayload = doc.metadata.payload.substring(7);
      }
      const metadataPromise = metadataDecryptNeeded
        ? decryptData(metadataEncryptedPayload, masterKey)
        : Promise.resolve(null);

      const isBinaryOrRef =
        doc?.encoding === 'gridfs-binary' ||
        doc?.gridFsId ||
        (doc?.encoding === 'file-reference' && typeof payload === 'string') ||
        doc?.encoding === 'binary-base64';

      let payloadPromise = Promise.resolve<string | null>(null);
      let isModern = false;
      let modernEncryptedMeta = '';
      let modernContent = '';

      if (!isBinaryOrRef) {
        if (payload.startsWith('V2_MODERN:')) {
          isModern = true;
          const payloadBody = payload.substring(10);
          const separatorIndex = payloadBody.indexOf('|');
          if (separatorIndex >= 0) {
            modernEncryptedMeta = payloadBody.slice(0, separatorIndex);
            modernContent = payloadBody.slice(separatorIndex + 1);
            payloadPromise = decryptData(modernEncryptedMeta, masterKey);
          } else {
            throw new VaultItemDecodeError(itemId, 'Vault item payload is malformed.');
          }
        } else {
          payloadPromise = decryptData(payload, masterKey);
        }
      }

      // Execute all decryptions in parallel!
      const [decryptedTitle, decryptedMeta, decryptedPayload] = await Promise.all([
        titlePromise,
        metadataPromise,
        payloadPromise,
      ]);

      let title = safeDecodeTitle(doc?.title, itemId || 'Untitled');
      if (decryptedTitle !== null) {
        title = decryptedTitle;
      }

      let rawMetadata = {};
      if (doc?.metadata) {
        if (typeof doc.metadata === 'object') {
          rawMetadata = doc.metadata;
        } else if (typeof doc.metadata === 'string') {
          try {
            rawMetadata = JSON.parse(doc.metadata);
          } catch {
            /* Ignore */
          }
        }
      }
      let metadata = rawMetadata;
      if (decryptedMeta !== null) {
        try {
          metadata = JSON.parse(decryptedMeta);
        } catch {
          /* Fallback to raw metadata */
        }
      }

      const metaFolder = getFolderFromMetadata(metadata);
      const folder = typeof doc?.folder === 'string' && doc.folder.trim() ? doc.folder : metaFolder;
      const metadataRecord =
        metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
      const type = normalizeItemType(rawCategory, metadata as Record<string, unknown>);

      const createdAt = toTimestampOrFallback(doc?.createdAt ?? doc?.updatedAt, Date.now());
      const updatedAt = toTimestampOrFallback(doc?.updatedAt ?? doc?.createdAt, createdAt);
      const deletedAt = doc?.deletedAt
        ? toTimestampOrFallback(doc.deletedAt, updatedAt)
        : undefined;
      const isPinned =
        typeof doc?.isPinned === 'boolean' ? doc.isPinned : Boolean(metadataRecord.isPinned);
      const pinnedAt = doc?.pinnedAt
        ? toTimestampOrFallback(doc.pinnedAt, updatedAt)
        : metadataRecord.pinnedAt
          ? toTimestampOrFallback(metadataRecord.pinnedAt, updatedAt)
          : null;
      const username =
        doc?.username ||
        (typeof metadataRecord.username === 'string' ? metadataRecord.username : undefined);

      if (doc?.encoding === 'gridfs-binary' || doc?.gridFsId) {
        return {
          id: itemId,
          type,
          title,
          content: decodeBase64Payload(payload, itemId, 'binary'),
          metadata,
          folder,
          createdAt,
          updatedAt,
          isPinned,
          pinnedAt,
        } as VaultItem;
      }

      if (doc?.encoding === 'file-reference' && typeof payload === 'string') {
        return {
          id: itemId,
          type,
          title,
          content: payload,
          metadata,
          folder,
          createdAt,
          updatedAt,
          isPinned,
          pinnedAt,
        } as VaultItem;
      }

      if (doc?.encoding === 'binary-base64') {
        return {
          id: itemId,
          type,
          title,
          content: decodeBase64Payload(payload, itemId, 'payload'),
          metadata,
          folder,
          createdAt,
          updatedAt,
          isPinned,
          pinnedAt,
        } as VaultItem;
      }

      if (isModern) {
        if (!decryptedPayload) {
          throw new VaultItemDecodeError(itemId, 'Vault item metadata could not be decrypted.');
        }

        try {
          const metaObj = JSON.parse(decryptedPayload) as Partial<VaultItem>;
          return {
            id: metaObj.id || itemId,
            type: normalizeItemType(
              metaObj.type || doc?.category,
              (metaObj.metadata || metadata) as Record<string, unknown>
            ),
            title: metaObj.title || title,
            content: modernContent,
            metadata: metaObj.metadata || metadata,
            folder: metaObj.folder || getFolderFromMetadata(metaObj.metadata || metadata) || folder,
            username: metaObj.username || username,
            createdAt: typeof metaObj.createdAt === 'number' ? metaObj.createdAt : createdAt,
            updatedAt: typeof metaObj.updatedAt === 'number' ? metaObj.updatedAt : updatedAt,
            deletedAt: typeof metaObj.deletedAt === 'number' ? metaObj.deletedAt : deletedAt,
            isPinned:
              typeof (metaObj as any).isPinned === 'boolean' ? (metaObj as any).isPinned : isPinned,
            pinnedAt:
              typeof (metaObj as any).pinnedAt === 'number' ? (metaObj as any).pinnedAt : pinnedAt,
            source: (metaObj as any).source || 'cloud',
          } as VaultItem;
        } catch {
          throw new VaultItemDecodeError(itemId, 'Vault item metadata is not valid JSON.');
        }
      }

      if (decryptedPayload) {
        try {
          const parsed = JSON.parse(decryptedPayload) as Partial<VaultItem>;
          return {
            id: parsed.id || itemId,
            type: normalizeItemType(
              parsed.type || doc?.category,
              (parsed.metadata || metadata) as Record<string, unknown>
            ),
            title: parsed.title || title,
            content: parsed.content ?? decryptedPayload,
            metadata: parsed.metadata || metadata,
            folder: parsed.folder || getFolderFromMetadata(parsed.metadata || metadata) || folder,
            username: parsed.username || username,
            createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : createdAt,
            updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : updatedAt,
            deletedAt: typeof parsed.deletedAt === 'number' ? parsed.deletedAt : deletedAt,
            isPinned:
              typeof (parsed as any).isPinned === 'boolean' ? (parsed as any).isPinned : isPinned,
            pinnedAt:
              typeof (parsed as any).pinnedAt === 'number' ? (parsed as any).pinnedAt : pinnedAt,
          } as VaultItem;
        } catch {
          // Backward compatibility: older records may store encrypted raw
          // content (non-JSON). Decode as binary for media/base64 payloads,
          // otherwise keep as plain text content.
          if (
            isLikelyBase64(decryptedPayload) &&
            (type === 'file' ||
              type === 'photo' ||
              type === 'video' ||
              type === 'audio' ||
              type === 'document')
          ) {
            return {
              id: itemId,
              type,
              title,
              content: base64ToUint8Array(decryptedPayload),
              metadata,
              folder,
              createdAt,
              updatedAt,
              isPinned,
              pinnedAt,
            } as VaultItem;
          }

          return {
            id: itemId,
            type,
            title,
            content: decryptedPayload,
            metadata,
            folder,
            createdAt,
            updatedAt,
            isPinned,
            pinnedAt,
          } as VaultItem;
        }
      }

      if (
        isLikelyBase64(payload) &&
        (type === 'file' ||
          type === 'photo' ||
          type === 'video' ||
          type === 'audio' ||
          type === 'document')
      ) {
        return {
          id: itemId,
          type,
          title,
          content: base64ToUint8Array(payload),
          metadata,
          folder,
          createdAt,
          updatedAt,
          isPinned,
          pinnedAt,
        } as VaultItem;
      }

      throw new VaultItemDecodeError(itemId, 'Vault item could not be decrypted.');
    } catch (error) {
      const decodeError =
        error instanceof VaultItemDecodeError
          ? error
          : new VaultItemDecodeError(
              itemId,
              error instanceof Error ? error.message : 'Vault item decode failed.'
            );
      decodeFailures.push(decodeError);
      return null;
    }
  };

  const results: Array<VaultItem | null> = [];
  const DECODE_BATCH_SIZE = 16;
  let lastYieldTime = performance.now();
  const BATCH_YIELD_BUDGET_MS = 8;

  for (let start = 0; start < items.length; start += DECODE_BATCH_SIZE) {
    const batch = items.slice(start, start + DECODE_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(decodeVaultDoc));
    results.push(...batchResults);

    // Yield to browser event loop frequently to keep UI buttery smooth at 60 FPS
    const now = performance.now();
    if (now - lastYieldTime > BATCH_YIELD_BUDGET_MS || start + DECODE_BATCH_SIZE >= items.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      lastYieldTime = performance.now();
    }
  }

  const validItems = results.filter((item): item is VaultItem => item !== null);
  allItems.push(...validItems);

  if (decodeFailures.length > 0) {
    const hasVaultMismatchFailure = decodeFailures.some((failure) =>
      failure.message.includes('metadata could not be decrypted')
    );

    if (hasVaultMismatchFailure && allItems.length === 0) {
      throw new Error(
        'This cloud vault does not match the currently unlocked master Key. Please log in with the correct vault or sync the matching account.'
      );
    }

    const preview = decodeFailures
      .slice(0, 3)
      .map((failure) => `${failure.itemId}: ${failure.message}`)
      .join('; ');

    logger.warn('Cloud sync skipped corrupted item(s)', {
      skippedCount: decodeFailures.length,
      preview,
    });
  }

  return allItems;
};
