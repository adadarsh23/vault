import React, { useState, useEffect, useMemo } from 'react'
// test lock
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  Menu,
  Circle,
  CheckCircle2,
  Edit2,
  Save,
  X,
  Trash2,
  Loader2,
  ListTodo,
  CalendarClock,
  Flag,
  Pin,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/Button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { useVaultStore } from '../../store/vaultStore'
import type { VaultItem } from '../../lib/storage'
import { encryptData, decryptData } from '../../lib/cryptoPrimitives'
import { getStringContent, parseJsonSafely } from '../../lib/vaultItemContent'
import { logActivity } from '../../lib/activity'
import { setDraggedVaultItem } from '../../lib/vaultDragDrop'
import { FolderSidebar } from '../../components/vault/FolderSidebar'
import { MobileFolderMenu } from '../../components/vault/MobileFolderMenu'
import { useVaultFolders } from '../../hooks/useVaultFolders'
import { sortPinnedFirst } from '../../lib/pinning'

type TodoPriority = 'none' | 'low' | 'medium' | 'high' | 'critical'

type TodoPayload = {
  task: string
  completed: boolean
  dueDate: string
  priority: TodoPriority
}

const EMPTY_TODO: TodoPayload = {
  task: '',
  completed: false,
  dueDate: '',
  priority: 'medium',
}
const ENCRYPTED_TODO_TITLE = 'Encrypted Todo'

export const DEFAULT_TODO_CATEGORIES = [
  // 💼 Work & Career
  'Work',
  'Office',
  'Business',
  'Meeting',
  'Project',
  'Client',

  // 🎓 Education
  'Study',
  'Homework',
  'Assignment',
  'Exam',
  'Research',
  'Reading',

  // 👤 Personal
  'Personal',
  'Self Care',
  'Goals',
  'Habits',
  'Journal',
  'Wishlist',

  // 🏠 Home
  'Home',
  'Cleaning',
  'Laundry',
  'Maintenance',
  'Gardening',

  // ❤️ Health
  'Health',
  'Medicine',
  'Doctor',
  'Mental Health',
  'Sleep',

  // 💪 Fitness
  'Fitness',
  'Workout',
  'Running',
  'Yoga',
  'Sports',

  // 🛒 Shopping
  'Shopping',
  'Groceries',
  'Electronics',
  'Clothing',
  'Gifts',

  // 🚗 Daily Life
  'Errands',
  'Bank',
  'Bills',
  'Finance',
  'Insurance',

  // 👨‍👩‍👧 Family
  'Family',
  'Kids',
  'Parents',
  'Friends',
  'Relationship',

  // ✈️ Travel
  'Travel',
  'Vacation',
  'Hotel',
  'Transport',
  'Packing',

  // 🍽️ Food
  'Cooking',
  'Recipes',
  'Meal Prep',
  'Restaurant',

  // 📍 Places
  'Place',
  'Home Visit',
  'Office Visit',
  'Market',

  // 💻 Technology
  'Coding',
  'Bug Fix',
  'Development',
  'Learning',
  'AI',

  // 🎨 Creativity
  'Music',
  'Design',
  'Photography',
  'Writing',
  'Art',

  // 📅 Events
  'Birthday',
  'Anniversary',
  'Holiday',
  'Event',

  // 📦 Miscellaneous
  'Important',
  'Urgent',
  'Ideas',
  'Miscellaneous',
]

const normalizeCategoryKey = (value: string | null | undefined): string =>
  (value || '').trim().toLowerCase()

