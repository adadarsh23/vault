import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { SectionCard } from './SharedComponents';
import { Button } from '../../../../components/ui/Button';
import { systemApi, LogEntry } from '../../../../api/systemApi';
import { SETTINGS_PANEL } from './Utils';
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  AlertTriangle,
  Info,
  Trash2,
  Copy,
  Check,
  Pause,
  Play,
  Layers,
  X,
  FileText,
  FileJson,
} from 'lucide-react';
import { toast } from 'sonner';

type ViewMode = 'paginated' | 'stream';
type LogLevelFilter = 'all' | 'info' | 'warn' | 'error';

const MAX_STREAM_LOGS = 1000; // Prevent memory bloat during infinite stream

const formatLogTime = (timestamp: string): string => {
  if (!timestamp) return 'N/A';
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return timestamp;
    const hours24 = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;

    const hh = String(hours12).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    return `${hh}:${mm}:${ss} ${period}`;
  } catch {
    return timestamp;
  }
};

const formatRelativeTime = (timestamp: string): string => {
  if (!timestamp) return '';
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return date.toLocaleDateString();
  } catch {
    return '';
  }
};

export const SystemLogsCard: React.FC = () => {
  // Mode & Pagination States
  const [viewMode, setViewMode] = useState<ViewMode>('paginated');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(50);

  // Data States
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Status States
  const [loading, setLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [search, setSearch] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<LogLevelFilter>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Operational States
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef<boolean>(true);
  const loadingRef = useRef<boolean>(false);

  loadingRef.current = loading;

  // Track component lifecycle to avoid state updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Production-grade fetch logs handler supporting both paginated and stream modes
  const fetchLogs = useCallback(
    async (options?: { isNextPage?: boolean; isLoadMore?: boolean; silent?: boolean }) => {
      const { isNextPage = false, isLoadMore = false, silent = false } = options || {};

      if (loadingRef.current && !silent) return;

      if (!silent && isMountedRef.current) {
        if (isLoadMore || isNextPage) {
          setIsRefreshing(true);
        } else {
          setLoading(true);
        }
      }

      if (isMountedRef.current) {
        setError(null);
      }

      try {
        let cursorParam: string | number | undefined = undefined;

        if (viewMode === 'paginated') {
          const targetPage = isNextPage ? page + 1 : page;
          const offset = (targetPage - 1) * limit;
          cursorParam = offset > 0 ? offset : undefined;
        } else if (viewMode === 'stream') {
          if (isLoadMore) {
            cursorParam = nextCursor || undefined;
          } else {
            cursorParam = undefined;
          }
        }

        const res = await systemApi.getLogs({
          cursor: cursorParam,
          limit,
        });

        if (!isMountedRef.current) return;

        if (!res?.success) {
          throw new Error(res?.message || 'Failed to retrieve system logs');
        }

        setHasMore(res.hasMore);
        setNextCursor(res.nextCursor || null);

        if (viewMode === 'paginated') {
          setLogs(res.logs || []);
          if (isNextPage) {
            setPage((prev) => prev + 1);
          }
        } else {
          if (isLoadMore) {
            setLogs((prev) => {
              const map = new Map<string, LogEntry>();
              prev.forEach((l) => map.set(l.id, l));
              (res.logs || []).forEach((l) => map.set(l.id, l));
              const sorted = Array.from(map.values()).sort(
                (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
              );
              return sorted.slice(0, MAX_STREAM_LOGS);
            });
          } else {
            setLogs(res.logs || []);
          }
        }
      } catch (err: any) {
        if (!isMountedRef.current) return;
        console.error('[SystemLogsCard] Error:', err);
        setError(err.message || 'Failed to load system logs');
        if (!silent) {
          toast.error('Failed to update system logs');
        }
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [viewMode, page, limit, nextCursor]
  );

  // Initial and reactive load when page, limit, or viewMode changes
  useEffect(() => {
    fetchLogs();
  }, [page, limit, viewMode]);

  // Production-grade Auto-Refresh background timer with stable lifecycle
  useEffect(() => {
    if (!isAutoRefresh) return;

    const intervalId = setInterval(() => {
      if (viewMode === 'paginated') {
        if (page === 1) {
          fetchLogs({ silent: true });
        }
      } else {
        fetchLogs({ silent: true });
      }
    }, 10000);

    return () => clearInterval(intervalId);
  }, [isAutoRefresh, viewMode, page, fetchLogs]);

  const handlePreviousPage = () => {
    if (page <= 1 || loading) return;
    setPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    if (!hasMore || loading) return;
    fetchLogs({ isNextPage: true });
  };

  const handleLoadMoreStream = () => {
    if (!hasMore || loading || isRefreshing) return;
    fetchLogs({ isLoadMore: true });
  };

  const handleModeSwitch = (mode: ViewMode) => {
    setViewMode(mode);
    setPage(1);
    setNextCursor(null);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
    setPage(1);
  };

  // Efficient filtered logs calculation with safe properties
  const filteredLogs = useMemo(() => {
    const s = search.trim().toLowerCase();

    return logs.filter((l) => {
      if (!l) return false;
      if (levelFilter !== 'all' && l.level !== levelFilter) {
        return false;
      }

      if (!s) return true;

      const msg = (l.message || '').toLowerCase();
      const ts = (l.timestamp || '').toLowerCase();
      const lvl = (l.level || '').toLowerCase();

      if (msg.includes(s) || ts.includes(s) || lvl.includes(s)) {
        return true;
      }

      if (l.meta) {
        try {
          const metaStr = JSON.stringify(l.meta).toLowerCase();
          if (metaStr.includes(s)) return true;
        } catch {
          // Ignore JSON circular stringify errors safely
        }
      }

      return false;
    });
  }, [logs, search, levelFilter]);

  // Severity counts
  const counts = useMemo(() => {
    const c = { all: logs.length, info: 0, warn: 0, error: 0 };
    logs.forEach((l) => {
      if (l.level === 'info') c.info++;
      else if (l.level === 'warn') c.warn++;
      else if (l.level === 'error') c.error++;
    });
    return c;
  }, [logs]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyLog = (log: LogEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const formattedText = `[${log.timestamp}] [${(log.level || 'info').toUpperCase()}] ${log.message}${
      log.meta ? `\nMeta: ${JSON.stringify(log.meta, null, 2)}` : ''
    }`;

    navigator.clipboard.writeText(formattedText).then(
      () => {
        if (!isMountedRef.current) return;
        setCopiedId(log.id);
        toast.success('Log details copied to clipboard');
        setTimeout(() => {
          if (isMountedRef.current) setCopiedId(null);
        }, 2000);
      },
      () => {
        toast.error('Failed to copy to clipboard');
      }
    );
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear your system logs from the server?')) {
      return;
    }

    setLoading(true);
    try {
      const res = await systemApi.clearLogs();
      if (!isMountedRef.current) return;

      if (res.success) {
        setLogs([]);
        setPage(1);
        setHasMore(false);
        setNextCursor(null);
        toast.success('Your system logs cleared successfully');
      } else {
        toast.error(res.message || 'Failed to clear logs');
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error('[SystemLogsCard] Clear error:', err);
      toast.error('Failed to clear system logs');
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const handleExportLogs = (format: 'json' | 'txt') => {
    if (filteredLogs.length === 0) {
      toast.error('No logs available to export');
      return;
    }

    try {
      let content = '';
      let mimeType = 'text/plain';
      let extension = 'txt';

      if (format === 'json') {
        content = JSON.stringify(filteredLogs, null, 2);
        mimeType = 'application/json';
        extension = 'json';
      } else {
        content = filteredLogs
          .map(
            (l) =>
              `[${l.timestamp}] [${(l.level || 'info').toUpperCase()}] ${l.message}${
                l.meta ? ` | Meta: ${JSON.stringify(l.meta)}` : ''
              }`
          )
          .join('\n');
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');

      a.href = url;
      a.download = `system-logs-${timestampStr}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${filteredLogs.length} logs as .${extension}`);
    } catch (err) {
      console.error('[SystemLogsCard] Export failure:', err);
      toast.error('Failed to export logs');
    }
  };

  const getIcon = (level: string) => {
    if (level === 'error') return <ShieldAlert size={14} className="text-red-400 shrink-0" />;
    if (level === 'warn') return <AlertTriangle size={14} className="text-amber-400 shrink-0" />;
    return <Info size={14} className="text-emerald-400 shrink-0" />;
  };

  const getBadgeClass = (level: string) => {
    if (level === 'error') return 'bg-red-500/10 text-red-400 border-red-500/20 dark:bg-red-500/15';
    if (level === 'warn')
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20 dark:bg-amber-500/15';
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 dark:bg-emerald-500/15';
  };

  return (
    <SectionCard title="System Logs" description="Production security telemetry & audit stream">
      <div className="space-y-4">
        {/* Header: Severity Badges & View Mode Switcher */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-card-border/60 pb-3">
          {/* <div className="flex items-center gap-2 overflow-x-auto scrollbar-none max-w-full pb-1 sm:pb-0">
            <span className="text-xs font-semibold text-text/60 shrink-0">Log Severity:</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center gap-1 rounded-full border border-card-border bg-text/5 px-2.5 py-0.5 text-[11px] font-medium text-text/80 whitespace-nowrap">
                All <span className="font-bold">{counts.all}</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400 whitespace-nowrap">
                Info <span className="font-bold">{counts.info}</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-400 whitespace-nowrap">
                Warn <span className="font-bold">{counts.warn}</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-medium text-red-400 whitespace-nowrap">
                Error <span className="font-bold">{counts.error}</span>
              </span>
            </div>
          </div> */}

          {/* View Mode Toggle */}
          <div className="flex items-center self-start sm:self-auto shrink-0">
            <div
              className="inline-flex w-full sm:w-auto rounded-lg border border-card-border bg-text/5 p-0.5"
              role="group"
              aria-label="View mode selection"
            >
              <button
                type="button"
                onClick={() => handleModeSwitch('paginated')}
                aria-pressed={viewMode === 'paginated'}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary ${
                  viewMode === 'paginated'
                    ? 'bg-card-bg text-text shadow-sm border border-card-border font-semibold'
                    : 'text-text/60 hover:text-text'
                }`}
              >
                <Layers size={12} /> Paginated
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch('stream')}
                aria-pressed={viewMode === 'stream'}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap focus-visible:ring-2 focus-visible:ring-primary ${
                  viewMode === 'stream'
                    ? 'bg-card-bg text-text shadow-sm border border-card-border font-semibold'
                    : 'text-text/60 hover:text-text'
                }`}
              >
                <FileText size={12} />
                Stream
              </button>
            </div>
          </div>
        </div>

        {/* Controls Toolbar */}
        <div
          className={`${SETTINGS_PANEL} flex flex-col md:flex-row gap-3 md:items-center p-3.5 sm:p-4`}
        >
          {/* 🔍 Search Input */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text/40" />
            <input
              type="text"
              placeholder="Search by message, level, or metadata..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search telemetry logs"
              className="w-full bg-text/[0.03] border border-card-border rounded-xl py-2 pl-9 pr-8 text-xs sm:text-sm text-text placeholder:text-text/40 focus:outline-none focus:border-primary/50 transition-all dark:bg-white/5"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text/40 hover:text-text p-1"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Action Toolbar (Icon-Only Buttons) */}
          <div className="flex items-center justify-end gap-1.5 shrink-0">
            {/* Live Auto-Refresh Toggle */}
            <button
              type="button"
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
              aria-label={isAutoRefresh ? 'Pause auto refresh' : 'Enable live auto refresh'}
              title={isAutoRefresh ? 'Auto-refresh active (10s)' : 'Auto-refresh paused'}
              className={`flex items-center justify-center h-9 w-9 rounded-xl border text-xs font-medium transition-all ${
                isAutoRefresh
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-card-border bg-text/5 text-text/50 hover:text-text'
              }`}
            >
              {isAutoRefresh ? (
                <span className="relative flex items-center justify-center">
                  <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75"></span>
                  <Pause size={14} className="relative z-10" />
                </span>
              ) : (
                <Play size={14} />
              )}
            </button>

            {/* Refresh Button */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fetchLogs()}
              disabled={loading}
              title="Refresh logs"
              aria-label="Refresh logs"
              className="rounded-xl h-9 w-9 p-0 flex items-center justify-center"
            >
              <RefreshCw size={14} className={loading || isRefreshing ? 'animate-spin' : ''} />
            </Button>

            {/* Export JSON Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportLogs('json')}
              title="Export visible logs as JSON"
              aria-label="Export logs as JSON"
              className="rounded-xl h-9 w-9 p-0 flex items-center justify-center"
            >
              <FileJson size={14} />
            </Button>

            {/* Export TXT Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportLogs('txt')}
              title="Export visible logs as Text"
              aria-label="Export logs as Text"
              className="rounded-xl h-9 w-9 p-0 flex items-center justify-center"
            >
              <FileText size={14} />
            </Button>
          </div>
        </div>

        {/* Level Filter Tabs */}
        <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2">
          <div
            className="flex gap-1.5 overflow-x-auto scrollbar-thin scrollbar-thumb-card-border max-w-full pb-1"
            role="tablist"
            aria-label="Log level filters"
          >
            {(['all', 'info', 'warn', 'error'] as LogLevelFilter[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                role="tab"
                aria-selected={levelFilter === lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-all whitespace-nowrap shrink-0 ${
                  levelFilter === lvl
                    ? 'bg-text text-bg border-text font-bold shadow-sm'
                    : 'border-card-border bg-text/5 text-text/60 hover:bg-text/10 hover:text-text'
                }`}
              >
                {lvl.toUpperCase()} ({lvl === 'all' ? counts.all : counts[lvl]})
              </button>
            ))}
          </div>

          <div className="text-[11px] text-text/50 font-mono shrink-0">
            {filteredLogs.length} matching{' '}
            {logs.length !== filteredLogs.length && `(of ${logs.length} loaded)`}
          </div>
        </div>

        {/* Log Viewer Container */}
        <div
          ref={containerRef}
          role="region"
          aria-label="System telemetry log viewer"
          className="h-[360px] sm:h-[420px] overflow-y-auto overflow-x-auto font-mono text-xs border border-card-border rounded-xl bg-card-bg/50 dark:bg-black/30 divide-y divide-card-border/40 shadow-inner"
        >
          {loading && logs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-text/50">
              <RefreshCw size={24} className="animate-spin text-primary" />
              <p className="text-xs">Fetching system security logs...</p>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-red-400">
              <ShieldAlert size={24} />
              <p className="text-sm font-semibold text-center">{error}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fetchLogs()}
                className="mt-2 text-xs"
              >
                Retry Connection
              </Button>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-text/40">
              <Info size={24} />
              <p className="text-sm">No system logs found</p>
              {search || levelFilter !== 'all' ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setLevelFilter('all');
                  }}
                  className="text-xs text-primary underline hover:text-primary/80 mt-1"
                >
                  Clear search and level filters
                </button>
              ) : null}
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = Boolean(expanded[log.id]);
              const isCopied = copiedId === log.id;

              return (
                <div
                  key={log.id}
                  className="group hover:bg-text/[0.03] transition-colors flex flex-col w-full"
                >
                  {/* Log Entry Row with Keyboard Accessibility */}
                  <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-card-border">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      aria-label={`Log entry ${log.id}, level ${log.level}: ${log.message}`}
                      onClick={() => toggleExpand(log.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleExpand(log.id);
                        }
                      }}
                      className="flex items-center gap-2.5 p-2.5 sm:p-3 min-w-max cursor-pointer select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                    >
                      {/* Chevron Indicator */}
                      <span className="text-text/40 group-hover:text-text/70 transition-colors shrink-0">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>

                      {/* Timestamp */}
                      <div className="flex flex-col shrink-0 w-[7.5rem]">
                        <span className="text-[11px] font-semibold text-text/80 tabular-nums whitespace-nowrap">
                          {formatLogTime(log.timestamp)}
                        </span>
                        <span className="text-[9px] text-text/40 leading-none whitespace-nowrap">
                          {formatRelativeTime(log.timestamp)}
                        </span>
                      </div>

                      {/* Level Badge */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {getIcon(log.level)}
                        <span
                          className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider border whitespace-nowrap ${getBadgeClass(
                            log.level
                          )}`}
                        >
                          {log.level}
                        </span>
                      </div>

                      {/* Message Body */}
                      <span className="text-text/90 font-mono text-xs whitespace-nowrap pr-4">
                        {log.message}
                      </span>

                      {/* Copy Button */}
                      <button
                        type="button"
                        onClick={(e) => handleCopyLog(log, e)}
                        title="Copy log entry"
                        aria-label="Copy log line"
                        className="p-1.5 text-text/40 hover:text-text transition-all rounded hover:bg-text/10 shrink-0 ml-auto touch-manipulation focus-visible:ring-1 focus-visible:ring-primary"
                      >
                        {isCopied ? (
                          <Check size={12} className="text-emerald-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Metadata Section */}
                  {isExpanded && (
                    <div className="mx-2 sm:mx-3 mb-2.5 p-2.5 sm:p-3 rounded-lg bg-text/[0.04] border border-card-border/60 text-[11px] space-y-2">
                      <div className="flex flex-col xs:flex-row xs:items-center justify-between text-text/50 text-[10px] border-b border-card-border/40 pb-1.5 gap-1">
                        <span className="truncate">Log ID: {log.id}</span>
                        <span>UTC: {new Date(log.timestamp).toUTCString()}</span>
                      </div>
                      {log.meta ? (
                        <pre className="overflow-x-auto text-text/80 text-[11px] leading-snug font-mono whitespace-pre max-h-60 p-2 bg-text/[0.02] rounded border border-card-border/30">
                          {JSON.stringify(log.meta, null, 2)}
                        </pre>
                      ) : (
                        <p className="text-text/40 italic">No additional metadata attached.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer: Pagination & Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs pt-2">
          {/* Per Page Selector */}
          <div className="flex items-center gap-2 text-text/60 w-full sm:w-auto justify-between sm:justify-start">
            <span>Per page:</span>
            <div className="flex gap-1" role="group" aria-label="Page size selector">
              {[25, 50, 100].map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => handleLimitChange(l)}
                  aria-pressed={limit === l}
                  className={`px-2.5 py-1 text-[11px] rounded-md border transition-all ${
                    limit === l
                      ? 'border-primary bg-primary/10 text-primary font-bold'
                      : 'border-card-border bg-text/5 text-text/60 hover:text-text'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Mode Controls */}
          {viewMode === 'paginated' ? (
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={page <= 1 || loading}
                className="h-8 px-3 rounded-lg text-xs flex items-center gap-1"
              >
                <ChevronLeft size={14} /> Previous
              </Button>

              <span className="text-xs font-semibold text-text/80 font-mono">
                Page {page} {hasMore && '• More available'}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={!hasMore || loading || isRefreshing}
                className="h-8 px-3 rounded-lg text-xs flex items-center gap-1"
              >
                Next <ChevronRight size={14} />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleLoadMoreStream}
                disabled={!hasMore || loading || isRefreshing}
                className="h-8 px-4 w-full sm:w-auto rounded-lg text-xs flex items-center justify-center gap-1.5"
              >
                {isRefreshing ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : (
                  <ChevronDown size={14} />
                )}
                {hasMore ? `Load Older Logs (Next ${limit})` : 'All Logs Loaded'}
              </Button>
            </div>
          )}

          {/* Clear Logs Button */}
          <button
            type="button"
            onClick={handleClearLogs}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors font-medium self-end sm:self-auto"
          >
            <Trash2 size={13} /> Clear Logs
          </button>
        </div>
      </div>
    </SectionCard>
  );
};
