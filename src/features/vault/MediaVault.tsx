import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Video, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { createSHA256 } from 'hash-wasm';
import { useVaultStore } from '../../store/vaultStore';
import { encryptFileInWorker } from '../../lib/cryptoPrimitives';
import { useGlobalNavigationStore } from '../../store/globalNavigationStore';
import { logActivity } from '../../lib/activity';
import {
  exceedsUploadSizeLimit,
  getUploadSizeErrorMessage,
  FILE_TYPE_SUPPORT,
  PHOTO_FILE_INPUT_ACCEPT,
  VIDEO_FILE_INPUT_ACCEPT,
} from '../../lib/fileHandling';
import { getVaultItemPreviewUrl, vaultItemHasServerFileReference } from '../../lib/filePreview';
import { useVaultFolders } from '../../hooks/useVaultFolders';
import { useVaultItems } from '../../hooks/useVaultItems';
import { VaultLayout } from '../../components/layout/VaultLayout';
import { VaultItem } from '../../lib/storage';
import { LiveCaptureModal } from './components/LiveCaptureModal';
import {
  compressFileInWorker,
  generateBlurhashInWorker,
  stripExifInWorker,
} from '../../lib/mediaWorker';
import { stripExifInMemory } from '../../lib/mediaExifScrubber';

// Extracted components and utilities
import {
  getFileExtension,
  getMediaDimensions,
  normalizeMediaMimeType,
  GridDensity,
  MediaFilterType,
  MediaSortType,
  filterAndSortMedia,
} from './components/MediaVault/mediaUtils';
import { MediaFilters } from './components/MediaVault/MediaFilters';
import { MediaTimelineView } from './components/MediaVault/MediaTimelineView';
import { MediaBulkToolbar } from './components/MediaVault/MediaBulkToolbar';
import { MediaPreview } from './components/MediaVault/MediaPreview';
import { MediaInspectorDrawer } from './components/MediaVault/MediaInspectorDrawer';
import { preloadFFmpeg } from '../../lib/videoTranscoder';
import { computeBufferHash } from '../../lib/merkleTree';
import { vaultApi } from '../../api/vaultApi';

type FileWithWebkitPath = File & { webkitRelativePath?: string };

const readTopLevelFolderFromWebkitPath = (file: File): string | null => {
  const webkitPath = (file as FileWithWebkitPath).webkitRelativePath;
  if (!webkitPath) return null;
  const firstSegment = webkitPath.split('/')[0]?.trim();
  return firstSegment || null;
};

const toPositiveIntOrFallback = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

