import { VaultItem } from '../../../../lib/storage';

export type GridDensity = 'compact' | 'standard' | 'large' | 'list';

export type MediaFilterType = 'all' | 'favorites' | 'live' | '4k' | 'raw' | 'recent';

export type MediaSortType =
  'date-desc' | 'date-asc' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc';

export interface TimelineGroup {
  id: string;
  label: string;
  subLabel?: string;
  items: VaultItem[];
}

export const getFileExtension = (fileName: string) =>
  fileName.split('.').pop()?.trim().toUpperCase() || '';

export const formatDuration = (seconds?: number | null): string => {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds <= 0) return '';
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
};

export const getResolutionBadge = (
  width?: number,
  height?: number,
): '4K' | '2K' | 'HD' | 'SD' | null => {
  if (!width || !height) return null;
  const maxDim = Math.max(width, height);
  const minDim = Math.min(width, height);

  if (maxDim >= 3800 || minDim >= 2100) return '4K';
  if (maxDim >= 2500 || minDim >= 1400) return '2K';
  if (maxDim >= 1280 || minDim >= 720) return 'HD';
  if (maxDim > 0 && minDim > 0) return 'SD';
  return null;
};

export const formatFileSize = (bytes?: number): string => {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export const getMediaDimensions = async (
  file: File,
  type: 'photo' | 'video',
): Promise<{ width: number; height: number; aspectRatio: number; duration?: number } | null> => {
  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      if (type === 'photo') {
        const image = new Image();
        const dimensions = await new Promise<{ width: number; height: number }>(
          (resolve, reject) => {
            const timer = setTimeout(() => {
              image.onload = null;
              image.onerror = null;
              image.src = '';
              reject(new Error('Image dimensions probe timeout'));
            }, 2500);

            image.onload = () => {
              clearTimeout(timer);
              resolve({
                width: image.naturalWidth,
                height: image.naturalHeight,
              });
            };
            image.onerror = () => {
              clearTimeout(timer);
              reject(new Error('Failed to read image dimensions.'));
            };
            image.src = objectUrl;
          },
        );

        return {
          ...dimensions,
          aspectRatio:
            dimensions.width > 0 && dimensions.height > 0
              ? dimensions.width / dimensions.height
              : 1,
        };
      }

      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';

      const details = await new Promise<{ width: number; height: number; duration?: number }>(
        (resolve) => {
          const timer = setTimeout(() => {
            video.onloadedmetadata = null;
            video.onerror = null;
            resolve({
              width: 1920,
              height: 1080,
            });
          }, 2500);

          video.onloadedmetadata = () => {
            clearTimeout(timer);
            resolve({
              width: video.videoWidth || 1920,
              height: video.videoHeight || 1080,
              duration: video.duration && !isNaN(video.duration) ? video.duration : undefined,
            });
          };
          video.onerror = () => {
            clearTimeout(timer);
            resolve({
              width: 1920,
              height: 1080,
            });
          };
          video.src = objectUrl;
        },
      );

      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        /* ignore */
      }

      return {
        ...details,
        aspectRatio:
          details.width > 0 && details.height > 0 ? details.width / details.height : 16 / 9,
      };
    } finally {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        /* ignore */
      }
    }
  } catch {
    return { width: 1920, height: 1080, aspectRatio: 16 / 9 };
  }
};

const extensionToPhotoMime: Record<string, string> = {
  JPG: 'image/jpeg',
  JPEG: 'image/jpeg',
  JPE: 'image/jpeg',
  JFIF: 'image/jpeg',
  PJPEG: 'image/jpeg',
  PJP: 'image/jpeg',
  PNG: 'image/png',
  APNG: 'image/apng',
  GIF: 'image/gif',
  WEBP: 'image/webp',
  AVIF: 'image/avif',
  HEIC: 'image/heic',
  HEIF: 'image/heif',
  BMP: 'image/bmp',
  DIB: 'image/bmp',
  TIF: 'image/tiff',
  TIFF: 'image/tiff',
  ICO: 'image/x-icon',
  CUR: 'image/x-icon',
  SVG: 'image/svg+xml',
  SVGZ: 'image/svg+xml',
  PSD: 'image/vnd.adobe.photoshop',
  RAW: 'image/x-dcraw',
  CR2: 'image/x-canon-cr2',
  CR3: 'image/x-canon-cr3',
  NEF: 'image/x-nikon-nef',
  NRW: 'image/x-nikon-nrw',
  ARW: 'image/x-sony-arw',
  SR2: 'image/x-sony-sr2',
  SRF: 'image/x-sony-srf',
  RAF: 'image/x-fuji-raf',
  ORF: 'image/x-olympus-orf',
  RW2: 'image/x-panasonic-rw2',
  PEF: 'image/x-pentax-pef',
  DNG: 'image/x-adobe-dng',
  X3F: 'image/x-sigma-x3f',
  '3FR': 'image/x-hasselblad-3fr',
  FFF: 'image/x-hasselblad-fff',
  IIQ: 'image/x-phaseone-iiq',
  ERF: 'image/x-epson-erf',
  KDC: 'image/x-kodak-kdc',
  MEF: 'image/x-mamiya-mef',
  MOS: 'image/x-leaf-mos',
  MRW: 'image/x-minolta-mrw',
  RWL: 'image/x-leica-rwl',
  DCR: 'image/x-kodak-dcr',
  BAY: 'image/x-casio-bay',
  GPR: 'image/x-gopro-gpr',
  JP2: 'image/jp2',
  J2K: 'image/jp2',
  JPF: 'image/jp2',
  JPM: 'image/jp2',
  JXR: 'image/jxr',
  HDP: 'image/jxr',
  WDP: 'image/jxr',
  DDS: 'image/vnd-ms.dds',
  EXR: 'image/x-exr',
  HDR: 'image/vnd.radiance',
  PIC: 'image/x-pict',
  PCT: 'image/x-pict',
  PCX: 'image/x-pcx',
  TGA: 'image/x-tga',
  ICNS: 'image/x-icns',
};

