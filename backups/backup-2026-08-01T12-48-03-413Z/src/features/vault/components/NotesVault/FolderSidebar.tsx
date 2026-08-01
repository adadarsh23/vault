import React, { useMemo, useState, useCallback } from 'react';
import { cn } from '../../../../lib/utils';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Plus, Trash2, FileText, Check, Folder, Edit2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDraggedVaultItem, clearDraggedVaultItem } from '../../../../lib/vaultDragDrop';
import { isSavedFolderName } from '../../../../lib/folderGuards';

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
  handleMoveToFolder?: (itemId: string, folderName: string | null) => Promise<void> | void;
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
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  React.useEffect(() => {
    const handleGlobalDragStart = (e: DragEvent) => {
      const itemId = getDraggedVaultItem({ dataTransfer: e.dataTransfer });
      if (itemId) {
        setDraggedItemId(itemId);
      }
    };

    const handleGlobalDragEnd = () => {
      setDraggedItemId(null);
      clearDraggedVaultItem();
    };

    window.addEventListener('dragstart', handleGlobalDragStart);
    window.addEventListener('dragend', handleGlobalDragEnd);

    return () => {
      window.removeEventListener('dragstart', handleGlobalDragStart);
      window.removeEventListener('dragend', handleGlobalDragEnd);
    };
  }, []);

  const draggedItem = useMemo(() => {
    if (!draggedItemId) return null;
    return notes.find((note) => note.id === draggedItemId);
  }, [draggedItemId, notes]);

  const draggedItemFolder = draggedItem ? (draggedItem.folder ?? null) : undefined;

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
      if (!handleMoveToFolder || !getDraggedVaultItem(event)) return;

      const itemId = getDraggedVaultItem(event);
      const dragged = notes.find((note) => note.id === itemId);
      const sourceFolder = dragged ? (dragged.folder ?? null) : undefined;

      // Do not allow drop on the folder where the item already is
      if (sourceFolder === folder) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget(folder);
    },
    [handleMoveToFolder, notes]
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLElement>, folder: string | null) => {
      if (!handleMoveToFolder) return;
      event.preventDefault();

      const itemId = getDraggedVaultItem(event);
      setDropTarget(undefined);

      if (!itemId) return;

      const dragged = notes.find((note) => note.id === itemId);
      const sourceFolder = dragged ? (dragged.folder ?? null) : undefined;

      // Do not allow drop on the folder where the item already is
      if (sourceFolder === folder) return;

      try {
        await handleMoveToFolder(itemId, folder);
      } catch (error) {
        console.error('Move failed:', error);
      }
    },
    [handleMoveToFolder, notes]
  );

  /* -------------------- UI -------------------- */

  return (
    <aside
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

      <div className="space-y-1">
        {/* All Notes */}
        <div
          role="button"
          tabIndex={0}
          aria-pressed={currentFolder === null}
          onClick={() => setCurrentFolder(null)}
          onDragOver={(e) => handleDragOver(e, null)}
          onDrop={(e) => void handleDrop(e, null)}
          className={cn(
            'flex items-center gap-3 rounded-xl px-3 py-2 text-sm cursor-pointer transition border border-transparent',
            dropTarget === null && 'ring-2 ring-primary/50 bg-primary/10',
            // Highlight if this is the source folder of the dragged item
            draggedItemId &&
              draggedItemFolder === null &&
              'border border-dashed border-primary/40 bg-primary/10 text-primary',
            // Highlight other folders as valid drop zones
            draggedItemId &&
              draggedItemFolder !== null &&
              'border border-dashed border-primary/20 bg-primary/5 text-text/70',
            !draggedItemId &&
              (currentFolder === null ? 'bg-text/10 text-text' : 'text-text/60 hover:bg-text/5')
          )}
        >
          <FileText className="h-4 w-4" />
          <span className="flex-1 font-bold truncate">All Notes</span>
          {draggedItemId && draggedItemFolder === null ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary animate-pulse">
              Source
            </span>
          ) : (
            <span className="text-[10px] opacity-40">{notes.length}</span>
          )}
        </div>

        <div className="h-px bg-text/5 my-2 mx-2" />

        {/* Folders */}
        {folders.map((folder) => {
          const isActive = currentFolder === folder;
          const isDrop = dropTarget === folder;
          const isSavedFolder = isSavedFolderName(folder);

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
                <div
                  role="button"
                  tabIndex={0}
                  aria-pressed={isActive}
                  onClick={() => setCurrentFolder(folder)}
                  onDragOver={(e) => handleDragOver(e, folder)}
                  onDrop={(e) => void handleDrop(e, folder)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2 text-sm cursor-pointer transition border border-transparent relative',
                    isDrop && 'ring-2 ring-primary/50 bg-primary/10',
                    // Highlight if this is the source folder of the dragged item
                    draggedItemId &&
                      draggedItemFolder === folder &&
                      'border border-dashed border-primary/40 bg-primary/10 text-primary',
                    // Highlight other folders as valid drop zones
                    draggedItemId &&
                      draggedItemFolder !== folder &&
                      'border border-dashed border-primary/20 bg-primary/5 text-text/70',
                    !draggedItemId &&
                      (isActive ? 'bg-text/10 text-text' : 'text-text/60 hover:bg-text/5')
                  )}
                >
                  <Folder className="h-4 w-4" />
                  <span className="flex-1 truncate" title={folder}>
                    {folder}
                  </span>

                  {draggedItemId && draggedItemFolder === folder ? (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary animate-pulse">
                      Source
                    </span>
                  ) : (
                    <span className="text-[10px] opacity-40">{folderCounts[folder] || 0}</span>
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
                </div>
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
  );
};
