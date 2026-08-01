import React, { useRef, useState } from 'react'
import { cn } from '../../../../lib/utils'
import { Button } from '../../../../components/ui/Button'
import { Input } from '../../../../components/ui/Input'
import { SearchInput } from '../../../../components/ui/SearchInput'
import {
  Plus,
  FilePlus,
  Search,
  ChevronRight,
  ChevronUp,
  X,
  Menu,
  Folder,
  Edit2,
  Trash2,
  Check,
  Pin,
  Loader2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScrollButton } from '../../../../components/vault/ScrollButton'
import { setDraggedVaultItem } from '../../../../lib/vaultDragDrop'

export interface NotesListProps {
  notes: any[]
  folders: string[]
  filteredNotes: any[]
  selectedNoteId: string | null
  setSelectedNoteId: (id: string | null) => void
  setIsEditing: (isEditing: boolean) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  currentFolder: string | null
  setCurrentFolder: (folder: string | null) => void
  handleCreateNote: () => void
  isMobileFolderOpen: boolean
  setIsMobileFolderOpen: (isOpen: boolean) => void
  isAddingFolder: boolean
  setIsAddingFolder: (isAdding: boolean) => void
  newFolderName: string
  setNewFolderName: (name: string) => void
  handleCreateFolder: () => void
  editingFolder: string | null
  setEditingFolder: (folder: string | null) => void
  editingFolderName: string
  setEditingFolderName: (name: string) => void
  handleRenameFolder: (oldName: string) => void
  handleDeleteFolder: (folderName: string) => void
  onTogglePin: (id: string) => void
  pinningItemIds: string[]
}

