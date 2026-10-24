import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import {
  Trash2,
  Eye,
  X,
  Loader2,
  AlertTriangle,
  Folder,
  Download,
  ChevronLeft,
  ChevronRight,
  Move,
  FilePlus,
  Pin,
  FileText,
  FileSpreadsheet,
  FileCode,
  FileArchive,
  Presentation,
  BookOpen,
  Copy,
  Check,
  Search,
  Maximize2,
  ShieldCheck,
  Lock,
  Layers,
  WrapText,
  ShieldAlert,
  Share2,
} from 'lucide-react';
import { PdfViewer } from './components/PdfViewer/PdfViewer';
import { useAntiScreenshotAndShield } from '../../hooks/useAntiScreenshotAndShield';
import { toast } from 'sonner';
import { logger } from '../../lib/logger';
import { useVaultStore } from '../../store/vaultStore';
import { VaultItem } from '../../lib/storage';
import { encryptFileInWorker } from '../../lib/cryptoPrimitives';
import { stripExifInWorker, stripExifInMemory } from '../../lib/mediaWorker';
import { motion, AnimatePresence } from 'framer-motion';
import { GlobalNavigator } from '../../components/vault/GlobalNavigator';
import { useGlobalNavigationStore } from '../../store/globalNavigationStore';
import { logActivity } from '../../lib/activity';
import {
  describeVaultPreviewError,
  getVaultItemFileUrl,
  getVaultItemPreviewRevision,
  getVaultItemPreviewUrl,
} from '../../lib/filePreview';

import { useVaultFolders } from '../../hooks/useVaultFolders';
import { useVaultItems } from '../../hooks/useVaultItems';
import { VaultLayout } from '../../components/layout/VaultLayout';
import { cn } from '../../lib/utils';
import { setDraggedVaultItem, clearDraggedVaultItem } from '../../lib/vaultDragDrop';
import {
  exceedsUploadSizeLimit,
  getUploadSizeErrorMessage,
  openDocumentInMobileApp,
  DOCUMENT_FILE_INPUT_ACCEPT,
  DOCUMENT_FILE_EXTENSIONS,
  PHOTO_FILE_EXTENSIONS,
  getDocumentMimeType,
  getDocumentCategory,
  DocumentCategory,
} from '../../lib/fileHandling';

interface SafeDocumentPreviewProps {
  item: VaultItem;
  masterKey: string | CryptoKey;
  onDownload: () => void;
}

const TEXT_DATA_EXTENSIONS = new Set([
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
]);

const CSV_EXTENSIONS = new Set(['CSV', 'TSV', 'PSV', 'SSV']);
const JSON_EXTENSIONS = new Set(['JSON', 'JSONL', 'NDJSON']);
const MARKDOWN_EXTENSIONS = new Set(['MD', 'MARKDOWN']);
const PDF_EXTENSIONS = new Set(['PDF', 'FDF', 'XFDF']);
const IMAGE_EXTENSIONS = new Set<string>(PHOTO_FILE_EXTENSIONS);
const SUPPORTED_DOCUMENT_EXTENSIONS = new Set<string>(
  DOCUMENT_FILE_EXTENSIONS as readonly string[],
);

const getCategoryIcon = (category: DocumentCategory, className = 'h-10 w-10') => {
  switch (category) {
    case 'pdf':
      return <FileText className={cn(className, 'text-rose-400')} />;
    case 'word':
      return <FileText className={cn(className, 'text-blue-400')} />;
    case 'spreadsheet':
      return <FileSpreadsheet className={cn(className, 'text-emerald-400')} />;
    case 'presentation':
      return <Presentation className={cn(className, 'text-amber-400')} />;
    case 'code':
    case 'text':
      return <FileCode className={cn(className, 'text-cyan-400')} />;
    case 'ebook':
      return <BookOpen className={cn(className, 'text-purple-400')} />;
    case 'archive':
      return <FileArchive className={cn(className, 'text-orange-400')} />;
    case 'image':
      return <Layers className={cn(className, 'text-pink-400')} />;
    default:
      return <FilePlus className={cn(className, 'text-violet-400')} />;
  }
};

