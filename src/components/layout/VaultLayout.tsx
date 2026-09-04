import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Folder, Edit2, Trash2, Check, X, Search, Menu, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { cn } from '../../lib/utils';
import { VaultItem } from '../../lib/storage';
import {
  getDraggedVaultItems,
  clearDraggedVaultItem,
  useVaultDragState,
} from '../../lib/vaultDragDrop';
import { isSavedFolderName } from '../../lib/folderGuards';

interface VaultLayoutProps {
  title: string;
  description: string;
  itemTypeLabel: string;
  allItemLabel?: string;
  items?: VaultItem[];
  onUpload?: (targetFolder?: string | null) => void;
  onLiveRecord?: () => void;
  onFileDrop?: (files: File[], targetFolder?: string | null) => Promise<void> | void;
  isUploading?: boolean;
  uploadLabel?: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  folders: string[];
  currentFolder: string | null;
  onFolderSelect: (folder: string | null) => void;
  folderControls: {
    isAdding: boolean;
    setIsAdding: (val: boolean) => void;
    newName: string;
    setNewName: (val: string) => void;
    editing: string | null;
    setEditing: (val: string | null) => void;
    editingName: string;
    setEditingName: (val: string) => void;
    onCreate: () => void;
    onRename: (oldName: string) => void;
    onDelete: (name: string) => void;
  };
  onMoveItemToFolder?: (itemId: string | string[], folder: string | null) => Promise<void> | void;
  children: React.ReactNode;
  sidebarIcon?: React.ElementType;
}

