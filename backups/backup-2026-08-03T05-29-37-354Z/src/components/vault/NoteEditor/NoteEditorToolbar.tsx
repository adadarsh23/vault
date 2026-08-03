import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Type,
  WrapText,
  ExternalLink,
  Save,
  ChevronUp,
  ChevronDown,
  ListOrdered,
  Hash,
  MoreHorizontal,
  Copy,
  Trash2,
  Printer,
  SearchCode,
  Maximize2,
  Minimize2,
  X,
  Check,
  Heading1,
  Heading2,
  Heading3,
  List,
  Quote,
  Code,
  Calendar,
  Link as LinkIcon,
  Image as ImageIcon,
  Table,
  Strikethrough,
  Code2,
  Minus,
  Highlighter,
  Eye,
  EyeOff,
  Globe,
  Wand2,
  Eraser,
  Download,
  Palette,
  Smile,
  FolderOpen,
  Loader,
  CheckSquare,
  AlignLeft,
  CheckCircle2,
  AlertCircle,
  AlignCenter,
  AlignRight,
  TextSearch,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '../../ui/Button';
import { cn } from '../../../lib/utils';
import { logger } from '../../../lib/logger';

const isLikelyUrl = (value: string) => {
  const text = value.trim();
  if (!text || /\s/.test(text)) return false;
  try {
    const parsed = new URL(text);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

type EmojiMartSkin = { native?: string };
type EmojiMartEntry = { skins?: EmojiMartSkin[] };
type EmojiMartDataset = { emojis?: Record<string, EmojiMartEntry> };
type ErrorBoundaryProps = { children: React.ReactNode };
type ErrorBoundaryState = { hasError: boolean };

class ToolbarErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    logger.error('Toolbar subtree render failed', { error });
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

const getCuratedEmojiOptions = (dataset: EmojiMartDataset | null) => {
  if (!dataset) return [];
  const entries = Object.values(dataset.emojis ?? {});
  const seen = new Set<string>();
  const curated: string[] = [];

  for (const entry of entries) {
    const native = entry.skins?.[0]?.native;
    if (!native || seen.has(native)) continue;
    seen.add(native);
    curated.push(native);
  }

  return curated;
};

const EMOJI_CHUNK_SIZE = 160;
const EMOJI_CELL_SIZE = 28;
const EMOJI_CELL_GAP = 2;

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';
type MenuDirection = 'vertical' | 'grid';
type MenuTriggerRef = React.RefObject<HTMLElement | null>;
type ThrottledFunction<T extends (...args: any[]) => void> = ((...args: Parameters<T>) => void) & {
  cancel: () => void;
};

const throttle = <T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): ThrottledFunction<T> => {
  let lastRun = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = delay - (now - lastRun);
    lastArgs = args;

    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastRun = now;
      fn(...args);
      lastArgs = null;
      return;
    }

    if (!timeoutId) {
      timeoutId = setTimeout(() => {
        timeoutId = null;
        lastRun = Date.now();
        if (lastArgs) fn(...lastArgs);
        lastArgs = null;
      }, remaining);
    }
  }) as ThrottledFunction<T>;

  throttled.cancel = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = null;
    lastArgs = null;
  };

  return throttled;
};

const handleMenuNavigation = (
  event: React.KeyboardEvent<HTMLElement>,
  closeMenu: () => void,
  triggerRef: MenuTriggerRef,
  direction: MenuDirection = 'vertical'
) => {
  const menuItems = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
  );

  if (event.key === 'Escape') {
    event.preventDefault();
    closeMenu();
    triggerRef.current?.focus();
    return;
  }

  if (!menuItems.length) return;

  const currentIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
  const lastIndex = menuItems.length - 1;

  if (event.key === 'Tab' && menuItems.length) {
    event.preventDefault();
    const nextIndex = event.shiftKey
      ? currentIndex <= 0
        ? lastIndex
        : currentIndex - 1
      : currentIndex >= lastIndex
        ? 0
        : currentIndex + 1;
    menuItems[nextIndex]?.focus();
    return;
  }
  const isNextKey =
    event.key === 'ArrowDown' || (direction === 'grid' && event.key === 'ArrowRight');
  const isPreviousKey =
    event.key === 'ArrowUp' || (direction === 'grid' && event.key === 'ArrowLeft');

  if (isNextKey) {
    event.preventDefault();
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % menuItems.length : 0;
    menuItems[nextIndex]?.focus();
  }

  if (isPreviousKey) {
    event.preventDefault();
    const prevIndex =
      currentIndex >= 0 ? (currentIndex - 1 + menuItems.length) % menuItems.length : lastIndex;
    menuItems[prevIndex]?.focus();
  }

  if (event.key === 'Home') {
    event.preventDefault();
    menuItems[0]?.focus();
  }

  if (event.key === 'End') {
    event.preventDefault();
    menuItems[lastIndex]?.focus();
  }
};

