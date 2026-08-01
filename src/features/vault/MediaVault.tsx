import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Video, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { createSHA256 } from 'hash-wasm'
import { useVaultStore } from '../../store/vaultStore'
import { encryptFileInWorker } from '../../lib/cryptoPrimitives'
import { useGlobalNavigationStore } from '../../store/globalNavigationStore'
import { logActivity } from '../../lib/activity'
import {
  exceedsUploadSizeLimit,
  getUploadSizeErrorMessage,
  FILE_TYPE_SUPPORT,
  PHOTO_FILE_INPUT_ACCEPT,
  VIDEO_FILE_INPUT_ACCEPT,
} from '../../lib/fileHandling'
import { getVaultItemPreviewUrl } from '../../lib/filePreview'
import { useVaultFolders } from '../../hooks/useVaultFolders'
import { useVaultItems } from '../../hooks/useVaultItems'
import { VaultLayout } from '../../components/layout/VaultLayout'
import { VaultItem } from '../../lib/storage'
import { LiveCaptureModal } from './components/LiveCaptureModal'
import { vaultApi } from '../../api/vaultApi'

// New extracted components and utilities
import {
  getFileExtension,
  getMediaDimensions,
  normalizeMediaMimeType,
} from './components/MediaVault/mediaUtils'
import { MediaCard } from './components/MediaVault/MediaCard'
import { MediaPagination } from './components/MediaVault/MediaPagination'
import { MediaPreview } from './components/MediaVault/MediaPreview'

type FileWithWebkitPath = File & { webkitRelativePath?: string }

const readTopLevelFolderFromWebkitPath = (file: File): string | null => {
  const webkitPath = (file as FileWithWebkitPath).webkitRelativePath
  if (!webkitPath) return null
  const firstSegment = webkitPath.split('/')[0]?.trim()
  return firstSegment || null
}

const toPositiveIntOrFallback = (value: unknown, fallback: number): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return Math.floor(parsed)
}

