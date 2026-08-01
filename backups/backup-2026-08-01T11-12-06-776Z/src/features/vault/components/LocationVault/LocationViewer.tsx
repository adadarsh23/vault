import React, { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar,
  Check,
  ChevronLeft,
  Clock,
  Copy,
  Edit2,
  ShieldCheck,
  Trash2,
  ChevronUp,
  Map as MapIcon,
} from 'lucide-react'
import { cn } from '../../../../lib/utils'
import { Button } from '../../../../components/ui/Button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/Card'
import { Input } from '../../../../components/ui/Input'
import { ScrollButton } from '../../../../components/vault/ScrollButton'
import { MapPreview } from '../../../../components/vault/MapPreview'
import { GlobalNavigator } from '../../../../components/vault/GlobalNavigator'
import { parseCoordinate } from '../../../../lib/utils'

interface LocationPayload {
  latitude: number
  longitude: number
  address: string
  notes: string
  accuracy?: number
  altitude?: number | null
  capturedAt: number
}

interface FormState {
  title: string
  latitude: string
  longitude: string
  address: string
  notes: string
  accuracy: string
  altitude: string
}

const Editor = ({
  form,
  setForm,
  onSave,
  onCancel,
  onCapture,
  onFetchAddress,
  isCapturing,
  isSaving,
  isFetchingAddress,
  label,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  onSave: () => Promise<void>
  onCancel: () => void
  onCapture: () => Promise<void>
  onFetchAddress: () => Promise<void>
  isCapturing: boolean
  isSaving: boolean
  isFetchingAddress: boolean
  label: string
}) => (
  <Card className="flex h-full flex-col border-none bg-card-bg/30 shadow-none overflow-hidden">
    <CardHeader className="flex flex-row items-center gap-2 border-b border-card-border py-3 md:py-4 px-4 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        onClick={onCancel}
        className="md:hidden h-8 w-8 -ml-2 shrink-0 text-text/60 hover:text-white"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <CardTitle className="text-xl font-bold text-text truncate">{label}</CardTitle>
    </CardHeader>

    <CardContent className="flex-1 min-h-0 flex flex-col p-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-5 custom-scrollbar">
        <div className="grid gap-4 md:grid-cols-1">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text/30 ml-1">Title</label>
            <Input
              placeholder="Location title"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              disabled={isSaving}
              className="bg-white/5 border-white/5 h-11"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text/30 ml-1">Address</label>
              {(form.latitude || form.longitude) && (
                <button
                  type="button"
                  onClick={onFetchAddress}
                  disabled={isFetchingAddress || isSaving}
                  className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-400/10 px-2 py-0.5 rounded flex items-center gap-1"
                >
                  {isFetchingAddress ? (
                    'Fetching...'
                  ) : (
                    <>
                      Fetch
                    </>
                  )}
                </button>
              )}
            </div>
            <Input
              placeholder="Address or label"
              value={form.address}
              onChange={(e) =>
                setForm((p) => ({ ...p, address: e.target.value }))
              }
              disabled={isSaving || isFetchingAddress}
              className="bg-white/5 border-white/5 h-11"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text/30 ml-1">Latitude</label>
              {form.latitude && !/^-?\d+(\.\d+)?$/.test(form.latitude.trim()) && parseCoordinate(form.latitude) !== null && (
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseCoordinate(form.latitude);
                    if (parsed !== null) setForm(p => ({ ...p, latitude: parsed.toFixed(8) }));
                  }}
                  className="text-[9px] font-bold uppercase tracking-widest text-lime-400 hover:text-lime-300 transition-colors bg-lime-400/10 px-2 py-0.5 rounded"
                >
                  Decimal
                </button>
              )}
            </div>
            <Input
              placeholder="Latitude (e.g. 40° 42′ 46″ N)"
              value={form.latitude}
              onChange={(e) =>
                setForm((p) => ({ ...p, latitude: e.target.value }))
              }
              onBlur={() => {
                const parsed = parseCoordinate(form.latitude);
                if (parsed !== null && !/^-?\d+(\.\d+)?$/.test(form.latitude.trim())) {
                  setForm(p => ({ ...p, latitude: parsed.toFixed(8) }));
                }
              }}
              disabled={isSaving}
              className="bg-white/5 border-white/5 h-11"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text/30 ml-1">Longitude</label>
              {form.longitude && !/^-?\d+(\.\d+)?$/.test(form.longitude.trim()) && parseCoordinate(form.longitude) !== null && (
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseCoordinate(form.longitude);
                    if (parsed !== null) setForm(p => ({ ...p, longitude: parsed.toFixed(8) }));
                  }}
                  className="text-[9px] font-bold uppercase tracking-widest text-lime-400 hover:text-lime-300 transition-colors bg-lime-400/10 px-2 py-0.5 rounded"
                >
                  Decimal
                </button>
              )}
            </div>
            <Input
              placeholder="Longitude (e.g. 74° 00′ 21″ W)"
              value={form.longitude}
              onChange={(e) =>
                setForm((p) => ({ ...p, longitude: e.target.value }))
              }
              onBlur={() => {
                const parsed = parseCoordinate(form.longitude);
                if (parsed !== null && !/^-?\d+(\.\d+)?$/.test(form.longitude.trim())) {
                  setForm(p => ({ ...p, longitude: parsed.toFixed(8) }));
                }
              }}
              disabled={isSaving}
              className="bg-white/5 border-white/5 h-11"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text/30 ml-1">Accuracy (m)</label>
            <Input
              placeholder="Accuracy (m)"
              value={form.accuracy}
              onChange={(e) =>
                setForm((p) => ({ ...p, accuracy: e.target.value }))
              }
              disabled={isSaving}
              className="bg-white/5 border-white/5 h-11"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text/30 ml-1">Altitude (m)</label>
            <Input
              placeholder="Altitude (m)"
              value={form.altitude}
              onChange={(e) =>
                setForm((p) => ({ ...p, altitude: e.target.value }))
              }
              disabled={isSaving}
              className="bg-white/5 border-white/5 h-11"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-text/30 ml-1">Notes</label>
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            disabled={isSaving}
            className="min-h-[150px] w-full rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-text outline-none focus:border-emerald-500/30 disabled:opacity-50 transition-all custom-scrollbar"
          />
        </div>
      </div>

      <div className="border-t border-white/5 p-4 grid grid-cols-2 gap-3 sm:flex sm:flex-row shrink-0 bg-white/[0.01]">
        <Button
          onClick={() => void onSave()}
          disabled={isSaving}
          className="flex-1 rounded-xl bg-lime-500 text-bg hover:bg-lime-600 h-11"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </Button>

        <Button
          variant="outline"
          onClick={() => void onCapture()}
          disabled={isCapturing || isSaving}
          className="flex-1 rounded-xl border-white/5 bg-white/5 hover:bg-white/10 h-11"
        >
          {isCapturing ? 'Capturing...' : 'Capture'}
        </Button>

        <Button
          variant="ghost"
          onClick={onCancel}
          disabled={isSaving}
          className="col-span-2 sm:flex-1 rounded-xl h-11"
        >
          Cancel
        </Button>
      </div>
    </CardContent>
  </Card>
)