const extensionToVideoMime: Record<string, string> = {
  MP4: 'video/mp4',
  M4V: 'video/mp4',
  MOV: 'video/quicktime',
  QT: 'video/quicktime',
  WEBM: 'video/webm',
  MKV: 'video/x-matroska',
  MKA: 'video/x-matroska',
  MKS: 'video/x-matroska',
  AVI: 'video/x-msvideo',
  DIVX: 'video/x-msvideo',
  XVID: 'video/x-msvideo',
  WMV: 'video/x-ms-wmv',
  ASF: 'video/x-ms-asf',
  ASX: 'video/x-ms-asf',
  MPG: 'video/mpeg',
  MPEG: 'video/mpeg',
  MPE: 'video/mpeg',
  MPV: 'video/mpeg',
  M2V: 'video/mpeg',
  M2P: 'video/mpeg',
  MTS: 'video/mp2t',
  M2TS: 'video/mp2t',
  TS: 'video/mp2t',
  VOB: 'video/dvd',
  EVO: 'video/mp2t',
  MOD: 'video/mp2t',
  TOD: 'video/mp2t',
  '3GP': 'video/3gpp',
  '3G2': 'video/3gpp2',
  F4V: 'video/x-f4v',
  F4P: 'video/mp4',
  F4A: 'video/mp4',
  F4B: 'video/mp4',
  FLV: 'video/x-flv',
  SWF: 'application/x-shockwave-flash',
  OGV: 'video/ogg',
  OGM: 'video/ogg',
  RM: 'application/vnd.rn-realmedia',
  RMVB: 'application/vnd.rn-realmedia-vbr',
  RV: 'video/vnd.rn-realvideo',
  DAT: 'video/mpeg',
  MXF: 'application/mxf',
  GXF: 'application/gxf',
  LXF: 'video/mp2t',
  NUT: 'video/x-nut',
  DV: 'video/x-dv',
  DIF: 'video/x-dv',
  Y4M: 'video/x-yuv4mpeg',
  H264: 'video/h264',
  '264': 'video/h264',
  H265: 'video/h265',
  '265': 'video/h265',
  HEVC: 'video/h265',
  AV1: 'video/av1',
  VP8: 'video/x-vnd.on2.vp8',
  VP9: 'video/x-vnd.on2.vp9',
  R3D: 'video/x-r3d',
  BRAW: 'video/x-braw',
  CINE: 'application/octet-stream',
  ARI: 'application/octet-stream',
  ARX: 'application/octet-stream',
  MJP2: 'video/mj2',
  MJ2: 'video/mj2',
};

export const normalizeMediaMimeType = (file: File, type: 'photo' | 'video') => {
  const extension = getFileExtension(file.name);

  if (type === 'photo') {
    const photoMime = extensionToPhotoMime[extension];
    if (photoMime) return photoMime;
    if (file.type && file.type.startsWith('image/')) {
      return file.type;
    }
    return 'image/jpeg';
  } else if (type === 'video') {
    const normalized = extensionToVideoMime[extension];
    if (normalized) return normalized;
  }

  if (file.type && file.type !== 'application/octet-stream') {
    return file.type;
  }

  return 'video/mp4';
};

const RAW_EXTENSIONS = new Set([
  'RAW',
  'CR2',
  'CR3',
  'NEF',
  'NRW',
  'ARW',
  'SR2',
  'SRF',
  'RAF',
  'ORF',
  'RW2',
  'PEF',
  'DNG',
  'X3F',
  '3FR',
  'FFF',
  'IIQ',
  'ERF',
  'KDC',
  'MEF',
  'MOS',
  'MRW',
  'RWL',
  'DCR',
  'BAY',
  'GPR',
  'HEIC',
  'HEIF',
]);

