import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Folder,
  Edit2,
  Trash2,
  Check,
  X,
  Search,
  Menu,
  Loader2,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { cn } from '../../lib/utils'
import { VaultItem } from '../../lib/storage'
import { getDraggedVaultItem, clearDraggedVaultItem } from '../../lib/vaultDragDrop'
import { isSavedFolderName } from '../../lib/folderGuards'

interface VaultLayoutProps {
  title: string
  description: string
  itemTypeLabel: string
  allItemLabel?: string
  items?: VaultItem[]
  onUpload?: (targetFolder?: string | null) => void
  onLiveRecord?: () => void
  onFileDrop?: (
    files: File[],
    targetFolder?: string | null,
  ) => Promise<void> | void
  isUploading?: boolean
  uploadLabel?: string
  searchQuery: string
  onSearchChange: (query: string) => void
  folders: string[]
  currentFolder: string | null
  onFolderSelect: (folder: string | null) => void
  folderControls: {
    isAdding: boolean
    setIsAdding: (val: boolean) => void
    newName: string
    setNewName: (val: string) => void
    editing: string | null
    setEditing: (val: string | null) => void
    editingName: string
    setEditingName: (val: string) => void
    onCreate: () => void
    onRename: (oldName: string) => void
    onDelete: (name: string) => void
  }
  onMoveItemToFolder?: (
    itemId: string,
    folder: string | null,
  ) => Promise<void> | void
  children: React.ReactNode
  sidebarIcon?: React.ElementType
}

