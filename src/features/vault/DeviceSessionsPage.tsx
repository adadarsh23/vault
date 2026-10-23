import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { SessionControlsCard } from './components/SettingsVault/SessionControlsCard';
import { RenameSessionModal } from './components/SettingsVault/RenameSessionModal';
import {
  getAuthenticatedProfile,
  revokeVaultDeviceSession,
  renameVaultDeviceSession,
  type AuthSessionSummary,
  type SessionRevokeResponse,
} from '../../lib/auth-api';
import { getDeviceId, getTrustedDeviceLabels, setTrustedDeviceLabel } from '../../lib/auth-session';
import { getSessionName, setSessionName } from '../../lib/activity';
import { toast } from 'sonner';
import { getErrorMessage } from './components/SettingsVault/Utils';

interface DeviceSessionsPageProps {
  onBack: () => void;
}

export const DeviceSessionsPage: React.FC<DeviceSessionsPageProps> = ({ onBack }) => {
  const [sessions, setSessions] = React.useState<AuthSessionSummary[]>([]);
  const [trustedDeviceLabels, setTrustedDeviceLabels] = React.useState<Record<string, string>>({});
  const [isSessionActionLoading, setIsSessionActionLoading] = React.useState(false);
  const [currentSessionName, setCurrentSessionName] = React.useState(getSessionName());
  const [renamingSession, setRenamingSession] = React.useState<{
    id: string;
    label: string;
    isCurrent?: boolean;
  } | null>(null);
  const [renameDraft, setRenameDraft] = React.useState('');

  const loadSessionState = React.useCallback(async () => {
    setIsSessionActionLoading(true);
    try {
      const nextProfile = await getAuthenticatedProfile();
      setSessions(nextProfile.sessions || []);
      setTrustedDeviceLabels(getTrustedDeviceLabels());
    } catch (error: unknown) {
      setSessions([]);
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        toast.error(getErrorMessage(error, 'Failed to load account sessions'));
      }
    } finally {
      setIsSessionActionLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSessionState();
  }, [loadSessionState]);

  const handleSaveTrustedDeviceLabel = React.useCallback(
    async (deviceId: string, label: string) => {
      const trimmed = label.trim();
      setTrustedDeviceLabel(deviceId, trimmed);
      setTrustedDeviceLabels((current) => {
        const next = { ...current };
        if (trimmed) {
          next[deviceId] = trimmed;
        } else {
          delete next[deviceId];
        }
        return next;
      });

      if (deviceId === getDeviceId()) {
        setSessionName(trimmed || 'Browser session');
        setCurrentSessionName(getSessionName());
      }

      setRenamingSession(null);

      try {
        const result = await renameVaultDeviceSession(deviceId, trimmed);
        setSessions(result.sessions || []);
        toast.success('Device label saved to cloud');
      } catch {
        toast.error('Failed to sync label to cloud, but saved locally.');
      }
    },
    [],
  );

  const handleLockAllSessions = React.useCallback(async () => {
    if (
      !confirm('This will revoke every device session and lock this browser immediately. Continue?')
    ) {
      return;
    }

    setIsSessionActionLoading(true);
    try {
      await revokeVaultDeviceSession({
        revokeAllOther: true,
        revokeCurrent: true,
      });
      setSessions([]);
      toast.success('All device sessions were locked');
      onBack();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to lock all sessions'));
    } finally {
      setIsSessionActionLoading(false);
    }
  }, [onBack]);

  const handleRevokeSession = React.useCallback(
    async (session: AuthSessionSummary) => {
      const deviceLabel = trustedDeviceLabels[session.deviceId] || session.deviceId;
      if (!confirm(`Revoke the session for "${deviceLabel}"?`)) {
        return;
      }

      setIsSessionActionLoading(true);
      try {
        const result: SessionRevokeResponse = await revokeVaultDeviceSession({
          sessionId: session.sessionId,
        });
        setSessions(result.sessions || []);
        toast.success('Session revoked');
      } catch (error: unknown) {
        const errorCode =
          typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: string }).code
            : undefined;

        if (errorCode === 'SESSION_NOT_FOUND') {
          toast.info('That session is already inactive. Refreshing list.');
          await loadSessionState();
        } else {
          toast.error(getErrorMessage(error, 'Failed to revoke session'));
        }
      } finally {
        setIsSessionActionLoading(false);
      }
    },
    [loadSessionState, trustedDeviceLabels],
  );

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-bg px-3 py-4 text-text sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:gap-6">
        <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
                Device Security
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-text sm:text-3xl lg:text-4xl">
              Device Sessions
            </h1>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-text/60 sm:text-sm lg:text-base">
              Manage trusted devices, track active login sessions, and revoke access for lost or
              untrusted hardware.
            </p>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <Button
              variant="outline"
              onClick={onBack}
              className="h-10 sm:h-11 flex-1 sm:flex-initial justify-center rounded-xl border border-card-border bg-card-bg px-4 text-xs sm:text-sm text-text/85 hover:bg-text/5 hover:text-text"
            >
              <ArrowLeft className="mr-2 h-4 w-4 shrink-0" />
              Back
            </Button>
          </div>
        </div>

        <SessionControlsCard
          sessions={sessions}
          currentSessionName={currentSessionName}
          trustedDeviceLabels={trustedDeviceLabels}
          isSessionActionLoading={isSessionActionLoading}
          onRefreshSessions={loadSessionState}
          onLockAllSessions={handleLockAllSessions}
          onRevokeSession={handleRevokeSession}
          onRenameRequest={(session) => {
            setRenamingSession(session);
            setRenameDraft(session.label);
          }}
        />
      </div>

      {renamingSession && (
        <RenameSessionModal
          renamingSession={renamingSession}
          renameDraft={renameDraft}
          setRenameDraft={setRenameDraft}
          onSave={handleSaveTrustedDeviceLabel}
          onCancel={() => setRenamingSession(null)}
        />
      )}
    </div>
  );
};

export default DeviceSessionsPage;
