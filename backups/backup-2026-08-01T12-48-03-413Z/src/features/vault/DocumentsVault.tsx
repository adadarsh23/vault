import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import {
  Trash2,
  Eye,
  X,
  Loader2,
  AlertTriangle,
  Folder,
  Download,
  ChevronLeft,
  ChevronRight,
  Move,
  FilePlus,
  Pin,
} from 'lucide-react';
import { toast } from 'sonner';
import { useVaultStore } from '../../store/vaultStore';
import { VaultItem } from '../../lib/storage';
import { encryptFile } from '../../lib/cryptoPrimitives';
import { motion, AnimatePresence } from 'framer-motion';
import { GlobalNavigator } from '../../components/vault/GlobalNavigator';
import { useGlobalNavigationStore } from '../../store/globalNavigationStore';
import { logActivity } from '../../lib/activity';
import {
  describeVaultPreviewError,
  getVaultItemFileUrl,
  getVaultItemPreviewRevision,
  getVaultItemPreviewUrl,
  vaultItemHasServerFileReference,
} from '../../lib/filePreview';
import { getSignedUrl } from '../../lib/sync';

import { useVaultFolders } from '../../hooks/useVaultFolders';
import { useVaultItems } from '../../hooks/useVaultItems';
import { VaultLayout } from '../../components/layout/VaultLayout';
import { cn } from '../../lib/utils';
import { setDraggedVaultItem } from '../../lib/vaultDragDrop';
import {
  exceedsUploadSizeLimit,
  getUploadSizeErrorMessage,
  FILE_TYPE_SUPPORT,
  DOCUMENT_FILE_INPUT_ACCEPT,
} from '../../lib/fileHandling';

interface SafeDocumentPreviewProps {
  item: VaultItem;
  masterKey: string | CryptoKey;
  onDownload: () => void;
}

const TEXT_EXTENSIONS = new Set([
  'TXT',
  'TEXT',
  'MD',
  'MARKDOWN',
  'RST',
  'ORG',
  'TEX',
  'LATEX',
  'CSV',
  'TSV',
  'PSV',
  'SSV',
  'LOG',
  'JSON',
  'JSONL',
  'NDJSON',
  'XML',
  'YAML',
  'YML',
  'TOML',
  'INI',
  'CONF',
  'CFG',
  'PROPERTIES',
  'SQL',
]);
const OFFICE_EXTENSIONS = new Set([
  'DOC',
  'DOCX',
  'DOCM',
  'DOT',
  'DOTX',
  'DOTM',
  'RTF',
  'ODT',
  'OTT',
  'WPD',
  'WPS',
  'XLS',
  'XLSX',
  'XLSM',
  'XLSB',
  'XLT',
  'XLTX',
  'XLTM',
  'ODS',
  'OTS',
  'PPT',
  'PPTX',
  'PPTM',
  'PPS',
  'PPSX',
  'POT',
  'POTX',
  'POTM',
  'ODP',
  'OTP',
]);
const IMAGE_EXTENSIONS = new Set([
  'PNG',
  'JPG',
  'JPEG',
  'JPE',
  'GIF',
  'WEBP',
  'SVG',
  'BMP',
  'TIF',
  'TIFF',
  'ICO',
  'HEIC',
  'HEIF',
  'AVIF',
]);
const AUDIO_EXTENSIONS = new Set([
  'MP3',
  'M4A',
  'AAC',
  'WAV',
  'WAVE',
  'FLAC',
  'ALAC',
  'WMA',
  'OGG',
  'OPUS',
  'WEBM',
  'AMR',
  'AIF',
  'AIFF',
  'MID',
  'MIDI',
]);
const VIDEO_EXTENSIONS = new Set([
  'MP4',
  'M4V',
  'MOV',
  'WEBM',
  'MKV',
  'AVI',
  'WMV',
  'MPEG',
  'MPG',
  'M2TS',
  'TS',
  '3GP',
  'FLV',
  'OGV',
]);
const SUPPORTED_DOCUMENT_EXTENSIONS = new Set<string>(
  FILE_TYPE_SUPPORT.document as readonly string[]
);

