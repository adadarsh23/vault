import React, { memo } from 'react';
import {
  Cloud,
  Download,
  FileText,
  Key,
  LockKeyhole,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Trash2,
  Upload,
  WifiOff,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/Card';
import { ActionRow } from './ActionRow';

interface MaintenanceActionsCardProps {
  onOpenMaintenance: (type: 'export' | 'import' | 'changeKey' | 'changePassword') => void;
  syncWithCloud: () => Promise<void>;
  retryFailedSync: () => Promise<void>;
  syncLogs: () => Promise<void>;
  migrateLocalToCloud: () => Promise<void>;
  lock: () => void;
  refreshSessions: () => Promise<void>;
  lockAllSessions: () => Promise<void>;
  clearTrustedDeviceLabels: () => void;
  isLoading: boolean;
  isSessionActionLoading: boolean;
  hasPendingSyncRetry: boolean;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
}

export const MaintenanceActionsCard: React.FC<MaintenanceActionsCardProps> = memo(
  ({
    onOpenMaintenance,
    syncWithCloud,
    retryFailedSync,
    syncLogs,
    migrateLocalToCloud,
    lock,
    refreshSessions,
    lockAllSessions,
    clearTrustedDeviceLabels,
    isLoading,
    isSessionActionLoading,
    hasPendingSyncRetry,
    syncStatus,
  }) => (
    <Card className="border-card-border bg-card-bg">
      <CardHeader>
        <div className="space-y-2">
          <CardTitle className="text-lg">Vault Maintenance</CardTitle>
          <p className="text-sm leading-6 text-text/50">
            Run recovery, session, and lifecycle actions from one secure control area.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text/40">
              Sync {syncStatus}
            </span>
            {hasPendingSyncRetry ? (
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">
                Retry available
              </span>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ActionRow
          icon={RefreshCw}
          title="Sync with MongoDB"
          description="Force synchronization with cloud node"
          onClick={() => {
            void syncWithCloud();
          }}
          disabled={isLoading}
          isLoadingAction={isLoading}
        />
        <ActionRow
          icon={WifiOff}
          title="Retry Failed Sync"
          description="Resume pending sync work after an interruption"
          onClick={() => {
            void retryFailedSync();
          }}
          disabled={isLoading || !hasPendingSyncRetry}
          isLoadingAction={isLoading && hasPendingSyncRetry}
        />
        <ActionRow
          icon={FileText}
          title="Sync Activity Timeline"
          description="Push the current encrypted activity log to cloud storage"
          onClick={() => {
            void syncLogs();
          }}
          disabled={isLoading}
          isLoadingAction={isLoading}
        />
        <ActionRow
          icon={Cloud}
          title="Migrate Local to Cloud"
          description="Securely move local storage to MongoDB"
          onClick={() => {
            void migrateLocalToCloud();
          }}
          disabled={isLoading}
        />
        <ActionRow
          icon={Smartphone}
          title="Refresh Device Sessions"
          description="Reload active devices and current session state"
          onClick={() => {
            void refreshSessions();
          }}
          disabled={isSessionActionLoading}
          isLoadingAction={isSessionActionLoading}
        />
        <ActionRow
          icon={LockKeyhole}
          title="Change Password"
          description="Update the password used to sign in to this vault"
          onClick={() => onOpenMaintenance('changePassword')}
        />
        <ActionRow
          icon={Key}
          title="Change Master Key"
          description="Zero-knowledge cryptographic key rotation"
          onClick={() => onOpenMaintenance('changeKey')}
        />
        <ActionRow
          icon={Download}
          title="Export Encrypted Vault"
          description="Download an AES-secured backup file"
          onClick={() => onOpenMaintenance('export')}
        />
        <ActionRow
          icon={Upload}
          title="Import Vault Data"
          description="Restore items from an encrypted backup"
          onClick={() => onOpenMaintenance('import')}
        />
        <ActionRow
          icon={Trash2}
          title="Reset Trusted Labels"
          description="Clear saved device nicknames from this browser only"
          onClick={clearTrustedDeviceLabels}
        />
        <ActionRow
          icon={LogOut}
          title="Lock Vault Storage"
          description="Immediately encrypt memory and log out"
          onClick={lock}
        />
        <ActionRow
          icon={ShieldAlert}
          title="Lock All Devices"
          description="Revoke every session and force a fresh sign-in"
          onClick={() => {
            void lockAllSessions();
          }}
          disabled={isSessionActionLoading}
          isLoadingAction={isSessionActionLoading}
          danger
        />
      </CardContent>
    </Card>
  )
);

MaintenanceActionsCard.displayName = 'MaintenanceActionsCard';