const formatCategoryLabel = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((part) =>
      part.length > 0
        ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`
        : '',
    )
    .filter(Boolean)
    .join(' ')

const normalizePriority = (value: unknown): TodoPriority => {
  if (
    value === 'none' ||
    value === 'high' ||
    value === 'medium' ||
    value === 'low' ||
    value === 'critical'
  ) {
    return value
  }
  return 'medium'
}

const sanitizeTodoPayload = (payload: TodoPayload): TodoPayload | null => {
  const task = payload.task.trim()
  if (!task) return null

  return {
    task,
    completed: Boolean(payload.completed),
    dueDate: payload.dueDate.trim(),
    priority: normalizePriority(payload.priority),
  }
}

const normalizeTodoPayload = (
  value: unknown,
  fallbackTask: string,
): TodoPayload | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<TodoPayload>
  const task =
    typeof record.task === 'string' ? record.task.trim() : fallbackTask.trim()
  if (!task) return null

  return sanitizeTodoPayload({
    task,
    completed: Boolean(record.completed),
    dueDate: typeof record.dueDate === 'string' ? record.dueDate : '',
    priority: normalizePriority(record.priority),
  })
}

const priorityTone: Record<TodoPriority, string> = {
  none: 'text-slate-300 bg-slate-300/10 border-slate-300/20',
  low: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  medium: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  high: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  critical: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
}

const padDateSegment = (value: number): string => String(value).padStart(2, '0')

const parseDateInputValue = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [yearPart, monthPart, dayPart] = value.split('-')
  const year = Number(yearPart)
  const month = Number(monthPart)
  const day = Number(dayPart)
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null
  }
  const parsed = new Date(year, month - 1, day)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() + 1 !== month ||
    parsed.getDate() !== day
  ) {
    return null
  }
  return parsed
}

const toDateTimeInputValue = (value: string): string => {
  const normalized = value.trim()
  if (!normalized) return ''

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) return normalized
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return `${normalized}T12:00`

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${parsed.getFullYear()}-${padDateSegment(parsed.getMonth() + 1)}-${padDateSegment(parsed.getDate())}T${padDateSegment(parsed.getHours())}:${padDateSegment(parsed.getMinutes())}`
}

const formatDueDateLabel = (value: string): string => {
  const normalized = value.trim()
  if (!normalized) return 'No due date selected'

  const hasExplicitTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
  let parsed: Date | null = null

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const dateOnly = parseDateInputValue(normalized)
    if (!dateOnly) return 'No due date selected'
    dateOnly.setHours(12, 0, 0, 0)
    parsed = dateOnly
  } else {
    const candidate = new Date(normalized)
    if (Number.isNaN(candidate.getTime())) return 'No due date selected'
    parsed = candidate
  }

  const base = parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  if (!hasExplicitTime) return base
  return (
    parsed.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }) +
    (hasExplicitTime
      ? ` • ${parsed.toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })}`
      : '')
  )
}

type TodoDueDateFieldProps = {
  value: string
  onChange: (value: string) => void
}

