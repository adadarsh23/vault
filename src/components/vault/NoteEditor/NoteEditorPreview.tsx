import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useImperativeHandle,
  useDeferredValue,
  useEffect,
  memo,
  forwardRef,
} from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { X, ChevronUp, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

import { Button } from '../../ui/Button';
import { cn } from '../../../lib/utils';
import { logger } from '../../../lib/logger';
import { ScrollButton } from '../ScrollButton';
import { useScrollRestoration } from '../../../hooks/useScrollRestoration';

interface NoteEditorPreviewProps {
  noteId?: string;
  content: string;
  lineWrap: boolean;
  showPreview: boolean;
  showHtmlPreview: boolean;
  onToggleTask: (taskIndex: number, checked: boolean) => void;
  onToggleTaskByLine: (lineNumber: number, checked: boolean) => boolean;
  setShowPreview: (show: boolean) => void;
  setShowHtmlPreview: (show: boolean) => void;
}

export interface NoteEditorPreviewRef {
  scrollToTop: () => void;
  scrollToBottom: () => void;
  scrollToRatio: (ratio: number) => void;
}

interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/* -------------------------------------------------------------------------- */
/*                                   UTILS                                    */
/* -------------------------------------------------------------------------- */

function throttle<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let lastCall = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();

    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    }
  };
}

const getSafeMarkdownHref = (href?: string) => {
  if (!href) return '#';
  const trimmedHref = href.trim();
  if (!trimmedHref) return '#';
  if (
    trimmedHref.startsWith('#') ||
    trimmedHref.startsWith('/') ||
    trimmedHref.startsWith('./') ||
    trimmedHref.startsWith('../')
  ) {
    return trimmedHref;
  }

  const lowerHref = trimmedHref.toLowerCase();
  if (
    lowerHref.startsWith('javascript:') ||
    lowerHref.startsWith('data:') ||
    lowerHref.startsWith('vbscript:')
  ) {
    return '#';
  }

  try {
    const parsed = new URL(trimmedHref, window.location.origin);
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
      return trimmedHref;
    }
  } catch {
    return '#';
  }

  return '#';
};

const buildHtmlDocument = (body: string) => `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width,initial-scale=1"
    />

    <style>
      :root {
        color-scheme: light;
      }

      * {
        box-sizing: border-box;
      }

      body {
        font-family:
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          sans-serif;

        margin: 24px;
        line-height: 1.7;
        color: #111827;
        word-break: break-word;
      }

      pre,
      code {
        font-family:
          ui-monospace,
          SFMono-Regular,
          Menlo,
          monospace;
      }

      pre {
        background: #f3f4f6;
        padding: 12px;
        border-radius: 10px;
        overflow-x: auto;
      }

      code {
        background: rgba(0, 0, 0, 0.05);
        padding: 2px 4px;
        border-radius: 4px;
      }

      blockquote {
        border-left: 4px solid #d1d5db;
        margin: 0;
        padding-left: 12px;
        color: #4b5563;
      }

      img {
        max-width: 100%;
        height: auto;
        border-radius: 10px;
      }

      table {
        border-collapse: collapse;
        width: 100%;
      }

      th,
      td {
        border: 1px solid #e5e7eb;
        padding: 8px;
        text-align: left;
      }

      mark {
        background: #fde68a;
        padding: 0 2px;
      }

      a {
        color: #2563eb;
      }
    </style>
  </head>

  <body>${body}</body>
</html>
`;

/* -------------------------------------------------------------------------- */
/*                                COMPONENT                                   */
/* -------------------------------------------------------------------------- */

