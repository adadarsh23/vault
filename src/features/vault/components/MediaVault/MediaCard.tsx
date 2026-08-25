import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  FolderInput,
  Download,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  Image as ImageIcon,
  Folder,
  Pin,
  Loader2,
  PlayCircle,
  MoreVertical,
  Info,
  Check,
  Clock,
  Lock,
  X,
  MessageSquareText,
  Sparkles,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { SafeMedia } from './SafeMedia';
import {
  setDraggedVaultItems,
  createMultiItemDragImage,
  clearDraggedVaultItem,
} from '../../../../lib/vaultDragDrop';
import { ErrorBoundary } from './ErrorBoundary';
import { cn } from '../../../../lib/utils';
import { VaultItem } from '../../../../lib/storage';
import {
  GridDensity,
  formatDuration,
  getResolutionBadge,
  formatFileSize,
  getFileExtension,
} from './mediaUtils';

interface MediaCardProps {
  item: VaultItem;
  idx: number;
  type: 'photo' | 'video';
  masterKey: string | CryptoKey | null;
  isSelected: boolean;
  isChecked?: boolean;
  isSelectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, shiftKey: boolean) => void;
  density?: GridDensity;
  moveMenuOpenId: string | null;
  folders: string[];
  onPreview: (id: string, title: string) => void;
  onMoveMenuToggle: (id: string | null) => void;
  onMoveToFolder: (itemId: string, folder: string | null) => void;
  onDownload: (item: VaultItem) => void;
  onDelete: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onOpenInspector?: (item: VaultItem) => void;
  isPinning?: boolean;
  pinningItemIds?: string[];
  lightweightPreviewMode: boolean;
}