export const MediaVault: React.FC<{ type: 'photo' | 'video' }> = ({ type }) => {
  // const singularLabel = type === 'photo' ? 'Photo' : 'Video'
  // const pluralLabel = `${singularLabel}s`
  const items = useVaultStore((state) => state.items)
  const addItem = useVaultStore((state) => state.addItem)
  const removeItem = useVaultStore((state) => state.removeItem)
  const togglePin = useVaultStore((state) => state.togglePin)
  const fetchItems = useVaultStore((state) => state.fetchItems)
  const pinningItemIds = useVaultStore((state) => state.pinningItemIds)
  const masterKey = useVaultStore((state) => state.masterKey)
  const rsaKeyPair = useVaultStore((state) => state.rsaKeyPair)
  const isMediaAutoplayEnabled = useVaultStore(
    (state) => state.preferences.isMediaAutoplayEnabled,
  )
  const isLowDataModeEnabled = useVaultStore(
    (state) => state.preferences.isLowDataModeEnabled,
  )
  const isNetworkAwareAutoplayEnabled = useVaultStore(
    (state) => state.preferences.isNetworkAwareAutoplayEnabled,
  )
  const isPerformanceHudEnabled = useVaultStore(
    (state) => state.preferences.isPerformanceHudEnabled,
  )
  const isLightweightPreviewModeEnabled = useVaultStore(
    (state) => state.preferences.isLightweightPreviewModeEnabled,
  )
  const [isUploading, setIsUploading] = useState(false)
  const [isLiveRecordOpen, setIsLiveRecordOpen] = useState(false)
  const [previewItem, setPreviewItem] = useState<string | null>(null)
  const [activePreviewItem, setActivePreviewItem] = useState<string | null>(
    null,
  )
  const [moveMenuOpenId, setMoveMenuOpenId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const modalRef = useRef<HTMLDivElement | null>(
    null,
  ) as React.RefObject<HTMLDivElement>
  const previewRafOneRef = useRef<number | null>(null)
  const previewRafTwoRef = useRef<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadTargetFolder = useRef<string | null>(null)
  const targetItemId = useGlobalNavigationStore((state) => state.targetItemId)
  const setTargetItemId = useGlobalNavigationStore(
    (state) => state.setTargetItemId,
  )

  const cancelScheduledPreviewActivation = useCallback(() => {
    if (previewRafOneRef.current !== null) {
      window.cancelAnimationFrame(previewRafOneRef.current)
      previewRafOneRef.current = null
    }
    if (previewRafTwoRef.current !== null) {
      window.cancelAnimationFrame(previewRafTwoRef.current)
      previewRafTwoRef.current = null
    }
  }, [])

  const schedulePreviewActivation = useCallback(
    (id: string) => {
      cancelScheduledPreviewActivation()
      previewRafOneRef.current = window.requestAnimationFrame(() => {
        previewRafOneRef.current = null
        previewRafTwoRef.current = window.requestAnimationFrame(() => {
          previewRafTwoRef.current = null
          setActivePreviewItem(id)
        })
      })
    },
    [cancelScheduledPreviewActivation],
  )

  const openPreview = useCallback(
    (id: string) => {
      setPreviewItem(id)
      setActivePreviewItem(null)
      schedulePreviewActivation(id)
    },
    [schedulePreviewActivation],
  )

  const closePreview = useCallback(() => {
    cancelScheduledPreviewActivation()
    setPreviewItem(null)
    setActivePreviewItem(null)
  }, [cancelScheduledPreviewActivation])

  // Use the new reusable hooks
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
  } = useVaultFolders(type)

  const { searchQuery, setSearchQuery, filteredItems } = useVaultItems(
    type,
    currentFolder,
  )

  const [itemsPerPage, setItemsPerPage] = useState(8)
  const LARGE_MEDIA_DIRECT_UPLOAD_BYTES = 150 * 1024 * 1024
  const MULTIPART_PARALLELISM = 3
  const FILE_HASH_CHUNK_BYTES = 8 * 1024 * 1024

  const getMultipartParallelism = useCallback((fileSize: number) => {
    if (typeof navigator === 'undefined') {
      return MULTIPART_PARALLELISM
    }

    const nav = navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean; downlink?: number }
      hardwareConcurrency?: number
    }
    const connection = nav.connection
    const cpu = Number(nav.hardwareConcurrency || 4)

    if (connection?.saveData) return 2
    if (connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') {
      return 1
    }
    if (connection?.effectiveType === '3g') {
      return 2
    }

    if (fileSize >= 512 * 1024 * 1024 && cpu >= 8 && (connection?.downlink || 0) >= 20) {
      return 5
    }

    if (cpu >= 6) {
      return 4
    }

    return MULTIPART_PARALLELISM
  }, [])

  const sha256Hex = useCallback(async (data: Uint8Array) => {
    const digestInput = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer
    const digest = await crypto.subtle.digest('SHA-256', digestInput)
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }, [])

  const sha256FileHexChunked = useCallback(
    async (file: File, chunkSize: number) => {
      if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
        throw new Error('Invalid hash chunk size')
      }
      if (file.size === 0) {
        const emptyDigest = await crypto.subtle.digest(
          'SHA-256',
          new Uint8Array(0),
        )
        return Array.from(new Uint8Array(emptyDigest))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('')
      }
      const hasher = await createSHA256()
      hasher.init()
      const totalParts = Math.ceil(file.size / chunkSize)
      for (let i = 0; i < totalParts; i += 1) {
        const start = i * chunkSize
        const end = Math.min(start + chunkSize, file.size)
        const chunkArrayBuffer = (await file
          .slice(start, end)
          .arrayBuffer()) as ArrayBuffer
        const chunkBuffer = new Uint8Array(chunkArrayBuffer)
        hasher.update(chunkBuffer)
      }
      return hasher.digest('hex')
    },
    [],
  )

  useEffect(() => {
    let timeout: any

    const update = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        setItemsPerPage(window.innerWidth < 768 ? 4 : 8)
      }, 150)
    }

    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const supportedExtensions: string[] = Array.from(
    type === 'photo' ? FILE_TYPE_SUPPORT.photo : FILE_TYPE_SUPPORT.video,
  )

  const isSupportedMediaFile = (file: File) => {
    const extension = getFileExtension(file.name)

    const hasSupportedMime =
      type === 'photo'
        ? (file.type || '').startsWith('image/')
        : (file.type || '').startsWith('video/')

    return hasSupportedMime || supportedExtensions.includes(extension)
  }

  useEffect(() => {
    setCurrentPage(0)
  }, [type, currentFolder, searchQuery])

  const previewedMedia = useMemo(
    () => filteredItems.find((item) => item.id === activePreviewItem) ?? null,
    [filteredItems, activePreviewItem],
  )

  const currentPreviewIndex = useMemo(() => {
    if (!previewItem) return -1
    return filteredItems.findIndex((item) => item.id === previewItem)
  }, [filteredItems, previewItem])

  const canPrevious = currentPreviewIndex > 0
  const canNext =
    currentPreviewIndex >= 0 && currentPreviewIndex < filteredItems.length - 1

  const showPreviousMedia = useCallback(() => {
    if (canPrevious) {
      const nextId = filteredItems[currentPreviewIndex - 1].id
      openPreview(nextId)
    }
  }, [canPrevious, filteredItems, currentPreviewIndex, openPreview])
  const showNextMedia = useCallback(() => {
    if (canNext) {
      const nextId = filteredItems[currentPreviewIndex + 1].id
      openPreview(nextId)
    }
  }, [canNext, filteredItems, currentPreviewIndex, openPreview])

  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const touchEndY = useRef<number | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null
    touchEndY.current = null
    touchStartX.current = e.targetTouches[0].clientX
    touchStartY.current = e.targetTouches[0].clientY
  }

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX
    touchEndY.current = e.targetTouches[0].clientY
  }

  const onTouchEnd = () => {
    if (
      touchStartX.current === null ||
      touchEndX.current === null ||
      touchStartY.current === null ||
      touchEndY.current === null
    )
      return

    const distanceX = touchStartX.current - touchEndX.current
    const distanceY = touchStartY.current - touchEndY.current
    const minSwipeDistance = 75

    // Only handle horizontal swipes if it is primarily horizontal
    if (Math.abs(distanceX) > Math.abs(distanceY)) {
      if (distanceX > minSwipeDistance && canNext) {
        showNextMedia()
      }
      if (distanceX < -minSwipeDistance && canPrevious) {
        showPreviousMedia()
      }
    }
  }

  useEffect(() => {
    if (!targetItemId) return
    const target = filteredItems.find((item) => item.id === targetItemId)
    if (!target) return

    openPreview(target.id)
    setTargetItemId(null)
  }, [targetItemId, filteredItems, setTargetItemId, openPreview])

  // Safety net: if RAF-based activation misses for any reason, force activation.
  useEffect(() => {
    if (!previewItem || activePreviewItem) return
    const timer = window.setTimeout(() => {
      setActivePreviewItem(previewItem)
    }, 180)
    return () => window.clearTimeout(timer)
  }, [previewItem, activePreviewItem])

  useEffect(() => {
    if (previewItem) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [previewItem])

  useEffect(() => {
    if (!previewItem) return

    const focusableSelectors =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

    const modal = modalRef.current
    if (!modal) return

    const focusableElements = modal.querySelectorAll(focusableSelectors)
    const first = focusableElements[0] as HTMLElement
    const last = focusableElements[focusableElements.length - 1] as HTMLElement

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last?.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first?.focus()
          }
        }
      }

      if (e.key === 'ArrowRight') {
        showNextMedia()
      }

      if (e.key === 'ArrowLeft') {
        showPreviousMedia()
      }

      if (e.key === 'Escape') {
        closePreview()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    if (first) {
      try {
        first.focus({ preventScroll: true })
      } catch {
        first.focus()
      }
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [previewItem, closePreview, showNextMedia, showPreviousMedia])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    try {
      await handleUploadFiles(files, uploadTargetFolder.current)
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleUploadFiles = async (
    files: File[],
    targetFolder: string | null,
    isAlreadyEncrypted = false,
    isLiveCapture = false,
  ) => {
    if (!files.length) return
    if (!masterKey) {
      toast.error('Encryption key missing')
      return
    }

    setIsUploading(true)
    const total = files.length
    let successCount = 0
    let failedCount = 0

    try {
      for (let index = 0; index < total; index += 1) {
        const file = files[index]
        if (!isSupportedMediaFile(file)) {
          toast.error(
            `This ${type} vault supports ${supportedExtensions.join(', ')} files. "${file.name}" was not uploaded.`,
          )
          failedCount++
          continue
        }
        if (exceedsUploadSizeLimit(file)) {
          toast.error(getUploadSizeErrorMessage(file))
          failedCount++
          continue
        }
        const toastId = toast.loading(
          `Encrypting ${type} ${index + 1} of ${total}...`,
        )

        try {
          // Detect if file is coming from a folder upload.
          const folderFromPath = readTopLevelFolderFromWebkitPath(file)

          const fileTargetFolder = folderFromPath || targetFolder

          // Security-first upload strategy:
          // avoid direct multipart-by-default for videos and use encrypted upload path
          // unless file size crosses the large-file optimization threshold.
          const shouldUseDirectLargeUpload =
            !isAlreadyEncrypted &&
            file.size >= LARGE_MEDIA_DIRECT_UPLOAD_BYTES

          if (shouldUseDirectLargeUpload) {
            try {
              toast.loading(
                `Preparing multipart upload ${index + 1}/${total}...`,
                {
                  id: toastId,
                },
              )
              const resumeKey = `vault:multipart:${type}:${file.name}:${file.size}:${file.lastModified}`
              let resumeUploadId: string | undefined
              try {
                resumeUploadId =
                  window.localStorage.getItem(resumeKey) || undefined
              } catch {
                resumeUploadId = undefined
              }

              const initResponse = await vaultApi.startMultipartUpload({
                category: type === 'photo' ? 'photo' : 'video',
                folder: fileTargetFolder || null,
                fileName: file.name,
                mimeType: normalizeMediaMimeType(file, type),
                fileSize: file.size,
                resumeUploadId,
              })
              const multipartData = (initResponse as { data?: unknown })
                ?.data as
                | {
                    uploadId?: unknown
                    partSize?: unknown
                    uploadedParts?: unknown
                  }
                | undefined
              const uploadId =
                typeof multipartData?.uploadId === 'string'
                  ? multipartData.uploadId.trim()
                  : String(multipartData?.uploadId || '')
              const partSize = toPositiveIntOrFallback(
                multipartData?.partSize,
                8 * 1024 * 1024,
              )
              const uploadedParts = new Set<number>(
                Array.isArray(multipartData?.uploadedParts)
                  ? multipartData.uploadedParts
                      .map((n: unknown) => Number(n))
                      .filter((n) => Number.isInteger(n) && n > 0)
                  : [],
              )
              if (!uploadId) {
                throw new Error('Multipart init did not return uploadId')
              }
              try {
                window.localStorage.setItem(resumeKey, uploadId)
              } catch {
                // ignore storage failures
              }

              const totalParts = Math.ceil(file.size / partSize)
              let completedParts = uploadedParts.size
              let nextPartIndex = 0
              const pendingPartIndexes = Array.from(
                { length: totalParts },
                (_, i) => i,
              ).filter((i) => !uploadedParts.has(i + 1))
              const updateProgress = () => {
                const progress = Math.max(
                  0,
                  Math.min(
                    100,
                    Math.round(
                      (completedParts / Math.max(totalParts, 1)) * 100,
                    ),
                  ),
                )
                toast.loading(
                  `Uploading large ${index + 1}/${total}: ${progress}%...`,
                  { id: toastId },
                )
              }
              updateProgress()

              const partWorker = async () => {
                while (nextPartIndex < pendingPartIndexes.length) {
                  const cursor = nextPartIndex
                  nextPartIndex += 1
                  const partZeroBased = pendingPartIndexes[cursor]
                  const start = partZeroBased * partSize
                  const end = Math.min(start + partSize, file.size)
                  const chunkBuffer = new Uint8Array(
                    await file.slice(start, end).arrayBuffer(),
                  )
                  const chunkHash = await sha256Hex(chunkBuffer)
                  await vaultApi.uploadMultipartPart(
                    uploadId,
                    partZeroBased + 1,
                    chunkBuffer,
                    chunkHash,
                  )
                  completedParts += 1
                  updateProgress()
                }
              }

              const parallelWorkers = Math.max(
                1,
                Math.min(
                  getMultipartParallelism(file.size),
                  pendingPartIndexes.length || 1,
                ),
              )

              await Promise.all(
                Array.from(
                  {
                    length: parallelWorkers,
                  },
                  () => partWorker(),
                ),
              )

              const fullHash = await sha256FileHexChunked(
                file,
                FILE_HASH_CHUNK_BYTES,
              )
              await vaultApi.completeMultipartUpload(uploadId, {
                fileSha256: fullHash,
                clientUpdatedAt: new Date().toISOString(),
              })
              try {
                window.localStorage.removeItem(resumeKey)
              } catch {
                // ignore storage failures
              }

              await fetchItems('manual')
              toast.success(`${file.name} uploaded successfully`, {
                id: toastId,
              })
              logActivity({
                actionType: 'file_upload',
                itemName: file.name,
                description: `${type} uploaded (large direct mode)`,
                status: 'success',
              })
              successCount++
              continue
            } catch (multipartError) {
              const multipartStatus =
                typeof multipartError === 'object' &&
                multipartError &&
                'status' in multipartError
                  ? Number(
                      (multipartError as { status?: unknown }).status ?? NaN,
                    )
                  : NaN
              if (multipartStatus === 401 || multipartStatus === 403) {
                throw multipartError
              }
              toast.loading(
                `Large upload optimization failed; using secure fallback upload ${index + 1}/${total}...`,
                { id: toastId },
              )
            }
          }

          const encryptedData = isAlreadyEncrypted
            ? new Uint8Array(await file.arrayBuffer())
            : await encryptFileInWorker(file, masterKey)

          const dimensions =
            type === 'photo'
              ? await getMediaDimensions(file, 'photo')
              : undefined

          await addItem(
            {
              type: type === 'photo' ? 'photo' : 'video',
              title: file.name,
              content: encryptedData,
              folder: fileTargetFolder || undefined,
              metadata: {
                mimeType: normalizeMediaMimeType(file, type),
                size: file.size,
                extension: getFileExtension(file.name),
                width: dimensions?.width,
                height: dimensions?.height,
                aspectRatio: dimensions?.aspectRatio,
                isE2EE: isAlreadyEncrypted,
                isLiveCapture,
              },
            },
            (progress) => {
              toast.loading(
                `Uploading ${index + 1}/${total}: ${progress}%...`,
                {
                  id: toastId,
                },
              )
            },
            { source: 'cloud' },
          )
          toast.success(`${file.name} uploaded successfully`, { id: toastId })
          successCount++
        } catch (error) {
          console.error('Upload failed:', error)
          toast.error(`Failed to upload ${file.name}. Please try again.`, {
            id: toastId,
          })
          logActivity({
            actionType: 'file_upload',
            itemName: file.name,
            description: `${type} upload failed`,
            status: 'failure',
          })
          failedCount++
        }
      }
    } finally {
      setIsUploading(false)
      uploadTargetFolder.current = null

      if (total > 1) {
        if (failedCount === 0) {
          toast.success(`All ${successCount} files uploaded successfully`)
        } else if (successCount === 0) {
          toast.error(`All ${failedCount} files failed to upload`)
        } else {
          toast.info(`${successCount} uploaded, ${failedCount} failed`)
        }
      }
    }
  }

  const handleDelete = useCallback(
    (id: string, title: string) => {
      if (
        !confirm(
          `Are you sure you want to delete "${title}"? This cannot be undone.`,
        )
      )
        return
      removeItem(id)
      toast.success(`${title} removed from vault`)
      logActivity({
        actionType: 'item_delete',
        itemName: title,
        description: `${type} deleted from vault`,
        status: 'success',
      })
    },
    [removeItem, type],
  )

  const handleDownload = async (item: VaultItem) => {
    if (!masterKey) {
      toast.error('Encryption key missing')
      return
    }

    const toastId = toast.loading('Preparing download...')

    try {
      let fileUrl: string | null = await getVaultItemPreviewUrl(
        item,
        masterKey,
        item.metadata?.mimeType,
        rsaKeyPair?.privateKey ?? undefined,
      )

      if (!fileUrl) throw new Error('Decryption failed')

      // Validate blob URL.
      if (fileUrl.startsWith('blob:')) {
        try {
          const response = await fetch(fileUrl)
          if (!response.ok) {
            // Blob expired or invalid, try to regenerate
            fileUrl = await getVaultItemPreviewUrl(
              item,
              masterKey,
              item.metadata?.mimeType,
              rsaKeyPair?.privateKey ?? undefined,
            )
            if (!fileUrl) throw new Error('Blob regeneration failed')
          }
        } catch {
          // Blob expired → regenerate
          fileUrl = await getVaultItemPreviewUrl(
            item,
            masterKey,
            item.metadata?.mimeType,
            rsaKeyPair?.privateKey ?? undefined,
          )
          if (!fileUrl) throw new Error('Blob regeneration failed')
        }
      }

      let objectUrlToRevoke: string | null = null
      let downloadHref = fileUrl

      // For signed/http URLs, convert to an object URL so filename download is reliable.
      if (
        !downloadHref.startsWith('blob:') &&
        !downloadHref.startsWith('data:')
      ) {
        const response = await fetch(downloadHref, {
          credentials: 'include',
          mode: 'cors',
        })
        if (!response.ok) {
          throw new Error(
            `Download fetch failed with status ${response.status}`,
          )
        }
        const fileBlob = await response.blob()
        objectUrlToRevoke = URL.createObjectURL(fileBlob)
        downloadHref = objectUrlToRevoke
      }

      const link = document.createElement('a')
      link.href = downloadHref
      link.download = item.title
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Cleanup safely.
      if (fileUrl.startsWith('blob:')) {
        setTimeout(() => URL.revokeObjectURL(fileUrl!), 2000)
      }
      if (objectUrlToRevoke) {
        setTimeout(() => URL.revokeObjectURL(objectUrlToRevoke), 2000)
      }

      toast.success(`Downloaded ${item.title}`, { id: toastId })
    } catch (error) {
      console.error('Download error:', error)
      toast.error('Download failed. Try again.', { id: toastId })
    }
  }

  const handlePreview = useCallback(
    (id: string, title: string) => {
      if (!masterKey) {
        toast.error('Encryption key missing')
        return
      }
      openPreview(id)
      logActivity({
        actionType: 'file_preview',
        itemName: title,
        description: `${type} preview opened`,
        status: 'success',
      })
    },
    [masterKey, type, openPreview],
  )

  useEffect(() => {
    return () => {
      cancelScheduledPreviewActivation()
    }
  }, [cancelScheduledPreviewActivation])

  return (
    <VaultLayout
      title={`${type}s`}
      // title={pluralLabel}
      description={
        currentFolder
          ? `${type.charAt(0).toUpperCase() + type.slice(1)}s in album "${currentFolder}"`
          : `Securely encrypted ${type} storage.`
      }
      items={items.filter((i) => i.type === type)}
      itemTypeLabel={type}
      allItemLabel={`All ${type.charAt(0).toUpperCase() + type.slice(1)}s`}
      onUpload={(folder?: string | null) => {
        uploadTargetFolder.current = folder ?? currentFolder
        fileInputRef.current?.click()
      }}
      onFileDrop={(files, folder) =>
        handleUploadFiles(files, folder ?? currentFolder)
      }
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
        accept={
          type === 'photo' ? PHOTO_FILE_INPUT_ACCEPT : VIDEO_FILE_INPUT_ACCEPT
        }
      />

      <LiveCaptureModal
        isOpen={isLiveRecordOpen}
        onClose={() => setIsLiveRecordOpen(false)}
        type={type}
        onCapture={async (file, isEncrypted) => {
          await handleUploadFiles([file], currentFolder, isEncrypted, true)
        }}
      />

      {filteredItems.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-20 opacity-40 cursor-pointer hover:opacity-70 transition-opacity"
          onClick={() => {
            uploadTargetFolder.current = currentFolder
            fileInputRef.current?.click()
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
        <div
          role="grid"
          aria-label={`${type} grid`}
          className={`grid gap-6 pt-6 px-1 md:px-4 touch-pan-y ${
            type === 'video'
              ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3'
              : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3'
          }`}
        >
          {filteredItems
            .slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage)
            .map((item, idx) => (
              <MediaCard
                key={item.id}
                item={item}
                idx={idx}
                type={type}
                masterKey={masterKey}
                isSelected={previewItem === item.id}
                moveMenuOpenId={moveMenuOpenId}
                folders={folders}
                onPreview={handlePreview}
                onMoveMenuToggle={setMoveMenuOpenId}
                onMoveToFolder={handleMoveToFolder}
                onDownload={handleDownload}
                onDelete={handleDelete}
                onTogglePin={(id) => void togglePin(id)}
                isPinning={pinningItemIds.includes(item.id)}
                lightweightPreviewMode={isLightweightPreviewModeEnabled}
              />
            ))}
        </div>
      )}

      <MediaPagination
        currentPage={currentPage}
        totalItems={filteredItems.length}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
      />

      <MediaPreview
        previewItem={previewItem}
        previewedMedia={previewedMedia}
        isPreparingPreview={Boolean(previewItem && !activePreviewItem)}
        masterKey={masterKey}
        type={type}
        isMediaAutoplayEnabled={
          isLightweightPreviewModeEnabled ? false : isMediaAutoplayEnabled
        }
        isLowDataModeEnabled={isLowDataModeEnabled}
        isNetworkAwareAutoplayEnabled={isNetworkAwareAutoplayEnabled}
        isPerformanceHudEnabled={isPerformanceHudEnabled}
        canPrevious={canPrevious}
        canNext={canNext}
        onClose={() => {
          closePreview()
        }}
        onPrevious={showPreviousMedia}
        onNext={showNextMedia}
        onDownload={handleDownload}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        modalRef={modalRef}
      />
    </VaultLayout>
  )
}
