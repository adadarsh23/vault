import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  RefreshCw,
  Database,
  WifiOff,
  AlertCircle,
  X,
  FileText,
  Key,
  Image as ImageIcon,
  FileBox,
  Users,
  ShieldCheck,
  ChevronDown,
  Clock,
} from 'lucide-react';
import { useVaultStore } from '../../store/vaultStore';
import { resolveApiBaseUrl } from '../../lib/apiBaseUrl';
import { cn } from '../../lib/utils';

interface CloudStatusDetail {
  status: 'connected' | 'error' | 'loading';
  dbName: string | null;
}

export const UniversalSyncWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<'connected' | 'error' | 'loading'>('loading');
  const [dbName, setDbName] = useState<string | null>(null);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const containerRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const shouldReduceMotion = useReducedMotion();

  const isUnlocked = useVaultStore((state) => state.isUnlocked);
  const isVaultReady = useVaultStore((state) => state.isVaultReady);
  const syncStatus = useVaultStore((state) => state.syncStatus);
  const items = useVaultStore((state) => state.items);
  const lastSyncAttemptAt = useVaultStore((state) => state.lastSyncAttemptAt);
  const lastSyncError = useVaultStore((state) => state.lastSyncError);
  const fetchItems = useVaultStore((state) => state.fetchItems);

  useEffect(() => {
    isMountedRef.current = true;
    const ticker = setInterval(() => {
      setNow(Date.now());
    }, 15000);
    return () => {
      isMountedRef.current = false;
      clearInterval(ticker);
    };
  }, []);

  // Self-contained resilient cloud health check
  const checkHealth = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (isMountedRef.current) setCloudStatus('error');
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const rawBase = resolveApiBaseUrl();
      const baseUrl = rawBase.replace(/\/api\/?$/, '').replace(/\/+$/, '');
      const targets: string[] = [`${baseUrl}/health`, `${baseUrl}/api/health`];

      if (typeof window !== 'undefined' && window.location) {
        const { hostname, port, protocol } = window.location;
        if (port && port !== '4000' && (protocol === 'http:' || protocol === 'https:')) {
          const fallbackHost = `${protocol}//${hostname}:4000`;
          if (!targets.includes(`${fallbackHost}/health`)) {
            targets.push(`${fallbackHost}/health`);
            targets.push(`${fallbackHost}/api/health`);
          }
        }
      }

      let resp: Response | null = null;
      for (const targetUrl of targets) {
        try {
          resp = await fetch(targetUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });
          if (resp && resp.ok) break;
        } catch {
          // Continue to next candidate
        }
      }

      if (resp && resp.ok) {
        const data = await resp.json().catch(() => null);
        if (data && (data.status === 'connected' || data.success === true)) {
          const newDbName = data.database?.name || null;
          if (isMountedRef.current) {
            setCloudStatus('connected');
            setDbName(newDbName);
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('vault-cloud-health-status', {
                detail: { status: 'connected', dbName: newDbName },
              }),
            );
          }
        } else if (isMountedRef.current) {
          setCloudStatus('error');
        }
      } else if (isMountedRef.current) {
        setCloudStatus('error');
      }
    } catch {
      if (isMountedRef.current) {
        setCloudStatus('error');
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  // Event bus and periodic status sync
  useEffect(() => {
    let isMounted = true;

    const handleHealthStatus = (event: Event) => {
      const customEvent = event as CustomEvent<CloudStatusDetail>;
      if (isMounted && customEvent.detail) {
        if (customEvent.detail.status) {
          setCloudStatus(customEvent.detail.status);
        }
        if (customEvent.detail.dbName !== undefined) {
          setDbName(customEvent.detail.dbName);
        }
      }
    };

    const handleOnline = () => {
      if (isMounted) {
        setCloudStatus('loading');
        void checkHealth();
      }
    };

    const handleOffline = () => {
      if (isMounted) setCloudStatus('error');
    };

    const handleTrigger = () => {
      if (isMounted) void checkHealth();
    };

    window.addEventListener('vault-cloud-health-status', handleHealthStatus);
    window.addEventListener('vault-cloud-health-trigger', handleTrigger);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    void checkHealth();

    const interval = setInterval(() => {
      if (isMounted) void checkHealth();
    }, 30000);

    return () => {
      isMounted = false;
      window.removeEventListener('vault-cloud-health-status', handleHealthStatus);
      window.removeEventListener('vault-cloud-health-trigger', handleTrigger);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [checkHealth]);

  // Click outside and escape handler
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Aggregate item categories
  const categoryStats = useMemo(() => {
    const counts = {
      passwords: 0,
      notes: 0,
      media: 0,
      documents: 0,
      contacts: 0,
      secrets: 0,
      other: 0,
    };

    for (const item of items) {
      switch (item.type) {
        case 'password':
          counts.passwords++;
          break;
        case 'note':
        case 'todo':
        case 'chat':
        case 'location':
          counts.notes++;
          break;
        case 'photo':
        case 'video':
        case 'audio':
          counts.media++;
          break;
        case 'document':
        case 'file':
          counts.documents++;
          break;
        case 'contact':
        case 'identity':
          counts.contacts++;
          break;
        case 'secret':
        case 'card':
        case 'wifi':
          counts.secrets++;
          break;
        default:
          counts.other++;
          break;
      }
    }

    const stats = [
      { label: 'Passwords', count: counts.passwords, icon: Key, color: 'text-amber-500' },
      { label: 'Notes & Todos', count: counts.notes, icon: FileText, color: 'text-blue-500' },
      { label: 'Media Files', count: counts.media, icon: ImageIcon, color: 'text-purple-500' },
      { label: 'Documents', count: counts.documents, icon: FileBox, color: 'text-emerald-500' },
      { label: 'Contacts & IDs', count: counts.contacts, icon: Users, color: 'text-cyan-500' },
      { label: 'Secrets & Keys', count: counts.secrets, icon: ShieldCheck, color: 'text-rose-500' },
    ];

    if (counts.other > 0) {
      stats.push({
        label: 'Other Items',
        count: counts.other,
        icon: FileBox,
        color: 'text-purple-400',
      });
    }

    return stats;
  }, [items]);

  // Relative timestamp calculation with live ticking updates
  const relativeTime = useMemo(() => {
    if (!lastSyncAttemptAt) return 'Never';
    const diff = Math.max(0, Math.floor((now - lastSyncAttemptAt) / 1000));
    if (diff < 15) return 'Just now';
    if (diff < 60) return `${diff}s ago`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }, [lastSyncAttemptAt, syncStatus, now]);

  // Consolidated state flags
  const isSyncing = syncStatus === 'syncing' || isManualSyncing;
  const isError = cloudStatus === 'error' || syncStatus === 'error';

  const handleManualSync = useCallback(async () => {
    if (isSyncing) return;
    setIsManualSyncing(true);

    try {
      await checkHealth();
      await fetchItems('manual');
    } catch {
      // Error handled by store toast notifications
    } finally {
      if (isMountedRef.current) {
        setIsManualSyncing(false);
      }
    }
  }, [checkHealth, fetchItems, isSyncing]);

  // Only render when vault is unlocked and ready (user is logged in / signed in)
  if (!isUnlocked || !isVaultReady) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="fixed bottom-3.5 right-3.5 sm:bottom-5 sm:right-5 z-50 select-none print:hidden"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      {/* ─── Responsive Mini Sync Center Popover ─── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.95 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-14 right-0 mb-1 w-[calc(100vw-1.75rem)] sm:w-96 max-w-[24rem] max-h-[calc(100vh-6rem)] overflow-y-auto custom-scrollbar rounded-2xl border border-card-border/80 bg-sidebar-bg/95 p-3.5 sm:p-4 shadow-2xl backdrop-blur-2xl text-text transition-colors duration-200"
            role="dialog"
            aria-modal="false"
            aria-label="Universal Cloud Sync Center"
          >
            {/* Popover Header */}
            <div className="flex items-center justify-between pb-3 border-b border-text/10">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={cn(
                    'p-2 rounded-xl shrink-0 flex items-center justify-center',
                    isSyncing
                      ? 'bg-blue-500/10 text-blue-500'
                      : isError
                        ? 'bg-red-500/10 text-red-500'
                        : 'bg-emerald-500/10 text-emerald-500',
                  )}
                >
                  {isSyncing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : isError ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <Database className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text/90 truncate">
                    Universal Sync Center
                  </h3>
                  <p className="text-[11px] text-text/50 font-medium truncate">
                    {dbName ? `MongoDB Atlas (${dbName})` : 'MongoDB Atlas Cloud'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-text/40 hover:text-text hover:bg-text/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20 active:scale-95 shrink-0 touch-manipulation"
                aria-label="Close sync center"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Live Status Pill */}
            <div
              className={cn(
                'my-3 flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-medium',
                isSyncing
                  ? 'bg-blue-500/5 border-blue-500/20 text-blue-500'
                  : isError
                    ? 'bg-red-500/5 border-red-500/20 text-red-500'
                    : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    isSyncing
                      ? 'bg-blue-500 animate-ping'
                      : isError
                        ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                        : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]',
                  )}
                />
                <span className="truncate">
                  {isSyncing
                    ? 'Syncing all vaults...'
                    : isError
                      ? lastSyncError || 'Cloud connection lost'
                      : 'All vaults protected & synced'}
                </span>
              </div>

              <div className="flex items-center gap-1 text-[11px] text-text/40 shrink-0 ml-2 font-mono">
                <Clock className="h-3 w-3" />
                <span>{relativeTime}</span>
              </div>
            </div>

            {/* Vault Breakdown */}
            <div className="space-y-1.5 py-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text/40 px-1 mb-1.5 flex items-center justify-between">
                <span>Vault Collections</span>
                <span className="font-mono">{items.length} Total</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {categoryStats.map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={stat.label}
                      className="flex items-center justify-between p-2 rounded-xl bg-text/5 border border-text/5 hover:border-text/10 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Icon className={cn('h-3.5 w-3.5 shrink-0', stat.color)} />
                        <span className="text-[11px] font-medium text-text/75 truncate">
                          {stat.label}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-text/90 ml-1 shrink-0 font-mono">
                        {stat.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Footer */}
            <div className="mt-3 pt-3 border-t border-text/10 flex items-center gap-2">
              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 px-3.5 rounded-xl text-xs font-semibold shadow-sm transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/20 touch-manipulation',
                  isSyncing
                    ? 'bg-text/10 text-text/40 cursor-not-allowed'
                    : 'bg-text text-bg hover:opacity-90 cursor-pointer shadow-md',
                )}
              >
                <RefreshCw className={cn('h-3.5 w-3.5 shrink-0', isSyncing && 'animate-spin')} />
                <span>{isSyncing ? 'Synchronizing...' : 'Sync All Vaults Now'}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Touch-Optimized Floating Universal Sync Capsule Trigger ─── */}
      <motion.button
        type="button"
        whileHover={shouldReduceMotion ? undefined : { scale: 1.04 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.95 }}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'group relative flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-full border shadow-lg backdrop-blur-xl transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text/30 cursor-pointer active:scale-95 touch-manipulation',
          isOpen
            ? 'bg-text text-bg border-transparent shadow-xl ring-2 ring-text/20'
            : isError
              ? 'bg-sidebar-bg/95 border-red-500/30 text-red-500 hover:border-red-500/50 shadow-red-500/5'
              : isSyncing
                ? 'bg-sidebar-bg/95 border-blue-500/30 text-blue-500 hover:border-blue-500/50 shadow-blue-500/5'
                : 'bg-sidebar-bg/95 border-text/15 text-text/80 hover:text-text hover:border-text/30',
        )}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={
          isSyncing
            ? 'Cloud is synchronizing'
            : isError
              ? 'Cloud connection error'
              : 'Universal cloud sync - All vaults protected'
        }
        title={
          isSyncing
            ? 'Syncing all vaults...'
            : isError
              ? 'Cloud connection issue - Click for details'
              : `All vaults synced (${items.length} items) - Click to view`
        }
      >
        {/* State Indicator Icon */}
        <div className="relative flex items-center justify-center shrink-0">
          {isSyncing ? (
            <RefreshCw
              className={cn('h-4 w-4 animate-spin', isOpen ? 'text-bg' : 'text-blue-500')}
            />
          ) : isError ? (
            <WifiOff className={cn('h-4 w-4', isOpen ? 'text-bg' : 'text-red-500')} />
          ) : (
            <Database
              className={cn(
                'h-4 w-4 transition-colors',
                isOpen ? 'text-bg' : 'text-text/70 group-hover:text-text',
              )}
            />
          )}

          {/* Status Dot */}
          <span
            className={cn(
              'absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-sidebar-bg transition-all',
              isOpen
                ? 'bg-bg'
                : isSyncing
                  ? 'bg-blue-500 animate-ping'
                  : isError
                    ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                    : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
            )}
          />
        </div>

        {/* Responsive Text Label */}
        <span
          className={cn(
            'text-xs font-semibold tracking-tight truncate max-w-[120px] hidden sm:inline-block',
            isOpen ? 'text-bg' : 'text-text',
          )}
        >
          {isSyncing ? 'Syncing...' : isError ? 'Offline' : 'All Synced'}
        </span>

        {/* Expand / Collapse Indicator */}
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-200 opacity-60 shrink-0',
            isOpen ? 'rotate-180 text-bg opacity-100' : 'group-hover:opacity-100',
          )}
        />
      </motion.button>
    </div>
  );
};
