import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  AudioLines,
  Download,
  Eye,
  Folder,
  Loader2,
  Move,
  Music,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  HardDrive,
  Pin,
  MessageSquareText,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { logger } from '../../lib/logger';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { AudioPlayer } from '../../components/ui/audio-player';
import { useVaultStore } from '../../store/vaultStore';
import { encryptFileInWorker } from '../../lib/cryptoPrimitives';
import {
  getVaultItemFileUrl,
  getVaultItemPreviewUrl,
  getVaultItemPreviewRevision,
  describeVaultPreviewError,
} from '../../lib/filePreview';
import { logActivity } from '../../lib/activity';
import { useVaultFolders } from '../../hooks/useVaultFolders';
import { useVaultItems } from '../../hooks/useVaultItems';
import { VaultLayout } from '../../components/layout/VaultLayout';
import { GlobalNavigator } from '../../components/vault/GlobalNavigator';
import { cn } from '../../lib/utils';
import { useGlobalNavigationStore } from '../../store/globalNavigationStore';
import { VaultItem } from '../../lib/storage';
import { setDraggedVaultItem, clearDraggedVaultItem } from '../../lib/vaultDragDrop';
import { LiveCaptureModal } from './components/LiveCaptureModal';
import {
  exceedsUploadSizeLimit,
  getUploadSizeErrorMessage,
  AUDIO_FILE_INPUT_ACCEPT,
  getAudioMimeType,
  isAudioExtension,
} from '../../lib/fileHandling';

