import { decryptToFile, detectMimeTypeFromBytes, base64ToUint8Array } from './encryption';
import { VaultItem } from './storage';
import { resolveApiBaseUrl } from './apiBaseUrl';
import { getAuthToken } from './auth-session';
import { resolveRuntimeOrigin } from './sync/core';
import {
  getAudioMimeType,
  AUDIO_MIME_MAP,
  getDocumentMimeType,
  DOCUMENT_MIME_MAP,
} from './fileHandling';

const API_BASE_URL = resolveApiBaseUrl();

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);
const isBlobOrDataUrl = (value: string): boolean => /^(blob:|data:)/i.test(value);
const looksLikeServerPath = (value: string): boolean =>
  value.startsWith('/uploads/') ||
  value.startsWith('uploads/') ||
  value.startsWith('/api/') ||
  value.startsWith('api/') ||
  value.startsWith('cloud://') ||
  value.startsWith('gridfs://');

const isLikelyEncryptedString = (value: string): boolean => {
  let normalized = value.trim();
  if (!normalized || normalized.length < 16) {
    return false;
  }
  if (normalized.startsWith('V2_ENC:')) {
    normalized = normalized.substring(7).trim();
  }
  normalized = normalized.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  return /^[A-Za-z0-9+/=]+$/.test(normalized);
};

