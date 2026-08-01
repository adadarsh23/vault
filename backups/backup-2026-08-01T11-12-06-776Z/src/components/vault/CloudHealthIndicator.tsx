import React, { useCallback, useEffect, useState } from 'react';
import { Database, RefreshCw, WifiOff, CheckCircle2 } from 'lucide-react';
import { resolveApiBaseUrl } from '../../lib/apiBaseUrl';

interface CloudHealthIndicatorProps {
  compact?: boolean;
}

export const CloudHealthIndicator: React.FC<CloudHealthIndicatorProps> = ({ compact = false }) => {
  const [status, setStatus] = useState<'connected' | 'error' | 'loading'>('loading');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [dbName, setDbName] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    setIsReconnecting(true);
    try {
      const baseUrl = resolveApiBaseUrl();
      const resp = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (resp.ok) {
        const data = await resp.json().catch(() => null);
        if (data && (data.status === 'connected' || data.success === true)) {
          setStatus('connected');
          if (data.database?.name) {
            setDbName(data.database.name);
          }
        } else {
          setStatus('error');
        }
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      setIsReconnecting(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const runCheck = async () => {
      if (isMounted) {
        await checkHealth();
      }
    };
    runCheck();
    const interval = setInterval(() => {
      if (isMounted) {
        checkHealth();
      }
    }, 30000); // Check every 30s
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [checkHealth]);

  if (compact) {
    return (
      <div className="flex justify-center py-1">
        <button
          type="button"
          onClick={checkHealth}
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
            status === 'error'
              ? 'Connection error. Click to reconnect.'
              : 'Cloud connection status'
          }
        >
          {status === 'error' ? (
            <WifiOff className="h-4 w-4 text-red-500" />
          ) : (
            <Database
              className={`h-4 w-4 transition-colors ${
                status === 'connected' ? 'text-blue-500 dark:text-blue-400' : 'text-text/30 animate-pulse'
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
      className={`group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all duration-200 ${
        status === 'error'
          ? 'bg-red-500/10 border-red-500/25'
          : 'bg-text/5 border-text/10 hover:border-text/20'
      }`}
    >
      <div className="relative shrink-0 flex items-center justify-center">
        {status === 'error' ? (
          <div className="p-1.5 rounded-lg bg-red-500/15 text-red-500">
            <WifiOff className="h-4 w-4" />
          </div>
        ) : (
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 dark:text-blue-400">
            <Database
              className={`h-4 w-4 ${
                status === 'loading' ? 'animate-pulse text-text/40' : ''
              }`}
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
          {status === 'connected' && (
            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
          )}
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
        onClick={checkHealth}
        disabled={isReconnecting}
        title={status === 'error' ? 'Click to reconnect' : 'Check connection status'}
        aria-label="Refresh cloud status"
        className={`ml-auto flex items-center justify-center p-1.5 rounded-lg transition-all border active:scale-95 disabled:opacity-50 shrink-0 ${
          status === 'error'
            ? 'bg-red-500/15 text-red-500 hover:bg-red-500/25 border-red-500/20'
            : 'bg-text/5 text-text/50 hover:text-text hover:bg-text/10 border-text/10'
        }`}
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${isReconnecting ? 'animate-spin' : ''}`}
        />
      </button>
    </div>
  );
};


