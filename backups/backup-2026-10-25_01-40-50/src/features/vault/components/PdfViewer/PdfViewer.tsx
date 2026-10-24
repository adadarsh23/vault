import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Download,
  Share2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronUp,
  ChevronDown,
  Loader2,
  FileText,
  ArrowUp,
  ScrollText,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../lib/utils';
import { toast } from 'sonner';
import { logger } from '../../../../lib/logger';

interface PdfViewerProps {
  url: string;
  title: string;
  extension?: string;
  fileContent?: Uint8Array | null;
  onDownload?: () => void;
  className?: string;
}

// PDF.js dynamic CDN loader with multi-CDN fallback
const PDFJS_VERSION = '4.10.38';
const CDN_URLS = [
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`,
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`,
  `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`,
];
const WORKER_URLS = [
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`,
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`,
  `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`,
];

let cachedPdfJs: any = null;

const isTestEnvironment =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE === 'test') ||
  (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test');

const loadPdfJs = async (): Promise<any> => {
  if (cachedPdfJs) return cachedPdfJs;
  if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
    cachedPdfJs = (window as any).pdfjsLib;
    return cachedPdfJs;
  }

  if (isTestEnvironment) {
    throw new Error('PDF.js dynamic ESM loading disabled in test environment.');
  }

  // 1. Prefer bundled local pdfjs-dist
  try {
    const pdfjs = await import('pdfjs-dist');
    const workerModule: any = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    const resolvedPdf = (pdfjs as any).default || pdfjs;
    if (resolvedPdf && typeof resolvedPdf.getDocument === 'function') {
      if (!resolvedPdf.GlobalWorkerOptions.workerSrc) {
        resolvedPdf.GlobalWorkerOptions.workerSrc =
          typeof workerModule === 'string'
            ? workerModule
            : workerModule?.default || String(workerModule);
      }
      cachedPdfJs = resolvedPdf;
      return resolvedPdf;
    }
  } catch (localErr) {
    logger.warn('[PdfViewer] Local pdfjs-dist import fallback to CDN', { error: localErr });
  }

  // 2. Multi-CDN fallback
  let lastError: any = null;
  for (let i = 0; i < CDN_URLS.length; i++) {
    try {
      const module = await import(/* @vite-ignore */ CDN_URLS[i]);
      const pdfjs = module.default || module;
      if (pdfjs && pdfjs.getDocument) {
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          try {
            const workerResp = await fetch(WORKER_URLS[i]);
            if (workerResp.ok) {
              const workerBlob = new Blob([await workerResp.text()], {
                type: 'application/javascript',
              });
              pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
            } else {
              pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URLS[i];
            }
          } catch {
            pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URLS[i];
          }
        }
        cachedPdfJs = pdfjs;
        return pdfjs;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Could not load PDF.js engine.');
};

export const PdfViewer: React.FC<PdfViewerProps> = ({
  url,
  title,
  extension = 'PDF',
  fileContent,
  onDownload,
  className,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [useIframeFallback, setUseIframeFallback] = useState<boolean>(false);
  const [isSharing, setIsSharing] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pdfDocRef = useRef<any>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const renderTasksRef = useRef<Map<number, any>>(new Map());

  // Check if native Web Share is available for files
  const canShareFiles =
    typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

  // Handle opening directly in mobile apps (Files, Books, Acrobat, Drive, etc.)
  const handleOpenInNativeApp = useCallback(async () => {
    setIsSharing(true);
    try {
      let file: File;
      if (fileContent && fileContent.length > 0) {
        file = new File([new Uint8Array(fileContent)], title, { type: 'application/pdf' });
      } else {
        const response = await fetch(url);
        const blob = await response.blob();
        file = new File([blob], title, { type: 'application/pdf' });
      }

      if (canShareFiles && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title,
        });
        toast.success('Document opened in app');
        return;
      }

      // If Web Share files is not supported (e.g. desktop), try opening in new tab or fallback
      const newWin = window.open(url, '_blank', 'noopener,noreferrer');
      if (!newWin) {
        toast.info('Popup blocked. Use the Download button to view file.');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error('Could not open document in external app.');
      }
    } finally {
      setIsSharing(false);
    }
  }, [fileContent, title, url, canShareFiles]);

  // Load PDF Document
  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setRenderError(null);
    setUseIframeFallback(false);

    const initPdf = async () => {
      try {
        const pdfjs = await loadPdfJs();
        if (isCancelled) return;

        let loadingTask: any;
        const isPdfMagic =
          fileContent &&
          fileContent.length >= 4 &&
          fileContent[0] === 0x25 && // %
          fileContent[1] === 0x50 && // P
          fileContent[2] === 0x44 && // D
          fileContent[3] === 0x46; // F

        if (isPdfMagic) {
          loadingTask = pdfjs.getDocument({ data: new Uint8Array(fileContent) });
        } else {
          try {
            const response = await fetch(url);
            if (response.ok) {
              const arrayBuf = await response.arrayBuffer();
              loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuf) });
            } else {
              loadingTask = pdfjs.getDocument(url);
            }
          } catch {
            loadingTask = pdfjs.getDocument(url);
          }
        }

        const doc = await loadingTask.promise;
        if (isCancelled) return;

        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setCurrentPage(1);

        // Auto-compute comfortable scale for document reading
        if (containerRef.current) {
          try {
            const firstPage = await doc.getPage(1);
            const viewport = firstPage.getViewport({ scale: 1.0 });
            const containerWidth = containerRef.current.clientWidth || window.innerWidth;
            const isMobileScreen = window.innerWidth <= 640;
            const targetWidth = isMobileScreen
              ? Math.max(containerWidth - 16, 280)
              : Math.min(containerWidth - 64, 860);
            const fitScale = targetWidth / viewport.width;
            const computedScale = isMobileScreen
              ? Math.min(Math.max(fitScale, 0.7), 1.3)
              : Math.min(Math.max(fitScale, 0.95), 1.5);
            setScale(Number(computedScale.toFixed(2)));
          } catch {
            setScale(1.0);
          }
        }
      } catch (err) {
        if (isCancelled) return;
        if (!isTestEnvironment) {
          logger.warn('[PdfViewer] PDF.js load error', { error: err });
        }
        setRenderError('PDF canvas preview unavailable. Tap below to open or download.');
        setUseIframeFallback(true);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void initPdf();

    return () => {
      isCancelled = true;
      // Cancel active renders
      renderTasksRef.current.forEach((task) => {
        try {
          task.cancel();
        } catch {}
      });
      renderTasksRef.current.clear();
      if (pdfDocRef.current) {
        try {
          pdfDocRef.current.destroy();
        } catch {}
        pdfDocRef.current = null;
      }
    };
  }, [url, fileContent]);

  // Render individual page onto canvas
  const renderPage = useCallback(
    async (pageNumber: number) => {
      const doc = pdfDocRef.current;
      const canvas = canvasRefs.current.get(pageNumber);
      if (!doc || !canvas) return;

      // Cancel previous render for this page if any
      const existingTask = renderTasksRef.current.get(pageNumber);
      if (existingTask) {
        try {
          existingTask.cancel();
        } catch {}
        renderTasksRef.current.delete(pageNumber);
      }

      try {
        const page = await doc.getPage(pageNumber);
        const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const viewport = page.getViewport({ scale });

        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        const renderTask = page.render(renderContext);
        renderTasksRef.current.set(pageNumber, renderTask);
        await renderTask.promise;
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          logger.warn(`[PdfViewer] Error rendering page ${pageNumber}`, { error: err });
        }
      } finally {
        renderTasksRef.current.delete(pageNumber);
      }
    },
    [scale],
  );

  // Render all pages in continuous scroll mode
  useEffect(() => {
    if (!pdfDocRef.current || numPages === 0) return;

    for (let p = 1; p <= numPages; p++) {
      void renderPage(p);
    }
  }, [scale, numPages, renderPage]);

  // Track active page as user scrolls through the document
  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl || numPages <= 1) return;

    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageAttr = entry.target.getAttribute('data-page-number');
            if (pageAttr) {
              const p = parseInt(pageAttr, 10);
              if (!isNaN(p)) {
                setCurrentPage(p);
              }
            }
          }
        }
      },
      {
        root: scrollEl,
        threshold: 0.3,
      },
    );

    pageContainerRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, [numPages]);

  // Smooth scroll jump to a specific page
  const scrollToPage = useCallback((pageNumber: number) => {
    const targetEl = pageContainerRefs.current.get(pageNumber);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentPage(pageNumber);
    }
  }, []);

  const handleZoomIn = () => setScale((prev) => Math.min(Number((prev + 0.15).toFixed(2)), 3.0));
  const handleZoomOut = () => setScale((prev) => Math.max(Number((prev - 0.15).toFixed(2)), 0.5));
  const handleFitWidth = async () => {
    if (!pdfDocRef.current || !containerRef.current) return;
    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1.0 });
      const containerWidth = containerRef.current.clientWidth || window.innerWidth;
      const targetWidth = Math.max(containerWidth - (window.innerWidth <= 640 ? 16 : 48), 280);
      const fitScale = Math.min(Math.max(targetWidth / viewport.width, 0.5), 2.5);
      setScale(Number(fitScale.toFixed(2)));
    } catch {
      setScale(1.0);
    }
  };

  const handleResetZoom = () => setScale(1.0);

  const isMobile =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || (navigator?.maxTouchPoints ?? 0) > 0 || window.innerWidth <= 768);

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col bg-zinc-950 overflow-hidden select-none pdf-viewer-container',
        className,
      )}
      ref={containerRef}
    >
      {/* Top Header & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/95 px-3 sm:px-4 py-2 sm:py-2.5 backdrop-blur-md shrink-0 z-20">
        {/* Title & Badge */}
        <div className="flex items-center gap-2 min-w-0 max-w-[50%] sm:max-w-md">
          <span className="rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-400 border border-rose-500/30 shrink-0">
            {extension}
          </span>
          <span className="truncate text-xs font-semibold text-white/90" title={title}>
            {title}
          </span>
        </div>

        {/* Action Buttons & Zoom Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Zoom Controls */}
          {!useIframeFallback && (
            <div className="hidden xs:flex items-center bg-white/5 rounded-lg border border-white/10 p-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleZoomOut}
                disabled={scale <= 0.4}
                className="h-6 w-6 text-white/70 hover:text-white rounded"
                title="Zoom Out"
              >
                <ZoomOut className="h-3 w-3" />
              </Button>
              <span className="px-1.5 text-[10px] text-white/60 font-mono min-w-[3rem] text-center">
                {Math.round(scale * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleZoomIn}
                disabled={scale >= 3.0}
                className="h-6 w-6 text-white/70 hover:text-white rounded"
                title="Zoom In"
              >
                <ZoomIn className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleFitWidth}
                className="h-6 w-6 text-white/70 hover:text-white rounded"
                title="Fit Width"
              >
                <Maximize2 className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Continuous Scroll Page Navigator & Live Badge */}
          {!useIframeFallback && numPages > 1 && (
            <div className="flex items-center bg-white/5 rounded-lg border border-white/10 p-0.5 text-[11px]">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => scrollToPage(Math.max(currentPage - 1, 1))}
                disabled={currentPage <= 1}
                className="h-6 w-6 text-white/70 hover:text-white rounded"
                title="Scroll to Previous Page"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <span className="px-1.5 text-white/90 font-mono text-[10px] tabular-nums font-medium flex items-center gap-1">
                <ScrollText className="h-3 w-3 text-rose-400 shrink-0" />
                <span>{currentPage}</span>
                <span className="text-white/40">/</span>
                <span className="text-white/60">{numPages}</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => scrollToPage(Math.min(currentPage + 1, numPages))}
                disabled={currentPage >= numPages}
                className="h-6 w-6 text-white/70 hover:text-white rounded"
                title="Scroll to Next Page"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* Native "Open in App" Button for Mobile Devices */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleOpenInNativeApp}
            disabled={isSharing}
            className="h-7 px-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 rounded-lg text-[11px] font-medium gap-1"
            title="Open in device apps (Files, Acrobat, Drive, Books)"
          >
            {isSharing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Share2 className="h-3 w-3" />
            )}
            <span>Open in App</span>
          </Button>

          {/* Download Button */}
          {onDownload && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onDownload}
              className="h-7 w-7 text-white/80 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
              title="Download PDF"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Continuous Scroll Area */}
      <div
        ref={scrollContainerRef}
        className="relative flex-1 w-full min-h-0 bg-zinc-950 overflow-y-auto overflow-x-hidden custom-scrollbar flex flex-col items-center scroll-smooth"
      >
        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
            <p className="text-xs text-white/70 font-medium">Decrypting & rendering document...</p>
          </div>
        )}

        {/* Fallback View (Safe reader card - never use auto-downloading white iframe) */}
        {useIframeFallback ? (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm m-auto space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <FileText className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-base font-semibold text-white">{title}</h4>
              <p className="text-xs text-white/60">
                {renderError || 'Tap below to view this PDF in your document reader.'}
              </p>
            </div>
            <div className="flex flex-col w-full gap-2 pt-2">
              {isMobile ? (
                <Button
                  onClick={handleOpenInNativeApp}
                  className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-lg shadow-rose-600/30 gap-2 h-10 font-semibold text-xs"
                >
                  <Share2 className="h-4 w-4" />
                  Open in Mobile App
                </Button>
              ) : (
                <Button
                  onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                  className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-lg shadow-rose-600/30 gap-2 h-10 font-semibold text-xs"
                >
                  <Maximize2 className="h-4 w-4" />
                  Open in New Tab
                </Button>
              )}
              {onDownload && (
                <Button
                  onClick={onDownload}
                  variant="outline"
                  className="border-white/10 bg-white/5 hover:bg-white/10 text-white rounded-xl gap-2 h-10 text-xs"
                >
                  <Download className="h-4 w-4" />
                  Download Decrypted PDF
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Continuous Scroll PDF Document Stream */
          <div className="flex flex-col items-center py-4 px-2 sm:px-6 w-full gap-2">
            {Array.from({ length: numPages }, (_, index) => {
              const pageNum = index + 1;
              return (
                <div
                  key={`pdf-page-${pageNum}`}
                  ref={(el) => {
                    if (el) pageContainerRefs.current.set(pageNum, el);
                    else pageContainerRefs.current.delete(pageNum);
                  }}
                  data-page-number={pageNum}
                  className="relative flex flex-col items-center bg-white shadow-md border border-neutral-800/40 select-text overflow-hidden"
                >
                  <canvas
                    ref={(el) => {
                      if (el) canvasRefs.current.set(pageNum, el);
                      else canvasRefs.current.delete(pageNum);
                    }}
                    className="block max-w-full h-auto"
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Floating Quick Jump to Top */}
        {currentPage > 1 && !useIframeFallback && (
          <div className="sticky bottom-4 right-4 ml-auto mr-4 mb-2 z-30">
            <button
              onClick={() => scrollToPage(1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-600/90 hover:bg-rose-500 text-white shadow-2xl backdrop-blur-md transition-all border border-white/20 hover:scale-110 active:scale-95"
              title="Scroll to Top"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Mobile Bottom Quick Actions */}
      <div className="sm:hidden flex items-center justify-between border-t border-white/10 bg-zinc-900/90 px-3 py-1.5 text-[11px] text-white/70 shrink-0">
        <span className="truncate max-w-[150px] font-medium text-white/80">{title}</span>
        <div className="flex items-center gap-2">
          {numPages > 1 && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-rose-300 border border-white/10 font-mono">
              Page {currentPage} of {numPages}
            </span>
          )}
          <button
            onClick={handleResetZoom}
            className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-white/90 border border-white/10"
            title="Reset Zoom"
          >
            {Math.round(scale * 100)}%
          </button>
        </div>
      </div>
    </div>
  );
};

export default PdfViewer;