const NoteEditorPreviewBase = forwardRef<NoteEditorPreviewRef, NoteEditorPreviewProps>(
  (
    {
      noteId,
      content,
      lineWrap,
      showPreview,
      showHtmlPreview,
      onToggleTask,
      onToggleTaskByLine,
      setShowPreview,
      setShowHtmlPreview,
    },
    ref,
  ) => {
    const internalRef = useRef<HTMLDivElement>(null);
    useScrollRestoration(`note_preview_${noteId || 'default'}`, internalRef);

    const deferredContent = useDeferredValue(content);
    const prefersReducedMotion = useReducedMotion();

    const [showTop, setShowTop] = useState(false);
    const [showBottom, setShowBottom] = useState(false);
    const taskRenderIndexRef = useRef(0);

    /* ---------------------------------------------------------------------- */
    /*                              SANITIZE SCHEMA                           */
    /* ---------------------------------------------------------------------- */

    const markdownSanitizeSchema = useMemo(
      () => ({
        ...defaultSchema,

        tagNames: [...(defaultSchema.tagNames || []), 'input', 'span', 'mark'],

        attributes: {
          ...(defaultSchema.attributes || {}),

          input: ['type', 'checked', 'disabled'],

          span: ['class'],

          li: [...((defaultSchema.attributes?.li as string[]) || []), 'class'],
        },
      }),
      [],
    );

    /* ---------------------------------------------------------------------- */
    /*                               SCROLL API                               */
    /* ---------------------------------------------------------------------- */

    const scrollToTop = useCallback(() => {
      internalRef.current?.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }, []);

    const scrollToBottom = useCallback(() => {
      const el = internalRef.current;

      if (!el) return;

      try {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: 'smooth',
        });
      } catch {
        el.scrollTop = el.scrollHeight;
      }
    }, []);

    const scrollToRatio = useCallback((ratio: number) => {
      const el = internalRef.current;
      if (!el) return;

      const clampedRatio = Math.max(0, Math.min(1, ratio));
      const targetScroll = clampedRatio * (el.scrollHeight - el.clientHeight);
      el.scrollTop = targetScroll;
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        scrollToTop,
        scrollToBottom,
        scrollToRatio,
      }),
      [scrollToTop, scrollToBottom, scrollToRatio],
    );

    /* ---------------------------------------------------------------------- */
    /*                            KEYBOARD ACCESSIBILITY                      */
    /* ---------------------------------------------------------------------- */

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setShowPreview(false);
          setShowHtmlPreview(false);
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [setShowPreview, setShowHtmlPreview]);

    /* ---------------------------------------------------------------------- */
    /*                            MARKDOWN CONTENT                            */
    /* ---------------------------------------------------------------------- */

    const highlightedMarkdownContent = useMemo(
      () => deferredContent.replace(/==(.+?)==/g, '<mark>$1</mark>'),
      [deferredContent],
    );

    /* ---------------------------------------------------------------------- */
    /*                             HTML PREVIEW                               */
    /* ---------------------------------------------------------------------- */

    const sanitizedHtmlPreview = useMemo(() => {
      try {
        const markdownAsHtml = marked.parse(highlightedMarkdownContent, {
          gfm: true,
          breaks: true,
          async: false,
        });

        const safeBodyHtml = DOMPurify.sanitize(markdownAsHtml, {
          USE_PROFILES: {
            html: true,
          },
        });

        return buildHtmlDocument(safeBodyHtml);
      } catch (error) {
        logger.error('Failed to generate markdown preview', { error });
        return buildHtmlDocument('<p>Preview failed to render.</p>');
      }
    }, [highlightedMarkdownContent]);

    /* ---------------------------------------------------------------------- */
    /*                               SCROLL STATE                             */
    /* ---------------------------------------------------------------------- */

    const handleScroll = useCallback(
      throttle(({ scrollTop, scrollHeight, clientHeight }: ScrollMetrics) => {
        setShowTop(scrollTop > 150);

        setShowBottom(scrollHeight - scrollTop - clientHeight > 150);
      }, 120),
      [],
    );

    /* ---------------------------------------------------------------------- */
    /*                                 GUARD                                  */
    /* ---------------------------------------------------------------------- */

    if (!showPreview && !showHtmlPreview) {
      return null;
    }

    taskRenderIndexRef.current = 0;

    /* ---------------------------------------------------------------------- */
    /*                                RENDER                                  */
    /* ---------------------------------------------------------------------- */

    return (
      <motion.div
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 16 }}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
        className={cn(
          'absolute inset-0 z-20',
          'md:relative md:z-auto',
          'w-full md:w-1/2',
          'flex flex-col',
          'bg-bg/95 md:bg-black/10',
          'backdrop-blur-sm',
          'overflow-hidden',
        )}
      >
        {/* HEADER */}

        <div
          className={cn(
            'flex items-center justify-between',
            'px-5 py-3',
            'border-b border-white/5',
            'bg-white/[0.02]',
          )}
        >
          <span className={cn('text-xs font-semibold', 'text-text/50', 'uppercase tracking-wide')}>
            {showHtmlPreview ? 'HTML Preview' : 'Markdown Preview'}
          </span>

          <div className="flex items-center gap-3">
            <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />

            <Button
              aria-label="Close preview"
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowPreview(false);
                setShowHtmlPreview(false);
              }}
              className="md:hidden h-7 w-7 text-text/50 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* SCROLL BUTTONS */}

        <ScrollButton
          visible={showTop}
          ariaLabel="Scroll to top"
          onClick={scrollToTop}
          icon={ChevronUp}
          className="bottom-14 right-5"
        />

        <ScrollButton
          visible={showBottom}
          ariaLabel="Scroll to bottom"
          onClick={scrollToBottom}
          icon={ChevronDown}
          className="bottom-3 right-5"
        />

        {/* CONTENT */}

        <div
          ref={internalRef}
          onScroll={(e) => {
            const target = e.currentTarget;

            handleScroll({
              scrollTop: target.scrollTop,
              scrollHeight: target.scrollHeight,
              clientHeight: target.clientHeight,
            });
          }}
          className={cn(
            'relative flex-1 overflow-y-auto',
            'scroll-smooth custom-scrollbar',
            !showHtmlPreview && 'p-8 md:p-10',
          )}
        >
          {showHtmlPreview ? (
            <iframe
              title="HTML Preview"
              srcDoc={sanitizedHtmlPreview}
              sandbox=""
              className="w-full h-full border-none bg-white rounded-lg"
            />
          ) : !deferredContent.trim() ? (
            <div className="flex items-center justify-center h-full text-center text-text/40">
              <div className="bg-white/[0.03] border border-white/10 px-6 py-6 rounded-xl">
                Start typing to see preview 👀
              </div>
            </div>
          ) : (
            <div
              className={cn(
                'max-w-3xl mx-auto',
                'prose prose-invert prose-neutral',
                'prose-h1:text-3xl',
                'prose-h2:text-2xl',
                'prose-p:text-text/80',
                'prose-li:text-text/70',
                'prose-strong:text-white',
                'prose-code:text-white/90',
                'pb-40',
              )}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema]]}
                components={{
                  ol: ({ children }) => (
                    <ol className="list-decimal list-outside pl-6 my-3 space-y-1">{children}</ol>
                  ),

                  ul: ({ children }) => (
                    <ul className="list-disc list-outside pl-6 my-3 space-y-1">{children}</ul>
                  ),

                  li: ({ children }) => (
                    <li className="whitespace-pre-wrap break-words">{children}</li>
                  ),

                  a: ({ href, children }) => (
                    <a
                      href={getSafeMarkdownHref(href)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {children}
                    </a>
                  ),

                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-white/20 pl-4 italic text-text/70">
                      {children}
                    </blockquote>
                  ),

                  del: ({ children }) => <del className="text-text/60">{children}</del>,

                  mark: ({ children }) => (
                    <mark className="rounded px-1 bg-amber-300/80 text-black">{children}</mark>
                  ),

                  input: ({ type, checked, disabled, node }) => {
                    if (type !== 'checkbox') {
                      return <input type={type} checked={checked} disabled={disabled} />;
                    }

                    const currentTaskIndex = taskRenderIndexRef.current;
                    taskRenderIndexRef.current += 1;

                    return (
                      <input
                        type="checkbox"
                        checked={Boolean(checked)}
                        disabled={showHtmlPreview}
                        className="mr-2 h-4 w-4 cursor-pointer align-middle accent-emerald-500 transition-transform duration-150 hover:scale-110"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        onChange={(e) => {
                          const lineNumber = (node as { position?: { start?: { line?: number } } })
                            ?.position?.start?.line;
                          if (typeof lineNumber === 'number' && lineNumber > 0) {
                            const toggledByLine = onToggleTaskByLine(
                              lineNumber,
                              e.currentTarget.checked,
                            );
                            if (toggledByLine) return;
                          }
                          onToggleTask(currentTaskIndex, e.currentTarget.checked);
                        }}
                      />
                    );
                  },

                  // Apply completed-task visual treatment directly in preview.
                  p: ({ children }) => {
                    const childArray = Array.isArray(children) ? children : [children];
                    const hasCheckedTask = childArray.some((child) => {
                      if (!child || typeof child !== 'object') return false;
                      const node = child as {
                        props?: { type?: string; checked?: boolean };
                      };
                      return node.props?.type === 'checkbox' && Boolean(node.props.checked);
                    });

                    return (
                      <p
                        className={cn(
                          lineWrap
                            ? 'whitespace-pre-wrap break-words'
                            : 'whitespace-pre overflow-x-auto',
                          hasCheckedTask && 'text-text/45 line-through',
                        )}
                      >
                        {children}
                      </p>
                    );
                  },
                }}
              >
                {highlightedMarkdownContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </motion.div>
    );
  },
);

NoteEditorPreviewBase.displayName = 'NoteEditorPreview';
export const NoteEditorPreview = memo(NoteEditorPreviewBase);