export interface LocationViewerProps {
  selectedId: string | null
  selectedItem: any
  payload: LocationPayload | null
  isCreating: boolean
  isEditing: boolean
  setIsEditing: (isEditing: boolean) => void
  setSelectedId: (id: string | null) => void
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  saveNewLocation: () => Promise<void>
  saveEditedLocation: () => Promise<void>
  resetEditor: () => void
  captureCurrentLocation: () => Promise<void>
  isCapturing: boolean
  isSaving: boolean
  hasPrevious: boolean
  hasNext: boolean
  goToPrevious: () => void
  goToNext: () => void
  copyValue: (type: 'coords' | 'id') => Promise<void>
  copied: 'coords' | 'id' | null
  deleteLocation: (id: string, title: string) => Promise<void>
  confirmDeleteId: string | null
  setConfirmDeleteId: (id: string | null) => void
  startEdit: () => void
  currentCoords: { lat: number; lng: number } | null
  isFetchingAddress: boolean
  fetchAddress: () => Promise<void>
}

export const LocationViewer: React.FC<LocationViewerProps> = ({
  selectedId,
  selectedItem,
  payload,
  isCreating,
  isEditing,
  setIsEditing,
  setSelectedId,
  form,
  setForm,
  saveNewLocation,
  saveEditedLocation,
  resetEditor,
  captureCurrentLocation,
  isCapturing,
  isSaving,
  hasPrevious,
  hasNext,
  goToPrevious,
  goToNext,
  copyValue,
  copied,
  deleteLocation,
  confirmDeleteId,
  setConfirmDeleteId,
  startEdit,
  currentCoords,
  isFetchingAddress,
  fetchAddress,
}) => {
  const [showViewScrollTop, setShowViewScrollTop] = useState(false)
  const viewRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className={cn(
        'flex-1 min-w-0 h-full',
        !selectedId && !isCreating ? 'hidden md:block' : 'block',
      )}
    >
      <AnimatePresence mode="wait">
        {isCreating ? (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="h-full"
          >
            <Editor
              form={form}
              setForm={setForm}
              onSave={saveNewLocation}
              onCancel={resetEditor}
              onCapture={captureCurrentLocation}
              onFetchAddress={fetchAddress}
              isCapturing={isCapturing}
              isSaving={isSaving}
              isFetchingAddress={isFetchingAddress}
              label="Save New Location"
            />
          </motion.div>
        ) : selectedItem ? (
          <motion.div
            key={selectedItem.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="h-full"
          >
            {isEditing ? (
              <Editor
                form={form}
                setForm={setForm}
                onSave={saveEditedLocation}
                onCancel={() => {
                  setIsEditing(false)
                  // Form reset logic should be handled by parent or here if preferred
                }}
                onCapture={captureCurrentLocation}
                onFetchAddress={fetchAddress}
                isCapturing={isCapturing}
                isSaving={isSaving}
                isFetchingAddress={isFetchingAddress}
                label="Update Location"
              />
            ) : (
              <Card className="flex h-full flex-col overflow-hidden border-none bg-card-bg/30 shadow-none">
                <CardHeader className="flex flex-row items-center justify-between border-b border-card-border py-4 px-4 xl:px-6 transition-colors gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedId(null)}
                      className="md:hidden h-8 w-8 -ml-2 shrink-0 text-text/60 hover:text-white"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <CardTitle className="truncate text-lg md:text-2xl font-bold text-text tracking-tight">
                      {selectedItem.title}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1 md:gap-2 shrink-0">
                    <GlobalNavigator
                      canPrevious={hasPrevious}
                      canNext={hasNext}
                      onPrevious={goToPrevious}
                      onNext={goToNext}
                      layout="inline"
                    />
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={startEdit}
                      className="h-9 w-9"
                      title="Edit Location"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={confirmDeleteId === selectedItem.id ? "danger" : "ghost"}
                      size={confirmDeleteId === selectedItem.id ? "md" : "icon"}
                      onClick={() =>
                        void deleteLocation(
                          selectedItem.id,
                          selectedItem.title,
                        )
                      }
                      onMouseLeave={() => confirmDeleteId && setConfirmDeleteId(null)}
                      className={cn(
                        "h-9 transition-all",
                        confirmDeleteId === selectedItem.id ? "px-3 text-xs" : "w-9 text-text/40 hover:text-red-400"
                      )}
                    >
                      {confirmDeleteId === selectedItem.id ? (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Confirm
                        </>
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="relative flex-1 min-h-0 p-0 overflow-hidden">
                  <div
                    ref={viewRef}
                    onScroll={(e) =>
                      setShowViewScrollTop(e.currentTarget.scrollTop > 220)
                    }
                    className="h-full overflow-y-auto custom-scrollbar"
                  >
                    <div className="space-y-6 p-4 xl:p-8">
                      <div className="grid grid-cols-1 lg:grid-cols-1 gap-4 xl:gap-6">
                        <div className="space-y-6">
                          <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-6 shadow-sm hover:bg-white/[0.04] transition-colors group">
                            <div className="flex items-center justify-between mb-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-text/20">
                                Coordinates
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void copyValue('coords')}
                                className="flex items-center gap-1.5 h-7 px-2 rounded-lg bg-white/5 hover:bg-white/10"
                              >
                                {copied === 'coords' ? (
                                  <>
                                    <Check className="h-3 w-3 text-emerald-400" />
                                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                                      Copied
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3 w-3 text-text/40" />
                                    <span className="text-[10px] text-text/40 font-bold uppercase tracking-wider">Copy</span>
                                  </>
                                )}
                              </Button>
                            </div>
                            <p className="font-mono text-base leading-relaxed text-lime-400/90 whitespace-pre-line tracking-tight">
                              {currentCoords
                                ? `${currentCoords.lat.toFixed(8)}\n${currentCoords.lng.toFixed(8)}`
                                : 'Unavailable'}
                            </p>
                          </div>

                          <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-6 shadow-sm hover:bg-white/[0.04] transition-colors">
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-text/20 mb-4">
                              Primary Address
                            </p>
                            <p className="text-sm leading-relaxed text-text/70 italic">
                              {payload?.address || 'No address stored'}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-6 shadow-sm hover:bg-white/[0.04] transition-colors text-center">
                              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-text/20 mb-2">
                                Accuracy
                              </p>
                              <p className="text-lg font-bold text-text/80">
                                {typeof payload?.accuracy === 'number'
                                  ? `${payload.accuracy.toFixed(1)}m`
                                  : '—'}
                              </p>
                            </div>
                            <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-6 shadow-sm hover:bg-white/[0.04] transition-colors text-center">
                              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-text/20 mb-2">
                                Altitude
                              </p>
                              <p className="text-lg font-bold text-text/80">
                                {typeof payload?.altitude === 'number'
                                  ? `${payload.altitude.toFixed(1)}m`
                                  : '—'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-8 shadow-sm hover:bg-white/[0.04] transition-colors h-full flex flex-col">
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-text/20 mb-6 shrink-0">
                              Location Notes
                            </p>
                            <div className="flex-1">
                              {payload?.notes ? (
                                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text/60">
                                  {payload.notes}
                                </p>
                              ) : (
                                <div className="flex flex-col items-center justify-center py-12 text-text/10 border border-dashed border-white/5 rounded-2xl h-full">
                                  <MapIcon className="h-8 w-8 mb-3 opacity-20" />
                                  <p className="text-xs uppercase tracking-widest font-bold opacity-30">No notes provided</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {currentCoords && (
                        <div className="rounded-3xl border border-white/5 bg-white/[0.02] p-2 shadow-xl">
                          <MapPreview
                            lat={currentCoords.lat}
                            lng={currentCoords.lng}
                            height="400px"
                          />
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-4 px-4 xl:px-6 py-3 border-t border-card-border bg-white/[0.01] mt-auto w-full overflow-x-auto custom-scrollbar whitespace-nowrap">
                      <div className="flex items-center gap-4 md:gap-6 shrink-0">
                        <div className="flex items-center gap-2 text-[11px] text-text/40 font-medium shrink-0">
                          <Calendar className="h-3.5 w-3.5 text-emerald-400/40 shrink-0" />
                          <span className="text-text/60">{new Date(selectedItem.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-text/40 font-medium tracking-tight shrink-0">
                          <Clock className="h-3.5 w-3.5 text-emerald-400/40 shrink-0" />
                          <span className="text-text/60">{new Date(selectedItem.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div
                          className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/5 border border-emerald-500/10 shadow-inner shrink-0"
                          title={selectedItem.id}
                        >
                          <span className="text-[9px] text-emerald-400/50 font-black uppercase tracking-[0.2em]">
                            ID: {selectedItem.id.slice(0, 8)}...
                          </span>
                          <button
                            onClick={() => void copyValue('id')}
                            className="text-emerald-400/40 hover:text-emerald-400 transition-colors"
                          >
                            {copied === 'id' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                        <motion.div
                          initial={{ opacity: 0.7 }}
                          animate={{ opacity: 1 }}
                          transition={{
                            repeat: Infinity,
                            duration: 2,
                            repeatType: 'reverse',
                          }}
                          title="End-to-end encrypted with AES-256-GCM"
                          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold cursor-help shadow-lg shadow-emerald-500/10 shrink-0"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          <span className="leading-none text-[9px] uppercase tracking-wider">
                            Secure 256
                          </span>
                        </motion.div>
                      </div>
                    </div>
                  </div>

                  <ScrollButton
                    icon={ChevronUp}
                    visible={showViewScrollTop}
                    onClick={() =>
                      viewRef.current?.scrollTo({
                        top: 0,
                        behavior: 'smooth',
                      })
                    }
                    className="bottom-6 right-8"
                  />
                </CardContent>
              </Card>
            )}
          </motion.div>
        ) : (
          <div className="h-full overflow-y-auto custom-scrollbar rounded-3xl border border-white/5 bg-white/[0.01] transition-colors">
            <div className="flex min-h-full items-center justify-center pt-40 pb-40">
              <div className="text-center group">
                <div className="mb-6 relative">
                  <MapIcon className="mx-auto h-16 w-16 text-text/5 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3" />
                  <div className="absolute inset-0 bg-emerald-400/5 blur-3xl rounded-full" />
                </div>
                <p className="text-text/30 font-medium">Select a location to view or edit</p>
                <p className="mt-2 text-[10px] text-text/20 uppercase tracking-[0.3em] font-black">Vault Location Service</p>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
