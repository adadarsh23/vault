import { decryptToFile } from './encryption';
import { VaultItem } from './storage';
import { resolveApiBaseUrl } from './apiBaseUrl';

const API_BASE_URL = resolveApiBaseUrl();

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);
const isBlobOrDataUrl = (value: string): boolean => /^(blob:|data:)/i.test(value);
const looksLikeServerPath = (value: string): boolean =>
  value.startsWith('/uploads/') ||
  value.startsWith('uploads/') ||
  value.startsWith('/api/') ||
  value.startsWith('api/');

const isLikelyEncryptedString = (value: string): boolean => {
  const normalized = value.trim();
  if (!normalized || normalized.length < 32) {
    return false;
  }

  return /^[A-Za-z0-9+/=]+$/.test(normalized);
};

const looksLikeReadableMediaBytes = (bytes: Uint8Array, mimeType?: string): boolean => {
  if (!bytes || bytes.length < 4) return false;

  const mt = (mimeType || '').toLowerCase();
  const isLikelyVideo = !mt || mt.startsWith('video/');
  const isLikelyAudio = !mt || mt.startsWith('audio/');

  // PNG
  if (
    (mt.includes('image/png') || !mt) &&
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return true;
  }

  // JPEG
  if (
    (mt.includes('image/jpeg') || mt.includes('image/jpg') || !mt) &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return true;
  }

  // GIF
  if (
    (mt.includes('image/gif') || !mt) &&
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return true;
  }

  // WebP: RIFF....WEBP
  if (
    (mt.includes('image/webp') || !mt) &&
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }

  // ID3 MP3 or MP3 sync frame
  if (
    isLikelyAudio &&
    ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
      (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))
  ) {
    return true;
  }

  // WAV: RIFF....WAVE
  if (
    isLikelyAudio &&
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return true;
  }

  // FLAC: fLaC
  if (
    isLikelyAudio &&
    bytes[0] === 0x66 &&
    bytes[1] === 0x4c &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x43
  ) {
    return true;
  }

  // MP4 / M4A / QuickTime family: ....ftyp
  if (
    (isLikelyVideo || isLikelyAudio) &&
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return true;
  }

  // AVI: RIFF....AVI
  if (
    isLikelyVideo &&
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x41 &&
    bytes[9] === 0x56 &&
    bytes[10] === 0x49 &&
    bytes[11] === 0x20
  ) {
    return true;
  }

  // WebM / MKV (Matroska EBML): 1A 45 DF A3
  if (
    (isLikelyVideo || isLikelyAudio) &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return true;
  }

  // Ogg container: OggS
  if (
    (isLikelyVideo || isLikelyAudio) &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return true;
  }

  // FLV
  if (isLikelyVideo && bytes[0] === 0x46 && bytes[1] === 0x4c && bytes[2] === 0x56) {
    return true;
  }

  return false;
};

const normalizeMetadata = (value: unknown): Record<string, unknown> | undefined => {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
};

export const inferMimeTypeFromItem = (item: VaultItem): string | undefined => {
  const metadata = normalizeMetadata(item.metadata);
  if (typeof metadata?.mimeType === 'string' && metadata.mimeType.trim()) {
    return metadata.mimeType.trim();
  }

  const filename = item.title || (typeof metadata?.filename === 'string' ? metadata.filename : '');
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'm4a':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    case 'ogg':
      return 'audio/ogg';
    case 'flac':
      return 'audio/flac';
    case 'webm':
      return item.type === 'audio' ? 'audio/webm' : 'video/webm';
    case 'opus':
      return 'audio/opus';
    case 'mp4':
      return item.type === 'audio' ? 'audio/mp4' : 'video/mp4';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      if (item.type === 'audio') return 'audio/mpeg';
      return undefined;
  }
};

const resolveServerFileUrl = (value: string): string => {
  if (isAbsoluteUrl(value) || isBlobOrDataUrl(value)) {
    return value;
  }

  return `${API_BASE_URL}${value.startsWith('/') ? value : `/${value}`}`;
};