const getCategoryBadgeColor = (category: DocumentCategory) => {
  switch (category) {
    case 'pdf':
      return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
    case 'word':
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'spreadsheet':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'presentation':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    case 'code':
    case 'text':
      return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    case 'ebook':
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case 'archive':
      return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
    case 'image':
      return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
    default:
      return 'bg-violet-500/20 text-violet-300 border-violet-500/30';
  }
};

const getCategoryName = (category: DocumentCategory): string => {
  switch (category) {
    case 'pdf':
      return 'PDF Document';
    case 'word':
      return 'Word Document';
    case 'spreadsheet':
      return 'Spreadsheet';
    case 'presentation':
      return 'Presentation';
    case 'text':
      return 'Plain Text / Doc';
    case 'code':
      return 'Code / Structured Data';
    case 'ebook':
      return 'eBook Publication';
    case 'archive':
      return 'Compressed Archive';
    case 'image':
      return 'Document Scan / Image';
    default:
      return 'Document';
  }
};

// Delimiter auto-detector & parser for CSV/TSV/PSV/SSV
const parseDelimitedText = (raw: string, ext: string) => {
  if (!raw.trim()) return { headers: [], rows: [] };
  let delimiter = ',';
  if (ext === 'TSV') delimiter = '\t';
  else if (ext === 'PSV') delimiter = '|';
  else if (ext === 'SSV') delimiter = ';';
  else {
    const firstLine = raw.split('\n')[0] || '';
    const commas = (firstLine.match(/,/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;
    const pipes = (firstLine.match(/\|/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    if (tabs > commas && tabs >= pipes) delimiter = '\t';
    else if (pipes > commas && pipes >= semicolons) delimiter = '|';
    else if (semicolons > commas) delimiter = ';';
  }

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (!lines.length) return { headers: [], rows: [] };

  const parsedLines = lines.slice(0, 500).map((line) => {
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

  const headers = parsedLines[0] || [];
  const rows = parsedLines.slice(1);
  return { headers, rows };
};

// Safe simple Markdown renderer
const renderMarkdownPreview = (text: string) => {
  const lines = text.split(/\r?\n/);
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  lines.forEach((line, idx) => {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${idx}`}
            className="my-3 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs text-cyan-300 border border-white/10"
          >
            {codeBuffer.join('\n')}
          </pre>,
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      return;
    }

    if (line.startsWith('# ')) {
      elements.push(
        <h1
          key={idx}
          className="mt-4 mb-2 text-xl font-bold text-white border-b border-white/10 pb-1"
        >
          {line.replace('# ', '')}
        </h1>,
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={idx} className="mt-3 mb-1 text-lg font-semibold text-white/90">
          {line.replace('## ', '')}
        </h2>,
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={idx} className="mt-2 mb-1 text-base font-medium text-white/80">
          {line.replace('### ', '')}
        </h3>,
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={idx} className="ml-4 list-disc text-sm text-text/80 my-0.5">
          {line.substring(2)}
        </li>,
      );
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote
          key={idx}
          className="my-2 border-l-4 border-violet-500 bg-violet-500/10 px-3 py-1.5 text-sm italic text-text/80 rounded-r"
        >
          {line.substring(2)}
        </blockquote>,
      );
    } else if (line.trim() === '---' || line.trim() === '***') {
      elements.push(<hr key={idx} className="my-4 border-white/10" />);
    } else if (line.trim()) {
      elements.push(
        <p key={idx} className="my-1.5 text-sm leading-relaxed text-text/80">
          {line}
        </p>,
      );
    }
  });

  return elements;
};

const SafeDocumentPreview: React.FC<SafeDocumentPreviewProps> = ({
  item,
  masterKey,
  onDownload,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');
  const [tableSearch, setTableSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(false);

  const mimeType = item.metadata?.mimeType || '';
  const extension = (item.metadata?.extension || item.title.split('.').pop() || '').toUpperCase();
  const category = getDocumentCategory(extension);

  const isPdf = PDF_EXTENSIONS.has(extension) || mimeType === 'application/pdf';
  const isImage =
    category === 'image' || IMAGE_EXTENSIONS.has(extension) || mimeType.startsWith('image/');
  const isText = TEXT_DATA_EXTENSIONS.has(extension) || mimeType.startsWith('text/');
  const isCsvType = CSV_EXTENSIONS.has(extension);
  const isJsonType = JSON_EXTENSIONS.has(extension);
  const isMarkdownType = MARKDOWN_EXTENSIONS.has(extension);

  const isLocalPreviewHost = url
    ? /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(url) ||
      url.startsWith('blob:') ||
      url.startsWith('data:')
    : false;
  const officePreviewUrl =
    url && !isLocalPreviewHost && category === 'word'
      ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
      : null;

  const rsaKeyPair = useVaultStore((state) => state.rsaKeyPair);

  const previewRevision = useMemo(
    () => getVaultItemPreviewRevision(item),
    [
      item.id,
      item.updatedAt,
      item.content instanceof Uint8Array ? item.content.byteLength : 0,
      typeof item.content === 'string' ? item.content.length : 0,
      mimeType,
    ],
  );

  useEffect(() => {
    let isMounted = true;
    let activeObjectUrl: string | null = null;

    const loadPreview = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      setUrl(null);
      setTextContent('');

      try {
        const effectiveMime = mimeType || getDocumentMimeType(item.title);
        const result = await getVaultItemPreviewUrl(
          item,
          masterKey,
          effectiveMime,
          rsaKeyPair?.privateKey,
        );
        if (!result) {
          throw new Error('Could not decrypt document for preview.');
        }

        if (!isMounted) {
          if (result.startsWith('blob:')) {
            URL.revokeObjectURL(result);
          }
          return;
        }

        activeObjectUrl = result.startsWith('blob:') ? result : null;
        setUrl(result);

        if (isText) {
          const response = await fetch(result);
          if (!response.ok) {
            throw new Error(`Could not read text preview (${response.status}).`);
          }

          const content = await response.text();
          if (isMounted) {
            setTextContent(content);
          }
        }
      } catch (err) {
        logger.warn('[SafeDocumentPreview]', { error: err });
        if (isMounted) {
          setErrorMessage(describeVaultPreviewError(err));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadPreview();

    const handlePanicLock = () => {
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = null;
      }
      setUrl(null);
      setTextContent('');
      setIsLoading(false);
    };

    window.addEventListener('vault:panic-lock', handlePanicLock);

    return () => {
      isMounted = false;
      window.removeEventListener('vault:panic-lock', handlePanicLock);
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
      }
    };
  }, [
    previewRevision,
    masterKey,
    mimeType,
    isText,
    isPdf,
    category,
    isImage,
    item,
    rsaKeyPair?.privateKey,
  ]);

  const handleCopyText = useCallback(() => {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    toast.success('Content copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }, [textContent]);

  const parsedCsv = useMemo(() => {
    if (!isCsvType || !textContent) return { headers: [], rows: [] };
    return parseDelimitedText(textContent, extension);
  }, [isCsvType, textContent, extension]);

  const filteredCsvRows = useMemo(() => {
    if (!tableSearch.trim()) return parsedCsv.rows;
    const q = tableSearch.toLowerCase();
    return parsedCsv.rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(q)));
  }, [parsedCsv.rows, tableSearch]);

  const formattedJson = useMemo(() => {
    if (!isJsonType || !textContent) return null;
    try {
      if (extension === 'JSONL' || extension === 'NDJSON') {
        const lines = textContent
          .split('\n')
          .filter((l) => l.trim().length > 0)
          .map((l) => JSON.parse(l));
        return JSON.stringify(lines, null, 2);
      }
      const parsed = JSON.parse(textContent);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return textContent;
    }
  }, [isJsonType, textContent, extension]);

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[350px] flex-col items-center justify-center gap-4">
        <div className="relative flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-violet-400/60" />
          <Lock className="absolute h-5 w-5 text-violet-400/80 animate-pulse" />
        </div>
        <p className="text-sm font-medium text-text/60">Decrypting document securely...</p>
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
            {errorMessage || 'Document could not be decrypted or loaded.'}
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

  // 1. PDF / FDF / XFDF
  if (isPdf && url) {
    return (
      <PdfViewer
        url={url}
        title={item.title}
        extension={extension || 'PDF'}
        onDownload={onDownload}
      />
    );
  }

  // 2. High-res Scan / TIFF Image
  if (isImage) {
    return (
      <div className="flex h-full w-full flex-col bg-zinc-950 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/90 px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="rounded-md bg-pink-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-pink-400 border border-pink-500/30">
              {extension}
            </span>
            <span className="truncate text-xs font-semibold text-white/90">{item.title}</span>
          </div>
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
        <div className="flex flex-1 items-center justify-center p-4 overflow-auto">
          <img
            src={url}
            alt={item.title || 'Document preview'}
            loading="eager"
            decoding="async"
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onError={() => setErrorMessage('Image preview failed to render.')}
          />
        </div>
      </div>
    );
  }

  // 3. Formatted CSV / TSV / PSV / SSV Data Grid
  if (isCsvType) {
    return (
      <div className="flex h-full w-full flex-col bg-zinc-950 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/90 px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-400 border border-emerald-500/30">
              {extension}
            </span>
            <span className="truncate text-xs font-semibold text-white/90 max-w-[200px] sm:max-w-xs">
              {item.title}
            </span>
            <span className="hidden sm:inline-block text-[10px] text-text/40">
              ({parsedCsv.rows.length} rows, {parsedCsv.headers.length} cols)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Filter table..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="h-7 w-28 sm:w-36 rounded-lg bg-white/5 pl-8 pr-2 text-xs text-white placeholder:text-white/30 border border-white/10 focus:outline-none focus:border-violet-500"
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
              onClick={handleCopyText}
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

        <div className="flex-1 overflow-auto p-4 custom-scrollbar">
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

  // 4. Markdown Formatted View
  if (isMarkdownType) {
    return (
      <div className="flex h-full w-full flex-col bg-zinc-950 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/90 px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-400 border border-cyan-500/30">
              {extension}
            </span>
            <span className="truncate text-xs font-semibold text-white/90">{item.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-white/5 p-0.5 border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode('formatted')}
                className={cn(
                  'px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors',
                  viewMode === 'formatted'
                    ? 'bg-violet-600 text-white'
                    : 'text-white/60 hover:text-white',
                )}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setViewMode('raw')}
                className={cn(
                  'px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors',
                  viewMode === 'raw'
                    ? 'bg-violet-600 text-white'
                    : 'text-white/60 hover:text-white',
                )}
              >
                Source
              </button>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleCopyText}
              className="h-7 w-7 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
              title={copied ? 'Copied!' : 'Copy markdown'}
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
        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
          {viewMode === 'formatted' ? (
            <div className="max-w-3xl mx-auto rounded-2xl bg-zinc-900/60 p-6 border border-white/10 shadow-xl">
              {renderMarkdownPreview(textContent)}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words rounded-xl bg-black/40 p-4 font-mono text-xs text-cyan-300/90 border border-white/10">
              {textContent || 'Empty markdown file.'}
            </pre>
          )}
        </div>
      </div>
    );
  }

  // 5. Code, JSON & Formatted Text
  if (isText) {
    const isJson = isJsonType;
    const displayText = isJson && formattedJson ? formattedJson : textContent;
    const lines = displayText.split('\n');

    return (
      <div className="flex h-full w-full flex-col bg-zinc-950 overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-900/90 px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-400 border border-cyan-500/30">
              {extension || 'TEXT'}
            </span>
            <span className="truncate text-xs font-semibold text-white/90">{item.title}</span>
            <span className="hidden sm:inline-block text-[10px] text-text/40">
              ({lines.length} lines)
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
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
              onClick={() => setWrapLines(!wrapLines)}
              className={cn(
                'h-7 w-7 rounded-lg border transition-colors',
                wrapLines
                  ? 'bg-violet-600/30 text-violet-300 border-violet-500/40'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80 hover:text-white',
              )}
              title={wrapLines ? 'Disable word wrap' : 'Enable word wrap'}
            >
              <WrapText className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleCopyText}
              className="h-7 w-7 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
              title={copied ? 'Copied!' : 'Copy to clipboard'}
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
        <div className="flex-1 overflow-auto p-4 custom-scrollbar">
          <div className="w-full overflow-x-auto rounded-xl bg-black/50 border border-white/10 p-2 font-mono text-xs shadow-inner">
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.03] transition-colors leading-6 group">
                    <td className="w-12 min-w-[3rem] select-none pr-3 text-right text-[11px] font-mono text-white/30 border-r border-white/10 align-top tabular-nums group-hover:text-white/60">
                      {idx + 1}
                    </td>
                    <td
                      className={cn(
                        'pl-3 pr-2 text-text/80 align-top font-mono leading-6',
                        wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre break-normal',
                      )}
                    >
                      {line || ' '}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // 6. Office Live Online View (when public server URL is present)
  if (officePreviewUrl) {
    return (
      <iframe
        src={officePreviewUrl}
        title={item.title}
        className="h-full w-full border-none bg-white"
      />
    );
  }

  // 7. Interactive Category Reader Cards for Spreadsheets, Presentations, Word Docs, eBooks & Archives
  const categoryName = getCategoryName(category);
  const badgeClass = getCategoryBadgeColor(category);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-6 sm:p-12 text-center bg-zinc-950 overflow-auto">
      <div className="relative mb-6">
        <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-white/[0.04] border border-white/10 shadow-2xl backdrop-blur-xl transition-transform hover:scale-105">
          {getCategoryIcon(category, 'h-14 w-14')}
        </div>
        <div
          className={cn(
            'absolute -bottom-2 -right-2 rounded-xl px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border shadow-lg',
            badgeClass,
          )}
        >
          {extension}
        </div>
      </div>

      <div className="max-w-md space-y-2 mb-8">
        <h3 className="text-xl font-bold text-white tracking-tight" title={item.title}>
          {item.title}
        </h3>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-medium text-white/60 border border-white/5">
            {categoryName}
          </span>
          <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-medium text-white/40 border border-white/5">
            {((item.metadata?.size || 0) / 1024).toFixed(1)} KB
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="h-3 w-3" />
            Decrypted & Verified
          </span>
        </div>
        <p className="text-xs text-text/50 pt-2 leading-relaxed">
          This document is stored under zero-knowledge end-to-end encryption. You can view or save
          the decrypted file instantly on any device.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={onDownload}
          className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2.5 rounded-xl shadow-lg shadow-violet-600/30 text-sm font-semibold transition-all hover:scale-[1.02]"
        >
          <Download className="mr-2 h-4 w-4" />
          Download Decrypted File
        </Button>
        {url && (
          <Button
            onClick={() =>
              void openDocumentInMobileApp({
                title: item.title,
                url,
                content: item.content instanceof Uint8Array ? item.content : null,
                mimeType,
                onFallbackDownload: onDownload,
              })
            }
            variant="outline"
            className="inline-flex items-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition-colors border border-white/10"
          >
            <Share2 className="h-4 w-4 text-violet-400" />
            Open in App
          </Button>
        )}
      </div>
    </div>
  );
};

export const DocumentsVault: React.FC = () => {
  const items = useVaultStore((state) => state.items);
  const addItem = useVaultStore((state) => state.addItem);
  const removeItem = useVaultStore((state) => state.removeItem);
  const togglePin = useVaultStore((state) => state.togglePin);
  const pinningItemIds = useVaultStore((state) => state.pinningItemIds);
  const masterKey = useVaultStore((state) => state.masterKey);
  const allowRestrictedTypes = useVaultStore((state) => state.allowRestrictedTypes);
  const setAllowRestrictedTypes = useVaultStore((state) => state.setAllowRestrictedTypes);
  const isPrintBlockingEnabled = useVaultStore((state) => state.preferences.isPrintBlockingEnabled);
  const isTabSwitchShieldEnabled = useVaultStore(
    (state) => state.preferences.isTabSwitchShieldEnabled,
  );
  const isPhotoExifStripped = useVaultStore((state) => state.preferences.isPhotoExifStripped);

  const [isUploading, setIsUploading] = useState(false);
  const [previewItem, setPreviewItem] = useState<string | null>(null);
  const [moveMenuOpenId, setMoveMenuOpenId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 8;

  // Anti-Screenshot, Print Blocking & Tab Switch Shield Hook
  const { isShieldActive, shieldReason, deactivateShield } = useAntiScreenshotAndShield({
    isTabSwitchShieldEnabled: isTabSwitchShieldEnabled !== false,
    isPrintBlockingEnabled: isPrintBlockingEnabled !== false,
    isViewingSensitiveMedia: Boolean(previewItem),
    customShieldMessage: '⚠️ Printing and PDF saving are prohibited for protected vault documents.',
  });

  const isSupportedDocumentFile = (file: File) => {
    const extension = file.name.split('.').pop()?.toUpperCase() || '';
    return SUPPORTED_DOCUMENT_EXTENSIONS.has(extension);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetFolder = useRef<string | null>(null);
  const targetItemId = useGlobalNavigationStore((state) => state.targetItemId);
  const setTargetItemId = useGlobalNavigationStore((state) => state.setTargetItemId);
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
  } = useVaultFolders('document');

  const { searchQuery, setSearchQuery, filteredItems } = useVaultItems('document', currentFolder);

  useEffect(() => {
    setCurrentPage(0);
  }, [currentFolder, searchQuery]);

  const previewedDocument = useMemo(
    () => filteredItems.find((item) => item.id === previewItem) ?? null,
    [filteredItems, previewItem],
  );

  const currentPreviewIndex = useMemo(() => {
    if (!previewItem) return -1;
    return filteredItems.findIndex((item) => item.id === previewItem);
  }, [filteredItems, previewItem]);

  const canPrevious = currentPreviewIndex > 0;
  const canNext = currentPreviewIndex >= 0 && currentPreviewIndex < filteredItems.length - 1;

  const showPreviousDocument = () => {
    if (canPrevious) setPreviewItem(filteredItems[currentPreviewIndex - 1].id);
  };
  const showNextDocument = () => {
    if (canNext) setPreviewItem(filteredItems[currentPreviewIndex + 1].id);
  };

  useEffect(() => {
    if (!targetItemId) return;
    const target = filteredItems.find((item) => item.id === targetItemId);
    if (!target) return;

    setPreviewItem(target.id);
    setTargetItemId(null);
  }, [targetItemId, filteredItems, setTargetItemId]);

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
        showNextDocument();
      }

      if (e.key === 'ArrowLeft') {
        showPreviousDocument();
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
  }, [previewItem]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    await handleUploadFiles(files, uploadTargetFolder.current);
  };

  // High-performance, concurrent, leak-proof multi-file upload handler
  const handleUploadFiles = async (files: File[], targetFolder: string | null) => {
    if (!files.length) return;
    if (!masterKey && !useVaultStore.getState().isDecoyMode) return;

    const harmfulTypes = ['.exe', '.dll', '.js', '.vbs', '.bat', '.cmd', '.sh', '.msi'];

    setIsUploading(true);
    const validFiles: { file: File; targetFolder: string | null }[] = [];

    for (const file of files) {
      if (!isSupportedDocumentFile(file)) {
        toast.error(`"${file.name}" is not in the supported documents list and was skipped.`);
        continue;
      }
      if (exceedsUploadSizeLimit(file)) {
        toast.error(getUploadSizeErrorMessage(file));
        continue;
      }

      const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
      if (harmfulTypes.includes(fileExtension) && !allowRestrictedTypes) {
        toast.error('Restricted file type blocked', {
          description:
            'Executables and scripts are restricted for security. You can enable them in Settings.',
          action: {
            label: 'Enable',
            onClick: () => {
              setAllowRestrictedTypes(true);
              toast.info('Restricted types enabled.');
            },
          },
        });
        continue;
      }

      const folderFromPath = (file as any).webkitRelativePath
        ? (file as any).webkitRelativePath.split('/')[0]
        : null;
      validFiles.push({ file, targetFolder: folderFromPath || targetFolder });
    }

    const total = validFiles.length;
    if (total === 0) {
      setIsUploading(false);
      uploadTargetFolder.current = null;
      return;
    }

    const batchToastId = toast.loading(
      total === 1 ? `Encrypting and uploading document...` : `Encrypting 0/${total} documents...`,
    );

    let completedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    const CONCURRENCY = Math.min(4, total);

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
        await yieldToMainThread();
        let encryptedData: Uint8Array;
        if (useVaultStore.getState().isDecoyMode || !masterKey) {
          encryptedData = new Uint8Array(await uploadFileObj.arrayBuffer());
        } else {
          encryptedData = await encryptFileInWorker(uploadFileObj, masterKey);
        }
        await yieldToMainThread();
        const resolvedMimeType =
          uploadFileObj.type && uploadFileObj.type !== 'application/octet-stream'
            ? uploadFileObj.type
            : getDocumentMimeType(uploadFileObj.name);

        await addItem({
          type: 'document',
          title: file.name,
          content: encryptedData,
          folder: itemFolder || undefined,
          metadata: {
            mimeType: resolvedMimeType,
            size: file.size,
            extension: file.name.split('.').pop()?.toUpperCase() || 'DOCUMENT',
            isE2EE: true,
            clientEncrypted: true,
          },
        });

        successCount++;
      } catch (error) {
        failedCount++;
        logActivity({
          actionType: 'file_upload',
          itemName: file.name,
          description: 'document upload failed',
          status: 'failure',
        });
      } finally {
        completedCount++;
        if (total > 1 && completedCount < total) {
          toast.loading(`Encrypting & uploading ${completedCount}/${total} documents...`, {
            id: batchToastId,
          });
        }
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
            ? `Document uploaded securely`
            : `All ${successCount} documents uploaded securely`,
          { id: batchToastId },
        );
      } else if (successCount > 0) {
        toast.warning(`Uploaded ${successCount} documents (${failedCount} failed).`, {
          id: batchToastId,
        });
      } else {
        toast.error(`Failed to upload ${failedCount} documents. Encryption error.`, {
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
      description: 'document deleted from vault',
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
        window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60000);
      }
      toast.success(`Downloading ${item.title}`);
      logActivity({
        actionType: 'file_download',
        itemName: item.title,
        description: 'document downloaded',
        status: 'success',
      });
    } catch {
      logActivity({
        actionType: 'file_download',
        itemName: item.title,
        description: 'document download failed',
        status: 'failure',
      });
      toast.error('Decryption error', {
        description:
          'An unexpected error occurred during decryption. Please check your master key.',
      });
    }
  };

  return (
    <VaultLayout
      title="Documents"
      description={
        currentFolder
          ? `Documents in folder "${currentFolder}"`
          : 'Securely store and preview all documents with zero-knowledge encryption.'
      }
      items={items.filter((i) => i.type === 'document')}
      itemTypeLabel="document"
      allItemLabel="All Documents"
      onUpload={(folder?: string | null) => {
        uploadTargetFolder.current = folder ?? currentFolder;
        fileInputRef.current?.click();
      }}
      onFileDrop={(files, folder) => handleUploadFiles(files, folder ?? currentFolder)}
      isUploading={isUploading}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      folders={folders}
      currentFolder={currentFolder}
      onFolderSelect={setCurrentFolder}
      sidebarIcon={FilePlus}
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
      <input
        type="file"
        ref={fileInputRef}
        multiple
        onChange={handleUpload}
        className="hidden"
        accept={DOCUMENT_FILE_INPUT_ACCEPT}
      />

      {filteredItems.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 opacity-40 cursor-pointer hover:opacity-70 transition-opacity"
          onClick={() => {
            uploadTargetFolder.current = currentFolder;
            fileInputRef.current?.click();
          }}
        >
          <FilePlus className="mb-4 h-16 w-16" />
          <p className="text-lg">No documents found.</p>
          <p className="text-xs mt-1">Tap or drop files to upload securely</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6 sm:gap-10">
          {filteredItems
            .slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE)
            .map((item, idx) => {
              const itemExt = (
                item.metadata?.extension ||
                item.title.split('.').pop() ||
                ''
              ).toUpperCase();
              const itemCategory = getDocumentCategory(itemExt);
              const badgeStyle = getCategoryBadgeColor(itemCategory);

              const isTouchDevice =
                typeof window !== 'undefined' &&
                ('ontouchstart' in window ||
                  (navigator?.maxTouchPoints ?? 0) > 0 ||
                  window.innerWidth <= 768);

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ y: -5 }}
                  transition={{ delay: idx * 0.03 }}
                  draggable={!isTouchDevice}
                  onDragStartCapture={(event) => setDraggedVaultItem(event, item.id)}
                  onDragEnd={clearDraggedVaultItem}
                  title="Drag to a folder to move this document"
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
                      {/* Clickable Card Body for Instant Mobile & Desktop Opening */}
                      <div
                        className="flex flex-col items-center text-center cursor-pointer transition-transform active:scale-[0.98] group/cardbody"
                        onClick={() => {
                          setPreviewItem(item.id);
                          logActivity({
                            actionType: 'file_preview',
                            itemName: item.title,
                            description: 'document preview opened',
                            status: 'success',
                          });
                        }}
                        title="Click to view document"
                      >
                        <div className="mb-4 relative">
                          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 transition-transform group-hover/cardbody:scale-110 group-hover/cardbody:rotate-3 shadow-inner">
                            {getCategoryIcon(itemCategory, 'h-10 w-10')}
                          </div>
                          <div
                            className={cn(
                              'absolute -bottom-1 -right-1 rounded-lg px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-tighter shadow-lg border',
                              badgeStyle,
                            )}
                          >
                            {itemExt || 'DOC'}
                          </div>
                        </div>

                        <div className="w-full space-y-1">
                          <h3 className="truncate text-sm font-semibold text-text group-hover/cardbody:text-violet-400 transition-colors">
                            {item.title}
                          </h3>
                          <div className="flex items-center justify-center gap-2">
                            <p className="text-[10px] font-medium text-text/40 transition-colors">
                              {((item.metadata?.size || 0) / 1024).toFixed(1)} KB
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
                          className="h-9 flex-1 bg-white/5 hover:bg-white/10 text-xs gap-2"
                          onClick={() => {
                            setPreviewItem(item.id);
                            logActivity({
                              actionType: 'file_preview',
                              itemName: item.title,
                              description: 'document preview opened',
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
                                    className="absolute bottom-full right-0 mb-2 w-56 flex-col rounded-2xl border border-card-border bg-card-bg/95 p-1 shadow-2xl backdrop-blur-xl z-20 flex"
                                  >
                                    <p className="px-3 py-2 text-[9px] font-bold text-text/40 uppercase tracking-widest text-white">
                                      Move to Folder
                                    </p>

                                    <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2.5 mb-1 bg-white/[0.02] rounded-xl">
                                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 shadow-[0_0_10px_rgba(139,92,246,0.15)]">
                                        <FilePlus className="h-4 w-4" />
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
                                            title={item.folder || 'All Documents'}
                                          >
                                            {item.folder || 'All Documents'}
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
                                        <FilePlus className="h-3 w-3 opacity-40 text-violet-400" />
                                        All Documents
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
                                ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-400/30'
                                : 'bg-white/5 hover:bg-white/10 text-white',
                            )}
                            onClick={() => void togglePin(item.id)}
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
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 bg-white/5 hover:bg-red-500/20 text-red-500/60 hover:text-red-500 transition-all border border-red-500/10"
                            onClick={() => handleDelete(item.id, item.title)}
                          >
                            <Trash2 className="h-4 w-4" />
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

      {filteredItems.length > ITEMS_PER_PAGE && (
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
                {Math.ceil(filteredItems.length / ITEMS_PER_PAGE)}
              </span>
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-text/20 font-bold">
              Page
            </span>
          </div>

          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button
              variant="outline"
              disabled={(currentPage + 1) * ITEMS_PER_PAGE >= filteredItems.length}
              onClick={() => setCurrentPage((prev) => prev + 1)}
              className="h-10 w-10 rounded-full border-white/10 bg-white/5 p-0 text-text/60 backdrop-blur-xl transition-all hover:border-white/30 hover:bg-white/10 hover:text-text disabled:opacity-10 disabled:cursor-not-allowed shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {previewItem && previewedDocument && (
          <motion.div
            key="document-preview-modal"
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
              onPrevious={showPreviousDocument}
              onNext={showNextDocument}
              layout="overlay"
            />
            <div className="relative h-[92vh] sm:h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-zinc-950 border border-white/10 shadow-[0_25px_60px_rgba(0,0,0,0.7)] transition-all doc-preview-content vault-print-protected">
              <SafeDocumentPreview
                item={previewedDocument}
                masterKey={masterKey!}
                onDownload={() => downloadFile(previewedDocument)}
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
                          ? 'Document Print Protection Active'
                          : 'Shield Active • Document Protected'}
                      </p>
                      <p className="text-xs text-white/60 max-w-xs leading-relaxed">
                        {shieldReason === 'print-attempt'
                          ? 'Printing or PDF exporting of encrypted documents is disabled.'
                          : 'Document hidden to prevent multitasking switcher capture. Click or focus window to resume.'}
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
                <span className="text-xl font-bold">Encrypted Document Protected</span>
              </div>
              <p className="text-sm text-red-800/80">
                Document printing is blocked by Vault Security Policy.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </VaultLayout>
  );
};
