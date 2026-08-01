import process from 'process';
import { monitorEventLoopDelay } from 'perf_hooks';

export type StartupPhaseTiming = {
  name: string;
  durationMs: number;
};

export type RuntimeSnapshot = {
  totalRequests: number;
  totalErrors: number;
  requestsPerMinute: number;
  errorsPerMinute: number;
  activeConnections: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
};

export const formatMemoryUsage = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export const formatDurationMs = (ms: number) => `${Math.round(ms)} ms`;

export const formatUptime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const eventLoopLagHistogram = monitorEventLoopDelay({ resolution: 20 });
eventLoopLagHistogram.enable();

export const formatEventLoopLag = () => {
  const meanMs = eventLoopLagHistogram.mean / 1e6;
  return Number.isFinite(meanMs) ? `${Math.round(meanMs)} ms` : 'n/a';
};

export const createRuntimeMetrics = () => {
  const startedAt = Date.now();
  let totalRequests = 0;
  let totalErrors = 0;
  let activeConnections = 0;
  const latenciesMs: number[] = [];

  const onRequestStart = () => {
    const started = process.hrtime.bigint();
    return (statusCode: number) => {
      totalRequests += 1;
      if (statusCode >= 400) totalErrors += 1;
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      latenciesMs.push(elapsedMs);
      if (latenciesMs.length > 5000) latenciesMs.shift();
    };
  };

  const onConnectionOpen = () => {
    activeConnections += 1;
  };

  const onConnectionClose = () => {
    activeConnections = Math.max(0, activeConnections - 1);
  };

  const snapshot = (): RuntimeSnapshot => {
    const elapsedMinutes = Math.max((Date.now() - startedAt) / 60000, 1 / 60);
    const sorted = [...latenciesMs].sort((a, b) => a - b);
    const avgLatencyMs =
      latenciesMs.length > 0 ? latenciesMs.reduce((sum, n) => sum + n, 0) / latenciesMs.length : 0;
    const p95Index =
      sorted.length > 0 ? Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95)) : -1;

    return {
      totalRequests,
      totalErrors,
      requestsPerMinute: totalRequests / elapsedMinutes,
      errorsPerMinute: totalErrors / elapsedMinutes,
      activeConnections,
      avgLatencyMs,
      p95LatencyMs: p95Index >= 0 ? sorted[p95Index] : 0,
    };
  };

  return {
    onRequestStart,
    onConnectionOpen,
    onConnectionClose,
    snapshot,
  };
};
