import { VaultItem } from '../../../../lib/storage';

export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

export const formatDate = (value: number | string | null | undefined) => {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
};

export const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  const candidate = error as { message?: string; code?: string };
  if (typeof candidate?.message === 'string' && candidate.message.trim()) {
    return candidate.message;
  }

  return fallback;
};

export const getSyncHealthLabel = (syncStatus: 'idle' | 'syncing' | 'success' | 'error') =>
  syncStatus === 'success'
    ? 'Healthy'
    : syncStatus === 'syncing'
      ? 'Syncing'
      : syncStatus === 'error'
        ? 'Needs attention'
        : 'Idle';

export const getSyncHealthDescription = (syncStatus: 'idle' | 'syncing' | 'success' | 'error') => {
  switch (syncStatus) {
    case 'success':
      return 'Vault data is aligned with secure cloud storage.';
    case 'syncing':
      return 'A secure sync is currently in progress.';
    case 'error':
      return 'Recent sync activity needs attention.';
    default:
      return 'No active cloud sync is running right now.';
  }
};

export const formatCountLabel = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

export const getItemRawBytes = (item: VaultItem): number => {
  if (!item) return 0;
  const metadata = (item.metadata as Record<string, any>) || {};
  const rawSize =
    metadata.size ??
    metadata.fileSize ??
    metadata.bytes ??
    metadata.contentLength ??
    metadata.fileSizeBytes ??
    (item as any).file?.size ??
    (item as any).size;

  const parsedSize =
    typeof rawSize === 'number' ? rawSize : typeof rawSize === 'string' ? Number(rawSize) : NaN;

  if (Number.isFinite(parsedSize) && parsedSize > 0) {
    return parsedSize;
  }

  if (item.content instanceof Uint8Array) {
    return item.content.byteLength;
  }

  if (typeof item.content === 'string') {
    if (item.content.startsWith('data:')) {
      const commaIdx = item.content.indexOf(',');
      if (commaIdx >= 0) {
        const base64Len = item.content.length - (commaIdx + 1);
        return Math.floor((base64Len * 3) / 4);
      }
    }
    if (
      item.content.startsWith('cloud://') ||
      item.content.startsWith('gridfs://') ||
      item.content.startsWith('file://')
    ) {
      return 0;
    }
    return new TextEncoder().encode(item.content).length;
  }

  return 0;
};

export const estimateVaultItemBytes = (item: VaultItem) => {
  if (!item) return 0;
  const textEncoder = new TextEncoder();
  const metadataSize = (() => {
    try {
      return textEncoder.encode(JSON.stringify(item.metadata || {})).length;
    } catch {
      return 0;
    }
  })();

  const contentSize = getItemRawBytes(item);

  return (
    textEncoder.encode(item.id || '').length +
    textEncoder.encode(item.title || '').length +
    (item.folder ? textEncoder.encode(item.folder).length : 0) +
    metadataSize +
    contentSize
  );
};

const VIDEO_EXTENSIONS = new Set([
  'mp4',
  'm4v',
  'mov',
  'qt',
  'webm',
  'mkv',
  'mka',
  'mks',
  'avi',
  'divx',
  'xvid',
  'wmv',
  'asf',
  'asx',
  'mpg',
  'mpeg',
  'mpe',
  'mpv',
  'm2v',
  'm2p',
  'mts',
  'm2ts',
  'ts',
  'vob',
  'evo',
  'mod',
  'tod',
  '3gp',
  '3g2',
  'f4v',
  'f4p',
  'f4a',
  'f4b',
  'flv',
  'ogv',
  'ogm',
  'rv',
  'rm',
  'rmvb',
  'dat',
  'lxf',
  'nut',
  'dv',
  'dif',
]);

const PHOTO_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'jpe',
  'jfif',
  'pjpeg',
  'pjp',
  'png',
  'apng',
  'gif',
  'webp',
  'avif',
  'heic',
  'heif',
  'bmp',
  'dib',
  'tif',
  'tiff',
  'ico',
  'cur',
  'svg',
  'svgz',
  'raw',
  'cr2',
  'cr3',
  'nef',
  'nrw',
  'arw',
  'sr2',
  'srf',
  'raf',
  'orf',
  'rw2',
  'pef',
  'dng',
  'x3f',
  '3fr',
  'fff',
  'iiq',
  'erf',
  'kdc',
  'mef',
  'mos',
  'mrw',
  'rwl',
  'dcr',
  'bay',
  'gpr',
  'jp2',
  'j2k',
  'jpf',
  'jpm',
  'jxr',
  'hdp',
  'wdp',
  'dds',
  'exr',
  'hdr',
  'pic',
  'pct',
  'pcx',
  'tga',
  'icns',
  'psd',
]);

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'wav',
  'ogg',
  'oga',
  'flac',
  'aac',
  'm4a',
  'wma',
  'opus',
  'aiff',
  'aif',
  'aifc',
  'alac',
  'mid',
  'midi',
  'weba',
  'amr',
  'ape',
  'pcm',
]);