const SafeDocumentPreview: React.FC<SafeDocumentPreviewProps> = ({
  item,
  masterKey,
  onDownload,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mimeType = item.metadata?.mimeType || '';
  const extension = item.metadata?.extension || '';
  const isPdf = mimeType === 'application/pdf' || extension === 'PDF';
  const normalizedMimeType = mimeType.toLowerCase();
  const isImage = normalizedMimeType.startsWith('image/') || IMAGE_EXTENSIONS.has(extension);
  const isText = normalizedMimeType.startsWith('text/') || TEXT_EXTENSIONS.has(extension);
  const isOfficeDocument = OFFICE_EXTENSIONS.has(extension);
  const isAudio = normalizedMimeType.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension);
  const isVideo = normalizedMimeType.startsWith('video/') || VIDEO_EXTENSIONS.has(extension);
  const isLocalPreviewHost = url
    ? /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(url) ||
      url.startsWith('blob:') ||
      url.startsWith('data:')
    : false;
  const officePreviewUrl =
    url && !isLocalPreviewHost
      ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
      : null;

  const rsaKeyPair = useVaultStore((state) => state.rsaKeyPair);

  const previewRevision = useMemo(
    () => getVaultItemPreviewRevision(item),
    [
      item.id,
      item.updatedAt,
      item.content instanceof Uint8Array ? item.content.byteLength : 0,
      typeof item.content === 'string' ? item.content.length : 0,
      mimeType,
    ]
  );

  useEffect(() => {
    let isMounted = true;
    let activeObjectUrl: string | null = null;

    const loadPreview = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      setUrl(null);
      setTextContent('');

      try {
        const isServerStored = vaultItemHasServerFileReference(item);

        if (isServerStored && (isPdf || isOfficeDocument || isImage)) {
          const signedUrl = await getSignedUrl(item.id, 'view');
          if (!isMounted) return;
          setUrl(signedUrl);
          setIsLoading(false);
          return;
        }

        const result = await getVaultItemPreviewUrl(
          item,
          masterKey,
          mimeType || undefined,
          rsaKeyPair?.privateKey
        );
        if (!result) {
          throw new Error('Could not decrypt file for preview.');
        }

        if (!isMounted) {
          if (result.startsWith('blob:')) {
            URL.revokeObjectURL(result);
          }
          return;
        }

        activeObjectUrl = result.startsWith('blob:') ? result : null;
        setUrl(result);

        if (isText) {
          const response = await fetch(result);
          if (!response.ok) {
            throw new Error(`Could not read text preview (${response.status}).`);
          }

          const content = await response.text();
          if (isMounted) {
            setTextContent(content);
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('[SafeDocumentPreview]', err);
        }
        if (isMounted) {
          setErrorMessage(describeVaultPreviewError(err));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadPreview();

    return () => {
      isMounted = false;
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
      }
    };
  }, [
    previewRevision,
    masterKey,
    mimeType,
    isText,
    isPdf,
    isOfficeDocument,
    isImage,
    item,
    rsaKeyPair?.privateKey,
  ]);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-text/20" />
        <p className="text-sm text-text/50">Loading secure preview...</p>
      </div>
    );
  }

  if (errorMessage || !url) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-12">
        <AlertTriangle className="h-12 w-12 text-red-400" />
        <p className="text-center text-sm text-text/60">{errorMessage || 'Preview unavailable.'}</p>
        <Button onClick={onDownload} className="bg-blue-500 hover:bg-blue-600 text-white">
          <Download className="mr-2 h-4 w-4" />
          Download File
        </Button>
      </div>
    );
  }

  if (isPdf) {
    return <iframe src={url} title={item.title} className="h-full w-full border-none bg-white" />;
  }

  if (isImage) {
    return (
      <div className="flex h-full items-center justify-center bg-black/30 p-4">
        <img
          src={url}
          alt={item.title || 'Document preview'}
          loading="lazy"
          decoding="async"
          className="max-h-full max-w-full object-contain"
          onError={() => setErrorMessage('Image preview failed to render.')}
        />
      </div>
    );
  }

  if (isText) {
    return (
      <div className="h-full w-full overflow-auto p-6">
        <pre className="whitespace-pre-wrap break-words rounded-xl bg-black/20 p-4 font-mono text-sm text-text/80">
          {textContent || 'File is empty.'}
        </pre>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <audio src={url} controls preload="metadata" className="w-full max-w-3xl" />
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black p-2 sm:p-4">
        <video
          src={url}
          controls
          preload="metadata"
          className="h-auto max-h-full w-full max-w-5xl rounded-lg object-contain"
        />
      </div>
    );
  }

  if (isOfficeDocument && officePreviewUrl) {
    return (
      <iframe
        src={officePreviewUrl}
        title={item.title}
        className="h-full w-full border-none bg-white"
      />
    );
  }

  if (isOfficeDocument) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-12 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-400" />
        <p className="max-w-xl text-sm text-text/60">
          Live office preview needs a public file URL. This file can still be downloaded and opened
          safely.
        </p>
        <Button onClick={onDownload} className="bg-blue-500 hover:bg-blue-600 text-white">
          <Download className="mr-2 h-4 w-4" />
          Download File
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-12 text-center text-white">
      <FilePlus className="h-20 w-20 text-white/20 transition-colors" />
      <div>
        <h3 className="text-xl font-semibold text-white transition-colors">{item.title}</h3>
        <p className="mt-2 text-white/40 transition-colors">
          No direct preview available for this file type.
        </p>
      </div>
      <Button onClick={onDownload} className="bg-blue-500 hover:bg-blue-600 text-white">
        <Download className="mr-2 h-4 w-4" />
        Download to View
      </Button>
    </div>
  );
};

