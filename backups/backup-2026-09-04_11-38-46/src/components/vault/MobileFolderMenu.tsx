import React, { useState } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Plus, X, Folder, Edit2, Trash2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { isSavedFolderName } from '../../lib/folderGuards';
import {
  getDraggedVaultItems,
  clearDraggedVaultItem,
  useVaultDragState,
} from '../../lib/vaultDragDrop';

export interface MobileFolderMenuProps {
  isOpen: boolean;
  onClose: () => void;
  items: any[];
  folders: string[];
  currentFolder: string | null;
  setCurrentFolder: (folder: string | null) => void;
  isAddingFolder: boolean;
  setIsAddingFolder: (isAdding: boolean) => void;
  newFolderName: string;
  setNewFolderName: (name: string) => void;
  handleCreateFolder: () => void;
  editingFolder?: string | null;
  setEditingFolder?: (folder: string | null) => void;
  editingFolderName?: string;
  setEditingFolderName?: (name: string) => void;
  handleRenameFolder?: (oldName: string) => void;
  handleDeleteFolder?: (folderName: string) => void;
  handleMoveToFolder?: (
    itemId: string | string[],
    folderName: string | null,
  ) => Promise<void> | void;
  title?: string;
  allItemLabel?: string;
  allItemIcon?: React.ReactNode;
}