const SafeAudioPreview: React.FC<{
  item: VaultItem;
  masterKey: string | CryptoKey;
  compact?: boolean;
}> = ({ item, masterKey, compact }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const rsaKeyPair = useVaultStore((state) => state.rsaKeyPair);
  const isAudioWaveformEnabled = useVaultStore((state) => state.preferences.isAudioWaveformEnabled);
  const currentBlobUrlRef = useRef<string | null>(null);

  const revisionKey = useMemo(() => getVaultItemPreviewRevision(item), [item]);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  const handleRetry = () => {
    if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    setUrl(null);
    setErrorMessage(null);
    setIsLoading(true);
    setRetryTrigger((prev) => prev + 1);
  };

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const metadata =
          typeof item.metadata === 'string'
            ? (() => {
                try {
                  return JSON.parse(item.metadata);
                } catch {
                  return null;
                }
              })()
            : item.metadata;
        const mime = metadata?.mimeType || getAudioMimeType(item.title);

        const result = await getVaultItemPreviewUrl(item, masterKey, mime, rsaKeyPair?.privateKey);
        if (!isMounted) {
          if (result && result.startsWith('blob:')) {
            URL.revokeObjectURL(result);
          }
          return;
        }

        if (!result) {
          setErrorMessage('Audio preview is unavailable. The file may be missing or corrupted.');
          return;
        }

        if (
          currentBlobUrlRef.current &&
          currentBlobUrlRef.current !== result &&
          currentBlobUrlRef.current.startsWith('blob:')
        ) {
          URL.revokeObjectURL(currentBlobUrlRef.current);
        }

        if (result.startsWith('blob:')) {
          currentBlobUrlRef.current = result;
        } else {
          currentBlobUrlRef.current = null;
        }

        setUrl(result);
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(describeVaultPreviewError(err));
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void load();

    return () => {
      isMounted = false;
      if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, [revisionKey, masterKey, rsaKeyPair, retryTrigger, item.id]);

  useEffect(() => {
    const handlePanicLock = () => {
      if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
      setUrl(null);
      setIsLoading(false);
    };

    window.addEventListener('vault:panic-lock', handlePanicLock);
    return () => {
      window.removeEventListener('vault:panic-lock', handlePanicLock);
      if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6 bg-white/5 animate-pulse rounded-2xl">
        <Loader2 className="h-6 w-6 animate-spin text-text/20" />
      </div>
    );
  }

  if (errorMessage || !url) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center bg-red-400/10 rounded-2xl border border-red-400/20 gap-2">
        <AlertTriangle className="h-5 w-5 text-red-400/80 mb-1" />
        <span className="text-xs text-red-400 font-medium leading-relaxed">
          {errorMessage || 'Audio preview unavailable'}
        </span>
        <Button
          onClick={handleRetry}
          size="sm"
          className="mt-2 bg-red-400/20 hover:bg-red-400/30 text-red-300 border border-red-400/30 text-xs px-3 py-1"
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <AudioPlayer
        src={url}
        title={item.title}
        initialVoiceClarityPreset={item.metadata?.voiceClarityPreset}
        isWaveformEnabled={isAudioWaveformEnabled}
        compact={compact}
        fileSize={typeof item.metadata?.size === 'number' ? item.metadata.size : undefined}
        className={cn(
          'max-w-none border-none bg-transparent shadow-none backdrop-blur-none',
          compact ? 'p-1 sm:p-2' : 'p-1 sm:p-3 md:p-4',
        )}
      />
      {item.metadata?.transcript && !compact && (
        <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-3 sm:p-4 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300 min-w-0">
              <MessageSquareText className="h-4 w-4 text-cyan-400 shrink-0" />
              <span className="truncate">Encrypted Speech Transcript</span>
              {item.metadata?.voiceClarityPreset && (
                <span className="ml-1 sm:ml-2 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] text-cyan-300 shrink-0">
                  DSP: {String(item.metadata.voiceClarityPreset).toUpperCase()}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const transcript = item.metadata?.transcript;
                if (!transcript) return;
                if (navigator.clipboard?.writeText) {
                  navigator.clipboard
                    .writeText(transcript)
                    .then(() => {
                      setCopiedTranscript(true);
                      toast.success('Transcript copied to clipboard');
                      setTimeout(() => setCopiedTranscript(false), 2000);
                    })
                    .catch((err) => {
                      logger.warn('Failed to copy transcript to clipboard', { error: err });
                      toast.error('Failed to copy transcript');
                    });
                } else {
                  toast.error('Clipboard not supported on this device');
                }
              }}
              className="h-7 px-2 text-xs text-cyan-300 hover:bg-cyan-500/20 shrink-0"
            >
              {copiedTranscript ? (
                <>
                  <Check className="h-3 w-3 mr-1 text-emerald-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  Copy Transcript
                </>
              )}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-white/80 font-sans whitespace-pre-wrap select-text max-h-40 sm:max-h-48 overflow-y-auto custom-scrollbar">
            {item.metadata.transcript}
          </p>
        </div>
      )}
    </div>
  );
};

