import React, { useCallback, useEffect, useState } from 'react';
import { Database, RefreshCw, WifiOff, CheckCircle2 } from 'lucide-react';
import { resolveApiBaseUrl } from '../../lib/apiBaseUrl';
import { cn } from '../../lib/utils';

interface CloudHealthIndicatorProps {
  compact?: boolean;
  className?: string;
}

export const CloudHealthIndicator: React.FC<CloudHealthIndicatorProps> = ({
  compact = false,
  className,
}) => {
  const [status, setStatus] = useState<'connected' | 'error' | 'loading'>('loading');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [dbName, setDbName] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('error');
      return;
    }

    setIsReconnecting(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const rawBase = resolveApiBaseUrl();
      const baseUrl = rawBase.replace(/\/api\/?$/, '').replace(/\/+$/, '');

      const targets: string[] = [`${baseUrl}/health`, `${baseUrl}/api/health`];

      // On local/LAN preview sessions where UI port differs from backend API port (e.g. preview on :4173 or :5173 with API on :4000),
      // append backend candidate URL with port 4000 if not already present.
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
          if (resp && resp.ok) {
            break;
          }
        } catch {
          // Try next candidate URL target
        }
      }

      if (resp && resp.ok) {
        const data = await resp.json().catch(() => null);
        if (data && (data.status === 'connected' || data.success === true)) {
          const newDbName = data.database?.name || null;
          setStatus('connected');
          setDbName(newDbName);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('vault-cloud-health-status', {
                detail: { status: 'connected', dbName: newDbName },
              }),
            );
          }
        } else {
          setStatus('error');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('vault-cloud-health-status', {
                detail: { status: 'error', dbName: null },
              }),
            );
          }
        }
      } else {
        setStatus('error');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('vault-cloud-health-status', {
              detail: { status: 'error', dbName: null },
            }),
          );
        }
      }
    } catch {
      setStatus('error');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vault-cloud-health-status', {
            detail: { status: 'error', dbName: null },
          }),
        );
      }
    } finally {
      clearTimeout(timeoutId);
      setIsReconnecting(false);
    }
  }, []);

  const triggerGlobalCheck = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('vault-cloud-health-trigger'));
    }
    checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    let isMounted = true;

    const handleSyncStatus = (event: Event) => {
      const customEvent = event as CustomEvent<{
        status: 'connected' | 'error' | 'loading';
        dbName: string | null;
      }>;
      if (isMounted && customEvent.detail) {
        setStatus(customEvent.detail.status);
        if (customEvent.detail.dbName !== undefined) {
          setDbName(customEvent.detail.dbName);
        }
      }
    };

    const handleTriggerCheck = () => {
      if (isMounted) {
        checkHealth();
      }
    };

    const handleOnline = () => {
      if (isMounted) {
        checkHealth();
      }
    };

    const handleOffline = () => {
      if (isMounted) {
        setStatus('error');
      }
    };

    runCheck();

    window.addEventListener('vault-cloud-health-status', handleSyncStatus);
    window.addEventListener('vault-cloud-health-trigger', handleTriggerCheck);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    function runCheck() {
      if (isMounted) {
        checkHealth();
      }
    }

    const interval = setInterval(() => {
      if (isMounted) {
        checkHealth();
      }
    }, 30000); // Check every 30s

    return () => {
      isMounted = false;
      window.removeEventListener('vault-cloud-health-status', handleSyncStatus);
      window.removeEventListener('vault-cloud-health-trigger', handleTriggerCheck);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [checkHealth]);

  if (compact) {
    return (
      <div className={cn('flex justify-center py-1', className)}>
        <button
          type="button"
          onClick={triggerGlobalCheck}
          disabled={isReconnecting}
          title={
            status === 'connected'
              ? `Cloud Connected (${dbName ? `Database: ${dbName}` : 'MongoDB Atlas'})`
              : status === 'error'
                ? 'Connection Lost - Click to retry'
                : 'Checking cloud connection...'
          }
          className={`relative flex items-center justify-center h-10 w-10 rounded-xl border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-text/10 ${
            status === 'error'
              ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20 cursor-pointer'
              : 'bg-text/5 border-text/10 text-text/70 hover:bg-text/10 cursor-pointer'
          }`}
          aria-label={
            status === 'error' ? 'Connection error. Click to reconnect.' : 'Cloud connection status'
          }
        >
          {status === 'error' ? (
            <WifiOff className="h-4 w-4 text-red-500" />
          ) : (
            <Database
              className={`h-4 w-4 transition-colors ${
                status === 'connected'
                  ? 'text-blue-500 dark:text-blue-400'
                  : 'text-text/30 animate-pulse'
              }`}
            />
          )}
          <div
            className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar-bg transition-all ${
              status === 'connected'
                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                : status === 'error'
                  ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                  : 'bg-amber-500 animate-pulse'
            }`}
          />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all duration-200',
        status === 'error'
          ? 'bg-red-500/10 border-red-500/25'
          : 'bg-text/5 border-text/10 hover:border-text/20',
        className,
      )}
    >
      <div className="relative shrink-0 flex items-center justify-center">
        {status === 'error' ? (
          <div className="p-1.5 rounded-lg bg-red-500/15 text-red-500">
            <WifiOff className="h-4 w-4" />
          </div>
        ) : (
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 dark:text-blue-400">
            <Database
              className={`h-4 w-4 ${status === 'loading' ? 'animate-pulse text-text/40' : ''}`}
            />
          </div>
        )}
        <div
          className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar-bg transition-all ${
            status === 'connected'
              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
              : status === 'error'
                ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                : 'bg-amber-500 animate-pulse'
          }`}
        />
      </div>

      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text/60">
            Cloud Status
          </span>
          {status === 'connected' && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
        </div>
        <span className="text-[11px] font-medium text-text/80 truncate">
          {status === 'connected'
            ? 'MongoDB Atlas Connected'
            : status === 'error'
              ? 'Connection Lost'
              : 'Checking connection...'}
        </span>
      </div>

      <button
        type="button"
        onClick={triggerGlobalCheck}
        disabled={isReconnecting}
        title={status === 'error' ? 'Click to reconnect' : 'Check connection status'}
        aria-label="Refresh cloud status"
        className={`ml-auto flex items-center justify-center p-1.5 rounded-lg transition-all border active:scale-95 disabled:opacity-50 shrink-0 ${
          status === 'error'
            ? 'bg-red-500/15 text-red-500 hover:bg-red-500/25 border-red-500/20'
            : 'bg-text/5 text-text/50 hover:text-text hover:bg-text/10 border-text/10'
        }`}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isReconnecting ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
};