export const MediaVault: React.FC<{ type: 'photo' | 'video' }> = ({ type }) => {
  const items = useVaultStore((state) => state.items);
  const addItem = useVaultStore((state) => state.addItem);
  const removeItem = useVaultStore((state) => state.removeItem);
  const batchUpdateItems = useVaultStore((state) => state.batchUpdateItems);
  const togglePin = useVaultStore((state) => state.togglePin);
  const fetchItems = useVaultStore((state) => state.fetchItems);
  const pinningItemIds = useVaultStore((state) => state.pinningItemIds);
  const masterKey = useVaultStore((state) => state.masterKey);
  const rsaKeyPair = useVaultStore((state) => state.rsaKeyPair);
  const isMediaAutoplayEnabled = useVaultStore((state) => state.preferences.isMediaAutoplayEnabled);
  const isLowDataModeEnabled = useVaultStore((state) => state.preferences.isLowDataModeEnabled);
  const isNetworkAwareAutoplayEnabled = useVaultStore(
    (state) => state.preferences.isNetworkAwareAutoplayEnabled,
  );
  const isPerformanceHudEnabled = useVaultStore(
    (state) => state.preferences.isPerformanceHudEnabled,
  );
  const isLightweightPreviewModeEnabled = useVaultStore(
    (state) => state.preferences.isLightweightPreviewModeEnabled,
  );
  const isPhotoExifStripped = useVaultStore((state) => state.preferences.isPhotoExifStripped);

  const [isUploading, setIsUploading] = useState(false);
  const [isLiveRecordOpen, setIsLiveRecordOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<string | null>(null);
  const [activePreviewItem, setActivePreviewItem] = useState<string | null>(null);
  const [moveMenuOpenId, setMoveMenuOpenId] = useState<string | null>(null);
  const [inspectorItem, setInspectorItem] = useState<VaultItem | null>(null);

  // Gallery filters, sorting, density, and multi-selection state
  const [activeFilter, setActiveFilter] = useState<MediaFilterType>('all');
  const [activeSort, setActiveSort] = useState<MediaSortType>('date-desc');
  const [density, setDensity] = useState<GridDensity>(() => {
    try {
      const saved = localStorage.getItem(`vault_media_density_${type}`);
      if (saved === 'compact' || saved === 'standard' || saved === 'large' || saved === 'list') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'large';
  });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const lastSelectedIdRef = useRef<string | null>(null);

  const modalRef = useRef<HTMLDivElement | null>(null) as React.RefObject<HTMLDivElement>;
  const previewRafOneRef = useRef<number | null>(null);
  const previewRafTwoRef = useRef<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetFolder = useRef<string | null>(null);
  const targetItemId = useGlobalNavigationStore((state) => state.targetItemId);
  const setTargetItemId = useGlobalNavigationStore((state) => state.setTargetItemId);

  const handleDensityChange = (newDensity: GridDensity) => {
    setDensity(newDensity);
    try {
      localStorage.setItem(`vault_media_density_${type}`, newDensity);
    } catch {
      // ignore
    }
  };

  const cancelScheduledPreviewActivation = useCallback(() => {
    if (previewRafOneRef.current !== null) {
      window.cancelAnimationFrame(previewRafOneRef.current);
      previewRafOneRef.current = null;
    }
    if (previewRafTwoRef.current !== null) {
      window.cancelAnimationFrame(previewRafTwoRef.current);
      previewRafTwoRef.current = null;
    }
  }, []);

  const openPreview = useCallback((id: string) => {
    setPreviewItem(id);
    setActivePreviewItem(id);
  }, []);

  const closePreview = useCallback(() => {
    cancelScheduledPreviewActivation();
    setPreviewItem(null);
    setActivePreviewItem(null);
  }, [cancelScheduledPreviewActivation]);

  useEffect(() => {
    preloadFFmpeg();
  }, []);

  // Reusable folder and item hooks
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
  } = useVaultFolders(type);

  const { searchQuery, setSearchQuery, filteredItems } = useVaultItems(type, currentFolder);

  // Apply filters and sorting
  const processedItems = useMemo(
    () => filterAndSortMedia(filteredItems, activeFilter, activeSort),
    [filteredItems, activeFilter, activeSort],
  );

  // Selection toggle logic (with Shift-Click range support)
  const handleToggleSelect = useCallback(
    (id: string, shiftKey = false) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);

        if (shiftKey && lastSelectedIdRef.current) {
          const lastIdx = processedItems.findIndex((i) => i.id === lastSelectedIdRef.current);
          const currentIdx = processedItems.findIndex((i) => i.id === id);

          if (lastIdx !== -1 && currentIdx !== -1) {
            const start = Math.min(lastIdx, currentIdx);
            const end = Math.max(lastIdx, currentIdx);
            for (let i = start; i <= end; i++) {
              next.add(processedItems[i].id);
            }
            if (!isSelectionMode) setIsSelectionMode(true);
            return next;
          }
        }

        if (next.has(id)) {
          next.delete(id);
          if (next.size === 0 && isSelectionMode) {
            // Keep selection mode active if user wants or let them exit via button
          }
        } else {
          next.add(id);
          if (!isSelectionMode) setIsSelectionMode(true);
        }

        lastSelectedIdRef.current = id;
        return next;
      });
    },
    [processedItems, isSelectionMode],
  );

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(processedItems.map((i) => i.id)));
  }, [processedItems]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setIsSelectionMode(false);
    lastSelectedIdRef.current = null;
  }, []);

  const handleToggleSelectionMode = useCallback(() => {
    setIsSelectionMode((prev) => {
      if (prev) {
        setSelectedIds(new Set());
        lastSelectedIdRef.current = null;
        return false;
      }
      return true;
    });
  }, []);

  // Bulk Operations
  const handleBulkMove = useCallback(
    async (targetFolder: string | null) => {
      const selected = Array.from(selectedIds);
      if (selected.length === 0) return;

      const toastId = toast.loading(`Moving ${selected.length} items...`);
      try {
        const updates = selected.map((id) => ({
          id,
          updates: { folder: targetFolder || undefined },
        }));
        await batchUpdateItems(updates);
        toast.success(
          `Moved ${selected.length} items to ${targetFolder || (type === 'photo' ? 'All Photos' : 'All Videos')}`,
          { id: toastId },
        );
        logActivity({
          actionType: 'item_update',
          itemName: `${selected.length} ${type}s`,
          description: `Bulk moved to folder ${targetFolder || 'root'}`,
          status: 'success',
        });
        handleClearSelection();
      } catch (err) {
        toast.error('Failed to move items.', { id: toastId });
      }
    },
    [selectedIds, batchUpdateItems, type, handleClearSelection],
  );

  const handleBulkDelete = useCallback(async () => {
    const selected = Array.from(selectedIds);
    if (selected.length === 0) return;

    const toastId = toast.loading(`Deleting ${selected.length} items...`);
    let deletedCount = 0;

    try {
      for (const id of selected) {
        try {
          await removeItem(id);
          deletedCount++;
        } catch {
          // ignore individual deletion errors
        }
      }
      toast.success(`Deleted ${deletedCount} items from vault`, { id: toastId });
      logActivity({
        actionType: 'item_delete',
        itemName: `${deletedCount} ${type}s`,
        description: `Bulk deleted ${deletedCount} items`,
        status: 'success',
      });
      handleClearSelection();
    } catch (err) {
      toast.error('Failed to delete some items.', { id: toastId });
    }
  }, [selectedIds, removeItem, type, handleClearSelection]);

  const handleBulkPin = useCallback(
    async (pinState: boolean) => {
      const selected = Array.from(selectedIds);
      if (selected.length === 0) return;

      const toastId = toast.loading(
        `${pinState ? 'Pinning' : 'Unpinning'} ${selected.length} items...`,
      );
      try {
        const updates = selected.map((id) => ({
          id,
          updates: {
            isPinned: pinState,
            pinnedAt: pinState ? Date.now() : null,
          },
        }));
        await batchUpdateItems(updates);
        toast.success(`${pinState ? 'Pinned' : 'Unpinned'} ${selected.length} items`, {
          id: toastId,
        });
        handleClearSelection();
      } catch (err) {
        toast.error('Failed to update pin status.', { id: toastId });
      }
    },
    [selectedIds, batchUpdateItems, handleClearSelection],
  );

  const yieldToMainThread = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 0);
        }
      }),
    [],
  );

  const LARGE_MEDIA_DIRECT_UPLOAD_BYTES = 12 * 1024 * 1024;
  const MULTIPART_PARALLELISM = 2;
  const FILE_HASH_CHUNK_BYTES = 2 * 1024 * 1024;

  const getMultipartParallelism = useCallback((_fileSize: number) => {
    if (typeof navigator === 'undefined') {
      return MULTIPART_PARALLELISM;
    }

    const nav = navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean; downlink?: number };
      hardwareConcurrency?: number;
    };
    const connection = nav.connection;

    if (
      connection?.saveData ||
      connection?.effectiveType === 'slow-2g' ||
      connection?.effectiveType === '2g'
    ) {
      return 1;
    }

    // Keep concurrency capped to 2 to prevent RAM exhaustion and UI freezing
    return 2;
  }, []);

  const sha256Hex = useCallback(async (data: Uint8Array) => {
    const digestInput = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
    const digest = await crypto.subtle.digest('SHA-256', digestInput);
    const uint8 = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < uint8.length; i++) {
      hex += uint8[i].toString(16).padStart(2, '0');
    }
    return hex;
  }, []);

  const sha256FileHexChunked = useCallback(
    async (file: File, chunkSize: number) => {
      if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
        throw new Error('Invalid hash chunk size');
      }
      if (file.size === 0) {
        const emptyDigest = await crypto.subtle.digest('SHA-256', new Uint8Array(0));
        const uint8 = new Uint8Array(emptyDigest);
        let hex = '';
        for (let i = 0; i < uint8.length; i++) {
          hex += uint8[i].toString(16).padStart(2, '0');
        }
        return hex;
      }
      const hasher = await createSHA256();
      hasher.init();
      const totalParts = Math.ceil(file.size / chunkSize);
      for (let i = 0; i < totalParts; i += 1) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunkArrayBuffer = (await file.slice(start, end).arrayBuffer()) as ArrayBuffer;
        const chunkBuffer = new Uint8Array(chunkArrayBuffer);
        hasher.update(chunkBuffer);
        // Yield to main thread on each chunk to keep UI smooth and 60 FPS
        await yieldToMainThread();
      }
      return hasher.digest('hex');
    },
    [yieldToMainThread],
  );

  const supportedExtensions: string[] = Array.from(
    type === 'photo' ? FILE_TYPE_SUPPORT.photo : FILE_TYPE_SUPPORT.video,
  );

  const isSupportedMediaFile = (file: File) => {
    const extension = getFileExtension(file.name);

    const hasSupportedMime =
      type === 'photo'
        ? (file.type || '').startsWith('image/')
        : (file.type || '').startsWith('video/');

    return hasSupportedMime || supportedExtensions.includes(extension);
  };

  const previewedMedia = useMemo(
    () => processedItems.find((item) => item.id === activePreviewItem) ?? null,
    [processedItems, activePreviewItem],
  );

  const currentPreviewIndex = useMemo(() => {
    if (!previewItem) return -1;
    return processedItems.findIndex((item) => item.id === previewItem);
  }, [processedItems, previewItem]);

  const canPrevious = currentPreviewIndex > 0;
  const canNext = currentPreviewIndex >= 0 && currentPreviewIndex < processedItems.length - 1;

  const showPreviousMedia = useCallback(() => {
    if (processedItems.length === 0) return;
    if (canPrevious && currentPreviewIndex > 0) {
      const prevItem = processedItems[currentPreviewIndex - 1];
      if (prevItem) openPreview(prevItem.id);
    } else if (processedItems.length > 1) {
      const lastItem = processedItems[processedItems.length - 1];
      if (lastItem) openPreview(lastItem.id);
    }
  }, [canPrevious, processedItems, currentPreviewIndex, openPreview]);

  const showNextMedia = useCallback(() => {
    if (processedItems.length === 0) return;
    if (canNext && currentPreviewIndex < processedItems.length - 1) {
      const nextItem = processedItems[currentPreviewIndex + 1];
      if (nextItem) openPreview(nextItem.id);
    } else if (processedItems.length > 1) {
      const firstItem = processedItems[0];
      if (firstItem) openPreview(firstItem.id);
    }
  }, [canNext, processedItems, currentPreviewIndex, openPreview]);

  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null;
    touchEndY.current = null;
    if (e.targetTouches && e.targetTouches.length > 0) {
      touchStartX.current = e.targetTouches[0].clientX;
      touchStartY.current = e.targetTouches[0].clientY;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.targetTouches && e.targetTouches.length > 0) {
      touchEndX.current = e.targetTouches[0].clientX;
      touchEndY.current = e.targetTouches[0].clientY;
    }
  };

  const onTouchEnd = () => {
    if (
      touchStartX.current === null ||
      touchEndX.current === null ||
      touchStartY.current === null ||
      touchEndY.current === null
    )
      return;

    const distanceX = touchStartX.current - touchEndX.current;
    const distanceY = touchStartY.current - touchEndY.current;
    const minSwipeDistance = 75;

    if (Math.abs(distanceX) > Math.abs(distanceY)) {
      if (distanceX > minSwipeDistance && canNext) {
        showNextMedia();
      }
      if (distanceX < -minSwipeDistance && canPrevious) {
        showPreviousMedia();
      }
    }
  };

  useEffect(() => {
    if (!targetItemId) return;
    const target = processedItems.find((item) => item.id === targetItemId);
    if (!target) return;

    openPreview(target.id);
    setTargetItemId(null);
  }, [targetItemId, processedItems, setTargetItemId, openPreview]);

  const [isFloatingPreview, setIsFloatingPreview] = useState(false);

  useEffect(() => {
    if (!previewItem || activePreviewItem) return;
    const timer = window.setTimeout(() => {
      setActivePreviewItem(previewItem);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [previewItem, activePreviewItem]);

  useEffect(() => {
    if (previewItem && !isFloatingPreview) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [previewItem, isFloatingPreview]);

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
        showNextMedia();
      }

      if (e.key === 'ArrowLeft') {
        showPreviousMedia();
      }

      if (e.key === 'Escape') {
        closePreview();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    if (first) {
      try {
        first.focus({ preventScroll: true });
      } catch {
        first.focus();
      }
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewItem, closePreview, showNextMedia, showPreviousMedia]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
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
    if (!masterKey && !useVaultStore.getState().isDecoyMode) {
      toast.error('Encryption key missing');
      return;
    }

    setIsUploading(true);
    const total = files.length;
    let successCount = 0;
    let failedCount = 0;

    try {
      for (let index = 0; index < total; index += 1) {
        await yieldToMainThread();
        const file = files[index];
        if (!isSupportedMediaFile(file)) {
          toast.error(
            `This ${type} vault supports ${supportedExtensions.join(', ')} files. "${file.name}" was not uploaded.`,
          );
          failedCount++;
          continue;
        }
        if (exceedsUploadSizeLimit(file)) {
          toast.error(getUploadSizeErrorMessage(file));
          failedCount++;
          continue;
        }
        const toastId = toast.loading(`Preparing ${type} ${index + 1} of ${total}...`);

        try {
          const folderFromPath = readTopLevelFolderFromWebkitPath(file);
          const fileTargetFolder = folderFromPath || targetFolder;

          const shouldUseDirectLargeUpload =
            !useVaultStore.getState().isDecoyMode &&
            !isAlreadyEncrypted &&
            type !== 'photo' &&
            file.size >= LARGE_MEDIA_DIRECT_UPLOAD_BYTES;

          if (shouldUseDirectLargeUpload) {
            try {
              toast.loading(`Preparing multipart upload ${index + 1}/${total}...`, {
                id: toastId,
              });
              const resumeKey = `vault:multipart:${type}:${file.name}:${file.size}:${file.lastModified}`;
              let resumeUploadId: string | undefined;
              try {
                resumeUploadId = window.localStorage.getItem(resumeKey) || undefined;
              } catch {
                resumeUploadId = undefined;
              }

              const initResponse = await vaultApi.startMultipartUpload({
                category: 'video',
                folder: fileTargetFolder || null,
                fileName: file.name,
                mimeType: normalizeMediaMimeType(file, type),
                fileSize: file.size,
                resumeUploadId,
              });
              const multipartData = (initResponse as { data?: unknown })?.data as
                | {
                    uploadId?: unknown;
                    partSize?: unknown;
                    uploadedParts?: unknown;
                  }
                | undefined;
              const uploadId =
                typeof multipartData?.uploadId === 'string'
                  ? multipartData.uploadId.trim()
                  : String(multipartData?.uploadId || '');
              const partSize = toPositiveIntOrFallback(multipartData?.partSize, 4 * 1024 * 1024);
              const uploadedParts = new Set<number>(
                Array.isArray(multipartData?.uploadedParts)
                  ? multipartData.uploadedParts
                      .map((n: unknown) => Number(n))
                      .filter((n) => Number.isInteger(n) && n > 0)
                  : [],
              );
              if (!uploadId) {
                throw new Error('Multipart init did not return uploadId');
              }
              try {
                window.localStorage.setItem(resumeKey, uploadId);
              } catch {
                // ignore
              }

              const totalParts = Math.ceil(file.size / partSize);
              let completedParts = uploadedParts.size;
              let nextPartIndex = 0;
              const pendingPartIndexes = Array.from({ length: totalParts }, (_, i) => i).filter(
                (i) => !uploadedParts.has(i + 1),
              );
              const updateProgress = () => {
                const progress = Math.max(
                  0,
                  Math.min(100, Math.round((completedParts / Math.max(totalParts, 1)) * 100)),
                );
                toast.loading(`Uploading background ${index + 1}/${total}: ${progress}%...`, {
                  id: toastId,
                });
              };
              updateProgress();

              const partWorker = async () => {
                while (nextPartIndex < pendingPartIndexes.length) {
                  const cursor = nextPartIndex;
                  nextPartIndex += 1;
                  const partZeroBased = pendingPartIndexes[cursor];
                  const start = partZeroBased * partSize;
                  const end = Math.min(start + partSize, file.size);
                  const chunkBuffer = new Uint8Array(await file.slice(start, end).arrayBuffer());
                  const chunkHash = await sha256Hex(chunkBuffer);
                  await vaultApi.uploadMultipartPart(
                    uploadId,
                    partZeroBased + 1,
                    chunkBuffer,
                    chunkHash,
                  );
                  completedParts += 1;
                  updateProgress();
                  await yieldToMainThread();
                }
              };

              const parallelWorkers = Math.max(
                1,
                Math.min(getMultipartParallelism(file.size), pendingPartIndexes.length || 1),
              );

              await Promise.all(Array.from({ length: parallelWorkers }, () => partWorker()));

              await yieldToMainThread();
              const fullHash = await sha256FileHexChunked(file, FILE_HASH_CHUNK_BYTES);
              await vaultApi.completeMultipartUpload(uploadId, {
                fileSha256: fullHash,
                clientUpdatedAt: new Date().toISOString(),
              });
              try {
                window.localStorage.removeItem(resumeKey);
              } catch {
                // ignore
              }

              await fetchItems('manual');
              toast.success(`${file.name} uploaded successfully`, { id: toastId });
              logActivity({
                actionType: 'file_upload',
                itemName: file.name,
                description: `${type} uploaded (large direct mode)`,
                status: 'success',
              });
              successCount++;
              continue;
            } catch (multipartError) {
              const multipartStatus =
                typeof multipartError === 'object' && multipartError && 'status' in multipartError
                  ? Number((multipartError as { status?: unknown }).status ?? NaN)
                  : NaN;
              if (multipartStatus === 401 || multipartStatus === 403) {
                throw multipartError;
              }
              toast.loading(
                `Large upload optimization failed; using secure fallback upload ${index + 1}/${total}...`,
                { id: toastId },
              );
            }
          }

          let uploadFileObj = file;
          let blurhash: string | null = null;
          if (type === 'photo' && !isAlreadyEncrypted) {
            toast.loading(`Sanitizing & processing image in Web Worker ${index + 1}/${total}...`, {
              id: toastId,
            });
            if (isPhotoExifStripped) {
              try {
                uploadFileObj = await stripExifInWorker(uploadFileObj);
              } catch {
                const rawBuffer = await uploadFileObj.arrayBuffer();
                const cleanedBuffer = stripExifInMemory(rawBuffer, uploadFileObj.type);
                uploadFileObj = new File([cleanedBuffer], uploadFileObj.name, {
                  type: uploadFileObj.type || 'image/jpeg',
                  lastModified: uploadFileObj.lastModified,
                });
              }
            }
            uploadFileObj = await compressFileInWorker(uploadFileObj, 0.85);
            blurhash = await generateBlurhashInWorker(uploadFileObj);
            await yieldToMainThread();
          }

          await yieldToMainThread();
          const isDecoy = useVaultStore.getState().isDecoyMode;
          let encryptedData: Uint8Array;
          if (isDecoy || isAlreadyEncrypted || !masterKey) {
            encryptedData = new Uint8Array(await file.arrayBuffer());
          } else {
            encryptedData = await encryptFileInWorker(uploadFileObj, masterKey);
          }

          await yieldToMainThread();
          const dimensions = await getMediaDimensions(uploadFileObj, type);

          await yieldToMainThread();
          const blake3Hash = await computeBufferHash(encryptedData, 'blake3');
          const sha256Hash = await computeBufferHash(encryptedData, 'sha256');

          await addItem(
            {
              type: type === 'photo' ? 'photo' : 'video',
              title: file.name,
              content: encryptedData,
              folder: fileTargetFolder || undefined,
              metadata: {
                mimeType: normalizeMediaMimeType(uploadFileObj, type),
                size: uploadFileObj.size,
                extension: getFileExtension(file.name),
                width: dimensions?.width,
                height: dimensions?.height,
                aspectRatio: dimensions?.aspectRatio,
                duration: dimensions?.duration,
                blurhash: blurhash || undefined,
                sha256: sha256Hash,
                integrity: {
                  algorithm: 'blake3',
                  hash: blake3Hash,
                  verifiedAt: Date.now(),
                },
                isE2EE: true,
                clientEncrypted: true,
                isLiveCapture,
                ...additionalMetadata,
              },
            },
            (progress) => {
              toast.loading(`Finalizing ${index + 1}/${total}: ${progress}%...`, {
                id: toastId,
              });
            },
          );
          toast.success(`${file.name} uploaded & bound to Merkle Tree`, { id: toastId });
          successCount++;
        } catch (error) {
          console.error('Upload failed:', error);
          toast.error(`Failed to upload ${file.name}. Please try again.`, { id: toastId });
          logActivity({
            actionType: 'file_upload',
            itemName: file.name,
            description: `${type} upload failed`,
            status: 'failure',
          });
          failedCount++;
        }
      }
    } finally {
      setIsUploading(false);
      uploadTargetFolder.current = null;

      if (total > 1) {
        if (failedCount === 0) {
          toast.success(`All ${successCount} files uploaded successfully`);
        } else if (successCount === 0) {
          toast.error(`All ${failedCount} files failed to upload`);
        } else {
          toast.info(`${successCount} uploaded, ${failedCount} failed`);
        }
      }
    }
  };

  const handleDelete = useCallback(
    (id: string, title: string) => {
      if (!confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) return;
      removeItem(id);
      toast.success(`${title} removed from vault`);
      logActivity({
        actionType: 'item_delete',
        itemName: title,
        description: `${type} deleted from vault`,
        status: 'success',
      });
    },
    [removeItem, type],
  );

  const handleDownload = async (item: VaultItem) => {
    if (!masterKey && !useVaultStore.getState().isDecoyMode) {
      toast.error('Encryption key missing');
      return;
    }

    const toastId = toast.loading('Preparing download...');

    try {
      // 1. If it's a server-backed item, use direct signed download URL for zero-RAM browser streaming download
      if (vaultItemHasServerFileReference(item)) {
        try {
          const { getSignedUrl } = await import('../../lib/sync/media');
          const downloadUrl = await getSignedUrl(item.id, 'download');
          if (downloadUrl) {
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = item.title || 'download';
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success(`Downloaded ${item.title}`, { id: toastId });
            return;
          }
        } catch {
          // fallback to client-side decrypt path
        }
      }

      // 2. Client-side E2EE decryption
      let fileUrl: string | null = await getVaultItemPreviewUrl(
        item,
        masterKey,
        item.metadata?.mimeType,
        rsaKeyPair?.privateKey ?? undefined,
      );

      if (!fileUrl) throw new Error('Decryption failed');

      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = item.title || 'download';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Downloaded ${item.title}`, { id: toastId });
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Download failed. Try again.', { id: toastId });
    }
  };

  const handlePreview = useCallback(
    (id: string, title: string) => {
      if (!masterKey && !useVaultStore.getState().isDecoyMode) {
        toast.error('Encryption key missing');
        return;
      }
      openPreview(id);
      logActivity({
        actionType: 'file_preview',
        itemName: title,
        description: `${type} preview opened`,
        status: 'success',
      });
    },
    [masterKey, type, openPreview],
  );

  return (
    <VaultLayout
      title={`${type}s`}
      description={
        currentFolder
          ? `${type.charAt(0).toUpperCase() + type.slice(1)}s in album "${currentFolder}"`
          : `Securely encrypted ${type} storage.`
      }
      items={items.filter((i) => i.type === type)}
      itemTypeLabel={type}
      allItemLabel={`All ${type.charAt(0).toUpperCase() + type.slice(1)}s`}
      onUpload={(folder?: string | null) => {
        uploadTargetFolder.current = folder ?? currentFolder;
        fileInputRef.current?.click();
      }}
      onFileDrop={(files, folder) => handleUploadFiles(files, folder ?? currentFolder)}
      onLiveRecord={() => setIsLiveRecordOpen(true)}
      isUploading={isUploading}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      folders={folders}
      currentFolder={currentFolder}
      onFolderSelect={setCurrentFolder}
      sidebarIcon={type === 'photo' ? ImageIcon : Video}
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
        type="file"
        ref={fileInputRef}
        multiple
        onChange={handleUpload}
        className="hidden"
        accept={type === 'photo' ? PHOTO_FILE_INPUT_ACCEPT : VIDEO_FILE_INPUT_ACCEPT}
      />

      <LiveCaptureModal
        isOpen={isLiveRecordOpen}
        onClose={() => setIsLiveRecordOpen(false)}
        type={type}
        onCapture={async (file, isEncrypted, additionalMetadata) => {
          await handleUploadFiles([file], currentFolder, isEncrypted, true, additionalMetadata);
        }}
      />

      {/* Filter Chips, Sort, Density Switcher & Batch Mode Toggle */}
      <MediaFilters
        type={type}
        totalCount={filteredItems.length}
        filteredCount={processedItems.length}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        activeSort={activeSort}
        onSortChange={setActiveSort}
        density={density}
        onDensityChange={handleDensityChange}
        isSelectionMode={isSelectionMode}
        onToggleSelectionMode={handleToggleSelectionMode}
        selectedCount={selectedIds.size}
      />

      {/* Gallery Timeline & Adaptive Infinite Scrolling Grid / List */}
      {processedItems.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 opacity-40 cursor-pointer hover:opacity-70 transition-opacity"
          onClick={() => {
            uploadTargetFolder.current = currentFolder;
            fileInputRef.current?.click();
          }}
        >
          {type === 'photo' ? (
            <ImageIcon className="mb-4 h-16 w-16" />
          ) : (
            <Video className="mb-4 h-16 w-16" />
          )}
          <p className="text-lg">No {type}s found.</p>
        </div>
      ) : (
        <MediaTimelineView
          items={processedItems}
          type={type}
          masterKey={masterKey}
          density={density}
          selectedIds={selectedIds}
          isSelectionMode={isSelectionMode}
          onToggleSelect={handleToggleSelect}
          previewItem={previewItem}
          moveMenuOpenId={moveMenuOpenId}
          folders={folders}
          onPreview={handlePreview}
          onMoveMenuToggle={setMoveMenuOpenId}
          onMoveToFolder={handleMoveToFolder}
          onDownload={handleDownload}
          onDelete={handleDelete}
          onTogglePin={(id) => void togglePin(id)}
          onOpenInspector={(item) => setInspectorItem(item)}
          pinningItemIds={pinningItemIds}
          lightweightPreviewMode={isLightweightPreviewModeEnabled}
        />
      )}

      {/* Multi-Selection Bulk Actions Toolbar */}
      <MediaBulkToolbar
        selectedIds={selectedIds}
        allItems={processedItems}
        folders={folders}
        type={type}
        masterKey={masterKey}
        rsaPrivateKey={rsaKeyPair?.privateKey}
        onClearSelection={handleClearSelection}
        onSelectAll={handleSelectAll}
        onBulkMove={handleBulkMove}
        onBulkDelete={handleBulkDelete}
        onBulkPin={handleBulkPin}
      />

      {/* Enhanced Lightbox Preview Modal */}
      <MediaPreview
        previewItem={previewItem}
        previewedMedia={previewedMedia}
        isPreparingPreview={Boolean(previewItem && !activePreviewItem)}
        masterKey={masterKey}
        type={type}
        isMediaAutoplayEnabled={isLightweightPreviewModeEnabled ? false : isMediaAutoplayEnabled}
        isLowDataModeEnabled={isLowDataModeEnabled}
        isNetworkAwareAutoplayEnabled={isNetworkAwareAutoplayEnabled}
        isPerformanceHudEnabled={isPerformanceHudEnabled}
        canPrevious={canPrevious}
        canNext={canNext}
        onClose={closePreview}
        onPrevious={showPreviousMedia}
        onNext={showNextMedia}
        onDownload={handleDownload}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        modalRef={modalRef}
        allItems={processedItems}
        onSelectMedia={openPreview}
        onFloatingChange={setIsFloatingPreview}
      />

      {/* Standalone Inspector Drawer (from card menu) */}
      <MediaInspectorDrawer
        item={inspectorItem}
        isOpen={Boolean(inspectorItem)}
        onClose={() => setInspectorItem(null)}
        type={type}
      />
    </VaultLayout>
  );
};
