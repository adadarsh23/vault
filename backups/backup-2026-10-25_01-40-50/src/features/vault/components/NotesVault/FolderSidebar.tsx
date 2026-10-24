import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useScrollRestoration } from '../../../../hooks/useScrollRestoration';
import { cn } from '../../../../lib/utils';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Plus, Trash2, FileText, Check, Folder, Edit2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getDraggedVaultItems,
  clearDraggedVaultItem,
  useVaultDragState,
} from '../../../../lib/vaultDragDrop';
import { isSavedFolderName } from '../../../../lib/folderGuards';
import { logger } from '../../../../lib/logger';

/* -------------------- Types -------------------- */

interface Note {
  id: string;
  folder: string | null;
}

export interface FolderSidebarProps {
  notes: Note[];
  folders: string[];
  currentFolder: string | null;
  setCurrentFolder: (folder: string | null) => void;
  isAddingFolder: boolean;
  setIsAddingFolder: (isAdding: boolean) => void;
  newFolderName: string;
  setNewFolderName: (name: string) => void;
  editingFolder: string | null;
  setEditingFolder: (folder: string | null) => void;
  editingFolderName: string;
  setEditingFolderName: (name: string) => void;
  handleCreateFolder: () => void;
  handleRenameFolder: (oldName: string) => void;
  handleDeleteFolder: (folderName: string) => void;
  handleMoveToFolder?: (
    itemId: string | string[],
    folderName: string | null,
  ) => Promise<void> | void;
}

/* -------------------- Component -------------------- */

