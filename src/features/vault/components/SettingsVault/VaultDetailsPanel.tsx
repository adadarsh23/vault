import React, { memo } from 'react';
import {
  Box,
  CalendarClock,
  Database,
  Fingerprint,
  Info,
  Lock,
  Shield,
  TimerReset,
  User,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/Card';

interface VaultDetailsPanelProps {
  username: string | null;
  userId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  lastLoginAt?: string | null;
  lastSyncAt?: string | null;
  activeSessionCount?: number;
  itemCount: number;
}

const architectureItems = [
  {
    title: 'Storage Node',
    value: 'MongoDB Atlas',
    description: 'Primary encrypted cloud persistence',
    icon: Database,
    tone: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  {
    title: 'Key Derivation',
    value: 'Argon2id V1',
    description: 'Memory-hard master Key derivation',
    icon: Fingerprint,
    tone: 'text-violet-400',
    bg: 'bg-violet-500/10',
  },
  {
    title: 'Encryption',
    value: 'AES-256-GCM',
    description: 'Authenticated encryption for vault content',
    icon: Lock,
    tone: 'text-rose-400',
    bg: 'bg-rose-500/10',
  },
  {
    title: 'Vault Engine',
    value: 'Version 1.0.0',
    description: 'Current secure application runtime',
    icon: Shield,
    tone: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
  },
] as const;

const formatProfileDate = (value?: string | null) => {
  if (!value) {
    return 'Not available';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not available' : parsed.toLocaleString();
};

export const VaultDetailsPanel: React.FC<VaultDetailsPanelProps> = memo(
  ({
    username,
    userId,
    createdAt,
    updatedAt,
    lastLoginAt,
    lastSyncAt,
    activeSessionCount = 0,
    itemCount,
  }) => (
    <Card className="overflow-hidden border-card-border bg-card-bg">
      <CardHeader className="border-b border-white/5 bg-gradient-to-r from-white/[0.03] to-transparent px-4 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-400">
            <Info className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-lg">Vault Details, Profile & Architecture</CardTitle>
            <CardDescription className="mt-2 max-w-2xl leading-6">
              A quick summary of the active account, profile timeline, session state, protected
              inventory, and the secure building blocks behind this vault.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 px-4 pb-5 pt-5 sm:space-y-6 sm:px-6 sm:pb-6 sm:pt-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
            Profile
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 sm:p-5 xl:col-span-2">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-400">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
                    Account Identity
                  </p>
                  <p className="mt-2 truncate text-base font-bold text-text">
                    {username || 'Unknown'}
                  </p>
                  <p className="mt-1 break-all text-xs text-text/45">
                    User ID: {userId || 'Not available'}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-text/45">
                    Account currently associated with this unlocked vault and device session set.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-400">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
                    Account Timeline
                  </p>
                  <div className="mt-2 space-y-2 text-xs text-text/45">
                    <p>Created: {formatProfileDate(createdAt)}</p>
                    <p>Updated: {formatProfileDate(updatedAt)}</p>
                    <p>Last login: {formatProfileDate(lastLoginAt)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-400">
                  <TimerReset className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
                    Session Snapshot
                  </p>
                  <div className="mt-2 space-y-2 text-xs text-text/45">
                    <p>Active sessions: {activeSessionCount}</p>
                    <p>Last sync: {formatProfileDate(lastSyncAt)}</p>
                    <p>Protected items: {itemCount}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-400">
                <User className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
                  Active User
                </p>
                <p className="mt-2 truncate text-base font-bold text-text">
                  {username || 'Unknown'}
                </p>
                <p className="mt-2 text-xs leading-5 text-text/45">
                  Primary account label currently associated with this unlocked vault session.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-400">
                <Box className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
                  Protected Items
                </p>
                <p className="mt-2 text-base font-bold text-text">{itemCount}</p>
                <p className="mt-2 text-xs leading-5 text-text/45">
                  Encrypted records currently loaded into the vault workspace.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35">
            Architecture
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
            {architectureItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 transition-colors hover:border-white/10 hover:bg-white/[0.05] sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <div className={`rounded-xl p-2.5 ${item.bg} ${item.tone}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text">{item.title}</p>
                      <p className="mt-1 break-words text-base font-bold text-text">{item.value}</p>
                      <p className="mt-2 text-xs leading-5 text-text/45">{item.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
);

VaultDetailsPanel.displayName = 'VaultDetailsPanel';
