import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity, Zap, BarChart3, Gauge, ChartArea } from 'lucide-react';
import { getPlaybackInsights } from '../../../../lib/sync';
import { cn } from '../../../../lib/utils';

type BufferStat = {
  _id: string;
  avgBufferTimeMs: number;
};

type ResolutionStat = {
  _id: string;
  count: number;
};

type ErrorStat = {
  count?: number;
  errors?: number;
};

type PlaybackInsightsData = {
  bufferStats: BufferStat[];
  resolutionStats: ResolutionStat[];
  errorStats: ErrorStat[];
};

const EMPTY_INSIGHTS: PlaybackInsightsData = {
  bufferStats: [],
  resolutionStats: [],
  errorStats: [],
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const toStringValue = (value: unknown): string => (typeof value === 'string' ? value : '');

const normalizeInsights = (raw: unknown): PlaybackInsightsData => {
  const candidate = raw as {
    bufferStats?: unknown[];
    resolutionStats?: unknown[];
    errorStats?: unknown[];
  };

  const bufferStats = Array.isArray(candidate?.bufferStats)
    ? candidate.bufferStats.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          _id: toStringValue(row?._id),
          avgBufferTimeMs: toNumber(row?.avgBufferTimeMs),
        };
      })
    : [];

  const resolutionStats = Array.isArray(candidate?.resolutionStats)
    ? candidate.resolutionStats.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          _id: toStringValue(row?._id),
          count: Math.max(0, Math.floor(toNumber(row?.count))),
        };
      })
    : [];

  const errorStats = Array.isArray(candidate?.errorStats)
    ? candidate.errorStats.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          count: toNumber(row?.count),
          errors: toNumber(row?.errors),
        };
      })
    : [];

  return { bufferStats, resolutionStats, errorStats };
};