export const DocumentsVault: React.FC = () => {
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
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 8;
  const isSupportedDocumentFile = (file: File) => {
    const extension = file.name.split('.').pop()?.toUpperCase() || '';
    return SUPPORTED_DOCUMENT_EXTENSIONS.has(extension);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetFolder = useRef<string | null>(null);
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
  } = useVaultFolders('document');

  const { searchQuery, setSearchQuery, filteredItems } = useVaultItems('document', currentFolder);

  useEffect(() => {
    setCurrentPage(0);
  }, [currentFolder, searchQuery]);

  const previewedDocument = useMemo(
    () => filteredItems.find((item) => item.id === previewItem) ?? null,
    [filteredItems, previewItem]
  );

  const currentPreviewIndex = useMemo(() => {
    if (!previewItem) return -1;
    return filteredItems.findIndex((item) => item.id === previewItem);
  }, [filteredItems, previewItem]);

  const canPrevious = currentPreviewIndex > 0;
  const canNext = currentPreviewIndex >= 0 && currentPreviewIndex < filteredItems.length - 1;

  const showPreviousDocument = () => {
    if (canPrevious) setPreviewItem(filteredItems[currentPreviewIndex - 1].id);
  };
  const showNextDocument = () => {
    if (canNext) setPreviewItem(filteredItems[currentPreviewIndex + 1].id);
  };

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
        showNextDocument();
      }

      if (e.key === 'ArrowLeft') {
        showPreviousDocument();
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

    const harmfulTypes = ['.exe', '.dll', '.js', '.vbs', '.bat', '.cmd', '.sh', '.msi'];

    setIsUploading(true);
    const total = files.length;

    try {
      for (let index = 0; index < total; index += 1) {
        const file = files[index];
        if (!isSupportedDocumentFile(file)) {
          toast.error(
            `This document vault does not support this file. "${file.name}" was not uploaded.`
          );
          continue;
        }
        if (exceedsUploadSizeLimit(file)) {
          toast.error(getUploadSizeErrorMessage(file));
          continue;
        }
        const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;

        if (harmfulTypes.includes(fileExtension) && !allowRestrictedTypes) {
          toast.error('Restricted file type blocked', {
            description:
              'Executables and scripts are restricted for security. You can enable them in Settings.',
            action: {
              label: 'Enable',
              onClick: () => {
                setAllowRestrictedTypes(true);
                toast.info('Restricted types enabled.');
              },
            },
          });
          continue;
        }

        const toastId = toast.loading(`Encrypting document ${index + 1} of ${total}...`);
        try {
          const encryptedData = await encryptFile(file, masterKey);

          await addItem(
            {
              type: 'document',
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
          console.error('Upload failed:', error);
          toast.error(`Failed to upload ${file.name}. Encryption error.`, {
            id: toastId,
            description: 'Please check your master key and try again.',
          });
          logActivity({
            actionType: 'file_upload',
            itemName: file.name,
            description: 'document upload failed',
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
    if (!confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) return;
    removeItem(id);
    toast.success(`${title} removed from vault`);
    logActivity({
      actionType: 'item_delete',
      itemName: title,
      description: 'document deleted from vault',
      status: 'success',
    });
  };

  const downloadFile = async (item: VaultItem) => {
    if (!masterKey) return;

    try {
      const mimeType = item.metadata?.mimeType as string | undefined;
      const fileUrl = await getVaultItemPreviewUrl(item, masterKey, mimeType);
      if (!fileUrl) {
        toast.error('Decryption failed', {
          description:
            'The file could not be decrypted. Please check your master key and try again.',
        });
        return;
      }

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
        description: 'document downloaded',
        status: 'success',
      });
    } catch {
      logActivity({
        actionType: 'file_download',
        itemName: item.title,
        description: 'document download failed',
        status: 'failure',
      });
      toast.error('Decryption error', {
        description:
          'An unexpected error occurred during decryption. Please check your master key.',
      });
    }
  };

  return (
    <VaultLayout
      title="Documents"
      description={
        currentFolder
          ? `Documents in folder "${currentFolder}"`
          : 'Securely store PDFs and other sensitive files.'
      }
      items={items.filter((i) => i.type === 'document')}
      itemTypeLabel="document"
      allItemLabel="All Documents"
      onUpload={(folder?: string | null) => {
        uploadTargetFolder.current = folder ?? currentFolder;
        fileInputRef.current?.click();
      }}
      onFileDrop={(files, folder) => handleUploadFiles(files, folder ?? currentFolder)}
      isUploading={isUploading}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      folders={folders}
      currentFolder={currentFolder}
      onFolderSelect={setCurrentFolder}
      sidebarIcon={FilePlus}
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
        accept={DOCUMENT_FILE_INPUT_ACCEPT}
      />

      {filteredItems.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 opacity-40 cursor-pointer hover:opacity-70 transition-opacity"
          onClick={() => {
            uploadTargetFolder.current = currentFolder;
            fileInputRef.current?.click();
          }}
        >
          <FilePlus className="mb-4 h-16 w-16" />
          <p className="text-lg">No documents found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-10">
          {filteredItems
            .slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE)
            .map((item, idx) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ y: -5 }}
                transition={{ delay: idx * 0.03 }}
                draggable
                onDragStartCapture={(event) => setDraggedVaultItem(event, item.id)}
                onTouchStartCapture={(event: React.TouchEvent) =>
                  setDraggedVaultItem(event as any, item.id)
                }
                // onTouchMoveCapture={(e) => {
                //   /* Allow custom touch drag logic */
                // }}
                title="Drag to a folder to move this document"
              >
                <Card
                  className={cn(
                    'group relative border-white/5 bg-gradient-to-br from-white/[0.08] to-transparent backdrop-blur-md transition-all hover:border-white/20 hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)]',
                    moveMenuOpenId === item.id ? 'z-50' : 'z-10'
                  )}
                >
                  <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
                    <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-blue-500/10 blur-3xl transition-opacity group-hover:opacity-30" />
                  </div>

                  <CardContent className="p-5 sm:p-6 relative z-10">
                    <div className="flex flex-col items-center text-center">
                      <div className="mb-4 relative">
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 transition-transform group-hover:scale-110 group-hover:rotate-3 shadow-inner">
                          <FilePlus className="h-10 w-10 text-blue-400/80 shadow-blue-400/20" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 rounded-lg bg-blue-500 px-1.5 py-0.5 text-[8px] font-bold text-white uppercase tracking-tighter shadow-lg">
                          {item.metadata?.extension}
                        </div>
                      </div>

                      <div className="w-full space-y-1">
                        <h3 className="truncate text-sm font-semibold text-text transition-colors">
                          {item.title}
                        </h3>
                        <div className="flex items-center justify-center gap-2">
                          <p className="text-[10px] font-medium text-text/40 transition-colors">
                            {(item.metadata?.size / 1024).toFixed(1)} KB
                          </p>
                          {item.folder && (
                            <span className="flex max-w-full items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[8px] font-medium text-blue-400/60 uppercase">
                              <Folder className="h-2 w-2 shrink-0" />
                              <span className="truncate" title={item.folder}>
                                {item.folder.length > 10
                                  ? `${item.folder.slice(0, 10)}...`
                                  : item.folder}
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-between gap-2 border-t border-white/5 pt-4 opacity-100 transition-all text-white">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 flex-1 bg-white/5 hover:bg-white/10 text-xs gap-2"
                        onClick={() => {
                          setPreviewItem(item.id);
                          logActivity({
                            actionType: 'file_preview',
                            itemName: item.title,
                            description: 'document preview opened',
                            status: 'success',
                          });
                        }}
                      >
                        <Eye className="h-3.5 w-3.5 text-blue-400" />
                        Preview
                      </Button>

                      <div className="flex gap-1">
                        <div className="relative">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              'h-9 w-9 bg-white/5 hover:bg-white/10 text-white',
                              moveMenuOpenId === item.id && 'bg-white/20'
                            )}
                            onClick={() =>
                              setMoveMenuOpenId(moveMenuOpenId === item.id ? null : item.id)
                            }
                          >
                            <Move className="h-3.5 w-3.5" />
                          </Button>
                          <AnimatePresence>
                            {moveMenuOpenId === item.id && (
                              <motion.div key="move-menu-overlay" className="contents">
                                <motion.div
                                  key="move-menu-backdrop"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  className="fixed inset-0 z-10"
                                  onClick={() => setMoveMenuOpenId(null)}
                                />
                                <motion.div
                                  key="move-menu-dropdown"
                                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                  className="absolute bottom-full right-0 mb-2 w-56 flex-col rounded-2xl border border-card-border bg-card-bg/95 p-1 shadow-2xl backdrop-blur-xl z-20 flex"
                                >
                                  <p className="px-3 py-2 text-[9px] font-bold text-text/40 uppercase tracking-widest text-white">
                                    Move to Folder
                                  </p>

                                  <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2.5 mb-1 bg-white/[0.02] rounded-xl">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.15)]">
                                      <FilePlus className="h-4 w-4" />
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
                                          className="truncate max-w-[100px] font-medium text-blue-400"
                                          title={item.folder || 'All Documents'}
                                        >
                                          {item.folder || 'All Documents'}
                                        </span>
                                      </span>
                                    </div>
                                  </div>

                                  <div className="max-h-[108px] overflow-y-auto custom-scrollbar">
                                    <button
                                      className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/5 flex items-center gap-2 transition-colors text-white"
                                      onClick={() => {
                                        handleMoveToFolder(item.id, null);
                                        setMoveMenuOpenId(null);
                                      }}
                                    >
                                      <FilePlus className="h-3 w-3 opacity-40 text-blue-400" />
                                      All Documents
                                    </button>
                                    {folders.map((f) => (
                                      <button
                                        key={f}
                                        title={f}
                                        className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/5 flex items-center gap-2 transition-colors text-white"
                                        onClick={() => {
                                          handleMoveToFolder(item.id, f);
                                          setMoveMenuOpenId(null);
                                        }}
                                      >
                                        <Folder className="h-3 w-3 opacity-40 text-blue-400" />
                                        {f.length > 8 ? `${f.slice(0, 8)}...` : f}
                                      </button>
                                    ))}
                                  </div>
                                </motion.div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={pinningItemIds.includes(item.id)}
                          className={cn(
                            'h-9 w-9 transition-all',
                            item.isPinned
                              ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-400/30'
                              : 'bg-white/5 hover:bg-white/10 text-white'
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
                          className="h-9 w-9 bg-white/5 hover:bg-white/10 text-white"
                          onClick={() => downloadFile(item)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 bg-white/5 hover:bg-red-500/20 text-red-500/60 hover:text-red-500 transition-all border border-red-500/10"
                          onClick={() => handleDelete(item.id, item.title)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
        </div>
      )}

      {filteredItems.length > ITEMS_PER_PAGE && (
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
              <span className="text-lg font-bold text-text tabular-nums text-white">
                {currentPage + 1}
              </span>
              <div className="h-4 w-[1px] bg-white/10" />
              <span className="text-sm font-medium text-text/40 tabular-nums text-white/40">
                {Math.ceil(filteredItems.length / ITEMS_PER_PAGE)}
              </span>
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-text/20 font-bold">
              Page
            </span>
          </div>

          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Button
              variant="outline"
              disabled={(currentPage + 1) * ITEMS_PER_PAGE >= filteredItems.length}
              onClick={() => setCurrentPage((prev) => prev + 1)}
              className="h-10 w-10 rounded-full border-white/10 bg-white/5 p-0 text-text/60 backdrop-blur-xl transition-all hover:border-white/30 hover:bg-white/10 hover:text-text disabled:opacity-10 disabled:cursor-not-allowed shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {previewItem && previewedDocument && (
          <motion.div
            key="document-preview-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 backdrop-blur-xl p-4 transition-colors duration-300"
            ref={modalRef}
          >
            <div className="absolute right-4 top-4 z-50 flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
                onClick={() => downloadFile(previewedDocument)}
                title="Download file"
              >
                <Download className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10"
                onClick={() => setPreviewItem(null)}
                title="Close preview"
              >
                <X className="h-6 w-6" />
              </Button>
            </div>

            <GlobalNavigator
              canPrevious={canPrevious}
              canNext={canNext}
              onPrevious={showPreviousDocument}
              onNext={showNextDocument}
              layout="overlay"
            />
            <div className="h-full w-full max-w-5xl overflow-hidden rounded-xl bg-card-bg shadow-2xl transition-colors">
              <SafeDocumentPreview
                item={previewedDocument}
                masterKey={masterKey!}
                onDownload={() => downloadFile(previewedDocument)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </VaultLayout>
  );
};