export const AudioVault: React.FC = () => {
  const items = useVaultStore((state) => state.items);
  const addItem = useVaultStore((state) => state.addItem);
  const removeItem = useVaultStore((state) => state.removeItem);
  const togglePin = useVaultStore((state) => state.togglePin);
  const pinningItemIds = useVaultStore((state) => state.pinningItemIds);
  const masterKey = useVaultStore((state) => state.masterKey);
  const rsaKeyPair = useVaultStore((state) => state.rsaKeyPair);
  const isInlineMediaPreviewEnabled = useVaultStore(
    (state) => state.preferences.isInlineMediaPreviewEnabled,
  );
  const isAudioWaveformEnabled = useVaultStore((state) => state.preferences.isAudioWaveformEnabled);
  const [isUploading, setIsUploading] = useState(false);
  const [isLiveRecordOpen, setIsLiveRecordOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<string | null>(null);
  const [moveMenuOpenId, setMoveMenuOpenId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetFolder = useRef<string | null>(null);
  const ITEMS_PER_PAGE = 8;

  const isSupportedAudioFile = (file: File) => {
    const extension = file.name.split('.').pop() || '';
    return (file.type || '').startsWith('audio/') || isAudioExtension(extension);
  };
  const isLiveCaptureItem = (value: unknown) =>
    value === true || value === 'true' || value === 1 || value === '1';
  const targetItemId = useGlobalNavigationStore((state) => state.targetItemId);
  const setTargetItemId = useGlobalNavigationStore((state) => state.setTargetItemId);
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
  } = useVaultFolders('audio');

  const { searchQuery, setSearchQuery, filteredItems } = useVaultItems('audio', currentFolder);

  useEffect(() => {
    setCurrentPage(0);
  }, [currentFolder, searchQuery]);

  useEffect(() => {
    if (!targetItemId) return;
    const target = filteredItems.find((item) => item.id === targetItemId);
    if (!target) return;
    setPreviewItem(target.id);
    setTargetItemId(null);
  }, [targetItemId, filteredItems, setTargetItemId]);

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

  const previewedAudio = useMemo(
    () => filteredItems.find((item) => item.id === previewItem) ?? null,
    [filteredItems, previewItem],
  );

  const currentPreviewIndex = useMemo(() => {
    if (!previewItem) return -1;
    return filteredItems.findIndex((item) => item.id === previewItem);
  }, [filteredItems, previewItem]);

  const canPrevious = currentPreviewIndex > 0;
  const canNext = currentPreviewIndex >= 0 && currentPreviewIndex < filteredItems.length - 1;

  const handleClosePreview = () => {
    window.dispatchEvent(
      new CustomEvent('vault-audio-play', { detail: { playerId: '__stop_all__' } }),
    );
    setPreviewItem(null);
  };

  const showPreviousAudio = () => {
    if (canPrevious) {
      window.dispatchEvent(
        new CustomEvent('vault-audio-play', { detail: { playerId: '__stop_all__' } }),
      );
      setPreviewItem(filteredItems[currentPreviewIndex - 1].id);
    }
  };
  const showNextAudio = () => {
    if (canNext) {
      window.dispatchEvent(
        new CustomEvent('vault-audio-play', { detail: { playerId: '__stop_all__' } }),
      );
      setPreviewItem(filteredItems[currentPreviewIndex + 1].id);
    }
  };

  const showNextAudioRef = useRef(showNextAudio);
  showNextAudioRef.current = showNextAudio;
  const showPreviousAudioRef = useRef(showPreviousAudio);
  showPreviousAudioRef.current = showPreviousAudio;
  const handleClosePreviewRef = useRef(handleClosePreview);
  handleClosePreviewRef.current = handleClosePreview;

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
        showNextAudioRef.current();
      }

      if (e.key === 'ArrowLeft') {
        showPreviousAudioRef.current();
      }

      if (e.key === 'Escape') {
        handleClosePreviewRef.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    first?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewItem]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    try {
      await handleUploadFiles(files, uploadTargetFolder.current);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUploadFiles = async (
    files: File[],
    targetFolder: string | null,
    isAlreadyEncrypted = false,
    isLiveCapture = false,
    additionalMetadata?: Record<string, any>,
  ) => {
    if (!files.length) return;
    if (!masterKey && !useVaultStore.getState().isDecoyMode) return;

    setIsUploading(true);
    const validFiles: { file: File; targetFolder: string | null }[] = [];

    for (const file of files) {
      if (!isSupportedAudioFile(file)) {
        toast.error(`"${file.name}" is not a supported audio format and was skipped.`);
        continue;
      }
      if (exceedsUploadSizeLimit(file)) {
        toast.error(getUploadSizeErrorMessage(file));
        continue;
      }
      const folderFromPath = (file as any).webkitRelativePath
        ? (file as any).webkitRelativePath.split('/')[0]
        : null;
      validFiles.push({ file, targetFolder: folderFromPath || targetFolder });
    }

    const total = validFiles.length;
    if (total === 0) {
      setIsUploading(false);
      uploadTargetFolder.current = null;
      return;
    }

    const batchToastId = toast.loading(
      total === 1 ? `Encrypting and uploading audio...` : `Uploading 0/${total} audio files...`,
    );

    let completedCount = 0;
    let successCount = 0;
    let failedCount = 0;

    const CONCURRENCY = Math.min(2, total);

    const yieldToMainThread = async () => {
      await new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      });
    };

    const processFile = async (item: { file: File; targetFolder: string | null }) => {
      const { file, targetFolder: itemFolder } = item;
      try {
        await yieldToMainThread();
        let encryptedData: Uint8Array;
        if (useVaultStore.getState().isDecoyMode || isAlreadyEncrypted || !masterKey) {
          encryptedData = new Uint8Array(await file.arrayBuffer());
        } else {
          encryptedData = await encryptFileInWorker(file, masterKey);
        }

        await yieldToMainThread();
        const resolvedMimeType =
          file.type && file.type !== 'application/octet-stream'
            ? file.type
            : getAudioMimeType(file.name);

        await addItem({
          type: 'audio',
          title: file.name,
          content: encryptedData,
          folder: itemFolder || undefined,
          metadata: {
            mimeType: resolvedMimeType,
            size: file.size,
            extension: file.name.split('.').pop()?.toUpperCase() || 'AUDIO',
            isE2EE: true,
            clientEncrypted: true,
            isLiveCapture,
            ...additionalMetadata,
          },
        });

        successCount++;
      } catch (error) {
        failedCount++;
        logActivity({
          actionType: 'file_upload',
          itemName: file.name,
          description: 'audio upload failed',
          status: 'failure',
        });
      } finally {
        completedCount++;
        if (total > 1) {
          toast.loading(
            `Uploading ${completedCount}/${total} audio files (${Math.round((completedCount / total) * 100)}%)...`,
            { id: batchToastId },
          );
        }
      }
    };

    try {
      const queue = [...validFiles];
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) {
            await processFile(item);
          }
        }
      });

      await Promise.all(workers);

      if (failedCount === 0) {
        toast.success(
          total === 1
            ? `${validFiles[0].file.name} uploaded successfully`
            : `Successfully uploaded ${successCount} audio files`,
          { id: batchToastId },
        );
      } else if (successCount > 0) {
        toast.warning(`Uploaded ${successCount} files, ${failedCount} failed`, {
          id: batchToastId,
        });
      } else {
        toast.error(`Failed to upload audio files`, { id: batchToastId });
      }
    } finally {
      setIsUploading(false);
      uploadTargetFolder.current = null;
    }
  };

  const handleDelete = (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;
    void removeItem(id);
    toast.success(`${title} removed from vault`);
  };

  const handleDownload = async (item: VaultItem) => {
    if (!masterKey && !useVaultStore.getState().isDecoyMode) return;
    try {
      const fileUrl = await getVaultItemPreviewUrl(
        item,
        masterKey,
        item.metadata?.mimeType,
        rsaKeyPair?.privateKey ?? undefined,
      );
      if (!fileUrl) throw new Error('Audio preview unavailable');

      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = item.title;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (!getVaultItemFileUrl(item) && fileUrl.startsWith('blob:')) {
        window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
      }

      toast.success(`Downloading ${item.title}`);
    } catch (downloadErr) {
      logger.error('Audio download failed', { error: downloadErr, itemId: item.id });
      toast.error('Audio download failed');
    }
  };

  return (
    <VaultLayout
      title="Audio"
      description={
        currentFolder
          ? `Audio in folder "${currentFolder}"`
          : 'Securely store voice notes, music, and audio files.'
      }
      items={items.filter((i) => i.type === 'audio')}
      itemTypeLabel="audio"
      allItemLabel="All Audio"
      onUpload={(folder?: string | null) => {
        uploadTargetFolder.current = folder ?? currentFolder;
        fileInputRef.current?.click();
      }}
      onFileDrop={(files, folder) => handleUploadFiles(files, folder ?? currentFolder)}
      onLiveRecord={() => setIsLiveRecordOpen(true)}
      isUploading={isUploading}
      uploadLabel="Upload Audio"
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      folders={folders}
      currentFolder={currentFolder}
      onFolderSelect={setCurrentFolder}
      sidebarIcon={AudioLines}
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
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept={AUDIO_FILE_INPUT_ACCEPT}
        onChange={handleUpload}
      />

      <LiveCaptureModal
        isOpen={isLiveRecordOpen}
        onClose={() => setIsLiveRecordOpen(false)}
        type="audio"
        onCapture={async (file, isEncrypted, additionalMetadata) => {
          await handleUploadFiles([file], currentFolder, isEncrypted, true, additionalMetadata);
        }}
      />

      {filteredItems.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 opacity-40 cursor-pointer hover:opacity-70 transition-opacity"
          onClick={() => {
            uploadTargetFolder.current = currentFolder;
            fileInputRef.current?.click();
          }}
        >
          <Music className="mb-4 h-16 w-16" />
          <p className="text-lg">No audio files found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 pt-6 xl:grid-cols-2">
          {filteredItems
            .slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE)
            .map((item, idx) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -4 }}
                transition={{ delay: idx * 0.03 }}
                draggable
                onDragStartCapture={(event) => setDraggedVaultItem(event, item.id)}
                onDragEnd={clearDraggedVaultItem}
                className={cn(
                  'group relative rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-transparent backdrop-blur-md',
                  moveMenuOpenId === item.id ? 'z-50' : 'z-10',
                )}
                title="Drag to a folder to move this audio file"
              >
                <div className="flex min-h-[180px] flex-col justify-between p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      {(!isInlineMediaPreviewEnabled || !isAudioWaveformEnabled) && (
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 relative">
                          <AudioLines className="h-7 w-7 text-cyan-400" />
                          {isLiveCaptureItem(item.metadata?.isLiveCapture) ? (
                            <div
                              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm shadow-md"
                              title="Live Capture"
                            >
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                            </div>
                          ) : (
                            <div
                              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/10 border border-blue-500/20 backdrop-blur-sm shadow-md"
                              title="Storage Upload"
                            >
                              <HardDrive className="h-3.5 w-3.5 text-blue-400" />
                            </div>
                          )}
                        </div>
                      )}
                      <h3 className="truncate text-base font-semibold text-white">{item.title}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/40">
                        <span>
                          {(((item.metadata?.size || 0) as number) / (1024 * 1024)).toFixed(2)} MB
                        </span>
                        {item.folder && (
                          <span className="flex max-w-full items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-cyan-300/80">
                            <Folder className="h-3 w-3 shrink-0" />
                            <span className="truncate" title={item.folder}>
                              {item.folder}
                            </span>
                          </span>
                        )}
                        {item.metadata?.voiceClarityPreset &&
                          item.metadata.voiceClarityPreset !== 'off' && (
                            <span className="flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300 border border-cyan-500/20">
                              <Sparkles className="h-2.5 w-2.5" />
                              Voice DSP
                            </span>
                          )}
                        {item.metadata?.transcript && (
                          <span
                            className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300 border border-emerald-500/20"
                            title={String(item.metadata.transcript)}
                          >
                            <MessageSquareText className="h-2.5 w-2.5" />
                            Transcript
                          </span>
                        )}
                      </div>
                      {item.metadata?.transcript && (
                        <p className="mt-2 text-xs text-white/70 italic line-clamp-1 border-l-2 border-cyan-400/50 pl-2 select-text">
                          "{item.metadata.transcript}"
                        </p>
                      )}
                    </div>
                    <div className="relative">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-10 w-10 bg-white/5 hover:bg-white/10 text-white',
                          moveMenuOpenId === item.id && 'bg-white/20',
                        )}
                        onClick={() =>
                          setMoveMenuOpenId(moveMenuOpenId === item.id ? null : item.id)
                        }
                      >
                        <Move className="h-4 w-4" />
                      </Button>
                      <AnimatePresence>
                        {moveMenuOpenId === item.id && (
                          <>
                            <div
                              className="fixed inset-0 z-[100]"
                              onClick={() => setMoveMenuOpenId(null)}
                            />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: 10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: 10 }}
                              className="absolute right-0 top-full z-[101] mt-2 flex w-56 max-w-[calc(100vw-32px)] flex-col rounded-2xl border border-white/10 bg-black/90 p-1 backdrop-blur-xl"
                            >
                              <p className="px-3 py-2 text-[9px] font-bold text-white/40 uppercase tracking-widest">
                                Move to Folder
                              </p>

                              <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2.5 mb-1 bg-white/[0.02] rounded-xl">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.15)]">
                                  <AudioLines className="h-4 w-4" />
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
                                      className="truncate max-w-[100px] font-medium text-cyan-400"
                                      title={item.folder || 'All Audio'}
                                    >
                                      {item.folder || 'All Audio'}
                                    </span>
                                  </span>
                                </div>
                              </div>

                              <div className="max-h-[100px] overflow-y-auto custom-scrollbar">
                                <button
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-white transition-colors hover:bg-white/5"
                                  onClick={() => {
                                    void handleMoveToFolder(item.id, null);
                                    setMoveMenuOpenId(null);
                                  }}
                                >
                                  <AudioLines className="h-3 w-3 opacity-40 text-cyan-400" />
                                  All Audio
                                </button>

                                {folders.map((folder) => (
                                  <button
                                    key={folder}
                                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-white transition-colors hover:bg-white/5"
                                    title={folder}
                                    onClick={() => {
                                      void handleMoveToFolder(item.id, folder);
                                      setMoveMenuOpenId(null);
                                    }}
                                  >
                                    <Folder className="h-3 w-3 opacity-40 text-cyan-400" />
                                    {folder.length > 8 ? `${folder.slice(0, 8)}...` : folder}
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {isInlineMediaPreviewEnabled ? (
                    <div className="rounded-2xl border border-white/5 bg-black/20">
                      <SafeAudioPreview item={item} masterKey={masterKey!} compact />
                    </div>
                  ) : (
                    <div className="flex min-h-[96px] items-center gap-4 rounded-2xl border border-white/5 bg-black/20 px-5 py-4 text-white/60">
                      <Music className="h-8 w-8 text-cyan-400/70" />
                      <div>
                        <p className="text-sm font-medium text-white">Inline preview disabled</p>
                        <p className="text-xs text-white/40">
                          Open the secure preview only when you need it.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="mt-5 flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 flex-1 bg-white/5 hover:bg-white/10 text-white"
                      onClick={() => {
                        setPreviewItem(item.id);
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Preview
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 bg-white/5 hover:bg-white/10 text-white"
                      onClick={() => void handleDownload(item)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={pinningItemIds.includes(item.id)}
                      className={cn(
                        'h-10 w-10 transition-all',
                        item.isPinned
                          ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-400/30'
                          : 'bg-white/5 hover:bg-white/10 text-white',
                      )}
                      onClick={() => void togglePin(item.id)}
                    >
                      {pinningItemIds.includes(item.id) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Pin className={cn('h-4 w-4', item.isPinned && 'fill-current')} />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 border border-red-500/10 bg-white/5 text-red-400/70 hover:bg-red-500/10 hover:text-red-400"
                      onClick={() => handleDelete(item.id, item.title)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
        </div>
      )}

      {filteredItems.length > ITEMS_PER_PAGE && (
        <div className="mt-12 flex items-center justify-center gap-8 pb-32">
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button
              variant="outline"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
              className="h-10 w-10 rounded-full border-white/10 bg-white/5 p-0 text-text/60 backdrop-blur-xl hover:border-white/30 hover:bg-white/10 hover:text-text disabled:cursor-not-allowed disabled:opacity-10"
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </motion.div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-3 rounded-full border border-white/5 bg-white/5 px-6 py-2 backdrop-blur-md shadow-inner">
              <span className="text-lg font-bold text-text tabular-nums">{currentPage + 1}</span>
              <div className="h-4 w-[1px] bg-white/10" />
              <span className="text-sm font-medium text-text/40 tabular-nums">
                {Math.ceil(filteredItems.length / ITEMS_PER_PAGE)}
              </span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-text/20">
              Page
            </span>
          </div>
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button
              variant="outline"
              disabled={(currentPage + 1) * ITEMS_PER_PAGE >= filteredItems.length}
              onClick={() => setCurrentPage((prev) => prev + 1)}
              className="h-10 w-10 rounded-full border-white/10 bg-white/5 p-0 text-text/60 backdrop-blur-xl hover:border-white/30 hover:bg-white/10 hover:text-text disabled:cursor-not-allowed disabled:opacity-10"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {previewItem && previewedAudio && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-3 sm:p-6 backdrop-blur-md overflow-y-auto"
            ref={modalRef}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 sm:right-6 sm:top-6 z-50 h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-white/10 sm:bg-white/5 hover:bg-white/20 text-white backdrop-blur-md"
              onClick={handleClosePreview}
              aria-label="Close preview"
            >
              <X className="h-5 w-5 sm:h-7 sm:w-7" />
            </Button>

            <GlobalNavigator
              canPrevious={canPrevious}
              canNext={canNext}
              onPrevious={showPreviousAudio}
              onNext={showNextAudio}
              layout="overlay"
            />

            <div className="relative w-full max-w-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-3xl border border-white/10 bg-black/90 backdrop-blur-2xl shadow-2xl overflow-hidden p-3.5 sm:p-6 md:p-8">
              <div className="mb-3.5 sm:mb-6 flex items-center justify-between gap-2 sm:gap-4 border-b border-white/10 pb-3 sm:pb-4 shrink-0">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-md">
                    <AudioLines className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2
                      className="truncate text-sm sm:text-base md:text-lg font-bold text-white"
                      title={previewedAudio.title}
                    >
                      {previewedAudio.title}
                    </h2>
                    <div className="mt-0.5 sm:mt-1 flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-white/40 overflow-hidden">
                      <span className="shrink-0">
                        {(((previewedAudio.metadata?.size || 0) as number) / (1024 * 1024)).toFixed(
                          2,
                        )}{' '}
                        MB
                      </span>
                      {previewedAudio.folder && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-1.5 sm:px-2 py-0.5 text-cyan-300 shrink-0 max-w-[85px] xs:max-w-[120px]">
                          <Folder className="h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                          <span className="truncate">{previewedAudio.folder}</span>
                        </span>
                      )}
                      {isLiveCaptureItem(previewedAudio.metadata?.isLiveCapture) && (
                        <span className="hidden xs:inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 sm:px-2 py-0.5 text-emerald-400 border border-emerald-500/20 shrink-0">
                          <ShieldCheck className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          Live
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 bg-white/5 hover:bg-white/10 text-white rounded-xl"
                    onClick={() => void handleDownload(previewedAudio)}
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pinningItemIds.includes(previewedAudio.id)}
                    className={cn(
                      'h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 transition-all rounded-xl',
                      previewedAudio.isPinned
                        ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-400/30'
                        : 'bg-white/5 hover:bg-white/10 text-white',
                    )}
                    onClick={() => void togglePin(previewedAudio.id)}
                    title={previewedAudio.isPinned ? 'Unpin' : 'Pin'}
                  >
                    {pinningItemIds.includes(previewedAudio.id) ? (
                      <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                    ) : (
                      <Pin
                        className={cn(
                          'h-3.5 w-3.5 sm:h-4 sm:w-4',
                          previewedAudio.isPinned && 'fill-current',
                        )}
                      />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 border border-red-500/10 bg-white/5 text-red-400/70 hover:bg-red-500/10 hover:text-red-400 rounded-xl"
                    onClick={() => {
                      handleDelete(previewedAudio.id, previewedAudio.title);
                      handleClosePreview();
                    }}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                </div>
              </div>

              <div className="overflow-y-auto custom-scrollbar flex-1 pr-1 -mr-1">
                <SafeAudioPreview item={previewedAudio} masterKey={masterKey!} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </VaultLayout>
  );
};
