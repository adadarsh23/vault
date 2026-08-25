import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import {
  Trash2,
  FileArchive,
  Download,
  X,
  Loader2,
  Package,
  FileCode,
  Box,
  Eye,
  AlertTriangle,
  Folder,
  Move,
  ChevronLeft,
  ChevronRight,
  Pin,
  Copy,
  Check,
  Search,
  Maximize2,
  ExternalLink,
  ShieldCheck,
  Lock,
  WrapText,
  Database,
  HardDrive,
  Code2,
  Cpu,
  FileJson,
  Music,
  Film,
  Image as ImageIcon,
  FileSpreadsheet,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileText,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { useAntiScreenshotAndShield } from '../../hooks/useAntiScreenshotAndShield';
import { toast } from 'sonner';
import { useVaultStore } from '../../store/vaultStore';
import { VaultItem } from '../../lib/storage';
import { encryptFileInWorker } from '../../lib/cryptoPrimitives';
import { stripExifInWorker, stripExifInMemory } from '../../lib/mediaWorker';
import { motion, AnimatePresence } from 'framer-motion';
import { GlobalNavigator } from '../../components/vault/GlobalNavigator';
import { useGlobalNavigationStore } from '../../store/globalNavigationStore';
import { logActivity } from '../../lib/activity';
import { useVaultFolders } from '../../hooks/useVaultFolders';
import { useVaultItems } from '../../hooks/useVaultItems';
import { VaultLayout } from '../../components/layout/VaultLayout';
import { cn } from '../../lib/utils';
import {
  getVaultItemFileUrl,
  getVaultItemPreviewUrl,
  describeVaultPreviewError,
} from '../../lib/filePreview';
import { setDraggedVaultItem, clearDraggedVaultItem } from '../../lib/vaultDragDrop';
import {
  exceedsUploadSizeLimit,
  getUploadSizeErrorMessage,
  formatBytes,
} from '../../lib/fileHandling';
import VideoPlayer, { getMimeTypeFromUrl } from '../../components/ui/video-player';

// Maximum preview text buffer size to avoid browser main-thread freezes (5MB)
const MAX_PREVIEW_TEXT_BYTES = 5 * 1024 * 1024;
const MAX_PREVIEW_CSV_ROWS = 1000;

// File categories for classification and rich previews matching Document Vault aesthetic
export type FileCategory =
  | 'code'
  | 'config'
  | 'data'
  | 'text'
  | 'markdown'
  | 'csv'
  | 'pdf'
  | 'image'
  | 'audio'
  | 'video'
  | 'archive'
  | 'executable'
  | 'database'
  | 'disk-image'
  | 'font'
  | '3d'
  | 'generic';

const CODE_EXTENSIONS = new Set([
  'JS',
  'JSX',
  'TS',
  'TSX',
  'PY',
  'PYW',
  'RB',
  'PHP',
  'JAVA',
  'C',
  'CPP',
  'CC',
  'CXX',
  'H',
  'HPP',
  'CS',
  'GO',
  'RS',
  'KT',
  'KTS',
  'DART',
  'SWIFT',
  'LUA',
  'R',
  'SCALA',
  'SH',
  'BASH',
  'ZSH',
  'PS1',
  'BAT',
  'CMD',
  'VBS',
  'HTML',
  'HTM',
  'CSS',
  'SCSS',
  'SASS',
  'LESS',
  'VUE',
  'SVELTE',
  'SQL',
  'PRISMA',
  'GRAPHQL',
  'GQL',
  'WASM',
  'HEX',
  'ASM',
  'CLJ',
  'EL',
  'EX',
  'EXS',
  'FS',
  'HS',
  'ML',
  'PL',
  'PM',
  'SOL',
]);

const CONFIG_EXTENSIONS = new Set([
  'JSON',
  'JSONL',
  'NDJSON',
  'XML',
  'YAML',
  'YML',
  'TOML',
  'INI',
  'ENV',
  'CONF',
  'CONFIG',
  'PROPERTIES',
  'PLIST',
  'REG',
  'GITIGNORE',
  'GITATTRIBUTES',
  'EDITORCONFIG',
  'PRETTIERRC',
  'ESLINTRC',
  'BABELRC',
  'DOCKERIGNORE',
]);

const CSV_EXTENSIONS = new Set(['CSV', 'TSV', 'PSV', 'SSV']);

const MARKDOWN_EXTENSIONS = new Set(['MD', 'MARKDOWN', 'MDX', 'RST']);

const TEXT_EXTENSIONS = new Set([
  'TXT',
  'TEXT',
  'LOG',
  'ORG',
  'TEX',
  'LATEX',
  'RTF',
  'NFO',
  'ME',
  '1ST',
  'ASCII',
  'DIFF',
  'PATCH',
]);

const PDF_EXTENSIONS = new Set(['PDF', 'FDF', 'XFDF']);

const IMAGE_EXTENSIONS = new Set([
  'PNG',
  'JPG',
  'JPEG',
  'JPE',
  'JFIF',
  'PJPEG',
  'PJP',
  'GIF',
  'WEBP',
  'AVIF',
  'SVG',
  'SVGZ',
  'BMP',
  'DIB',
  'ICO',
  'CUR',
  'TIF',
  'TIFF',
  'PSD',
  'AI',
  'EPS',
  'RAW',
  'CR2',
  'NEF',
  'DNG',
]);

const AUDIO_EXTENSIONS = new Set([
  'MP3',
  'WAV',
  'OGG',
  'OGA',
  'AAC',
  'M4A',
  'FLAC',
  'WMA',
  'AIFF',
  'AIF',
  'OPUS',
  'MID',
  'MIDI',
  'AC3',
  'AMR',
  'AU',
]);

const VIDEO_EXTENSIONS = new Set([
  'MP4',
  'M4V',
  'WEBM',
  'MKV',
  'AVI',
  'MOV',
  'QT',
  'WMV',
  'FLV',
  '3GP',
  'OGV',
  'TS',
  'MTS',
]);

const ARCHIVE_EXTENSIONS = new Set([
  'ZIP',
  'RAR',
  '7Z',
  '7ZIP',
  'TAR',
  'GZ',
  'TGZ',
  'BZ2',
  'TBZ2',
  'XZ',
  'TXZ',
  'Z',
  'CAB',
  'LZMA',
  'LZH',
  'AR',
  'CPIO',
  'ZST',
  'BR',
]);

const EXECUTABLE_EXTENSIONS = new Set([
  'EXE',
  'MSI',
  'DMG',
  'PKG',
  'DEB',
  'RPM',
  'APK',
  'AAB',
  'APP',
  'DLL',
  'SO',
  'DYLIB',
  'BIN',
  'SYS',
  'DRV',
  'COM',
  'SCR',
  'ELF',
  'OUT',
  'RUN',
  'JAR',
  'WAR',
  'EAR',
  'IPA',
  'XPI',
  'CRX',
  'PYD',
  'CLASS',
  'ROM',
  'HEX',
  'BIT',
]);

const DATABASE_EXTENSIONS = new Set([
  'DB',
  'SQLITE',
  'SQLITE3',
  'MDF',
  'LDF',
  'SAV',
  'BAK',
  'RDB',
  'MDB',
  'ACCDB',
  'DAT',
  'CDB',
]);

const DISK_IMAGE_EXTENSIONS = new Set([
  'ISO',
  'IMG',
  'VHD',
  'VHDX',
  'VMDK',
  'QCOW2',
  'NRG',
  'MDF',
  'RAW',
]);

const FONT_EXTENSIONS = new Set(['TTF', 'OTF', 'WOFF', 'WOFF2', 'EOT']);

const THREE_D_EXTENSIONS = new Set([
  'OBJ',
  'FBX',
  'STL',
  'GLTF',
  'GLB',
  'BLEND',
  'DAE',
  '3DS',
  'MAX',
]);

export const getFileCategory = (extension: string): FileCategory => {
  const ext = (extension || '').toUpperCase();
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (CONFIG_EXTENSIONS.has(ext)) return 'config';
  if (CSV_EXTENSIONS.has(ext)) return 'csv';
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  if (PDF_EXTENSIONS.has(ext)) return 'pdf';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive';
  if (EXECUTABLE_EXTENSIONS.has(ext)) return 'executable';
  if (DATABASE_EXTENSIONS.has(ext)) return 'database';
  if (DISK_IMAGE_EXTENSIONS.has(ext)) return 'disk-image';
  if (FONT_EXTENSIONS.has(ext)) return 'font';
  if (THREE_D_EXTENSIONS.has(ext)) return '3d';
  return 'generic';
};

const getCategoryBadgeColor = (category: FileCategory) => {
  switch (category) {
    case 'pdf':
      return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    case 'code':
    case 'config':
      return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    case 'csv':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'markdown':
    case 'text':
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'image':
      return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
    case 'audio':
      return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
    case 'video':
      return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
    case 'archive':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    case 'executable':
      return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    case 'database':
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case 'disk-image':
      return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
    case 'font':
    case '3d':
      return 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30';
    default:
      return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
  }
};

export const getCategoryIcon = (category: FileCategory, className = 'h-10 w-10') => {
  switch (category) {
    case 'pdf':
      return <FileText className={cn(className, 'text-rose-400')} />;
    case 'code':
      return <FileCode className={cn(className, 'text-cyan-400')} />;
    case 'config':
      return <FileJson className={cn(className, 'text-cyan-400')} />;
    case 'csv':
      return <FileSpreadsheet className={cn(className, 'text-emerald-400')} />;
    case 'markdown':
    case 'text':
      return <FileText className={cn(className, 'text-blue-400')} />;
    case 'image':
      return <ImageIcon className={cn(className, 'text-pink-400')} />;
    case 'audio':
      return <Music className={cn(className, 'text-violet-400')} />;
    case 'video':
      return <Film className={cn(className, 'text-indigo-400')} />;
    case 'archive':
      return <FileArchive className={cn(className, 'text-amber-400')} />;
    case 'executable':
      return <Cpu className={cn(className, 'text-red-400')} />;
    case 'database':
      return <Database className={cn(className, 'text-purple-400')} />;
    case 'disk-image':
      return <HardDrive className={cn(className, 'text-sky-400')} />;
    case 'font':
      return <Code2 className={cn(className, 'text-fuchsia-400')} />;
    case '3d':
      return <Box className={cn(className, 'text-amber-400')} />;
    default:
      return <Package className={cn(className, 'text-violet-400')} />;
  }
};

// Delimiter parser for CSV / TSV / PSV with row limits for maximum UI speed
const parseDelimitedData = (rawText: string, ext: string) => {
  if (!rawText.trim()) return { headers: [], rows: [] };
  let delimiter = ',';
  if (ext === 'TSV') delimiter = '\t';
  else if (ext === 'PSV') delimiter = '|';
  else if (ext === 'SSV') delimiter = ';';
  else {
    const firstLine = rawText.split('\n')[0] || '';
    const commas = (firstLine.match(/,/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;
    const pipes = (firstLine.match(/\|/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    if (tabs > commas && tabs >= pipes) delimiter = '\t';
    else if (pipes > commas && pipes >= semicolons) delimiter = '|';
    else if (semicolons > commas) delimiter = ';';
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  const parsedLines = lines.slice(0, MAX_PREVIEW_CSV_ROWS).map((line) => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(cur.trim().replace(/^"(.*)"$/, '$1'));
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim().replace(/^"(.*)"$/, '$1'));
    return result;
  });

  return {
    headers: parsedLines[0] || [],
    rows: parsedLines.slice(1),
    isTruncated: lines.length > MAX_PREVIEW_CSV_ROWS,
    totalRows: lines.length - 1,
  };
};

interface SafeUniversalPreviewProps {
  item: VaultItem;
  masterKey: string | CryptoKey;
  onDownload: () => void;
}

const SafeUniversalPreview: React.FC<SafeUniversalPreviewProps> = ({
  item,
  masterKey,
  onDownload,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rsaKeyPair = useVaultStore((state) => state.rsaKeyPair);

  // Viewer interactive state
  const [copied, setCopied] = useState(false);
  const [showLineNumbers] = useState(true);
  const [wordWrap, setWordWrap] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('sm');
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');
  const [imageZoom, setImageZoom] = useState(1);

  const extension = (item.metadata?.extension || item.title.split('.').pop() || '').toUpperCase();
  const category = getFileCategory(extension);
  const badgeStyle = getCategoryBadgeColor(category);

  const isTextLike =
    category === 'code' ||
    category === 'config' ||
    category === 'csv' ||
    category === 'markdown' ||
    category === 'text' ||
    item.metadata?.mimeType?.startsWith('text/');

  useEffect(() => {
    let isMounted = true;
    let activeObjectUrl: string | null = null;
    setIsLoading(true);
    setErrorMessage(null);
    setTextContent(null);
    setIsTruncated(false);

    const decryptAndLoad = async () => {
      try {
        const previewUrl = await getVaultItemPreviewUrl(
          item,
          masterKey,
          item.metadata?.mimeType,
          rsaKeyPair?.privateKey,
        );

        if (!isMounted) {
          if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
          return;
        }

        if (!previewUrl) {
          throw new Error('Unable to decrypt file preview');
        }

        activeObjectUrl = previewUrl.startsWith('blob:') ? previewUrl : null;
        setUrl(previewUrl);

        if (isTextLike) {
          try {
            const resp = await fetch(previewUrl);
            if (resp.ok) {
              const blob = await resp.blob();
              if (blob.size > MAX_PREVIEW_TEXT_BYTES) {
                // Slice safely to avoid high memory spikes
                const textSlice = await blob.slice(0, MAX_PREVIEW_TEXT_BYTES).text();
                if (isMounted) {
                  setTextContent(textSlice);
                  setIsTruncated(true);
                }
              } else {
                const text = await blob.text();
                if (isMounted) setTextContent(text);
              }
            }
          } catch {
            // Text fetch failed, URL remains
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(describeVaultPreviewError(err));
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    decryptAndLoad();

    return () => {
      isMounted = false;
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    };
  }, [item.content, item.id, item.updatedAt, masterKey, rsaKeyPair, isTextLike]);

  const handleCopy = useCallback(() => {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }, [textContent]);

  const parsedCsv = useMemo(() => {
    if (category !== 'csv' || !textContent)
      return { headers: [], rows: [], isTruncated: false, totalRows: 0 };
    return parseDelimitedData(textContent, extension);
  }, [category, textContent, extension]);

  const filteredCsvRows = useMemo(() => {
    if (!searchQuery.trim()) return parsedCsv.rows;
    const q = searchQuery.toLowerCase();
    return parsedCsv.rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(q)));
  }, [parsedCsv.rows, searchQuery]);

  const lines = useMemo(() => {
    if (!textContent) return [];
    return textContent.split(/\r?\n/);
  }, [textContent]);

  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return lines.map((text, idx) => ({ text, lineNumber: idx + 1 }));
    const q = searchQuery.toLowerCase();
    return lines
      .map((text, idx) => ({ text, lineNumber: idx + 1 }))
      .filter(({ text }) => text.toLowerCase().includes(q));
  }, [lines, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[350px] flex-col items-center justify-center gap-4">
        <div className="relative flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-violet-400/60" />
          <Lock className="absolute h-5 w-5 text-violet-400/80 animate-pulse" />
        </div>
        <p className="text-sm font-medium text-text/60">Decrypting file securely...</p>
        <span className="text-[11px] text-text/40">Zero-Knowledge E2EE</span>
      </div>
    );
  }

  if (errorMessage || !url) {
    return (
      <div className="flex h-full min-h-[350px] flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <AlertTriangle className="h-8 w-8" />
        </div>
        <div className="max-w-md space-y-1">
          <h4 className="text-base font-semibold text-white">Preview Unavailable</h4>
          <p className="text-xs text-text/60">
            {errorMessage || 'File could not be decrypted or loaded.'}
          </p>
        </div>
        <Button
          onClick={onDownload}
          className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl shadow-lg shadow-violet-600/20"
        >
          <Download className="mr-2 h-4 w-4" />
          Download Decrypted File
        </Button>
      </div>
    );
  }

  // 1. PDF Viewer
  if (category === 'pdf') {
    return (
      <div className="flex h-full w-full flex-col bg-zinc-950 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/90 px-3 sm:px-4 py-2 sm:py-2.5 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-400 border border-rose-500/30 shrink-0">
              {extension || 'PDF'}
            </span>
            <span className="truncate text-xs font-semibold text-white/90" title={item.title}>
              {item.title}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 px-2 items-center gap-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 transition-colors border border-white/10 text-[11px]"
              title="Open full page / new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Open</span>
            </a>
            <Button
              size="icon"
              variant="ghost"
              onClick={onDownload}
              className="h-7 w-7 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="relative flex-1 w-full min-h-0 bg-zinc-900 overflow-hidden flex flex-col">
          <div className="sm:hidden flex items-center justify-between gap-2 bg-rose-950/40 border-b border-rose-500/20 px-3 py-1.5 text-[11px] text-rose-300">
            <span className="truncate">Mobile device viewer:</span>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 shrink-0 rounded px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-medium transition-colors border border-rose-500/30"
            >
              <ExternalLink className="h-3 w-3" /> Open Fullscreen
            </a>
          </div>
          <iframe
            src={url}
            title={item.title}
            className="flex-1 w-full h-full border-none bg-white"
            scrolling="auto"
          />
        </div>
      </div>
    );
  }

  // 2. Image Viewer
  if (category === 'image') {
    return (
      <div className="flex h-full w-full flex-col bg-zinc-950 overflow-hidden select-none">
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/90 px-3 sm:px-4 py-2 sm:py-2.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="rounded-md bg-pink-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-pink-400 border border-pink-500/30 shrink-0">
              {extension}
            </span>
            <span className="truncate text-xs font-semibold text-white/90">{item.title}</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setImageZoom((z) => Math.max(0.25, z - 0.25))}
              className="h-7 w-7 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
              title="Zoom Out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[10px] font-mono text-white/60 w-8 sm:w-10 text-center">
              {Math.round(imageZoom * 100)}%
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setImageZoom((z) => Math.min(4, z + 0.25))}
              className="h-7 w-7 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
              title="Zoom In"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setImageZoom(1)}
              className="h-7 w-7 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
              title="Reset Zoom"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onDownload}
              className="h-7 w-7 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center p-2 sm:p-4 min-h-0 overflow-auto bg-black/40">
          <img
            src={url}
            alt={item.title}
            style={{ transform: `scale(${imageZoom})`, transformOrigin: 'center center' }}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl transition-transform duration-150"
            onError={() => setErrorMessage('Image preview failed to render.')}
          />
        </div>
      </div>
    );
  }

  // 3. Audio Player
  if (category === 'audio') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-4 sm:p-6 text-center bg-zinc-950 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col items-center max-w-md w-full gap-5 p-6 rounded-2xl bg-white/[0.03] border border-white/10 shadow-2xl backdrop-blur-xl my-auto">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400 border border-violet-500/20 shadow-inner">
            <Music className="h-10 w-10" />
          </div>
          <div className="w-full text-center">
            <span className="rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
              {extension || 'AUDIO'}
            </span>
            <h3 className="mt-2 text-base font-bold text-white truncate px-2" title={item.title}>
              {item.title}
            </h3>
            <p className="text-[11px] text-text/40 mt-0.5">
              {formatBytes(item.metadata?.size || 0)}
            </p>
          </div>
          <audio controls src={url} className="w-full mt-1 rounded-lg accent-violet-500" />
          <Button
            onClick={onDownload}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-xl shadow-lg shadow-violet-600/20"
          >
            <Download className="mr-2 h-4 w-4" />
            Download Audio File
          </Button>
        </div>
      </div>
    );
  }

  // 4. Video Player (High-Performance, In-Browser WASM Auto-Transcoding, Multi-Device Responsive)
  if (category === 'video') {
    return (
      <div className="flex h-full w-full flex-col bg-zinc-950 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/90 px-3 sm:px-4 py-2 sm:py-2.5 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-indigo-300 border border-indigo-500/30 shrink-0">
              {extension || 'VIDEO'}
            </span>
            <span className="truncate text-xs font-semibold text-white/90" title={item.title}>
              {item.title}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              onClick={onDownload}
              className="h-7 w-7 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="relative flex-1 w-full min-h-0 bg-black flex items-center justify-center p-1 sm:p-4 overflow-hidden">
          <div className="relative w-full h-full max-w-full max-h-full flex items-center justify-center overflow-hidden rounded-xl">
            <VideoPlayer
              src={url}
              mimeType={item.metadata?.mimeType || getMimeTypeFromUrl(url)}
              itemId={item.id}
              title={item.title}
              aspectRatio={item.metadata?.aspectRatio}
              autoPlay={false}
              allowDownload={false}
              allowFullscreen={true}
              allowPiP={true}
              allowSpeedChange={true}
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      </div>
    );
  }

  // 5. CSV / TSV / Delimited Table Viewer
  if (category === 'csv' && textContent !== null) {
    return (
      <div className="flex h-full w-full flex-col bg-zinc-950 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/90 px-3 sm:px-4 py-2 sm:py-2.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-400 border border-emerald-500/30 shrink-0">
              {extension}
            </span>
            <span className="truncate text-xs font-semibold text-white/90 max-w-[150px] sm:max-w-xs">
              {item.title}
            </span>
            <span className="hidden sm:inline-block text-[10px] text-text/40">
              ({parsedCsv.rows.length} rows, {parsedCsv.headers.length} cols)
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Filter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 w-24 sm:w-36 rounded-lg bg-white/5 pl-7 pr-2 text-xs text-white placeholder:text-white/30 border border-white/10 focus:outline-none focus:border-violet-500"
              />
            </div>
            <div className="flex rounded-lg bg-white/5 p-0.5 border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode('formatted')}
                className={cn(
                  'px-2 py-1 text-[10px] font-medium rounded-md transition-colors',
                  viewMode === 'formatted'
                    ? 'bg-violet-600 text-white'
                    : 'text-white/60 hover:text-white',
                )}
              >
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className={cn(
                  'px-2 py-1 text-[10px] font-medium rounded-md transition-colors',
                  viewMode === 'raw'
                    ? 'bg-violet-600 text-white'
                    : 'text-white/60 hover:text-white',
                )}
              >
                Raw
              </button>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleCopy}
              className="h-7 w-7 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
              title={copied ? 'Copied!' : 'Copy table data'}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onDownload}
              className="h-7 w-7 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {parsedCsv.isTruncated && (
          <div className="flex items-center gap-2 bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-[11px] text-amber-300 shrink-0">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>
              Showing first {MAX_PREVIEW_CSV_ROWS} rows for smooth performance. Download the file to
              view all {parsedCsv.totalRows} rows.
            </span>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-4 custom-scrollbar">
          {viewMode === 'formatted' ? (
            parsedCsv.headers.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-zinc-900/50 shadow-inner">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="px-3 py-2 text-[10px] font-bold text-white/40 uppercase w-12 text-right border-r border-white/5">
                        #
                      </th>
                      {parsedCsv.headers.map((h, i) => (
                        <th
                          key={i}
                          className="px-3 py-2 font-semibold text-emerald-300 border-r border-white/5 whitespace-nowrap"
                        >
                          {h || `Col ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCsvRows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-3 py-1.5 text-[10px] text-white/30 border-r border-white/5 font-mono text-right tabular-nums select-none">
                          {rIdx + 1}
                        </td>
                        {parsedCsv.headers.map((_, cIdx) => (
                          <td
                            key={cIdx}
                            className="px-3 py-1.5 text-text/80 border-r border-white/5 whitespace-nowrap"
                          >
                            {row[cIdx] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <pre className="p-4 font-mono text-xs text-text/80">
                {textContent || 'Empty data.'}
              </pre>
            )
          ) : (
            <pre className="whitespace-pre-wrap break-words rounded-xl bg-black/40 p-4 font-mono text-xs text-text/80 border border-white/10">
              {textContent || 'Empty file.'}
            </pre>
          )}
        </div>
      </div>
    );
  }

  // 6. Code & Config & Text Syntax Viewer (JS, TS, PY, HTML, CSS, C++, JSON, YAML, SQL, Shell, etc.)
  if (isTextLike && textContent !== null) {
    const fontSizeClass =
      fontSize === 'sm'
        ? 'text-xs leading-relaxed'
        : fontSize === 'base'
          ? 'text-sm leading-relaxed'
          : 'text-base leading-relaxed';

    return (
      <div className="flex h-full w-full flex-col bg-zinc-950 overflow-hidden font-sans">
        {/* Top Header / Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/90 px-3 sm:px-4 py-2 sm:py-2.5 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                'rounded-md px-2 py-0.5 text-[10px] font-bold uppercase border shrink-0',
                badgeStyle,
              )}
            >
              {extension || 'CODE'}
            </span>
            <span
              className="truncate text-xs font-semibold text-white/90 max-w-[140px] sm:max-w-xs"
              title={item.title}
            >
              {item.title}
            </span>
            <span className="hidden sm:inline-block text-[10px] text-text/40">
              ({lines.length} lines)
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 w-24 sm:w-36 rounded-lg bg-white/5 pl-7 pr-2 text-xs text-white placeholder:text-white/30 border border-white/10 focus:outline-none focus:border-violet-500"
              />
            </div>

            {category === 'markdown' && (
              <div className="flex rounded-lg bg-white/5 p-0.5 border border-white/10">
                <button
                  type="button"
                  onClick={() => setViewMode('formatted')}
                  className={cn(
                    'px-2 py-1 text-[10px] font-medium rounded-md transition-colors',
                    viewMode === 'formatted'
                      ? 'bg-violet-600 text-white'
                      : 'text-white/60 hover:text-white',
                  )}
                >
                  Doc
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('raw')}
                  className={cn(
                    'px-2 py-1 text-[10px] font-medium rounded-md transition-colors',
                    viewMode === 'raw'
                      ? 'bg-violet-600 text-white'
                      : 'text-white/60 hover:text-white',
                  )}
                >
                  Raw
                </button>
              </div>
            )}

            <Button
              size="icon"
              variant="ghost"
              onClick={() => setWordWrap(!wordWrap)}
              className={cn(
                'h-7 w-7 text-white/80 hover:text-white rounded-lg border border-white/10',
                wordWrap ? 'bg-violet-600/30 border-violet-500/40 text-violet-300' : 'bg-white/5',
              )}
              title={wordWrap ? 'Disable Word Wrap' : 'Enable Word Wrap'}
            >
              <WrapText className="h-3.5 w-3.5" />
            </Button>

            <div className="flex rounded-lg bg-white/5 p-0.5 border border-white/10">
              <button
                type="button"
                onClick={() => setFontSize('sm')}
                className={cn(
                  'px-1.5 py-0.5 text-[10px] rounded transition-colors',
                  fontSize === 'sm' ? 'bg-violet-600 text-white' : 'text-white/60 hover:text-white',
                )}
              >
                A
              </button>
              <button
                type="button"
                onClick={() => setFontSize('base')}
                className={cn(
                  'px-1.5 py-0.5 text-[10px] rounded transition-colors',
                  fontSize === 'base'
                    ? 'bg-violet-600 text-white'
                    : 'text-white/60 hover:text-white',
                )}
              >
                A+
              </button>
            </div>

            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/80 transition-colors border border-white/10"
                title="Open full page / new tab"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </a>
            )}

            <Button
              size="icon"
              variant="ghost"
              onClick={handleCopy}
              className="h-7 w-7 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
              title={copied ? 'Copied!' : 'Copy content'}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>

            <Button
              size="icon"
              variant="ghost"
              onClick={onDownload}
              className="h-7 w-7 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {isTruncated && (
          <div className="flex items-center gap-2 bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-[11px] text-amber-300 shrink-0">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>
              Preview truncated to first 5 MB for smooth performance. Download the file to view the
              full content.
            </span>
          </div>
        )}

        {/* Code / Text Content Area */}
        <div className="flex-1 min-h-0 overflow-auto bg-zinc-950 p-3 sm:p-4 font-mono custom-scrollbar">
          {category === 'markdown' && viewMode === 'formatted' ? (
            <div className="max-w-none text-white/90 text-sm p-2 sm:p-4 font-sans leading-relaxed">
              <pre className="whitespace-pre-wrap font-sans text-sm text-white/90 bg-transparent border-none p-0">
                {textContent}
              </pre>
            </div>
          ) : (
            <div className={cn('flex flex-col select-text', fontSizeClass)}>
              {filteredLines.map(({ text, lineNumber }) => (
                <div
                  key={lineNumber}
                  className="group flex items-start hover:bg-white/[0.04] py-0.5 rounded px-1"
                >
                  {showLineNumbers && (
                    <span className="w-8 sm:w-10 shrink-0 select-none text-right pr-2 sm:pr-3 text-white/20 group-hover:text-white/40 text-[10px] font-mono">
                      {lineNumber}
                    </span>
                  )}
                  <pre
                    className={cn(
                      'flex-1 font-mono text-emerald-300/90 overflow-x-auto m-0 p-0 bg-transparent border-none',
                      wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre',
                    )}
                  >
                    {text || ' '}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 7. Non-previewable Binary / Archive / Executable / Database / Package View
  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-4 sm:p-6 text-center bg-zinc-950 text-white overflow-y-auto custom-scrollbar">
      <div className="flex flex-col items-center max-w-lg w-full gap-5 sm:gap-6 p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-white/10 shadow-2xl backdrop-blur-xl my-auto">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 shadow-inner">
          {getCategoryIcon(category, 'h-10 w-10')}
        </div>

        <div className="w-full space-y-1.5">
          <div className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-white/10 bg-white/5 text-emerald-400">
            <ShieldCheck className="h-3 w-3" />
            <span>AES-256-GCM Zero-Knowledge</span>
          </div>

          <h3
            className="text-base sm:text-lg font-bold text-white break-words mt-1 px-2"
            title={item.title}
          >
            {item.title}
          </h3>

          <p className="text-xs text-text/60 max-w-sm mx-auto">
            Direct in-browser preview is not supported for this file type. You can securely decrypt
            and download it below.
          </p>
        </div>

        {/* Detailed Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 w-full text-left">
          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
            <span className="text-[9px] uppercase font-bold text-text/40 tracking-wider">Size</span>
            <p className="text-xs font-semibold text-white/90 mt-0.5">
              {formatBytes(item.metadata?.size || 0)}
            </p>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
            <span className="text-[9px] uppercase font-bold text-text/40 tracking-wider">
              Format
            </span>
            <p className="text-xs font-semibold text-white/90 mt-0.5 uppercase">
              {extension || 'FILE'}
            </p>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 col-span-2 sm:col-span-1">
            <span className="text-[9px] uppercase font-bold text-text/40 tracking-wider">Type</span>
            <p
              className="text-xs font-semibold text-white/90 mt-0.5 truncate"
              title={item.metadata?.mimeType || 'application/octet-stream'}
            >
              {item.metadata?.mimeType || 'octet-stream'}
            </p>
          </div>
        </div>

        {/* Download Action */}
        <Button
          onClick={onDownload}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-xl shadow-lg shadow-violet-600/20 py-4 sm:py-5 h-auto text-sm font-semibold transition-all hover:scale-[1.01]"
        >
          <Download className="mr-2 h-4 w-4" />
          Download Decrypted File ({formatBytes(item.metadata?.size || 0)})
        </Button>
      </div>
    </div>
  );
};

export const OtherFilesVault: React.FC = () => {
  const items = useVaultStore((state) => state.items);
  const addItem = useVaultStore((state) => state.addItem);
  const removeItem = useVaultStore((state) => state.removeItem);
  const togglePin = useVaultStore((state) => state.togglePin);
  const pinningItemIds = useVaultStore((state) => state.pinningItemIds);
  const masterKey = useVaultStore((state) => state.masterKey);
  const isPrintBlockingEnabled = useVaultStore((state) => state.preferences.isPrintBlockingEnabled);
  const isTabSwitchShieldEnabled = useVaultStore(
    (state) => state.preferences.isTabSwitchShieldEnabled,
  );
  const isPhotoExifStripped = useVaultStore((state) => state.preferences.isPhotoExifStripped);

  const [isUploading, setIsUploading] = useState(false);
  const [previewItem, setPreviewItem] = useState<string | null>(null);
  const [moveMenuOpenId, setMoveMenuOpenId] = useState<string | null>(null);

  // Anti-Screenshot, Print Blocking & Tab Switch Shield Hook
  const { isShieldActive, shieldReason, deactivateShield } = useAntiScreenshotAndShield({
    isTabSwitchShieldEnabled: isTabSwitchShieldEnabled !== false,
    isPrintBlockingEnabled: isPrintBlockingEnabled !== false,
    isViewingSensitiveMedia: Boolean(previewItem),
    customShieldMessage: '⚠️ Printing and PDF saving are prohibited for protected vault files.',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetFolder = useRef<string | null>(null);
  const targetItemId = useGlobalNavigationStore((state) => state.targetItemId);
  const setTargetItemId = useGlobalNavigationStore((state) => state.setTargetItemId);
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 8;
  const modalRef = useRef<HTMLDivElement>(null);

  const {
    folders,
    currentFolder,
    setCurrentFolder,
    isAddingFolder,
    setIsAddingFolder,
    newFolderName,
    setNewFolderName,
    editingFolder,
    setEditingFolder,
    editingFolderName,
    setEditingFolderName,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveToFolder,
  } = useVaultFolders('file');

  const {
    searchQuery,
    setSearchQuery,
    filteredItems: filteredFiles,
  } = useVaultItems('file', currentFolder);

  useEffect(() => {
    setCurrentPage(0);
  }, [currentFolder, searchQuery]);

  const currentPreviewIndex = useMemo(() => {
    if (!previewItem) return -1;
    return filteredFiles.findIndex((item) => item.id === previewItem);
  }, [filteredFiles, previewItem]);

  const canPrevious = currentPreviewIndex > 0;
  const canNext = currentPreviewIndex >= 0 && currentPreviewIndex < filteredFiles.length - 1;

  const showPreviousFile = () => {
    if (canPrevious) setPreviewItem(filteredFiles[currentPreviewIndex - 1].id);
  };
  const showNextFile = () => {
    if (canNext) setPreviewItem(filteredFiles[currentPreviewIndex + 1].id);
  };

  useEffect(() => {
    if (!targetItemId) return;
    const target = items.find((item) => item.id === targetItemId && item.type === 'file');
    if (!target) return;

    setPreviewItem(target.id);
    setTargetItemId(null);
  }, [targetItemId, items, setTargetItemId]);

  const previewedFile = filteredFiles.find((item) => item.id === previewItem) || null;

  useEffect(() => {
    if (previewItem) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [previewItem]);

  // Keyboard navigation for preview modal
  useEffect(() => {
    if (!previewItem) return;

    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll(focusableSelectors);
    const first = focusableElements[0] as HTMLElement;
    const last = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }

      if (e.key === 'ArrowRight') {
        showNextFile();
      }

      if (e.key === 'ArrowLeft') {
        showPreviousFile();
      }

      if (e.key === 'Escape') {
        setPreviewItem(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    first?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewItem, currentPreviewIndex, filteredFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    await handleUploadFiles(files, uploadTargetFolder.current);
  };

  // High-performance concurrent multi-file uploading with Web Worker E2EE, throttled progress updates, and event-loop yielding
  const handleUploadFiles = async (files: File[], targetFolder: string | null) => {
    if (!files.length) return;
    if (!masterKey && !useVaultStore.getState().isDecoyMode) return;

    const validFiles: { file: File; targetFolder: string | null }[] = [];
    for (const file of files) {
      if (exceedsUploadSizeLimit(file)) {
        toast.error(getUploadSizeErrorMessage(file));
      } else {
        validFiles.push({ file, targetFolder });
      }
    }

    if (!validFiles.length) return;

    setIsUploading(true);
    const total = validFiles.length;

    // Adaptive concurrency to avoid memory exhaustion and main thread choking on large file uploads
    const hasLargeFiles = validFiles.some((f) => f.file.size > 25 * 1024 * 1024);
    const hasMediumFiles = validFiles.some((f) => f.file.size > 8 * 1024 * 1024);
    const CONCURRENCY = hasLargeFiles
      ? 1
      : hasMediumFiles
        ? Math.min(2, total)
        : Math.min(2, total);

    const batchToastId = toast.loading(
      total === 1
        ? `Encrypting ${validFiles[0].file.name}...`
        : `Encrypting & uploading 0/${total} files...`,
    );

    let completedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let lastToastUpdateTime = 0;
    const THROTTLE_MS = 250;

    const throttledToastUpdate = (msg: string, force = false) => {
      const now = performance.now();
      if (force || now - lastToastUpdateTime > THROTTLE_MS) {
        lastToastUpdateTime = now;
        toast.loading(msg, { id: batchToastId });
      }
    };

    const yieldToMainThread = async () => {
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });
    };

    const processFile = async (itemObj: { file: File; targetFolder: string | null }) => {
      const { file, targetFolder: itemFolder } = itemObj;
      try {
        await yieldToMainThread();
        if (total === 1) {
          throttledToastUpdate(`Encrypting "${file.name}" (${formatBytes(file.size)})...`, true);
        } else {
          throttledToastUpdate(`[${completedCount + 1}/${total}] Encrypting "${file.name}"...`);
        }

        let uploadFileObj = file;
        if (
          isPhotoExifStripped &&
          (file.type.startsWith('image/') || /\.(jpe?g|png|webp|tif|tiff)$/i.test(file.name))
        ) {
          try {
            uploadFileObj = await stripExifInWorker(file);
          } catch {
            const rawBuffer = await file.arrayBuffer();
            const cleanedBuffer = stripExifInMemory(rawBuffer, file.type);
            uploadFileObj = new File([cleanedBuffer], file.name, {
              type: file.type || 'image/jpeg',
              lastModified: file.lastModified,
            });
          }
        }

        let encryptedData: Uint8Array;
        if (useVaultStore.getState().isDecoyMode || !masterKey) {
          encryptedData = new Uint8Array(await uploadFileObj.arrayBuffer());
        } else {
          encryptedData = await encryptFileInWorker(uploadFileObj, masterKey);
        }
        const fileExt = uploadFileObj.name.split('.').pop()?.toUpperCase() || 'FILE';

        await yieldToMainThread();

        await addItem(
          {
            type: 'file',
            title: uploadFileObj.name,
            content: encryptedData,
            folder: itemFolder || undefined,
            metadata: {
              mimeType: uploadFileObj.type || 'application/octet-stream',
              size: uploadFileObj.size,
              extension: fileExt,
              isE2EE: true,
              clientEncrypted: true,
            },
          },
          (progress: number) => {
            if (total === 1) {
              throttledToastUpdate(`Uploading "${file.name}" (${progress}%)...`);
            } else {
              throttledToastUpdate(
                `[${completedCount + 1}/${total}] Uploading "${file.name}" (${progress}%)...`,
              );
            }
          },
        );

        successCount++;
        logActivity({
          actionType: 'file_upload',
          itemName: file.name,
          description: `Uploaded ${fileExt} file encrypted with AES-256`,
          status: 'success',
        });
      } catch (error) {
        failedCount++;
        logActivity({
          actionType: 'file_upload',
          itemName: file.name,
          description: 'File encryption or upload failed',
          status: 'failure',
        });
      } finally {
        completedCount++;
        if (total > 1 && completedCount < total) {
          throttledToastUpdate(`Encrypting & uploading ${completedCount}/${total} files...`, true);
        }
        await yieldToMainThread();
      }
    };

    try {
      const queue = [...validFiles];
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (next) await processFile(next);
        }
      });

      await Promise.all(workers);

      if (failedCount === 0) {
        toast.success(
          total === 1
            ? `${validFiles[0].file.name} encrypted & saved securely`
            : `All ${successCount} files encrypted and saved to vault`,
          { id: batchToastId },
        );
      } else if (successCount > 0) {
        toast.warning(`Uploaded ${successCount} files (${failedCount} failed).`, {
          id: batchToastId,
        });
      } else {
        toast.error(`Failed to upload ${failedCount} files. Please check encryption key.`, {
          id: batchToastId,
        });
      }
    } finally {
      setIsUploading(false);
      uploadTargetFolder.current = null;
    }
  };

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) return;
    removeItem(id);
    toast.success(`${title} removed from vault`);
    logActivity({
      actionType: 'item_delete',
      itemName: title,
      description: 'file deleted from vault',
      status: 'success',
    });
  };

  const downloadFile = async (item: VaultItem) => {
    if (!masterKey && !useVaultStore.getState().isDecoyMode) return;
    try {
      const mimeType = item.metadata?.mimeType as string | undefined;
      const fileUrl = await getVaultItemPreviewUrl(item, masterKey, mimeType);
      if (!fileUrl) {
        toast.error('Decryption failed', {
          description:
            'The file could not be decrypted. Please check your master key and try again.',
        });
        return;
      }

      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = item.title;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (!getVaultItemFileUrl(item)) {
        window.setTimeout(() => URL.revokeObjectURL(fileUrl), 2000);
      }
      toast.success(`Downloading ${item.title}`);
      logActivity({
        actionType: 'file_download',
        itemName: item.title,
        description: 'File decrypted and downloaded',
        status: 'success',
      });
    } catch {
      toast.error('Download failed. Could not decrypt file.');
      logActivity({
        actionType: 'file_download',
        itemName: item.title,
        description: 'File download failed',
        status: 'failure',
      });
    }
  };

  return (
    <VaultLayout
      title="Other Files"
      description={
        currentFolder
          ? `Files in folder "${currentFolder}"`
          : 'Securely store source code, archives, datasets, binaries, and explicit files.'
      }
      items={items.filter((i) => i.type === 'file')}
      itemTypeLabel="other"
      allItemLabel="All Files"
      onUpload={(folder?: string | null) => {
        uploadTargetFolder.current = folder ?? currentFolder;
        fileInputRef.current?.click();
      }}
      onFileDrop={(files, folder) => handleUploadFiles(files, folder ?? currentFolder)}
      isUploading={isUploading}
      uploadLabel="Upload File"
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      folders={folders}
      currentFolder={currentFolder}
      onFolderSelect={setCurrentFolder}
      sidebarIcon={Package}
      folderControls={{
        isAdding: isAddingFolder,
        setIsAdding: setIsAddingFolder,
        newName: newFolderName,
        setNewName: setNewFolderName,
        editing: editingFolder,
        setEditing: setEditingFolder,
        editingName: editingFolderName,
        setEditingName: setEditingFolderName,
        onCreate: handleCreateFolder,
        onRename: handleRenameFolder,
        onDelete: handleDeleteFolder,
      }}
      onMoveItemToFolder={handleMoveToFolder}
    >
      <input type="file" ref={fileInputRef} multiple onChange={handleUpload} className="hidden" />

      {filteredFiles.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 opacity-40 cursor-pointer hover:opacity-70 transition-opacity"
          onClick={() => {
            uploadTargetFolder.current = currentFolder;
            fileInputRef.current?.click();
          }}
        >
          <Package className="mb-4 h-16 w-16 text-violet-400" />
          <p className="text-lg">No files found.</p>
          <p className="text-xs mt-1">Tap or drop files to upload securely</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6 sm:gap-10">
          {filteredFiles
            .slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE)
            .map((item, idx) => {
              const itemExt = (
                item.metadata?.extension ||
                item.title.split('.').pop() ||
                ''
              ).toUpperCase();
              const itemCategory = getFileCategory(itemExt);
              const badgeStyle = getCategoryBadgeColor(itemCategory);

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ y: -5 }}
                  transition={{ delay: idx * 0.03 }}
                  draggable
                  onDragStartCapture={(event) => setDraggedVaultItem(event, item.id)}
                  onDragEnd={clearDraggedVaultItem}
                  onTouchStartCapture={(event: React.TouchEvent) =>
                    setDraggedVaultItem(event as any, item.id)
                  }
                  title="Drag to a folder to move this file"
                >
                  <Card
                    className={cn(
                      'group relative border-white/5 bg-gradient-to-br from-white/[0.08] to-transparent backdrop-blur-md transition-all hover:border-white/20 hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)]',
                      moveMenuOpenId === item.id ? 'z-50' : 'z-10',
                    )}
                  >
                    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-violet-500/10 blur-3xl transition-opacity group-hover:opacity-30" />
                    </div>

                    <CardContent className="p-5 sm:p-6 relative z-10">
                      <div className="flex flex-col items-center text-center">
                        <div className="mb-4 relative">
                          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 transition-transform group-hover:scale-110 group-hover:rotate-3 shadow-inner">
                            {getCategoryIcon(itemCategory, 'h-10 w-10')}
                          </div>
                          <div
                            className={cn(
                              'absolute -bottom-1 -right-1 rounded-lg px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-tighter shadow-lg border',
                              badgeStyle,
                            )}
                          >
                            {itemExt || 'FILE'}
                          </div>
                        </div>

                        <div className="w-full space-y-1">
                          <h3 className="truncate text-sm font-semibold text-text transition-colors">
                            {item.title}
                          </h3>
                          <div className="flex items-center justify-center gap-2">
                            <p className="text-[10px] font-medium text-text/40 transition-colors">
                              {formatBytes(item.metadata?.size || 0)}
                            </p>
                            {item.folder && (
                              <span className="flex max-w-full items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[8px] font-medium text-violet-400/60 uppercase">
                                <Folder className="h-2 w-2 shrink-0" />
                                <span className="truncate" title={item.folder}>
                                  {item.folder}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 flex items-center justify-between gap-2 border-t border-white/5 pt-4 opacity-100 transition-all text-white">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 flex-1 bg-white/5 hover:bg-white/10 text-xs gap-2 text-white"
                          onClick={() => {
                            setPreviewItem(item.id);
                            logActivity({
                              actionType: 'file_preview',
                              itemName: item.title,
                              description: 'file preview opened',
                              status: 'success',
                            });
                          }}
                        >
                          <Eye className="h-3.5 w-3.5 text-violet-400" />
                          Preview
                        </Button>

                        <div className="flex gap-1">
                          <div className="relative">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'h-9 w-9 bg-white/5 hover:bg-white/10 text-white',
                                moveMenuOpenId === item.id && 'bg-white/20',
                              )}
                              onClick={() =>
                                setMoveMenuOpenId(moveMenuOpenId === item.id ? null : item.id)
                              }
                              title="Move to folder"
                            >
                              <Move className="h-3.5 w-3.5" />
                            </Button>
                            <AnimatePresence>
                              {moveMenuOpenId === item.id && (
                                <motion.div key="move-menu-overlay" className="contents">
                                  <motion.div
                                    key="move-menu-backdrop"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 z-10"
                                    onClick={() => setMoveMenuOpenId(null)}
                                  />
                                  <motion.div
                                    key="move-menu-dropdown"
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute bottom-full right-0 mb-2 w-56 flex-col rounded-2xl border border-white/10 bg-zinc-900/95 p-1 shadow-2xl backdrop-blur-xl z-20 flex"
                                  >
                                    <p className="px-3 py-2 text-[9px] font-bold text-white/40 uppercase tracking-widest text-white">
                                      Move to Folder
                                    </p>

                                    <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2.5 mb-1 bg-white/[0.02] rounded-xl">
                                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 shadow-[0_0_10px_rgba(139,92,246,0.15)]">
                                        <Package className="h-4 w-4" />
                                      </div>
                                      <div className="flex flex-col min-w-0">
                                        <span
                                          className="truncate text-xs font-semibold text-white/95"
                                          title={item.title}
                                        >
                                          {item.title}
                                        </span>
                                        <span className="flex items-center gap-1 text-[9px] text-white/45">
                                          <span>Folder:</span>
                                          <span
                                            className="truncate max-w-[100px] font-medium text-violet-400"
                                            title={item.folder || 'All Files'}
                                          >
                                            {item.folder || 'All Files'}
                                          </span>
                                        </span>
                                      </div>
                                    </div>

                                    <div className="max-h-[108px] overflow-y-auto custom-scrollbar">
                                      <button
                                        className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/5 flex items-center gap-2 transition-colors text-white"
                                        onClick={() => {
                                          handleMoveToFolder(item.id, null);
                                          setMoveMenuOpenId(null);
                                        }}
                                      >
                                        <Package className="h-3 w-3 opacity-40 text-violet-400" />
                                        All Files
                                      </button>
                                      {folders.map((f) => (
                                        <button
                                          key={f}
                                          title={f}
                                          className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/5 flex items-center gap-2 transition-colors text-white"
                                          onClick={() => {
                                            handleMoveToFolder(item.id, f);
                                            setMoveMenuOpenId(null);
                                          }}
                                        >
                                          <Folder className="h-3 w-3 opacity-40 text-violet-400" />
                                          {f.length > 8 ? `${f.slice(0, 8)}...` : f}
                                        </button>
                                      ))}
                                    </div>
                                  </motion.div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={pinningItemIds.includes(item.id)}
                            className={cn(
                              'h-9 w-9 transition-all',
                              item.isPinned
                                ? 'bg-slate-300/20 text-slate-300 hover:bg-slate-300/30 border border-slate-300/40'
                                : 'bg-white/5 hover:bg-white/10 text-white',
                            )}
                            onClick={() => void togglePin(item.id)}
                            title={item.isPinned ? 'Unpin' : 'Pin'}
                          >
                            {pinningItemIds.includes(item.id) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Pin className={cn('h-3.5 w-3.5', item.isPinned && 'fill-current')} />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 bg-white/5 hover:bg-white/10 text-white"
                            onClick={() => downloadFile(item)}
                            title="Download"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 bg-white/5 hover:bg-red-500/10 text-red-400/60 hover:text-red-400 border border-red-500/10"
                            onClick={() => handleDelete(item.id, item.title)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
        </div>
      )}

      {/* Pagination Controls */}
      {filteredFiles.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-center gap-8 pb-32 mt-12">
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button
              variant="outline"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
              className="h-10 w-10 rounded-full border-white/10 bg-white/5 p-0 text-text/60 backdrop-blur-xl transition-all hover:border-white/30 hover:bg-white/10 hover:text-text disabled:opacity-10 disabled:cursor-not-allowed shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]"
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </motion.div>

          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-3 rounded-full bg-white/5 px-6 py-2 border border-white/5 backdrop-blur-md shadow-inner">
              <span className="text-lg font-bold text-text tabular-nums text-white">
                {currentPage + 1}
              </span>
              <div className="h-4 w-[1px] bg-white/10" />
              <span className="text-sm font-medium text-text/40 tabular-nums text-white/40">
                {Math.ceil(filteredFiles.length / ITEMS_PER_PAGE)}
              </span>
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-text/20 font-bold">
              Page
            </span>
          </div>

          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button
              variant="outline"
              disabled={(currentPage + 1) * ITEMS_PER_PAGE >= filteredFiles.length}
              onClick={() => setCurrentPage((prev) => prev + 1)}
              className="h-10 w-10 rounded-full border-white/10 bg-white/5 p-0 text-text/60 backdrop-blur-xl transition-all hover:border-white/30 hover:bg-white/10 hover:text-text disabled:opacity-10 disabled:cursor-not-allowed shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </motion.div>
        </div>
      )}

      {/* Universal Preview Modal identical to DocumentsVault with Responsive Sizing */}
      <AnimatePresence>
        {previewItem && previewedFile && (
          <motion.div
            key="file-preview-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-2xl p-2 sm:p-4 md:p-6 transition-colors duration-300"
            ref={modalRef}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setPreviewItem(null);
              }
            }}
          >
            <div className="absolute right-3 sm:right-6 top-3 sm:top-6 z-50 flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full bg-white/10 hover:bg-rose-500/30 hover:text-rose-300 text-white backdrop-blur-md border border-white/10 shadow-lg"
                onClick={() => setPreviewItem(null)}
                title="Close preview (Esc)"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <GlobalNavigator
              canPrevious={canPrevious}
              canNext={canNext}
              onPrevious={showPreviousFile}
              onNext={showNextFile}
              layout="overlay"
            />
            <div className="relative h-[92vh] sm:h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-zinc-950 border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.7)] transition-all flex flex-col min-h-0 doc-preview-content vault-print-protected">
              <SafeUniversalPreview
                item={previewedFile}
                masterKey={masterKey!}
                onDownload={() => downloadFile(previewedFile)}
              />

              {/* Tab Switch Auto-Shield Overlay */}
              <AnimatePresence>
                {isShieldActive && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                    className="vault-tab-switch-shield"
                    onClick={deactivateShield}
                  >
                    <div className="flex flex-col items-center gap-3 p-6 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 border border-white/20 backdrop-blur-xl">
                        <ShieldAlert className="h-7 w-7 text-amber-400" />
                      </div>
                      <p className="text-base font-bold text-white tracking-wide">
                        {shieldReason === 'print-attempt'
                          ? 'File Print Protection Active'
                          : 'Shield Active • File Protected'}
                      </p>
                      <p className="text-xs text-white/60 max-w-xs leading-relaxed">
                        {shieldReason === 'print-attempt'
                          ? 'Printing or PDF exporting of encrypted files is disabled.'
                          : 'File hidden to prevent multitasking switcher capture. Click or focus window to resume.'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Print Blocked Notice for @media print */}
            <div className="vault-print-blocked-notice">
              <div className="flex items-center gap-2 text-red-600 mb-2">
                <ShieldAlert className="h-8 w-8" />
                <span className="text-xl font-bold">Encrypted File Protected</span>
              </div>
              <p className="text-sm text-red-800/80">
                File printing is blocked by Vault Security Policy.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </VaultLayout>
  );
};
export default OtherFilesVault;
