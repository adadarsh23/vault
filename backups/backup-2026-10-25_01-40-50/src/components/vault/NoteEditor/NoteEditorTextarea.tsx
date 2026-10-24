import React, {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ScrollButton } from '../ScrollButton';
import { useScrollRestoration } from '../../../hooks/useScrollRestoration';

const EDITOR_LINE_HEIGHT = 20;
const EDITOR_PADDING = 32;
const GUTTER_WIDTH = 56;
const EXTRA_BOTTOM_SPACE = '20rem';
const MAX_LINE_RENDER = 10000;
let lastKnownEditorScrollTop = 0;

interface NoteEditorTextareaProps {
  noteId?: string;
  content: string;
  handleContentChange: (newContent: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleScroll: (e: React.UIEvent<HTMLTextAreaElement>) => void;
  updateScrollVisibility: () => void;
  updateActiveLine: (
    e: React.SyntheticEvent<HTMLTextAreaElement> | React.KeyboardEvent<HTMLTextAreaElement>,
  ) => void;
  lineWrap: boolean;
  textAlign: 'left' | 'center' | 'right';
  showLineNumbers: boolean;
  activeLine: number;
  showEditorScrollTop: boolean;
  showEditorScrollBottom: boolean;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  gutterRef: React.RefObject<HTMLDivElement | null>;
  spellCheck?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

interface GutterProps {
  lineNumbers: number[];
  activeLine: number;
}

const Gutter = memo<GutterProps>(({ lineNumbers, activeLine }) => {
  return (
    <>
      {lineNumbers.map((num) => {
        const isActive = num === activeLine + 1;

        return (
          <div
            key={num}
            className={`transition-colors ${
              isActive ? 'font-semibold text-white' : 'text-text/30'
            }`}
            style={{
              height: `${EDITOR_LINE_HEIGHT}px`,
              lineHeight: `${EDITOR_LINE_HEIGHT}px`,
            }}
          >
            {num}
          </div>
        );
      })}
    </>
  );
});

Gutter.displayName = 'Gutter';

export const NoteEditorTextarea = memo(
  forwardRef<HTMLTextAreaElement, NoteEditorTextareaProps>((props, ref) => {
    const {
      noteId,
      content,
      handleContentChange,
      onKeyDown,
      handleScroll,
      updateScrollVisibility,
      updateActiveLine,
      lineWrap,
      textAlign,
      showLineNumbers,
      activeLine,
      showEditorScrollTop,
      showEditorScrollBottom,
      scrollToTop,
      scrollToBottom,
      gutterRef,
      spellCheck = false,
      placeholder = 'Start writing your notes...',
      disabled = false,
    } = props;

    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const savedScrollTopRef = useRef(0);

    useScrollRestoration(`note_editor_${noteId || 'default'}`, textareaRef, {
      onRestore: (pos) => {
        savedScrollTopRef.current = pos.top;
        if (gutterRef.current) {
          gutterRef.current.scrollTop = pos.top;
        }
        setScrollTop(pos.top);
      },
    });

    useImperativeHandle(ref, () => {
      if (!textareaRef.current) {
        throw new Error('NoteEditorTextarea: textarea ref is not initialized');
      }

      return textareaRef.current;
    });

    const totalLines = useMemo(() => {
      return content.split('\n').length;
    }, [content]);

    const lineNumbers = useMemo(() => {
      const limitedLines = Math.min(totalLines, MAX_LINE_RENDER);

      return Array.from({ length: limitedLines }, (_, i) => i + 1);
    }, [totalLines]);

    const handleTextareaScroll = useCallback(
      (e: React.UIEvent<HTMLTextAreaElement>) => {
        savedScrollTopRef.current = e.currentTarget.scrollTop;
        lastKnownEditorScrollTop = e.currentTarget.scrollTop;
        setScrollTop(e.currentTarget.scrollTop);

        handleScroll(e);
        updateScrollVisibility();

        if (gutterRef.current) {
          gutterRef.current.scrollTop = e.currentTarget.scrollTop;
        }
      },
      [gutterRef, handleScroll, updateScrollVisibility],
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const currentScroll = textareaRef.current?.scrollTop ?? e.currentTarget.scrollTop;
        savedScrollTopRef.current = currentScroll;
        lastKnownEditorScrollTop = currentScroll;
        handleContentChange(e.target.value);
      },
      [handleContentChange],
    );

    const preserveScrollPosition = useCallback((scrollValue: number) => {
      savedScrollTopRef.current = scrollValue;
      lastKnownEditorScrollTop = scrollValue;
    }, []);

    useLayoutEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (savedScrollTopRef.current === 0 && lastKnownEditorScrollTop > 0) {
        savedScrollTopRef.current = lastKnownEditorScrollTop;
      }

      if (savedScrollTopRef.current > 0) {
        textarea.scrollTop = savedScrollTopRef.current;
        if (gutterRef.current) {
          gutterRef.current.scrollTop = savedScrollTopRef.current;
        }
        setScrollTop(savedScrollTopRef.current);
      }
    }, [gutterRef]);

    useLayoutEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (Math.abs(textarea.scrollTop - savedScrollTopRef.current) > 1) {
        textarea.scrollTop = savedScrollTopRef.current;
        lastKnownEditorScrollTop = savedScrollTopRef.current;
        if (gutterRef.current) {
          gutterRef.current.scrollTop = savedScrollTopRef.current;
        }
      }
    }, [content, gutterRef]);

    const highlightTransform = useMemo(() => {
      const translateY = activeLine * EDITOR_LINE_HEIGHT - scrollTop;

      return `translateY(${translateY}px)`;
    }, [activeLine, scrollTop]);

    const ensureTextareaFocus = useCallback(() => {
      if (disabled) return;
      textareaRef.current?.focus();
    }, [disabled]);

    return (
      <div
        className="relative flex flex-1 overflow-hidden"
        data-testid="note-editor-container"
        onMouseDown={ensureTextareaFocus}
      >
        {/* ACTIVE LINE HIGHLIGHT */}
        <div
          className="pointer-events-none absolute top-0 right-0 bottom-0 overflow-hidden"
          style={{
            left: showLineNumbers ? `${GUTTER_WIDTH}px` : 0,
          }}
          aria-hidden="true"
        >
          <div
            className="absolute left-0 right-0 border-y border-white/10 bg-white/[0.04]"
            style={{
              top: `${EDITOR_PADDING}px`,
              height: `${EDITOR_LINE_HEIGHT}px`,
              transform: highlightTransform,
              willChange: 'transform',
            }}
          />
        </div>

        {/* GUTTER */}
        {showLineNumbers && (
          <div
            ref={gutterRef}
            className="shrink-0 overflow-hidden border-r border-white/5 bg-white/[0.02] font-mono text-xs tabular-nums select-none text-right"
            style={{
              width: `${GUTTER_WIDTH}px`,
              paddingTop: `${EDITOR_PADDING}px`,
              paddingBottom: EXTRA_BOTTOM_SPACE,
              paddingRight: '10px',
            }}
            aria-hidden="true"
          >
            <Gutter lineNumbers={lineNumbers} activeLine={activeLine} />
          </div>
        )}

        {/* TEXTAREA */}
        <textarea
          ref={textareaRef}
          value={content}
          disabled={disabled}
          wrap={lineWrap ? 'soft' : 'off'}
          spellCheck={spellCheck}
          placeholder={placeholder}
          onChange={handleChange}
          onScroll={handleTextareaScroll}
          onBeforeInput={(e) => preserveScrollPosition(e.currentTarget.scrollTop)}
          onSelect={updateActiveLine}
          onClick={updateActiveLine}
          onKeyUp={updateActiveLine}
          onKeyDown={(e) => {
            preserveScrollPosition(e.currentTarget.scrollTop);
            onKeyDown(e);
          }}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          aria-label="Note editor"
          aria-multiline="true"
          data-testid="note-editor-textarea"
          className="
          custom-scrollbar
          relative
          z-10
          flex-1
          resize-none
          border-0
          bg-transparent
          font-mono
          text-sm
          text-text/85
          focus:outline-none
          disabled:cursor-not-allowed
          disabled:opacity-50
        "
          style={{
            padding: `${EDITOR_PADDING}px ${EDITOR_PADDING}px ${EXTRA_BOTTOM_SPACE} ${EDITOR_PADDING}px`,
            lineHeight: `${EDITOR_LINE_HEIGHT}px`,
            whiteSpace: lineWrap ? 'pre-wrap' : 'pre',
            overflowWrap: lineWrap ? 'break-word' : 'normal',
            wordBreak: lineWrap ? 'break-word' : 'normal',
            textAlign,
            caretColor: 'currentColor',
          }}
        />

        {/* SCROLL TOP BUTTON */}
        <ScrollButton
          visible={showEditorScrollTop}
          ariaLabel="Scroll to top"
          onClick={scrollToTop}
          icon={ChevronUp}
          className="right-5 bottom-14"
        />

        {/* SCROLL BOTTOM BUTTON */}
        <ScrollButton
          visible={showEditorScrollBottom}
          ariaLabel="Scroll to bottom"
          onClick={scrollToBottom}
          icon={ChevronDown}
          className="right-5 bottom-3"
        />
      </div>
    );
  }),
);

NoteEditorTextarea.displayName = 'NoteEditorTextarea';
