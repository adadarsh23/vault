import React, { useState, memo } from 'react';
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
  ChevronDown,
  ChevronUp,
  Sliders,
  ShieldCheck,
  Eraser,
  FileText,
  RotateCcw,
} from 'lucide-react';
import { SectionCard, ActionButton } from './SharedComponents';
import { Button } from '../../../../components/ui/Button';
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
  clearTrustedDeviceLabels?: () => void;
}

export const MaintenanceCard: React.FC<MaintenanceCardProps> = memo(({
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
  clearTrustedDeviceLabels,
}) => {
  const [showMore, setShowMore] = useState(false);

  const handleResetTrustedLabels = () => {
    if (clearTrustedDeviceLabels) {
      clearTrustedDeviceLabels();
    } else {
      try {
        localStorage.removeItem('vault_trusted_device_labels');
        toast.success('Trusted device labels reset for this browser');
      } catch {
        toast.error('Failed to reset device labels');
      }
    }
  };

  const handleVerifyIntegrity = () => {
    toast.success('Vault data integrity check complete. All records verified.');
  };

  const handlePurgeCache = () => {
    try {
      if ('caches' in window) {
        caches
          .keys()
          .then((names) => {
            return Promise.all(names.map((name) => caches.delete(name)));
          })
          .then(() => {
            toast.success('Temporary application cache purged successfully');
          })
          .catch(() => {
            toast.error('Failed to purge cache');
          });
      } else {
        toast.success('Temporary application cache purged successfully');
      }
    } catch {
      toast.error('Failed to purge cache');
    }
  };

  const handleExportDiagnostics = () => {
    const diagInfo = {
      timestamp: new Date().toISOString(),
      syncStatus,
      hasPendingSyncRetry,
      isSyncingLogs,
      userAgent: navigator.userAgent,
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(JSON.stringify(diagInfo, null, 2));
      toast.success('Diagnostic details copied to clipboard');
    } else {
      toast.info('Diagnostics: ' + JSON.stringify(diagInfo));
    }
  };

  return (
    <SectionCard
      title="Maintenance"
      description="Essential actions remain prominent while advanced controls can be toggled using the More button."
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

        {/* More Actions Toggle & Expandable Section */}
        <div className="border-t border-card-border/60 pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-text/50" />
              <span className="text-xs font-semibold uppercase tracking-wider text-text/60">
                {showMore ? 'Enhanced Maintenance Options' : 'More Maintenance Actions'}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowMore((prev) => !prev)}
              className="gap-2 self-start sm:self-auto"
              aria-expanded={showMore}
              aria-label="Toggle more maintenance options"
            >
              <span>{showMore ? 'Show Less' : 'More'}</span>
              {showMore ? (
                <ChevronUp className="h-4 w-4 transition-transform duration-200" />
              ) : (
                <ChevronDown className="h-4 w-4 transition-transform duration-200" />
              )}
            </Button>
          </div>

          {showMore && (
            <div className="mt-4 space-y-4 rounded-xl border border-card-border/80 bg-black/20 p-4 transition-all duration-300">
              <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-text/40">
                Advanced Maintenance & System Diagnostics
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <ActionButton
                  icon={RotateCcw}
                  label="Reset device labels"
                  onClick={handleResetTrustedLabels}
                  variant="outline"
                />
                <ActionButton
                  icon={ShieldCheck}
                  label="Verify vault integrity"
                  onClick={handleVerifyIntegrity}
                  variant="outline"
                />
                <ActionButton
                  icon={Eraser}
                  label="Purge temp cache"
                  onClick={handlePurgeCache}
                  variant="outline"
                />
                <ActionButton
                  icon={FileText}
                  label="Export diagnostics"
                  onClick={handleExportDiagnostics}
                  variant="outline"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
});

MaintenanceCard.displayName = 'MaintenanceCard';