const useOutsideClick = (
  refs: React.RefObject<HTMLElement | null>[],
  handler: () => void,
  enabled: boolean
) => {
  useEffect(() => {
    if (!enabled) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const clickedInside = refs.some((ref) => ref.current?.contains(target));

      if (!clickedInside) handler();
    };

    document.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [enabled, handler, refs]);
};

interface NoteEditorToolbarProps {
  handleUndo: () => void;
  handleRedo: () => void;
  historyIndex: number;
  historyLength: number;
  applyFormatting: (type: string, value?: string) => void;
  jumpBlock: (direction: 'up' | 'down') => void;
  setShowGoToLine: React.Dispatch<React.SetStateAction<boolean>>;
  lineWrap: boolean;
  setLineWrap: React.Dispatch<React.SetStateAction<boolean>>;
  showLineNumbers: boolean;
  setShowLineNumbers: React.Dispatch<React.SetStateAction<boolean>>;
  openInBrowser: () => void;
  content: string;
  activeLine: number;
  showPreview: boolean;
  setShowPreview: React.Dispatch<React.SetStateAction<boolean>>;
  showHtmlPreview: boolean;
  setShowHtmlPreview: React.Dispatch<React.SetStateAction<boolean>>;
  showMoreActions: boolean;
  setShowMoreActions: React.Dispatch<React.SetStateAction<boolean>>;
  copyToClipboard: () => void;
  printNote: () => void;
  toggleFullScreen: () => void;
  isFullScreen: boolean;
  clearContent: () => void;
  saveStatus: SaveStatus;
  onCancel: () => void;
  title: string;
  handleAutoSave: (title: string, content: string) => Promise<void>;
  setSaveStatus: (status: SaveStatus) => void;
  formatDocument: () => void;
  downloadNote: () => void;
  importNote: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleFindReplace: () => void;
  showFindReplace: boolean;
  handleCycleTextAlignment: () => void;
  textAlign: 'left' | 'center' | 'right';
  handleShowWordCount: () => void;
  handleAiAssist: () => void;
  handleFocusMode: () => void;
  handleTableControls: () => void;
  showImageUrlInput: boolean;
  handleToggleImageUrlInput: () => void;
  showLinkUrlInput: boolean;
  handleToggleLinkUrlInput: () => void;
  isFocusMode: boolean;
}