export const MobileFolderMenu: React.FC<MobileFolderMenuProps> = ({
  isOpen,
  onClose,
  items,
  folders,
  currentFolder,
  setCurrentFolder,
  isAddingFolder,
  setIsAddingFolder,
  newFolderName,
  setNewFolderName,
  handleCreateFolder,
  editingFolder = null,
  setEditingFolder,
  editingFolderName = '',
  setEditingFolderName,
  handleRenameFolder,
  handleDeleteFolder,
  handleMoveToFolder,
  title = 'Folders',
  allItemLabel = 'All Items',
  allItemIcon,
}) => {
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined);
  const { isDragging, itemIds: draggedItemIds } = useVaultDragState();

  const draggedItems = React.useMemo(() => {
    if (draggedItemIds.length === 0) return [];
    return items.filter((item) => draggedItemIds.includes(item.id));
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

  const handleDrop = async (event: React.DragEvent<HTMLElement>, folder: string | null) => {
    if (!handleMoveToFolder) return;
    event.preventDefault();
    const itemIds = getDraggedVaultItems(event);
    setDropTarget(undefined);
    clearDraggedVaultItem();
    if (itemIds.length === 0) return;

    const dragged = items.filter((item) => itemIds.includes(item.id));
    const isAllInFolder =
      dragged.length > 0 && dragged.every((item) => (item.folder ?? null) === folder);
    if (isAllInFolder) return;

    await handleMoveToFolder(itemIds.length === 1 ? itemIds[0] : itemIds, folder);
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div key="mobile-folder-menu-generic" className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 bottom-0 w-72 bg-bg border-l border-white/5 p-6 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-lg font-bold">{title}</h2>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div
                className={cn('space-y-2 transition-all duration-300', isDragging && 'space-y-3')}
              >
                {(() => {
                  const isAllItemsDropHover = dropTarget === null;
                  const isAllItemsSource = isDragging && commonSourceFolder === null;
                  const isAllItemsValidDropZone = isDragging && !isAllItemsSource;

                  return (
                    <button
                      onClick={() => {
                        setCurrentFolder(null);
                        onClose();
                      }}
                      onDragOver={(event) => handleDragOver(event, null)}
                      onDrop={(event) => void handleDrop(event, null)}
                      onDragLeave={() => dropTarget === null && setDropTarget(undefined)}
                      role="tab"
                      data-drop-target="true"
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-4 text-sm transition-all duration-200 border relative overflow-hidden',
                        isDragging ? 'py-3.5 scale-[1.02]' : 'py-3',
                        isAllItemsDropHover &&
                          'ring-2 ring-white border-white bg-white/20 text-white shadow-[0_0_25px_rgba(255,255,255,0.45),inset_0_0_12px_rgba(255,255,255,0.15)] scale-[1.04] z-10 font-bold',
                        isAllItemsValidDropZone &&
                          !isAllItemsDropHover &&
                          'border-white/30 bg-gradient-to-r from-white/10 via-white/5 to-transparent text-white shadow-[0_0_15px_rgba(255,255,255,0.12)] hover:border-white/60',
                        isAllItemsSource &&
                          'border-dashed border-white/25 bg-white/5 text-white/40',
                        !isDragging &&
                          (currentFolder === null
                            ? 'bg-text/10 text-text font-bold border-transparent'
                            : 'text-text/60 hover:bg-white/5 border-transparent'),
                      )}
                    >
                      {isAllItemsValidDropZone && !isAllItemsDropHover && (
                        <motion.div
                          animate={{ opacity: [0.2, 0.5, 0.2] }}
                          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                          className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-white/5 via-white/10 to-white/5 pointer-events-none"
                        />
                      )}
                      {allItemIcon && (
                        <span className="h-5 w-5 shrink-0 flex items-center justify-center">
                          {allItemIcon}
                        </span>
                      )}
                      <span className="flex-1 text-left truncate">{allItemLabel}</span>
                      {isAllItemsDropHover ? (
                        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-md bg-white text-black shadow-lg animate-pulse">
                          Drop here
                        </span>
                      ) : isAllItemsSource ? (
                        <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/15 text-white/60 animate-pulse">
                          Source
                        </span>
                      ) : isAllItemsValidDropZone ? (
                        <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-white/90 px-1.5 py-0.5 rounded bg-white/10 border border-white/20">
                          Drop Zone
                        </span>
                      ) : (
                        <span className="ml-auto text-[10px] opacity-40">{items.length}</span>
                      )}
                    </button>
                  );
                })()}

                {folders.map((folder) => {
                  const isEditing = editingFolder === folder;
                  const isSavedFolder = isSavedFolderName(folder);
                  const isFolderDropHover = dropTarget === folder;
                  const isFolderSource = isDragging && commonSourceFolder === folder;
                  const isFolderValidDropZone = isDragging && !isFolderSource;

                  return (
                    <div
                      key={folder}
                      onDragOver={(event) => handleDragOver(event, folder)}
                      onDrop={(event) => void handleDrop(event, folder)}
                      onDragLeave={() => dropTarget === folder && setDropTarget(undefined)}
                      role="tab"
                      data-drop-target="true"
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-4 text-sm transition-all duration-200 border relative overflow-hidden',
                        isDragging ? 'py-3.5 scale-[1.02]' : 'py-3',
                        isFolderDropHover &&
                          'ring-2 ring-white border-white bg-white/20 text-white shadow-[0_0_25px_rgba(255,255,255,0.45),inset_0_0_12px_rgba(255,255,255,0.15)] scale-[1.04] z-10 font-bold',
                        isFolderValidDropZone &&
                          !isFolderDropHover &&
                          'border-white/30 bg-gradient-to-r from-white/10 via-white/5 to-transparent text-white shadow-[0_0_15px_rgba(255,255,255,0.12)] hover:border-white/60',
                        isFolderSource && 'border-dashed border-white/25 bg-white/5 text-white/40',
                        !isDragging &&
                          (currentFolder === folder
                            ? 'bg-text/10 text-text font-bold border-transparent'
                            : 'text-text/60 hover:bg-white/5 border-transparent'),
                      )}
                    >
                      {isFolderValidDropZone && !isFolderDropHover && (
                        <motion.div
                          animate={{ opacity: [0.2, 0.5, 0.2] }}
                          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                          className="absolute inset-0 rounded-[inherit] bg-gradient-to-r from-white/5 via-white/10 to-white/5 pointer-events-none"
                        />
                      )}
                      <Folder className="h-5 w-5 shrink-0" />
                      {isEditing ? (
                        <Input
                          value={editingFolderName}
                          onChange={(e) => setEditingFolderName?.(e.target.value)}
                          className="h-9 flex-1 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameFolder?.(folder);
                            if (e.key === 'Escape') setEditingFolder?.(null);
                          }}
                        />
                      ) : (
                        <button
                          className="flex-1 text-left truncate"
                          onClick={() => {
                            setCurrentFolder(folder);
                            onClose();
                          }}
                          title={folder}
                        >
                          {folder}
                        </button>
                      )}
                      {isFolderDropHover ? (
                        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-md bg-white text-black shadow-lg animate-pulse">
                          Drop here
                        </span>
                      ) : isFolderSource ? (
                        <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/15 text-white/60 animate-pulse">
                          Source
                        </span>
                      ) : isFolderValidDropZone ? (
                        <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-white/90 px-1.5 py-0.5 rounded bg-white/10 border border-white/20">
                          Drop Zone
                        </span>
                      ) : (
                        <span className="text-[10px] opacity-40">
                          {items.filter((i) => i.folder === folder).length}
                        </span>
                      )}
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Button
                            aria-label="Confirm rename"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-400"
                            onClick={() => handleRenameFolder?.(folder)}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            aria-label="Cancel rename"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-400"
                            onClick={() => setEditingFolder?.(null)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : !isSavedFolder ? (
                        <div className="flex items-center gap-1">
                          <Button
                            aria-label="Edit folder"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingFolder?.(folder);
                              setEditingFolderName?.(folder);
                            }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            aria-label="Delete folder"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 hover:text-red-400"
                            onClick={() => handleDeleteFolder?.(folder)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                <AnimatePresence mode="wait">
                  {isAddingFolder ? (
                    <motion.div
                      key="adding-folder-mobile-generic"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 space-y-3 px-1"
                    >
                      <Input
                        placeholder="New folder name..."
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        className="h-10 text-sm bg-white/5 border-white/10"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCreateFolder();
                            if (newFolderName.trim()) onClose();
                          }
                        }}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-9 flex-1"
                          onClick={() => {
                            handleCreateFolder();
                            if (newFolderName.trim()) onClose();
                          }}
                        >
                          Create
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 flex-1 bg-white/5"
                          onClick={() => setIsAddingFolder(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="add-folder-btn-mobile-generic"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 mt-4 text-text/40 hover:text-text hover:bg-white/5"
                        onClick={() => setIsAddingFolder(true)}
                      >
                        <Plus className="h-5 w-5" />
                        Create New Folder
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile & Tablet Floating Quick-Drop Bar (Active during Drag when menu is closed) */}
      <AnimatePresence>
        {!isOpen && isDragging && handleMoveToFolder && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="fixed bottom-[max(1.5rem,calc(env(safe-area-inset-bottom)+0.75rem))] inset-x-3 sm:inset-x-6 z-[9999] pointer-events-auto"
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
                      {allItemIcon && (
                        <span className="h-3.5 w-3.5 shrink-0 flex items-center justify-center">
                          {allItemIcon}
                        </span>
                      )}
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