export const NotesList: React.FC<NotesListProps> = ({
  notes,
  folders,
  filteredNotes,
  selectedNoteId,
  setSelectedNoteId,
  setIsEditing,
  searchQuery,
  setSearchQuery,
  currentFolder,
  setCurrentFolder,
  handleCreateNote,
  isMobileFolderOpen,
  setIsMobileFolderOpen,
  isAddingFolder,
  setIsAddingFolder,
  newFolderName,
  setNewFolderName,
  handleCreateFolder,
  editingFolder,
  setEditingFolder,
  editingFolderName,
  setEditingFolderName,
  handleRenameFolder,
  handleDeleteFolder,
  onTogglePin,
  pinningItemIds,
}) => {
  const [showListScrollTop, setShowListScrollTop] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const suggestions = React.useMemo(() => {
    if (!notes) return []
    return notes.map((n) => n.title).filter(Boolean)
  }, [notes])

  const getFolderCount = (folder: string | null) => {
    return notes.filter((n) => folder === null || n.folder === folder).length
  }

  const headerTitle = currentFolder || 'Notes'
  const displayHeaderTitle = React.useMemo(() => {
    const words = headerTitle.trim().split(/\s+/)
    if (words.length > 10) {
      return `${words.slice(0, 10).join(' ')}…`
    }
    return headerTitle
  }, [headerTitle])

  return (
    <div
      className={cn(
        'w-full md:w-80 shrink-0 flex-col gap-6 border-r border-white/5 pr-6 transition-colors',
        selectedNoteId ? 'hidden md:flex' : 'flex',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 mb-1 flex-1 min-w-0">
          <h1
            className="text-3xl font-bold text-text transition-colors truncate min-w-0"
            title={searchQuery ? 'Search Results' : headerTitle}
          >
            {searchQuery ? 'Search Results' : displayHeaderTitle}
          </h1>
          <span className="px-2.5 py-0.5 rounded-full bg-text/5 border border-text/10 text-text/50 text-xs font-bold shadow-inner whitespace-nowrap shrink-0">
            {searchQuery ? filteredNotes.length : getFolderCount(currentFolder)}{' '}
            items
          </span>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            onClick={handleCreateNote}
            size="sm"
            className="hidden sm:flex transition-all"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Note
          </Button>
          <Button
            size="icon"
            variant="secondary"
            onClick={handleCreateNote}
            className="flex sm:hidden rounded-xl w-10 h-10 bg-white/5 hover:bg-white/10 border-white/5"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {isMobileFolderOpen && (
          <motion.div
            key="mobile-notes-folder-menu"
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
              className="absolute right-0 top-0 bottom-0 w-72 bg-bg border-l border-white/5 p-6 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-lg font-bold">Folders</h2>
                <Button
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
                    setCurrentFolder(null)
                    setIsMobileFolderOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all',
                    currentFolder === null
                      ? 'bg-text/10 text-text font-bold'
                      : 'text-text/60 hover:bg-white/5',
                  )}
                >
                  <FilePlus className="h-5 w-5 shrink-0" />
                  All Notes
                  <span className="ml-auto text-[10px] opacity-40">
                    {notes.length}
                  </span>
                </button>
                {folders.map((folder) => {
                  const isEditing = editingFolder === folder
                  return (
                    <div
                      key={folder}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all border border-transparent',
                        currentFolder === folder
                          ? 'bg-text/10 text-text font-bold'
                          : 'text-text/60 hover:bg-white/5',
                      )}
                    >
                      <Folder className="h-5 w-5 shrink-0" />
                      {isEditing ? (
                        <Input
                          value={editingFolderName}
                          onChange={(e) => setEditingFolderName(e.target.value)}
                          className="h-9 flex-1 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameFolder(folder)
                            if (e.key === 'Escape') setEditingFolder(null)
                          }}
                        />
                      ) : (
                        <button
                          className="flex-1 text-left truncate"
                          title={folder}
                          onClick={() => {
                            setCurrentFolder(folder)
                            setIsMobileFolderOpen(false)
                          }}
                        >
                          {folder}
                        </button>
                      )}
                      <span className="text-[10px] opacity-40">
                        {notes.filter((i) => i.folder === folder).length}
                      </span>
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Button
                            aria-label="Confirm rename"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-green-400"
                            onClick={() => handleRenameFolder(folder)}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            aria-label="Cancel rename"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-red-400"
                            onClick={() => setEditingFolder(null)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button
                            aria-label="Edit folder"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingFolder(folder)
                              setEditingFolderName(folder)
                            }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            aria-label="Delete folder"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 hover:text-red-400"
                            onClick={() => handleDeleteFolder(folder)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}

                <AnimatePresence mode="wait">
                  {isAddingFolder ? (
                    <motion.div
                      key="adding-folder-mobile"
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
                            handleCreateFolder()
                            if (newFolderName.trim())
                              setIsMobileFolderOpen(false)
                          }
                        }}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-9 flex-1"
                          onClick={() => {
                            handleCreateFolder()
                            if (newFolderName.trim())
                              setIsMobileFolderOpen(false)
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
                      key="add-folder-btn-mobile"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 mt-4 text-text/40 hover:text-text hover:bg-white/5"
                        onClick={() => {
                          setIsAddingFolder(true)
                        }}
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

      <div className="flex items-center gap-3 w-full">
        <div className="relative group flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/20 group-focus-within:text-emerald-400 transition-colors z-10 pointer-events-none" />
          <SearchInput
            placeholder="Search notes by name or ID..."
            className="pl-10 pr-10 h-10 text-sm bg-white/5 border-white/5 focus:border-emerald-500/30 rounded-xl w-full"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            suggestions={suggestions}
            historyKey="notes"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10 text-text/30 hover:text-text/60 transition-all"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="lg:hidden flex shrink-0 border-white/5 rounded-xl bg-white/5 hover:bg-white/10 w-10 h-10"
          onClick={() => setIsMobileFolderOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <div className="relative flex-1 min-h-0">
        <div
          ref={listRef}
          onScroll={(e) =>
            setShowListScrollTop(e.currentTarget.scrollTop > 200)
          }
          className="h-full overflow-y-auto space-y-3 pr-2 custom-scrollbar"
        >
          {filteredNotes.map((note, idx) => (
            <motion.div
              key={note.id}
              role="button"
              tabIndex={0}
              draggable
              onDragStartCapture={(event) =>
                setDraggedVaultItem(event, note.id)
              }
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
              transition={{ delay: idx * 0.03 }}
              onClick={() => {
                setSelectedNoteId(note.id)
                setIsEditing(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedNoteId(note.id)
                  setIsEditing(false)
                }
              }}
              className={`w-full rounded-2xl border p-4 text-left transition-all ${
                selectedNoteId === note.id
                  ? 'border-emerald-500/20 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.05)]'
                  : 'border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/10'
              }`}
              title="Drag to a folder to move this note"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`p-2 rounded-xl transition-colors ${selectedNoteId === note.id ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-text/20'}`}
                >
                  <FilePlus className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-semibold transition-colors ${selectedNoteId === note.id ? 'text-text' : 'text-text/70'}`}
                  >
                    {note.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-text/30 font-medium tracking-tight">
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                    {note.folder && (
                      <>
                        <span className="text-[8px] text-text/10">•</span>
                        <span
                          className="text-[10px] text-emerald-400/40 font-bold uppercase tracking-tighter max-w-[120px] truncate"
                          title={note.folder}
                        >
                          {note.folder}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={pinningItemIds.includes(note.id)}
                  onClick={(event) => {
                    event.stopPropagation()
                    onTogglePin(note.id)
                  }}
                  className={cn(
                    'h-8 w-8 rounded-full transition-all',
                    note.isPinned
                      ? 'text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20'
                      : 'text-text/30 hover:text-text/80 hover:bg-white/10',
                  )}
                  title={note.isPinned ? 'Unpin note' : 'Pin note'}
                >
                  {pinningItemIds.includes(note.id) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Pin className={cn('h-4 w-4', note.isPinned && 'fill-current')} />
                  )}
                </Button>
                {selectedNoteId === note.id && (
                  <ChevronRight className="h-4 w-4 text-emerald-500/40" />
                )}
              </div>
            </motion.div>
          ))}
        </div>
        <ScrollButton
          icon={ChevronUp}
          visible={showListScrollTop}
          onClick={() =>
            listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
          }
          className="bottom-4 right-4"
        />
      </div>
    </div>
  )
}