export const PlaybackInsights: React.FC = () => {
  const [insights, setInsights] = useState<PlaybackInsightsData>(EMPTY_INSIGHTS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadInsights = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const payload = await getPlaybackInsights();
        if (!isActive) return;
        setInsights(normalizeInsights(payload));
      } catch {
        if (!isActive) return;
        setLoadError('Failed to load playback insights.');
        setInsights(EMPTY_INSIGHTS);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadInsights();

    return () => {
      isActive = false;
    };
  }, []);

  const avgLatency = useMemo(() => {
    if (insights.bufferStats.length === 0) return 0;
    const total = insights.bufferStats.reduce((acc, s) => acc + s.avgBufferTimeMs, 0);
    return total / insights.bufferStats.length;
  }, [insights.bufferStats]);

  const totalErrors = useMemo(() => {
    return insights.errorStats.reduce(
      (acc, curr) => acc + (curr.count ?? 0) + (curr.errors ?? 0),
      0,
    );
  }, [insights.errorStats]);

  const formatResLabel = (label: string) => {
    if (!label) return 'Unknown';
    if (label.includes('x')) {
      const parts = label.split('x');
      const h = parts[1];
      return `${h}p`;
    }
    return label;
  };

  const hasAnyData =
    insights.bufferStats.length > 0 ||
    insights.resolutionStats.length > 0 ||
    insights.errorStats.length > 0;

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-56 overflow-hidden rounded-3xl border border-card-border bg-card-bg dark:border-white/10 dark:bg-black sm:rounded-[2rem]"
          />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="overflow-hidden rounded-3xl border border-card-border bg-card-bg dark:border-white/10 dark:bg-black/40 sm:rounded-[2rem]">
        <div className="flex items-center gap-3 border-b border-card-border/30 bg-text/5 px-4 py-4 sm:px-6">
          <div className="rounded-xl bg-rose-500/10 p-2 text-rose-400">
            <Activity className="h-5 w-5" />
          </div>
          <h3 className="text-base font-black tracking-tight text-text sm:text-lg">
            Playback Insights
          </h3>
        </div>
        <div className="p-4 sm:p-6">
          <p className="text-sm text-text/60">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!hasAnyData) {
    return (
      <div className="overflow-hidden rounded-3xl border border-card-border bg-card-bg dark:border-white/10 dark:bg-black/40 sm:rounded-[2rem]">
        <div className="flex items-center gap-3 border-b border-card-border/30 bg-text/5 px-4 py-4 sm:px-6">
          <div className="rounded-xl bg-blue-500/10 p-2 text-blue-400">
            <ChartArea className="h-5 w-5" />
          </div>
          <h3 className="text-base font-black tracking-tight text-text sm:text-lg">
            Playback Insights
          </h3>
        </div>
        <div className="p-4 sm:p-6">
          <p className="text-sm text-text/60">No playback telemetry is available yet.</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      {/* Playback Stability */}
      <div className="overflow-hidden rounded-3xl border border-card-border bg-card-bg dark:border-white/10 dark:bg-black/40 sm:rounded-[2rem] transition-all hover:border-text/20 hover:bg-text/[0.02]">
        <div className="flex items-center gap-3 border-b border-card-border/30 bg-text/5 px-4 py-4 sm:px-6">
          <div className="rounded-xl bg-cyan-500/10 p-2 text-cyan-400">
            <Gauge className="h-5 w-5" />
          </div>
          <h3 className="text-base font-black tracking-tight text-text sm:text-lg">
            Playback Stability
          </h3>
        </div>
        <div className="space-y-5 p-4 sm:p-6">
          {insights.bufferStats.slice(0, 3).map((stat, idx) => {
            const stabilityValue = Math.max(5, 100 - stat.avgBufferTimeMs / 20);
            return (
              <div key={`${stat._id}-${idx}`} className="flex flex-col gap-2">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                  <span className="text-text/40 truncate max-w-[120px]">
                    {formatResLabel(stat._id)}
                  </span>
                  <span className="text-cyan-400 font-mono">
                    {Math.round(stat.avgBufferTimeMs)}ms
                  </span>
                </div>
                <div className="h-1.5 w-full bg-text/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${stabilityValue}%` }}
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      stabilityValue > 80
                        ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                        : stabilityValue > 50
                          ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                          : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]',
                    )}
                  />
                </div>
              </div>
            );
          })}
          {insights.bufferStats.length === 0 && (
            <p className="text-xs text-text/30 italic">No stability data available</p>
          )}
        </div>
      </div>

      {/* Quality Spectra */}
      <div className="overflow-hidden rounded-3xl border border-card-border bg-card-bg dark:border-white/10 dark:bg-black/40 sm:rounded-[2rem] transition-all hover:border-text/20 hover:bg-text/[0.02]">
        <div className="flex items-center gap-3 border-b border-card-border/30 bg-text/5 px-4 py-4 sm:px-6">
          <div className="rounded-xl bg-purple-500/10 p-2 text-purple-400">
            <BarChart3 className="h-5 w-5" />
          </div>
          <h3 className="text-base font-black tracking-tight text-text sm:text-lg">
            Quality Spectra
          </h3>
        </div>
        <div className="flex flex-wrap gap-2 p-4 sm:p-6">
          {insights.resolutionStats.map((res, idx) => (
            <div
              key={`${res._id}-${idx}`}
              className="px-4 py-2.5 rounded-2xl bg-text/5 border border-text/10 flex flex-col items-center min-w-[70px] hover:bg-text/10 transition-colors"
            >
              <span className="text-[10px] font-black text-purple-400/80 uppercase tracking-tighter mb-1">
                {formatResLabel(res._id)}
              </span>
              <span className="text-2xl font-black text-text/90 tracking-tighter">{res.count}</span>
            </div>
          ))}
          {insights.resolutionStats.length === 0 && (
            <p className="text-xs text-text/30 italic">Awaiting ABR stream...</p>
          )}
        </div>
      </div>

      {/* Network Health */}
      <div className="overflow-hidden rounded-3xl border border-card-border bg-card-bg dark:border-white/10 dark:bg-black/40 sm:rounded-[2rem] transition-all hover:border-text/20 hover:bg-text/[0.02]">
        <div className="flex items-center gap-3 border-b border-card-border/30 bg-text/5 px-4 py-4 sm:px-6">
          <div className="rounded-xl bg-rose-500/10 p-2 text-rose-400">
            <Activity className="h-5 w-5" />
          </div>
          <h3 className="text-base font-black tracking-tight text-text sm:text-lg">
            Network Health
          </h3>
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text/40">
              Error Incidents
            </span>
            <span
              className={cn(
                'font-black text-xs tabular-nums px-2 py-0.5 rounded-lg border',
                totalErrors > 0
                  ? 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                  : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
              )}
            >
              {totalErrors} detected
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text/40">
              Avg Latency
            </span>
            <span
              className={cn(
                'font-black text-xs tabular-nums',
                avgLatency === 0
                  ? 'text-text/20'
                  : avgLatency < 200
                    ? 'text-emerald-400'
                    : avgLatency < 600
                      ? 'text-amber-400'
                      : 'text-rose-400',
              )}
            >
              {avgLatency > 0 ? `${Math.round(avgLatency)}ms` : 'OPTIMAL'}
            </span>
          </div>
          <div className="pt-3 border-t border-text/5">
            <div className="group flex items-center gap-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] font-black uppercase tracking-widest text-amber-400">
              <Zap className="w-3.5 h-3.5" />
              Adaptive Bitrate Active
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
