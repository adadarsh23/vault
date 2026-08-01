import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import {
  Trash2,
  FileArchive,
  Download,
  X,
  Loader2,
  Package,
  FileCode,
  Box,
  Eye,
  AlertTriangle,
  Folder,
  Move,
  ChevronLeft,
  ChevronRight,
  Pin,
} from 'lucide-react';
import { toast } from 'sonner';
import { useVaultStore } from '../../store/vaultStore';
import { VaultItem } from '../../lib/storage';
import { encryptFile } from '../../lib/cryptoPrimitives';
import { motion, AnimatePresence } from 'framer-motion';
// import { Input } from '../../components/ui/Input';
import { GlobalNavigator } from '../../components/vault/GlobalNavigator';
import { useGlobalNavigationStore } from '../../store/globalNavigationStore';
import { logActivity } from '../../lib/activity';
import { useVaultFolders } from '../../hooks/useVaultFolders';
import { useVaultItems } from '../../hooks/useVaultItems';
import { VaultLayout } from '../../components/layout/VaultLayout';
import { cn } from '../../lib/utils';
import { getVaultItemFileUrl, getVaultItemPreviewUrl } from '../../lib/filePreview';
import { setDraggedVaultItem } from '../../lib/vaultDragDrop';
import { exceedsUploadSizeLimit, getUploadSizeErrorMessage } from '../../lib/fileHandling';

const SafeFilePreview: React.FC<{
  item: VaultItem;
  masterKey: string | CryptoKey;
  onDownload: () => void;
}> = ({ item, masterKey, onDownload }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const rsaKeyPair = useVaultStore((state) => state.rsaKeyPair);

  React.useEffect(() => {
    let isMounted = true;
    let activeObjectUrl: string | null = null;
    const decrypt = async () => {
      setErrorMessage(null);
      try {
        const result = await getVaultItemPreviewUrl(
          item,
          masterKey,
          item.metadata?.mimeType,
          rsaKeyPair?.privateKey
        );
        if (isMounted) {
          activeObjectUrl = result?.startsWith('blob:') ? result : null;
          setUrl(result);
        } else if (result?.startsWith('blob:')) {
          URL.revokeObjectURL(result);
        }
      } catch (e: any) {
        if (isMounted) setErrorMessage(e?.message || 'Decryption failed');
      }
    };
    decrypt();
    return () => {
      isMounted = false;
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    };
  }, [item.content, masterKey, rsaKeyPair]);

  const getFileIcon = (extension: string) => {
    switch (extension) {
      case 'ZIP':
      case 'RAR':
      case '7Z':
      case 'TAR':
      case 'GZ':
        return <FileArchive className="h-16 w-16 text-amber-400" />;
      case 'EXE':
      case 'MSI':
      case 'DMG':
      case 'APP':
        return <Box className="h-16 w-16 text-blue-400" />;
      case 'JS':
      case 'TS':
      case 'PY':
      case 'CPP':
      case 'HTML':
      case 'CSS':
        return <FileCode className="h-16 w-16 text-emerald-400" />;
      default:
        return <Package className="h-16 w-16 text-purple-400" />;
    }
  };

  if (errorMessage)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-12 text-white">
        <AlertTriangle className="h-12 w-12 text-red-400" />
        <p className="text-white/80 font-medium">{errorMessage}</p>
        <p className="text-xs text-white/40">Verify your master key and internet connection.</p>
      </div>
    );

  if (!url)
    return (
      <div className="flex h-full items-center justify-center animate-pulse">
        <Loader2 className="h-12 w-12 animate-spin text-text/10" />
      </div>
    );

  const extension = item.metadata?.extension || '';
  const isText =
    item.metadata?.mimeType?.startsWith('text/') ||
    ['JS', 'TS', 'PY', 'CPP', 'HTML', 'CSS', 'JSON'].includes(extension);

  if (isText) {
    return (
      <div className="h-full w-full overflow-hidden p-8">
        <iframe
          src={url}
          className="h-full w-full border-none rounded-xl bg-white/90"
          title="File Preview"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-12 text-center text-white">
      <div className="flex h-32 w-32 items-center justify-center rounded-3xl bg-white/5 shadow-inner">
        {getFileIcon(extension)}
      </div>
      <div>
        <h3 className="text-xl font-semibold text-white">{item.title}</h3>
        <p className="mt-2 text-white/40">No direct preview available for this file type.</p>
        <p className="text-xs text-white/20 mt-1">Type: {item.metadata?.mimeType || 'Unknown'}</p>
      </div>
      <Button
        onClick={onDownload}
        className="bg-amber-500 hover:bg-amber-600 text-white px-8 py-5 h-auto rounded-2xl shadow-lg shadow-amber-500/20"
      >
        <Download className="mr-2 h-4 w-4" />
        Download to View
      </Button>
    </div>
  );
};

