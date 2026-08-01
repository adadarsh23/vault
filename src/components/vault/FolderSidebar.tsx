import React from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Plus, Trash2, Check, Folder, Edit2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDraggedVaultItem, clearDraggedVaultItem } from '../../lib/vaultDragDrop';
import { isSavedFolderName } from '../../lib/folderGuards';

export interface FolderSidebarProps {
  items: any[];
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
  title?: string;
  allItemLabel?: string;
  allItemIcon?: React.ReactNode;
}

export const FolderSidebar: React.FC<FolderSidebarProps> = ({
  items,
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
  title = 'Folders',
  allItemLabel = 'All Items',
  allItemIcon,
}) => {
  const [dropTarget, setDropTarget] = React.useState<string | null | undefined>(undefined);
  const [draggedItemId, setDraggedItemId] = React.useState<string | null>(null);

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

  const draggedItem = React.useMemo(() => {
    if (!draggedItemId) return null;
    return items.find((item) => item.id === draggedItemId);
  }, [draggedItemId, items]);

  const draggedItemFolder = draggedItem ? (draggedItem.folder ?? null) : undefined;

  const handleDragOver = (event: React.DragEvent<HTMLElement>, folder: string | null) => {
    if (!handleMoveToFolder || !getDraggedVaultItem(event)) return;

    const itemId = getDraggedVaultItem(event);
    const dragged = items.find((item) => item.id === itemId);
    const sourceFolder = dragged ? (dragged.folder ?? null) : undefined;

    // Do not allow drop on the folder where the item already is
    if (sourceFolder === folder) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(folder);
  };

  const handleDrop = async (event: React.DragEvent<HTMLElement>, folder: string | null) => {
    if (!handleMoveToFolder) return;
    event.preventDefault();
    const itemId = getDraggedVaultItem(event);
    setDropTarget(undefined);
    if (!itemId) return;

    const dragged = items.find((item) => item.id === itemId);
    const sourceFolder = dragged ? (dragged.folder ?? null) : undefined;

    // Do not allow drop on the folder where the item already is
    if (sourceFolder === folder) return;

    await handleMoveToFolder(itemId, folder);
  };

  return (
    <aside className="hidden lg:flex lg:w-48 xl:w-56 shrink-0 flex-col gap-4 sticky top-0 h-fit max-h-full overflow-y-auto pr-2 custom-scrollbar">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text/40">{title}</h2>
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
        <div
          role="button"
          tabIndex={0}
          data-drop-target="true"
          onClick={() => setCurrentFolder(null)}
          onDragOver={(event) => handleDragOver(event, null)}
          onDrop={(event) => void handleDrop(event, null)}
          onDragLeave={() => dropTarget === null && setDropTarget(undefined)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setCurrentFolder(null);
            }
          }}
          className={cn(
            'flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all border border-transparent',
            dropTarget === null && 'ring-2 ring-primary/50 bg-primary/10 text-text',
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
          {allItemIcon}
          <span className="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis font-bold">
            {allItemLabel}
          </span>
          {draggedItemId && draggedItemFolder === null ? (
            <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary animate-pulse">
              Source
            </span>
          ) : (
            <span className="ml-auto text-[10px] font-bold opacity-40">{items.length}</span>
          )}
        </div>
        <div className="h-px bg-text/5 my-2 mx-2" />

        {folders.map((folder) => (
          <div key={folder} className="group relative">
            {(() => {
              const isSavedFolder = isSavedFolderName(folder);
              return editingFolder === folder ? (
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
                  data-drop-target="true"
                  onClick={() => setCurrentFolder(folder)}
                  onDragOver={(event) => handleDragOver(event, folder)}
                  onDrop={(event) => void handleDrop(event, folder)}
                  onDragLeave={() => dropTarget === folder && setDropTarget(undefined)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setCurrentFolder(folder);
                    }
                  }}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all relative border border-transparent',
                    dropTarget === folder && 'ring-2 ring-primary/50 bg-primary/10 text-text',
                    // Highlight if this is the source folder of the dragged item
                    draggedItemId &&
                      draggedItemFolder === folder &&
                      'border border-dashed border-primary/40 bg-primary/10 text-primary',
                    // Highlight other folders as valid drop zones
                    draggedItemId &&
                      draggedItemFolder !== folder &&
                      'border border-dashed border-primary/20 bg-primary/5 text-text/70',
                    !draggedItemId &&
                      (currentFolder === folder
                        ? 'bg-text/10 text-text'
                        : 'text-text/60 hover:bg-text/5')
                  )}
                >
                  <Folder className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate text-left" title={folder}>
                    {folder}
                  </span>
                  <div className="flex items-center gap-1">
                    {draggedItemId && draggedItemFolder === folder ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary animate-pulse">
                        Source
                      </span>
                    ) : (
                      <span
                        className={`text-[10px] transition-opacity ${currentFolder === folder ? 'opacity-40' : 'opacity-40 group-hover:opacity-0'}`}
                      >
                        {items.filter((i) => i.folder === folder).length}
                      </span>
                    )}
                    {!isSavedFolder && (
                      <div className="absolute right-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 bg-bg/80 backdrop-blur-sm rounded-md shadow-md">
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
                </div>
              );
            })()}
          </div>
        ))}

        <AnimatePresence>
          {isAddingFolder && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 space-y-2 overflow-hidden px-1"
            >
              <Input
                placeholder="New folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="h-8 text-xs bg-white/5 border-white/10"
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
