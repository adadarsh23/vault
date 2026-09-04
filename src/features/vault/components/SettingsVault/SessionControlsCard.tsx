import React, { useMemo, useState, useCallback } from 'react';
import { RefreshCw, Lock, Edit3, Loader2, X } from 'lucide-react';
import { Button } from '../../../../components/ui/Button';
import { SectionCard, ActionButton } from './SharedComponents';
import { formatDate, formatCountLabel } from './Utils';
import { type AuthSessionSummary } from '../../../../lib/auth-api';

type RenameSessionRequest = {
  id: string;
  label: string;
  isCurrent?: boolean;
};

interface SessionControlsCardProps {
  sessions: AuthSessionSummary[];
  currentSessionName: string;
  trustedDeviceLabels: Record<string, string>;
  isSessionActionLoading: boolean;
  onRefreshSessions: () => Promise<void>;
  onLockAllSessions: () => Promise<void>;
  onRevokeSession: (session: AuthSessionSummary) => Promise<void>;
  onRenameRequest: (session: RenameSessionRequest) => void;
}

export const SessionControlsCard: React.FC<SessionControlsCardProps> = ({
  sessions,
  currentSessionName,
  trustedDeviceLabels,
  isSessionActionLoading,
  onRefreshSessions,
  onLockAllSessions,
  onRevokeSession,
  onRenameRequest,
}) => {
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  const currentSession = useMemo(
    () => sessions.find((session) => session.isCurrent) ?? null,
    [sessions],
  );
  const currentDeviceId = currentSession?.deviceId ?? '';
  const canRenameCurrentSession = currentDeviceId.trim().length > 0;
  const currentLabel = currentDeviceId
    ? (trustedDeviceLabels[currentDeviceId] ?? currentSessionName)
    : currentSessionName;

  const handleRevoke = useCallback(
    async (session: AuthSessionSummary) => {
      setLoadingSessionId(session.sessionId);
      try {
        await onRevokeSession(session);
      } finally {
        setLoadingSessionId(null);
      }
    },
    [onRevokeSession],
  );

  return (
    <SectionCard
      title="Device Sessions"
      description="Manage trusted devices, refresh the current session list, and revoke access from devices you no longer trust."
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <ActionButton
          icon={RefreshCw}
          label="Refresh sessions"
          onClick={onRefreshSessions}
          loading={isSessionActionLoading}
        />
        <ActionButton
          icon={Lock}
          label="Lock all sessions"
          onClick={onLockAllSessions}
          disabled={isSessionActionLoading}
          variant="danger"
        />
      </div>

      <div className="mt-4 rounded-[1.4rem] border border-card-border bg-card-bg p-3 dark:border-white/10 dark:bg-black sm:p-4">
        <div className="mb-4 flex flex-col gap-4 border-b border-card-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-text">Session Identity</p>
            <p className="mt-1 truncate text-xs text-text/45">
              This browser session:{' '}
              <span className="font-semibold text-text/70">{currentSessionName}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              disabled={!canRenameCurrentSession}
              onClick={() => {
                if (!canRenameCurrentSession) return;
                onRenameRequest({
                  id: currentDeviceId,
                  label: currentLabel,
                  isCurrent: true,
                });
              }}
              className="h-8 px-3 text-[10px] font-bold uppercase tracking-wider text-text/60 hover:bg-text/5"
            >
              <Edit3 className="mr-1.5 h-3.5 w-3.5 text-text/40" />
              Edit
            </Button>
            <div className="h-4 w-[1px] bg-card-border/50 mx-1 hidden sm:block" />
            <div className="inline-flex items-center rounded-full border border-card-border bg-text/[0.03] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-text/45">
              {formatCountLabel(sessions.length, 'session')}
            </div>
          </div>
        </div>

        <div className="max-h-[30rem] overflow-y-auto pr-1 custom-scrollbar sm:max-h-[34rem]">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sessions.length === 0 ? (
              <div className="rounded-2xl border border-card-border bg-card-bg p-4 text-sm text-text/55">
                No active sessions found.
              </div>
            ) : (
              sessions.map((session) => {
                const savedLabel =
                  trustedDeviceLabels[session.deviceId] ??
                  session.deviceName ??
                  (session.isCurrent ? currentSessionName : 'Unnamed device');

                return (
                  <div
                    key={session.sessionId}
                    className="rounded-2xl border border-card-border bg-card-bg p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-text">{savedLabel}</p>
                          {session.isCurrent ? (
                            <span className="rounded-full border border-card-border bg-text/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-text/65">
                              Current
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-text/45">
                          {session.userAgent ?? session.deviceId}
                        </p>
                      </div>

                      <button
                        aria-label="Edit device label"
                        type="button"
                        onClick={() => {
                          if (!session.deviceId) return;
                          onRenameRequest({
                            id: session.deviceId,
                            label: savedLabel,
                            isCurrent: session.isCurrent,
                          });
                        }}
                        className="rounded-lg border border-card-border bg-text/5 p-2 text-text/55 transition-colors hover:bg-text/10 hover:text-text disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Edit device label"
                        disabled={!session.deviceId}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-text/50">
                      <p className="break-all">Device ID: {session.deviceId}</p>
                      <p>Last used: {formatDate(session.lastUsedAt)}</p>
                      <p>Expires: {formatDate(session.expiresAt)}</p>
                      <p>IP: {session.ipAddress || 'Unknown'}</p>
                    </div>

                    {!session.isCurrent ? (
                      <Button
                        variant="outline"
                        onClick={() => void handleRevoke(session)}
                        disabled={
                          isSessionActionLoading ||
                          (loadingSessionId !== null && loadingSessionId !== session.sessionId)
                        }
                        aria-busy={loadingSessionId === session.sessionId}
                        className="mt-4 w-full justify-center"
                      >
                        {loadingSessionId === session.sessionId ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <X className="mr-2 h-4 w-4" />
                        )}
                        {loadingSessionId === session.sessionId ? 'Revoking...' : 'Revoke session'}
                      </Button>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
};
