import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Loader2,
  Lock,
  Eye,
  Download,
  Trash2,
  Pin,
  ShieldCheck,
  Check,
  PlayCircle,
  CheckSquare,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { VaultItem } from '../../../../lib/storage';
import { MediaCard } from './MediaCard';
import { SafeMedia } from './SafeMedia';
import {
  setDraggedVaultItems,
  createMultiItemDragImage,
  clearDraggedVaultItem,
} from '../../../../lib/vaultDragDrop';
import {
  GridDensity,
  groupMediaByTimeline,
  formatFileSize,
  getResolutionBadge,
} from './mediaUtils';
import { cn } from '../../../../lib/utils';
import { useVaultStore } from '../../../../store/vaultStore';

interface MediaTimelineViewProps {
  items: VaultItem[];
  type: 'photo' | 'video';
  masterKey: string | CryptoKey | null;
  density: GridDensity;
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  previewItem: string | null;
  moveMenuOpenId: string | null;
  folders: string[];
  onPreview: (id: string, title: string) => void;
  onMoveMenuToggle: (id: string | null) => void;
  onMoveToFolder: (itemId: string, folder: string | null) => void;
  onDownload: (item: VaultItem) => void;
  onDelete: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onOpenInspector?: (item: VaultItem) => void;
  pinningItemIds: string[];
  lightweightPreviewMode: boolean;
}

const ITEMS_PER_CHUNK = 32;

