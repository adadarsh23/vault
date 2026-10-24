import React from 'react';
import {
  Lock,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Activity,
  RefreshCw,
  Copy,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/Card';
import { RecentActivityPanel } from '../../../../components/vault/RecentActivityPanel';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tone = 'green' | 'blue' | 'purple' | 'amber' | 'red' | 'slate';

interface SecurityStatusRow {
  title: string;
  description: string;
  icon: React.ElementType;
  tone: Tone;
  active: boolean;
}

interface VaultCompositionItem {
  label: string;
  count: number;
}

interface DashboardSecurityProps {
  recentActivityCount: number;
  securityStatusRows: readonly SecurityStatusRow[];
  vaultComposition: VaultCompositionItem[];
  itemCount: number;
  passwordCount: number;
  allowRestrictedTypes: boolean;
  isAutoLockEnabled: boolean;
  isClipboardAutoClearEnabled: boolean;
  clipboardAutoClearDuration: number;
  syncStatus: string;
  lastSyncError?: string | null;
  onNavigateSettings?: () => void;
  onRetrySync?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getToneClasses = (tone: Tone) => {
  switch (tone) {
    case 'green':
      return {
        shell: 'bg-green-500/20',
        pulse: 'bg-green-500/10',
        icon: 'text-green-400',
        dot: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]',
      };
    case 'blue':
      return {
        shell: 'bg-blue-500/20',
        pulse: 'bg-blue-500/10',
        icon: 'text-blue-400',
        dot: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]',
      };
    case 'purple':
      return {
        shell: 'bg-purple-500/20',
        pulse: 'bg-purple-500/10',
        icon: 'text-purple-400',
        dot: 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]',
      };
    case 'amber':
      return {
        shell: 'bg-amber-500/20',
        pulse: 'bg-amber-500/10',
        icon: 'text-amber-400',
        dot: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]',
      };
    case 'red':
      return {
        shell: 'bg-red-500/20',
        pulse: 'bg-red-500/10',
        icon: 'text-red-400',
        dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]',
      };
    default:
      return {
        shell: 'bg-slate-500/20',
        pulse: 'bg-slate-500/10',
        icon: 'text-slate-300',
        dot: 'bg-slate-400 shadow-[0_0_8px_rgba(148,163,184,0.7)]',
      };
  }
};

const getAdvisorySeverityStyle = (severity: 'critical' | 'warning' | 'info') => {
  switch (severity) {
    case 'critical':
      return {
        card: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-200',
        icon: 'text-red-500 dark:text-red-400',
        title: 'text-red-950 dark:text-red-100',
        desc: 'text-red-800/80 dark:text-red-200/80',
        button:
          'border border-red-500/30 bg-red-500/15 text-red-700 hover:bg-red-500/25 dark:text-red-200 dark:bg-red-500/20 dark:hover:bg-red-500/30',
      };
    case 'warning':
      return {
        card: 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200',
        icon: 'text-amber-500 dark:text-amber-400',
        title: 'text-amber-950 dark:text-amber-100',
        desc: 'text-amber-800/80 dark:text-amber-200/80',
        button:
          'border border-amber-500/30 bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-200 dark:bg-amber-500/20 dark:hover:bg-amber-500/30',
      };
    case 'info':
      return {
        card: 'border-blue-500/25 bg-blue-500/10 text-blue-800 dark:text-blue-200',
        icon: 'text-blue-500 dark:text-blue-400',
        title: 'text-blue-950 dark:text-blue-100',
        desc: 'text-blue-800/80 dark:text-blue-200/80',
        button:
          'border border-blue-500/30 bg-blue-500/15 text-blue-700 hover:bg-blue-500/25 dark:text-blue-200 dark:bg-blue-500/20 dark:hover:bg-blue-500/30',
      };
  }
};

// ─── Component ────────────────────────────────────────────────────────────────