const looksLikeReadableMediaBytes = (bytes: Uint8Array, mimeType?: string): boolean => {
  if (!bytes || bytes.length < 4) return false;

  const mt = (mimeType || '').toLowerCase();
  const isLikelyVideo = !mt || mt.startsWith('video/');
  const isLikelyAudio = !mt || mt.startsWith('audio/');

  // PDF
  if (
    (mt.includes('application/pdf') || !mt) &&
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return true;
  }

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

  // BMP / DIB: BM
  if (
    (mt.includes('image/bmp') || !mt) &&
    bytes.length >= 2 &&
    bytes[0] === 0x42 &&
    bytes[1] === 0x4d
  ) {
    return true;
  }

  // TIFF / TIF / DNG / CR2 / NEF / NRW / ARW / SR2 / SRF / PEF / 3FR / FFF / IIQ / ERF / KDC / MEF / MOS / RWL / DCR / BAY / GPR
  if (
    (mt.includes('image/tiff') || mt.includes('image/x-') || !mt) &&
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))
  ) {
    return true;
  }

  // Fuji RAF
  if (
    bytes.length >= 15 &&
    bytes[0] === 0x46 &&
    bytes[1] === 0x55 &&
    bytes[2] === 0x4a &&
    bytes[3] === 0x49
  ) {
    return true;
  }

  // Olympus ORF
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x52 && bytes[3] === 0x4f) ||
      (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x52 && bytes[3] === 0x53))
  ) {
    return true;
  }

  // Panasonic RW2
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x55 &&
    bytes[3] === 0x00
  ) {
    return true;
  }

  // Sigma X3F
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x46 &&
    bytes[1] === 0x4f &&
    bytes[2] === 0x56 &&
    bytes[3] === 0x62
  ) {
    return true;
  }

  // Photoshop PSD: 8BPS
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x38 &&
    bytes[1] === 0x42 &&
    bytes[2] === 0x50 &&
    bytes[3] === 0x53
  ) {
    return true;
  }

  // ICO / CUR
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    (bytes[2] === 0x01 || bytes[2] === 0x02) &&
    bytes[3] === 0x00
  ) {
    return true;
  }

  // JPEG 2000 (JP2, J2K, JPF, JPM)
  if (
    (bytes.length >= 8 &&
      bytes[0] === 0x00 &&
      bytes[1] === 0x00 &&
      bytes[2] === 0x00 &&
      bytes[3] === 0x0c &&
      bytes[4] === 0x6a &&
      bytes[5] === 0x50) ||
    (bytes.length >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0x4f &&
      bytes[2] === 0xff &&
      bytes[3] === 0x51)
  ) {
    return true;
  }

  // JPEG XR (JXR, HDP, WDP)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0xbc &&
    (bytes[3] === 0x01 || bytes[3] === 0x00)
  ) {
    return true;
  }

  // DDS
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x44 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x53 &&
    bytes[3] === 0x20
  ) {
    return true;
  }

  // OpenEXR
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x76 &&
    bytes[1] === 0x2f &&
    bytes[2] === 0x31 &&
    bytes[3] === 0x01
  ) {
    return true;
  }

  // Radiance HDR
  if (
    bytes.length >= 10 &&
    bytes[0] === 0x23 &&
    bytes[1] === 0x3f &&
    (bytes[2] === 0x52 || bytes[2] === 0x72)
  ) {
    return true;
  }

  // Apple ICNS
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x69 &&
    bytes[1] === 0x63 &&
    bytes[2] === 0x6e &&
    bytes[3] === 0x73
  ) {
    return true;
  }

  // SVGZ
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return true;
  }

  // AAC ADTS: 0xFF 0xF...
  if (isLikelyAudio && bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf0) === 0xf0) {
    return true;
  }

  // AIFF: FORM....AIFF or FORM....AIFC
  if (
    isLikelyAudio &&
    bytes.length >= 12 &&
    bytes[0] === 0x46 &&
    bytes[1] === 0x4f &&
    bytes[2] === 0x52 &&
    bytes[3] === 0x4d &&
    bytes[8] === 0x41 &&
    bytes[9] === 0x49 &&
    bytes[10] === 0x46 &&
    (bytes[11] === 0x46 || bytes[11] === 0x43)
  ) {
    return true;
  }

  // AMR: #!AMR
  if (
    isLikelyAudio &&
    bytes.length >= 6 &&
    bytes[0] === 0x23 &&
    bytes[1] === 0x21 &&
    bytes[2] === 0x41 &&
    bytes[3] === 0x4d &&
    bytes[4] === 0x52
  ) {
    return true;
  }

  // AU / SND: .snd
  if (
    isLikelyAudio &&
    bytes.length >= 4 &&
    bytes[0] === 0x2e &&
    bytes[1] === 0x73 &&
    bytes[2] === 0x6e &&
    bytes[3] === 0x64
  ) {
    return true;
  }

  // VOC: Creative Voice File
  if (
    isLikelyAudio &&
    bytes.length >= 8 &&
    bytes[0] === 0x43 &&
    bytes[1] === 0x72 &&
    bytes[2] === 0x65 &&
    bytes[3] === 0x61
  ) {
    return true;
  }

  // RealAudio: .RMF or .ra
  if (
    isLikelyAudio &&
    bytes.length >= 4 &&
    bytes[0] === 0x2e &&
    ((bytes[1] === 0x52 && bytes[2] === 0x4d && bytes[3] === 0x46) ||
      (bytes[1] === 0x72 && bytes[2] === 0x61))
  ) {
    return true;
  }

  // AC3: 0x0B 0x77
  if (isLikelyAudio && bytes.length >= 2 && bytes[0] === 0x0b && bytes[1] === 0x77) {
    return true;
  }

  // DTS: 0x7F 0xFE 0x80 0x01
  if (
    isLikelyAudio &&
    bytes.length >= 4 &&
    bytes[0] === 0x7f &&
    bytes[1] === 0xfe &&
    bytes[2] === 0x80 &&
    bytes[3] === 0x01
  ) {
    return true;
  }

  // DSD / DSF: "DSD "
  if (
    isLikelyAudio &&
    bytes.length >= 4 &&
    bytes[0] === 0x44 &&
    bytes[1] === 0x53 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x20
  ) {
    return true;
  }

  // WavPack: "wvpk"
  if (
    isLikelyAudio &&
    bytes.length >= 4 &&
    bytes[0] === 0x77 &&
    bytes[1] === 0x76 &&
    bytes[2] === 0x70 &&
    bytes[3] === 0x6b
  ) {
    return true;
  }

  // Monkey's Audio: "MAC "
  if (
    isLikelyAudio &&
    bytes.length >= 4 &&
    bytes[0] === 0x4d &&
    bytes[1] === 0x41 &&
    bytes[2] === 0x43 &&
    bytes[3] === 0x20
  ) {
    return true;
  }

  // TAK: "tBaK"
  if (
    isLikelyAudio &&
    bytes.length >= 4 &&
    bytes[0] === 0x74 &&
    bytes[1] === 0x42 &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x4b
  ) {
    return true;
  }

  // TTA: "TTA1"
  if (
    isLikelyAudio &&
    bytes.length >= 4 &&
    bytes[0] === 0x54 &&
    bytes[1] === 0x54 &&
    bytes[2] === 0x41 &&
    bytes[3] === 0x31
  ) {
    return true;
  }

  // CAF: "caff"
  if (
    isLikelyAudio &&
    bytes.length >= 4 &&
    bytes[0] === 0x63 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x66 &&
    bytes[3] === 0x66
  ) {
    return true;
  }

  // MIDI: "MThd"
  if (
    isLikelyAudio &&
    bytes.length >= 4 &&
    bytes[0] === 0x4d &&
    bytes[1] === 0x54 &&
    bytes[2] === 0x68 &&
    bytes[3] === 0x64
  ) {
    return true;
  }

  // SVG: <svg or <?xml
  if ((mt.includes('image/svg') || !mt) && bytes.length >= 5) {
    const textStart = String.fromCharCode(...bytes.slice(0, 100))
      .trim()
      .toLowerCase();
    if (
      textStart.startsWith('<svg') ||
      textStart.startsWith('<?xml') ||
      textStart.includes('<svg')
    ) {
      return true;
    }
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

  // If item is audio or has an audio extension, use comprehensive audio mime lookup
  if (item.type === 'audio' || (ext && AUDIO_MIME_MAP[ext])) {
    return getAudioMimeType(filename);
  }

  // If item is document or has a document extension, use comprehensive document mime lookup
  if (item.type === 'document' || (ext && DOCUMENT_MIME_MAP[ext])) {
    return getDocumentMimeType(filename);
  }

  switch (ext) {
    // Video
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'mov':
    case 'qt':
      return 'video/quicktime';
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
    case 'divx':
      return 'video/x-msvideo';
    case 'wmv':
    case 'asf':
      return 'video/x-ms-wmv';
    case 'flv':
    case 'f4v':
      return 'video/x-flv';
    case '3gp':
    case '3g2':
      return 'video/3gpp';
    case 'ogv':
    case 'ogm':
      return 'video/ogg';
    case 'ts':
    case 'mts':
    case 'm2ts':
      return 'video/mp2t';

    // Photo / Image
    case 'png':
      return 'image/png';
    case 'apng':
      return 'image/apng';
    case 'jpg':
    case 'jpeg':
    case 'jpe':
    case 'jfif':
    case 'pjpeg':
    case 'pjp':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'svg':
    case 'svgz':
      return 'image/svg+xml';
    case 'bmp':
    case 'dib':
      return 'image/bmp';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'ico':
    case 'cur':
      return 'image/x-icon';
    case 'psd':
      return 'image/vnd.adobe.photoshop';
    case 'raw':
      return 'image/x-dcraw';
    case 'cr2':
      return 'image/x-canon-cr2';
    case 'cr3':
      return 'image/x-canon-cr3';
    case 'nef':
      return 'image/x-nikon-nef';
    case 'nrw':
      return 'image/x-nikon-nrw';
    case 'arw':
      return 'image/x-sony-arw';
    case 'sr2':
      return 'image/x-sony-sr2';
    case 'srf':
      return 'image/x-sony-srf';
    case 'raf':
      return 'image/x-fuji-raf';
    case 'orf':
      return 'image/x-olympus-orf';
    case 'rw2':
      return 'image/x-panasonic-rw2';
    case 'pef':
      return 'image/x-pentax-pef';
    case 'dng':
      return 'image/x-adobe-dng';
    case 'x3f':
      return 'image/x-sigma-x3f';
    case '3fr':
      return 'image/x-hasselblad-3fr';
    case 'fff':
      return 'image/x-hasselblad-fff';
    case 'iiq':
      return 'image/x-phaseone-iiq';
    case 'erf':
      return 'image/x-epson-erf';
    case 'kdc':
      return 'image/x-kodak-kdc';
    case 'mef':
      return 'image/x-mamiya-mef';
    case 'mos':
      return 'image/x-leaf-mos';
    case 'mrw':
      return 'image/x-minolta-mrw';
    case 'rwl':
      return 'image/x-leica-rwl';
    case 'dcr':
      return 'image/x-kodak-dcr';
    case 'bay':
      return 'image/x-casio-bay';
    case 'gpr':
      return 'image/x-gopro-gpr';
    case 'jp2':
    case 'j2k':
    case 'jpf':
    case 'jpm':
      return 'image/jp2';
    case 'jxr':
    case 'hdp':
    case 'wdp':
      return 'image/jxr';
    case 'dds':
      return 'image/vnd-ms.dds';
    case 'exr':
      return 'image/x-exr';
    case 'hdr':
      return 'image/vnd.radiance';
    case 'pic':
    case 'pct':
      return 'image/x-pict';
    case 'pcx':
      return 'image/x-pcx';
    case 'tga':
      return 'image/x-tga';
    case 'icns':
      return 'image/x-icns';

    default:
      if (item.type === 'video') return 'video/mp4';
      if (item.type === 'photo') return 'image/jpeg';
      return undefined;
  }
};