export const NoteEditorToolbar: React.FC<NoteEditorToolbarProps> = React.memo(
  ({
    handleUndo,
    handleRedo,
    historyIndex,
    historyLength,
    applyFormatting,
    jumpBlock,
    setShowGoToLine,
    lineWrap,
    setLineWrap,
    showLineNumbers,
    setShowLineNumbers,
    openInBrowser,
    content,
    activeLine,
    showPreview,
    setShowPreview,
    showHtmlPreview,
    setShowHtmlPreview,
    showMoreActions,
    setShowMoreActions,
    copyToClipboard,
    printNote,
    toggleFullScreen,
    isFullScreen,
    clearContent,
    saveStatus,
    onCancel,
    title,
    handleAutoSave,
    setSaveStatus,
    formatDocument,
    downloadNote,
    importNote,
    handleFindReplace,
    showFindReplace,
    handleCycleTextAlignment,
    textAlign,
    handleShowWordCount,
    handleAiAssist,
    handleFocusMode,
    handleTableControls,
    showImageUrlInput,
    handleToggleImageUrlInput,
    showLinkUrlInput,
    handleToggleLinkUrlInput,
    isFocusMode,
  }) => {
    const shouldReduceMotion = useReducedMotion();
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isManualSaveInFlight, setIsManualSaveInFlight] = useState(false);
    const [emojiDataset, setEmojiDataset] = useState<EmojiMartDataset | null>(null);
    const [visibleEmojiCount, setVisibleEmojiCount] = useState(EMOJI_CHUNK_SIZE);
    const isMountedRef = useRef(true);
    const frameRef = useRef<number | null>(null);
    const textColorInputRef = useRef<HTMLInputElement>(null);
    const importFileInputRef = useRef<HTMLInputElement>(null);
    const emojiButtonRef = useRef<HTMLButtonElement>(null);
    const emojiMenuRef = useRef<HTMLDivElement>(null);
    const moreActionsButtonRef = useRef<HTMLButtonElement>(null);
    const moreActionsMenuRef = useRef<HTMLDivElement>(null);
    const [emojiPickerPosition, setEmojiPickerPosition] = useState({
      top: 0,
      left: 0,
      width: 268,
      maxHeight: 160,
    });

    const closeEmojiPicker = useCallback(() => {
      setShowEmojiPicker(false);
    }, []);

    useEffect(() => {
      return () => {
        isMountedRef.current = false;
        if (frameRef.current !== null && typeof window !== 'undefined') {
          window.cancelAnimationFrame(frameRef.current);
        }
      };
    }, []);

    useEffect(() => {
      let cancelled = false;

      const loadEmojiDataset = async () => {
        try {
          const module = await import('@emoji-mart/data');
          if (!cancelled) {
            setEmojiDataset(module.default as EmojiMartDataset);
          }
        } catch (error) {
          logger.error('Failed to load emoji dataset', { error });
        }
      };

      loadEmojiDataset();
      return () => {
        cancelled = true;
      };
    }, []);

    const emojiOptions = useMemo(() => getCuratedEmojiOptions(emojiDataset), [emojiDataset]);
    const visibleEmojiOptions = emojiOptions.slice(0, visibleEmojiCount);
    const [emojiScrollTop, setEmojiScrollTop] = useState(0);
    const emojiColumns = Math.max(
      1,
      Math.floor(emojiPickerPosition.width / (EMOJI_CELL_SIZE + EMOJI_CELL_GAP))
    );
    const emojiRowHeight = EMOJI_CELL_SIZE + EMOJI_CELL_GAP;
    const emojiTotalRows = Math.ceil(visibleEmojiOptions.length / emojiColumns);
    const emojiVisibleRows = Math.max(1, Math.ceil(emojiPickerPosition.maxHeight / emojiRowHeight));
    const emojiStartRow = Math.max(0, Math.floor(emojiScrollTop / emojiRowHeight) - 2);
    const emojiEndRow = Math.min(emojiTotalRows, emojiStartRow + emojiVisibleRows + 4);
    const emojiStartIndex = emojiStartRow * emojiColumns;
    const emojiEndIndex = Math.min(visibleEmojiOptions.length, emojiEndRow * emojiColumns);
    const virtualizedEmojiOptions = visibleEmojiOptions.slice(emojiStartIndex, emojiEndIndex);
    const activeLineText = useMemo(() => {
      const split = content.split('\n');
      return split[activeLine] || '';
    }, [content, activeLine]);
    const hasActiveLineUrl = useMemo(() => isLikelyUrl(activeLineText), [activeLineText]);

    const loadMoreEmojis = useCallback(() => {
      setVisibleEmojiCount((count) => Math.min(count + EMOJI_CHUNK_SIZE, emojiOptions.length));
    }, [emojiOptions.length]);

    const handleEmojiGridScroll = useMemo(
      () =>
        throttle((distanceFromBottom: number) => {
          if (distanceFromBottom < 120) {
            loadMoreEmojis();
          }
        }, 200),
      [loadMoreEmojis]
    );

    const onEmojiGridScroll = useCallback(
      (event: React.UIEvent<HTMLDivElement>) => {
        const grid = event.currentTarget;
        setEmojiScrollTop(grid.scrollTop);
        const distanceFromBottom = grid.scrollHeight - grid.scrollTop - grid.clientHeight;
        handleEmojiGridScroll(distanceFromBottom);
      },
      [handleEmojiGridScroll]
    );

    useEffect(() => {
      return () => handleEmojiGridScroll.cancel();
    }, [handleEmojiGridScroll]);

    const closeMoreActions = useCallback(() => {
      setShowMoreActions(false);
    }, [setShowMoreActions]);

    const toggleEmojiPicker = useCallback(() => {
      setShowMoreActions(false);
      setShowEmojiPicker((isOpen) => !isOpen);
    }, [setShowMoreActions]);

    const toggleMoreActions = useCallback(() => {
      setShowEmojiPicker(false);
      setShowMoreActions((prev) => !prev);
    }, [setShowMoreActions]);

    const openTextColorPicker = useCallback(() => {
      setShowEmojiPicker(false);
      setShowMoreActions(false);
      textColorInputRef.current?.click();
    }, [setShowMoreActions]);

    const openImportFilePicker = useCallback(() => {
      setShowEmojiPicker(false);
      setShowMoreActions(false);
      importFileInputRef.current?.click();
    }, [setShowMoreActions]);

    const handleEmojiSelect = useCallback(
      (emoji: string) => {
        applyFormatting('emoji', emoji);
        setShowEmojiPicker(false);
        emojiButtonRef.current?.focus();
      },
      [applyFormatting]
    );

    const handleEmojiMenuKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        handleMenuNavigation(event, closeEmojiPicker, emojiButtonRef, 'grid');
      },
      [closeEmojiPicker]
    );

    const handleMoreActionsMenuKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        handleMenuNavigation(event, closeMoreActions, moreActionsButtonRef);
      },
      [closeMoreActions]
    );

    const handleFormatDocument = useCallback(() => {
      closeMoreActions();
      formatDocument();
    }, [closeMoreActions, formatDocument]);

    const handleCopyAllText = useCallback(() => {
      closeMoreActions();
      copyToClipboard();
    }, [closeMoreActions, copyToClipboard]);

    const handleSearchGoTo = useCallback(() => {
      closeMoreActions();
      setShowGoToLine(true);
    }, [closeMoreActions, setShowGoToLine]);

    const handlePrintNote = useCallback(() => {
      closeMoreActions();
      printNote();
    }, [closeMoreActions, printNote]);

    const handleToggleFullScreen = useCallback(() => {
      closeMoreActions();
      toggleFullScreen();
    }, [closeMoreActions, toggleFullScreen]);

    const handleToggleMarkdownPreview = useCallback(() => {
      closeMoreActions();
      setShowPreview((prev) => {
        const next = !prev;
        if (next) setShowHtmlPreview(false);
        return next;
      });
    }, [closeMoreActions, setShowHtmlPreview, setShowPreview]);
    const handleToggleHtmlPreview = useCallback(() => {
      setShowHtmlPreview((prev) => {
        const next = !prev;
        if (next) setShowPreview(false);
        return next;
      });
    }, [setShowHtmlPreview, setShowPreview]);

    const handleClearContent = useCallback(() => {
      closeMoreActions();
      clearContent();
    }, [clearContent, closeMoreActions]);

    const handleBold = useCallback(() => applyFormatting('bold'), [applyFormatting]);
    const handleItalic = useCallback(() => applyFormatting('italic'), [applyFormatting]);
    const handleUpper = useCallback(() => applyFormatting('upper'), [applyFormatting]);
    const handleLower = useCallback(() => applyFormatting('lower'), [applyFormatting]);
    const handleHeading1 = useCallback(() => applyFormatting('h1'), [applyFormatting]);
    const handleHeading2 = useCallback(() => applyFormatting('h2'), [applyFormatting]);
    const handleHeading3 = useCallback(() => applyFormatting('h3'), [applyFormatting]);
    const handleList = useCallback(() => applyFormatting('list'), [applyFormatting]);
    const handleOrderedList = useCallback(() => applyFormatting('ordered-list'), [applyFormatting]);
    const handleTodoList = useCallback(() => applyFormatting('todo'), [applyFormatting]);
    const handleQuote = useCallback(() => applyFormatting('quote'), [applyFormatting]);
    const handleCodeBlock = useCallback(() => applyFormatting('code'), [applyFormatting]);
    const handleInlineCode = useCallback(() => applyFormatting('inline-code'), [applyFormatting]);
    const handleInsertLink = useCallback(() => {
      handleToggleLinkUrlInput();
    }, [handleToggleLinkUrlInput]);
    const handleStrike = useCallback(() => applyFormatting('strike'), [applyFormatting]);
    const handleHighlight = useCallback(() => applyFormatting('highlight'), [applyFormatting]);
    const handleClearFormatting = useCallback(() => applyFormatting('clear'), [applyFormatting]);
    const handleHorizontalRule = useCallback(() => applyFormatting('hr'), [applyFormatting]);
    const handleInsertDate = useCallback(() => applyFormatting('date'), [applyFormatting]);
    const handleToggleGoToLine = useCallback(() => {
      setShowGoToLine((prev) => !prev);
    }, [setShowGoToLine]);
    const handleJumpUp = useCallback(() => {
      jumpBlock('up');
    }, [jumpBlock]);
    const handleJumpDown = useCallback(() => {
      jumpBlock('down');
    }, [jumpBlock]);
    const handleToggleLineWrap = useCallback(() => {
      setLineWrap((prev) => !prev);
    }, [setLineWrap]);
    const handleToggleLineNumbers = useCallback(() => {
      setShowLineNumbers((prev) => !prev);
    }, [setShowLineNumbers]);
    const handleTextColorChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        applyFormatting('color', e.target.value);
      },
      [applyFormatting]
    );
    const handleEmojiTriggerKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (typeof window === 'undefined') return;
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        setShowMoreActions(false);
        setShowEmojiPicker(true);
        frameRef.current = window.requestAnimationFrame(() => {
          const emojiButtons =
            emojiMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
          if (!emojiButtons?.length) return;
          if (event.key === 'ArrowUp') {
            emojiButtons[emojiButtons.length - 1]?.focus();
            return;
          }
          emojiButtons[0]?.focus();
        });
      },
      [setShowMoreActions]
    );
    const handleMoreActionsTriggerKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (typeof window === 'undefined') return;
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        setShowEmojiPicker(false);
        setShowMoreActions(true);
        frameRef.current = window.requestAnimationFrame(() => {
          const actionButtons =
            moreActionsMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
          if (!actionButtons?.length) return;
          if (event.key === 'ArrowUp') {
            actionButtons[actionButtons.length - 1]?.focus();
            return;
          }
          actionButtons[0]?.focus();
        });
      },
      [setShowMoreActions]
    );

    const emojiOutsideClickRefs = useMemo(() => [emojiButtonRef, emojiMenuRef], []);
    const moreActionsOutsideClickRefs = useMemo(
      () => [moreActionsButtonRef, moreActionsMenuRef],
      []
    );

    useOutsideClick(emojiOutsideClickRefs, closeEmojiPicker, showEmojiPicker);
    useOutsideClick(moreActionsOutsideClickRefs, closeMoreActions, showMoreActions);

    useEffect(() => {
      if (typeof document === 'undefined') return;
      if (!showEmojiPicker && !showMoreActions) return;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;

        if (showEmojiPicker) {
          closeEmojiPicker();
          emojiButtonRef.current?.focus();
        }

        if (showMoreActions) {
          closeMoreActions();
          moreActionsButtonRef.current?.focus();
        }
      };

      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [closeEmojiPicker, closeMoreActions, showEmojiPicker, showMoreActions]);

    useEffect(() => {
      if (typeof window === 'undefined') return;
      if (!showEmojiPicker) return;

      setVisibleEmojiCount(EMOJI_CHUNK_SIZE);
      setEmojiScrollTop(0);

      frameRef.current = window.requestAnimationFrame(() => {
        emojiMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
      });
      return () => {
        if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      };
    }, [showEmojiPicker]);

    useEffect(() => {
      if (typeof window === 'undefined') return;
      if (!showMoreActions) return;

      frameRef.current = window.requestAnimationFrame(() => {
        moreActionsMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
      });
      return () => {
        if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      };
    }, [showMoreActions]);

    useEffect(() => {
      if (typeof window === 'undefined') return;
      if (!showEmojiPicker) return;

      const updateEmojiPickerPosition = () => {
        const button = emojiButtonRef.current;
        if (!button) return;

        const rect = button.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
        const viewportPadding = 8;
        const viewport = window.visualViewport;
        const viewportLeft = viewport?.offsetLeft ?? 0;
        const viewportTop = viewport?.offsetTop ?? 0;
        const viewportWidth = viewport?.width ?? window.innerWidth;
        const viewportHeight = viewport?.height ?? window.innerHeight;
        const viewportRight = viewportLeft + viewportWidth;
        const viewportBottom = viewportTop + viewportHeight;
        const gap = 8;
        const pickerWidth = Math.max(
          isDesktop ? 170 : 110,
          Math.min(isDesktop ? 220 : 170, viewportWidth - viewportPadding * 2)
        );
        const availableAbove = rect.top - viewportTop - viewportPadding - gap;
        const availableBelow = viewportBottom - rect.bottom - viewportPadding - gap;
        const opensUp = availableAbove >= 160 || availableAbove > availableBelow;
        const maxHeight = Math.max(
          isDesktop ? 100 : 64,
          Math.min(isDesktop ? 180 : 140, opensUp ? availableAbove : availableBelow)
        );
        const preferredLeft = isDesktop ? rect.left - pickerWidth - gap : rect.left;
        const left = Math.max(
          viewportLeft + viewportPadding,
          Math.min(preferredLeft, viewportRight - pickerWidth - viewportPadding)
        );
        const top = opensUp
          ? Math.max(viewportTop + viewportPadding, rect.top - maxHeight - gap)
          : Math.max(
              viewportTop + viewportPadding,
              Math.min(rect.bottom + gap, viewportBottom - maxHeight - viewportPadding)
            );

        setEmojiPickerPosition({
          top,
          left,
          width: pickerWidth,
          maxHeight,
        });
      };

      updateEmojiPickerPosition();
      window.addEventListener('resize', updateEmojiPickerPosition);
      window.addEventListener('scroll', updateEmojiPickerPosition);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateEmojiPickerPosition);
        window.visualViewport.addEventListener('scroll', updateEmojiPickerPosition);
      }

      return () => {
        window.removeEventListener('resize', updateEmojiPickerPosition);
        window.removeEventListener('scroll', updateEmojiPickerPosition);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', updateEmojiPickerPosition);
          window.visualViewport.removeEventListener('scroll', updateEmojiPickerPosition);
        }
      };
    }, [showEmojiPicker]);

    return (
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] p-2 gap-2">
        <div className="flex-1 flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden px-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            data-testid="undo-btn"
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="shrink-0"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRedo}
            disabled={historyIndex >= historyLength - 1}
            data-testid="redo-btn"
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            className="shrink-0"
          >
            <Redo2 className="h-4 w-4" />
          </Button>

          <div className="mx-1 h-5 w-px shrink-0 rounded-full bg-gradient-to-b from-transparent via-white/30 to-transparent opacity-80" />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBold}
            title="Bold (Ctrl+B)"
            className="shrink-0"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleItalic}
            title="Italic (Ctrl+I)"
            className="shrink-0"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleUpper}
            title="Uppercase"
            className="shrink-0"
          >
            <div className="flex items-baseline">
              <Type className="h-4 w-4" />
              <span className="text-[10px] font-bold ml-[1px]">A</span>
            </div>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLower}
            title="Lowercase"
            className="shrink-0"
          >
            <div className="flex items-baseline">
              <Type className="h-4 w-4" />
              <span className="text-[10px] font-bold ml-[1px]">a</span>
            </div>
          </Button>
          <div className="mx-1 h-5 w-px shrink-0 rounded-full bg-gradient-to-b from-transparent via-white/30 to-transparent opacity-80" />
          <Button
            variant={showFindReplace ? 'secondary' : 'ghost'}
            size="icon"
            onClick={handleFindReplace}
            title="Find & Replace"
            className="shrink-0"
          >
            <TextSearch className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCycleTextAlignment}
            title={`Text Alignment (${textAlign})`}
            className="shrink-0"
          >
            {textAlign === 'left' && <AlignLeft className="h-4 w-4" />}
            {textAlign === 'center' && <AlignCenter className="h-4 w-4" />}
            {textAlign === 'right' && <AlignRight className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleShowWordCount}
            title="Word Count"
            className="shrink-0"
          >
            <Type className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleAiAssist}
            title="AI Assist"
            className="shrink-0 text-white/80 hover:text-white"
          >
            <Wand2 className="h-4 w-4" />
          </Button>
          <Button
            variant={isFocusMode ? 'secondary' : 'ghost'}
            size="icon"
            onClick={handleFocusMode}
            title="Focus Mode"
            aria-label="Focus mode"
            className={cn('shrink-0', isFocusMode ? 'bg-white/20 text-white' : '')}
          >
            {isFocusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleTableControls}
            title="Table Controls"
            className="shrink-0"
          >
            <Table className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleGoToLine}
            title="Go to Line (Ctrl+G)"
            aria-label="Go to line"
            className="shrink-0"
          >
            <SearchCode className="h-4 w-4" />
          </Button>

          <div className="mx-1 h-5 w-px shrink-0 rounded-full bg-gradient-to-b from-transparent via-white/30 to-transparent opacity-80" />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleHeading1}
            title="Heading 1 (Ctrl+Shift+1)"
            className="shrink-0"
          >
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleHeading2}
            title="Heading 2 (Ctrl+Shift+2)"
            className="shrink-0"
          >
            <Heading2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleHeading3}
            title="Heading 3 (Ctrl+Shift+3)"
            className="shrink-0"
          >
            <Heading3 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleList}
            title="Bulleted List"
            className="shrink-0"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleOrderedList}
            title="Numbered List"
            className="shrink-0"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleTodoList}
            title="Task List"
            className="shrink-0"
          >
            <CheckSquare className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleQuote}
            title="Quote"
            className="shrink-0"
          >
            <Quote className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCodeBlock}
            title="Code Block (Ctrl+E)"
            className="shrink-0"
          >
            <Code className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleInlineCode}
            title="Inline Code"
            className="shrink-0"
          >
            <Code2 className="h-4 w-4" />
          </Button>
          <Button
            variant={showLinkUrlInput ? 'secondary' : 'ghost'}
            size="icon"
            onClick={handleInsertLink}
            data-testid="insert-link-btn"
            title="Insert Link (Ctrl+K)"
            className={cn('shrink-0', showLinkUrlInput ? 'bg-white/20 text-white' : '')}
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleStrike}
            title="Strikethrough"
            className="shrink-0"
          >
            <Strikethrough className="h-4 w-4" />
          </Button>
          <Button
            variant={showImageUrlInput ? 'secondary' : 'ghost'}
            size="icon"
            onClick={handleToggleImageUrlInput}
            data-testid="insert-image-btn"
            title="Insert Image"
            className={cn('shrink-0', showImageUrlInput ? 'bg-white/20 text-white' : '')}
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleHighlight}
            title="Highlight"
            className="shrink-0"
          >
            <Highlighter className="h-4 w-4" />
          </Button>
          <div className="relative flex items-center shrink-0">
            <input
              ref={textColorInputRef}
              type="color"
              aria-label="Choose text color"
              className="absolute opacity-0 w-0 h-0"
              onChange={handleTextColorChange}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={openTextColorPicker}
              title="Text Color"
              data-testid="text-color-btn"
              aria-label="Text color"
              className="shrink-0"
            >
              <Palette className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center shrink-0">
            <Button
              ref={emojiButtonRef}
              variant={showEmojiPicker ? 'secondary' : 'ghost'}
              size="icon"
              onClick={toggleEmojiPicker}
              onKeyDown={handleEmojiTriggerKeyDown}
              title="Insert Emoji"
              data-testid="emoji-toggle-btn"
              aria-expanded={showEmojiPicker}
              aria-haspopup="menu"
              aria-label="Insert emoji"
              className={cn('shrink-0', showEmojiPicker ? 'bg-white/10 text-white' : '')}
            >
              <Smile className="h-4 w-4" />
            </Button>

            <ToolbarErrorBoundary>
              <AnimatePresence>
                {showEmojiPicker && (
                  <>
                    <div className="fixed inset-0 z-40 pointer-events-none" aria-hidden="true" />
                    <motion.div
                      ref={emojiMenuRef}
                      initial={
                        shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 }
                      }
                      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 }}
                      transition={shouldReduceMotion ? { duration: 0 } : undefined}
                      style={{
                        top: emojiPickerPosition.top,
                        left: emojiPickerPosition.left,
                        width: emojiPickerPosition.width,
                      }}
                      role="menu"
                      aria-label="Emoji picker"
                      onKeyDown={handleEmojiMenuKeyDown}
                      className="fixed z-[9999] will-change-transform overflow-hidden bg-bg/95 border border-white/10 rounded-lg shadow-2xl shadow-black/30 backdrop-blur-md"
                    >
                      <div
                        className="grid gap-0.5 overflow-y-auto p-1 overscroll-contain [scrollbar-width:thin]"
                        onScroll={onEmojiGridScroll}
                        style={{
                          position: 'relative',
                          maxHeight: emojiPickerPosition.maxHeight,
                          fontFamily:
                            '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
                          fontVariantEmoji: 'emoji',
                        }}
                      >
                        <div style={{ height: emojiTotalRows * emojiRowHeight }}>
                          <div
                            className="grid gap-0.5"
                            style={{
                              position: 'absolute',
                              top: emojiStartRow * emojiRowHeight,
                              left: 0,
                              right: 0,
                              gridTemplateColumns: `repeat(${emojiColumns}, minmax(0, 1fr))`,
                            }}
                          >
                            {virtualizedEmojiOptions.map((emoji, index) => (
                              <button
                                key={`${emoji}-${emojiStartIndex + index}`}
                                type="button"
                                role="menuitem"
                                aria-label={`Insert ${emoji}`}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleEmojiSelect(emoji);
                                }}
                                className="w-7 h-7 flex items-center justify-center text-base hover:bg-white/20 rounded transition-colors"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                        {visibleEmojiCount < emojiOptions.length && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={loadMoreEmojis}
                            className="col-span-full h-8 rounded flex items-center justify-center text-xs text-text/60 hover:bg-white/10 hover:text-text transition-colors"
                          >
                            <Loader />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </ToolbarErrorBoundary>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClearFormatting}
            title="Clear Formatting"
            className="shrink-0"
          >
            <Eraser className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleHorizontalRule}
            title="Horizontal Rule"
            className="shrink-0"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleInsertDate}
            title="Insert Date & Time"
            className="shrink-0"
          >
            <Calendar className="h-4 w-4" />
          </Button>

          <div className="mx-1 h-5 w-px shrink-0 rounded-full bg-gradient-to-b from-transparent via-white/30 to-transparent opacity-80" />

          <Button
            variant="ghost"
            size="icon"
            onClick={handleJumpUp}
            title="Jump up 5 lines"
            className="shrink-0"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleJumpDown}
            title="Jump down 5 lines"
            className="shrink-0"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            variant={lineWrap ? 'secondary' : 'ghost'}
            size="icon"
            onClick={handleToggleLineWrap}
            title="Toggle Wrap"
            aria-label="Toggle wrap"
            className={cn('shrink-0', lineWrap ? 'bg-white/20 text-white' : '')}
          >
            <WrapText className="h-4 w-4" />
          </Button>
          <Button
            variant={showLineNumbers ? 'secondary' : 'ghost'}
            size="icon"
            onClick={handleToggleLineNumbers}
            title={lineWrap ? 'Disable wrap to use line numbers' : 'Toggle Line Numbers'}
            aria-label="Toggle line numbers"
            disabled={lineWrap}
            className={cn('shrink-0', showLineNumbers ? 'bg-white/20 text-white' : '')}
          >
            <Hash className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={openInBrowser}
            title="Open current line in browser"
            data-testid="open-link-btn"
            className={cn('shrink-0', hasActiveLineUrl ? 'text-blue-400' : '')}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={downloadNote}
            title="Download Note"
            className="shrink-0"
          >
            <Download className="h-4 w-4" />
          </Button>
          <div className="relative flex items-center shrink-0">
            <input
              ref={importFileInputRef}
              type="file"
              className="absolute opacity-0 w-0 h-0"
              accept=".md,.txt,.markdown"
              onChange={importNote}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={openImportFilePicker}
              title="Open file from computer"
              data-testid="import-file-btn"
              aria-label="Open file from computer"
              className="shrink-0"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>

          <div className="mx-1 h-5 w-px shrink-0 rounded-full bg-gradient-to-b from-transparent via-white/30 to-transparent opacity-80" />
          <Button
            variant="ghost"
            size="icon"
            onClick={copyToClipboard}
            title="Copy All Text"
            className="shrink-0"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant={showPreview ? 'secondary' : 'ghost'}
            size="icon"
            onClick={handleToggleMarkdownPreview}
            title="Toggle Markdown Preview (Ctrl+P)"
            aria-label="Toggle markdown preview"
            className={cn('shrink-0', showPreview ? 'bg-white/20 text-white' : '')}
          >
            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            variant={showHtmlPreview ? 'secondary' : 'ghost'}
            size="icon"
            onClick={handleToggleHtmlPreview}
            title="Toggle HTML View"
            aria-label="Toggle HTML view"
            className={cn('shrink-0 h-9 w-9', showHtmlPreview ? 'bg-white/20 text-white' : '')}
          >
            <Globe className="h-4 w-4" />
          </Button>

          <div className="mx-1 h-5 w-px shrink-0 rounded-full bg-gradient-to-b from-transparent via-white/30 to-transparent opacity-80" />
        </div>

        <div className="relative shrink-0 flex items-center gap-1">
          <div className="relative shrink-0">
            <Button
              ref={moreActionsButtonRef}
              variant={showMoreActions ? 'secondary' : 'ghost'}
              size="icon"
              onClick={toggleMoreActions}
              onKeyDown={handleMoreActionsTriggerKeyDown}
              title="More Actions"
              data-testid="more-actions-btn"
              aria-expanded={showMoreActions}
              aria-haspopup="menu"
              aria-label="More actions"
              className={cn(showMoreActions ? 'bg-white/10 text-white' : '')}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>

            <AnimatePresence>
              {showMoreActions && (
                <>
                  <div className="fixed inset-0 z-40" onClick={closeMoreActions} />
                  <motion.div
                    ref={moreActionsMenuRef}
                    initial={
                      shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }
                    }
                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 10 }}
                    transition={shouldReduceMotion ? { duration: 0 } : undefined}
                    role="menu"
                    aria-label="Note actions"
                    onKeyDown={handleMoreActionsMenuKeyDown}
                    className="absolute right-0 top-full mt-2 w-48 z-50 bg-bg/90 border border-white/10 p-1.5 rounded-xl shadow-2xl backdrop-blur-md"
                  >
                    <div className="text-[10px] font-bold text-text/30 px-3 py-1 uppercase tracking-wider">
                      Note Actions
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleFormatDocument}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text/70 hover:text-text hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      <span>Format Document</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleToggleMarkdownPreview}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text/70 hover:text-text hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Mark Preview</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleToggleHtmlPreview}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text/70 hover:text-text hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <Globe className="h-3.5 w-3.5" />
                      <span>HTML Preview</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleCopyAllText}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text/70 hover:text-text hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy All Text</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleSearchGoTo}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text/70 hover:text-text hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <SearchCode className="h-3.5 w-3.5" />
                      <span>Go to Line</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleFindReplace}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text/70 hover:text-text hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <TextSearch className="h-3.5 w-3.5" />
                      <span>Find & Replace</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handlePrintNote}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text/70 hover:text-text hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>Print Note</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleToggleFullScreen}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text/70 hover:text-text hover:bg-white/5 rounded-lg transition-colors"
                    >
                      {isFullScreen ? (
                        <Minimize2 className="h-3.5 w-3.5" />
                      ) : (
                        <Maximize2 className="h-3.5 w-3.5" />
                      )}
                      <span>{isFullScreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}</span>
                    </button>
                    <div className="my-1 h-[1px] bg-white/5" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleClearContent}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400/70 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Clear Content</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
          <div className="mx-1 h-5 w-px shrink-0 rounded-full bg-gradient-to-b from-transparent via-white/30 to-transparent opacity-80" />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center justify-center h-7 w-7 rounded-full bg-white/5 border border-white/5 transition-colors">
            {saveStatus === 'saving' && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
              >
                <Save className="h-3 w-3 text-text/40" />
              </motion.div>
            )}
            {saveStatus === 'saved' && <CheckCircle2 className="h-3 w-3 text-white" />}
            {saveStatus === 'error' && <AlertCircle className="h-3 w-3 text-red-400" />}
            {saveStatus !== 'saving' && saveStatus !== 'saved' && saveStatus !== 'error' && (
              <Save className="h-3 w-3 text-text/50" />
            )}
          </div>
          <Button
            size="xs"
            variant="ghost"
            onClick={onCancel}
            className="text-text/40 hover:text-text font-semibold gap-1.5"
          >
            <X className="h-3 w-3" />
          </Button>
          <Button
            size="xs"
            className="bg-white/10 hover:bg-white/20 border border-white/10 text-white shadow-lg shadow-white/10 font-bold gap-1.5"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            disabled={isManualSaveInFlight}
            onClick={async () => {
              if (isManualSaveInFlight) return;
              setIsManualSaveInFlight(true);
              setSaveStatus('saving');
              try {
                await handleAutoSave(title, content);
                onCancel();
              } catch {
                toast.error('Failed to save note. Please try again.');
              } finally {
                if (isMountedRef.current) {
                  setIsManualSaveInFlight(false);
                }
              }
            }}
            aria-label="Save note"
          >
            <Check className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }
);

NoteEditorToolbar.displayName = 'NoteEditorToolbar';