export const getVaultItemFileUrl = (item: VaultItem): string | null => {
  const metadata = normalizeMetadata(item.metadata);
  const metadataFilePath =
    typeof metadata?.filePath === 'string'
      ? metadata.filePath
      : typeof metadata?.url === 'string'
        ? metadata.url
        : typeof metadata?.previewUrl === 'string'
          ? metadata.previewUrl
          : null;
  const contentPath =
    typeof item.content === 'string' &&
    (looksLikeServerPath(item.content) ||
      isAbsoluteUrl(item.content) ||
      isBlobOrDataUrl(item.content))
      ? item.content
      : null;

  const candidate = metadataFilePath || contentPath;
  return candidate ? resolveServerFileUrl(candidate) : null;
};

export const getVaultItemPreviewUrl = async (
  item: VaultItem,
  masterKey: string | CryptoKey,
  mimeType?: string,
  rsaPrivateKey?: CryptoKeyPair['privateKey'] | null
): Promise<string | null> => {
  const directUrl = getVaultItemFileUrl(item);
  if (directUrl) {
    return directUrl;
  }

  if (typeof item.content === 'string' && !isLikelyEncryptedString(item.content)) {
    return looksLikeServerPath(item.content) ||
      isAbsoluteUrl(item.content) ||
      isBlobOrDataUrl(item.content)
      ? resolveServerFileUrl(item.content)
      : null;
  }

  const effectiveMimeType = mimeType || inferMimeTypeFromItem(item);

  if (
    item.content instanceof Uint8Array &&
    looksLikeReadableMediaBytes(item.content, effectiveMimeType)
  ) {
    const blob = new Blob([new Uint8Array(item.content)], {
      type: effectiveMimeType || 'application/octet-stream',
    });
    return URL.createObjectURL(blob);
  }

  return decryptToFile(item.content, masterKey, effectiveMimeType, rsaPrivateKey);
};

/** True when the item points at a server-side file (disk / signed URL pipeline). E2EE-only items return false. */
export const vaultItemHasServerFileReference = (item: VaultItem): boolean =>
  getVaultItemFileUrl(item) !== null;

/**
 * Stable dependency key for preview hooks (identity + content size + revision).
 * Avoids re-running decrypt when unrelated fields on `item` change.
 */
export const getVaultItemPreviewRevision = (item: VaultItem): string => {
  const contentPart =
    item.content instanceof Uint8Array
      ? `u8:${item.content.byteLength}`
      : typeof item.content === 'string'
        ? `s:${item.content.length}`
        : 'none';
  return `${item.id}:${item.updatedAt ?? 0}:${contentPart}`;
};

const normalizeErrorText = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  const o = error as { message?: string; status?: number; code?: string };
  if (typeof o?.message === 'string' && o.message.trim()) return o.message.trim();
  return '';
};

/**
 * Short, actionable copy for vault thumbnails / previews (no stack traces).
 */
export const describeVaultPreviewError = (error: unknown): string => {
  const text = normalizeErrorText(error).toLowerCase();
  const original = normalizeErrorText(error);

  if (
    text.includes('auth_token') ||
    text.includes('authentication token') ||
    text.includes('unlock the vault') ||
    text.includes('invalid token') ||
    text.includes('401')
  ) {
    return 'Your session expired. Lock and unlock the vault, then try again.';
  }
  if (text.includes('403') || text.includes('access denied') || text.includes('forbidden')) {
    return 'Access was denied for this file. Try unlocking the vault again.';
  }
  if (text.includes('404') || text.includes('not found')) {
    return 'This file is not available on the server anymore. It may only exist as encrypted data—try downloading or re-syncing.';
  }
  if (
    text.includes('network') ||
    text.includes('failed to fetch') ||
    text.includes('load failed')
  ) {
    return 'Network error. Check your connection and try again.';
  }
  if (
    text.includes('decrypt') ||
    text.includes('master key') ||
    text.includes('incorrect') ||
    text.includes('vault key')
  ) {
    return 'Could not decrypt this file. Your master key may not match this item.';
  }
  if (text.includes('signed url') || text.includes('getting signed')) {
    return 'Could not create a secure preview link. Try again, or open the file after download.';
  }
  if (text.includes('quota') || text.includes('413')) {
    return 'File is too large for the preview path. Use download instead.';
  }

  return original || 'Preview could not be loaded. Try again or download the file.';
};