export const OtherFilesVault: React.FC = () => {
  const items = useVaultStore((state) => state.items);
  const addItem = useVaultStore((state) => state.addItem);
  const removeItem = useVaultStore((state) => state.removeItem);
  const togglePin = useVaultStore((state) => state.togglePin);
  const pinningItemIds = useVaultStore((state) => state.pinningItemIds);
  const masterKey = useVaultStore((state) => state.masterKey);
  const allowRestrictedTypes = useVaultStore((state) => state.allowRestrictedTypes);
  const setAllowRestrictedTypes = useVaultStore((state) => state.setAllowRestrictedTypes);
  const [isUploading, setIsUploading] = useState(false);
  const [previewItem, setPreviewItem] = useState<string | null>(null);
  const [moveMenuOpenId, setMoveMenuOpenId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetFolder = useRef<string | null>(null);
  const targetItemId = useGlobalNavigationStore((state) => state.targetItemId);
  const setTargetItemId = useGlobalNavigationStore((state) => state.setTargetItemId);
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 8;
  const modalRef = useRef<HTMLDivElement>(null);

  const {
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
  } = useVaultFolders('file');

  const {
    searchQuery,
    setSearchQuery,
    filteredItems: filteredFiles,
  } = useVaultItems('file', currentFolder);

  useEffect(() => {
    setCurrentPage(0);
  }, [currentFolder, searchQuery]);

  const currentPreviewIndex = useMemo(() => {
    if (!previewItem) return -1;
    return filteredFiles.findIndex((item) => item.id === previewItem);
  }, [filteredFiles, previewItem]);

  const canPrevious = currentPreviewIndex > 0;
  const canNext = currentPreviewIndex >= 0 && currentPreviewIndex < filteredFiles.length - 1;

  const showPreviousFile = () => {
    if (canPrevious) setPreviewItem(filteredFiles[currentPreviewIndex - 1].id);
  };
  const showNextFile = () => {
    if (canNext) setPreviewItem(filteredFiles[currentPreviewIndex + 1].id);
  };

  useEffect(() => {
    if (!targetItemId) return;
    const target = items.find((item) => item.id === targetItemId && item.type === 'file');
    if (!target) return;

    setPreviewItem(target.id);
    setTargetItemId(null);
  }, [targetItemId, items, setTargetItemId]);

  const previewedFile = filteredFiles.find((item) => item.id === previewItem) || null;

  useEffect(() => {
    if (previewItem) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [previewItem]);

  useEffect(() => {
    if (!previewItem) return;

    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll(focusableSelectors);
    const first = focusableElements[0] as HTMLElement;
    const last = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }

      if (e.key === 'ArrowRight') {
        showNextFile();
      }

      if (e.key === 'ArrowLeft') {
        showPreviousFile();
      }

      if (e.key === 'Escape') {
        setPreviewItem(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    first?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewItem]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    await handleUploadFiles(files, uploadTargetFolder.current);
  };

  const handleUploadFiles = async (files: File[], targetFolder: string | null) => {
    if (!files.length || !masterKey) return;

    const harmfulTypes = [
      '.exe',
      '.dll',
      '.js',
      '.vbs',
      '.bat',
      '.cmd',
      '.sh',
      '.msi',
      '.scr',
      '.com',
    ];

    setIsUploading(true);
    const total = files.length;

    try {
      for (let index = 0; index < total; index += 1) {
        const file = files[index];
        if (exceedsUploadSizeLimit(file)) {
          toast.error(getUploadSizeErrorMessage(file));
          continue;
        }
        const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;

        if (harmfulTypes.includes(fileExtension) && !allowRestrictedTypes) {
          toast.error('Restricted file type detected', {
            description:
              'For security, executables and scripts are blocked by default. You can enable "Allow restricted types" in Settings.',
            action: {
              label: 'Enable Now',
              onClick: () => {
                setAllowRestrictedTypes(true);
                toast.info('Restricted types enabled globally.');
              },
            },
          });
          continue;
        }

        const toastId = toast.loading(`Encrypting file ${index + 1} of ${total}...`);
        try {
          const encryptedData = await encryptFile(file, masterKey);

          await addItem(
            {
              type: 'file',
              title: file.name,
              content: encryptedData,
              folder: targetFolder || undefined,
              metadata: {
                mimeType: file.type,
                size: file.size,
                extension: file.name.split('.').pop()?.toUpperCase() || 'FILE',
              },
            },
            (progress) => {
              toast.loading(`Uploading ${index + 1}/${total}: ${progress}%...`, {
                id: toastId,
              });
            }
          );
          toast.success(`${file.name} uploaded successfully`, { id: toastId });
        } catch (error) {
          toast.error(`Upload failed for ${file.name}`, { id: toastId });
          logActivity({
            actionType: 'file_upload',
            itemName: file.name,
            description: 'File upload failed',
            status: 'failure',
          });
        }
      }
    } finally {
      setIsUploading(false);
      uploadTargetFolder.current = null;
    }
  };

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;
    removeItem(id);
    toast.success(`${title} removed from vault`);
    logActivity({
      actionType: 'item_delete',
      itemName: title,
      description: 'file deleted from vault',
      status: 'success',
    });
  };

  const downloadFile = async (item: VaultItem) => {
    if (!masterKey) return;
    try {
      const fileUrl = await getVaultItemPreviewUrl(item, masterKey, item.metadata?.mimeType);
      if (!fileUrl) throw new Error('Decryption failed');

      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = item.title;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (!getVaultItemFileUrl(item)) {
        window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
      }
      toast.success(`Downloading ${item.title}`);
      logActivity({
        actionType: 'file_download',
        itemName: item.title,
        description: 'File decrypted and downloaded',
        status: 'success',
      });
    } catch (e) {
      toast.error('Download failed');
      logActivity({
        actionType: 'file_download',
        itemName: item.title,
        description: 'File download failed',
        status: 'failure',
      });
    }
  };

  const getFileIcon = (extension?: string) => {
    switch (extension) {
      case 'ZIP':
      case 'RAR':
      case '7Z':
      case 'TAR':
      case 'GZ':
        return <FileArchive className="h-12 w-12 text-amber-400" />;
      case 'EXE':
      case 'MSI':
      case 'DMG':
      case 'APP':
        return <Box className="h-12 w-12 text-blue-400" />;
      case 'JS':
      case 'TS':
      case 'PY':
      case 'CPP':
      case 'HTML':
      case 'CSS':
        return <FileCode className="h-12 w-12 text-emerald-400" />;
      default:
        return <Package className="h-12 w-12 text-purple-400" />;
    }
  };

  return (
    <VaultLayout
      title="Other Files"
      description={
        currentFolder
          ? `Files in folder "${currentFolder}"`
          : 'Securely store archives, scripts, and miscellaneous files.'
      }
      items={items.filter((i) => i.type === 'file')}
      itemTypeLabel="other"
      allItemLabel="All Files"
      onUpload={(folder?: string | null) => {
        uploadTargetFolder.current = folder ?? currentFolder;
        fileInputRef.current?.click();
      }}
      onFileDrop={(files, folder) => handleUploadFiles(files, folder ?? currentFolder)}
      isUploading={isUploading}
      uploadLabel="Upload File"
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      folders={folders}
      currentFolder={currentFolder}
      onFolderSelect={setCurrentFolder}
      sidebarIcon={Box}
      folderControls={{
        isAdding: isAddingFolder,
        setIsAdding: setIsAddingFolder,
        newName: newFolderName,
        setNewName: setNewFolderName,
        editing: editingFolder,
        setEditing: setEditingFolder,
        editingName: editingFolderName,
        setEditingName: setEditingFolderName,
        onCreate: handleCreateFolder,
        onRename: handleRenameFolder,
        onDelete: handleDeleteFolder,
      }}
      onMoveItemToFolder={handleMoveToFolder}
    >
      <input type="file" ref={fileInputRef} multiple onChange={handleUpload} className="hidden" />

      {filteredFiles.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 opacity-40 cursor-pointer hover:opacity-70 transition-opacity"
          onClick={() => {
            uploadTargetFolder.current = currentFolder;
            fileInputRef.current?.click();
          }}
        >
          <Package className="mb-4 h-16 w-16" />
          <p className="text-lg">No files found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-4 gap-8 pt-6 px-1 md:px-4">
          {filteredFiles
            .slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE)
            .map((item, idx) => (
              <motion.div
                layout
                key={item.id}
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                whileHover={{ y: -5, scale: 1.02 }}
                transition={{
                  delay: idx * 0.02,
                  type: 'spring',
                  stiffness: 300,
                  damping: 20,
                }}
                draggable
                onDragStartCapture={(event) => setDraggedVaultItem(event, item.id)}
                onTouchStartCapture={(event: React.TouchEvent) =>
                  setDraggedVaultItem(event as any, item.id)
                }
                onTouchMoveCapture={() => {
                  /* Allow custom touch drag logic */
                }}
                className="group relative"
                title="Drag to a folder to move this file"
              >
                <Card
                  className={cn(
                    'h-full border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-all rounded-2xl relative',
                    moveMenuOpenId === item.id ? 'z-50' : 'z-10'
                  )}
                >
                  <CardContent className="p-6">
                    <div className="flex flex-col items-center text-center">
                      <div className="mb-4 p-4 rounded-2xl bg-white/5 transition-transform group-hover:scale-105">
                        {getFileIcon(item.metadata?.extension)}
                      </div>
                      <h3 className="w-full truncate font-bold text-base mb-1">{item.title}</h3>
                      <div className="flex items-center gap-2 text-[10px] opacity-40">
                        <span>{((item.metadata?.size || 0) / (1024 * 1024)).toFixed(2)} MB</span>
                        {item.folder && (
                          <span className="flex items-center gap-1">
                            <Folder className="h-2 w-2" />
                            <span className="truncate" title={item.folder}>
                              {item.folder.length > 10
                                ? `${item.folder.slice(0, 10)}...`
                                : item.folder}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-between gap-2 border-t border-white/5 pt-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 flex-1 bg-white/5 hover:bg-white/10 text-[11px] gap-2 rounded-xl"
                        onClick={() => {
                          setPreviewItem(item.id);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                      </Button>

                      <div className="flex gap-1 relative">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-9 w-9 bg-white/5 hover:bg-white/10 rounded-xl',
                            moveMenuOpenId === item.id && 'bg-white/10'
                          )}
                          onClick={() =>
                            setMoveMenuOpenId(moveMenuOpenId === item.id ? null : item.id)
                          }
                        >
                          <Move className="h-3.5 w-3.5" />
                        </Button>

                        <AnimatePresence>
                          {moveMenuOpenId === item.id && (
                            <>
                              <div
                                className="fixed inset-0 z-[100]"
                                onClick={() => setMoveMenuOpenId(null)}
                              />
                              <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                className="absolute bottom-full right-0 mb-2 w-56 flex-col rounded-2xl border border-white/10 bg-black/90 p-1 backdrop-blur-xl z-[101] flex"
                              >
                                <p className="px-3 py-2 text-[9px] font-bold opacity-30 uppercase tracking-widest italic text-white">
                                  Move to Folder
                                </p>

                                <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2.5 mb-1 bg-white/[0.02] rounded-xl">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.15)]">
                                    <Package className="h-4 w-4" />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span
                                      className="truncate text-xs font-semibold text-white/95"
                                      title={item.title}
                                    >
                                      {item.title}
                                    </span>
                                    <span className="flex items-center gap-1 text-[9px] text-white/45">
                                      <span>Folder:</span>
                                      <span
                                        className="truncate max-w-[100px] font-medium text-purple-400"
                                        title={item.folder || 'Other Files'}
                                      >
                                        {item.folder || 'Other Files'}
                                      </span>
                                    </span>
                                  </div>
                                </div>

                                <div className="max-h-[108px] overflow-y-auto custom-scrollbar">
                                  <button
                                    className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/5 flex items-center gap-2 text-white transition-colors"
                                    onClick={() => {
                                      handleMoveToFolder(item.id, null);
                                      setMoveMenuOpenId(null);
                                    }}
                                  >
                                    <Package className="h-3 w-3 opacity-40" /> Other Files
                                  </button>
                                  {folders.map((f) => (
                                    <button
                                      key={f}
                                      title={f}
                                      className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/5 flex items-center gap-2 text-white transition-colors"
                                      onClick={() => {
                                        handleMoveToFolder(item.id, f);
                                        setMoveMenuOpenId(null);
                                      }}
                                    >
                                      <Folder className="h-3 w-3 opacity-40" />{' '}
                                      {f.length > 8 ? `${f.slice(0, 8)}...` : f}
                                    </button>
                                  ))}
                                </div>
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>

                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={pinningItemIds.includes(item.id)}
                          className={cn(
                            'h-9 w-9 rounded-xl transition-all',
                            item.isPinned
                              ? 'bg-slate-300/20 text-slate-300 hover:bg-slate-300/30 border border-slate-300/40'
                              : 'bg-white/5 hover:bg-white/10'
                          )}
                          onClick={() => void togglePin(item.id)}
                        >
                          {pinningItemIds.includes(item.id) ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Pin className={cn('h-3.5 w-3.5', item.isPinned && 'fill-current')} />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 bg-white/5 hover:bg-white/10 rounded-xl"
                          onClick={() => downloadFile(item)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 bg-white/5 hover:bg-red-500/10 text-red-400/60 hover:text-red-400 rounded-xl border border-red-500/10"
                          onClick={() => handleDelete(item.id, item.title)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
        </div>
      )}

      {filteredFiles.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-center gap-8 pb-32 mt-12">
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button
              variant="outline"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
              className="h-10 w-10 rounded-full border-white/10 bg-white/5 p-0 text-text/60 backdrop-blur-xl transition-all hover:border-white/30 hover:bg-white/10 hover:text-text disabled:opacity-10 disabled:cursor-not-allowed shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]"
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </motion.div>

          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-3 rounded-full bg-white/5 px-6 py-2 border border-white/5 backdrop-blur-md shadow-inner">
              <span className="text-lg font-bold text-text tabular-nums">{currentPage + 1}</span>
              <div className="h-4 w-[1px] bg-white/10" />
              <span className="text-sm font-medium text-text/40 tabular-nums">
                {Math.ceil(filteredFiles.length / ITEMS_PER_PAGE)}
              </span>
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-text/20 font-bold">
              Page
            </span>
          </div>

          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button
              variant="outline"
              disabled={(currentPage + 1) * ITEMS_PER_PAGE >= filteredFiles.length}
              onClick={() => setCurrentPage((prev) => prev + 1)}
              className="h-10 w-10 rounded-full border-white/10 bg-white/5 p-0 text-text/60 backdrop-blur-xl transition-all hover:border-white/30 hover:bg-white/10 hover:text-text disabled:opacity-10 disabled:cursor-not-allowed shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {previewItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-4"
            ref={modalRef}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-6 top-6 z-50 text-white hover:bg-white/10 h-12 w-12 rounded-full"
              onClick={() => setPreviewItem(null)}
            >
              <X className="h-8 w-8" />
            </Button>

            <GlobalNavigator
              canPrevious={canPrevious}
              canNext={canNext}
              onPrevious={showPreviousFile}
              onNext={showNextFile}
              layout="overlay"
            />

            <div className="h-full w-full max-w-[95vw] lg:max-w-7xl flex flex-col pt-20">
              <div className="flex-1 overflow-hidden rounded-3xl bg-white/[0.02] border border-white/5">
                {previewedFile ? (
                  <SafeFilePreview
                    item={previewedFile}
                    masterKey={masterKey!}
                    onDownload={() => downloadFile(previewedFile)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-white/40">File not found.</p>
                  </div>
                )}
              </div>

              {/*{previewedFile && (
                <div className="mt-6 flex items-center justify-between px-2">
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wider opacity-30 font-bold mb-1">Modified</span>
                      <div className="flex items-center gap-2 text-sm text-white/60">
                        <Clock className="h-3.5 w-3.5 text-amber-500/40" />
                        {new Date(previewedFile.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wider opacity-30 font-bold mb-1">Security</span>
                      <div className="flex items-center gap-2 text-sm text-emerald-400">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        AES-256 GCM
                      </div>
                    </div>
                  </div>
                  <Button onClick={() => downloadFile(previewedFile)} className="bg-white/10 hover:bg-white/20 text-white border border-white/10 h-12 px-8 rounded-2xl">
                    <Download className="mr-2 h-4 w-4" />
                    Secure Download
                  </Button>
                </div>
              )}*/}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </VaultLayout>
  );
};