export const MediaTimelineView: React.FC<MediaTimelineViewProps> = ({
  items,
  type,
  masterKey,
  density,
  selectedIds,
  isSelectionMode,
  onToggleSelect,
  previewItem,
  moveMenuOpenId,
  folders,
  onPreview,
  onMoveMenuToggle,
  onMoveToFolder,
  onDownload,
  onDelete,
  onTogglePin,
  onOpenInspector,
  pinningItemIds,
  lightweightPreviewMode,
}) => {
  const isDecoyMode = useVaultStore((state) => state.isDecoyMode);
  const [renderedCount, setRenderedCount] = useState(ITEMS_PER_CHUNK);
  const [activeDateBubble, setActiveDateBubble] = useState<string | null>(null);
  const [isScrubberVisible, setIsScrubberVisible] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const groupHeadersRef = useRef<{ id: string; label: string; element: HTMLElement | null }[]>([]);

  // Reset rendered chunk count if items filter/sort changes
  useEffect(() => {
    setRenderedCount(ITEMS_PER_CHUNK);
  }, [items]);

  // Sliced items for adaptive infinite scrolling
  const visibleItems = useMemo(() => items.slice(0, renderedCount), [items, renderedCount]);
  const hasMore = renderedCount < items.length;

  // Group visible items by timeline
  const timelineGroups = useMemo(() => groupMediaByTimeline(visibleItems), [visibleItems]);

  // IntersectionObserver for Infinite Scroll Sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setRenderedCount((prev) => Math.min(prev + ITEMS_PER_CHUNK, items.length));
        }
      },
      { rootMargin: '400px 0px', threshold: 0.01 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, items.length]);

  // Fast-scroll detection & Sticky Date Bubble
  useEffect(() => {
    const handleScroll = () => {
      setIsScrubberVisible(true);

      // Find which timeline group is currently nearest to the top
      let currentLabel = timelineGroups[0]?.label || null;
      for (const header of groupHeadersRef.current) {
        if (header.element) {
          const rect = header.element.getBoundingClientRect();
          if (rect.top <= 200) {
            currentLabel = header.label;
          }
        }
      }
      if (currentLabel) {
        setActiveDateBubble(currentLabel);
      }

      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = window.setTimeout(() => {
        setIsScrubberVisible(false);
      }, 1200);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) window.clearTimeout(scrollTimeoutRef.current);
    };
  }, [timelineGroups]);

  // Grid columns class based on chosen density across all devices
  const getGridColsClass = () => {
    switch (density) {
      case 'compact':
        return 'grid-cols-3 xs:grid-cols-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-1.5 sm:gap-2 md:gap-3';
      case 'large':
        return 'grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-4 sm:gap-6 md:gap-8';
      case 'standard':
      default:
        return 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3.5 md:gap-4 lg:gap-5';
    }
  };

  // Render List / Details View (Grouped by Category / Timeline)
  if (density === 'list') {
    return (
      <div className="relative w-full pb-36 sm:pb-44 px-1 md:px-4">
        {/* Sticky Date Bubble */}
        <AnimatePresence>
          {isScrubberVisible && activeDateBubble && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              className="fixed top-20 right-6 z-40 rounded-full border border-white/20 bg-black/85 px-4 py-1.5 text-xs font-bold text-white shadow-2xl backdrop-blur-2xl flex items-center gap-2 pointer-events-none"
            >
              <Calendar className="h-3.5 w-3.5 text-blue-400" />
              <span>{activeDateBubble}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col gap-8">
          {timelineGroups.map((group, groupIdx) => (
            <div key={group.id} className="flex flex-col gap-3">
              {/* Group Header */}
              <div
                ref={(el) => {
                  groupHeadersRef.current[groupIdx] = {
                    id: group.id,
                    label: group.label,
                    element: el,
                  };
                }}
                className="sticky top-0 z-20 flex items-center justify-between py-2.5 px-2 md:px-4 bg-bg/90 backdrop-blur-xl border-b border-white/5"
              >
                <div className="flex items-baseline gap-2.5">
                  <h3 className="text-lg md:text-xl font-bold text-text tracking-tight">
                    {group.label}
                  </h3>
                  {group.subLabel && (
                    <span className="text-xs text-text/40 font-medium hidden sm:inline">
                      {group.subLabel}
                    </span>
                  )}
                </div>
                <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-bold text-text/50 border border-white/5">
                  {group.items.length} {group.items.length === 1 ? type : `${type}s`}
                </span>
              </div>

              {/* Mobile-optimized List Cards (sm:hidden) */}
              <div className="flex sm:hidden flex-col gap-2">
                {group.items.map((item) => {
                  const isChecked = selectedIds.has(item.id);
                  const width = Number(item.metadata?.width || 0);
                  const height = Number(item.metadata?.height || 0);
                  const resBadge = getResolutionBadge(width, height);
                  const sizeBytes = Number(
                    item.metadata?.size ||
                      (typeof item.content === 'string'
                        ? item.content.length
                        : item.content?.byteLength || 0),
                  );
                  const isLive =
                    item.metadata?.isLiveCapture === true ||
                    item.metadata?.isLiveCapture === 'true' ||
                    item.metadata?.isLiveCapture === 1;

                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStartCapture={(event) => {
                        const isItemPartOfSelection = isChecked || selectedIds.has(item.id);
                        const targetIds =
                          isItemPartOfSelection && selectedIds.size > 1
                            ? Array.from(selectedIds)
                            : [item.id];
                        setDraggedVaultItems(event, targetIds);
                        if (targetIds.length > 1 && event.dataTransfer?.setDragImage) {
                          const dragLabel = type === 'photo' ? 'Photos' : 'Videos';
                          const previewElement = createMultiItemDragImage(
                            targetIds.length,
                            dragLabel,
                          );
                          event.dataTransfer.setDragImage(
                            previewElement.firstElementChild as Element,
                            70,
                            45,
                          );
                          setTimeout(() => previewElement.remove(), 0);
                        }
                      }}
                      onDragEnd={clearDraggedVaultItem}
                      onClick={() => {
                        if (isSelectionMode) {
                          onToggleSelect(item.id, false);
                        } else {
                          onPreview(item.id, item.title);
                        }
                      }}
                      className={cn(
                        'flex items-center gap-3 p-2 rounded-2xl border bg-black/20 backdrop-blur-md transition-all cursor-pointer select-none',
                        isChecked
                          ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/50'
                          : 'border-white/10 hover:border-white/20',
                      )}
                    >
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSelect(item.id, false);
                        }}
                        className={cn(
                          'h-6 w-6 rounded-lg flex items-center justify-center border transition-all shrink-0',
                          isChecked
                            ? 'bg-blue-600 text-white border-blue-400'
                            : 'bg-black/40 text-transparent border-white/20',
                        )}
                        aria-label={`Select ${item.title}`}
                      >
                        <Check
                          className={cn('h-3.5 w-3.5', isChecked ? 'opacity-100' : 'opacity-0')}
                        />
                      </button>

                      {/* Thumbnail */}
                      <div className="h-12 w-12 rounded-xl overflow-hidden border border-white/10 bg-black/40 relative shrink-0">
                        {(masterKey || isDecoyMode) && (
                          <SafeMedia
                            item={item}
                            masterKey={masterKey}
                            type={type}
                            isThumbnail={true}
                            autoPlayVideo={false}
                            className="h-full w-full object-cover"
                          />
                        )}
                        {type === 'video' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                            <PlayCircle className="h-4 w-4 text-white/90" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1 flex flex-col">
                        <span
                          className="text-xs font-semibold text-white truncate"
                          title={item.title}
                        >
                          {item.title}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] text-white/60">
                          <span>{formatFileSize(sizeBytes)}</span>
                          {resBadge && (
                            <>
                              <span className="opacity-40">•</span>
                              <span className="text-blue-400 font-bold">{resBadge}</span>
                            </>
                          )}
                          {isLive && (
                            <>
                              <span className="opacity-40">•</span>
                              <span className="text-emerald-400 font-bold">Live</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Quick Action Buttons */}
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onTogglePin(item.id)}
                          disabled={pinningItemIds.includes(item.id)}
                          className={cn(
                            'h-7 w-7 rounded-full transition-colors',
                            item.isPinned
                              ? 'text-amber-400 bg-amber-500/20'
                              : 'text-white/60 hover:text-white hover:bg-white/10',
                          )}
                          title={item.isPinned ? 'Unpin' : 'Pin'}
                        >
                          <Pin className={cn('h-3.5 w-3.5', item.isPinned && 'fill-current')} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onDownload(item)}
                          className="h-7 w-7 rounded-full text-white/60 hover:text-emerald-400 hover:bg-emerald-500/10"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop / Tablet Table View (hidden sm:block) */}
              <div className="hidden sm:block rounded-2xl border border-white/10 bg-black/20 backdrop-blur-md overflow-hidden shadow-xl">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left text-xs text-white">
                    <thead className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-wider text-white/50">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <CheckSquare className="h-3.5 w-3.5 opacity-60 inline-block" />
                        </th>
                        <th className="p-3 w-16">Preview</th>
                        <th className="p-3">File Name</th>
                        <th className="p-3 hidden md:table-cell">Resolution</th>
                        <th className="p-3 hidden sm:table-cell">Size</th>
                        <th className="p-3 hidden lg:table-cell">Date Added</th>
                        <th className="p-3 hidden sm:table-cell">Security</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {group.items.map((item) => {
                        const isChecked = selectedIds.has(item.id);
                        const width = Number(item.metadata?.width || 0);
                        const height = Number(item.metadata?.height || 0);
                        const resBadge = getResolutionBadge(width, height);
                        const sizeBytes = Number(
                          item.metadata?.size ||
                            (typeof item.content === 'string'
                              ? item.content.length
                              : item.content?.byteLength || 0),
                        );
                        const isLive =
                          item.metadata?.isLiveCapture === true ||
                          item.metadata?.isLiveCapture === 'true' ||
                          item.metadata?.isLiveCapture === 1;

                        return (
                          <tr
                            key={item.id}
                            draggable
                            onDragStartCapture={(event) => {
                              const isItemPartOfSelection = isChecked || selectedIds.has(item.id);
                              const targetIds =
                                isItemPartOfSelection && selectedIds.size > 1
                                  ? Array.from(selectedIds)
                                  : [item.id];
                              setDraggedVaultItems(event, targetIds);
                              if (targetIds.length > 1 && event.dataTransfer?.setDragImage) {
                                const dragLabel = type === 'photo' ? 'Photos' : 'Videos';
                                const previewElement = createMultiItemDragImage(
                                  targetIds.length,
                                  dragLabel,
                                );
                                event.dataTransfer.setDragImage(
                                  previewElement.firstElementChild as Element,
                                  70,
                                  45,
                                );
                                setTimeout(() => previewElement.remove(), 0);
                              }
                            }}
                            onDragEnd={clearDraggedVaultItem}
                            onClick={(e) => {
                              if (isSelectionMode) {
                                onToggleSelect(item.id, e.shiftKey);
                              } else {
                                onPreview(item.id, item.title);
                              }
                            }}
                            className={cn(
                              'transition-colors cursor-pointer hover:bg-white/[0.04]',
                              isChecked && 'bg-blue-500/10',
                            )}
                          >
                            <td
                              className="p-3 text-center"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleSelect(item.id, e.shiftKey);
                              }}
                            >
                              <div
                                className={cn(
                                  'h-5 w-5 rounded-md mx-auto flex items-center justify-center border transition-all',
                                  isChecked
                                    ? 'bg-blue-600 text-white border-blue-400'
                                    : 'bg-black/40 text-transparent border-white/20 hover:border-white',
                                )}
                              >
                                <Check
                                  className={cn('h-3 w-3', isChecked ? 'opacity-100' : 'opacity-0')}
                                />
                              </div>
                            </td>

                            <td className="p-3">
                              <div className="h-10 w-10 rounded-lg overflow-hidden border border-white/10 bg-black/40 relative shrink-0">
                                {(masterKey || isDecoyMode) && (
                                  <SafeMedia
                                    item={item}
                                    masterKey={masterKey}
                                    type={type}
                                    isThumbnail={true}
                                    autoPlayVideo={false}
                                    className="h-full w-full object-cover"
                                  />
                                )}
                                {type === 'video' && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <PlayCircle className="h-4 w-4 text-white/80" />
                                  </div>
                                )}
                              </div>
                            </td>

                            <td className="p-3 font-medium text-white/90 truncate max-w-[180px] sm:max-w-[260px]">
                              <div className="flex flex-col">
                                <span className="truncate">{item.title}</span>
                                {isLive && (
                                  <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                                    <ShieldCheck className="h-2.5 w-2.5" /> Live Capture
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="p-3 hidden md:table-cell text-white/70">
                              {width > 0 && height > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <span>
                                    {width} × {height}
                                  </span>
                                  {resBadge && (
                                    <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-bold text-blue-400 border border-blue-500/30">
                                      {resBadge}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>

                            <td className="p-3 hidden sm:table-cell text-white/70">
                              {formatFileSize(sizeBytes)}
                            </td>

                            <td className="p-3 hidden lg:table-cell text-white/60">
                              {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
                            </td>

                            <td className="p-3 hidden sm:table-cell">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 border border-emerald-500/20">
                                <Lock className="h-2.5 w-2.5" /> AES-256-GCM
                              </span>
                            </td>

                            <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onPreview(item.id, item.title)}
                                  className="h-7 w-7 rounded-full text-white/60 hover:text-white hover:bg-white/10"
                                  title="Preview"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onTogglePin(item.id)}
                                  disabled={pinningItemIds.includes(item.id)}
                                  className={cn(
                                    'h-7 w-7 rounded-full transition-colors',
                                    item.isPinned
                                      ? 'text-amber-400 bg-amber-500/20 hover:bg-amber-500/30'
                                      : 'text-white/60 hover:text-white hover:bg-white/10',
                                  )}
                                  title={item.isPinned ? 'Unpin' : 'Pin'}
                                >
                                  <Pin
                                    className={cn('h-3.5 w-3.5', item.isPinned && 'fill-current')}
                                  />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onDownload(item)}
                                  className="h-7 w-7 rounded-full text-white/60 hover:text-emerald-400 hover:bg-emerald-500/10"
                                  title="Download"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onDelete(item.id, item.title)}
                                  className="h-7 w-7 rounded-full text-white/60 hover:text-red-400 hover:bg-red-500/10"
                                  title="Delete"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Sentinel for infinite scroll */}
        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          </div>
        )}
      </div>
    );
  }

  // Render Timeline Grid Sections (for compact, standard, and large)
  return (
    <div className="relative w-full pb-36 sm:pb-44">
      {/* Sticky Date Bubble Scrubber */}
      <AnimatePresence>
        {isScrubberVisible && activeDateBubble && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-20 right-6 z-40 rounded-full border border-white/20 bg-black/85 px-4 py-1.5 text-xs font-bold text-white shadow-2xl backdrop-blur-2xl flex items-center gap-2 pointer-events-none"
          >
            <Calendar className="h-3.5 w-3.5 text-blue-400" />
            <span>{activeDateBubble}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline Groups */}
      <div className="flex flex-col gap-8">
        {timelineGroups.map((group, groupIdx) => (
          <div key={group.id} className="flex flex-col gap-3">
            {/* Group Header */}
            <div
              ref={(el) => {
                groupHeadersRef.current[groupIdx] = {
                  id: group.id,
                  label: group.label,
                  element: el,
                };
              }}
              className="sticky top-0 z-20 flex items-center justify-between py-2.5 px-2 md:px-4 bg-bg/90 backdrop-blur-xl border-b border-white/5"
            >
              <div className="flex items-baseline gap-2.5">
                <h3 className="text-lg md:text-xl font-bold text-text tracking-tight">
                  {group.label}
                </h3>
                {group.subLabel && (
                  <span className="text-xs text-text/40 font-medium hidden sm:inline">
                    {group.subLabel}
                  </span>
                )}
              </div>
              <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-bold text-text/50 border border-white/5">
                {group.items.length} {group.items.length === 1 ? type : `${type}s`}
              </span>
            </div>

            {/* Grid for this timeline group */}
            <div
              role="grid"
              aria-label={`${group.label} ${type} grid`}
              className={cn('grid pt-2 px-1 md:px-4 touch-pan-y w-full', getGridColsClass())}
            >
              {group.items.map((item, idx) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  idx={idx}
                  type={type}
                  masterKey={masterKey}
                  isSelected={previewItem === item.id}
                  isChecked={selectedIds.has(item.id)}
                  isSelectionMode={isSelectionMode}
                  selectedIds={selectedIds}
                  onToggleSelect={onToggleSelect}
                  density={density}
                  moveMenuOpenId={moveMenuOpenId}
                  folders={folders}
                  onPreview={onPreview}
                  onMoveMenuToggle={onMoveMenuToggle}
                  onMoveToFolder={onMoveToFolder}
                  onDownload={onDownload}
                  onDelete={onDelete}
                  onTogglePin={onTogglePin}
                  onOpenInspector={onOpenInspector}
                  pinningItemIds={pinningItemIds}
                  lightweightPreviewMode={lightweightPreviewMode}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Infinite Scrolling Sentinel */}
      {hasMore ? (
        <div ref={sentinelRef} className="flex flex-col items-center justify-center py-12 gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          <span className="text-[10px] uppercase tracking-wider text-text/40 font-bold">
            Loading more {type}s...
          </span>
        </div>
      ) : (
        <div className="flex justify-center py-12">
          <div className="rounded-full bg-white/5 px-4 py-1 text-xs text-text/30 border border-white/5 font-medium">
            All {items.length} {items.length === 1 ? type : `${type}s`} loaded
          </div>
        </div>
      )}
    </div>
  );
};
