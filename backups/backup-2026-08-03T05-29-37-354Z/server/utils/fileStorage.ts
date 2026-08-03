import multer from 'multer';
import { AppError } from './appError.ts';
const uploadRoot = 'cloud-only';
const maxFileSize = Number(process.env.MAX_FILE_SIZE_MB || 500) * 1024 * 1024;
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
  if (hasPrefix(buffer, [0xff, 0xd8, 0xff])) return true; // jpeg
  if (hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return true; // png
  if (containsAsciiAt(buffer, 0, 'GIF87a') || containsAsciiAt(buffer, 0, 'GIF89a')) return true; // gif
  if (containsAsciiAt(buffer, 0, 'BM')) return true; // bmp
  if (containsAsciiAt(buffer, 0, 'II*\u0000') || containsAsciiAt(buffer, 0, 'MM\u0000*'))
    return true; // tiff
  if (containsAsciiAt(buffer, 0, 'RIFF') && containsAsciiAt(buffer, 8, 'WEBP')) return true; // webp
  if (containsAsciiAt(buffer, 4, 'ftyp')) {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (['heic', 'heix', 'hevc', 'hevx', 'heif', 'mif1', 'msf1', 'avif'].includes(brand)) {
      return true;
    }
  }
  return false;
};

const isLikelyVideoBinary = (buffer: Buffer): boolean => {
  if (!buffer.length) return false;
  if (containsAsciiAt(buffer, 4, 'ftyp')) {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'qt  ', '3gp4', '3gp5'].includes(brand)) {
      return true;
    }
  }
  if (hasPrefix(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return true; // webm/mkv ebml
  if (containsAsciiAt(buffer, 0, 'RIFF') && containsAsciiAt(buffer, 8, 'AVI ')) return true; // avi
  return false;
};

export const assertFileContentMatchesCategory = (
  category: string,
  fileName: string,
  mimeType: string,
  buffer: Buffer
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
  }
};

export const uploadVaultFileMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSize,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
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
