import React, { memo } from 'react';
import { Network, ClipboardList, MonitorSmartphone } from 'lucide-react';
import { useVaultStore } from '../../store/vaultStore';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { PWAInstallModal } from '../../components/vault/PWAInstallModal';
import { Button } from '../../components/ui/Button';
import { logActivity } from '../../lib/activity';
import {
  getAuthenticatedProfile,
  revokeVaultDeviceSession,
  updateAuthenticatedProfile,
  type AuthenticatedProfile,
} from '../../lib/auth-api';
import {} from // clearAuthToken,
// clearCloudSessionHint,
// clearRememberedVaultAccess,
'../../lib/auth-session';
import { toast } from 'sonner';
import {
  getErrorMessage,
  getSyncHealthLabel,
  estimateVaultItemBytes,
  calculateMediaBreakdown,
} from './components/SettingsVault/Utils';

// Extracted Components
import { ProfileCard } from './components/SettingsVault/ProfileCard';
import { MobileExperienceCard } from './components/SettingsVault/MobileExperienceCard';
import { SyncStorageCard } from './components/SettingsVault/SyncStorageCard';
import { LegalComplianceCard } from './components/SettingsVault/LegalComplianceCard';
import { MaintenanceCard } from './components/SettingsVault/MaintenanceCard';
import { EmergencyDestructionCard } from './components/SettingsVault/EmergencyDestructionCard';
import { ShareVaultCard } from './components/SettingsVault/ShareVaultCard';
import { TwoFactorSettingsCard } from './components/SettingsVault/TwoFactorSettingsCard';
import { SectionCard } from './components/SettingsVault/SharedComponents';

interface SettingsVaultProps {
  onOpenMaintenance: (type: 'export' | 'import' | 'changeKey' | 'changePassword') => void;
  onNavigate: (tab: string) => void;
  openProfileEditorRequestToken?: number;
}

