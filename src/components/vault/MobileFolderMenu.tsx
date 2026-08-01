import React from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Plus, X, Folder, Edit2, Trash2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { isSavedFolderName } from '../../lib/folderGuards';

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
  title = 'Folders',
  allItemLabel = 'All Items',
  allItemIcon,
}) => {
  return (
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

            <div className="space-y-2">
              <button
                onClick={() => {
                  setCurrentFolder(null);
                  onClose();
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all',
                  currentFolder === null
                    ? 'bg-text/10 text-text font-bold'
                    : 'text-text/60 hover:bg-white/5'
                )}
              >
                {allItemIcon && (
                  <span className="h-5 w-5 shrink-0 flex items-center justify-center">
                    {allItemIcon}
                  </span>
                )}
                {allItemLabel}
                <span className="ml-auto text-[10px] opacity-40">{items.length}</span>
              </button>
              {folders.map((folder) => {
                const isEditing = editingFolder === folder;
                const isSavedFolder = isSavedFolderName(folder);
                return (
                  <div
                    key={folder}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all border border-transparent',
                      currentFolder === folder
                        ? 'bg-text/10 text-text font-bold'
                        : 'text-text/60 hover:bg-white/5'
                    )}
                  >
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
                        {folder.split(' ').length > 8
                          ? `${folder.split(' ').slice(0, 8).join(' ')}...`
                          : folder}
                      </button>
                    )}
                    <span className="text-[10px] opacity-40">
                      {items.filter((i) => i.folder === folder).length}
                    </span>
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
  );
};
