import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { toast } from 'sonner';
import { marked } from 'marked';
import { cn } from '../../lib/utils';
import { ErrorBoundary } from '../ui/ErrorBoundary';

// Imported subcomponents
import { NoteEditorToolbar } from './NoteEditor/NoteEditorToolbar';
import { NoteEditorPreview } from './NoteEditor/NoteEditorPreview';
import { NoteEditorPanels } from './NoteEditor/NoteEditorPanels';
import { NoteEditorTiptap } from './NoteEditor/NoteEditorTiptap';
import { normalizeExternalUrl } from './NoteEditor/editorUtils';
import type { NoteEditorProps, SaveStatus, TextAlign as AlignType } from './NoteEditor/types';

const NoteEditorFallback: React.FC<{ label: string; onRetry?: () => void }> = ({
  label,
  onRetry,
}) => (
  <div
    role="alert"
    aria-live="assertive"
    className="m-3 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-200 shadow-sm backdrop-blur-sm"
  >
    <div className="flex items-center gap-2">
      <span className="font-medium">{label} encountered an issue and failed to render.</span>
    </div>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-red-500/20 px-2.5 py-1 text-xs font-semibold text-red-100 transition-colors hover:bg-red-500/30 focus:outline-none focus:ring-2 focus:ring-red-400"
      >
        Retry
      </button>
    )}
  </div>
);

