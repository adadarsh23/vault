const parseMaxUploadSizeMb = () => {
  const rawValue = import.meta.env.VITE_MAX_FILE_SIZE_MB;
  const parsed = Number.parseInt(rawValue ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4096;
};

export const MAX_UPLOAD_SIZE_MB = parseMaxUploadSizeMb();
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

export const PHOTO_FILE_EXTENSIONS = [
  'JPG',
  'JPEG',
  'JPE',
  'JFIF',
  'PJPEG',
  'PJP',
  'PNG',
  'APNG',
  'GIF',
  'WEBP',
  'AVIF',
  'HEIC',
  'HEIF',
  'BMP',
  'DIB',
  'TIF',
  'TIFF',
  'ICO',
  'CUR',
  'SVG',
  'SVGZ',
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
  'JP2',
  'J2K',
  'JPF',
  'JPM',
  'JXR',
  'HDP',
  'WDP',
  'DDS',
  'EXR',
  'HDR',
  'PIC',
  'PCT',
  'PCX',
  'TGA',
  'ICNS',
  'PSD',
] as const;

export const PHOTO_FILE_INPUT_ACCEPT = [
  'image/*',
  ...PHOTO_FILE_EXTENSIONS.map((ext) => `.${ext.toLowerCase()}`),
].join(',');

export const VIDEO_FILE_EXTENSIONS = [
  'MP4',
  'M4V',
  'MOV',
  'QT',
  'WEBM',
  'MKV',
  'MKA',
  'MKS',
  'AVI',
  'DIVX',
  'XVID',
  'WMV',
  'ASF',
  'ASX',
  'MPG',
  'MPEG',
  'MPE',
  'MPV',
  'M2V',
  'M2P',
  'MTS',
  'M2TS',
  'TS',
  'VOB',
  'EVO',
  'MOD',
  'TOD',
  '3GP',
  '3G2',
  'F4V',
  'F4P',
  'F4A',
  'F4B',
  'FLV',
  'SWF',
  'OGV',
  'OGM',
  'RM',
  'RMVB',
  'RV',
  'DAT',
  'MXF',
  'GXF',
  'LXF',
  'NUT',
  'DV',
  'DIF',
  'Y4M',
  'H264',
  '264',
  'H265',
  '265',
  'HEVC',
  'AV1',
  'VP8',
  'VP9',
  'R3D',
  'BRAW',
  'CINE',
  'ARI',
  'ARX',
  'MJP2',
  'MJ2',
] as const;

export const VIDEO_FILE_INPUT_ACCEPT = [
  'video/*',
  ...VIDEO_FILE_EXTENSIONS.map((ext) => `.${ext.toLowerCase()}`),
].join(',');

export const AUDIO_FILE_EXTENSIONS = [
  'MP3',
  'MP2',
  'MP1',
  'M4A',
  'M4B',
  'M4P',
  'AAC',
  'WAV',
  'WAVE',
  'BWF',
  'AIF',
  'AIFF',
  'AIFC',
  'FLAC',
  'ALAC',
  'APE',
  'MAC',
  'WV',
  'WVC',
  'WMA',
  'OGG',
  'OGA',
  'OPUS',
  'SPX',
  'WEBM',
  'AMR',
  'AWB',
  '3GA',
  'AU',
  'SND',
  'VOC',
  'RA',
  'RAM',
  'RM',
  'MKA',
  'AC3',
  'EAC3',
  'DTS',
  'DTSHD',
  'THD',
  'MLP',
  'PCM',
  'LPCM',
  'DSD',
  'DFF',
  'DSF',
  'TAK',
  'TTA',
  'MPC',
  'MP+',
  'AA',
  'AAX',
  'CAF',
  'QCP',
  'GSM',
  'ADTS',
  'MID',
  'MIDI',
  'RMI',
  'KAR',
  'IT',
  'XM',
  'S3M',
  'MOD',
  'MTM',
  'UMX',
] as const;

export type AudioFileExtension = (typeof AUDIO_FILE_EXTENSIONS)[number];

export const AUDIO_MIME_MAP: Record<string, string> = {
  mp3: 'audio/mpeg',
  mp2: 'audio/mpeg',
  mp1: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  m4p: 'audio/mp4',
  alac: 'audio/mp4',
  aac: 'audio/aac',
  adts: 'audio/aac',
  wav: 'audio/wav',
  wave: 'audio/wav',
  bwf: 'audio/wav',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  aifc: 'audio/aiff',
  flac: 'audio/flac',
  ape: 'audio/x-ape',
  mac: 'audio/x-ape',
  wv: 'audio/x-wavpack',
  wvc: 'audio/x-wavpack',
  wma: 'audio/x-ms-wma',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  spx: 'audio/ogg',
  webm: 'audio/webm',
  amr: 'audio/amr',
  awb: 'audio/amr-wb',
  '3ga': 'audio/3gpp',
  au: 'audio/basic',
  snd: 'audio/basic',
  voc: 'audio/x-voc',
  ra: 'audio/x-pn-realaudio',
  ram: 'audio/x-pn-realaudio',
  rm: 'audio/x-pn-realaudio',
  mka: 'audio/x-matroska',
  ac3: 'audio/ac3',
  eac3: 'audio/eac3',
  dts: 'audio/vnd.dts',
  dtshd: 'audio/vnd.dts.hd',
  thd: 'audio/mlp',
  mlp: 'audio/mlp',
  pcm: 'audio/L16',
  lpcm: 'audio/L16',
  dsd: 'audio/x-dsd',
  dff: 'audio/x-dff',
  dsf: 'audio/x-dsf',
  tak: 'audio/x-tak',
  tta: 'audio/x-tta',
  mpc: 'audio/x-musepack',
  'mp+': 'audio/x-musepack',
  aa: 'audio/audible',
  aax: 'audio/vnd.audible.aax',
  caf: 'audio/x-caf',
  qcp: 'audio/qcp',
  gsm: 'audio/x-gsm',
  mid: 'audio/midi',
  midi: 'audio/midi',
  rmi: 'audio/midi',
  kar: 'audio/midi',
  it: 'audio/x-it',
  xm: 'audio/x-xm',
  s3m: 'audio/x-s3m',
  mod: 'audio/x-mod',
  mtm: 'audio/x-mod',
  umx: 'audio/x-mod',
};

export const isAudioExtension = (ext: string): boolean => {
  if (!ext) return false;
  const cleanExt = ext.replace(/^\./, '').toUpperCase();
  return (AUDIO_FILE_EXTENSIONS as readonly string[]).includes(cleanExt);
};

export const getAudioMimeType = (filenameOrExt: string): string => {
  if (!filenameOrExt) return 'audio/mpeg';
  const ext = filenameOrExt.includes('.')
    ? filenameOrExt.split('.').pop()?.toLowerCase() || ''
    : filenameOrExt.toLowerCase();
  return AUDIO_MIME_MAP[ext] || 'audio/mpeg';
};

export const AUDIO_FILE_INPUT_ACCEPT = [
  'audio/*',
  ...AUDIO_FILE_EXTENSIONS.map((ext) => `.${ext.toLowerCase()}`),
].join(',');

export const DOCUMENT_FILE_EXTENSIONS = [
  'PDF',
  'FDF',
  'XFDF',
  'DOC',
  'DOCX',
  'DOCM',
  'DOT',
  'DOTX',
  'DOTM',
  'RTF',
  'ODT',
  'OTT',
  'PAGES',
  'WPD',
  'WPS',
  'TXT',
  'TEXT',
  'LOG',
  'MD',
  'MARKDOWN',
  'RST',
  'ORG',
  'TEX',
  'LATEX',
  'CSV',
  'TSV',
  'PSV',
  'SSV',
  'JSON',
  'JSONL',
  'NDJSON',
  'XML',
  'YAML',
  'YML',
  'TOML',
  'INI',
  'CONF',
  'CFG',
  'PROPERTIES',
  'SQL',
  'XLS',
  'XLSX',
  'XLSM',
  'XLSB',
  'XLT',
  'XLTX',
  'XLTM',
  'ODS',
  'OTS',
  'NUMBERS',
  'PPT',
  'PPTX',
  'PPTM',
  'PPS',
  'PPSX',
  'POT',
  'POTX',
  'POTM',
  'ODP',
  'OTP',
  'KEY',
  'EPUB',
  'MOBI',
  'AZW',
  'AZW3',
  'FB2',
  'LRF',
  'DJVU',
  'CHM',
  'XPS',
  'OXPS',
  'TIF',
  'TIFF',
  'ZIP',
  '7Z',
  'RAR',
  'TAR',
  'GZ',
  'BZ2',
  'XZ',
] as const;

export const DOCUMENT_MIME_MAP: Record<string, string> = {
  // PDF & Forms
  pdf: 'application/pdf',
  fdf: 'application/vnd.fdf',
  xfdf: 'application/vnd.adobe.xfdf',

  // Word & Rich Text
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  docm: 'application/vnd.ms-word.document.macroEnabled.12',
  dot: 'application/msword',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  dotm: 'application/vnd.ms-word.template.macroEnabled.12',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  ott: 'application/vnd.oasis.opendocument.text-template',
  pages: 'application/x-iwork-pages-sffpages',
  wpd: 'application/vnd.wordperfect',
  wps: 'application/vnd.ms-works',

  // Plain Text, Markup, Structured Data & Code
  txt: 'text/plain',
  text: 'text/plain',
  log: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  rst: 'text/x-rst',
  org: 'text/x-org',
  tex: 'text/x-tex',
  latex: 'text/x-latex',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  psv: 'text/plain',
  ssv: 'text/plain',
  json: 'application/json',
  jsonl: 'application/x-ndjson',
  ndjson: 'application/x-ndjson',
  xml: 'application/xml',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  toml: 'application/toml',
  ini: 'text/plain',
  conf: 'text/plain',
  cfg: 'text/plain',
  properties: 'text/plain',
  sql: 'application/sql',

  // Spreadsheets
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xlsb: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  xlt: 'application/vnd.ms-excel',
  xltx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  xltm: 'application/vnd.ms-excel.template.macroEnabled.12',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  ots: 'application/vnd.oasis.opendocument.spreadsheet-template',
  numbers: 'application/x-iwork-numbers-sffnumbers',

  // Presentations
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  pps: 'application/vnd.ms-powerpoint',
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  pot: 'application/vnd.ms-powerpoint',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
  potm: 'application/vnd.ms-powerpoint.template.macroEnabled.12',
  odp: 'application/vnd.oasis.opendocument.presentation',
  otp: 'application/vnd.oasis.opendocument.presentation-template',
  key: 'application/x-iwork-keynote-sffkey',

  // eBooks & Fixed Layout Documents
  epub: 'application/epub+zip',
  mobi: 'application/x-mobipocket-ebook',
  azw: 'application/vnd.amazon.ebook',
  azw3: 'application/vnd.amazon.ebook',
  fb2: 'application/x-fictionbook+xml',
  lrf: 'application/x-sony-bbeb',
  djvu: 'image/vnd.djvu',
  chm: 'application/vnd.ms-htmlhelp',
  xps: 'application/vnd.ms-xpsdocument',
  oxps: 'application/oxps',

  // Images
  tif: 'image/tiff',
  tiff: 'image/tiff',

  // Archives
  zip: 'application/zip',
  '7z': 'application/x-7z-compressed',
  rar: 'application/vnd.rar',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  bz2: 'application/x-bzip2',
  xz: 'application/x-xz',
};

export type DocumentFileExtension = (typeof DOCUMENT_FILE_EXTENSIONS)[number];

export const isDocumentExtension = (ext: string): boolean => {
  if (!ext) return false;
  const cleanExt = ext.replace(/^\./, '').toUpperCase();
  return (DOCUMENT_FILE_EXTENSIONS as readonly string[]).includes(cleanExt);
};

export const getDocumentMimeType = (filenameOrExt: string): string => {
  if (!filenameOrExt) return 'application/octet-stream';
  const ext = filenameOrExt.includes('.')
    ? filenameOrExt.split('.').pop()?.toLowerCase() || ''
    : filenameOrExt.toLowerCase();
  return DOCUMENT_MIME_MAP[ext] || 'application/octet-stream';
};

export type DocumentCategory =
  | 'pdf'
  | 'word'
  | 'text'
  | 'code'
  | 'spreadsheet'
  | 'presentation'
  | 'ebook'
  | 'archive'
  | 'image'
  | 'generic';

export const getDocumentCategory = (extOrFilename: string): DocumentCategory => {
  const ext = (
    extOrFilename.includes('.')
      ? extOrFilename.split('.').pop()?.toUpperCase() || ''
      : extOrFilename.toUpperCase()
  ).replace(/^\./, '');

  switch (ext) {
    case 'PDF':
    case 'FDF':
    case 'XFDF':
      return 'pdf';

    case 'DOC':
    case 'DOCX':
    case 'DOCM':
    case 'DOT':
    case 'DOTX':
    case 'DOTM':
    case 'RTF':
    case 'ODT':
    case 'OTT':
    case 'PAGES':
    case 'WPD':
    case 'WPS':
      return 'word';

    case 'TXT':
    case 'TEXT':
    case 'LOG':
    case 'MD':
    case 'MARKDOWN':
    case 'RST':
    case 'ORG':
    case 'TEX':
    case 'LATEX':
      return 'text';

    case 'CSV':
    case 'TSV':
    case 'PSV':
    case 'SSV':
    case 'JSON':
    case 'JSONL':
    case 'NDJSON':
    case 'XML':
    case 'YAML':
    case 'YML':
    case 'TOML':
    case 'INI':
    case 'CONF':
    case 'CFG':
    case 'PROPERTIES':
    case 'SQL':
      return 'code';

    case 'XLS':
    case 'XLSX':
    case 'XLSM':
    case 'XLSB':
    case 'XLT':
    case 'XLTX':
    case 'XLTM':
    case 'ODS':
    case 'OTS':
    case 'NUMBERS':
      return 'spreadsheet';

    case 'PPT':
    case 'PPTX':
    case 'PPTM':
    case 'PPS':
    case 'PPSX':
    case 'POT':
    case 'POTX':
    case 'POTM':
    case 'ODP':
    case 'OTP':
    case 'KEY':
      return 'presentation';

    case 'EPUB':
    case 'MOBI':
    case 'AZW':
    case 'AZW3':
    case 'FB2':
    case 'LRF':
    case 'DJVU':
    case 'CHM':
    case 'XPS':
    case 'OXPS':
      return 'ebook';

    case 'TIF':
    case 'TIFF':
      return 'image';

    case 'ZIP':
    case '7Z':
    case 'RAR':
    case 'TAR':
    case 'GZ':
    case 'BZ2':
    case 'XZ':
      return 'archive';

    default:
      return 'generic';
  }
};

export const DOCUMENT_FILE_INPUT_ACCEPT = [
  ...DOCUMENT_FILE_EXTENSIONS.map((ext) => `.${ext.toLowerCase()}`),
].join(',');

export const FILE_TYPE_SUPPORT = {
  photo: PHOTO_FILE_EXTENSIONS,
  video: VIDEO_FILE_EXTENSIONS,
  audio: AUDIO_FILE_EXTENSIONS,
  document: DOCUMENT_FILE_EXTENSIONS,
  file: ['Archives', 'Source files', 'Installers', 'Miscellaneous files'],
} as const;

export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);

  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

export const exceedsUploadSizeLimit = (file: File) => file.size > MAX_UPLOAD_SIZE_BYTES;

export const getUploadSizeErrorMessage = (file: File) =>
  `"${file.name}" exceeds the ${MAX_UPLOAD_SIZE_MB} MB limit for secure uploads.`;
