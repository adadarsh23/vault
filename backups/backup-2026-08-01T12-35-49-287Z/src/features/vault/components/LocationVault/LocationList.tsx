import React, { useRef, useState } from 'react'
import { cn } from '../../../../lib/utils'
import { Button } from '../../../../components/ui/Button'
import { SearchInput } from '../../../../components/ui/SearchInput'
import {
  Plus,
  MapPin,
  Search,
  ChevronRight,
  ChevronUp,
  Menu,
  Navigation,
  Pin,
  Loader2,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { ScrollButton } from '../../../../components/vault/ScrollButton'
import { setDraggedVaultItem } from '../../../../lib/vaultDragDrop'
import { X } from 'lucide-react'

export interface LocationListProps {
  locations: any[]
  filteredLocations: any[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  isCreating: boolean
  setIsCreating: (isCreating: boolean) => void
  setIsEditing: (isEditing: boolean) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  currentFolder: string | null
  startCreate: () => void
  captureCurrentLocation: () => Promise<void>
  isCapturing: boolean
  setIsMobileFolderOpen: (isOpen: boolean) => void
  onTogglePin: (id: string) => void
  pinningItemIds: string[]
}

export const LocationList: React.FC<LocationListProps> = ({
  locations,
  filteredLocations,
  selectedId,
  setSelectedId,
  isCreating,
  setIsCreating,
  setIsEditing,
  searchQuery,
  setSearchQuery,
  currentFolder,
  startCreate,
  captureCurrentLocation,
  isCapturing,
  setIsMobileFolderOpen,
  onTogglePin,
  pinningItemIds,
}) => {
  const [showListScrollTop, setShowListScrollTop] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const suggestions = React.useMemo(() => {
    if (!locations) return []
    return locations.map((item) => item.title).filter(Boolean)
  }, [locations])

  const headerTitle = currentFolder || 'Locations'
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
        selectedId || isCreating ? 'hidden md:flex' : 'flex',
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
            {filteredLocations.length} items
          </span>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            onClick={startCreate}
            size="sm"
            className="hidden sm:flex transition-all"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Location
          </Button>
          <Button
            size="icon"
            variant="secondary"
            onClick={startCreate}
            className="flex sm:hidden rounded-xl w-10 h-10 bg-white/5 hover:bg-white/10 border-white/5"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 w-full">
        <div className="relative group flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/20 group-focus-within:text-emerald-400 transition-colors z-10 pointer-events-none" />
          <SearchInput
            placeholder="Search locations by name or ID..."
            className="pl-10 pr-10 h-10 text-sm bg-white/5 border-white/5 focus:border-emerald-500/30 rounded-xl w-full"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            suggestions={suggestions}
            historyKey="locations"
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

      <Button
        onClick={() => void captureCurrentLocation()}
        variant="outline"
        disabled={isCapturing}
        className="justify-start rounded-xl border-white/5 bg-white/5 hover:bg-white/10 h-11"
      >
        <Navigation
          className={cn('mr-3 h-4 w-4 text-lime-400', isCapturing && 'animate-pulse')}
        />
        <span className="text-sm font-medium">
          {isCapturing ? 'Capturing...' : 'Capture Current Location'}
        </span>
      </Button>

      <div className="relative flex-1 min-h-0">
        <div
          ref={listRef}
          onScroll={(e) =>
            setShowListScrollTop(e.currentTarget.scrollTop > 200)
          }
          className="h-full overflow-y-auto space-y-3 pr-2 custom-scrollbar"
        >
          {filteredLocations.map((item, idx) => (
            <motion.div
              key={item.id}
              role="button"
              tabIndex={0}
              draggable
              onDragStartCapture={(event) =>
                setDraggedVaultItem(event, item.id)
              }
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
              transition={{ delay: idx * 0.03 }}
              onClick={() => {
                setSelectedId(item.id)
                setIsCreating(false)
                setIsEditing(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedId(item.id)
                  setIsCreating(false)
                  setIsEditing(false)
                }
              }}
              className={cn(
                'w-full rounded-2xl border p-4 text-left transition-all',
                selectedId === item.id
                  ? 'border-emerald-500/20 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.05)]'
                  : 'border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/10',
              )}
              title="Drag to a folder to move this location"
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    'rounded-xl p-2 transition-colors',
                    selectedId === item.id
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-white/5 text-text/20',
                  )}
                >
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'truncate text-sm font-semibold transition-colors',
                      selectedId === item.id ? 'text-text' : 'text-text/70',
                    )}
                  >
                    {item.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-text/30 font-medium tracking-tight">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </span>
                    {item.folder && (
                      <>
                        <span className="text-[8px] text-text/10">•</span>
                        <span className="text-[10px] text-emerald-400/40 font-bold uppercase tracking-tighter truncate max-w-[100px]">
                          {item.folder}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={pinningItemIds.includes(item.id)}
                  onClick={(event) => {
                    event.stopPropagation()
                    onTogglePin(item.id)
                  }}
                  className={cn(
                    'h-8 w-8 rounded-full transition-all',
                    item.isPinned
                      ? 'text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20'
                      : 'text-text/30 hover:text-text/80 hover:bg-white/10',
                  )}
                  title={item.isPinned ? 'Unpin location' : 'Pin location'}
                >
                  {pinningItemIds.includes(item.id) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Pin className={cn('h-4 w-4', item.isPinned && 'fill-current')} />
                  )}
                </Button>
                {selectedId === item.id && (
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