export const VaultLayout: React.FC<VaultLayoutProps> = ({
  title,
  description,
  itemTypeLabel,
  allItemLabel,
  items = [],
  onUpload,
  onLiveRecord,
  onFileDrop,
  isUploading,
  uploadLabel,
  searchQuery,
  onSearchChange,
  folders,
  currentFolder,
  onFolderSelect,
  folderControls,
  onMoveItemToFolder,
  children,
  sidebarIcon: SidebarIcon = Folder,
}) => {
  const [isMobileFolderOpen, setIsMobileFolderOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined);
  const [isFileDropActive, setIsFileDropActive] = useState(false);
  const { isDragging, itemIds: draggedItemIds } = useVaultDragState();

  const draggedItems = React.useMemo(() => {
    if (draggedItemIds.length === 0) return [];
    return items.filter((item) => draggedItemIds.includes(item.id));
  }, [draggedItemIds, items]);

  const commonSourceFolder = React.useMemo(() => {
    if (draggedItems.length === 0) return undefined;
    const firstFolder = draggedItems[0].folder ?? null;
    const allSame = draggedItems.every((item) => (item.folder ?? null) === firstFolder);
    return allSame ? firstFolder : undefined;
  }, [draggedItems]);

  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (searchInput !== searchQuery) {
        onSearchChange(searchInput);
      }
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput, searchQuery, onSearchChange]);

  const folderCounts = React.useMemo(() => {
    const map: Partial<Record<string, number>> = {};
    for (const item of items) {
      const key = item.folder || '__all__';
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [items]);

  const getFolderCount = (folderName: string | null) => {
    if (folderName === null) return items.length;
    return folderCounts[folderName] || 0;
  };

  const handleCreateFolder = React.useCallback(() => {
    const name = folderControls.newName.trim();
    const normalized = name.toLowerCase();
    if (!name || folders.some((f) => f.toLowerCase() === normalized)) return;
    folderControls.onCreate();
  }, [folderControls, folders]);

  const handleRenameFolder = React.useCallback(
    (oldName: string) => {
      const name = folderControls.editingName.trim();
      const normalized = name.toLowerCase();
      if (!name || folders.some((f) => f !== oldName && f.toLowerCase() === normalized)) return;
      folderControls.onRename(oldName);
    },
    [folderControls, folders],
  );

  const isCreateInvalid =
    !folderControls.newName.trim() ||
    folders.some((f) => f.toLowerCase() === folderControls.newName.trim().toLowerCase());

  const isRenameInvalid = (oldName: string) => {
    const name = folderControls.editingName.trim();
    const normalized = name.toLowerCase();
    return !name || folders.some((f) => f !== oldName && f.toLowerCase() === normalized);
  };

  useEffect(() => {
    if (!isDragging) {
      setDropTarget(undefined);
    }
  }, [isDragging]);

  const handleFolderDragOver = (event: React.DragEvent<HTMLElement>, folder: string | null) => {
    if (!onMoveItemToFolder) return;
    const itemIds = getDraggedVaultItems(event);
    if (itemIds.length === 0) return;

    // Check if all dragged items are already in this folder
    const dragged = items.filter((item) => itemIds.includes(item.id));
    const isAllInFolder =
      dragged.length > 0 && dragged.every((item) => (item.folder ?? null) === folder);
    if (isAllInFolder) return;

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    setDropTarget(folder);
  };

  const handleFolderDrop = async (event: React.DragEvent<HTMLElement>, folder: string | null) => {
    if (!onMoveItemToFolder) return;
    event.preventDefault();
    const itemIds = getDraggedVaultItems(event);
    setDropTarget(undefined);
    clearDraggedVaultItem();
    if (itemIds.length === 0) return;

    const dragged = items.filter((item) => itemIds.includes(item.id));
    const isAllInFolder =
      dragged.length > 0 && dragged.every((item) => (item.folder ?? null) === folder);
    if (isAllInFolder) return;

    await onMoveItemToFolder(itemIds.length === 1 ? itemIds[0] : itemIds, folder);
  };

  const handleFolderDragLeave = (folder: string | null) => {
    if (dropTarget === folder) {
      setDropTarget(undefined);
    }
  };

  const hasDraggedFiles = (event: React.DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes('Files');

  const handleFileDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!onFileDrop || !hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsFileDropActive(true);
  };

  const handleFileDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (!onFileDrop) return;
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsFileDropActive(false);
    }
  };

  const handleFileDrop = async (event: React.DragEvent<HTMLElement>) => {
    if (!onFileDrop || !hasDraggedFiles(event)) return;
    event.preventDefault();
    setIsFileDropActive(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (!files.length) return;
    await onFileDrop(files, currentFolder);
  };

  return (
    <div
      className="flex flex-col lg:flex-row h-full gap-8 relative"
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={(event) => void handleFileDrop(event)}
    >
      {/* Sidebar for Desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col gap-4 sticky top-0 h-fit max-h-[calc(100vh-10rem)] overflow-y-auto pr-2 custom-scrollbar">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text/40">{`${itemTypeLabel} Categories`}</h2>
          <Button
            aria-label="Create folder"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => folderControls.setIsAdding(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className={cn('space-y-1 transition-all duration-300', isDragging && 'space-y-2')}>
          {(() => {
            const isAllItemsDropHover = dropTarget === null;
            const isAllItemsSource = isDragging && commonSourceFolder === null;
            const isAllItemsValidDropZone = isDragging && !isAllItemsSource;

            return (
              <motion.button
                layout
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                onClick={() => onFolderSelect(null)}
                onDragOver={(event) => handleFolderDragOver(event, null)}
                onDrop={(event) => void handleFolderDrop(event, null)}
                onDragLeave={() => handleFolderDragLeave(null)}
                role="tab"
                data-drop-target="true"
                aria-selected={currentFolder === null}
                aria-label={allItemLabel || `All ${itemTypeLabel}s`}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 text-sm transition-all duration-200 border relative overflow-hidden',
                  isDragging ? 'py-2.5 sm:py-3 scale-[1.02]' : 'py-2',
                  isAllItemsDropHover &&
                    'ring-2 ring-white border-white bg-white/20 text-white shadow-[0_0_25px_rgba(255,255,255,0.45),inset_0_0_12px_rgba(255,255,255,0.15)] scale-[1.05] z-10 font-bold',
                  isAllItemsValidDropZone &&
                    !isAllItemsDropHover &&
                    'border-white/30 bg-gradient-to-r from-white/10 via-white/5 to-transparent text-white shadow-[0_0_15px_rgba(255,255,255,0.12)] hover:border-white/60',
                  isAllItemsSource && 'border-dashed border-white/25 bg-white/5 text-white/40',
                  !isDragging &&
                    (currentFolder === null
                      ? 'bg-text/10 text-text border-transparent font-bold'
                      : 'text-text/60 hover:bg-text/5 border-transparent'),
                )}
              >
                {isAllItemsValidDropZone && !isAllItemsDropHover && (
                  <motion.div
                    animate={{ opacity: [0.2, 0.5, 0.2] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                    className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-white/5 via-white/10 to-white/5 pointer-events-none"
                  />
                )}
                <SidebarIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis font-bold">
                  {allItemLabel || `All ${itemTypeLabel}s`}
                </span>
                {isAllItemsDropHover ? (
                  <motion.span
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-md bg-white text-black shadow-lg flex items-center gap-1 shrink-0 animate-pulse"
                  >
                    Drop here
                  </motion.span>
                ) : isAllItemsSource ? (
                  <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/15 text-white/60 animate-pulse">
                    Source
                  </span>
                ) : isAllItemsValidDropZone ? (
                  <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-white/90 px-1.5 py-0.5 rounded bg-white/10 border border-white/20">
                    Drop Zone
                  </span>
                ) : (
                  <span className="ml-auto text-[10px] font-bold opacity-40">
                    {getFolderCount(null)}
                  </span>
                )}
              </motion.button>
            );
          })()}

          <div className="h-px bg-text/5 my-2 mx-2" />

          {folders.map((folder) => {
            const isSavedFolder = isSavedFolderName(folder);
            const isFolderDropHover = dropTarget === folder;
            const isFolderSource = isDragging && commonSourceFolder === folder;
            const isFolderValidDropZone = isDragging && !isFolderSource;

            return (
              <div key={folder} className="group relative">
                {folderControls.editing === folder ? (
                  <div className="flex items-center gap-1 p-1">
                    <Input
                      value={folderControls.editingName}
                      onChange={(e) => folderControls.setEditingName(e.target.value)}
                      className="h-8 text-xs"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameFolder(folder);
                        if (e.key === 'Escape') folderControls.setEditing(null);
                      }}
                    />
                    <Button
                      aria-label="Confirm rename"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-green-400"
                      onClick={() => handleRenameFolder(folder)}
                      disabled={isRenameInvalid(folder)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      aria-label="Cancel rename"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-400"
                      onClick={() => folderControls.setEditing(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <motion.button
                      layout
                      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                      onClick={() => onFolderSelect(folder)}
                      onDragOver={(event) => handleFolderDragOver(event, folder)}
                      onDrop={(event) => void handleFolderDrop(event, folder)}
                      onDragLeave={() => handleFolderDragLeave(folder)}
                      role="tab"
                      data-drop-target="true"
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 text-sm transition-all duration-200 border relative overflow-hidden',
                        isDragging ? 'py-2.5 sm:py-3 scale-[1.02]' : 'py-2',
                        isFolderDropHover &&
                          'ring-2 ring-white border-white bg-white/20 text-white shadow-[0_0_25px_rgba(255,255,255,0.45),inset_0_0_12px_rgba(255,255,255,0.15)] scale-[1.05] z-10 font-bold',
                        isFolderValidDropZone &&
                          !isFolderDropHover &&
                          'border-white/30 bg-gradient-to-r from-white/10 via-white/5 to-transparent text-white shadow-[0_0_15px_rgba(255,255,255,0.12)] hover:border-white/60',
                        isFolderSource && 'border-dashed border-white/25 bg-white/5 text-white/40',
                        !isDragging &&
                          (currentFolder === folder
                            ? 'bg-text/10 text-text border-transparent font-semibold'
                            : 'text-text/60 hover:bg-text/5 border-transparent'),
                      )}
                    >
                      {isFolderValidDropZone && !isFolderDropHover && (
                        <motion.div
                          animate={{ opacity: [0.2, 0.5, 0.2] }}
                          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                          className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-white/5 via-white/10 to-white/5 pointer-events-none"
                        />
                      )}
                      <Folder className="h-4 w-4 shrink-0" />
                      <span
                        className="flex-1 truncate text-left group-hover:pr-10 transition-all"
                        title={folder}
                      >
                        {folder}
                      </span>
                      {isFolderDropHover ? (
                        <motion.span
                          initial={{ scale: 0.8 }}
                          animate={{ scale: 1 }}
                          className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-md bg-white text-black shadow-lg flex items-center gap-1 shrink-0 animate-pulse"
                        >
                          Drop here
                        </motion.span>
                      ) : isFolderSource ? (
                        <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/15 text-white/60 animate-pulse">
                          Source
                        </span>
                      ) : isFolderValidDropZone ? (
                        <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-white/90 px-1.5 py-0.5 rounded bg-white/10 border border-white/20">
                          Drop Zone
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'ml-auto text-[10px] font-bold transition-opacity',
                            currentFolder === folder
                              ? 'opacity-40'
                              : 'opacity-40 group-hover:opacity-0',
                          )}
                        >
                          {getFolderCount(folder)}
                        </span>
                      )}
                    </motion.button>
                    {!isSavedFolder && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          aria-label="Edit folder"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            folderControls.setEditing(folder);
                            folderControls.setEditingName(folder);
                          }}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          aria-label="Delete folder"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:text-red-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            folderControls.onDelete(folder);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          <AnimatePresence>
            {folderControls.isAdding && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 space-y-2 overflow-hidden px-1"
              >
                <Input
                  placeholder="New name..."
                  value={folderControls.newName}
                  onChange={(e) => folderControls.setNewName(e.target.value)}
                  className="h-8 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder();
                    if (e.key === 'Escape') folderControls.setIsAdding(false);
                  }}
                />
                <div className="flex gap-1">
                  <Button
                    aria-label="Confirm create folder"
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    onClick={handleCreateFolder}
                    disabled={isCreateInvalid}
                  >
                    Create
                  </Button>
                  <Button
                    aria-label="Cancel create folder"
                    size="sm"
                    variant="ghost"
                    className="h-7 flex-1 text-xs"
                    onClick={() => folderControls.setIsAdding(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="min-w-0 flex-1 space-y-6">
        {/* Enhanced File Drop Overlay */}
        {isFileDropActive && onFileDrop ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-3xl border-2 border-dashed border-primary/60 bg-bg/80 backdrop-blur-md"
          >
            <div className="rounded-2xl border border-primary/30 bg-primary/10 px-8 py-6 text-center shadow-2xl ring-1 ring-primary/20">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                <Plus className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-semibold text-text">Drop files to upload</p>
              <p className="mt-1 text-xs text-text/60">
                {currentFolder
                  ? `Files will be added to "${currentFolder}".`
                  : 'Files will be added to the current vault.'}
              </p>
            </div>
          </motion.div>
        ) : null}

        {/* Header Section */}
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* Title Row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h1
                  className="text-xl sm:text-2xl lg:text-3xl font-bold text-text truncate capitalize leading-tight"
                  title={currentFolder || title}
                >
                  {currentFolder || title}
                </h1>
                <span className="inline-flex shrink-0 items-center px-2 py-0.5 rounded-full bg-text/5 border border-text/10 text-text/50 text-[11px] font-bold shadow-inner">
                  {getFolderCount(currentFolder)}
                  <span className="ml-1 opacity-70">items</span>
                </span>
              </div>
              <p className="mt-0.5 text-xs sm:text-sm text-text/40 truncate">{description}</p>
            </div>

            {/* Action Buttons */}
            <div className="flex shrink-0 items-center gap-2">
              {/* Desktop: Record + Upload with labels */}
              {onLiveRecord && (
                <Button
                  onClick={onLiveRecord}
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex items-center gap-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-all"
                  aria-label="Live record"
                >
                  <motion.div
                    animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                    className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                  />
                  Record
                </Button>
              )}
              {onUpload && (
                <Button
                  onClick={() => onUpload(currentFolder)}
                  disabled={isUploading}
                  size="sm"
                  className="hidden sm:flex items-center gap-1.5 transition-all shadow-sm"
                >
                  {isUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  {uploadLabel || `Upload ${itemTypeLabel}`}
                </Button>
              )}

              {/* Mobile: Icon-only buttons */}
              {onLiveRecord && (
                <Button
                  onClick={onLiveRecord}
                  variant="outline"
                  size="icon"
                  className="flex sm:hidden h-9 w-9 border-primary/20 hover:border-primary/40 hover:bg-primary/5"
                  aria-label="Live record"
                >
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                </Button>
              )}
              {onUpload && (
                <Button
                  onClick={() => onUpload(currentFolder)}
                  disabled={isUploading}
                  size="icon"
                  className="flex sm:hidden h-9 w-9 transition-all shadow-sm"
                  aria-label={uploadLabel || `Upload ${itemTypeLabel}`}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Search + Mobile Folder Toggle Row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/30 pointer-events-none" />
              <Input
                placeholder={`Search ${itemTypeLabel}s...`}
                className={cn(
                  'pl-9 h-9 sm:h-10 rounded-xl border-text/10 bg-text/[0.03] focus:bg-text/[0.06] transition-colors text-sm placeholder:text-text/30',
                  searchInput && 'pr-9',
                )}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-text/40 hover:text-text rounded-full hover:bg-text/10 transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {/* Mobile Folder Menu Trigger */}
            <Button
              aria-label="Toggle mobile folders menu"
              variant="outline"
              size="icon"
              data-drop-target="true"
              onDragOver={(event) => {
                event.preventDefault();
                setIsMobileFolderOpen(true);
              }}
              className="lg:hidden h-9 w-9 sm:h-10 sm:w-10 shrink-0 border-text/10 hover:bg-text/5 hover:border-text/20 transition-all"
              onClick={() => setIsMobileFolderOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {isMobileFolderOpen && (
            <motion.div key="mobile-folder-menu" className="fixed inset-0 z-50 lg:hidden">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setIsMobileFolderOpen(false)}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              />

              {/* Drawer Panel */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                className="absolute right-0 top-0 bottom-0 flex flex-col w-[min(18rem,90vw)] bg-sidebar-bg/95 backdrop-blur-xl border-l border-sidebar-border shadow-2xl overflow-hidden"
              >
                {/* Drawer Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-sidebar-border/60">
                  <div>
                    <h2 className="text-base font-bold capitalize tracking-tight">
                      {`${itemTypeLabel} Categories`}
                    </h2>
                    <p className="text-[11px] text-text/40 mt-0.5">{folders.length} categories</p>
                  </div>
                  <Button
                    aria-label="Close mobile folders menu"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setIsMobileFolderOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Scrollable List */}
                <div
                  className={cn(
                    'flex-1 overflow-y-auto p-4 space-y-1.5 transition-all duration-300',
                    isDragging && 'space-y-2.5',
                  )}
                >
                  {/* All Items button */}
                  {(() => {
                    const isAllItemsDropHover = dropTarget === null;
                    const isAllItemsSource = isDragging && commonSourceFolder === null;
                    const isAllItemsValidDropZone = isDragging && !isAllItemsSource;

                    return (
                      <button
                        onClick={() => {
                          onFolderSelect(null);
                          setIsMobileFolderOpen(false);
                        }}
                        onDragOver={(event) => handleFolderDragOver(event, null)}
                        onDrop={(event) => void handleFolderDrop(event, null)}
                        onDragLeave={() => handleFolderDragLeave(null)}
                        role="tab"
                        data-drop-target="true"
                        aria-selected={currentFolder === null}
                        aria-label={allItemLabel || `All ${itemTypeLabel}s`}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3.5 text-sm transition-all duration-200 border relative overflow-hidden',
                          isDragging ? 'py-3 scale-[1.02]' : 'py-2.5',
                          isAllItemsDropHover &&
                            'ring-2 ring-white border-white bg-white/20 text-white shadow-[0_0_25px_rgba(255,255,255,0.45),inset_0_0_12px_rgba(255,255,255,0.15)] scale-[1.04] z-10 font-bold',
                          isAllItemsValidDropZone &&
                            !isAllItemsDropHover &&
                            'border-white/30 bg-gradient-to-r from-white/10 via-white/5 to-transparent text-white shadow-[0_0_15px_rgba(255,255,255,0.12)] hover:border-white/60',
                          isAllItemsSource &&
                            'border-dashed border-white/25 bg-white/5 text-white/40',
                          !isDragging &&
                            (currentFolder === null
                              ? 'bg-primary/10 text-text font-bold border-primary/20'
                              : 'text-text/60 hover:bg-text/5 hover:text-text border-transparent'),
                        )}
                      >
                        {isAllItemsValidDropZone && !isAllItemsDropHover && (
                          <motion.div
                            animate={{ opacity: [0.2, 0.5, 0.2] }}
                            transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                            className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-white/5 via-white/10 to-white/5 pointer-events-none"
                          />
                        )}
                        <SidebarIcon className="h-4 w-4 shrink-0" />
                        <span
                          className="flex-1 text-left truncate"
                          title={allItemLabel || `All ${itemTypeLabel}s`}
                        >
                          {allItemLabel || `All ${itemTypeLabel}s`}
                        </span>
                        {isAllItemsDropHover ? (
                          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-md bg-white text-black shadow-lg flex items-center gap-1 shrink-0 animate-pulse">
                            Drop here
                          </span>
                        ) : isAllItemsSource ? (
                          <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/15 text-white/60 animate-pulse">
                            Source
                          </span>
                        ) : isAllItemsValidDropZone ? (
                          <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-white/90 px-1.5 py-0.5 rounded bg-white/10 border border-white/20">
                            Drop Zone
                          </span>
                        ) : (
                          <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-text/5 text-text/40">
                            {getFolderCount(null)}
                          </span>
                        )}
                      </button>
                    );
                  })()}

                  {/* Separator */}
                  {folders.length > 0 && <div className="h-px bg-text/5 mx-1 my-2" />}

                  {/* Folder list */}
                  {folders.map((folder) => {
                    const isEditing = folderControls.editing === folder;
                    const isSavedFolder = isSavedFolderName(folder);
                    const isFolderDropHover = dropTarget === folder;
                    const isFolderSource = isDragging && commonSourceFolder === folder;
                    const isFolderValidDropZone = isDragging && !isFolderSource;

                    return (
                      <div
                        key={folder}
                        onDragOver={(event) => handleFolderDragOver(event, folder)}
                        onDrop={(event) => void handleFolderDrop(event, folder)}
                        onDragLeave={() => handleFolderDragLeave(folder)}
                        role="tab"
                        data-drop-target="true"
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3.5 text-sm transition-all duration-200 border relative overflow-hidden',
                          isDragging ? 'py-3 scale-[1.02]' : 'py-2.5',
                          isFolderDropHover &&
                            'ring-2 ring-white border-white bg-white/20 text-white shadow-[0_0_25px_rgba(255,255,255,0.45),inset_0_0_12px_rgba(255,255,255,0.15)] scale-[1.04] z-10 font-bold',
                          isFolderValidDropZone &&
                            !isFolderDropHover &&
                            'border-white/30 bg-gradient-to-r from-white/10 via-white/5 to-transparent text-white shadow-[0_0_15px_rgba(255,255,255,0.12)] hover:border-white/60',
                          isFolderSource &&
                            'border-dashed border-white/25 bg-white/5 text-white/40',
                          !isDragging &&
                            (currentFolder === folder
                              ? 'bg-primary/10 text-text font-bold border-primary/20'
                              : 'text-text/60 hover:bg-text/5 hover:text-text border-transparent'),
                        )}
                      >
                        {isFolderValidDropZone && !isFolderDropHover && (
                          <motion.div
                            animate={{ opacity: [0.2, 0.5, 0.2] }}
                            transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                            className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-white/5 via-white/10 to-white/5 pointer-events-none"
                          />
                        )}
                        <Folder className="h-4 w-4 shrink-0" />
                        {isEditing ? (
                          <Input
                            value={folderControls.editingName}
                            onChange={(e) => folderControls.setEditingName(e.target.value)}
                            className="h-8 flex-1 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameFolder(folder);
                              if (e.key === 'Escape') folderControls.setEditing(null);
                            }}
                          />
                        ) : (
                          <button
                            className="flex-1 text-left truncate"
                            title={folder}
                            onClick={() => {
                              onFolderSelect(folder);
                              setIsMobileFolderOpen(false);
                            }}
                          >
                            {folder}
                          </button>
                        )}
                        {isFolderDropHover ? (
                          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-md bg-white text-black shadow-lg flex items-center gap-1 shrink-0 animate-pulse">
                            Drop here
                          </span>
                        ) : isFolderSource ? (
                          <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/15 text-white/60 animate-pulse">
                            Source
                          </span>
                        ) : isFolderValidDropZone ? (
                          <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-white/90 px-1.5 py-0.5 rounded bg-white/10 border border-white/20">
                            Drop Zone
                          </span>
                        ) : (
                          !isEditing && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-text/5 text-text/40">
                              {getFolderCount(folder)}
                            </span>
                          )
                        )}
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <Button
                              aria-label="Confirm rename"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-green-400 hover:text-green-300 hover:bg-green-400/10"
                              onClick={() => handleRenameFolder(folder)}
                              disabled={isRenameInvalid(folder)}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              aria-label="Cancel rename"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                              onClick={() => folderControls.setEditing(null)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : !isSavedFolder ? (
                          <div className="flex items-center gap-0.5">
                            <Button
                              aria-label="Edit folder"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 hover:bg-text/10"
                              onClick={() => {
                                folderControls.setEditing(folder);
                                folderControls.setEditingName(folder);
                              }}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              aria-label="Delete folder"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 hover:text-red-400 hover:bg-red-400/10"
                              onClick={() => folderControls.onDelete(folder)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {/* Drawer Footer: Add Category */}
                <div className="px-4 pb-5 pt-2 border-t border-sidebar-border/60">
                  <AnimatePresence mode="wait">
                    {folderControls.isAdding ? (
                      <motion.div
                        key="adding-folder"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="space-y-2 pt-3"
                      >
                        <Input
                          placeholder="Category name..."
                          value={folderControls.newName}
                          onChange={(e) => folderControls.setNewName(e.target.value)}
                          className="h-9 text-sm"
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                        />
                        <div className="flex gap-2">
                          <Button
                            aria-label="Confirm create folder"
                            size="sm"
                            className="h-9 flex-1 text-sm"
                            onClick={handleCreateFolder}
                            disabled={isCreateInvalid}
                          >
                            Create
                          </Button>
                          <Button
                            aria-label="Cancel create folder"
                            size="sm"
                            variant="ghost"
                            className="h-9 flex-1 text-sm"
                            onClick={() => folderControls.setIsAdding(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="add-folder-button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <Button
                          variant="ghost"
                          className="w-full justify-start gap-2.5 mt-2 text-text/40 hover:text-text hover:bg-text/5 h-9 text-sm"
                          onClick={() => folderControls.setIsAdding(true)}
                        >
                          <Plus className="h-4 w-4" />
                          New Category
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile & Tablet Floating Quick-Drop Bar (Active during Drag on small screens) */}
        <AnimatePresence>
          {isDragging && onMoveItemToFolder && !isMobileFolderOpen && (
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="lg:hidden fixed bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)+0.75rem))] inset-x-3 sm:inset-x-6 z-[9999] pointer-events-auto"
            >
              <div className="rounded-2xl border-2 border-white/30 bg-black/90 backdrop-blur-2xl p-3 shadow-[0_25px_60px_rgba(0,0,0,0.85),0_0_30px_rgba(255,255,255,0.15)] flex flex-col gap-2">
                <div className="flex items-center justify-between px-1 text-white">
                  <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4 text-white" />
                    <span className="text-xs font-bold tracking-wide">Drop into category</span>
                  </div>
                  {draggedItemIds.length > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-black">
                      {draggedItemIds.length} {draggedItemIds.length === 1 ? 'item' : 'items'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  {/* All Items Pill */}
                  {(() => {
                    const isAllHover = dropTarget === null;
                    const isAllSource = commonSourceFolder === null;
                    return (
                      <div
                        data-drop-target="true"
                        onDragOver={(e) => handleFolderDragOver(e, null)}
                        onDrop={(e) => void handleFolderDrop(e, null)}
                        onDragLeave={() => handleFolderDragLeave(null)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all border select-none',
                          isAllHover
                            ? 'ring-2 ring-white border-white bg-white/30 text-white shadow-[0_0_20px_rgba(255,255,255,0.6)] scale-105'
                            : isAllSource
                              ? 'border-dashed border-white/25 bg-white/5 text-white/40'
                              : 'border-white/30 bg-white/10 text-white hover:border-white/60 shadow-sm',
                        )}
                      >
                        <SidebarIcon className="h-3.5 w-3.5 shrink-0" />
                        <span>{allItemLabel || 'All'}</span>
                        {isAllHover ? (
                          <span className="text-[9px] font-bold bg-white text-black px-1.5 py-0.5 rounded ml-1 animate-pulse">
                            Drop
                          </span>
                        ) : isAllSource ? (
                          <span className="text-[9px] bg-white/15 text-white/60 px-1 py-0.5 rounded ml-1">
                            Src
                          </span>
                        ) : null}
                      </div>
                    );
                  })()}

                  {/* Folder Pills */}
                  {folders.map((folder) => {
                    const isHover = dropTarget === folder;
                    const isSource = commonSourceFolder === folder;
                    return (
                      <div
                        key={folder}
                        data-drop-target="true"
                        onDragOver={(e) => handleFolderDragOver(e, folder)}
                        onDrop={(e) => void handleFolderDrop(e, folder)}
                        onDragLeave={() => handleFolderDragLeave(folder)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all border select-none',
                          isHover
                            ? 'ring-2 ring-white border-white bg-white/30 text-white shadow-[0_0_20px_rgba(255,255,255,0.6)] scale-105'
                            : isSource
                              ? 'border-dashed border-white/25 bg-white/5 text-white/40'
                              : 'border-white/30 bg-white/10 text-white hover:border-white/60 shadow-sm',
                        )}
                      >
                        <Folder className="h-3.5 w-3.5 shrink-0" />
                        <span className="max-w-[120px] truncate">{folder}</span>
                        {isHover ? (
                          <span className="text-[9px] font-bold bg-white text-black px-1.5 py-0.5 rounded ml-1 animate-pulse">
                            Drop
                          </span>
                        ) : isSource ? (
                          <span className="text-[9px] bg-white/15 text-white/60 px-1 py-0.5 rounded ml-1">
                            Src
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {children}
      </div>
    </div>
  );
};