export const FolderSidebar: React.FC<FolderSidebarProps> = ({
  notes,
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
}) => {
  const [dropTarget, setDropTarget] = useState<string | null | undefined>();
  const folderSidebarRef = useRef<HTMLElement>(null);
  useScrollRestoration('notes_folder_sidebar', folderSidebarRef);
  const { isDragging, itemIds: draggedItemIds } = useVaultDragState();

  useEffect(() => {
    if (!isDragging) {
      setDropTarget(undefined);
    }
  }, [isDragging]);

  const draggedItems = useMemo(() => {
    if (draggedItemIds.length === 0) return [];
    return notes.filter((note) => draggedItemIds.includes(note.id));
  }, [draggedItemIds, notes]);

  const commonSourceFolder = useMemo(() => {
    if (draggedItems.length === 0) return undefined;
    const firstFolder = draggedItems[0]?.folder ?? null;
    const allSame = draggedItems.every((item) => (item?.folder ?? null) === firstFolder);
    return allSame ? firstFolder : undefined;
  }, [draggedItems]);

  /* ---------- Memoized counts (performance) ---------- */
  const folderCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const note of notes) {
      if (note.folder) {
        map[note.folder] = (map[note.folder] || 0) + 1;
      }
    }
    return map;
  }, [notes]);

  /* ---------- Drag handlers ---------- */
  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>, folder: string | null) => {
      if (!handleMoveToFolder) return;
      const itemIds = getDraggedVaultItems(event);
      if (itemIds.length === 0) return;

      const dragged = notes.filter((note) => itemIds.includes(note.id));
      const isAllInFolder =
        dragged.length > 0 && dragged.every((note) => (note.folder ?? null) === folder);
      if (isAllInFolder) return;

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      setDropTarget(folder);
    },
    [handleMoveToFolder, notes],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLElement>, folder: string | null) => {
      if (!handleMoveToFolder) return;
      event.preventDefault();
      const itemIds = getDraggedVaultItems(event);
      setDropTarget(undefined);
      clearDraggedVaultItem();

      if (itemIds.length === 0) return;

      const dragged = notes.filter((note) => itemIds.includes(note.id));
      const isAllInFolder =
        dragged.length > 0 && dragged.every((note) => (note.folder ?? null) === folder);
      if (isAllInFolder) return;

      try {
        await handleMoveToFolder(itemIds.length === 1 ? itemIds[0] : itemIds, folder);
      } catch (error) {
        logger.error('Move note to folder failed', { error });
      }
    },
    [handleMoveToFolder, notes],
  );

  /* -------------------- UI -------------------- */

  return (
    <>
      <aside
        ref={folderSidebarRef}
        aria-label="Folder Sidebar"
        className="hidden lg:flex lg:w-48 xl:w-56 shrink-0 flex-col gap-4 h-full overflow-y-auto pr-2 custom-scrollbar"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text/40">
            Notes Categories
          </h2>
          <Button
            aria-label="Create folder"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsAddingFolder(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className={cn('space-y-1 transition-all duration-300', isDragging && 'space-y-2')}>
          {/* All Notes */}
          {(() => {
            const isAllItemsDropHover = dropTarget === null;
            const isAllItemsSource = isDragging && commonSourceFolder === null;
            const isAllItemsValidDropZone = isDragging && !isAllItemsSource;

            return (
              <motion.div
                layout
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                role="button"
                tabIndex={0}
                data-drop-target="true"
                aria-pressed={currentFolder === null}
                onClick={() => setCurrentFolder(null)}
                onDragOver={(e) => handleDragOver(e, null)}
                onDrop={(e) => void handleDrop(e, null)}
                onDragLeave={() => dropTarget === null && setDropTarget(undefined)}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 text-sm cursor-pointer transition-all duration-200 border relative overflow-hidden',
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
                <FileText className="h-4 w-4 shrink-0" />
                <span className="flex-1 font-bold truncate">All Notes</span>
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
                  <span className="ml-auto text-[10px] opacity-40">{notes.length}</span>
                )}
              </motion.div>
            );
          })()}

          <div className="h-px bg-text/5 my-2 mx-2" />

          {/* Folders */}
          {folders.map((folder) => {
            const isActive = currentFolder === folder;
            const isSavedFolder = isSavedFolderName(folder);
            const isFolderDropHover = dropTarget === folder;
            const isFolderSource = isDragging && commonSourceFolder === folder;
            const isFolderValidDropZone = isDragging && !isFolderSource;

            return (
              <div key={folder} className="group relative">
                {editingFolder === folder ? (
                  <div className="flex items-center gap-1 p-1">
                    <Input
                      value={editingFolderName}
                      onChange={(e) => setEditingFolderName(e.target.value)}
                      className="h-8 text-xs"
                      autoFocus
                      onKeyDown={(e) => e.key === 'Enter' && handleRenameFolder(folder)}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-green-400"
                      onClick={() => handleRenameFolder(folder)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-400"
                      onClick={() => setEditingFolder(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <motion.div
                    layout
                    transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                    role="button"
                    tabIndex={0}
                    data-drop-target="true"
                    aria-pressed={isActive}
                    onClick={() => setCurrentFolder(folder)}
                    onDragOver={(e) => handleDragOver(e, folder)}
                    onDrop={(e) => void handleDrop(e, folder)}
                    onDragLeave={() => dropTarget === folder && setDropTarget(undefined)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 text-sm cursor-pointer transition-all duration-200 border relative overflow-hidden',
                      isDragging ? 'py-2.5 sm:py-3 scale-[1.02]' : 'py-2',
                      isFolderDropHover &&
                        'ring-2 ring-white border-white bg-white/20 text-white shadow-[0_0_25px_rgba(255,255,255,0.45),inset_0_0_12px_rgba(255,255,255,0.15)] scale-[1.05] z-10 font-bold',
                      isFolderValidDropZone &&
                        !isFolderDropHover &&
                        'border-white/30 bg-gradient-to-r from-white/10 via-white/5 to-transparent text-white shadow-[0_0_15px_rgba(255,255,255,0.12)] hover:border-white/60',
                      isFolderSource && 'border-dashed border-white/25 bg-white/5 text-white/40',
                      !isDragging &&
                        (isActive
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
                    <span className="flex-1 truncate" title={folder}>
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
                      <span className="ml-auto text-[10px] opacity-40">
                        {folderCounts[folder] || 0}
                      </span>
                    )}

                    {/* Actions */}
                    {!isSavedFolder && (
                      <div className="absolute right-2 flex opacity-0 group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFolder(folder);
                            setEditingFolderName(folder);
                          }}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:text-red-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFolder(folder);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            );
          })}

          {/* Add Folder */}
          <AnimatePresence>
            {isAddingFolder && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 space-y-2 px-1 overflow-hidden"
              >
                <Input
                  placeholder="New folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="h-8 text-xs"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                />

                <div className="flex gap-1">
                  <Button size="sm" className="h-7 flex-1 text-[10px]" onClick={handleCreateFolder}>
                    Create
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 flex-1 text-[10px]"
                    onClick={() => setIsAddingFolder(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      {/* Mobile & Tablet Floating Quick-Drop Bar for Notes */}
      <AnimatePresence>
        {isDragging && handleMoveToFolder && (
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
                    {draggedItemIds.length} {draggedItemIds.length === 1 ? 'note' : 'notes'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {/* All Notes Pill */}
                {(() => {
                  const isAllHover = dropTarget === null;
                  const isAllSource = commonSourceFolder === null;
                  return (
                    <div
                      data-drop-target="true"
                      onDragOver={(e) => handleDragOver(e, null)}
                      onDrop={(e) => void handleDrop(e, null)}
                      onDragLeave={() => dropTarget === null && setDropTarget(undefined)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold shrink-0 transition-all border select-none',
                        isAllHover
                          ? 'ring-2 ring-white border-white bg-white/30 text-white shadow-[0_0_20px_rgba(255,255,255,0.6)] scale-105'
                          : isAllSource
                            ? 'border-dashed border-white/25 bg-white/5 text-white/40'
                            : 'border-white/30 bg-white/10 text-white hover:border-white/60 shadow-sm',
                      )}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span>All Notes</span>
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
                      onDragOver={(e) => handleDragOver(e, folder)}
                      onDrop={(e) => void handleDrop(e, folder)}
                      onDragLeave={() => dropTarget === folder && setDropTarget(undefined)}
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
    </>
  );
};
