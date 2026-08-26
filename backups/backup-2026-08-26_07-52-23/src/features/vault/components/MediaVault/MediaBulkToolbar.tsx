import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderInput,
  Download,
  Pin,
  Trash2,
  X,
  CheckSquare,
  Square,
  Loader2,
  Folder,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { VaultItem } from '../../../../lib/storage';
import { cn } from '../../../../lib/utils';
import { createZipBlob, triggerBlobDownload } from './mediaZipUtils';
import { getVaultItemPreviewUrl } from '../../../../lib/filePreview';
import { revokeBlobUrl } from '../../../../lib/blobRegistry';
import { toast } from 'sonner';
import { useVaultStore } from '../../../../store/vaultStore';

interface MediaBulkToolbarProps {
  selectedIds: Set<string>;
  allItems: VaultItem[];
  folders: string[];
  type: 'photo' | 'video';
  masterKey: string | CryptoKey | null;
  rsaPrivateKey?: CryptoKey | null;
  onClearSelection: () => void;
  onSelectAll: () => void;
  onBulkMove: (folder: string | null) => Promise<void>;
  onBulkDelete: () => Promise<void>;
  onBulkPin: (pinState: boolean) => Promise<void>;
}

export const MediaBulkToolbar: React.FC<MediaBulkToolbarProps> = ({
  selectedIds,
  allItems,
  folders,
  type,
  masterKey,
  rsaPrivateKey,
  onClearSelection,
  onSelectAll,
  onBulkMove,
  onBulkDelete,
  onBulkPin,
}) => {
  const [isMoveMenuOpen, setIsMoveMenuOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const selectedCount = selectedIds.size;
  if (selectedCount === 0) return null;

  const isAllSelected = selectedCount === allItems.length && allItems.length > 0;
  const selectedItems = allItems.filter((i) => selectedIds.has(i.id));

  // Determine whether mostly pinned or unpinned
  const pinnedCount = selectedItems.filter((i) => i.isPinned).length;
  const shouldPin = pinnedCount < selectedCount;

  const handleDownloadZip = async () => {
    if (!masterKey && !useVaultStore.getState().isDecoyMode) {
      toast.error('Encryption key missing');
      return;
    }

    setIsDownloading(true);
    const toastId = toast.loading(`Decrypting ${selectedCount} files for ZIP download...`);

    try {
      const zipFiles: { name: string; data: Uint8Array; lastModified?: Date }[] = [];
      let processed = 0;

      for (const item of selectedItems) {
        processed++;
        toast.loading(`Decrypting file ${processed}/${selectedCount}: ${item.title}...`, {
          id: toastId,
        });

        try {
          const previewUrl = await getVaultItemPreviewUrl(
            item,
            masterKey,
            item.metadata?.mimeType,
            rsaPrivateKey || undefined,
          );

          if (!previewUrl) continue;

          let fileBuffer: ArrayBuffer;
          try {
            if (previewUrl.startsWith('blob:') || previewUrl.startsWith('data:')) {
              const resp = await fetch(previewUrl);
              fileBuffer = await resp.arrayBuffer();
            } else {
              const resp = await fetch(previewUrl, { credentials: 'include' });
              fileBuffer = await resp.arrayBuffer();
            }
          } finally {
            if (previewUrl.startsWith('blob:')) {
              revokeBlobUrl(previewUrl);
            }
          }

          zipFiles.push({
            name: item.title,
            data: new Uint8Array(fileBuffer),
            lastModified: item.createdAt ? new Date(item.createdAt) : new Date(),
          });
        } catch (itemErr) {
          console.warn(`Failed to prepare ${item.title} for zip:`, itemErr);
        }
      }

      if (zipFiles.length === 0) {
        toast.error('Could not decrypt any selected files.', { id: toastId });
        return;
      }

      toast.loading(`Packaging ${zipFiles.length} files into ZIP archive...`, { id: toastId });
      const zipBlob = await createZipBlob(zipFiles);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const zipFilename = `vault-${type}s-${timestamp}.zip`;

      triggerBlobDownload(zipBlob, zipFilename);
      toast.success(`Downloaded ${zipFiles.length} ${type}s in ${zipFilename}`, { id: toastId });
    } catch (err) {
      console.error('Bulk ZIP download failed:', err);
      toast.error('Failed to create ZIP download.', { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onBulkDelete();
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTogglePin = async () => {
    setIsPinning(true);
    try {
      await onBulkPin(shouldPin);
    } finally {
      setIsPinning(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="fixed left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)] w-auto flex items-center gap-1 sm:gap-2 rounded-full border border-white/20 bg-black/95 px-3 sm:px-4 py-1.5 sm:py-2 shadow-[0_16px_40px_rgba(0,0,0,0.9)] backdrop-blur-2xl text-white select-none justify-center shrink-0"
        style={{
          bottom: 'max(1rem, env(safe-area-inset-bottom, 1rem))',
        }}
      >
        {/* Count & Select/Deselect All Toggle */}
        <div className="flex items-center pr-1.5 sm:pr-2.5 border-r border-white/15 shrink-0">
          <button
            onClick={isAllSelected ? onClearSelection : onSelectAll}
            className="flex items-center gap-1 sm:gap-1.5 px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title={isAllSelected ? 'Deselect All' : 'Select All'}
          >
            {isAllSelected ? (
              <CheckSquare className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            ) : (
              <Square className="h-3.5 w-3.5 text-white/60 shrink-0" />
            )}
            <span className="font-bold text-xs tabular-nums">{selectedCount}</span>
            <span className="hidden sm:inline text-[10px] text-white/60 font-normal">sel</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          {/* Move to Album */}
          <div className="relative">
            <button
              onClick={() => setIsMoveMenuOpen(!isMoveMenuOpen)}
              className={cn(
                'flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors',
                isMoveMenuOpen
                  ? 'bg-blue-500/30 text-blue-300'
                  : 'text-white/80 hover:text-white hover:bg-white/10',
              )}
              title="Move selected items to album"
            >
              <FolderInput className="h-4 w-4 text-blue-400 shrink-0" />
              <span className="hidden md:inline text-[11px]">Move</span>
            </button>

            <AnimatePresence>
              {isMoveMenuOpen && (
                <>
                  {/* Backdrop scrim on mobile for easy tap-away dismissal */}
                  <div
                    className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm sm:bg-transparent"
                    onClick={() => setIsMoveMenuOpen(false)}
                  />

                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="fixed sm:absolute bottom-16 sm:bottom-full left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 sm:mb-2 w-56 sm:w-60 rounded-2xl border border-white/20 bg-black/95 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-2xl z-50 flex flex-col gap-0.5 text-white"
                  >
                    <div className="px-3 py-1.5 text-[10px] font-bold text-white/50 uppercase tracking-widest border-b border-white/10 flex items-center justify-between">
                      <span>Move {selectedCount} items to</span>
                      <FolderInput className="h-3 w-3 text-blue-400" />
                    </div>
                    <div className="max-h-48 overflow-y-auto custom-scrollbar">
                      <button
                        onClick={() => {
                          setIsMoveMenuOpen(false);
                          void onBulkMove(null);
                        }}
                        className="w-full rounded-xl px-2.5 py-1.5 text-left text-xs text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                      >
                        <ImageIcon className="h-3.5 w-3.5 opacity-60 text-blue-400 shrink-0" />
                        <span className="truncate">
                          All {type === 'photo' ? 'Photos' : 'Videos'} (Root)
                        </span>
                      </button>
                      {folders.map((folder) => (
                        <button
                          key={folder}
                          onClick={() => {
                            setIsMoveMenuOpen(false);
                            void onBulkMove(folder);
                          }}
                          className="w-full rounded-xl px-2.5 py-1.5 text-left text-xs text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
                        >
                          <Folder className="h-3.5 w-3.5 opacity-60 text-blue-400 shrink-0" />
                          <span className="truncate">{folder}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Download ZIP */}
          <button
            onClick={handleDownloadZip}
            disabled={isDownloading}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-full text-xs text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-40 transition-colors"
            title="Download selected items as ZIP"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400 shrink-0" />
            ) : (
              <Download className="h-4 w-4 text-emerald-400 shrink-0" />
            )}
            <span className="hidden md:inline text-[11px]">ZIP</span>
          </button>

          {/* Pin / Favorite */}
          <button
            onClick={handleTogglePin}
            disabled={isPinning}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-full text-xs text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-40 transition-colors"
            title={shouldPin ? 'Pin selected items' : 'Unpin selected items'}
          >
            {isPinning ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-400 shrink-0" />
            ) : (
              <Pin
                className={cn('h-4 w-4 text-amber-400 shrink-0', shouldPin ? '' : 'fill-current')}
              />
            )}
            <span className="hidden md:inline text-[11px]">{shouldPin ? 'Pin' : 'Unpin'}</span>
          </button>

          {/* Delete */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-full text-xs text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors"
            title="Delete selected items"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline text-[11px]">Delete</span>
          </button>
        </div>

        {/* Clear / Dismiss Selection */}
        <div className="flex items-center pl-1 sm:pl-1.5 border-l border-white/15 shrink-0">
          <button
            onClick={onClearSelection}
            className="flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Clear selection"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5 shrink-0" />
          </button>
        </div>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-5 sm:p-6 shadow-2xl text-white"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
                  <Trash2 className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold">Delete {selectedCount} items?</h3>
                  <p className="text-xs text-white/60">This action cannot be undone.</p>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-white"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="rounded-xl bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 shadow-lg shadow-red-600/30"
                >
                  {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Delete {selectedCount} Items</span>
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
