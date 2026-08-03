import React from 'react';
import {
  RefreshCw,
  Smartphone,
  Activity,
  Download,
  Upload,
  KeyRound,
  LogOut,
  Lock,
  ShieldAlert,
  Cloud,
  X,
} from 'lucide-react';
import { SectionCard, ActionButton } from './SharedComponents';
import { toast } from 'sonner';

interface MaintenanceCardProps {
  isLoading: boolean;
  syncStatus: string;
  isSessionActionLoading: boolean;
  isSyncingLogs: boolean;
  hasPendingSyncRetry: boolean;
  isMigrating: boolean;
  syncWithCloud: () => Promise<void>;
  loadSessionState: () => Promise<void>;
  syncLogs: () => Promise<void>;
  retryFailedSync: () => Promise<void>;
  migrateLocalToCloud: () => Promise<void>;
  onOpenMaintenance: (type: 'export' | 'import' | 'changeKey' | 'changePassword') => void;
  lock: () => void;
  handleLockAllSessions: () => Promise<void>;
  getErrorMessage: (error: unknown, fallback: string) => string;
  setIsMigrating: (value: boolean) => void;
  cancelSync: () => void;
  cancelActivityLogSync: () => void;
}

export const MaintenanceCard: React.FC<MaintenanceCardProps> = ({
  isLoading,
  syncStatus,
  isSessionActionLoading,
  isSyncingLogs,
  hasPendingSyncRetry,
  isMigrating,
  syncWithCloud,
  loadSessionState,
  syncLogs,
  retryFailedSync,
  migrateLocalToCloud,
  onOpenMaintenance,
  lock,
  handleLockAllSessions,
  getErrorMessage,
  setIsMigrating,
  cancelSync,
  cancelActivityLogSync,
}) => (
  <SectionCard
    title="Maintenance"
    description="Only the essential actions remain here so the page stays clear on mobile and desktop."
  >
    <div className="space-y-10">
      {/* Cloud & Sync Group */}
      <div className="space-y-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text/40 px-1">
          Cloud & Synchronization
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <ActionButton
            icon={RefreshCw}
            label="Sync cloud"
            onClick={() => {
              void syncWithCloud();
            }}
            loading={isLoading && syncStatus === 'syncing'}
            variant="outline"
          />
          <ActionButton
            icon={RefreshCw}
            label="Refresh account state"
            onClick={() => {
              void loadSessionState();
            }}
            loading={isSessionActionLoading}
            variant="outline"
          />
          <ActionButton
            icon={Smartphone}
            label="Refresh sessions"
            onClick={() => {
              void loadSessionState();
            }}
            loading={isSessionActionLoading}
            variant="outline"
          />
          <ActionButton
            icon={Activity}
            label="Sync activity log"
            onClick={() => {
              void syncLogs();
            }}
            loading={isSyncingLogs}
            disabled={isLoading || isSyncingLogs}
            variant="outline"
          />
          <ActionButton
            icon={RefreshCw}
            label="Retry failed sync"
            onClick={() => {
              void retryFailedSync();
            }}
            loading={isLoading && hasPendingSyncRetry}
            disabled={!hasPendingSyncRetry && syncStatus !== 'error'}
            variant="outline"
          />
          <ActionButton
            icon={Cloud}
            label="Migrate local to cloud"
            onClick={async () => {
              setIsMigrating(true);
              try {
                await migrateLocalToCloud();
                toast.success('Migration to cloud completed successfully');
              } catch (error) {
                toast.error(getErrorMessage(error, 'Migration failed'));
              } finally {
                setIsMigrating(false);
              }
            }}
            loading={isMigrating}
            disabled={isLoading || isMigrating}
            variant="outline"
          />
          <ActionButton
            icon={X}
            label="Cancel sync"
            onClick={cancelSync}
            disabled={syncStatus !== 'syncing'}
            variant="outline"
          />
          <ActionButton
            icon={X}
            label="Cancel activity log"
            onClick={cancelActivityLogSync}
            disabled={!isSyncingLogs}
            variant="outline"
          />
        </div>
      </div>

      {/* Data Management Group */}
      <div className="space-y-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text/40 px-1">
          Export And Import Data
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <ActionButton
            icon={Download}
            label="Export vault"
            onClick={() => onOpenMaintenance('export')}
          />
          <ActionButton
            icon={Upload}
            label="Import vault"
            onClick={() => onOpenMaintenance('import')}
            variant="outline"
          />
        </div>
      </div>

      {/* Account Security Group */}
      <div className="space-y-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-text/40 px-1">
          Access & Security
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <ActionButton
            icon={KeyRound}
            label="Change password"
            onClick={() => onOpenMaintenance('changePassword')}
            variant="outline"
          />
          <ActionButton
            icon={KeyRound}
            label="Change master key"
            onClick={() => onOpenMaintenance('changeKey')}
            variant="outline"
          />
          <ActionButton icon={LogOut} label="Lock vault" onClick={lock} variant="danger" />
          <ActionButton
            icon={Lock}
            label="Lock sessions"
            onClick={() => {
              void handleLockAllSessions();
            }}
            loading={isSessionActionLoading}
            variant="danger"
          />
          <ActionButton
            icon={ShieldAlert}
            label="Logout all sessions"
            onClick={() => {
              void handleLockAllSessions();
            }}
            loading={isSessionActionLoading}
            variant="danger"
          />
        </div>
      </div>
    </div>
  </SectionCard>
);