/**
 * Filter and sort vault media items according to chosen filters and sorting strategy.
 */
export function filterAndSortMedia(
  items: VaultItem[],
  filter: MediaFilterType,
  sort: MediaSortType,
): VaultItem[] {
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  // 1. Filter
  const filtered = items.filter((item) => {
    switch (filter) {
      case 'favorites':
        return Boolean(item.isPinned);
      case 'live':
        return (
          item.metadata?.isLiveCapture === true ||
          item.metadata?.isLiveCapture === 'true' ||
          item.metadata?.isLiveCapture === 1
        );
      case '4k': {
        const w = Number(item.metadata?.width || 0);
        const h = Number(item.metadata?.height || 0);
        return Math.max(w, h) >= 1920 || Math.min(w, h) >= 1080;
      }
      case 'raw': {
        const ext = getFileExtension(item.title);
        const mime = (item.metadata?.mimeType || '').toLowerCase();
        return (
          RAW_EXTENSIONS.has(ext) ||
          mime.includes('heic') ||
          mime.includes('heif') ||
          mime.includes('raw') ||
          mime.includes('photoshop')
        );
      }
      case 'recent':
        return item.createdAt && now - item.createdAt <= SEVEN_DAYS_MS;
      case 'all':
      default:
        return true;
    }
  });

  // 2. Sort
  return [...filtered].sort((a, b) => {
    // Always prioritize pinned if user hasn't explicitly picked a non-date sort
    if (sort === 'date-desc' || sort === 'date-asc') {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
        return a.isPinned ? -1 : 1;
      }
    }

    switch (sort) {
      case 'date-asc': {
        const timeA = a.createdAt || 0;
        const timeB = b.createdAt || 0;
        return timeA - timeB;
      }
      case 'name-asc':
        return (a.title || '').localeCompare(b.title || '', undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      case 'name-desc':
        return (b.title || '').localeCompare(a.title || '', undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      case 'size-desc': {
        const sizeA = Number(
          a.metadata?.size ||
            (typeof a.content === 'string' ? a.content.length : a.content?.byteLength || 0),
        );
        const sizeB = Number(
          b.metadata?.size ||
            (typeof b.content === 'string' ? b.content.length : b.content?.byteLength || 0),
        );
        return sizeB - sizeA;
      }
      case 'size-asc': {
        const sizeA = Number(
          a.metadata?.size ||
            (typeof a.content === 'string' ? a.content.length : a.content?.byteLength || 0),
        );
        const sizeB = Number(
          b.metadata?.size ||
            (typeof b.content === 'string' ? b.content.length : b.content?.byteLength || 0),
        );
        return sizeA - sizeB;
      }
      case 'date-desc':
      default: {
        const timeA = a.createdAt || 0;
        const timeB = b.createdAt || 0;
        return timeB - timeA;
      }
    }
  });
}

/**
 * Groups items into date timeline sections (Today, Yesterday, This Month, Month Year).
 */
export function groupMediaByTimeline(items: VaultItem[]): TimelineGroup[] {
  if (items.length === 0) return [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

  const groupsMap = new Map<
    string,
    { label: string; subLabel?: string; items: VaultItem[]; order: number }
  >();

  for (const item of items) {
    const timestamp = item.createdAt || item.updatedAt || Date.now();
    const date = new Date(timestamp);

    let groupKey: string;
    let label: string;
    let subLabel: string | undefined;
    let order: number;

    if (timestamp >= todayStart) {
      groupKey = 'today';
      label = 'Today';
      subLabel = date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
      order = 1;
    } else if (timestamp >= yesterdayStart) {
      groupKey = 'yesterday';
      label = 'Yesterday';
      subLabel = date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
      order = 2;
    } else if (timestamp >= startOfYear) {
      // Month in current year, e.g. "August 2026"
      const monthYear = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      groupKey = `month-${date.getFullYear()}-${date.getMonth()}`;
      label = monthYear;
      order = 100 + (11 - date.getMonth());
    } else {
      // Previous years, e.g. "July 2025"
      const monthYear = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      groupKey = `month-${date.getFullYear()}-${date.getMonth()}`;
      label = monthYear;
      order = 1000 + (3000 - date.getFullYear()) * 12 + (11 - date.getMonth());
    }

    if (!groupsMap.has(groupKey)) {
      groupsMap.set(groupKey, { label, subLabel, items: [], order });
    }
    groupsMap.get(groupKey)!.items.push(item);
  }

  // Convert to ordered list
  return Array.from(groupsMap.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([id, grp]) => ({
      id,
      label: grp.label,
      subLabel: grp.subLabel,
      items: grp.items,
    }));
}