export const DashboardSecurity: React.FC<DashboardSecurityProps> = ({
  recentActivityCount,
  securityStatusRows,
  vaultComposition,
  itemCount,
  passwordCount,
  allowRestrictedTypes,
  isAutoLockEnabled,
  isClipboardAutoClearEnabled,
  clipboardAutoClearDuration,
  syncStatus,
  lastSyncError,
  onNavigateSettings,
  onRetrySync,
}) => {
  const advisories = React.useMemo(() => {
    const list: Array<{
      id: string;
      severity: 'critical' | 'warning' | 'info';
      icon: React.ElementType;
      title: string;
      message: string;
      actionLabel?: string;
      onAction?: () => void;
    }> = [];

    if (syncStatus === 'error') {
      list.push({
        id: 'sync-error',
        severity: 'critical',
        icon: RefreshCw,
        title: 'Cloud Sync Failed',
        message:
          lastSyncError ||
          'Unable to synchronize with remote storage. Redundant cloud backup is currently unavailable.',
        actionLabel: onRetrySync ? 'Retry' : undefined,
        onAction: onRetrySync,
      });
    }

    if (!isAutoLockEnabled) {
      list.push({
        id: 'auto-lock-off',
        severity: 'critical',
        icon: ShieldAlert,
        title: 'Auto-Lock Disabled',
        message:
          'Vault remains unlocked when idle. Anyone with physical access to this device can view decrypted credentials.',
        actionLabel: onNavigateSettings ? 'Configure' : undefined,
        onAction: onNavigateSettings,
      });
    }

    if (!isClipboardAutoClearEnabled) {
      list.push({
        id: 'clipboard-clear-off',
        severity: 'warning',
        icon: Copy,
        title: 'Clipboard Auto-Clear Disabled',
        message:
          'Passwords copied to the clipboard remain indefinitely until manually cleared or overwritten.',
        actionLabel: onNavigateSettings ? 'Enable' : undefined,
        onAction: onNavigateSettings,
      });
    }

    if (allowRestrictedTypes) {
      list.push({
        id: 'restricted-types',
        severity: 'warning',
        icon: AlertTriangle,
        title: 'Restricted File Types Permitted',
        message:
          'Executable and script files are allowed in document storage. Exercise caution before opening downloaded files.',
        actionLabel: onNavigateSettings ? 'Review' : undefined,
        onAction: onNavigateSettings,
      });
    }

    if (passwordCount < 3 && itemCount > 0) {
      list.push({
        id: 'low-passwords',
        severity: 'info',
        icon: Lock,
        title: 'Vault Setup Incomplete',
        message: `Only ${passwordCount} password${passwordCount === 1 ? '' : 's'} stored. Migrate your primary credentials to keep them protected.`,
      });
    }

    return list;
  }, [
    syncStatus,
    lastSyncError,
    onRetrySync,
    isAutoLockEnabled,
    onNavigateSettings,
    isClipboardAutoClearEnabled,
    allowRestrictedTypes,
    passwordCount,
    itemCount,
  ]);
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-8">
      {/* ── Security Status ── */}
      <Card className="overflow-hidden rounded-3xl border-card-border bg-card-bg dark:border-white/10 dark:bg-black sm:rounded-[2rem]">
        <CardHeader className="border-b border-card-border/30 bg-text/5 px-4 py-4 sm:px-6">
          <CardTitle className="flex min-w-0 items-center gap-3 text-base font-black tracking-tight sm:text-lg">
            <div className="shrink-0 rounded-xl bg-green-500/10 p-2 text-green-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="min-w-0 truncate">Security Integrity</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-4 sm:space-y-8 sm:p-6">
          {/* Status rows */}
          <div className="grid grid-cols-1 gap-3">
            {securityStatusRows.map((row, index) => {
              const tone = getToneClasses(row.tone);
              const Icon = row.icon;

              return (
                <div
                  key={row.title}
                  className="group relative flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-card-border/30 bg-card-bg/30 p-3 transition-all hover:border-text/20 hover:bg-card-bg/50 sm:rounded-3xl sm:p-4"
                >
                  <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                    <div
                      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12 ${tone.shell}`}
                    >
                      <motion.div
                        className={`absolute inset-0 rounded-2xl ${tone.pulse}`}
                        animate={{
                          scale: [1, 1.2, 1],
                          opacity: [0.3, 0, 0.3],
                        }}
                        transition={{
                          duration: 3,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: index * 0.5,
                        }}
                      />
                      <Icon
                        className={`relative z-10 h-5 w-5 sm:h-6 sm:w-6 ${tone.icon} drop-shadow-[0_0_8px_currentColor]`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-text transition-colors">{row.title}</p>
                      <p className="break-words text-[10px] font-medium uppercase tracking-wider text-text/40 transition-colors">
                        {row.description}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot} transition-all group-hover:scale-125`}
                  />
                </div>
              );
            })}
          </div>

          {/* Vault Composition */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <div className="h-0.5 w-4 rounded-full bg-text/20" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35 transition-colors">
                Composition
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {vaultComposition.map((comp, index) => (
                <motion.div
                  key={comp.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="group relative overflow-hidden rounded-2xl border border-card-border/40 bg-card-bg/40 p-4 transition-all hover:border-card-border/70 hover:bg-card-bg/60"
                >
                  <div className="relative z-10">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35 transition-colors group-hover:text-text/55">
                      {comp.label}
                    </p>
                    <p className="text-3xl font-black text-text">{comp.count}</p>
                  </div>

                  {/* <div className="absolute right-4 top-4 flex gap-1 opacity-50 transition-opacity group-hover:opacity-80">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1 w-1 rounded-full ${i === 3 ? 'bg-text/45' : 'bg-text/20'}`}
                      />
                    ))}
                  </div> */}

                  <div className="absolute inset-x-4 bottom-3 h-px bg-text/10" />
                </motion.div>
              ))}
            </div>
          </div>

          {/* Recommendations */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <div className="h-0.5 w-4 rounded-full bg-text/20" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text/35 transition-colors">
                  Security Recommendations
                </p>
              </div>
              {advisories.length === 0 && (
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-500">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
              )}
            </div>

            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {advisories.length === 0 ? (
                  <motion.div
                    key="all-passed"
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex min-w-0 items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:text-emerald-200"
                  >
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500 dark:text-emerald-400 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold leading-tight text-emerald-950 dark:text-emerald-100">
                        All Protections Active
                      </p>
                      <p className="text-[11px] text-emerald-800/80 dark:text-emerald-200/80 leading-snug mt-0.5">
                        Auto-lock and clipboard auto-clear ({clipboardAutoClearDuration}s) are
                        active, and all {itemCount} vault items are securely encrypted.
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  advisories.map((item, index) => {
                    const styles = getAdvisorySeverityStyle(item.severity);
                    const Icon = item.icon;

                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: index * 0.05 }}
                        className={`flex min-w-0 items-start justify-between gap-3 rounded-2xl border p-3.5 ${styles.card}`}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${styles.icon}`} />
                          <div className="min-w-0 space-y-0.5">
                            <p className={`text-xs font-bold leading-tight ${styles.title}`}>
                              {item.title}
                            </p>
                            <p className={`text-[11px] leading-snug break-words ${styles.desc}`}>
                              {item.message}
                            </p>
                          </div>
                        </div>

                        {item.actionLabel && item.onAction && (
                          <button
                            type="button"
                            onClick={item.onAction}
                            className={`shrink-0 rounded-xl px-2.5 py-1 text-[11px] font-semibold transition-all ${styles.button}`}
                          >
                            {item.actionLabel}
                          </button>
                        )}
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Activity ── */}
      <Card className="overflow-hidden rounded-3xl border-card-border bg-card-bg dark:border-white/10 dark:bg-black sm:rounded-[2rem]">
        <CardHeader className="border-b border-card-border/30 bg-text/5 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <CardTitle className="flex min-w-0 items-center gap-3 text-base font-black tracking-tight sm:text-lg">
              <div className="shrink-0 rounded-xl bg-blue-500/10 p-2 text-blue-400">
                <Activity className="h-5 w-5" />
              </div>
              <span className="min-w-0 truncate">Activity Log</span>
            </CardTitle>
            {recentActivityCount > 0 && (
              <span className="shrink-0 rounded-full border border-blue-500/30 bg-blue-500/20 px-2.5 py-1 text-[9px] font-medium text-neutral-900 dark:text-white shadow-[0_0_12px_rgba(59,130,246,0.2)] animate-pulse sm:px-3 sm:text-[10px]">
                {recentActivityCount}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex h-[380px] sm:h-[460px] flex-col min-h-0 p-3 sm:p-6 overflow-hidden">
          <RecentActivityPanel />
        </CardContent>
      </Card>
    </div>
  );
};
