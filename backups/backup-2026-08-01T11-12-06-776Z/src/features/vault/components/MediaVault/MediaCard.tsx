import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Eye,
  Move,
  Download,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  ImageIcon,
  Folder,
  HardDrive,
  Pin,
  Loader2,
  PlayCircle,
} from 'lucide-react'
import { Button } from '../../../../components/ui/Button'
import { SafeMedia } from './SafeMedia'
import { setDraggedVaultItem } from '../../../../lib/vaultDragDrop'
import { ErrorBoundary } from './ErrorBoundary'
import { cn } from '../../../../lib/utils'
import { VaultItem } from '../../../../lib/storage'

interface MediaCardProps {
  item: VaultItem
  idx: number
  type: 'photo' | 'video'
  masterKey: string | CryptoKey | null
  isSelected: boolean
  moveMenuOpenId: string | null
  folders: string[]
  onPreview: (id: string, title: string) => void
  onMoveMenuToggle: (id: string | null) => void
  onMoveToFolder: (itemId: string, folder: string | null) => void
  onDownload: (item: VaultItem) => void
  onDelete: (id: string, title: string) => void
  onTogglePin: (id: string) => void
  isPinning: boolean
  lightweightPreviewMode: boolean
}

const MediaCardComponent: React.FC<MediaCardProps> = ({
  item,
  idx,
  type,
  masterKey,
  isSelected,
  moveMenuOpenId,
  folders,
  onPreview,
  onMoveMenuToggle,
  onMoveToFolder,
  onDownload,
  onDelete,
  onTogglePin,
  isPinning,
  lightweightPreviewMode,
}) => {
  const stopPointerPropagation = (e: React.PointerEvent) => {
    e.stopPropagation()
  }

  const stopClickPropagation = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const rawLiveCapture = item.metadata?.isLiveCapture
  const isLiveCapture =
    rawLiveCapture === true ||
    rawLiveCapture === 'true' ||
    rawLiveCapture === 1 ||
    rawLiveCapture === '1'

  return (
    <motion.div
      role="button"
      draggable
      onDragStartCapture={(event) =>
        setDraggedVaultItem(event, item.id)
      }
        aria-selected={isSelected}
        tabIndex={0}
        aria-label={item.title}
        layout
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        whileHover={{ y: -5, scale: 1.02 }}
        transition={{
          delay: idx * 0.02,
          type: 'spring',
          stiffness: 300,
          damping: 20,
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onPreview(item.id, item.title)
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault()
            const next = e.currentTarget.nextElementSibling as HTMLElement
            if (next) next.focus()
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault()
            const prev = e.currentTarget.previousElementSibling as HTMLElement
            if (prev) prev.focus()
          }
        }}
        className={cn(
          'group relative rounded-3xl border border-white/10 bg-black/20 backdrop-blur-md transition-all hover:border-white/40 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-100 focus-visible:ring-offset-2 focus-visible:ring-offset-black/50 select-none cursor-grab active:cursor-grabbing',
          moveMenuOpenId === item.id ? 'z-50' : 'z-10',
        )}
        title="Drag to a folder to move this item"
        style={{
          aspectRatio:
            typeof item.metadata?.aspectRatio === 'number' &&
            item.metadata.aspectRatio > 0
              ? String(item.metadata.aspectRatio)
              : type === 'video'
                ? '16 / 9'
                : '16 / 10',
        }}
      >
        <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
          {isLiveCapture ? (
            <div
              className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400 backdrop-blur-md border border-emerald-500/30 shadow-lg"
              title="Live Capture"
            >
              <ShieldCheck className="h-3 w-3" />
            </div>
          ) : (
            <div
              className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded-lg bg-blue-500/20 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-400 backdrop-blur-md border border-blue-500/30 shadow-lg"
              title="Storage Upload"
            >
              <HardDrive className="h-3 w-3" />
            </div>
          )}
          <ErrorBoundary
            fallback={
              <div className="flex h-full w-full items-center justify-center bg-red-400/10">
                <AlertTriangle className="h-6 w-6 text-red-400/60" />
              </div>
            }
          >
            {masterKey && !(lightweightPreviewMode && type === 'video') && (
              <SafeMedia
                item={item}
                masterKey={masterKey}
                type={type}
                isThumbnail={true}
                autoPlayVideo={false}
                className="h-full w-full object-cover transition-all duration-700 group-hover:scale-105"
              />
            )}
            {lightweightPreviewMode && type === 'video' && (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 via-black to-slate-800">
                <PlayCircle className="h-12 w-12 text-white/40" />
              </div>
            )}
          </ErrorBoundary>

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-70 sm:opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>

        {/* Floating Action Buttons */}
        <div className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-100 sm:opacity-0 transition-all duration-300 group-hover:opacity-100 sm:translate-y-4 group-hover:translate-y-0 text-white touch-pan-y pointer-events-none">
          <Button
            size="icon"
            variant="ghost"
            onPointerDown={stopPointerPropagation}
            onClick={(e) => {
              stopClickPropagation(e)
              onPreview(item.id, item.title)
            }}
            className="h-8 w-8 rounded-full bg-white/10 text-white backdrop-blur-xl hover:bg-white/20 hover:scale-110 transition-all border border-white/20 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 pointer-events-auto"
            title={`Preview ${item.title}`}
            aria-label={`Preview ${item.title}`}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <div className="relative">
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Move ${item.title}`}
              className={cn(
                'h-8 w-8 rounded-full bg-white/10 text-white backdrop-blur-xl hover:bg-white/20 hover:scale-110 transition-all border border-white/20 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 pointer-events-auto',
                moveMenuOpenId === item.id && 'bg-white/30',
              )}
              onPointerDown={stopPointerPropagation}
              onClick={(e) => {
                stopClickPropagation(e)
                onMoveMenuToggle(moveMenuOpenId === item.id ? null : item.id)
              }}
            >
              <Move className="h-3.5 w-3.5" />
            </Button>
            <AnimatePresence>
              {moveMenuOpenId === item.id && (
                <motion.div key="media-move-menu-overlay" className="contents">
                  <motion.div
                    key="media-move-menu-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100]"
                    onClick={(e) => {
                      e.stopPropagation()
                      onMoveMenuToggle(null)
                    }}
                  />
                  <motion.div
                    key="media-move-menu-dropdown"
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-56 flex-col rounded-2xl border border-white/10 bg-black/80 p-1 shadow-2xl backdrop-blur-2xl z-[101] flex pointer-events-auto"
                  >
                    <p className="px-3 py-2 text-[9px] font-bold text-white/40 uppercase tracking-widest">
                      Move to Album
                    </p>

                    <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2.5 mb-1 bg-white/[0.02] rounded-xl">
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.15)] overflow-hidden">
                        {masterKey ? (
                          <SafeMedia
                            item={item}
                            masterKey={masterKey}
                            type={type}
                            isThumbnail={true}
                            autoPlayVideo={false}
                            className="h-full w-full object-cover"
                          />
                        ) : type === 'photo' ? (
                          <ImageIcon className="h-4 w-4" />
                        ) : (
                          <PlayCircle className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="truncate text-xs font-semibold text-white/95" title={item.title}>
                          {item.title}
                        </span>
                        <span className="flex items-center gap-1 text-[9px] text-white/45">
                          <span>Album:</span>
                          <span className="truncate max-w-[100px] font-medium text-blue-400" title={item.folder || (type === 'photo' ? 'All Photos' : 'All Videos')}>
                            {item.folder || (type === 'photo' ? 'All Photos' : 'All Videos')}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="max-h-[108px] overflow-y-auto custom-scrollbar">
                      <button
                        aria-label="move to"
                        className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/10 flex items-center gap-2 transition-colors text-white"
                        onClick={(e) => {
                          e.stopPropagation()
                          onMoveToFolder(item.id, null)
                          onMoveMenuToggle(null)
                        }}
                      >
                        <ImageIcon className="h-3 w-3 opacity-40 text-blue-400" />
                        {type === 'photo' ? 'All Photos' : 'All Videos'}
                      </button>
                      {folders.map((f) => (
                        <button
                          key={f}
                          title={f}
                          className="w-full rounded-xl px-3 py-2 text-left text-xs hover:bg-white/10 flex items-center gap-2 transition-colors text-white"
                          onClick={(e) => {
                            e.stopPropagation()
                            onMoveToFolder(item.id, f)
                            onMoveMenuToggle(null)
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
            size="icon"
            variant="ghost"
            aria-label={`Download ${item.title}`}
            onPointerDown={stopPointerPropagation}
            onClick={(e) => {
              stopClickPropagation(e)
              onDownload(item)
            }}
            className="h-8 w-8 rounded-full bg-white/10 text-white backdrop-blur-xl hover:bg-white/20 hover:scale-110 transition-all border border-white/20 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 pointer-events-auto"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`${item.isPinned ? 'Unpin' : 'Pin'} ${item.title}`}
            onPointerDown={stopPointerPropagation}
            onClick={(e) => {
              stopClickPropagation(e)
              onTogglePin(item.id)
            }}
            disabled={isPinning}
            className={cn(
              'h-8 w-8 rounded-full backdrop-blur-xl hover:scale-110 transition-all border shadow-2xl focus-visible:outline-none focus-visible:ring-2 pointer-events-auto',
              item.isPinned
                ? type === 'photo'
                  ? 'bg-blue-500/20 text-blue-300 border-blue-400/40 hover:bg-blue-500/30 focus-visible:ring-blue-300/50'
                  : 'bg-purple-500/20 text-purple-300 border-purple-400/40 hover:bg-purple-500/30 focus-visible:ring-purple-300/50'
                : 'bg-white/10 text-white border-white/20 hover:bg-white/20 focus-visible:ring-white/50',
            )}
          >
            {isPinning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Pin
                className={cn('h-3.5 w-3.5', item.isPinned && 'fill-current')}
              />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Delete ${item.title}`}
            onPointerDown={stopPointerPropagation}
            onClick={(e) => {
              stopClickPropagation(e)
              onDelete(item.id, item.title)
            }}
            className="h-8 w-8 rounded-full bg-red-500/10 text-red-500 backdrop-blur-xl hover:bg-red-500/20 hover:scale-110 transition-all border border-red-500/20 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 pointer-events-auto"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </motion.div>
  )
}

export const MediaCard = React.memo(
  MediaCardComponent,
  (prev, next) =>
    prev.item === next.item &&
    prev.idx === next.idx &&
    prev.type === next.type &&
    prev.masterKey === next.masterKey &&
    prev.isSelected === next.isSelected &&
    prev.moveMenuOpenId === next.moveMenuOpenId &&
    prev.folders === next.folders &&
    prev.onPreview === next.onPreview &&
    prev.onMoveMenuToggle === next.onMoveMenuToggle &&
    prev.onMoveToFolder === next.onMoveToFolder &&
    prev.onDownload === next.onDownload &&
    prev.onDelete === next.onDelete &&
    prev.onTogglePin === next.onTogglePin &&
    prev.isPinning === next.isPinning,
)
