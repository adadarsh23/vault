import React from 'react'
import { RefreshCw, Upload, Cloud, Activity,X } from 'lucide-react'
import { SectionCard, ActionButton } from './SharedComponents'
import {
  formatBytes,
  formatDate,
  formatCountLabel,
  getSyncHealthDescription,
  SETTINGS_PANEL,
} from './Utils'
import { toast } from 'sonner'

interface SyncStorageCardProps {
  storageUsedBytes: number
  usagePercentage: number
  itemCount: number
  syncStatus: 'idle' | 'syncing' | 'success' | 'error'
  syncHealthLabel: string
  lastSuccessfulSyncAt: number | string | null | undefined
  lastSyncAttemptAt: number | string | null | undefined
  hasPendingSyncRetry: boolean
  syncConflictCount: number
  lastSyncError: string | null
  isLoading: boolean
  isMigrating: boolean
  isSyncingLogs: boolean
  syncWithCloud: () => Promise<void>
  retryFailedSync: () => Promise<void>
  migrateLocalToCloud: () => Promise<void>
  syncLogs: () => Promise<void>
  getErrorMessage: (error: unknown, fallback: string) => string
  cancelSync: () => void
  cancelActivityLogSync: () => void
}

export const SyncStorageCard: React.FC<SyncStorageCardProps> = ({
  storageUsedBytes,
  usagePercentage,
  itemCount,
  syncStatus,
  syncHealthLabel,
  lastSuccessfulSyncAt,
  lastSyncAttemptAt,
  hasPendingSyncRetry,
  syncConflictCount,
  lastSyncError,
  isLoading,
  isMigrating,
  isSyncingLogs,
  syncWithCloud,
  retryFailedSync,
  migrateLocalToCloud,
  syncLogs,
  getErrorMessage,
  cancelSync,
  cancelActivityLogSync,
}) => (
  <SectionCard
    title="Sync and Storage"
    description="Watch sync health, review recent cloud activity, and retry failed uploads."
  >
    {/* MAIN GRID */}
    <div className="grid gap-4 xl:grid-cols-3">
      {/* LEFT - STORAGE (TAKES MORE SPACE ON LAPTOP) */}
      <div
        className={`xl:col-span-1 ${SETTINGS_PANEL} flex flex-col justify-between`}
      >
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-text/60">Data Size</span>
            <span className="font-bold text-text">
              {formatBytes(storageUsedBytes)}
              <span className="font-normal text-text/40"> / 1.0 GB</span>
            </span>
          </div>

          <div className="mt-3 h-3 overflow-hidden rounded-full border border-card-border bg-text/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-text/40 via-text/70 to-text"
              style={{
                width: `${Math.min(100, Math.max(0, usagePercentage))}%`,
              }}
            />
          </div>

          <p className="mt-2 text-right text-[10px] uppercase tracking-[0.2em] text-text/40">
            {usagePercentage.toFixed(2)}% used
          </p>
        </div>
      </div>

      {/* RIGHT - STATS GRID */}
      <div className="xl:col-span-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
        {/* CARD */}
        <div className={`${SETTINGS_PANEL}`}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-text/35">
            Cloud health
          </p>
          <p className="mt-2 text-sm font-semibold text-text">
            {syncHealthLabel}
          </p>
          <p className="mt-1 text-xs text-text/45">
            {getSyncHealthDescription(syncStatus)}
          </p>
        </div>

        <div className={`${SETTINGS_PANEL}`}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-text/35">
            Last successful sync
          </p>
          <p className="mt-2 text-sm font-semibold text-text">
            {formatDate(lastSuccessfulSyncAt)}
          </p>
        </div>

        <div className={`${SETTINGS_PANEL}`}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-text/35">
            Last attempt
          </p>
          <p className="mt-2 text-sm font-semibold text-text">
            {formatDate(lastSyncAttemptAt)}
          </p>
        </div>

        <div className={`${SETTINGS_PANEL}`}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-text/35">
            Retry state
          </p>
          <p className="mt-2 text-sm font-semibold text-text">
            {hasPendingSyncRetry ? 'Retry available' : 'No retry pending'}
          </p>
        </div>

        <div className={`${SETTINGS_PANEL}`}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-text/35">
            Conflict warnings
          </p>
          <p className="mt-2 text-2xl font-bold text-text">
            {syncConflictCount}
          </p>
        </div>

        <div className={`${SETTINGS_PANEL}`}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-text/35">
            Vault footprint
          </p>
          <p className="mt-2 text-sm font-semibold text-text">
            {formatCountLabel(itemCount, 'item')}
          </p>
        </div>
      </div>
    </div>

    {/* ERROR BLOCK */}
    {lastSyncError && (
      <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-red-400">
          Last sync error
        </p>
        <p className="mt-2 text-sm text-red-300 break-words">{lastSyncError}</p>
      </div>
    )}

    {/* ACTION BUTTONS */}
    <div className="mt-5 flex flex-wrap gap-3">
      <ActionButton
        icon={RefreshCw}
        label="Sync cloud"
        onClick={() => void syncWithCloud()}
        loading={isLoading && syncStatus === 'syncing'}
      />
      <ActionButton
        icon={X}
        label="Cancel sync"
        onClick={cancelSync}
        disabled={syncStatus !== 'syncing'}
        variant="outline"
      />
      <ActionButton
        icon={Upload}
        label="Retry failed"
        onClick={() => void retryFailedSync()}
        loading={isLoading && hasPendingSyncRetry}
        disabled={!hasPendingSyncRetry && syncStatus !== 'error'}
        variant="outline"
      />

      <ActionButton
        icon={Cloud}
        label="Migrate"
        onClick={async () => {
          try {
            await migrateLocalToCloud()
            toast.success('Migration completed')
          } catch (error) {
            toast.error(getErrorMessage(error, 'Migration failed'))
          }
        }}
        loading={isMigrating}
        disabled={isLoading || isMigrating}
        variant="outline"
      />

      <ActionButton
        icon={Activity}
        label="Sync logs"
        onClick={() => void syncLogs()}
        loading={isSyncingLogs}
        disabled={isLoading || isSyncingLogs}
        variant="outline"
      />
      <ActionButton
        icon={X}
        label="Cancel logs sync"
        onClick={cancelActivityLogSync}
        disabled={!isSyncingLogs}
        variant="outline"
      />
    </div>
  </SectionCard>
)
