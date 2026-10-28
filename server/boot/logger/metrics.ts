import process from 'process';
import { monitorEventLoopDelay } from 'perf_hooks';

export type StartupPhaseTiming = {
  name: string;
  durationMs: number;
};

export type EventLoopDelayMonitor = ReturnType<typeof monitorEventLoopDelay>;

export type RuntimeSnapshot = {
  totalRequests: number;
  totalErrors: number;
  requestsPerMinute: number;
  errorsPerMinute: number;
  activeConnections: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
};

export const formatMemoryUsage = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0.0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDurationMs = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return '0 ms';
  return `${Math.round(ms)} ms`;
};

export const formatUptime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

// Managed event loop lag monitor (lazy initialized, gracefully stopped on demand)
let globalEventLoopHistogram: EventLoopDelayMonitor | null = null;

export const startEventLoopLagMonitor = (resolution = 20): EventLoopDelayMonitor => {
  if (!globalEventLoopHistogram) {
    try {
      globalEventLoopHistogram = monitorEventLoopDelay({ resolution });
      globalEventLoopHistogram.enable();
    } catch {
      // Fallback in case perf_hooks is restricted in the environment
      globalEventLoopHistogram = null;
    }
  }
  return globalEventLoopHistogram!;
};

export const stopEventLoopLagMonitor = (): void => {
  if (globalEventLoopHistogram) {
    try {
      globalEventLoopHistogram.disable();
    } catch {
      // Ignore errors during shutdown
    }
    globalEventLoopHistogram = null;
  }
};

export const getEventLoopLagMeanMs = (): number => {
  if (!globalEventLoopHistogram) {
    startEventLoopLagMonitor();
  }
  if (!globalEventLoopHistogram) return 0;
  const meanNs = globalEventLoopHistogram.mean;
  const meanMs = meanNs / 1e6;
  return Number.isFinite(meanMs) ? meanMs : 0;
};

export const formatEventLoopLag = (): string => {
  const lagMs = getEventLoopLagMeanMs();
  return Number.isFinite(lagMs) ? `${Math.round(lagMs)} ms` : 'n/a';
};

/**
 * High-performance, O(1) circular ring buffer for request latencies.
 * Eliminates Array.prototype.shift() performance bottlenecks during high request volume.
 */
class LatencyReservoir {
  private buffer: Float64Array;
  private capacity: number;
  private head = 0;
  private count = 0;

  constructor(capacity = 2000) {
    this.capacity = Math.max(10, capacity);
    this.buffer = new Float64Array(this.capacity);
  }

  add(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  getSamples(): number[] {
    const samples = new Array<number>(this.count);
    for (let i = 0; i < this.count; i++) {
      samples[i] = this.buffer[i];
    }
    return samples;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  get size(): number {
    return this.count;
  }
}

export interface ManagedRuntimeMetrics {
  onRequestStart: () => (statusCode: number) => void;
  onConnectionOpen: () => void;
  onConnectionClose: () => void;
  snapshot: () => RuntimeSnapshot;
  reset: () => void;
  stop: () => void;
}

export const createRuntimeMetrics = (reservoirCapacity = 2000): ManagedRuntimeMetrics => {
  let startedAt = Date.now();
  let totalRequests = 0;
  let totalErrors = 0;
  let activeConnections = 0;
  const reservoir = new LatencyReservoir(reservoirCapacity);

  const onRequestStart = () => {
    const startHr = process.hrtime.bigint();
    return (statusCode: number) => {
      totalRequests += 1;
      if (statusCode >= 400) {
        totalErrors += 1;
      }
      const elapsedNs = Number(process.hrtime.bigint() - startHr);
      const elapsedMs = Math.max(0, elapsedNs / 1e6);
      reservoir.add(elapsedMs);
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
    const samples = reservoir.getSamples().sort((a, b) => a - b);
    const avgLatencyMs =
      samples.length > 0 ? samples.reduce((acc, curr) => acc + curr, 0) / samples.length : 0;

    const p95Index =
      samples.length > 0 ? Math.min(samples.length - 1, Math.floor(samples.length * 0.95)) : -1;

    return {
      totalRequests,
      totalErrors,
      requestsPerMinute: totalRequests / elapsedMinutes,
      errorsPerMinute: totalErrors / elapsedMinutes,
      activeConnections,
      avgLatencyMs,
      p95LatencyMs: p95Index >= 0 ? samples[p95Index] : 0,
    };
  };

  const reset = () => {
    startedAt = Date.now();
    totalRequests = 0;
    totalErrors = 0;
    activeConnections = 0;
    reservoir.clear();
  };

  const stop = () => {
    activeConnections = 0;
    reservoir.clear();
  };

  return {
    onRequestStart,
    onConnectionOpen,
    onConnectionClose,
    snapshot,
    reset,
    stop,
  };
};
