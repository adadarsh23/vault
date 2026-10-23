import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
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

export interface FolderControls {
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
}

export interface VaultLayoutProps {
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
  folderControls: FolderControls;
  onMoveItemToFolder?: (itemId: string | string[], folder: string | null) => Promise<void> | void;
  children: React.ReactNode;
  sidebarIcon?: React.ElementType;
}

const MAX_FOLDER_NAME_LENGTH = 60;

export const VaultLayout: React.FC<VaultLayoutProps> = React.memo(
  ({
    title,
    description,
    itemTypeLabel,
    allItemLabel,
    items = [],
    onUpload,
    onLiveRecord,
    onFileDrop,
    isUploading = false,
    uploadLabel,
    searchQuery = '',
    onSearchChange,
    folders = [],
    currentFolder,
    onFolderSelect,
    folderControls,
    onMoveItemToFolder,
    children,
    sidebarIcon: SidebarIcon = Folder,
  }) => {
    const [isMobileFolderOpen, setIsMobileFolderOpen] = useState(false);
    const [searchInput, setSearchInput] = useState(searchQuery || '');
    const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined);
    const [isFileDropActive, setIsFileDropActive] = useState(false);
    const { isDragging, itemIds: draggedItemIds } = useVaultDragState();

    // Stable reference for search callback to prevent debounce stutter
    const onSearchChangeRef = useRef(onSearchChange);
    useEffect(() => {
      onSearchChangeRef.current = onSearchChange;
    }, [onSearchChange]);

    // Defensive sanitization of folder list
    const safeFolders = useMemo(() => {
      if (!Array.isArray(folders)) return [];
      const set = new Set<string>();
      const list: string[] = [];
      for (let i = 0; i < folders.length; i++) {
        const f = folders[i];
        if (typeof f === 'string') {
          const trimmed = f.trim();
          if (trimmed && !set.has(trimmed.toLowerCase())) {
            set.add(trimmed.toLowerCase());
            list.push(trimmed);
          }
        }
      }
      return list;
    }, [folders]);

    // Defensive fallback for folderControls
    const safeFolderControls: FolderControls = useMemo(() => {
      return (
        folderControls || {
          isAdding: false,
          setIsAdding: () => {},
          newName: '',
          setNewName: () => {},
          editing: null,
          setEditing: () => {},
          editingName: '',
          setEditingName: () => {},
          onCreate: () => {},
          onRename: () => {},
          onDelete: () => {},
        }
      );
    }, [folderControls]);

    const draggedItems = useMemo(() => {
      if (!draggedItemIds || draggedItemIds.length === 0) return [];
      const idSet = new Set(draggedItemIds);
      return (items || []).filter((item) => item && idSet.has(item.id));
    }, [draggedItemIds, items]);

    const commonSourceFolder = useMemo(() => {
      if (draggedItems.length === 0) return undefined;
      const firstFolder = draggedItems[0]?.folder ?? null;
      const allSame = draggedItems.every((item) => (item?.folder ?? null) === firstFolder);
      return allSame ? firstFolder : undefined;
    }, [draggedItems]);

    useEffect(() => {
      setSearchInput(searchQuery || '');
    }, [searchQuery]);

    useEffect(() => {
      const timeoutId = window.setTimeout(() => {
        if (searchInput !== (searchQuery || '')) {
          onSearchChangeRef.current?.(searchInput);
        }
      }, 120);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }, [searchInput, searchQuery]);

    // Lock body scroll & handle Escape when mobile folder drawer is open
    useEffect(() => {
      if (!isMobileFolderOpen || typeof document === 'undefined') return;

      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsMobileFolderOpen(false);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = previousOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [isMobileFolderOpen]);

    const folderCounts = useMemo(() => {
      const map: Partial<Record<string, number>> = {};
      const safeItems = items || [];
      for (let i = 0; i < safeItems.length; i++) {
        const item = safeItems[i];
        const key = item?.folder || '__all__';
        map[key] = (map[key] || 0) + 1;
      }
      return map;
    }, [items]);

    const getFolderCount = useCallback(
      (folderName: string | null) => {
        if (folderName === null) return (items || []).length;
        return folderCounts[folderName] || 0;
      },
      [folderCounts, items],
    );

    const cleanFolderName = (raw: string) => raw.trim().slice(0, MAX_FOLDER_NAME_LENGTH);

    const handleCreateFolder = useCallback(() => {
      const name = cleanFolderName(safeFolderControls.newName || '');
      const normalized = name.toLowerCase();
      if (!name || safeFolders.some((f) => f.toLowerCase() === normalized)) return;
      try {
        safeFolderControls.onCreate();
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('Failed to create folder:', err);
        }
      }
    }, [safeFolderControls, safeFolders]);

    const handleRenameFolder = useCallback(
      (oldName: string) => {
        const name = cleanFolderName(safeFolderControls.editingName || '');
        const normalized = name.toLowerCase();
        if (!name || safeFolders.some((f) => f !== oldName && f.toLowerCase() === normalized))
          return;
        try {
          safeFolderControls.onRename(oldName);
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('Failed to rename folder:', err);
          }
        }
      },
      [safeFolderControls, safeFolders],
    );

    const isCreateInvalid = useMemo(() => {
      const raw = safeFolderControls.newName?.trim() || '';
      if (!raw) return true;
      const normalized = raw.toLowerCase();
      return safeFolders.some((f) => f.toLowerCase() === normalized);
    }, [safeFolderControls.newName, safeFolders]);

    const isRenameInvalid = useCallback(
      (oldName: string) => {
        const raw = safeFolderControls.editingName?.trim() || '';
        if (!raw) return true;
        const normalized = raw.toLowerCase();
        return safeFolders.some((f) => f !== oldName && f.toLowerCase() === normalized);
      },
      [safeFolderControls.editingName, safeFolders],
    );

    useEffect(() => {
      if (!isDragging) {
        setDropTarget(undefined);
      }
    }, [isDragging]);

    const handleFolderDragOver = useCallback(
      (event: React.DragEvent<HTMLElement>, folder: string | null) => {
        if (!onMoveItemToFolder) return;
        const itemIds = getDraggedVaultItems(event);
        if (itemIds.length === 0) return;

        const safeItems = items || [];
        const dragged = safeItems.filter((item) => itemIds.includes(item.id));
        const isAllInFolder =
          dragged.length > 0 && dragged.every((item) => (item.folder ?? null) === folder);
        if (isAllInFolder) return;

        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move';
        }
        setDropTarget((prev) => (prev === folder ? prev : folder));
      },
      [items, onMoveItemToFolder],
    );

    const handleFolderDrop = useCallback(
      async (event: React.DragEvent<HTMLElement>, folder: string | null) => {
        if (!onMoveItemToFolder) return;
        event.preventDefault();
        const itemIds = getDraggedVaultItems(event);
        setDropTarget(undefined);
        clearDraggedVaultItem();
        if (itemIds.length === 0) return;

        const safeItems = items || [];
        const dragged = safeItems.filter((item) => itemIds.includes(item.id));
        const isAllInFolder =
          dragged.length > 0 && dragged.every((item) => (item.folder ?? null) === folder);
        if (isAllInFolder) return;

        try {
          await onMoveItemToFolder(itemIds.length === 1 ? itemIds[0] : itemIds, folder);
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('Failed to move item to folder:', err);
          }
        }
      },
      [items, onMoveItemToFolder],
    );

    const handleFolderDragLeave = useCallback(
      (event: React.DragEvent<HTMLElement>, folder: string | null) => {
        if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget as Node)) {
          return;
        }
        setDropTarget((prev) => (prev === folder ? undefined : prev));
      },
      [],
    );

    const hasDraggedFiles = (event: React.DragEvent<HTMLElement>) => {
      try {
        return Array.from(event.dataTransfer.types || []).includes('Files');
      } catch {
        return false;
      }
    };

    const handleFileDragOver = useCallback(
      (event: React.DragEvent<HTMLElement>) => {
        if (!onFileDrop || !hasDraggedFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setIsFileDropActive(true);
      },
      [onFileDrop],
    );

    const handleFileDragLeave = useCallback(
      (event: React.DragEvent<HTMLElement>) => {
        if (!onFileDrop) return;
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsFileDropActive(false);
        }
      },
      [onFileDrop],
    );

    const handleFileDrop = useCallback(
      async (event: React.DragEvent<HTMLElement>) => {
        if (!onFileDrop || !hasDraggedFiles(event)) return;
        event.preventDefault();
        setIsFileDropActive(false);
        const files = Array.from(event.dataTransfer.files || []);
        if (!files.length) return;
        try {
          await onFileDrop(files, currentFolder);
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('Failed to process dropped files:', err);
          }
        }
      },
      [currentFolder, onFileDrop],
    );

    return (
      <div
        className="flex flex-col lg:flex-row h-full gap-8 relative select-none"
        onDragOver={handleFileDragOver}
        onDragLeave={handleFileDragLeave}
        onDrop={(event) => void handleFileDrop(event)}
      >
        {/* Sidebar for Desktop */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col gap-4 sticky top-0 h-fit max-h-[calc(100vh-10rem)] overflow-y-auto pr-2 custom-scrollbar">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text/40">{`${itemTypeLabel} Categories`}</h2>
            <Button
              aria-label="Create category folder"
              variant="ghost"
              size="icon"
              className="h-6 w-6 cursor-pointer"
              onClick={() => safeFolderControls.setIsAdding(true)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
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
                  onDragLeave={(event) => handleFolderDragLeave(event, null)}
                  role="tab"
                  data-drop-target="true"
                  aria-selected={currentFolder === null}
                  aria-label={allItemLabel || `All ${itemTypeLabel}s`}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 text-sm transition-all duration-200 border relative overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20',
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
                  <SidebarIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
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

            {safeFolders.map((folder) => {
              const isSavedFolder = isSavedFolderName(folder);
              const isFolderDropHover = dropTarget === folder;
              const isFolderSource = isDragging && commonSourceFolder === folder;
              const isFolderValidDropZone = isDragging && !isFolderSource;

              return (
                <div key={folder} className="group relative">
                  {safeFolderControls.editing === folder ? (
                    <div className="flex items-center gap-1 p-1">
                      <Input
                        value={safeFolderControls.editingName}
                        onChange={(e) => safeFolderControls.setEditingName(e.target.value)}
                        className="h-8 text-xs"
                        autoFocus
                        maxLength={MAX_FOLDER_NAME_LENGTH}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameFolder(folder);
                          if (e.key === 'Escape') safeFolderControls.setEditing(null);
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
                        onClick={() => safeFolderControls.setEditing(null)}
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
                        onDragLeave={(event) => handleFolderDragLeave(event, folder)}
                        role="tab"
                        data-drop-target="true"
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3 text-sm transition-all duration-200 border relative overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20',
                          isDragging ? 'py-2.5 sm:py-3 scale-[1.02]' : 'py-2',
                          isFolderDropHover &&
                            'ring-2 ring-white border-white bg-white/20 text-white shadow-[0_0_25px_rgba(255,255,255,0.45),inset_0_0_12px_rgba(255,255,255,0.15)] scale-[1.05] z-10 font-bold',
                          isFolderValidDropZone &&
                            !isFolderDropHover &&
                            'border-white/30 bg-gradient-to-r from-white/10 via-white/5 to-transparent text-white shadow-[0_0_15px_rgba(255,255,255,0.12)] hover:border-white/60',
                          isFolderSource &&
                            'border-dashed border-white/25 bg-white/5 text-white/40',
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
                        <Folder className="h-4 w-4 shrink-0" aria-hidden="true" />
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
                              safeFolderControls.setEditing(folder);
                              safeFolderControls.setEditingName(folder);
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
                              try {
                                safeFolderControls.onDelete(folder);
                              } catch (err) {
                                if (process.env.NODE_ENV !== 'production') {
                                  console.error('Failed to delete folder:', err);
                                }
                              }
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
              {safeFolderControls.isAdding && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 space-y-2 overflow-hidden px-1"
                >
                  <Input
                    placeholder="New name..."
                    value={safeFolderControls.newName}
                    onChange={(e) => safeFolderControls.setNewName(e.target.value)}
                    className="h-8 text-xs"
                    autoFocus
                    maxLength={MAX_FOLDER_NAME_LENGTH}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateFolder();
                      if (e.key === 'Escape') safeFolderControls.setIsAdding(false);
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
                      onClick={() => safeFolderControls.setIsAdding(false)}
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
                    className="hidden sm:flex items-center gap-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer"
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
                    className="hidden sm:flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    {isUploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    {uploadLabel || `Upload ${itemTypeLabel}`}
                  </Button>
                )}

                {/* Mobile: Icon-only buttons with 40px+ tap targets */}
                {onLiveRecord && (
                  <Button
                    onClick={onLiveRecord}
                    variant="outline"
                    size="icon"
                    className="flex sm:hidden h-10 w-10 border-primary/20 hover:border-primary/40 hover:bg-primary/5 cursor-pointer"
                    aria-label="Live record"
                  >
                    <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                  </Button>
                )}
                {onUpload && (
                  <Button
                    onClick={() => onUpload(currentFolder)}
                    disabled={isUploading}
                    size="icon"
                    className="flex sm:hidden h-10 w-10 transition-all shadow-sm cursor-pointer"
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
                  aria-label={`Search ${itemTypeLabel}s`}
                  className={cn(
                    'pl-9 h-10 rounded-xl border-text/10 bg-text/[0.03] focus:bg-text/[0.06] transition-colors text-sm placeholder:text-text/30',
                    searchInput && 'pr-9',
                  )}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
                {searchInput ? (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-text/40 hover:text-text rounded-full hover:bg-text/10 transition-colors cursor-pointer"
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
                className="lg:hidden h-10 w-10 shrink-0 border-text/10 hover:bg-text/5 hover:border-text/20 transition-all cursor-pointer"
                onClick={() => setIsMobileFolderOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Mobile Folder Drawer (Portal to document.body to prevent parent transform clipping) */}
          {typeof document !== 'undefined' &&
            createPortal(
              <AnimatePresence>
                {isMobileFolderOpen && (
                  <div
                    key="mobile-folder-menu"
                    className="fixed inset-0 z-[9999] lg:hidden select-none"
                  >
                    {/* Backdrop */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => setIsMobileFolderOpen(false)}
                      className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                      aria-hidden="true"
                    />

                    {/* Drawer Panel */}
                    <motion.div
                      initial={{ x: '100%' }}
                      animate={{ x: 0 }}
                      exit={{ x: '100%' }}
                      transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                      className="absolute right-0 top-0 bottom-0 flex flex-col w-[min(19rem,90vw)] bg-sidebar-bg/95 backdrop-blur-xl border-l border-sidebar-border shadow-2xl overflow-hidden"
                    >
                      {/* Drawer Header with Safe Area Inset */}
                      <div className="flex items-center justify-between px-5 pt-[max(1.25rem,env(safe-area-inset-top,0px))] pb-4 border-b border-sidebar-border/60">
                        <div>
                          <h2 className="text-base font-bold capitalize tracking-tight">
                            {`${itemTypeLabel} Categories`}
                          </h2>
                          <p className="text-[11px] text-text/40 mt-0.5">
                            {safeFolders.length} categories
                          </p>
                        </div>
                        <Button
                          aria-label="Close mobile folders menu"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-lg cursor-pointer"
                          onClick={() => setIsMobileFolderOpen(false)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Scrollable List */}
                      <div
                        className={cn(
                          'flex-1 overflow-y-auto p-4 space-y-1.5 transition-all duration-300 custom-scrollbar overscroll-contain',
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
                              onDragLeave={(event) => handleFolderDragLeave(event, null)}
                              role="tab"
                              data-drop-target="true"
                              aria-selected={currentFolder === null}
                              aria-label={allItemLabel || `All ${itemTypeLabel}s`}
                              className={cn(
                                'flex w-full items-center gap-3 rounded-xl px-3.5 text-sm transition-all duration-200 border relative overflow-hidden cursor-pointer',
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
                                  transition={{
                                    repeat: Infinity,
                                    duration: 1.8,
                                    ease: 'easeInOut',
                                  }}
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
                        {safeFolders.length > 0 && <div className="h-px bg-text/5 mx-1 my-2" />}

                        {/* Folder list */}
                        {safeFolders.map((folder) => {
                          const isEditing = safeFolderControls.editing === folder;
                          const isSavedFolder = isSavedFolderName(folder);
                          const isFolderDropHover = dropTarget === folder;
                          const isFolderSource = isDragging && commonSourceFolder === folder;
                          const isFolderValidDropZone = isDragging && !isFolderSource;

                          return (
                            <div
                              key={folder}
                              onClick={() => {
                                if (!isEditing) {
                                  onFolderSelect(folder);
                                  setIsMobileFolderOpen(false);
                                }
                              }}
                              onDragOver={(event) => handleFolderDragOver(event, folder)}
                              onDrop={(event) => void handleFolderDrop(event, folder)}
                              onDragLeave={(event) => handleFolderDragLeave(event, folder)}
                              role="tab"
                              data-drop-target="true"
                              className={cn(
                                'flex w-full items-center gap-3 rounded-xl px-3.5 text-sm transition-all duration-200 border relative overflow-hidden cursor-pointer',
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
                                  transition={{
                                    repeat: Infinity,
                                    duration: 1.8,
                                    ease: 'easeInOut',
                                  }}
                                  className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-white/5 via-white/10 to-white/5 pointer-events-none"
                                />
                              )}
                              <Folder className="h-4 w-4 shrink-0" />
                              {isEditing ? (
                                <Input
                                  value={safeFolderControls.editingName || ''}
                                  onChange={(e) =>
                                    safeFolderControls.setEditingName(e.target.value)
                                  }
                                  className="h-8 flex-1 text-sm"
                                  autoFocus
                                  maxLength={MAX_FOLDER_NAME_LENGTH}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRenameFolder(folder);
                                    if (e.key === 'Escape') safeFolderControls.setEditing(null);
                                  }}
                                />
                              ) : (
                                <span className="flex-1 text-left truncate" title={folder}>
                                  {folder}
                                </span>
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
                                <div
                                  className="flex items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Button
                                    aria-label="Confirm rename"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-green-400 hover:text-green-300 hover:bg-green-400/10 cursor-pointer"
                                    onClick={() => handleRenameFolder(folder)}
                                    disabled={isRenameInvalid(folder)}
                                  >
                                    <Check className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    aria-label="Cancel rename"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-400/10 cursor-pointer"
                                    onClick={() => safeFolderControls.setEditing(null)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : !isSavedFolder ? (
                                <div
                                  className="flex items-center gap-0.5"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Button
                                    aria-label="Edit folder"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 hover:bg-text/10 cursor-pointer"
                                    onClick={() => {
                                      safeFolderControls.setEditing(folder);
                                      safeFolderControls.setEditingName(folder);
                                    }}
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    aria-label="Delete folder"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 hover:text-red-400 hover:bg-red-400/10 cursor-pointer"
                                    onClick={() => {
                                      try {
                                        safeFolderControls.onDelete(folder);
                                      } catch (err) {
                                        if (process.env.NODE_ENV !== 'production') {
                                          console.error('Failed to delete folder:', err);
                                        }
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>

                      {/* Drawer Footer with Bottom Safe Area Inset */}
                      <div className="px-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] pt-2 border-t border-sidebar-border/60">
                        <AnimatePresence mode="wait">
                          {safeFolderControls.isAdding ? (
                            <motion.div
                              key="adding-folder"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 8 }}
                              className="space-y-2 pt-3"
                            >
                              <Input
                                placeholder="Category name..."
                                value={safeFolderControls.newName}
                                onChange={(e) => safeFolderControls.setNewName(e.target.value)}
                                className="h-9 text-sm"
                                autoFocus
                                maxLength={MAX_FOLDER_NAME_LENGTH}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                              />
                              <div className="flex gap-2">
                                <Button
                                  aria-label="Confirm create folder"
                                  size="sm"
                                  className="h-9 flex-1 text-sm cursor-pointer"
                                  onClick={handleCreateFolder}
                                  disabled={isCreateInvalid}
                                >
                                  Create
                                </Button>
                                <Button
                                  aria-label="Cancel create folder"
                                  size="sm"
                                  variant="ghost"
                                  className="h-9 flex-1 text-sm cursor-pointer"
                                  onClick={() => safeFolderControls.setIsAdding(false)}
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
                                className="w-full justify-start gap-2.5 mt-2 text-text/40 hover:text-text hover:bg-text/5 h-10 text-sm cursor-pointer"
                                onClick={() => safeFolderControls.setIsAdding(true)}
                              >
                                <Plus className="h-4 w-4" />
                                New Category
                              </Button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>,
              document.body,
            )}

          {/* Mobile & Tablet Floating Quick-Drop Bar */}
          <AnimatePresence>
            {isDragging && onMoveItemToFolder && !isMobileFolderOpen && (
              <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 30, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className="lg:hidden fixed bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] inset-x-3 sm:inset-x-6 z-[9999] pointer-events-auto"
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
                          onDragLeave={(e) => handleFolderDragLeave(e, null)}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all border select-none cursor-pointer',
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
                    {safeFolders.map((folder) => {
                      const isHover = dropTarget === folder;
                      const isSource = commonSourceFolder === folder;
                      return (
                        <div
                          key={folder}
                          data-drop-target="true"
                          onDragOver={(e) => handleFolderDragOver(e, folder)}
                          onDrop={(e) => void handleFolderDrop(e, folder)}
                          onDragLeave={(e) => handleFolderDragLeave(e, folder)}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all border select-none cursor-pointer',
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
  },
);

VaultLayout.displayName = 'VaultLayout';
export default VaultLayout;
