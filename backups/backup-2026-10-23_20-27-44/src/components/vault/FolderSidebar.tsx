import React from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Plus, Trash2, Check, Folder, Edit2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  getDraggedVaultItems,
  clearDraggedVaultItem,
  useVaultDragState,
} from '../../lib/vaultDragDrop';
import { isSavedFolderName } from '../../lib/folderGuards';
import { logger } from '../../lib/logger';

export interface FolderSidebarProps {
  items: Array<{ id: string; folder?: string | null }>;
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
  title?: string;
  allItemLabel?: string;
  allItemIcon?: React.ReactNode;
}

export const FolderSidebar: React.FC<FolderSidebarProps> = React.memo(
  ({
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
    const { isDragging, itemIds: draggedItemIds } = useVaultDragState();

    // Performance: Single O(N) pass to precalculate item counts by folder
    const itemCountsByFolder = React.useMemo(() => {
      const counts = new Map<string, number>();
      for (let i = 0; i < items.length; i++) {
        const folder = items[i]?.folder;
        if (typeof folder === 'string') {
          counts.set(folder, (counts.get(folder) || 0) + 1);
        }
      }
      return counts;
    }, [items]);

    const draggedItems = React.useMemo(() => {
      if (draggedItemIds.length === 0) return [];
      const idSet = new Set(draggedItemIds);
      return items.filter((item) => idSet.has(item.id));
    }, [draggedItemIds, items]);

    const commonSourceFolder = React.useMemo(() => {
      if (draggedItems.length === 0) return undefined;
      const firstFolder = draggedItems[0]?.folder ?? null;
      const allSame = draggedItems.every((item) => (item?.folder ?? null) === firstFolder);
      return allSame ? firstFolder : undefined;
    }, [draggedItems]);

    React.useEffect(() => {
      if (!isDragging) {
        setDropTarget(undefined);
      }
    }, [isDragging]);

    const handleDragOver = (event: React.DragEvent<HTMLElement>, folder: string | null) => {
      if (!handleMoveToFolder) return;
      const itemIds = getDraggedVaultItems(event);
      if (itemIds.length === 0) return;

      const idSet = new Set(itemIds);
      const dragged = items.filter((item) => idSet.has(item.id));
      const isAllInFolder =
        dragged.length > 0 && dragged.every((item) => (item.folder ?? null) === folder);
      if (isAllInFolder) return;

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      setDropTarget(folder);
    };

    const handleDrop = async (event: React.DragEvent<HTMLElement>, folder: string | null) => {
      if (!handleMoveToFolder) return;
      event.preventDefault();
      const itemIds = getDraggedVaultItems(event);
      setDropTarget(undefined);
      clearDraggedVaultItem();
      if (itemIds.length === 0) return;

      const idSet = new Set(itemIds);
      const dragged = items.filter((item) => idSet.has(item.id));
      const isAllInFolder =
        dragged.length > 0 && dragged.every((item) => (item.folder ?? null) === folder);
      if (isAllInFolder) return;

      try {
        await handleMoveToFolder(itemIds.length === 1 ? itemIds[0] : itemIds, folder);
      } catch (err) {
        logger.error('Failed to move item to folder', { error: err });
        toast.error('Failed to move item to folder');
      }
    };

    return (
      <aside className="hidden lg:flex lg:w-48 xl:w-56 shrink-0 flex-col gap-4 sticky top-0 h-fit max-h-full overflow-y-auto pr-2 custom-scrollbar print:hidden">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text/40">{title}</h2>
          <Button
            aria-label="Create folder"
            variant="ghost"
            size="icon"
            type="button"
            className="h-6 w-6"
            onClick={() => setIsAddingFolder(true)}
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
              <motion.div
                layout
                transition={{ type: 'spring', stiffness: 350, damping: 25 }}
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
                  'flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm transition-all duration-200 border relative overflow-hidden select-none',
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
                {allItemIcon}
                <span className="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis font-bold">
                  {allItemLabel}
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
                  <span className="ml-auto text-[10px] font-bold opacity-40">{items.length}</span>
                )}
              </motion.div>
            );
          })()}

          <div className="h-px bg-text/5 my-2 mx-2" />

          {folders.map((folder) => {
            const isSavedFolder = isSavedFolderName(folder);
            const isFolderDropHover = dropTarget === folder;
            const isFolderSource = isDragging && commonSourceFolder === folder;
            const isFolderValidDropZone = isDragging && !isFolderSource;
            const folderItemCount = itemCountsByFolder.get(folder) || 0;

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
                      type="button"
                      className="h-8 w-8 text-green-400"
                      onClick={() => handleRenameFolder(folder)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      type="button"
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
                      'flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-sm transition-all duration-200 border relative overflow-hidden select-none',
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
                    <span className="flex-1 truncate text-left" title={folder}>
                      {folder}
                    </span>
                    <div className="flex items-center gap-1">
                      {isFolderDropHover ? (
                        <motion.span
                          initial={{ scale: 0.8 }}
                          animate={{ scale: 1 }}
                          className="text-[10px] font-bold px-2 py-0.5 rounded bg-white text-black shadow-lg animate-pulse"
                        >
                          Drop here
                        </motion.span>
                      ) : isFolderSource ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/15 text-white/60 animate-pulse">
                          Source
                        </span>
                      ) : isFolderValidDropZone ? (
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-white/90 px-1.5 py-0.5 rounded bg-white/10 border border-white/20">
                          Drop Zone
                        </span>
                      ) : (
                        <span
                          className={`text-[10px] transition-opacity ${currentFolder === folder ? 'opacity-40' : 'opacity-40 group-hover:opacity-0'}`}
                        >
                          {folderItemCount}
                        </span>
                      )}
                      {!isSavedFolder && (
                        <div className="absolute right-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 bg-bg/80 backdrop-blur-sm rounded-md shadow-md">
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
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
                            type="button"
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
                  </motion.div>
                )}
              </div>
            );
          })}

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
                  <Button
                    size="sm"
                    type="button"
                    className="h-7 flex-1 text-[10px]"
                    onClick={handleCreateFolder}
                  >
                    Create
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
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
  },
);

FolderSidebar.displayName = 'FolderSidebar';