const TodoDueDateField: React.FC<TodoDueDateFieldProps> = ({
  value,
  onChange,
}) => {
  return (
    <div
      className="
        group
        relative
        overflow-hidden
        rounded-2xl
        border
        border-white/10
        bg-gradient-to-br
        from-white/10
        via-white/5
        to-transparent
        backdrop-blur-xl
        shadow-lg
        shadow-black/20
        transition-all
        duration-300
        hover:border-emerald-400/30
        hover:shadow-emerald-500/10
        focus-within:border-emerald-400/50
        focus-within:ring-2
        focus-within:ring-emerald-400/20
      "
    >
      {/* Background Glow */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-cyan-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      {/* Calendar Icon */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 rounded-lg bg-emerald-500/10 p-1.5 transition-all duration-300 group-hover:bg-emerald-500/20">
        <CalendarClock className="h-4 w-4 text-emerald-300" />
      </div>

      <Input
        type="datetime-local"
        value={toDateTimeInputValue(value)}
        onChange={(event) => onChange(event.target.value)}
        className="
          h-12
          border-0
          bg-transparent
          pl-10
          pr-10
          text-sm
          font-medium
          text-text
          [color-scheme:dark]
          focus-visible:ring-0
          focus-visible:ring-offset-0
          placeholder:text-text/40
        "
      />

      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear due date"
          className="
            absolute
            right-2
            top-1/2
            flex
            h-8
            w-8
            -translate-y-1/2
            items-center
            justify-center
            rounded-lg
            bg-transparent
            text-text/50
            transition-all
            duration-200
            hover:scale-110
            hover:bg-red-500/20
            hover:text-red-300
            active:scale-95
          "
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export const TodoVault: React.FC = () => {
  const items = useVaultStore((state) => state.items)
  const addItem = useVaultStore((state) => state.addItem)
  const updateItem = useVaultStore((state) => state.updateItem)
  const removeItem = useVaultStore((state) => state.removeItem)
  const masterKey = useVaultStore((state) => state.masterKey)
  const togglePin = useVaultStore((state) => state.togglePin)
  const pinningItemIds = useVaultStore((state) => state.pinningItemIds)

  const [searchQuery, setSearchQuery] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newTodo, setNewTodo] = useState<TodoPayload>(EMPTY_TODO)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTodo, setEditingTodo] = useState<TodoPayload>(EMPTY_TODO)
  const [isMobileFolderOpen, setIsMobileFolderOpen] = useState(false)
  const [savingTodoIds, setSavingTodoIds] = useState<string[]>([])
  const [todoPayloads, setTodoPayloads] = useState<Record<string, TodoPayload>>(
    {},
  )
  const [failedTodoIds, setFailedTodoIds] = useState<Record<string, true>>({})

  const todos = useMemo(
    () => items.filter((item) => item.type === 'todo'),
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
  } = useVaultFolders('todo')

  useEffect(() => {
    if (!masterKey) {
      setTodoPayloads({})
      setFailedTodoIds({})
      return
    }

    let isMounted = true

    const decryptTodos = async () => {
      const nextPayloads: Record<string, TodoPayload> = {}
      const nextFailures: Record<string, true> = {}

      await Promise.all(
        todos.map(async (item) => {
          try {
            const encryptedContent = getStringContent(item.content)
            if (!encryptedContent) {
              nextFailures[item.id] = true
              return
            }

            const decrypted = await decryptData(encryptedContent, masterKey)
            if (!decrypted) {
              nextFailures[item.id] = true
              return
            }

            const parsed = parseJsonSafely<unknown>(decrypted)
            const payload = normalizeTodoPayload(parsed, item.title)
            if (!payload) {
              nextFailures[item.id] = true
              return
            }

            nextPayloads[item.id] = payload
          } catch {
            nextFailures[item.id] = true
          }
        }),
      )

      if (!isMounted) return
      setTodoPayloads(nextPayloads)
      setFailedTodoIds(nextFailures)
    }

    void decryptTodos()

    return () => {
      isMounted = false
    }
  }, [todos, masterKey])

  const normalizedSearchQuery = useMemo(
    () => searchQuery.trim().toLowerCase(),
    [searchQuery],
  )

  const categoryFilters = useMemo(() => {
    const folderByKey = new Map<string, string>()
    for (const folder of folders) {
      const key = normalizeCategoryKey(folder)
      if (key && !folderByKey.has(key)) {
        folderByKey.set(key, folder)
      }
    }

    const seenKeys = new Set<string>()
    const filters: Array<{
      key: string
      label: string
      folderValue: string | null
    }> = [{ key: 'all', label: 'All', folderValue: null }]

    for (const rawName of [...DEFAULT_TODO_CATEGORIES, ...folders]) {
      const key = normalizeCategoryKey(rawName)
      if (!key || seenKeys.has(key)) continue
      seenKeys.add(key)

      const existingFolder = folderByKey.get(key)
      const folderValue = existingFolder || formatCategoryLabel(rawName)
      filters.push({
        key,
        label: formatCategoryLabel(folderValue),
        folderValue,
      })
    }

    return filters
  }, [folders])

  const activeCategoryKey = useMemo(
    () => (currentFolder ? normalizeCategoryKey(currentFolder) : 'all'),
    [currentFolder],
  )

  const filteredTodos = useMemo(
    () =>
      sortPinnedFirst(
        todos.filter((item) => {
          const payload = todoPayloads[item.id]
          const task = payload?.task || item.title
          const dueDate = payload?.dueDate || ''
          const priority = payload?.priority || ''
          const matchesSearch =
            normalizedSearchQuery.length === 0 ||
            task.toLowerCase().includes(normalizedSearchQuery) ||
            item.id.toLowerCase().includes(normalizedSearchQuery) ||
            dueDate.toLowerCase().includes(normalizedSearchQuery) ||
            priority.toLowerCase().includes(normalizedSearchQuery) ||
            (item.folder || '').toLowerCase().includes(normalizedSearchQuery)
          const matchesFolder =
            normalizedSearchQuery.length > 0 ||
            currentFolder === null ||
            normalizeCategoryKey(item.folder) ===
              normalizeCategoryKey(currentFolder)
          return matchesSearch && matchesFolder
        }),
      ),
    [todos, todoPayloads, normalizedSearchQuery, currentFolder],
  )

  const getFolderCount = (folder: string | null) =>
    todos.filter((todo) =>
      folder === null
        ? true
        : normalizeCategoryKey(todo.folder) === normalizeCategoryKey(folder),
    ).length

  const resetCreateForm = () => {
    setNewTodo(EMPTY_TODO)
    setIsAdding(false)
  }

  const setTodoSaving = (itemId: string, saving: boolean) => {
    setSavingTodoIds((prev) =>
      saving
        ? prev.includes(itemId)
          ? prev
          : [...prev, itemId]
        : prev.filter((id) => id !== itemId),
    )
  }

  const persistTodoPayload = async (
    item: VaultItem,
    payload: TodoPayload,
    options?: { closeEditor?: boolean },
  ): Promise<boolean> => {
    if (!masterKey) {
      toast.error('Unlock the vault before saving todos')
      return false
    }

    const nextPayload = sanitizeTodoPayload(payload)
    if (!nextPayload) {
      toast.error('Task is required')
      return false
    }

    if (savingTodoIds.includes(item.id)) return false

    setTodoSaving(item.id, true)
    try {
      const encryptedData = await encryptData(
        JSON.stringify(nextPayload),
        masterKey,
      )

      await updateItem(item.id, {
        title: ENCRYPTED_TODO_TITLE,
        content: encryptedData,
      })

      setTodoPayloads((prev) => ({
        ...prev,
        [item.id]: nextPayload,
      }))

      if (options?.closeEditor) {
        setEditingId(null)
        setEditingTodo(EMPTY_TODO)
      }

      return true
    } catch {
      toast.error('Failed to update todo')
      return false
    } finally {
      setTodoSaving(item.id, false)
    }
  }

  const handleAddTodo = async () => {
    const task = newTodo.task.trim()
    if (!masterKey) {
      toast.error('Unlock the vault before saving todos')
      return
    }
    if (!task) {
      toast.error('Task is required')
      return
    }

    setIsSaving(true)
    try {
      const payload = sanitizeTodoPayload({
        ...newTodo,
        task,
      })
      if (!payload) {
        toast.error('Task is required')
        return
      }

      const encryptedData = await encryptData(
        JSON.stringify(payload),
        masterKey,
      )

      await addItem({
        type: 'todo',
        title: ENCRYPTED_TODO_TITLE,
        content: encryptedData,
        folder: currentFolder || undefined,
      })

      toast.success('Todo saved securely')
      logActivity({
        actionType: 'item_create',
        itemName: ENCRYPTED_TODO_TITLE,
        description: 'Todo created',
        status: 'success',
      })
      resetCreateForm()
    } catch {
      toast.error('Failed to save todo')
    } finally {
      setIsSaving(false)
    }
  }

  const startEdit = (item: VaultItem) => {
    const payload = todoPayloads[item.id]
    if (!payload) {
      toast.error('Unable to decrypt this todo for editing')
      return
    }

    setEditingId(item.id)
    setEditingTodo(payload)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingTodo(EMPTY_TODO)
  }

  const handleDeleteTodo = async (item: VaultItem) => {
    const payload = todoPayloads[item.id]
    const taskLabel = payload?.task || 'this todo'
    if (!confirm(`Delete todo "${taskLabel}"?`)) return

    try {
      await removeItem(item.id)
      toast.success('Todo deleted')
      logActivity({
        actionType: 'item_delete',
        itemName: ENCRYPTED_TODO_TITLE,
        description: 'Todo deleted',
        status: 'success',
      })
    } catch {
      toast.error('Failed to delete todo')
    }
  }

  const handleToggleCompleted = async (item: VaultItem) => {
    const payload = todoPayloads[item.id]
    if (!payload) {
      toast.error('Unable to decrypt this todo')
      return
    }

    const saved = await persistTodoPayload(item, {
      ...payload,
      completed: !payload.completed,
    })
    if (saved) {
      toast.success(
        payload.completed ? 'Marked as pending' : 'Marked as complete',
      )
    }
  }

  const handleSaveEdit = async (item: VaultItem) => {
    const saved = await persistTodoPayload(item, editingTodo, {
      closeEditor: true,
    })
    if (saved) {
      toast.success('Todo updated')
    }
  }

  return (
    <div className="relative flex h-full min-h-0 gap-6">
      <FolderSidebar
        items={todos}
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
        title="Todo Lists"
        allItemLabel="All Todos"
        allItemIcon={<ListTodo className="h-4 w-4" />}
      />

      <MobileFolderMenu
        isOpen={isMobileFolderOpen}
        onClose={() => setIsMobileFolderOpen(false)}
        items={todos}
        folders={folders}
        currentFolder={currentFolder}
        setCurrentFolder={setCurrentFolder}
        isAddingFolder={isAddingFolder}
        setIsAddingFolder={setIsAddingFolder}
        newFolderName={newFolderName}
        setNewFolderName={setNewFolderName}
        handleCreateFolder={handleCreateFolder}
        editingFolder={editingFolder}
        setEditingFolder={setEditingFolder}
        editingFolderName={editingFolderName}
        setEditingFolderName={setEditingFolderName}
        handleRenameFolder={handleRenameFolder}
        handleDeleteFolder={handleDeleteFolder}
        title="Todo Lists"
        allItemLabel="All Todos"
        allItemIcon={<ListTodo className="h-4 w-4" />}
      />

      <div className="flex-1 min-w-0 flex flex-col h-full overflow-y-auto custom-scrollbar space-y-6 pr-2">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1
                className="truncate text-3xl font-bold text-text transition-colors"
                title={
                  normalizedSearchQuery.length > 0
                    ? 'Search Results'
                    : currentFolder || 'Todos'
                }
              >
                {normalizedSearchQuery.length > 0
                  ? 'Search Results'
                  : currentFolder || 'Todos'}
              </h1>
              <span className="whitespace-nowrap rounded-full border border-text/10 bg-text/5 px-2.5 py-0.5 text-xs font-bold text-text/50 shadow-inner">
                {normalizedSearchQuery.length > 0
                  ? filteredTodos.length
                  : getFolderCount(currentFolder)}{' '}
                items
              </span>
            </div>
            <p className="truncate text-text/50 transition-colors">
              Securely manage your todo list with encrypted task details.
            </p>
          </div>

          <div className="shrink-0 flex gap-2">
            <Button
              onClick={() => setIsAdding(true)}
              size="sm"
              className="hidden transition-all sm:flex"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Todo
            </Button>
            <Button
              onClick={() => setIsAdding(true)}
              size="icon"
              className="flex transition-all sm:hidden"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex max-w-md w-full items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/30 transition-colors" />
            <Input
              placeholder="Search todos by task, priority, or category..."
              className="w-full pl-10 pr-10"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-text/30 transition-colors hover:bg-white/10 hover:text-text/60"
                aria-label="Clear todo search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="flex h-10 w-10 shrink-0 rounded-xl border-white/5 bg-white/5 lg:hidden hover:bg-white/10"
            onClick={() => setIsMobileFolderOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2 sm:gap-3 md:gap-3 overflow-x-auto overflow-y-hidden px-3 sm:px-4 md:px-6 py-7 sm:py-7 md:py-7 snap-x snap-mandatory scroll-smooth overscroll-x-contain touch-pan-x whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
          {categoryFilters.map((filter) => {
            const isActive = filter.key === activeCategoryKey
            return (
              <button
                key={filter.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => setCurrentFolder(filter.folderValue)}
                className={`inline-flex shrink-0 snap-start last:mr-2 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/45 ${
                  isActive
                    ? 'border-emerald-300/45 bg-emerald-400/20 text-emerald-200 shadow-[0_6px_14px_-10px_rgba(52,211,153,0.9)]'
                    : 'border-white/10 bg-white/[0.05] text-text/65 hover:border-white/20 hover:bg-white/[0.1] hover:text-text/90'
                }`}
              >
                <span
                  className={`rounded-full px-1 py-0.5 text-[9px] font-bold leading-none ${
                    isActive
                      ? 'bg-emerald-900/40 text-emerald-100'
                      : 'bg-black/25 text-text/75'
                  }`}
                >
                  {getFolderCount(filter.folderValue)}
                </span>
                <span>{filter.label}</span>
              </button>
            )
          })}
        </div>
        <AnimatePresence>
          {isAdding && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Card className="border-white/10 bg-gradient-to-br from-white/10 to-transparent backdrop-blur-md">
                <CardHeader>
                  <CardTitle className="text-lg text-text transition-colors">
                    New Todo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Input
                    placeholder="What needs to be done?"
                    value={newTodo.task}
                    onChange={(event) => {
                      const value = event.target.value
                      setNewTodo((prev) => ({
                        ...prev,
                        task: value,
                      }))
                    }}
                    maxLength={120}
                    className="h-12 sm:h-11 w-full rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent text-sm sm:text-[15px] font-medium text-text placeholder:text-text/40 backdrop-blur-xl shadow-lg shadow-black/20 transition-all duration-300 hover:border-orange-400/30 hover:bg-white/10 focus:border-orange-400/50 focus:ring-4"
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-text/40">
                        Due Date
                      </p>
                      <TodoDueDateField
                        value={newTodo.dueDate}
                        onChange={(dueDate) =>
                          setNewTodo((prev) => ({
                            ...prev,
                            dueDate,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-text/40">
                        Priority
                      </p>
                      <div className="relative w-full">
                        {/* Glow Effect */}
                        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-orange-500/5 via-emerald-500/5 to-cyan-500/5 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100" />

                        <select
                          value={newTodo.priority}
                          onChange={(event) => {
                            const value = event.target.value
                            setNewTodo((prev) => ({
                              ...prev,
                              priority: normalizePriority(value),
                            }))
                          }}
                          className="
      peer
      h-12
      sm:h-11
      w-full
      appearance-none
      rounded-2xl
      border
      border-white/10
      bg-gradient-to-br
      from-white/10
      via-white/5
      to-transparent
      backdrop-blur-xl
      px-4
      pr-12
      text-sm
      sm:text-[15px]
      font-medium
      text-text
      shadow-lg
      shadow-black/20
      transition-all
      duration-300
      hover:border-orange-400/30
      hover:bg-white/10
      focus:border-orange-400/60
      focus:outline-none
      focus:ring-4
      focus:ring-orange-400/15
      active:scale-[0.99]
      cursor-pointer
      [color-scheme:dark]
    "
                        >
                          <option
                            value="none"
                            className="text-black"
                            style={{ color: '#000000' }}
                          >
                            ⚪ None
                          </option>
                          <option
                            value="low"
                            className="text-black"
                            style={{ color: '#000000' }}
                          >
                            🟢 Low
                          </option>
                          <option
                            value="medium"
                            className="text-black"
                            style={{ color: '#000000' }}
                          >
                            🟡 Medium
                          </option>
                          <option
                            value="high"
                            className="text-black"
                            style={{ color: '#000000' }}
                          >
                            🟠 High
                          </option>
                          <option
                            value="critical"
                            className="text-black"
                            style={{ color: '#000000' }}
                          >
                            🔴 Critical
                          </option>
                        </select>

                        <div
                          className="
      pointer-events-none
      absolute
      right-3
      top-1/2
      -translate-y-1/2
      flex
      h-8
      w-8
      items-center
      justify-center
      rounded-lg
      bg-white/5
      transition-all
      duration-300
      peer-focus:bg-orange-400/10
      peer-focus:text-orange-300
    "
                        >
                          <ChevronDown className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 border-t border-white/5 pt-2">
                    <Button variant="ghost" onClick={resetCreateForm}>
                      Cancel
                    </Button>
                    <Button
                      className="min-w-[120px] bg-orange-400 text-white hover:bg-orange-500 focus-visible:ring-2 focus-visible:ring-orange-300/50"
                      onClick={handleAddTodo}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Todo'
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {filteredTodos.length === 0 && !isAdding && (
          <div
            className="flex cursor-pointer flex-col items-center justify-center py-20 opacity-40 transition-opacity hover:opacity-70"
            onClick={() => setIsAdding(true)}
          >
            <ListTodo className="mb-4 h-16 w-16" />
            <p className="text-lg">No todos found.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 pb-8 lg:grid-cols-2">
          {filteredTodos.map((item) => {
            const payload = todoPayloads[item.id]
            const isFailed = Boolean(failedTodoIds[item.id])
            const isEditing = editingId === item.id
            const todo = isEditing ? editingTodo : payload
            const isPinning = pinningItemIds.includes(item.id)
            const isTodoSaving = savingTodoIds.includes(item.id)

            return (
              <div
                key={item.id}
                draggable
                onDragStart={(event) => setDraggedVaultItem(event, item.id)}
                onTouchStart={(event) =>
                  setDraggedVaultItem(event as any, item.id)
                }
                title="Drag to a folder to move this todo"
              >
                <Card className="group relative h-full overflow-hidden border-white/5 bg-gradient-to-br from-white/[0.08] to-transparent backdrop-blur-md transition-all hover:border-white/20">
                  <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-orange-500/10 blur-3xl transition-opacity group-hover:opacity-30" />
                  <CardHeader className="relative z-10 border-b border-white/5 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <button
                          type="button"
                          aria-label={
                            todo?.completed
                              ? 'Mark todo as pending'
                              : 'Mark todo as complete'
                          }
                          onClick={() => void handleToggleCompleted(item)}
                          disabled={!payload || isTodoSaving}
                          className="mt-0.5 text-text/60 transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isTodoSaving ? (
                            <Loader2 className="h-5 w-5 animate-spin text-emerald-300" />
                          ) : todo?.completed ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                          ) : (
                            <Circle className="h-5 w-5" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <Input
                              value={editingTodo.task}
                              onChange={(event) => {
                                const value = event.target.value
                                setEditingTodo((prev) => ({
                                  ...prev,
                                  task: value,
                                }))
                              }}
                              autoFocus
                            />
                          ) : (
                            <CardTitle
                              className={`truncate text-base ${todo?.completed ? 'line-through text-text/45' : 'text-text'}`}
                            >
                              {todo?.task || item.title}
                            </CardTitle>
                          )}
                        </div>
                      </div>
                      <div className="relative z-20 flex gap-1">
                        {isEditing ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Cancel edit"
                              className="h-8 w-8 rounded-full hover:bg-white/10"
                              onClick={cancelEdit}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Save todo changes"
                              className="h-8 w-8 rounded-full text-green-400 hover:bg-green-400/20"
                              onClick={() => void handleSaveEdit(item)}
                              disabled={isTodoSaving}
                            >
                              {isTodoSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Edit todo"
                              className="h-8 w-8 rounded-full text-text/25 transition-colors hover:bg-white/10 hover:text-text/70"
                              onClick={() => startEdit(item)}
                              disabled={!payload}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={
                                item.isPinned ? 'Unpin todo' : 'Pin todo'
                              }
                              disabled={isPinning}
                              className={`h-8 w-8 rounded-full ${item.isPinned ? 'text-teal-400 hover:bg-teal-400/20' : 'text-text/25 hover:bg-white/10 hover:text-text/70'} transition-colors`}
                              onClick={() => void togglePin(item.id)}
                            >
                              {isPinning ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Pin
                                  className={`h-3.5 w-3.5 ${item.isPinned ? 'fill-current' : ''}`}
                                />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Delete todo"
                              className="h-8 w-8 rounded-full text-text/25 transition-colors hover:bg-red-400/20 hover:text-red-400"
                              onClick={() => void handleDeleteTodo(item)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="relative z-10 space-y-4 overflow-hidden p-5 sm:p-6">
                    {isFailed && (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        This todo could not be decrypted with the current key.
                      </div>
                    )}

                    {todo && (
                      <>
                        {isEditing ? (
                          <>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <TodoDueDateField
                                value={editingTodo.dueDate}
                                onChange={(dueDate) =>
                                  setEditingTodo((prev) => ({
                                    ...prev,
                                    dueDate,
                                  }))
                                }
                              />
                              <select
                                value={editingTodo.priority}
                                onChange={(event) => {
                                  const value = event.target.value
                                  setEditingTodo((prev) => ({
                                    ...prev,
                                    priority: normalizePriority(value),
                                  }))
                                }}
                                className="h-10 w-full rounded-xl border border-white/5 bg-white/5 px-3 text-sm text-text focus:border-white/20 focus:outline-none [&>option]:bg-white [&>option]:text-slate-900"
                              >
                                <option
                                  value="none"
                                  className="text-black"
                                  style={{ color: '#000000' }}
                                >
                                  None
                                </option>
                                <option
                                  value="low"
                                  className="text-black"
                                  style={{ color: '#000000' }}
                                >
                                  Low
                                </option>
                                <option
                                  value="medium"
                                  className="text-black"
                                  style={{ color: '#000000' }}
                                >
                                  Medium
                                </option>
                                <option
                                  value="high"
                                  className="text-black"
                                  style={{ color: '#000000' }}
                                >
                                  High
                                </option>
                                <option
                                  value="critical"
                                  className="text-black"
                                  style={{ color: '#000000' }}
                                >
                                  Critical
                                </option>
                              </select>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                              <span
                                className={`
      inline-flex
      shrink-0
      items-center
      gap-1
      rounded-full
      border
      px-2.5
      py-1
      text-[10px]
      font-bold
      uppercase
      tracking-[0.16em]
      ${priorityTone[todo.priority]}
    `}
                              >
                                <Flag className="h-3 w-3 flex-shrink-0" />
                                <span>{todo.priority}</span>
                              </span>

                              {todo.dueDate && (
                                <span
                                  className="
        flex
        min-w-0
        flex-1
        items-center
        gap-1
        rounded-xl
        border
        border-sky-400/20
        bg-sky-400/10
        px-3
        py-1.5
        text-[10px]
        font-bold
        text-sky-300
      "
                                >
                                  <CalendarClock className="h-3 w-3 shrink-0" />

                                  <span className="truncate">
                                    {formatDueDateLabel(todo.dueDate)}
                                  </span>
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </>
                    )}

                    <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
                      <span className="text-[9px] text-text/20 transition-colors">
                        Updated {new Date(item.updatedAt).toLocaleDateString()}
                      </span>
                      <motion.div
                        initial={{ opacity: 0.7 }}
                        animate={{ opacity: 1 }}
                        transition={{
                          repeat: Infinity,
                          duration: 2,
                          repeatType: 'reverse',
                        }}
                        title="End-to-end encrypted with AES-256-GCM"
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/5 border border-emerald-500/10 text-emerald-400/60 font-bold cursor-help"
                      >
                        <ShieldCheck className="h-2.5 w-2.5" />
                        <span className="text-[8px] uppercase tracking-wider">
                          Secure 256
                        </span>
                      </motion.div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
