import React from 'react';
import { ArrowLeft, MonitorSmartphone } from 'lucide-react';
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
  const [showSessions, setShowSessions] = React.useState(false);
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
      toast.error(getErrorMessage(error, 'Failed to load account sessions'));
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
    []
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
    [loadSessionState, trustedDeviceLabels]
  );

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-bg px-4 py-5 text-text sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-text sm:text-4xl">
              Device Sessions
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-text/60 sm:text-base">
              Manage trusted devices and active login sessions.
            </p>
          </div>

          <div className="flex gap-3 lg:flex-col">
            <Button
              variant="ghost"
              onClick={onBack}
              className="h-11 w-full justify-center rounded-2xl border border-card-border bg-card-bg px-5 text-text/85 hover:bg-text/5 hover:text-text lg:w-auto"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            {!showSessions && (
              <Button onClick={() => setShowSessions(true)} className="h-11 w-full rounded-2xl">
                <MonitorSmartphone className="mr-2 h-4 w-4" />
                Open
              </Button>
            )}
          </div>
        </div>

        {showSessions && (
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
        )}
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
