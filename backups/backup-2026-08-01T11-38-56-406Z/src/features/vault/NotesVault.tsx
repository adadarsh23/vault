import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { useVaultStore } from '../../store/vaultStore'
import { encryptData, decryptData } from '../../lib/cryptoPrimitives'
import { useClipboard } from '../../hooks/useClipboard'
import { getStringContent } from '../../lib/vaultItemContent'
import { FolderSidebar } from './components/NotesVault/FolderSidebar'
import { NotesList } from './components/NotesVault/NotesList'
import { NoteViewer } from './components/NotesVault/NoteViewer'
import { useVaultFolders } from '../../hooks/useVaultFolders'
import type { VaultItem } from '../../lib/storage'
import { sortPinnedFirst } from '../../lib/pinning'
import { useGlobalNavigationStore } from '../../store/globalNavigationStore'

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return fallback
}

export const NotesVault: React.FC = () => {
  const items = useVaultStore((state) => state.items)
  const addItem = useVaultStore((state) => state.addItem)
  const removeItem = useVaultStore((state) => state.removeItem)
  const updateItem = useVaultStore((state) => state.updateItem)
  const togglePin = useVaultStore((state) => state.togglePin)
  const pinningItemIds = useVaultStore((state) => state.pinningItemIds)
  const masterKey = useVaultStore((state) => state.masterKey)
  const targetItemId = useGlobalNavigationStore((state) => state.targetItemId)
  const setTargetItemId = useGlobalNavigationStore((state) => state.setTargetItemId)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isMobileFolderOpen, setIsMobileFolderOpen] = useState(false)
  const { copy, copiedId } = useClipboard()

  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')

  type NoteItem = Omit<VaultItem, 'folder' | 'type'> & {
    type: 'note'
    folder: string | null
  }
  const notes = useMemo<NoteItem[]>(
    () =>
      items
        .filter((item): item is VaultItem & { type: 'note' } => item.type === 'note')
        .map((item) => ({
          ...item,
          folder: item.folder ?? null,
        })),
    [items],
  )
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
  } = useVaultFolders('note')

  useEffect(() => {
    if (!targetItemId) return
    const target = notes.find((n) => n.id === targetItemId)
    if (target) {
      setCurrentFolder(null)
      setSelectedNoteId(target.id)
      setTargetItemId(null)
    }
  }, [targetItemId, notes, setTargetItemId, setCurrentFolder])
  const normalizedSearchQuery = useMemo(
    () => searchQuery.trim().toLowerCase(),
    [searchQuery],
  )

  // Update the filteredNotes useMemo hook in NotesVault.tsx:

  const filteredNotes = useMemo(
    () =>
      sortPinnedFirst(notes.filter((note) => {
        const matchesSearch =
          normalizedSearchQuery.length === 0 ||
          note.title.toLowerCase().includes(normalizedSearchQuery) ||
          note.id.toLowerCase().includes(normalizedSearchQuery)

        // If searching, ignore folder restriction to show all global matches
        const matchesFolder =
          normalizedSearchQuery.length > 0 ||
          currentFolder === null ||
          note.folder === currentFolder

        return matchesSearch && matchesFolder
      })),
    [notes, normalizedSearchQuery, currentFolder],
  )

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId),
    [notes, selectedNoteId],
  )

  const selectedNoteIndex = useMemo(
    () => filteredNotes.findIndex((note) => note.id === selectedNoteId),
    [filteredNotes, selectedNoteId],
  )
  const hasPreviousNote = selectedNoteIndex > 0
  const hasNextNote =
    selectedNoteIndex >= 0 && selectedNoteIndex < filteredNotes.length - 1

  const goToPreviousNote = () => {
    if (!hasPreviousNote) return
    setSelectedNoteId(filteredNotes[selectedNoteIndex - 1].id)
    setIsEditing(false)
  }

  const goToNextNote = () => {
    if (!hasNextNote) return
    setSelectedNoteId(filteredNotes[selectedNoteIndex + 1].id)
    setIsEditing(false)
  }

  const handleCreateNote = async () => {
    if (!masterKey) {
      toast.error('Unlock the vault before creating notes')
      return
    }

    const title = `New Note ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`
    const rawContent = '# New Note\nBegin typing your ideas, notes, or anything you want to remember...'

    try {
      const content = await encryptData(
        rawContent,
        masterKey,
      )
      const newItem = await addItem({
        type: 'note',
        title,
        content,
        folder: currentFolder || undefined,
      })

      // Automatically move to and start editing the new note
      setSelectedNoteId(newItem.id)
      setEditTitle(newItem.title)
      setEditContent(rawContent)
      setIsEditing(true)
      setSearchQuery('') // Clear search so the new note is visible in the list

      toast.success('New note created')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to create note'))
    }
  }

  const handleSave = useCallback(
    async (title: string, content: string) => {
      if (!selectedNoteId || !masterKey) return

      try {
        const encrypted = await encryptData(content, masterKey)
        await updateItem(selectedNoteId, {
          title: title,
          content: encrypted,
        })
      } catch (error) {
        console.error('Failed to save note:', error)
        throw error instanceof Error ? error : new Error('Failed to save note')
      }
    },
    [selectedNoteId, masterKey, updateItem],
  )

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return

    try {
      await removeItem(id)
      setSelectedNoteId(null)
      toast.success(`Note "${title}" deleted`)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to delete note'))
    }
  }

  const startEditing = async () => {
    if (!selectedNote || !masterKey) return
    try {
      setEditTitle(selectedNote.title)
      const encryptedContent = getStringContent(selectedNote.content)
      if (!encryptedContent) {
        toast.error('Unsupported note content format')
        return
      }

      const decrypted = await decryptData(encryptedContent, masterKey)
      if (decrypted === null) {
        toast.error('Decryption failed', {
          description:
            'Could not decrypt note content. Please check your master key.',
        })
        return
      }
      setEditContent(decrypted)
      setIsEditing(true)
    } catch (error) {
      toast.error(getErrorMessage(error, 'Error opening note for editing'))
    }
  }

  const handleCopy = async () => {
    if (!selectedNote || !masterKey) return
    try {
      const encryptedContent = getStringContent(selectedNote.content)
      if (!encryptedContent) {
        toast.error('Unsupported note content format')
        return
      }

      const decrypted = await decryptData(encryptedContent, masterKey)
      if (decrypted) {
        copy(decrypted, selectedNote.id)
        toast.success('Note content copied to clipboard')
      } else {
        toast.error('Failed to decrypt note for copying')
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Error copying note'))
    }
  }

  return (
    <div className="flex h-full gap-6 relative overflow-hidden p-4 lg:p-4 xl:p-8">
      <FolderSidebar
        notes={notes}
        folders={folders}
        currentFolder={currentFolder}
        setCurrentFolder={setCurrentFolder}
        isAddingFolder={isAddingFolder}
        setIsAddingFolder={setIsAddingFolder}
        newFolderName={newFolderName}
        setNewFolderName={setNewFolderName}
        editingFolder={editingFolder}
        setEditingFolder={setEditingFolder}
        editingFolderName={editingFolderName}
        setEditingFolderName={setEditingFolderName}
        handleCreateFolder={handleCreateFolder}
        handleRenameFolder={handleRenameFolder}
        handleDeleteFolder={handleDeleteFolder}
        handleMoveToFolder={handleMoveToFolder}
      />

      <NotesList
        notes={notes}
        folders={folders}
        filteredNotes={filteredNotes}
        selectedNoteId={selectedNoteId}
        setSelectedNoteId={setSelectedNoteId}
        setIsEditing={setIsEditing}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        currentFolder={currentFolder}
        setCurrentFolder={setCurrentFolder}
        handleCreateNote={handleCreateNote}
        isMobileFolderOpen={isMobileFolderOpen}
        setIsMobileFolderOpen={setIsMobileFolderOpen}
        isAddingFolder={isAddingFolder}
        setIsAddingFolder={setIsAddingFolder}
        newFolderName={newFolderName}
        setNewFolderName={setNewFolderName}
        editingFolder={editingFolder}
        setEditingFolder={setEditingFolder}
        editingFolderName={editingFolderName}
        setEditingFolderName={setEditingFolderName}
        handleRenameFolder={handleRenameFolder}
        handleDeleteFolder={handleDeleteFolder}
        handleCreateFolder={handleCreateFolder}
        onTogglePin={(id) => void togglePin(id)}
        pinningItemIds={pinningItemIds}
      />

      <NoteViewer
        selectedNoteId={selectedNoteId}
        selectedNote={selectedNote}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        setSelectedNoteId={setSelectedNoteId}
        editTitle={editTitle}
        editContent={editContent}
        handleSave={handleSave}
        hasPreviousNote={hasPreviousNote}
        hasNextNote={hasNextNote}
        goToPreviousNote={goToPreviousNote}
        goToNextNote={goToNextNote}
        handleCopy={handleCopy}
        copiedId={copiedId}
        startEditing={startEditing}
        handleDelete={handleDelete}
        masterKey={masterKey}
      />
    </div>
  )
}