export const SettingsVault: React.FC<SettingsVaultProps> = memo(
  ({ onOpenMaintenance, onNavigate, openProfileEditorRequestToken }) => {
    const syncWithCloud = useVaultStore((state) => state.syncWithCloud);
    const retryFailedSync = useVaultStore((state) => state.retryFailedSync);
    const syncLogs = useVaultStore((state) => state.syncLogs);
    const isSyncingLogs = useVaultStore((state) => state.isSyncingLogs);
    const destroyAllData = useVaultStore((state) => state.destroyAllData);
    const isLoading = useVaultStore((state) => state.isLoading);
    const items = useVaultStore((state) => state.items);
    const username = useVaultStore((state) => state.username);
    const lock = useVaultStore((state) => state.lock);
    const fullLogout = useVaultStore((state) => state.fullLogout);
    const migrateLocalToCloud = useVaultStore((state) => state.migrateLocalToCloud);
    const syncStatus = useVaultStore((state) => state.syncStatus);
    const cancelSync = useVaultStore((state) => state.cancelSync);
    const cancelActivityLogSync = useVaultStore((state) => state.cancelActivityLogSync);
    const lastSuccessfulSyncAt = useVaultStore((state) => state.lastSuccessfulSyncAt);
    const lastSyncAttemptAt = useVaultStore((state) => state.lastSyncAttemptAt);
    const lastSyncError = useVaultStore((state) => state.lastSyncError);
    const syncConflictCount = useVaultStore((state) => state.syncConflictCount);
    const hasPendingSyncRetry = useVaultStore((state) => state.hasPendingSyncRetry);

    const { install, canInstall, isInstalled, isStandalone, needsManualInstall } = usePWAInstall();

    const [storageUsedBytes, setStorageUsedBytes] = React.useState(0);
    const [profile, setProfile] = React.useState<AuthenticatedProfile | null>(null);
    const [sessionsCount, setSessionsCount] = React.useState(0);
    const [isSessionActionLoading, setIsSessionActionLoading] = React.useState(false);
    const [isDestroyingVault, setIsDestroyingVault] = React.useState(false);
    const [isSavingProfile, setIsSavingProfile] = React.useState(false);
    const [isMigrating, setIsMigrating] = React.useState(false);
    const [destructionStage, setDestructionStage] = React.useState<'idle' | 'confirm' | 'final'>(
      'idle'
    );
    const [isPWAInstallModalOpen, setIsPWAInstallModalOpen] = React.useState(false);

    const deferredItems = React.useDeferredValue(items);
    const vaultAnalytics = React.useMemo(() => {
      const mediaBreakdown = calculateMediaBreakdown(deferredItems);
      return {
        itemCount: deferredItems.length,
        mediaBreakdown,
      };
    }, [deferredItems]);

    React.useEffect(() => {
      let cancelled = false;

      const nextSize = deferredItems.reduce((total, item) => {
        return total + estimateVaultItemBytes(item);
      }, 0);

      if (!cancelled) {
        setStorageUsedBytes(nextSize);
      }

      return () => {
        cancelled = true;
      };
    }, [deferredItems]);

    const loadSessionState = React.useCallback(async () => {
      setIsSessionActionLoading(true);
      try {
        const nextProfile = await getAuthenticatedProfile();
        setProfile(nextProfile);
        setSessionsCount(nextProfile.sessions?.length || 0);
        window.dispatchEvent(
          new CustomEvent('vault:profile-updated', {
            detail: {
              username: nextProfile.username,
              profileName: nextProfile.profileName,
              profilePhoto: nextProfile.profilePhoto,
            },
          })
        );
      } catch (error: unknown) {
        setProfile(null);
        setSessionsCount(0);
        toast.error(getErrorMessage(error, 'Failed to load account sessions'));
      } finally {
        setIsSessionActionLoading(false);
      }
    }, []);

    React.useEffect(() => {
      void loadSessionState();
    }, [loadSessionState]);

    const handleLockAllSessions = React.useCallback(async () => {
      if (
        !confirm(
          'This will revoke every device session and lock this browser immediately. Continue?'
        )
      ) {
        return;
      }

      setIsSessionActionLoading(true);
      try {
        await revokeVaultDeviceSession({
          revokeAllOther: true,
          revokeCurrent: true,
        });
        fullLogout();
        setSessionsCount(0);
        toast.success('All device sessions were locked');
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, 'Failed to lock all sessions'));
      } finally {
        setIsSessionActionLoading(false);
      }
    }, [fullLogout]);

    const handleEmergencyClear = async () => {
      if (destructionStage === 'idle') {
        setDestructionStage('confirm');
        return;
      }

      if (destructionStage === 'confirm') {
        setDestructionStage('final');
        return;
      }

      logActivity({
        actionType: 'error',
        itemName: 'Vault Maintenance',
        description: 'ALL DATA DESTRUCTION INITIATED',
        status: 'success',
      });

      setIsDestroyingVault(true);
      try {
        await destroyAllData();
      } finally {
        setIsDestroyingVault(false);
        setDestructionStage('idle');
      }
    };

    const usagePercentage = Math.min((storageUsedBytes / (1024 * 1024 * 1024)) * 100, 100);

    const syncHealthLabel = getSyncHealthLabel(syncStatus);

    const handleProfileSave = React.useCallback(
      async (profileName: string, profilePhoto: string) => {
        setIsSavingProfile(true);
        try {
          await updateAuthenticatedProfile({ profileName, profilePhoto });
          await loadSessionState();
          toast.success('Profile updated');
          return { saved: true as const };
        } catch (error: unknown) {
          const apiError = error as { code?: string };
          if (apiError?.code === 'SAVED_LOCALLY') {
            // Network was unreachable but profile was saved to local storage.
            // Treat this as a soft success so the modal closes and the UI updates.
            try {
              await loadSessionState();
            } catch {
              // Ignore — session refresh failure is non-critical here.
            }
            toast.info('No connection — profile saved locally and will sync when online.');
            return { saved: true as const };
          }
          const errorMessage = getErrorMessage(error, 'Failed to update profile');
          toast.error(errorMessage);
          return { saved: false as const, errorMessage };
        } finally {
          setIsSavingProfile(false);
        }
      },
      [loadSessionState]
    );

    return (
      <div className="space-y-5">
        <section className="flex items-center justify-between gap-4">
          <div className="min-w-0 space-y-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-text sm:text-4xl">Settings</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-text/45">
                Review cloud health, sync, and security status.
              </p>
            </div>
          </div>
        </section>

        <ProfileCard
          username={username}
          profile={profile}
          isSavingProfile={isSavingProfile}
          onSaveProfile={handleProfileSave}
          syncHealthLabel={syncHealthLabel}
          lastSuccessfulSyncAt={lastSuccessfulSyncAt}
          storageUsedBytes={storageUsedBytes}
          itemCount={vaultAnalytics.itemCount}
          sessionsCount={sessionsCount}
          mediaBreakdown={vaultAnalytics.mediaBreakdown}
          onNavigate={onNavigate}
          openProfileEditorRequestToken={openProfileEditorRequestToken}
        />

        <MobileExperienceCard
          isInstalled={isInstalled}
          isStandalone={isStandalone}
          needsManualInstall={needsManualInstall}
          canInstall={canInstall}
          onInstallRequest={() => setIsPWAInstallModalOpen(true)}
        />

        <SectionCard
          title="Vault Navigation"
          description="Quick access to Vault Ecosystem, Controls & Shortcuts, Device Sessions, and System Logs."
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-[1.25rem] border border-card-border bg-card-bg p-4 shadow-[0_12px_30px_-22px_rgba(0,0,0,0.24)] transition-colors dark:border-white/10 dark:bg-black">
              <p className="text-sm font-semibold text-text">Vault Ecosystem</p>
              <p className="mt-1 text-xs leading-5 text-text/45">
                Explore how identity, encryption, sync, and protected content connect.
              </p>
              <Button
                variant="secondary"
                onClick={() => onNavigate('ecosystem')}
                className="mt-4 w-full justify-center"
              >
                <Network className="mr-2 h-4 w-4" />
                Open Ecosystem
              </Button>
            </div>

            {/* <div className="rounded-[1.25rem] border border-card-border bg-card-bg p-4 shadow-[0_12px_30px_-22px_rgba(0,0,0,0.24)] transition-colors dark:border-white/10 dark:bg-black">
              <p className="text-sm font-semibold text-text">Controls & Shortcuts</p>
              <p className="mt-1 text-xs leading-5 text-text/45">
                Discover keyboard shortcuts for faster navigation.
              </p>
              <Button
                variant="secondary"
                onClick={() => onNavigate('shortcuts')}
                className="mt-4 w-full justify-center"
              >
                <Keyboard className="mr-2 h-4 w-4" />
                Open Shortcuts
              </Button>
            </div> */}

            <div className="rounded-[1.25rem] border border-card-border bg-card-bg p-4 shadow-[0_12px_30px_-22px_rgba(0,0,0,0.24)] transition-colors dark:border-white/10 dark:bg-black">
              <p className="text-sm font-semibold text-text">Device Sessions</p>
              <p className="mt-1 text-xs leading-5 text-text/45">
                Manage trusted devices and active session access.
              </p>
              <Button
                variant="secondary"
                onClick={() => onNavigate('devicesessions')}
                className="mt-4 w-full justify-center"
              >
                <MonitorSmartphone className="mr-2 h-4 w-4" />
                Open Sessions
              </Button>
            </div>

            <div className="rounded-[1.25rem] border border-card-border bg-card-bg p-4 shadow-[0_12px_30px_-22px_rgba(0,0,0,0.24)] transition-colors dark:border-white/10 dark:bg-black">
              <p className="text-sm font-semibold text-text">System Logs</p>
              <p className="mt-1 text-xs leading-5 text-text/45">
                Review runtime telemetry and recent security events.
              </p>
              <Button
                variant="secondary"
                onClick={() => onNavigate('systemlogs')}
                className="mt-4 w-full justify-center"
              >
                <ClipboardList className="mr-2 h-4 w-4" />
                Open Logs
              </Button>
            </div>
          </div>
        </SectionCard>

        <SyncStorageCard
          storageUsedBytes={storageUsedBytes}
          usagePercentage={usagePercentage}
          itemCount={vaultAnalytics.itemCount}
          syncStatus={syncStatus}
          syncHealthLabel={syncHealthLabel}
          lastSuccessfulSyncAt={lastSuccessfulSyncAt}
          lastSyncAttemptAt={lastSyncAttemptAt}
          hasPendingSyncRetry={hasPendingSyncRetry}
          syncConflictCount={syncConflictCount}
          lastSyncError={lastSyncError}
          isLoading={isLoading}
          isMigrating={isMigrating}
          isSyncingLogs={isSyncingLogs}
          syncWithCloud={syncWithCloud}
          retryFailedSync={retryFailedSync}
          migrateLocalToCloud={migrateLocalToCloud}
          syncLogs={syncLogs}
          getErrorMessage={getErrorMessage}
          cancelSync={cancelSync}
          cancelActivityLogSync={cancelActivityLogSync}
        />

        {/* <SectionCard
          title="Privacy & Interface"
          description="Open the dedicated privacy and interface page to configure behavior, upload controls, and secure display options."
        >
          <div className="rounded-[1.5rem] border border-card-border bg-card-bg p-5 shadow-[0_20px_45px_-28px_rgba(0,0,0,0.18)] transition-colors dark:border-white/10 dark:bg-black sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm leading-6 text-text/50">
                  Manage privacy protections and interface behavior.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => onNavigate('privacy')}
                className="w-full justify-center sm:w-auto"
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                Privacy Toggle
              </Button>
            </div>
          </div>
        </SectionCard> */}

        <ShareVaultCard />
        <TwoFactorSettingsCard
          twoFactorEnabled={profile?.twoFactorEnabled || false}
          onUpdate={loadSessionState}
        />

        <MaintenanceCard
          isLoading={isLoading}
          syncStatus={syncStatus}
          isSessionActionLoading={isSessionActionLoading}
          isSyncingLogs={isSyncingLogs}
          hasPendingSyncRetry={hasPendingSyncRetry}
          isMigrating={isMigrating}
          syncWithCloud={syncWithCloud}
          loadSessionState={loadSessionState}
          syncLogs={syncLogs}
          retryFailedSync={retryFailedSync}
          migrateLocalToCloud={migrateLocalToCloud}
          onOpenMaintenance={onOpenMaintenance}
          lock={lock}
          handleLockAllSessions={handleLockAllSessions}
          getErrorMessage={getErrorMessage}
          setIsMigrating={setIsMigrating}
          cancelSync={cancelSync}
          cancelActivityLogSync={cancelActivityLogSync}
        />

        <EmergencyDestructionCard
          destructionStage={destructionStage}
          isDestroyingVault={isDestroyingVault}
          onEmergencyClear={handleEmergencyClear}
          onAbort={() => setDestructionStage('idle')}
        />

        <LegalComplianceCard onNavigate={onNavigate} />

        <PWAInstallModal
          isOpen={isPWAInstallModalOpen}
          onClose={() => setIsPWAInstallModalOpen(false)}
          onInstall={() => {
            void install();
            setIsPWAInstallModalOpen(false);
          }}
          isInstalled={isInstalled}
        />
      </div>
    );
  }
);

SettingsVault.displayName = 'SettingsVault';