export const VaultLayout: React.FC<VaultLayoutProps> = ({
  title,
  description,
  itemTypeLabel,
  allItemLabel,
  items = [],
  onUpload,
  onLiveRecord,
  onFileDrop,
  isUploading,
  uploadLabel,
  searchQuery,
  onSearchChange,
  folders,
  currentFolder,
  onFolderSelect,
  folderControls,
  onMoveItemToFolder,
  children,
  sidebarIcon: SidebarIcon = Folder,
}) => {
  const [isMobileFolderOpen, setIsMobileFolderOpen] = useState(false)
  const [searchInput, setSearchInput] = useState(searchQuery)
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(
    undefined,
  )
  const [isFileDropActive, setIsFileDropActive] = useState(false)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)

  useEffect(() => {
    const handleGlobalDragStart = (e: DragEvent) => {
      const itemId = getDraggedVaultItem({ dataTransfer: e.dataTransfer })
      if (itemId) {
        setDraggedItemId(itemId)
      }
    }

    const handleGlobalDragEnd = () => {
      setDraggedItemId(null)
      clearDraggedVaultItem()
    }

    window.addEventListener('dragstart', handleGlobalDragStart)
    window.addEventListener('dragend', handleGlobalDragEnd)

    return () => {
      window.removeEventListener('dragstart', handleGlobalDragStart)
      window.removeEventListener('dragend', handleGlobalDragEnd)
    }
  }, [])

  const draggedItem = React.useMemo(() => {
    if (!draggedItemId) return null
    return items.find((item) => item.id === draggedItemId)
  }, [draggedItemId, items])

  const draggedItemFolder = draggedItem ? (draggedItem.folder ?? null) : undefined

  useEffect(() => {
    setSearchInput(searchQuery)
  }, [searchQuery])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (searchInput !== searchQuery) {
        onSearchChange(searchInput)
      }
    }, 120)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [searchInput, searchQuery, onSearchChange])

  const folderCounts = React.useMemo(() => {
    const map: Partial<Record<string, number>> = {}
    for (const item of items) {
      const key = item.folder || '__all__'
      map[key] = (map[key] || 0) + 1
    }
    return map
  }, [items])

  const getFolderCount = (folderName: string | null) => {
    if (folderName === null) return items.length
    return folderCounts[folderName] || 0
  }

  const handleCreateFolder = React.useCallback(() => {
    const name = folderControls.newName.trim()
    const normalized = name.toLowerCase()
    if (!name || folders.some((f) => f.toLowerCase() === normalized)) return
    folderControls.onCreate()
  }, [folderControls, folders])

  const handleRenameFolder = React.useCallback(
    (oldName: string) => {
      const name = folderControls.editingName.trim()
      const normalized = name.toLowerCase()
      if (
        !name ||
        folders.some((f) => f !== oldName && f.toLowerCase() === normalized)
      )
        return
      folderControls.onRename(oldName)
    },
    [folderControls, folders],
  )

  const isCreateInvalid =
    !folderControls.newName.trim() ||
    folders.some(
      (f) => f.toLowerCase() === folderControls.newName.trim().toLowerCase(),
    )

  const isRenameInvalid = (oldName: string) => {
    const name = folderControls.editingName.trim()
    const normalized = name.toLowerCase()
    return (
      !name ||
      folders.some((f) => f !== oldName && f.toLowerCase() === normalized)
    )
  }

  const handleFolderDragOver = (
    event: React.DragEvent<HTMLElement>,
    folder: string | null,
  ) => {
    if (!onMoveItemToFolder || !getDraggedVaultItem(event)) return

    const itemId = getDraggedVaultItem(event)
    const dragged = items.find((item) => item.id === itemId)
    const sourceFolder = dragged ? (dragged.folder ?? null) : undefined

    // Do not allow drop on the folder where the item already is
    if (sourceFolder === folder) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTarget(folder)
  }

  const handleFolderDrop = async (
    event: React.DragEvent<HTMLElement>,
    folder: string | null,
  ) => {
    if (!onMoveItemToFolder) return
    event.preventDefault()
    const itemId = getDraggedVaultItem(event)
    setDropTarget(undefined)
    if (!itemId) return

    const dragged = items.find((item) => item.id === itemId)
    const sourceFolder = dragged ? (dragged.folder ?? null) : undefined

    // Do not allow drop on the folder where the item already is
    if (sourceFolder === folder) return

    await onMoveItemToFolder(itemId, folder)
  }

  const handleFolderDragLeave = (folder: string | null) => {
    if (dropTarget === folder) {
      setDropTarget(undefined)
    }
  }

  const hasDraggedFiles = (event: React.DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes('Files')

  const handleFileDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!onFileDrop || !hasDraggedFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsFileDropActive(true)
  }

  const handleFileDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (!onFileDrop) return
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsFileDropActive(false)
    }
  }

  const handleFileDrop = async (event: React.DragEvent<HTMLElement>) => {
    if (!onFileDrop || !hasDraggedFiles(event)) return
    event.preventDefault()
    setIsFileDropActive(false)
    const files = Array.from(event.dataTransfer.files || [])
    if (!files.length) return
    await onFileDrop(files, currentFolder)
  }

  return (
    <div
      className="flex flex-col lg:flex-row h-full gap-8 relative"
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={(event) => void handleFileDrop(event)}
    >
      {/* Sidebar for Desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col gap-4 sticky top-0 h-fit max-h-[calc(100vh-10rem)] overflow-y-auto pr-2 custom-scrollbar">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text/40">{`${itemTypeLabel} Categories`}</h2>
          <Button
            aria-label="Create folder"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => folderControls.setIsAdding(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-1">
          <button
            onClick={() => onFolderSelect(null)}
            onDragOver={(event) => handleFolderDragOver(event, null)}
            onDrop={(event) => void handleFolderDrop(event, null)}
            onDragLeave={() => handleFolderDragLeave(null)}
            role="tab"
            aria-selected={currentFolder === null}
            aria-label={allItemLabel || `All ${itemTypeLabel}s`}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all border border-transparent',
              dropTarget === null &&
                'ring-2 ring-primary/50 bg-primary/10 text-text',
              // Highlight if this is the source folder of the dragged item
              draggedItemId && draggedItemFolder === null &&
                'border border-dashed border-primary/40 bg-primary/10 text-primary',
              // Highlight other folders as valid drop zones
              draggedItemId && draggedItemFolder !== null &&
                'border border-dashed border-primary/20 bg-primary/5 text-text/70',
              !draggedItemId && (currentFolder === null
                ? 'bg-text/10 text-text'
                : 'text-text/60 hover:bg-text/5'),
            )}
          >
            <SidebarIcon className="h-4 w-4" />
            <span className="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis font-bold">
              {allItemLabel || `All ${itemTypeLabel}s`}
            </span>
            {draggedItemId && draggedItemFolder === null ? (
              <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary animate-pulse">
                Source
              </span>
            ) : (
              <span className="ml-auto text-[10px] font-bold opacity-40">
                {getFolderCount(null)}
              </span>
            )}
          </button>

          <div className="h-px bg-text/5 my-2 mx-2" />

          {folders.map((folder) => {
            const isSavedFolder = isSavedFolderName(folder)
            return (
              <div key={folder} className="group relative">
                {folderControls.editing === folder ? (
                  <div className="flex items-center gap-1 p-1">
                    <Input
                      value={folderControls.editingName}
                      onChange={(e) =>
                        folderControls.setEditingName(e.target.value)
                      }
                      className="h-8 text-xs"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameFolder(folder)
                        if (e.key === 'Escape') folderControls.setEditing(null)
                      }}
                    />
                    <Button
                      aria-label="Confirm rename"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-green-400"
                      onClick={() => handleRenameFolder(folder)}
                      disabled={isRenameInvalid(folder)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      aria-label="Cancel rename"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-400"
                      onClick={() => folderControls.setEditing(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => onFolderSelect(folder)}
                      onDragOver={(event) =>
                        handleFolderDragOver(event, folder)
                      }
                      onDrop={(event) => void handleFolderDrop(event, folder)}
                      onDragLeave={() => handleFolderDragLeave(folder)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all border border-transparent',
                        dropTarget === folder &&
                          'ring-2 ring-primary/50 bg-primary/10 text-text',
                        // Highlight if this is the source folder of the dragged item
                        draggedItemId && draggedItemFolder === folder &&
                          'border border-dashed border-primary/40 bg-primary/10 text-primary',
                        // Highlight other folders as valid drop zones
                        draggedItemId && draggedItemFolder !== folder &&
                          'border border-dashed border-primary/20 bg-primary/5 text-text/70',
                        !draggedItemId && (currentFolder === folder
                          ? 'bg-text/10 text-text'
                          : 'text-text/60 hover:bg-text/5'),
                      )}
                    >
                      <Folder className="h-4 w-4 shrink-0" />
                      <span
                        className="flex-1 truncate text-left group-hover:pr-10 transition-all"
                        title={folder}
                      >
                        {folder.length > 10
                          ? `${folder.slice(0, 10)}...`
                          : folder}
                      </span>
                      {draggedItemId && draggedItemFolder === folder ? (
                        <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary animate-pulse">
                          Source
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'ml-auto text-[10px] font-bold transition-opacity',
                            currentFolder === folder
                              ? 'opacity-40'
                              : 'opacity-40 group-hover:opacity-0',
                          )}
                        >
                          {getFolderCount(folder)}
                        </span>
                      )}
                    </button>
                    {!isSavedFolder && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          aria-label="Edit folder"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation()
                            folderControls.setEditing(folder)
                            folderControls.setEditingName(folder)
                          }}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          aria-label="Delete folder"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:text-red-400"
                          onClick={(e) => {
                            e.stopPropagation()
                            folderControls.onDelete(folder)
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}

          <AnimatePresence>
            {folderControls.isAdding && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 space-y-2 overflow-hidden px-1"
              >
                <Input
                  placeholder="New name..."
                  value={folderControls.newName}
                  onChange={(e) => folderControls.setNewName(e.target.value)}
                  className="h-8 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder()
                    if (e.key === 'Escape') folderControls.setIsAdding(false)
                  }}
                />
                <div className="flex gap-1">
                  <Button
                    aria-label="Confirm create folder"
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    onClick={handleCreateFolder}
                    disabled={isCreateInvalid}
                  >
                    Create
                  </Button>
                  <Button
                    aria-label="Cancel create folder"
                    size="sm"
                    variant="ghost"
                    className="h-7 flex-1 text-xs"
                    onClick={() => folderControls.setIsAdding(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="min-w-0 flex-1 space-y-6">
        {isFileDropActive && onFileDrop ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-3xl border-2 border-dashed border-primary/50 bg-bg/70 backdrop-blur-sm">
            <div className="rounded-2xl border border-primary/30 bg-primary/10 px-6 py-4 text-center shadow-xl">
              <p className="text-sm font-semibold text-text">
                Drop files to upload
              </p>
              <p className="mt-1 text-xs text-text/60">
                {currentFolder
                  ? `Files will be added to "${currentFolder}".`
                  : 'Files will be added to the current vault.'}
              </p>
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <h1
                  className="text-3xl font-bold text-text truncate capitalize"
                  title={currentFolder || title}
                >
                  {(currentFolder || title).length > 5
                    ? `${(currentFolder || title).slice(0, 5)}...`
                    : currentFolder || title}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-text/5 border border-text/10 text-text/50 text-xs font-bold shadow-inner">
                  {getFolderCount(currentFolder)} items
                </span>
              </div>
              <p className="text-text/50 truncate transition-colors">
                {description}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* {isUploading && (
                <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold text-primary animate-pulse">
                  <Cloud className="h-3 w-3 animate-spin" />
                </div>
              )} */}
              {/* Desktop View: Record then Upload */}
              {onLiveRecord && (
                <Button
                  onClick={onLiveRecord}
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex border-primary/20 hover:border-primary/50"
                  aria-label="Live record"
                >
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="mr-2 h-2 w-2 rounded-full bg-red-500"
                  />
                  Record
                </Button>
              )}
              {onUpload && (
                <Button
                  onClick={() => onUpload(currentFolder)}
                  disabled={isUploading}
                  size="sm"
                  className="hidden sm:flex transition-all"
                >
                  {isUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  {uploadLabel || `Upload ${itemTypeLabel}`}
                </Button>
              )}

              {/* Mobile View: Upload then Record (Swapped) */}
              {onLiveRecord && (
                <Button
                  onClick={onLiveRecord}
                  variant="outline"
                  size="icon"
                  className="flex sm:hidden border-primary/20"
                >
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                </Button>
              )}
              {onUpload && (
                <Button
                  onClick={() => onUpload(currentFolder)}
                  disabled={isUploading}
                  size="icon"
                  className="flex sm:hidden transition-all"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/30" />
              <Input
                placeholder={`Search ${itemTypeLabel}s...`}
                className={cn("pl-10", searchInput && "pr-9")}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text/40 hover:text-text rounded-full hover:bg-text/10 transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            {/* Mobile Category Toggle */}
            <Button
              aria-label="Toggle mobile folders menu"
              variant="outline"
              size="icon"
              className="lg:hidden flex border-text/10"
              onClick={() => setIsMobileFolderOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {isMobileFolderOpen && (
            <motion.div
              key="mobile-folder-menu"
              className="fixed inset-0 z-50 lg:hidden"
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileFolderOpen(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute right-0 top-0 bottom-0 w-72 bg-sidebar-bg border-l border-sidebar-border p-6 overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-lg font-bold capitalize">{`${itemTypeLabel} Categories`}</h2>
                  <Button
                    aria-label="Close mobile folders menu"
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsMobileFolderOpen(false)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => {
                      onFolderSelect(null)
                      setIsMobileFolderOpen(false)
                    }}
                    role="tab"
                    aria-selected={currentFolder === null}
                    aria-label={allItemLabel || `All ${itemTypeLabel}s`}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all border border-transparent',
                      // Highlight if this is the source folder of the dragged item
                      draggedItemId && draggedItemFolder === null &&
                        'border border-dashed border-primary/40 bg-primary/10 text-primary',
                      // Highlight other folders as valid drop zones
                      draggedItemId && draggedItemFolder !== null &&
                        'border border-dashed border-primary/20 bg-primary/5 text-text/70',
                      !draggedItemId && (currentFolder === null
                        ? 'bg-text/10 text-text font-bold'
                        : 'text-text/60'),
                    )}
                  >
                    <SidebarIcon className="h-5 w-5 shrink-0" />
                    <span
                      className="flex-1 text-left truncate"
                      title={allItemLabel || `All ${itemTypeLabel}s`}
                    >
                      {allItemLabel || `All ${itemTypeLabel}s`}
                    </span>
                    {draggedItemId && draggedItemFolder === null ? (
                      <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary animate-pulse">
                        Source
                      </span>
                    ) : (
                      <span className="ml-auto text-[10px] font-bold opacity-40">
                        {getFolderCount(null)}
                      </span>
                    )}
                  </button>
                  {folders.map((folder) => {
                    const isEditing = folderControls.editing === folder
                    const isSavedFolder = isSavedFolderName(folder)
                    return (
                      <div
                        key={folder}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all border border-transparent',
                          // Highlight if this is the source folder of the dragged item
                          draggedItemId && draggedItemFolder === folder &&
                            'border border-dashed border-primary/40 bg-primary/10 text-primary',
                          // Highlight other folders as valid drop zones
                          draggedItemId && draggedItemFolder !== folder &&
                            'border border-dashed border-primary/20 bg-primary/5 text-text/70',
                          !draggedItemId && (currentFolder === folder
                            ? 'bg-text/10 text-text font-bold'
                            : 'text-text/60'),
                        )}
                      >
                        <Folder className="h-5 w-5 shrink-0" />
                        {isEditing ? (
                          <Input
                            value={folderControls.editingName}
                            onChange={(e) =>
                              folderControls.setEditingName(e.target.value)
                            }
                            className="h-9 flex-1 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameFolder(folder)
                              if (e.key === 'Escape')
                                folderControls.setEditing(null)
                            }}
                          />
                        ) : (
                          <button
                            className="flex-1 text-left truncate"
                            title={folder}
                            onClick={() => {
                              onFolderSelect(folder)
                              setIsMobileFolderOpen(false)
                            }}
                          >
                            {folder.length > 10
                              ? `${folder.slice(0, 10)}...`
                              : folder}
                          </button>
                        )}
                        {draggedItemId && draggedItemFolder === folder ? (
                          <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary animate-pulse">
                            Source
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold opacity-40">
                            {getFolderCount(folder)}
                          </span>
                        )}
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <Button
                              aria-label="Confirm rename"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-green-400"
                              onClick={() => handleRenameFolder(folder)}
                              disabled={isRenameInvalid(folder)}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              aria-label="Cancel rename"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-red-400"
                              onClick={() => folderControls.setEditing(null)}
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
                                folderControls.setEditing(folder)
                                folderControls.setEditingName(folder)
                              }}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              aria-label="Delete folder"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 hover:text-red-400"
                              onClick={() => folderControls.onDelete(folder)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}

                  <AnimatePresence mode="wait">
                    {folderControls.isAdding ? (
                      <motion.div
                        key="adding-folder"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 space-y-3 px-1"
                      >
                        <Input
                          placeholder="New category name..."
                          value={folderControls.newName}
                          onChange={(e) =>
                            folderControls.setNewName(e.target.value)
                          }
                          className="h-10 text-sm"
                          autoFocus
                          onKeyDown={(e) =>
                            e.key === 'Enter' && handleCreateFolder()
                          }
                        />
                        <div className="flex gap-2">
                          <Button
                            aria-label="Confirm create folder"
                            size="sm"
                            className="h-9 flex-1"
                            onClick={handleCreateFolder}
                          >
                            Create
                          </Button>
                          <Button
                            aria-label="Cancel create folder"
                            size="sm"
                            variant="ghost"
                            className="h-9 flex-1"
                            onClick={() => folderControls.setIsAdding(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="add-folder-button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <Button
                          variant="ghost"
                          className="w-full justify-start gap-3 mt-4 text-text/40"
                          onClick={() => {
                            folderControls.setIsAdding(true)
                          }}
                        >
                          <Plus className="h-5 w-5" />
                          Create New Category
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        {children}
      </div>
    </div>
  )
}