const extractExtension = (fileName?: string): string => {
  if (!fileName || typeof fileName !== 'string') return '';
  const clean = fileName.split('?')[0].split('#')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase().trim() : '';
};

export const getMediaType = (item: VaultItem): 'photo' | 'video' | 'audio' | 'other' => {
  if (!item) return 'other';

  const rawType = (item.type || (item as any).category || '').toString().toLowerCase().trim();
  if (rawType === 'video' || rawType === 'videos') return 'video';
  if (rawType === 'photo' || rawType === 'photos' || rawType === 'image' || rawType === 'images')
    return 'photo';
  if (rawType === 'audio' || rawType === 'audios' || rawType === 'music') return 'audio';

  const metadata = (item.metadata as Record<string, any>) || {};
  const mimeType = (
    metadata.mimeType ||
    metadata.type ||
    (item as any).file?.mimeType ||
    (item as any).file?.mimetype ||
    ''
  )
    .toString()
    .toLowerCase()
    .trim();

  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType.startsWith('audio/')) return 'audio';

  const metaCategory = (metadata.category || metadata.mediaType || '')
    .toString()
    .toLowerCase()
    .trim();
  if (metaCategory === 'video' || metaCategory === 'videos') return 'video';
  if (metaCategory === 'photo' || metaCategory === 'photos' || metaCategory === 'image')
    return 'photo';
  if (metaCategory === 'audio' || metaCategory === 'audios') return 'audio';

  const titleExt = extractExtension(item.title);
  const fileExt = extractExtension(
    metadata.fileName || metadata.originalName || metadata.name || (item as any).file?.fileName
  );
  const explicitExt = (metadata.extension || '').toString().toLowerCase().replace(/^\./, '').trim();

  const candidates = [titleExt, fileExt, explicitExt].filter(Boolean);
  for (const ext of candidates) {
    if (VIDEO_EXTENSIONS.has(ext)) return 'video';
    if (PHOTO_EXTENSIONS.has(ext)) return 'photo';
    if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  }

  return 'other';
};

export const calculateMediaBreakdown = (items: VaultItem[]) => {
  let photoCount = 0,
    videoCount = 0,
    audioCount = 0,
    otherCount = 0;
  let photoBytes = 0,
    videoBytes = 0,
    audioBytes = 0,
    otherBytes = 0;

  if (Array.isArray(items)) {
    items.forEach((item) => {
      if (!item) return;
      const mediaType = getMediaType(item);
      const bytes = getItemRawBytes(item) || estimateVaultItemBytes(item);

      if (mediaType === 'photo') {
        photoCount += 1;
        photoBytes += bytes;
      } else if (mediaType === 'video') {
        videoCount += 1;
        videoBytes += bytes;
      } else if (mediaType === 'audio') {
        audioCount += 1;
        audioBytes += bytes;
      } else {
        otherCount += 1;
        otherBytes += bytes;
      }
    });
  }

  return {
    photo: { count: photoCount, bytes: photoBytes },
    video: { count: videoCount, bytes: videoBytes },
    audio: { count: audioCount, bytes: audioBytes },
    other: { count: otherCount, bytes: otherBytes },
  };
};

export const SETTINGS_SURFACE =
  'rounded-[2rem] border border-card-border bg-card-bg p-6 dark:border-white/10 dark:bg-black sm:p-8 shadow-sm';

export const SETTINGS_PANEL =
  'rounded-[1.5rem] border border-card-border bg-card-bg p-5 transition-all dark:border-white/10 dark:bg-black/40 hover:bg-text/[0.02]';

export const SETTINGS_PANEL_SOFT =
  'rounded-[1.5rem] border border-card-border bg-card-bg transition-all dark:border-white/10 dark:bg-black/20 hover:bg-text/[0.01]';