const resolveServerFileUrl = (value: string): string => {
  if (isBlobOrDataUrl(value)) {
    return value;
  }
  let targetUrl: string;
  if (isAbsoluteUrl(value)) {
    try {
      const u = new URL(value);
      if (
        u.pathname.includes('/api/vault/files/access/') ||
        u.pathname.includes('/api/vault/media/')
      ) {
        const apiBase = new URL(API_BASE_URL, resolveRuntimeOrigin());
        u.protocol = apiBase.protocol;
        u.host = apiBase.host;
        targetUrl = u.toString();
      } else {
        targetUrl = value;
      }
    } catch {
      targetUrl = value;
    }
  } else if (value.startsWith('cloud://') || value.startsWith('gridfs://')) {
    const rawId = value.replace(/^(cloud|gridfs):\/\//, '');
    targetUrl = `${API_BASE_URL}/api/vault/files/access/${encodeURIComponent(rawId)}`;
  } else {
    targetUrl = `${API_BASE_URL}${value.startsWith('/') ? value : `/${value}`}`;
  }

  const jwt = getAuthToken();
  if (jwt && targetUrl.includes('/api/vault/files/access/')) {
    try {
      const parsed = new URL(targetUrl, resolveRuntimeOrigin());
      if (!parsed.searchParams.has('auth_token')) {
        parsed.searchParams.set('auth_token', jwt);
      }
      return parsed.toString();
    } catch {
      // Fallback to targetUrl
    }
  }

  return targetUrl;
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
  const effectiveMimeType = mimeType || inferMimeTypeFromItem(item);

  // 1. Direct in-memory blob: or data: URL
  if (typeof item.content === 'string' && isBlobOrDataUrl(item.content)) {
    return item.content;
  }

  // 2. Direct in-memory Uint8Array
  if (item.content instanceof Uint8Array) {
    if (looksLikeReadableMediaBytes(item.content, effectiveMimeType)) {
      const detected = detectMimeTypeFromBytes(item.content);
      const resolvedMime = detected !== 'application/octet-stream' ? detected : effectiveMimeType;
      const normalizedMime = resolvedMime === 'video/quicktime' ? 'video/mp4' : resolvedMime;
      const blob = new Blob([new Uint8Array(item.content)], {
        type: normalizedMime || (item.type === 'video' ? 'video/mp4' : 'application/octet-stream'),
      });
      return URL.createObjectURL(blob);
    }
    return await decryptToFile(item.content, masterKey, effectiveMimeType, rsaPrivateKey);
  }

  // 3. Direct in-memory Base64 encrypted string
  if (typeof item.content === 'string' && isLikelyEncryptedString(item.content)) {
    const rawBytes = base64ToUint8Array(item.content);
    if (rawBytes.length > 0) {
      try {
        const decryptedUrl = await decryptToFile(
          rawBytes,
          masterKey,
          effectiveMimeType,
          rsaPrivateKey
        );
        if (decryptedUrl) return decryptedUrl;
      } catch {
        // Fallback
      }
    }
  }

  // 4. Server/Cloud file reference (cloud://, gridfs://, /api/vault/files/access/, /uploads/, etc.)
  const candidateServerUrl = getVaultItemFileUrl(item);
  if (candidateServerUrl) {
    try {
      const response = await fetch(candidateServerUrl);
      if (response.ok) {
        const arrayBuf = await response.arrayBuffer();
        if (arrayBuf.byteLength > 0) {
          const u8 = new Uint8Array(arrayBuf);
          if (looksLikeReadableMediaBytes(u8, effectiveMimeType)) {
            const detected = detectMimeTypeFromBytes(u8);
            const resolvedMime =
              detected !== 'application/octet-stream' ? detected : effectiveMimeType;
            const normalizedMime = resolvedMime === 'video/quicktime' ? 'video/mp4' : resolvedMime;
            const blob = new Blob([u8], {
              type:
                normalizedMime ||
                (item.type === 'video' ? 'video/mp4' : 'application/octet-stream'),
            });
            return URL.createObjectURL(blob);
          }
          const decryptedUrl = await decryptToFile(u8, masterKey, effectiveMimeType, rsaPrivateKey);
          if (decryptedUrl) return decryptedUrl;
        }
      }
    } catch {
      // Fallback to signed URL
    }
  }

  // 5. Fallback: Fetch via server signed URL and decrypt
  try {
    const { getSignedUrl } = await import('./sync/media');
    const signedUrl = await getSignedUrl(item.id, 'view');
    const response = await fetch(signedUrl);
    if (response.ok) {
      const encryptedBlob = await response.blob();
      if (encryptedBlob.size > 0) {
        const u8 = new Uint8Array(await encryptedBlob.arrayBuffer());
        if (looksLikeReadableMediaBytes(u8, effectiveMimeType)) {
          const detected = detectMimeTypeFromBytes(u8);
          const resolvedMime =
            detected !== 'application/octet-stream' ? detected : effectiveMimeType;
          const normalizedMime = resolvedMime === 'video/quicktime' ? 'video/mp4' : resolvedMime;
          const blob = new Blob([u8], {
            type:
              normalizedMime || (item.type === 'video' ? 'video/mp4' : 'application/octet-stream'),
          });
          return URL.createObjectURL(blob);
        }
        return await decryptToFile(u8, masterKey, effectiveMimeType, rsaPrivateKey);
      }
    }
  } catch {
    // Ignore server signed URL fallback error
  }

  // 6. Generic string decrypt fallback
  if (typeof item.content === 'string') {
    return decryptToFile(item.content, masterKey, effectiveMimeType, rsaPrivateKey);
  }

  return null;
};

/** True when the item points at a server-side file (disk / signed URL pipeline). E2EE-only items return false. */
export const vaultItemHasServerFileReference = (item: VaultItem): boolean =>
  normalizeMetadata(item.metadata)?.isE2EE !== true &&
  normalizeMetadata(item.metadata)?.clientEncrypted !== true &&
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