const MediaCardComponent: React.FC<MediaCardProps> = ({
  item,
  idx,
  type,
  masterKey,
  isSelected,
  isChecked = false,
  isSelectionMode = false,
  selectedIds,
  onToggleSelect,
  density = 'large',
  moveMenuOpenId,
  folders,
  onPreview,
  onMoveMenuToggle,
  onMoveToFolder,
  onDownload,
  onDelete,
  onTogglePin,
  onOpenInspector,
  isPinning = false,
  pinningItemIds = [],
  lightweightPreviewMode,
}) => {
  const isCurrentlyPinning = isPinning || pinningItemIds.includes(item.id);
  const [dynamicAspectRatio, setDynamicAspectRatio] = useState<number | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [videoDuration] = useState<number | null>(
    typeof item.metadata?.duration === 'number' ? item.metadata.duration : null
  );

  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<number | null>(null);

  const stopPointerPropagation = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  const stopClickPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Close card menu on outside click
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [isMenuOpen]);

  const rawLiveCapture = item.metadata?.isLiveCapture;
  const isLiveCapture =
    rawLiveCapture === true ||
    rawLiveCapture === 'true' ||
    rawLiveCapture === 1 ||
    rawLiveCapture === '1';

  const width = Number(item.metadata?.width || 0);
  const height = Number(item.metadata?.height || 0);
  const resBadge = getResolutionBadge(width, height);
  const formattedDuration = formatDuration(videoDuration);
  const sizeBytes = Number(
    item.metadata?.size ||
      (typeof item.content === 'string' ? item.content.length : item.content?.byteLength || 0)
  );
  const fileExt = getFileExtension(item.title);
  const createdDateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '';

  const [isTouchHolding, setIsTouchHolding] = useState(false);
  const touchStartTimeRef = useRef<number>(0);

  // Handle Touch Press & Hold for Discreet Reveal and Long-press Selection
  const handleTouchStart = () => {
    touchStartTimeRef.current = Date.now();
    setIsTouchHolding(true);
    longPressTimer.current = window.setTimeout(() => {
      if (onToggleSelect && !isSelectionMode) {
        onToggleSelect(item.id, false);
      }
    }, 550);
  };

  const handleTouchEnd = () => {
    setIsTouchHolding(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // If touch was held to inspect in discreet mode, avoid accidental modal open
    const touchDuration = Date.now() - touchStartTimeRef.current;
    if (touchStartTimeRef.current > 0 && touchDuration > 450) {
      touchStartTimeRef.current = 0;
      return;
    }
    touchStartTimeRef.current = 0;

    if (isSelectionMode && onToggleSelect) {
      onToggleSelect(item.id, e.shiftKey);
    } else {
      onPreview(item.id, item.title);
    }
  };

  const isMoveOpen = moveMenuOpenId === item.id;
  const isCompact = density === 'compact';
  const isLarge = density === 'large';
  const isStandard = density === 'standard';

  const getComputedAspectRatio = () => {
    if (isCompact) return '1 / 1';
    if (isLarge) {
      return type === 'video' ? '16 / 9' : '16 / 10';
    }
    // Standard view
    if (typeof item.metadata?.aspectRatio === 'number' && item.metadata.aspectRatio > 0) {
      return String(item.metadata.aspectRatio);
    }
    if (dynamicAspectRatio) return String(dynamicAspectRatio);
    return type === 'video' ? '16 / 9' : '4 / 3';
  };

  const handleDragStart = (event: React.DragEvent<HTMLElement>) => {
    const isItemPartOfSelection = isChecked || (selectedIds && selectedIds.has(item.id));
    const targetIds =
      isItemPartOfSelection && selectedIds && selectedIds.size > 1
        ? Array.from(selectedIds)
        : [item.id];

    setDraggedVaultItems(event, targetIds);

    if (targetIds.length > 1 && event.dataTransfer?.setDragImage) {
      const dragLabel = type === 'photo' ? 'Photos' : 'Videos';
      const previewElement = createMultiItemDragImage(targetIds.length, dragLabel);
      event.dataTransfer.setDragImage(previewElement.firstElementChild as Element, 70, 45);
      setTimeout(() => previewElement.remove(), 0);
    }
  };

  return (
    <motion.div
      role="button"
      draggable
      onDragStartCapture={handleDragStart}
      onDragEnd={clearDraggedVaultItem}
      data-selected-count={selectedIds && isChecked ? selectedIds.size : 1}
      aria-selected={isSelected || isChecked}
      tabIndex={0}
      aria-label={item.title}
      layout
      initial={{ opacity: 0, scale: 0.92, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileHover={!isCompact ? { y: -4, scale: 1.015 } : undefined}
      transition={{
        delay: Math.min(idx * 0.015, 0.25),
        type: 'spring',
        stiffness: 320,
        damping: 24,
      }}
      onClick={handleCardClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.cancelable) e.preventDefault();
          if (isSelectionMode && onToggleSelect) {
            onToggleSelect(item.id, e.shiftKey);
          } else {
            onPreview(item.id, item.title);
          }
        }
      }}
      className={cn(
        'group relative w-full border bg-black/20 backdrop-blur-md transition-all select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black',
        isCompact ? 'rounded-xl sm:rounded-2xl' : 'rounded-2xl sm:rounded-3xl',
        isStandard &&
          (type === 'video'
            ? 'min-h-[120px] xs:min-h-[140px] sm:min-h-[170px] md:min-h-[200px]'
            : 'min-h-[130px] xs:min-h-[150px] sm:min-h-[180px] md:min-h-[210px]'),
        isLarge &&
          'min-h-[240px] xs:min-h-[280px] sm:min-h-[340px] md:min-h-[380px] lg:min-h-[420px]',
        isChecked
          ? 'border-blue-500 ring-2 ring-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.35)]'
          : 'border-white/10 hover:border-white/30 hover:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.7)]',
        isMoveOpen || isMenuOpen ? 'z-40' : 'z-10'
      )}
      style={{
        aspectRatio: getComputedAspectRatio(),
      }}
    >
      {/* Media Image / Video Container */}
      <div className="absolute inset-0 overflow-hidden rounded-[inherit] pointer-events-none">
        <ErrorBoundary
          fallback={
            <div className="flex h-full w-full items-center justify-center bg-red-400/10">
              <AlertTriangle className="h-6 w-6 text-red-400/60" />
            </div>
          }
        >
          {masterKey && !(lightweightPreviewMode && type === 'video') && (
            <SafeMedia
              item={item}
              masterKey={masterKey}
              type={type}
              isThumbnail={true}
              isRevealed={isTouchHolding}
              autoPlayVideo={false}
              onAspectRatioLoaded={setDynamicAspectRatio}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          )}
          {lightweightPreviewMode && type === 'video' && (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 via-black to-slate-800">
              <PlayCircle className="h-10 w-10 text-white/40" />
            </div>
          )}
        </ErrorBoundary>

        {/* Clean gradient overlays */}
        <div
          className={cn(
            'absolute inset-0 bg-gradient-to-b from-black/65 via-transparent to-black/85 transition-opacity duration-300 pointer-events-none',
            isLarge
              ? 'opacity-70 group-hover:opacity-90'
              : isCompact
                ? 'opacity-0 group-hover:opacity-60'
                : 'opacity-70 sm:opacity-0 group-hover:opacity-100'
          )}
        />
      </div>

      {/* Top Left: Checkbox / Live Badge / Specs */}
      <div className="absolute top-2 left-2 sm:top-2.5 sm:left-2.5 z-20 flex items-center gap-1 sm:gap-1.5 pointer-events-auto flex-wrap">
        {isSelectionMode || isChecked ? (
          <button
            type="button"
            onPointerDown={stopPointerPropagation}
            onClick={(e) => {
              stopClickPropagation(e);
              if (onToggleSelect) onToggleSelect(item.id, e.shiftKey);
            }}
            className={cn(
              'rounded-lg flex items-center justify-center transition-all border shadow-lg',
              isCompact ? 'h-5 w-5' : 'h-6 w-6',
              isChecked
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-black/70 text-transparent border-white/50 hover:border-white'
            )}
            aria-label={`Select ${item.title}`}
          >
            <Check
              className={cn(
                isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5',
                isChecked ? 'opacity-100' : 'opacity-0'
              )}
            />
          </button>
        ) : (
          <>
            {!isCompact && isLiveCapture && (
              <div
                className="flex items-center gap-1 rounded-lg bg-emerald-500/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300 backdrop-blur-md border border-emerald-500/40 shadow-lg"
                title="Live Camera Capture"
              >
                <ShieldCheck className="h-3 w-3" />
                <span className="hidden xs:inline">Live</span>
              </div>
            )}

            {/* In Large Mode: Show format and dimension specs */}
            {isLarge && fileExt && (
              <div className="rounded-lg bg-black/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-md border border-white/15 shadow-lg">
                {fileExt}
              </div>
            )}

            {isLarge && width > 0 && height > 0 && (
              <div className="hidden sm:flex rounded-lg bg-black/70 px-2 py-0.5 text-[9px] font-medium text-white/80 backdrop-blur-md border border-white/15 shadow-lg">
                {width} × {height}
              </div>
            )}

            {/* Quick hover checkbox for desktop */}
            <button
              type="button"
              onPointerDown={stopPointerPropagation}
              onClick={(e) => {
                stopClickPropagation(e);
                if (onToggleSelect) onToggleSelect(item.id, e.shiftKey);
              }}
              className={cn(
                'rounded-lg hidden group-hover:flex items-center justify-center transition-all border border-white/40 bg-black/50 hover:bg-black/70 text-transparent hover:text-white/70 shadow-lg',
                isCompact ? 'h-5 w-5' : 'h-6 w-6'
              )}
              title="Select item"
              aria-label="Select item"
            >
              <Check className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      {/* Top Right: Pin Button & 3-Dot Context Menu */}
      <div className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 z-20 flex items-center gap-1 pointer-events-auto">
        {/* Pin Button */}
        <Button
          size="icon"
          variant="ghost"
          aria-label={item.isPinned ? 'Unpin item' : 'Pin item'}
          onPointerDown={stopPointerPropagation}
          onClick={(e) => {
            stopClickPropagation(e);
            onTogglePin(item.id);
          }}
          disabled={isCurrentlyPinning}
          className={cn(
            'rounded-full backdrop-blur-xl transition-all border shadow-lg',
            isCompact ? 'h-6 w-6' : 'h-7 w-7',
            item.isPinned
              ? 'bg-amber-500/35 text-amber-300 border-amber-400/50 opacity-100'
              : 'bg-black/60 text-white/80 border-white/20 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-black/80 hover:text-white'
          )}
        >
          {isCurrentlyPinning ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Pin className={cn('h-3 w-3', item.isPinned && 'fill-current text-amber-400')} />
          )}
        </Button>

        {/* 3-Dot Menu Button */}
        <div className="relative" ref={menuRef}>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Item actions"
            onPointerDown={stopPointerPropagation}
            onClick={(e) => {
              stopClickPropagation(e);
              setIsMenuOpen(!isMenuOpen);
            }}
            className={cn(
              'rounded-full backdrop-blur-xl transition-all border border-white/20 shadow-lg',
              isCompact ? 'h-6 w-6' : 'h-7 w-7',
              isMenuOpen
                ? 'bg-white/30 text-white opacity-100'
                : 'bg-black/60 text-white/80 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-black/80 hover:text-white'
            )}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>

          {/* Responsive Context Menu: Mobile Bottom Sheet + Desktop Dropdown */}
          <AnimatePresence>
            {isMenuOpen && (
              <>
                {/* Mobile Backdrop */}
                <motion.div
                  key="media-menu-mobile-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm sm:hidden"
                  onClick={(e) => {
                    stopClickPropagation(e);
                    setIsMenuOpen(false);
                  }}
                  onTouchStart={(e) => e.stopPropagation()}
                />

                {/* Mobile Bottom Action Sheet */}
                <motion.div
                  key="media-menu-mobile-sheet"
                  initial={{ y: '100%', opacity: 0.5 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: '100%', opacity: 0 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                  className="fixed inset-x-0 bottom-0 z-[101] max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-white/15 bg-[#0f0f13]/95 p-4 pb-8 shadow-2xl backdrop-blur-2xl text-white sm:hidden flex flex-col gap-1 pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  {/* Drag Handle Indicator */}
                  <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/25" />

                  {/* Header / Media summary */}
                  <div className="flex items-center gap-3 px-2 py-2 mb-1 border-b border-white/10">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/25">
                      {type === 'photo' ? (
                        <ImageIcon className="h-5 w-5" />
                      ) : (
                        <PlayCircle className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span
                        className="text-sm font-semibold truncate text-white"
                        title={item.title}
                      >
                        {item.title}
                      </span>
                      <span className="text-xs text-white/50 flex items-center gap-1.5 flex-wrap">
                        <span>{formatFileSize(sizeBytes)}</span>
                        {fileExt && (
                          <>
                            <span className="opacity-40">•</span>
                            <span className="uppercase">{fileExt}</span>
                          </>
                        )}
                        {createdDateStr && (
                          <>
                            <span className="opacity-40">•</span>
                            <span>{createdDateStr}</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Mobile Actions */}
                  <button
                    type="button"
                    onClick={(e) => {
                      stopClickPropagation(e);
                      setIsMenuOpen(false);
                      onPreview(item.id, item.title);
                    }}
                    className="w-full rounded-2xl px-4 py-3 text-left text-sm font-medium hover:bg-white/10 active:bg-white/15 flex items-center gap-3 transition-colors text-white"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/20">
                      <Eye className="h-4 w-4" />
                    </div>
                    <span>Preview</span>
                  </button>

                  {onOpenInspector && (
                    <button
                      type="button"
                      onClick={(e) => {
                        stopClickPropagation(e);
                        setIsMenuOpen(false);
                        onOpenInspector(item);
                      }}
                      className="w-full rounded-2xl px-4 py-3 text-left text-sm font-medium hover:bg-white/10 active:bg-white/15 flex items-center gap-3 transition-colors text-white"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/20">
                        <Info className="h-4 w-4" />
                      </div>
                      <span>View Details</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      stopClickPropagation(e);
                      setIsMenuOpen(false);
                      onMoveMenuToggle(item.id);
                    }}
                    className="w-full rounded-2xl px-4 py-3 text-left text-sm font-medium hover:bg-white/10 active:bg-white/15 flex items-center gap-3 transition-colors text-white"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/20">
                      <FolderInput className="h-4 w-4" />
                    </div>
                    <span>Move to Album...</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      stopClickPropagation(e);
                      setIsMenuOpen(false);
                      onDownload(item);
                    }}
                    className="w-full rounded-2xl px-4 py-3 text-left text-sm font-medium hover:bg-white/10 active:bg-white/15 flex items-center gap-3 transition-colors text-white"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                      <Download className="h-4 w-4" />
                    </div>
                    <span>Download</span>
                  </button>

                  <div className="my-1 border-t border-white/10" />

                  <button
                    type="button"
                    onClick={(e) => {
                      stopClickPropagation(e);
                      setIsMenuOpen(false);
                      onDelete(item.id, item.title);
                    }}
                    className="w-full rounded-2xl px-4 py-3 text-left text-sm font-medium text-red-400 hover:bg-red-500/20 active:bg-red-500/30 flex items-center gap-3 transition-colors"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-400 border border-red-500/20">
                      <Trash2 className="h-4 w-4" />
                    </div>
                    <span>Delete</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      stopClickPropagation(e);
                      setIsMenuOpen(false);
                    }}
                    className="mt-2 w-full rounded-2xl bg-white/10 py-3 text-center text-sm font-semibold text-white/80 hover:bg-white/15 active:scale-[0.98] transition-all"
                  >
                    Cancel
                  </button>
                </motion.div>

                {/* Desktop Dropdown Popover */}
                <motion.div
                  key="media-menu-desktop-dropdown"
                  initial={{ opacity: 0, scale: 0.9, y: 5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 5 }}
                  className="hidden sm:flex absolute right-0 top-full mt-1.5 w-48 rounded-2xl border border-white/15 bg-black/95 p-1.5 shadow-2xl backdrop-blur-2xl z-50 flex-col gap-0.5 text-white pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      stopClickPropagation(e);
                      setIsMenuOpen(false);
                      onPreview(item.id, item.title);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/10 flex items-center gap-2 transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5 text-blue-400" />
                    <span>Preview</span>
                  </button>

                  {onOpenInspector && (
                    <button
                      type="button"
                      onClick={(e) => {
                        stopClickPropagation(e);
                        setIsMenuOpen(false);
                        onOpenInspector(item);
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/10 flex items-center gap-2 transition-colors"
                    >
                      <Info className="h-3.5 w-3.5 text-blue-400" />
                      <span>View Details</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      stopClickPropagation(e);
                      setIsMenuOpen(false);
                      onMoveMenuToggle(item.id);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/10 flex items-center gap-2 transition-colors"
                  >
                    <FolderInput className="h-3.5 w-3.5 text-blue-400" />
                    <span>Move to Album...</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      stopClickPropagation(e);
                      setIsMenuOpen(false);
                      onDownload(item);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/10 flex items-center gap-2 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Download</span>
                  </button>

                  <div className="my-0.5 border-t border-white/10" />

                  <button
                    type="button"
                    onClick={(e) => {
                      stopClickPropagation(e);
                      setIsMenuOpen(false);
                      onDelete(item.id, item.title);
                    }}
                    className="w-full rounded-xl px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/20 flex items-center gap-2 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Move to Album Modal / Dropdown */}
      <AnimatePresence>
        {isMoveOpen && (
          <motion.div key="media-move-menu-overlay" className="contents">
            <motion.div
              key="media-move-menu-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
              onClick={(e) => {
                e.stopPropagation();
                onMoveMenuToggle(null);
              }}
              onTouchStart={(e) => e.stopPropagation()}
            />
            <motion.div
              key="media-move-menu-dropdown"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-x-4 bottom-6 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-auto sm:w-80 max-w-sm mx-auto flex-col rounded-3xl sm:rounded-2xl border border-white/15 bg-[#0f0f13]/95 p-3 sm:p-2 shadow-2xl backdrop-blur-2xl z-[101] flex text-white pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <FolderInput className="h-4 w-4 text-blue-400" />
                  <p className="text-xs font-bold text-white uppercase tracking-wider">
                    Move to Album
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    stopClickPropagation(e);
                    onMoveMenuToggle(null);
                  }}
                  className="rounded-full p-1 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-60 sm:max-h-48 overflow-y-auto custom-scrollbar p-1 flex flex-col gap-1">
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2.5 sm:py-2 text-left text-xs font-medium hover:bg-white/10 active:bg-white/15 flex items-center gap-2.5 transition-colors"
                  onClick={(e) => {
                    stopClickPropagation(e);
                    onMoveToFolder(item.id, null);
                    onMoveMenuToggle(null);
                  }}
                >
                  <ImageIcon className="h-4 w-4 text-blue-400 opacity-80 shrink-0" />
                  <span className="truncate">{type === 'photo' ? 'All Photos' : 'All Videos'}</span>
                </button>
                {folders.map((f) => (
                  <button
                    type="button"
                    key={f}
                    className="w-full rounded-xl px-3 py-2.5 sm:py-2 text-left text-xs font-medium hover:bg-white/10 active:bg-white/15 flex items-center gap-2.5 transition-colors"
                    onClick={(e) => {
                      stopClickPropagation(e);
                      onMoveToFolder(item.id, f);
                      onMoveMenuToggle(null);
                    }}
                  >
                    <Folder className="h-4 w-4 text-blue-400 opacity-80 shrink-0" />
                    <span className="truncate">{f}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact View Bottom Pill for Videos */}
      {isCompact && type === 'video' && (
        <div className="absolute bottom-1.5 right-1.5 z-20 pointer-events-none">
          <div className="flex items-center gap-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[9px] font-semibold text-white/95 border border-white/15 backdrop-blur-md shadow-md">
            {formattedDuration ? (
              <span>{formattedDuration}</span>
            ) : (
              <PlayCircle className="h-2.5 w-2.5" />
            )}
          </div>
        </div>
      )}

      {/* Standard & Large View Bottom Overlay: Title & Badges */}
      {!isCompact && (
        <div
          className={cn(
            'absolute bottom-0 inset-x-0 p-2 sm:p-2.5 md:p-3.5 flex flex-col justify-end gap-1 z-20 pointer-events-none',
            isLarge
              ? 'bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-8 sm:pt-12'
              : 'bg-gradient-to-t from-black/90 via-black/45 to-transparent pt-6 sm:pt-8'
          )}
        >
          <div className="flex items-end justify-between gap-1.5 sm:gap-2">
            {/* Title & Size */}
            <div className="min-w-0 flex flex-col">
              <span
                className={cn(
                  'font-bold text-white drop-shadow-md truncate',
                  isLarge ? 'text-sm sm:text-base' : 'text-[11px] sm:text-xs font-semibold'
                )}
                title={item.title}
              >
                {item.title}
              </span>
              <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] text-white/75 drop-shadow flex-wrap">
                <span>{formatFileSize(sizeBytes)}</span>
                {createdDateStr && (
                  <>
                    <span className="opacity-40">•</span>
                    <span>{createdDateStr}</span>
                  </>
                )}
                {isLarge && (
                  <>
                    <span className="opacity-40">•</span>
                    <span className="text-emerald-400 font-medium flex items-center gap-0.5">
                      <Lock className="h-2.5 w-2.5" /> AES-256
                    </span>
                  </>
                )}
                {item.metadata?.voiceClarityPreset && item.metadata.voiceClarityPreset !== 'off' && (
                  <>
                    <span className="opacity-40">•</span>
                    <span className="text-cyan-300 font-medium flex items-center gap-0.5">
                      <Sparkles className="h-2.5 w-2.5" /> DSP
                    </span>
                  </>
                )}
              </div>
              {item.metadata?.transcript && (
                <div className="mt-1 flex items-center gap-1 text-[9px] sm:text-[10px] text-cyan-300 italic bg-black/50 px-1.5 py-0.5 rounded-md border border-cyan-500/20 backdrop-blur-sm max-w-full">
                  <MessageSquareText className="h-2.5 w-2.5 shrink-0 text-cyan-400" />
                  <span className="truncate">"{item.metadata.transcript}"</span>
                </div>
              )}
            </div>

            {/* Video Duration Pill / Resolution Badge */}
            <div className="flex items-center gap-1 shrink-0">
              {resBadge && (
                <span className="rounded-md bg-black/75 px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[9px] font-bold text-blue-400 border border-blue-500/30 backdrop-blur-md shadow-md">
                  {resBadge}
                </span>
              )}
              {type === 'video' && formattedDuration && (
                <div className="flex items-center gap-1 rounded-md bg-black/80 px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold text-white/95 border border-white/15 backdrop-blur-md shadow-md">
                  <Clock className="h-2.5 w-2.5 opacity-70" />
                  <span>{formattedDuration}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export const MediaCard = React.memo(
  MediaCardComponent,
  (prev, next) =>
    prev.item === next.item &&
    prev.idx === next.idx &&
    prev.type === next.type &&
    prev.masterKey === next.masterKey &&
    prev.isSelected === next.isSelected &&
    prev.isChecked === next.isChecked &&
    prev.isSelectionMode === next.isSelectionMode &&
    prev.selectedIds === next.selectedIds &&
    prev.density === next.density &&
    prev.moveMenuOpenId === next.moveMenuOpenId &&
    prev.folders === next.folders &&
    prev.onPreview === next.onPreview &&
    prev.onToggleSelect === next.onToggleSelect &&
    prev.onMoveMenuToggle === next.onMoveMenuToggle &&
    prev.onMoveToFolder === next.onMoveToFolder &&
    prev.onDownload === next.onDownload &&
    prev.onDelete === next.onDelete &&
    prev.onTogglePin === next.onTogglePin &&
    prev.onOpenInspector === next.onOpenInspector &&
    prev.isPinning === next.isPinning &&
    prev.pinningItemIds === next.pinningItemIds
);
