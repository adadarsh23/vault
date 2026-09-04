import multer from 'multer';
import { AppError } from './appError.ts';
const uploadRoot = 'cloud-only';
const maxFileSize = Number(process.env.MAX_FILE_SIZE_MB || 4096) * 1024 * 1024;
export const maxUploadFileSizeBytes = maxFileSize;

const photoExtensions = new Set([
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

const videoExtensions = new Set([
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
  'swf',
  'ogv',
  'ogm',
  'rm',
  'rmvb',
  'rv',
  'dat',
  'mxf',
  'gxf',
  'lxf',
  'nut',
  'dv',
  'dif',
  'y4m',
  'h264',
  '264',
  'h265',
  '265',
  'hevc',
  'av1',
  'vp8',
  'vp9',
  'r3d',
  'braw',
  'cine',
  'ari',
  'arx',
  'mjp2',
  'mj2',
]);

const audioExtensions = new Set([
  'mp3',
  'mp2',
  'mp1',
  'm4a',
  'm4b',
  'm4p',
  'aac',
  'wav',
  'wave',
  'bwf',
  'aif',
  'aiff',
  'aifc',
  'flac',
  'alac',
  'ape',
  'mac',
  'wv',
  'wvc',
  'wma',
  'ogg',
  'oga',
  'opus',
  'spx',
  'webm',
  'amr',
  'awb',
  '3ga',
  'au',
  'snd',
  'voc',
  'ra',
  'ram',
  'rm',
  'mka',
  'ac3',
  'eac3',
  'dts',
  'dtshd',
  'thd',
  'mlp',
  'pcm',
  'lpcm',
  'dsd',
  'dff',
  'dsf',
  'tak',
  'tta',
  'mpc',
  'mp+',
  'aa',
  'aax',
  'caf',
  'qcp',
  'gsm',
  'adts',
  'mid',
  'midi',
  'rmi',
  'kar',
  'it',
  'xm',
  's3m',
  'mod',
  'mtm',
  'umx',
]);

const documentExtensions = new Set([
  'pdf',
  'fdf',
  'xfdf',
  'doc',
  'docx',
  'docm',
  'dot',
  'dotx',
  'dotm',
  'rtf',
  'odt',
  'ott',
  'pages',
  'wpd',
  'wps',
  'txt',
  'text',
  'log',
  'md',
  'markdown',
  'rst',
  'org',
  'tex',
  'latex',
  'csv',
  'tsv',
  'psv',
  'ssv',
  'json',
  'jsonl',
  'ndjson',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'conf',
  'cfg',
  'properties',
  'sql',
  'xls',
  'xlsx',
  'xlsm',
  'xlsb',
  'xlt',
  'xltx',
  'xltm',
  'ods',
  'ots',
  'numbers',
  'ppt',
  'pptx',
  'pptm',
  'pps',
  'ppsx',
  'pot',
  'potx',
  'potm',
  'odp',
  'otp',
  'key',
  'epub',
  'mobi',
  'azw',
  'azw3',
  'fb2',
  'lrf',
  'djvu',
  'chm',
  'xps',
  'oxps',
  'tif',
  'tiff',
  'zip',
  '7z',
  'rar',
  'tar',
  'gz',
  'bz2',
  'xz',
]);

const blockedDocumentExtensions = new Set([
  'exe',
  'dll',
  'js',
  'vbs',
  'bat',
  'cmd',
  'sh',
  'msi',
  'com',
  'scr',
  'jar',
  'ps1',
  'reg',
  'app',
]);

const allowedMimeTypes: Record<string, string[]> = {
  photo: ['image/*'],
  video: ['video/*', 'application/mxf'],
  audio: ['audio/*', 'application/ogg'],
  document: ['text/*', 'application/*'],
  'other-files': [],
};

export const getFileExtension = (name: string): string => {
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex < 0 || dotIndex === name.length - 1) {
    return '';
  }

  return name.slice(dotIndex + 1).toLowerCase();
};

const hasPrefix = (buffer: Buffer, bytes: number[]): boolean =>
  buffer.length >= bytes.length && bytes.every((value, idx) => buffer[idx] === value);

const containsAsciiAt = (buffer: Buffer, offset: number, value: string): boolean =>
  buffer.length >= offset + value.length &&
  buffer.subarray(offset, offset + value.length).toString('ascii') === value;

const isLikelyPhotoBinary = (buffer: Buffer): boolean => {
  if (!buffer.length) return false;
  // JPEG / JPG / JPE / JFIF / PJPEG / PJP
  if (hasPrefix(buffer, [0xff, 0xd8, 0xff])) return true;
  // PNG / APNG
  if (hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return true;
  // GIF (GIF87a / GIF89a)
  if (containsAsciiAt(buffer, 0, 'GIF87a') || containsAsciiAt(buffer, 0, 'GIF89a')) return true;
  // BMP / DIB
  if (containsAsciiAt(buffer, 0, 'BM')) return true;
  // TIFF / TIF / DNG / CR2 / NEF / NRW / ARW / SR2 / SRF / PEF / 3FR / FFF / IIQ / ERF / KDC / MEF / MOS / RWL / DCR / BAY / GPR
  if (
    hasPrefix(buffer, [0x49, 0x49, 0x2a, 0x00]) || // II*\0
    hasPrefix(buffer, [0x4d, 0x4d, 0x00, 0x2a]) // MM\0*
  ) {
    return true;
  }
  // Fuji RAW (RAF)
  if (containsAsciiAt(buffer, 0, 'FUJIFILMCCD-RAW')) return true;
  // Olympus RAW (ORF)
  if (
    containsAsciiAt(buffer, 0, 'IIRO') ||
    containsAsciiAt(buffer, 0, 'MMOR') ||
    containsAsciiAt(buffer, 0, 'IIRS')
  ) {
    return true;
  }
  // Panasonic RAW (RW2)
  if (hasPrefix(buffer, [0x49, 0x49, 0x55, 0x00])) return true;
  // Minolta RAW (MRW)
  if (hasPrefix(buffer, [0x00, 0x4d, 0x52, 0x4d])) return true;
  // Sigma RAW (X3F)
  if (containsAsciiAt(buffer, 0, 'FOVb')) return true;
  // WebP: RIFF....WEBP
  if (containsAsciiAt(buffer, 0, 'RIFF') && containsAsciiAt(buffer, 8, 'WEBP')) return true;
  // HEIC / HEIF / AVIF / CR3 (ISO Base Media File Format brands)
  if (containsAsciiAt(buffer, 4, 'ftyp')) {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (
      [
        'heic',
        'heix',
        'hevc',
        'hevx',
        'heif',
        'heim',
        'heis',
        'hevm',
        'hevs',
        'mif1',
        'msf1',
        'avif',
        'avis',
        'crx ',
        'crx',
      ].some((b) => brand.startsWith(b.trim()))
    ) {
      return true;
    }
  }
  // ICO / CUR
  if (
    (hasPrefix(buffer, [0x00, 0x00, 0x01, 0x00]) || hasPrefix(buffer, [0x00, 0x00, 0x02, 0x00])) &&
    buffer.length >= 6
  ) {
    return true;
  }
  // Photoshop PSD
  if (containsAsciiAt(buffer, 0, '8BPS')) return true;
  // JPEG 2000 (JP2, J2K, JPF, JPM)
  if (
    hasPrefix(buffer, [0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20]) || // \x00\x00\x00\x0cjP\x20\x20
    hasPrefix(buffer, [0xff, 0x4f, 0xff, 0x51]) // J2K codestream SOC marker
  ) {
    return true;
  }
  // JPEG XR / HD Photo (JXR, HDP, WDP)
  if (hasPrefix(buffer, [0x49, 0x49, 0xbc, 0x01]) || hasPrefix(buffer, [0x49, 0x49, 0xbc, 0x00])) {
    return true;
  }
  // DirectDraw Surface (DDS)
  if (containsAsciiAt(buffer, 0, 'DDS ')) return true;
  // OpenEXR (EXR)
  if (hasPrefix(buffer, [0x76, 0x2f, 0x31, 0x01])) return true;
  // Radiance HDR (HDR / PIC)
  if (containsAsciiAt(buffer, 0, '#?RADIANCE') || containsAsciiAt(buffer, 0, '#?RGBE')) {
    return true;
  }
  // Apple Icon (ICNS)
  if (containsAsciiAt(buffer, 0, 'icns')) return true;
  // ZSoft PCX
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x0a &&
    [0, 2, 3, 4, 5].includes(buffer[1]) &&
    buffer[2] === 0x01
  ) {
    return true;
  }
  // SVGZ (GZIP compressed SVG)
  if (hasPrefix(buffer, [0x1f, 0x8b])) return true;
  // SVG: Inspect text for <svg or <?xml
  if (buffer.length >= 5) {
    const head = buffer
      .subarray(0, Math.min(buffer.length, 1024))
      .toString('utf8')
      .trim()
      .toLowerCase();
    if (head.includes('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
      return true;
    }
  }
  // Mac PICT (PCT, PIC) - standard PICT v1/v2 header at offset 512
  if (buffer.length >= 522) {
    if (
      (buffer[512] === 0x00 &&
        buffer[513] === 0x11 &&
        buffer[514] === 0x02 &&
        buffer[515] === 0xff) ||
      (buffer[512] === 0x11 && buffer[513] === 0x01)
    ) {
      return true;
    }
  }
  // Client-encrypted payload or envelope
  if (isLikelyEncryptedBinary(buffer)) {
    return true;
  }
  return false;
};

const isLikelyEncryptedBinary = (buffer: Buffer): boolean => {
  if (!buffer || buffer.length < 6) return false;
  // VCAS01 binary cascade cipher envelope
  if (hasPrefix(buffer, [0x56, 0x43, 0x41, 0x53, 0x30, 0x31])) return true;
  // Text-based encrypted payload, JSON envelope, or V2 modern token
  if (buffer.length >= 16) {
    const textSample = buffer.subarray(0, Math.min(buffer.length, 128)).toString('utf8');
    if (
      textSample.startsWith('V2_ENC:') ||
      textSample.startsWith('V2_MODERN:') ||
      textSample.includes('"iv"') ||
      textSample.includes('"wrappedDek"') ||
      textSample.includes('"encryptedData"') ||
      textSample.includes('"payload"')
    ) {
      return true;
    }
  }
  return false;
};

const isLikelyVideoBinary = (buffer: Buffer): boolean => {
  if (!buffer.length) return false;
  // Encrypted vault video payload
  if (isLikelyEncryptedBinary(buffer)) return true;
  // Any ISO Base Media File Format (MP4, MOV, M4V, 3GP, 3G2, F4V, etc.)
  if (containsAsciiAt(buffer, 4, 'ftyp') || containsAsciiAt(buffer, 0, 'ftyp')) return true;
  // QuickTime movie atoms at offset 4 (moov, mdat, wide, free, skip)
  if (
    containsAsciiAt(buffer, 4, 'moov') ||
    containsAsciiAt(buffer, 4, 'mdat') ||
    containsAsciiAt(buffer, 4, 'wide') ||
    containsAsciiAt(buffer, 4, 'free') ||
    containsAsciiAt(buffer, 4, 'skip')
  ) {
    return true;
  }
  // Matroska / WebM EBML
  if (hasPrefix(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return true;
  // AVI
  if (containsAsciiAt(buffer, 0, 'RIFF') && containsAsciiAt(buffer, 8, 'AVI ')) return true;
  // FLV
  if (containsAsciiAt(buffer, 0, 'FLV')) return true;
  // MPEG-TS
  if (buffer[0] === 0x47 && (buffer.length <= 188 || buffer[188] === 0x47)) return true;
  // MPEG-PS / VOB / MPG
  if (hasPrefix(buffer, [0x00, 0x00, 0x01, 0xba]) || hasPrefix(buffer, [0x00, 0x00, 0x01, 0xb3])) {
    return true;
  }
  // Ogg Video
  if (containsAsciiAt(buffer, 0, 'OggS')) return true;
  // ASF / WMV
  if (hasPrefix(buffer, [0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11])) return true;
  // MXF
  if (hasPrefix(buffer, [0x06, 0x0e, 0x2b, 0x34])) return true;
  // RealMedia
  if (containsAsciiAt(buffer, 0, '.RMF')) return true;
  // Raw H.264 / H.265 NAL units
  if (hasPrefix(buffer, [0x00, 0x00, 0x00, 0x01]) || hasPrefix(buffer, [0x00, 0x00, 0x01])) {
    return true;
  }
  return false;
};

const isLikelyAudioBinary = (buffer: Buffer): boolean => {
  if (!buffer.length) return false;
  // Encrypted vault audio payload
  if (isLikelyEncryptedBinary(buffer)) return true;
  // ID3 MP3 or MP3 sync frame
  if (containsAsciiAt(buffer, 0, 'ID3')) return true;
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return true;
  // WAV
  if (containsAsciiAt(buffer, 0, 'RIFF') && containsAsciiAt(buffer, 8, 'WAVE')) return true;
  // FLAC
  if (containsAsciiAt(buffer, 0, 'fLaC')) return true;
  // Ogg Audio / Opus
  if (containsAsciiAt(buffer, 0, 'OggS')) return true;
  // AAC ADTS
  if (buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0) return true;
  // M4A / MP4 Audio
  if (containsAsciiAt(buffer, 4, 'ftyp') || containsAsciiAt(buffer, 0, 'ftyp')) return true;
  // AIFF / AIFC
  if (
    containsAsciiAt(buffer, 0, 'FORM') &&
    (containsAsciiAt(buffer, 8, 'AIFF') || containsAsciiAt(buffer, 8, 'AIFC'))
  ) {
    return true;
  }
  // Core Audio Format (CAF)
  if (containsAsciiAt(buffer, 0, 'caff')) return true;
  // MIDI
  if (containsAsciiAt(buffer, 0, 'MThd')) return true;
  // ASF / WMA
  if (hasPrefix(buffer, [0x30, 0x26, 0xb2, 0x75])) return true;
  return false;
};

export const assertFileContentMatchesCategory = (
  category: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): void => {
  const extension = getFileExtension(fileName);
  const normalizedMime = (mimeType || '').toLowerCase();
  if (category === 'photo') {
    const extensionAllowed = photoExtensions.has(extension);
    const mimeAllowed = normalizedMime.startsWith('image/');
    const contentAllowed = isLikelyPhotoBinary(buffer);
    if (!contentAllowed || (!extensionAllowed && !mimeAllowed)) {
      throw new AppError(400, 'INVALID_FILE_CONTENT', 'Photo file content validation failed.');
    }
    return;
  }
  if (category === 'video') {
    const extensionAllowed = videoExtensions.has(extension);
    const mimeAllowed = normalizedMime.startsWith('video/') || normalizedMime === 'application/mxf';
    const contentAllowed = isLikelyVideoBinary(buffer);
    if (!contentAllowed || (!extensionAllowed && !mimeAllowed)) {
      throw new AppError(400, 'INVALID_FILE_CONTENT', 'Video file content validation failed.');
    }
    return;
  }
  if (category === 'audio') {
    const extensionAllowed = audioExtensions.has(extension);
    const mimeAllowed = normalizedMime.startsWith('audio/') || normalizedMime === 'application/ogg';
    const contentAllowed = isLikelyAudioBinary(buffer);
    if (!contentAllowed || (!extensionAllowed && !mimeAllowed)) {
      throw new AppError(400, 'INVALID_FILE_CONTENT', 'Audio file content validation failed.');
    }
  }
};

export const uploadVaultFileMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSize,
    files: 1,
  },
  fileFilter: (req: any, file: any, callback: any) => {
    const category = String(req.params.category || 'other-files');
    const allowed = allowedMimeTypes[category];
    if (!allowed) {
      callback(new AppError(400, 'UNSUPPORTED_FILE_CATEGORY', 'Unsupported file category.'));
      return;
    }

    if (category === 'photo') {
      const mime = (file.mimetype || '').toLowerCase();
      const extension = getFileExtension(file.originalname || file.filename || '');

      const isImageMime = mime.startsWith('image/');
      const isKnownPhotoExtension = photoExtensions.has(extension);

      if (!isImageMime && !isKnownPhotoExtension) {
        callback(new AppError(400, 'INVALID_FILE_TYPE', 'Invalid file type for photo.'));
        return;
      }
    } else if (category === 'video') {
      const mime = (file.mimetype || '').toLowerCase();
      const extension = getFileExtension(file.originalname || file.filename || '');

      const isVideoMime = mime.startsWith('video/') || mime === 'application/mxf';
      const isKnownVideoExtension = videoExtensions.has(extension);

      if (!isVideoMime && !isKnownVideoExtension) {
        callback(new AppError(400, 'INVALID_FILE_TYPE', 'Invalid file type for video.'));
        return;
      }
    } else if (category === 'audio') {
      const mime = (file.mimetype || '').toLowerCase();
      const extension = getFileExtension(file.originalname || file.filename || '');

      const isAudioMime = mime.startsWith('audio/') || mime === 'application/ogg';
      const isKnownAudioExtension = audioExtensions.has(extension);

      if (!isAudioMime && !isKnownAudioExtension) {
        callback(new AppError(400, 'INVALID_FILE_TYPE', 'Invalid file type for audio.'));
        return;
      }
    } else if (category === 'document') {
      const mime = (file.mimetype || '').toLowerCase();
      const extension = getFileExtension(file.originalname || file.filename || '');

      if (blockedDocumentExtensions.has(extension)) {
        callback(new AppError(400, 'INVALID_FILE_TYPE', 'Invalid file type for document.'));
        return;
      }

      const isDocumentMime =
        mime.startsWith('text/') ||
        mime === 'application/pdf' ||
        mime === 'application/rtf' ||
        mime === 'application/msword' ||
        mime.startsWith('application/vnd.') ||
        mime.startsWith('application/xls') ||
        mime.startsWith('application/xml') ||
        mime === 'application/json' ||
        mime === 'application/x-yaml' ||
        mime === 'application/yaml' ||
        mime === 'application/toml' ||
        mime === 'application/sql' ||
        mime === 'application/epub+zip' ||
        mime === 'application/x-mobipocket-ebook' ||
        mime === 'application/x-fictionbook+xml' ||
        mime === 'application/x-djvu' ||
        mime === 'application/vnd.ms-xpsdocument' ||
        mime === 'application/oxps' ||
        mime === 'application/zip' ||
        mime === 'application/x-7z-compressed' ||
        mime === 'application/x-rar-compressed' ||
        mime === 'application/x-tar' ||
        mime === 'application/gzip' ||
        mime === 'application/x-bzip2' ||
        mime === 'application/x-xz' ||
        mime === 'application/octet-stream';

      const isKnownDocumentExtension = documentExtensions.has(extension);
      const isAllowedByMimeOnly = extension.length === 0 && isDocumentMime;

      if (!isKnownDocumentExtension && !isAllowedByMimeOnly) {
        callback(new AppError(400, 'INVALID_FILE_TYPE', 'Invalid file type for document.'));
        return;
      }
    } else if (
      category !== 'other-files' &&
      allowed.length > 0 &&
      !allowed.includes(file.mimetype)
    ) {
      callback(new AppError(400, 'INVALID_FILE_TYPE', `Invalid file type for ${category}.`));
      return;
    }

    callback(null, true);
  },
}).single('file');

export const getUploadRoot = (): string => uploadRoot;