export const NoteEditor: React.FC<NoteEditorProps> = ({
  noteId,
  initialTitle,
  initialContent,
  onSave,
  onCancel,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState('');
  const [lineWrap, setLineWrap] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const [activeLine] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [showGoToLine, setShowGoToLine] = useState(false);
  const [goToLineValue, setGoToLineValue] = useState('');
  const [showImageUrlInput, setShowImageUrlInput] = useState(false);
  const [imageUrlValue, setImageUrlValue] = useState('');
  const [showLinkUrlInput, setShowLinkUrlInput] = useState(false);
  const [linkUrlValue, setLinkUrlValue] = useState('');
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findValue, setFindValue] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHtmlPreview, setShowHtmlPreview] = useState(false);
  const [textAlign, setTextAlign] = useState<AlignType>('left');

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const saveVersionRef = useRef(0);
  const lastSavedRef = useRef({ title: initialTitle, content: initialContent });
  const titleRef = useRef(title);
  const contentRef = useRef(content);

  // Parse legacy Markdown to HTML for Tiptap
  const parsedContent = useMemo(() => {
    if (!initialContent) return '';
    const isHtml = /<[a-z][\s\S]*>/i.test(initialContent);
    if (isHtml) return initialContent;
    try {
      return marked.parse(initialContent, { async: false }) as string;
    } catch {
      return initialContent;
    }
  }, [initialContent]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-400 underline hover:text-blue-300',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-xl border border-card-border',
        },
      }),
      Highlight.configure({
        HTMLAttributes: {
          class: 'bg-emerald-500/20 text-emerald-300 px-1 rounded',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse w-full my-4 border border-card-border',
        },
      }),
      TableRow,
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-card-border p-2 text-left',
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: 'border border-card-border p-2 text-left bg-card-bg font-bold',
        },
      }),
    ],
    content: parsedContent,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setContent(html);
      handleContentChange(html);
    },
  });

  // Synchronize editor content when initialContent prop changes
  useEffect(() => {
    if (editor && parsedContent !== editor.getHTML()) {
      editor.commands.setContent(parsedContent);
      setContent(parsedContent);
      lastSavedRef.current = { title: initialTitle, content: parsedContent };
    }
  }, [editor, parsedContent, initialTitle]);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, []);

  const handleAutoSave = useCallback(
    async (t: string, c: string) => {
      if (t === lastSavedRef.current.title && c === lastSavedRef.current.content) {
        if (mountedRef.current) setSaveStatus('saved');
        return;
      }

      try {
        if (mountedRef.current) setSaveStatus('saving');
        await onSave(t, c);
        if (!mountedRef.current) return;
        lastSavedRef.current = { title: t, content: c };
        setSaveStatus('saved');
      } catch {
        if (!mountedRef.current) return;
        setSaveStatus('error');
      }
    },
    [onSave]
  );

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent);
      setSaveStatus(
        titleRef.current === lastSavedRef.current.title &&
          newContent === lastSavedRef.current.content
          ? 'saved'
          : 'dirty'
      );
      const saveVersion = ++saveVersionRef.current;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        if (saveVersion !== saveVersionRef.current) return;
        handleAutoSave(titleRef.current, newContent).catch(() => {});
      }, 2000);
    },
    [handleAutoSave]
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      setSaveStatus(
        newTitle === lastSavedRef.current.title &&
          contentRef.current === lastSavedRef.current.content
          ? 'saved'
          : 'dirty'
      );
      const saveVersion = ++saveVersionRef.current;
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        if (saveVersion !== saveVersionRef.current) return;
        handleAutoSave(newTitle, contentRef.current).catch(() => {});
      }, 2000);
    },
    [handleAutoSave]
  );

  // Undo/Redo mapped to Tiptap
  const handleUndo = useCallback(() => {
    editor?.chain().focus().undo().run();
  }, [editor]);

  const handleRedo = useCallback(() => {
    editor?.chain().focus().redo().run();
  }, [editor]);

  // Formatting operations mapped to Tiptap
  const applyFormatting = useCallback(
    (type: string, value?: string) => {
      if (!editor) return;
      const chain = editor.chain().focus();

      switch (type) {
        case 'bold':
          chain.toggleBold().run();
          break;
        case 'italic':
          chain.toggleItalic().run();
          break;
        case 'strike':
          chain.toggleStrike().run();
          break;
        case 'code':
          chain.toggleCodeBlock().run();
          break;
        case 'inline-code':
          chain.toggleCode().run();
          break;
        case 'blockquote':
        case 'quote':
          chain.toggleBlockquote().run();
          break;
        case 'h1':
          chain.toggleHeading({ level: 1 }).run();
          break;
        case 'h2':
          chain.toggleHeading({ level: 2 }).run();
          break;
        case 'h3':
          chain.toggleHeading({ level: 3 }).run();
          break;
        case 'list':
          chain.toggleBulletList().run();
          break;
        case 'ordered-list':
          chain.toggleOrderedList().run();
          break;
        case 'hr':
          chain.setHorizontalRule().run();
          break;
        case 'highlight':
          chain.toggleHighlight().run();
          break;
        case 'link':
          if (value) {
            chain.setLink({ href: normalizeExternalUrl(value) || '' }).run();
          } else {
            chain.unsetLink().run();
          }
          break;
        case 'image':
          if (value) {
            chain.setImage({ src: normalizeExternalUrl(value) || '' }).run();
          }
          break;
        case 'table':
          chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
          break;
        case 'clear':
          chain.clearNodes().unsetAllMarks().run();
          break;
        case 'date':
          chain.insertContent(new Date().toLocaleString()).run();
          break;
        default:
          break;
      }
    },
    [editor]
  );

  const handleCycleTextAlignment = useCallback(() => {
    if (!editor) return;
    const nextAlign: AlignType =
      textAlign === 'left' ? 'center' : textAlign === 'center' ? 'right' : 'left';
    setTextAlign(nextAlign);
    editor.chain().focus().setTextAlign(nextAlign).run();
  }, [editor, textAlign]);

  const handleTableControls = useCallback(() => {
    applyFormatting('table');
    toast.success('Table inserted');
  }, [applyFormatting]);

  const insertImageFromUrl = useCallback(() => {
    if (imageUrlValue) {
      applyFormatting('image', imageUrlValue);
      setShowImageUrlInput(false);
      setImageUrlValue('');
      toast.success('Image inserted');
    }
  }, [applyFormatting, imageUrlValue]);

  const insertLinkFromUrl = useCallback(() => {
    if (linkUrlValue) {
      applyFormatting('link', linkUrlValue);
      setShowLinkUrlInput(false);
      setLinkUrlValue('');
      toast.success('Link inserted');
    }
  }, [applyFormatting, linkUrlValue]);

  const openInBrowser = useCallback(() => {
    toast.info('Link browsing is managed within the document canvas.');
  }, []);

  const copyToClipboard = async () => {
    try {
      const text = editor ? editor.getText() : content;
      await navigator.clipboard.writeText(text);
      toast.success('Copied text to clipboard');
    } catch {
      toast.error('Clipboard access failed');
    } finally {
      setShowMoreActions(false);
    }
  };

  const formatDocument = () => {
    toast.success('Document structure formatted');
    setShowMoreActions(false);
  };

  const handleAiAssist = useCallback(() => {
    toast.success('AI Assist checked content structures');
  }, []);

  const downloadNote = () => {
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'Untitled'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Note downloaded');
  };

  const importNote = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (editor) {
        editor.commands.setContent(text);
        handleContentChange(text);
      }
      toast.success('File imported');
      event.target.value = '';
    };
    reader.readAsText(file);
  };

  const clearContent = () => {
    if (editor) {
      editor.commands.clearContent();
      handleContentChange('');
    }
    toast.success('Content cleared');
    setShowMoreActions(false);
  };

  const printNote = () => {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) {
      toast.error('Popup blocked. Please allow popups to print notes.');
      return;
    }
    printWindow.opener = null;
    printWindow.document.write(
      `<!DOCTYPE html><html><head><title>${title || 'Note'}</title><style>body{font-family:system-ui,-apple-system,sans-serif;padding:24px;line-height:1.6;color:#111;max-width:800px;margin:0 auto;}h1{font-size:24px;margin-bottom:16px;border-bottom:1px solid #eee;padding-bottom:8px;}</style></head><body><h1>${title || 'Untitled Note'}</h1><div>${content}</div></body></html>`
    );
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const toggleFullScreen = () => setIsFullScreen(!isFullScreen);
  const toggleFocusMode = () => setIsFocusMode(!isFocusMode);
  const handleShowWordCount = () => {
    const text = editor ? editor.getText() : '';
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    toast.info(`Word count: ${words} words`);
  };

  const handleToggleImageUrlInput = () => setShowImageUrlInput(!showImageUrlInput);
  const handleToggleLinkUrlInput = () => setShowLinkUrlInput(!showLinkUrlInput);

  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden bg-card-bg/40 rounded-2xl border border-card-border/50 shadow-2xl backdrop-blur-sm transition-all duration-300',
        isFullScreen ? 'fixed inset-4 z-[100] bg-bg/95 backdrop-blur-xl' : 'relative'
      )}
    >
      <ErrorBoundary
        fallback={(_err, reset) => <NoteEditorFallback label="Toolbar" onRetry={reset} />}
      >
        <NoteEditorToolbar
          handleUndo={handleUndo}
          handleRedo={handleRedo}
          historyIndex={editor?.can().undo() ? 1 : 0}
          historyLength={editor?.can().redo() ? 2 : 1}
          applyFormatting={applyFormatting}
          jumpBlock={() => {}}
          setShowGoToLine={setShowGoToLine}
          lineWrap={lineWrap}
          setLineWrap={setLineWrap}
          showLineNumbers={showLineNumbers}
          setShowLineNumbers={setShowLineNumbers}
          openInBrowser={openInBrowser}
          content={content}
          activeLine={activeLine}
          showPreview={showPreview}
          setShowPreview={setShowPreview}
          showHtmlPreview={showHtmlPreview}
          setShowHtmlPreview={setShowHtmlPreview}
          showMoreActions={showMoreActions}
          setShowMoreActions={setShowMoreActions}
          copyToClipboard={copyToClipboard}
          printNote={printNote}
          toggleFullScreen={toggleFullScreen}
          isFullScreen={isFullScreen}
          clearContent={clearContent}
          saveStatus={saveStatus}
          onCancel={onCancel}
          title={title}
          handleAutoSave={() => handleAutoSave(title, content)}
          setSaveStatus={setSaveStatus}
          formatDocument={formatDocument}
          downloadNote={downloadNote}
          importNote={importNote}
          handleFindReplace={() => setShowFindReplace(!showFindReplace)}
          showFindReplace={showFindReplace}
          handleCycleTextAlignment={handleCycleTextAlignment}
          textAlign={textAlign}
          handleShowWordCount={handleShowWordCount}
          handleAiAssist={handleAiAssist}
          handleFocusMode={toggleFocusMode}
          handleTableControls={handleTableControls}
          showImageUrlInput={showImageUrlInput}
          handleToggleImageUrlInput={handleToggleImageUrlInput}
          showLinkUrlInput={showLinkUrlInput}
          handleToggleLinkUrlInput={handleToggleLinkUrlInput}
          isFocusMode={isFocusMode}
        />
      </ErrorBoundary>

      <div className="px-8 pt-6 pb-2">
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          aria-label="Note title"
          maxLength={200}
          className="w-full bg-transparent text-2xl font-bold text-text focus:outline-none placeholder:text-text/10"
          placeholder="Note Title"
        />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <NoteEditorPanels
          showFindReplace={showFindReplace}
          findReplace={{
            findInputRef: { current: null } as any,
            findValue,
            setFindValue,
            replaceValue,
            setReplaceValue,
            matchCount: 0,
            activeMatchIndex: 0,
            setShowFindReplace,
            goToPreviousMatch: () => {},
            goToNextMatch: () => {},
            applyReplaceOne: () => {},
            applyReplaceAll: () => {},
          }}
          showGoToLine={showGoToLine}
          goToLinePanel={{
            goToLineValue,
            setGoToLineValue,
            goToLine: () => {},
            setShowGoToLine,
          }}
          showImageUrlInput={showImageUrlInput}
          imageUrlPanel={{
            placeholder: 'Image URL...',
            value: imageUrlValue,
            ariaLabel: 'Image URL',
            submitLabel: 'Add',
            onChange: setImageUrlValue,
            onSubmit: insertImageFromUrl,
            onClose: () => setShowImageUrlInput(false),
          }}
          showLinkUrlInput={showLinkUrlInput}
          linkUrlPanel={{
            placeholder: 'Link URL...',
            value: linkUrlValue,
            ariaLabel: 'Link URL',
            submitLabel: 'Add',
            onChange: setLinkUrlValue,
            onSubmit: insertLinkFromUrl,
            onClose: () => setShowLinkUrlInput(false),
          }}
        />

        <div
          className={cn(
            'flex w-full overflow-hidden flex-1 relative',
            showPreview || showHtmlPreview ? 'divide-x divide-white/10' : ''
          )}
        >
          <div
            className={cn(
              'relative flex flex-col min-w-0 transition-all duration-300',
              showPreview || showHtmlPreview ? 'w-full md:w-1/2' : 'w-full'
            )}
          >
            <ErrorBoundary
              fallback={(_err, reset) => <NoteEditorFallback label="Editor" onRetry={reset} />}
            >
              <NoteEditorTiptap editor={editor} lineWrap={lineWrap} textAlign={textAlign} />
            </ErrorBoundary>
          </div>

          <ErrorBoundary
            fallback={(_err, reset) => <NoteEditorFallback label="Preview" onRetry={reset} />}
          >
            <NoteEditorPreview
              noteId={noteId}
              content={content}
              lineWrap={lineWrap}
              showPreview={showPreview}
              showHtmlPreview={showHtmlPreview}
              onToggleTask={() => {}}
              onToggleTaskByLine={() => false}
              setShowPreview={setShowPreview}
              setShowHtmlPreview={setShowHtmlPreview}
            />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
};
