import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SectionCard } from './SharedComponents';
import { Button } from '../../../../components/ui/Button';
import { systemApi, LogEntry } from '../../../../api/systemApi';
import { SETTINGS_PANEL } from './Utils';
import {
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  AlertTriangle,
  Info,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

const MAX_RENDER = 100; // UI limit
const formatLogTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const hours24 = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  const hh = String(hours12).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return `${hh}:${mm}:${ss} ${period}`;
};

export const SystemLogsCard: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef(true);

  // 🔥 Fetch logs with cursor
  const fetchLogs = React.useCallback(
    async (loadMore = false) => {
      if (loading) return;

      setLoading(true);
      setError(null);

      try {
        const res = await systemApi.getLogs({
          cursor: loadMore ? cursor : null,
          limit: 50,
        });

        if (!res?.success) throw new Error();

        setHasMore(res.hasMore);
        setCursor(res.nextCursor || null);

        setLogs((prev) => {
          const incoming = res.logs || [];

          // 🔐 Deduplicate using id with fallback
          const map = new Map<string, LogEntry>();

          // Always keep what we have
          prev.forEach((l) => {
            const id = l.id || `${l.timestamp}-${l.message}`;
            map.set(id, { ...l, id });
          });

          // Add/Update with incoming
          incoming.forEach((l: any) => {
            const id = l.id || `${l.timestamp}-${l.message}`;
            map.set(id, { ...l, id });
          });

          // Sort by timestamp and keep latest
          return Array.from(map.values())
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .slice(-500);
        });
      } catch (e) {
        console.error(e);
        setError('Failed to load logs');
      } finally {
        setLoading(false);
      }
    },
    [loading, cursor]
  );

  useEffect(() => {
    fetchLogs();
  }, []); // Initial load

  useEffect(() => {
    const id = setInterval(() => {
      // Polling always fetches latest without cursor
      fetchLogs(false);
    }, 20000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  // ⚡ Efficient filtering
  const filteredLogs = useMemo(() => {
    const s = search.toLowerCase();

    return logs
      .filter((l) => {
        if (levelFilter !== 'all' && l.level !== levelFilter) return false;

        if (!s) return true;

        if (l.message.toLowerCase().includes(s)) return true;

        if (l.meta) {
          for (const key in l.meta) {
            if (String(l.meta[key]).toLowerCase().includes(s)) {
              return true;
            }
          }
        }

        return false;
      })
      .slice(-MAX_RENDER); // 🔥 render limit
  }, [logs, search, levelFilter]);

  // 📜 Auto-scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (autoScroll.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filteredLogs]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;

    autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  };

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleClearLogs = async () => {
    if (window.confirm('Are you sure you want to clear all system logs?')) {
      setLoading(true);
      try {
        const res = await systemApi.clearLogs();
        if (res.success) {
          setLogs([]);
          setCursor(null);
          setHasMore(false);
          toast.success('System logs cleared successfully');
        } else {
          toast.error(res.message || 'Failed to clear logs');
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to clear logs');
      } finally {
        setLoading(false);
      }
    }
  };

  const icon = (lvl: string) => {
    if (lvl === 'error') return <ShieldAlert size={14} className="text-red-400" />;
    if (lvl === 'warn') return <AlertTriangle size={14} className="text-yellow-400" />;
    return <Info size={14} className="text-green-400" />;
  };

  const color = (lvl: string) => {
    if (lvl === 'error') return 'text-red-400';
    if (lvl === 'warn') return 'text-yellow-400';
    return 'text-green-400';
  };

  return (
    <SectionCard title="System Logs" description="Production log stream">
      <div className="space-y-4">
        {/* Controls */}
        <div className={`${SETTINGS_PANEL} flex flex-col sm:flex-row gap-3 sm:items-center`}>
          {/* 🔍 Search */}
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text/30" />

            <input
              type="text"
              placeholder="Search telemetry..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-text/[0.03] border border-card-border rounded-xl py-2 pl-9 pr-3 text-sm text-text focus:outline-none focus:border-blue-500/50 transition-all dark:bg-white/5"
            />
          </div>

          {/* 📊 Right Controls */}
          <div className="flex items-center justify-between sm:justify-end gap-3">
            {/* Matching count */}
            <span className="text-[11px] text-text/40 whitespace-nowrap">
              {filteredLogs.length} matching
            </span>

            {/* Refresh */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fetchLogs()}
              className={`rounded-xl h-9 px-3 sm:h-10 sm:w-10 sm:p-0 flex items-center justify-center ${
                loading ? 'opacity-50' : ''
              }`}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          {['all', 'info', 'warn', 'error'].map((l) => (
            <button
              key={l}
              onClick={() => setLevelFilter(l as any)}
              className={`px-3 py-1 text-xs rounded-full border ${
                levelFilter === l ? 'bg-white text-black' : 'opacity-60'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Logs */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-[300px] overflow-y-auto text-xs font-mono border rounded-lg"
        >
          {error ? (
            <div className="p-4 text-red-400">{error}</div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-6 text-center opacity-40">No logs</div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="border-b">
                <div
                  onClick={() => toggle(log.id)}
                  className="flex gap-2 p-2 cursor-pointer hover:bg-white/5"
                >
                  {expanded[log.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}

                  <span className="w-[7.5rem] shrink-0 whitespace-nowrap opacity-50 tabular-nums">
                    {formatLogTime(log.timestamp)}
                  </span>

                  {icon(log.level)}

                  <span className={`flex-1 ${color(log.level)}`}>{log.message}</span>
                </div>

                {expanded[log.id] && log.meta && (
                  <pre className="p-2 text-[10px] opacity-60 overflow-x-auto">
                    {JSON.stringify(log.meta, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between text-[10px] opacity-50">
          <span>{filteredLogs.length} visible</span>

          <div className="flex gap-2">
            {hasMore && <button onClick={() => fetchLogs(true)}>Load more</button>}

            <button
              onClick={handleClearLogs}
              className="flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 size={12} /> Clear
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
};
