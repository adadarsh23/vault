import os from 'os';
import process from 'process';
import v8 from 'v8';
import type { Server as HttpServer } from 'http';
import mongoose from 'mongoose';
import { getUploadRoot } from '../utils/fileStorage.ts';
import { getAllowedCorsOrigins } from '../utils/cors.ts';
import { ansi, colorize, isProduction, checkAnimatedTerminal } from './logger/colors.ts';
import {
  badge,
  hr,
  kv,
  log,
  meter,
  padRight,
  row,
  section,
  sectionEnd,
  titleBox,
  truncate,
} from './logger/console.ts';
import {
  createRuntimeMetrics,
  formatDurationMs,
  formatEventLoopLag,
  formatMemoryUsage,
  formatUptime,
  startEventLoopLagMonitor,
  stopEventLoopLagMonitor,
  type RuntimeSnapshot,
  type StartupPhaseTiming,
} from './logger/metrics.ts';
import { calculateHealthPercent, getHealthScore, getWarnings } from './logger/health.ts';
import { getEnvChecks, normalizePublicUrl, toHealthUrl } from './logger/runtime.ts';

export {
  createRuntimeMetrics,
  startEventLoopLagMonitor,
  stopEventLoopLagMonitor,
  type StartupPhaseTiming,
};

export type BootLifecycleState =
  'UNINITIALIZED' | 'INITIALIZING' | 'READY' | 'SHUTTING_DOWN' | 'TERMINATED' | 'FAILED';

export type DbState = '0' | '1' | '2' | '3' | '99';
export const DB_STATE_MAP: Record<string, string> = {
  '0': 'disconnected',
  '1': 'connected',
  '2': 'connecting',
  '3': 'disconnecting',
  '99': 'uninitialized',
};

/**
 * Safely resolves the MongoDB connection state without eager module side-effects.
 */
export const getDbStatusSafe = (): string => {
  try {
    return mongoose.connection?.readyState !== undefined
      ? String(mongoose.connection.readyState)
      : '0';
  } catch {
    return '0';
  }
};

export const getDbStatus = (): string => getDbStatusSafe();

export const getDbStatusLabel = (state?: string | number): string => {
  const resolvedState = state !== undefined ? String(state) : getDbStatusSafe();
  return DB_STATE_MAP[resolvedState] ?? `state-${resolvedState}`;
};

// Global Boot Lifecycle State
let currentBootState: BootLifecycleState = 'UNINITIALIZED';
let bootLock = false;

export const getBootState = (): BootLifecycleState => currentBootState;
export const isBootComplete = (): boolean => currentBootState === 'READY';
export const isShuttingDown = (): boolean =>
  currentBootState === 'SHUTTING_DOWN' || currentBootState === 'TERMINATED';

export const setBootState = (state: BootLifecycleState): void => {
  currentBootState = state;
  if (state === 'READY' || state === 'FAILED' || state === 'TERMINATED') {
    bootLock = false;
  }
};

export const resetBootState = (): void => {
  currentBootState = 'UNINITIALIZED';
  bootLock = false;
};

/**
 * Acquires the startup lock to prevent duplicate initialization attempts.
 * Returns true if the lock was acquired, false if startup is already active or complete.
 */
export const acquireBootLock = (): boolean => {
  if (bootLock || currentBootState === 'INITIALIZING' || currentBootState === 'READY') {
    return false;
  }
  bootLock = true;
  currentBootState = 'INITIALIZING';
  return true;
};

/**
 * Sanitizes errors to ensure database credentials, tokens, or private keys
 * are never leaked to logs or console outputs.
 */
export const sanitizeStartupError = (
  error: unknown,
): { message: string; sanitizedMessage: string } => {
  const rawMessage = error instanceof Error ? error.message : String(error || 'Unknown error');
  // Strip MongoDB credentials: mongodb(+srv)://user:password@host
  let sanitized = rawMessage.replace(
    /(mongodb(?:\+srv)?:\/\/)([^:@\s]+):([^@\s]+)@/gi,
    '$1$2:***@',
  );
  // Strip JWTs
  sanitized = sanitized.replace(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    '[REDACTED_JWT]',
  );
  // Strip 32/64 char hex keys
  sanitized = sanitized.replace(/\b[0-9a-fA-F]{32,64}\b/g, '[REDACTED_KEY]');

  return {
    message: rawMessage,
    sanitizedMessage: sanitized,
  };
};

export const renderStartupBanner = (): void => {
  const prod = isProduction();
  if (prod && process.env.SUPPRESS_STARTUP_BANNER === 'true') {
    return;
  }

  const mode = prod ? 'PRODUCTION' : 'DEVELOPMENT';
  log.info(
    [
      '',
      colorize('  VAULT', `${ansi.bold}${ansi.cyan}`),
      colorize('  Secure Startup Console', `${ansi.dim}${ansi.gray}`),
      colorize('  Operational Visibility Profile', `${ansi.dim}${ansi.gray}`),
      '',
      `  ${colorize('Mode', ansi.magenta)}     ${mode}`,
      `  ${colorize('Process', ansi.magenta)}  PID ${process.pid}`,
      `  ${colorize('Node', ansi.magenta)}     ${process.version}`,
      `  ${colorize('Host', ansi.magenta)}     ${os.hostname()}`,
      `  ${colorize('Time', ansi.magenta)}     ${new Date().toISOString()}`,
      '',
    ].join('\n'),
  );
};

const bootFrames = ['|', '/', '-', '\\'] as const;

export const createBootAnimator = () => {
  let frameIndex = 0;
  let interval: NodeJS.Timeout | null = null;
  let label = '';
  let detail = '';

  const safeWrite = (text: string) => {
    try {
      process.stdout.write(text);
    } catch {
      console.log(text);
    }
  };

  const render = () => {
    if (!checkAnimatedTerminal()) return;
    const frame = bootFrames[frameIndex++ % bootFrames.length];
    safeWrite(
      `\r  ${colorize(frame, ansi.cyan)} ${colorize(padRight(label, 28), ansi.bold)} ${colorize(detail, `${ansi.dim}${ansi.gray}`)}`,
    );
  };

  const stop = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  return {
    start(initialLabel: string, initialDetail: string) {
      label = initialLabel;
      detail = initialDetail;
      if (!checkAnimatedTerminal()) {
        return log.info(`  > ${label} (${detail})`);
      }
      render();
      interval = setInterval(render, 90);
    },
    update(nextLabel: string, nextDetail: string) {
      label = nextLabel;
      detail = nextDetail;
      if (!checkAnimatedTerminal()) {
        log.info(`  > ${label} (${detail})`);
      }
    },
    succeed(finalLabel: string, finalDetail: string) {
      stop();
      const message = `  ${colorize('OK', ansi.green)} ${padRight(finalLabel, 28)} ${finalDetail}`;
      checkAnimatedTerminal() ? safeWrite(`\r${message}\n`) : log.info(message);
    },
    fail(finalLabel: string, finalDetail: string) {
      stop();
      const sanitized = sanitizeStartupError(finalDetail).sanitizedMessage;
      const message = `  ${colorize('ERR', ansi.yellow)} ${padRight(finalLabel, 28)} ${sanitized}`;
      checkAnimatedTerminal() ? safeWrite(`\r${message}\n`) : log.error(message);
    },
    stop,
  };
};

export const renderStartupSummary = (input: {
  port: number;
  trustProxy: boolean | number | string;
  networkUrls: string[];
  bootDurationMs: number;
  keepAliveTarget?: string;
  phaseTimings?: StartupPhaseTiming[];
  runtimeMetrics?: RuntimeSnapshot;
}): void => {
  const prod = isProduction();
  if (prod && process.env.SUPPRESS_STARTUP_SUMMARY === 'true') {
    return;
  }

  const memory = process.memoryUsage();
  const dbStatus = getDbStatusLabel(getDbStatusSafe());
  const cpuCount = os.cpus()?.length ?? 0;
  const loadAvg = os.loadavg();
  const totalMem = formatMemoryUsage(os.totalmem());
  const freeMem = formatMemoryUsage(os.freemem());
  const uptime = formatUptime(process.uptime());
  const uploadRoot = getUploadRoot();
  const allowedOrigins = getAllowedCorsOrigins();
  const publicUrl = normalizePublicUrl(process.env.PUBLIC_URL);
  const keepAliveHealthTarget = toHealthUrl(input.keepAliveTarget);
  const envChecks = getEnvChecks();
  const envPresentCount = envChecks.filter((line) => line.includes('[OK]')).length;
  const heapCommittedPercent =
    memory.heapTotal > 0 ? (memory.heapUsed / memory.heapTotal) * 100 : 0;
  const heapLimit = v8.getHeapStatistics().heap_size_limit;
  const heapLimitPercent = heapLimit > 0 ? (memory.heapUsed / heapLimit) * 100 : 0;

  const warnings = getWarnings({
    jwtConfigured: Boolean(process.env.JWT_SECRET),
    publicUrlConfigured: Boolean(publicUrl),
    heapPercent: heapLimitPercent,
    p95LatencyMs: input.runtimeMetrics?.p95LatencyMs,
    mongoConnected: dbStatus === 'connected',
    refreshTokenConfigured: Boolean(process.env.REFRESH_TOKEN_SECRET),
    encryptionKeyConfigured: Boolean(process.env.VAULT_ENCRYPTION_KEY),
  });

  const healthScore = getHealthScore([
    dbStatus === 'connected',
    Boolean(process.env.JWT_SECRET),
    Boolean(publicUrl) || !prod,
    heapLimitPercent < 85,
    uploadRoot === 'cloud-only' || uploadRoot.length > 0,
  ]);
  const healthPercent = calculateHealthPercent([
    dbStatus === 'connected',
    Boolean(process.env.JWT_SECRET),
    Boolean(publicUrl) || !prod,
    heapLimitPercent < 85,
    uploadRoot === 'cloud-only' || uploadRoot.length > 0,
  ]);
  const latencyP95 = input.runtimeMetrics?.p95LatencyMs ?? 0;
  const latencyPressurePercent = Math.min((latencyP95 / 1000) * 100, 100);

  const lines = [
    '',
    ...titleBox(
      colorize('VAULT SERVER IS LIVE', `${ansi.bold}${ansi.green}`),
      colorize('FULL RUNTIME SNAPSHOT', `${ansi.dim}${ansi.gray}`),
    ),
    badge('UP', `Mongo ${dbStatus}`),
    badge('INFO', `Mode ${prod ? 'PRODUCTION' : 'DEVELOPMENT'}`),
    ...(warnings.length > 0
      ? [badge('WARN', `${warnings.length} runtime warning(s) detected`)]
      : [badge('UP', 'No critical runtime warnings detected')]),
    hr(),
    '',
    section('Runtime'),
    kv(
      'Mode',
      `${prod ? 'PRODUCTION' : 'DEVELOPMENT'} (${prod ? 'hardened' : 'developer-friendly'})`,
    ),
    kv('Node', process.version),
    kv('PID', String(process.pid)),
    kv('Uptime', uptime),
    kv('UTC Time', new Date().toISOString()),
    kv('Local Time', new Date().toString()),
    kv('TZ', Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'),
    kv('CWD', process.cwd()),
    kv('Exec Path', process.execPath),
    sectionEnd(),
    '',
    section('System'),
    kv('Host', os.hostname()),
    kv('Platform', `${os.platform()} ${os.release()} (${os.arch()})`),
    kv('CPU', `${cpuCount} cores`),
    kv('Load Avg', loadAvg.map((n) => n.toFixed(2)).join(' / ')),
    kv(
      'Memory',
      `RSS ${formatMemoryUsage(memory.rss)}  Heap ${formatMemoryUsage(memory.heapUsed)}`,
    ),
    kv(
      'Heap',
      `${formatMemoryUsage(memory.heapUsed)} / ${formatMemoryUsage(memory.heapTotal)} committed (${heapCommittedPercent.toFixed(1)}%)`,
    ),
    kv(
      'Heap Limit',
      `${formatMemoryUsage(memory.heapUsed)} / ${formatMemoryUsage(heapLimit)} (${heapLimitPercent.toFixed(1)}%)`,
    ),
    kv('System RAM', `${freeMem} free / ${totalMem} total`),
    kv('Event Loop', formatEventLoopLag()),
    meter('Heap Pressure', heapLimitPercent),
    sectionEnd(),
    '',
    section('Network'),
    kv('Local', `http://localhost:${input.port}`),
    ...input.networkUrls.map((url, i) => kv(i === 0 ? 'Network' : 'Network+', url)),
    kv('Public', publicUrl ?? 'not configured'),
    kv('Proxy', String(input.trustProxy)),
    kv('Health', `http://localhost:${input.port}/health`),
    kv('Ready', `http://localhost:${input.port}/ready`),
    ...(input.runtimeMetrics
      ? [
          kv('Requests', `${input.runtimeMetrics.totalRequests} total`),
          kv('RPM', `${input.runtimeMetrics.requestsPerMinute.toFixed(1)}/min`),
          kv('Errors', `${input.runtimeMetrics.totalErrors} total`),
          kv('EPM', `${input.runtimeMetrics.errorsPerMinute.toFixed(2)}/min`),
          kv(
            'Latency',
            `avg ${Math.round(input.runtimeMetrics.avgLatencyMs)} ms  p95 ${Math.round(input.runtimeMetrics.p95LatencyMs)} ms`,
          ),
          kv('Connections', `${input.runtimeMetrics.activeConnections} active`),
        ]
      : []),
    sectionEnd(),
    '',
    section('Security And Data'),
    kv('Mongo', dbStatus),
    kv('Uploads', uploadRoot),
    kv('Origins', `${allowedOrigins.length} allowed`),
    kv(
      'Origin List',
      truncate(allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'none', 220),
    ),
    kv('JWT Secret', process.env.JWT_SECRET ? 'configured' : 'missing'),
    kv(
      'Refresh Secret',
      process.env.REFRESH_TOKEN_SECRET ? 'configured' : 'fallback-to-jwt-or-missing',
    ),
    sectionEnd(),
    '',
    section('Service Health'),
    kv('Boot', formatDurationMs(input.bootDurationMs)),
    kv('Keepalive', keepAliveHealthTarget ?? 'disabled'),
    kv('Health Score', healthScore),
    meter('Health Index', healthPercent),
    ...(input.runtimeMetrics ? [meter('P95 Pressure', latencyPressurePercent)] : []),
    kv('Status', `${colorize('[UP]', ansi.green)} runtime initialized and endpoints published`),
    ...(input.phaseTimings && input.phaseTimings.length > 0
      ? [
          '',
          section('Startup Phase Timings'),
          ...input.phaseTimings.map((phase) => kv(phase.name, formatDurationMs(phase.durationMs))),
        ]
      : []),
    ...(input.phaseTimings && input.phaseTimings.length > 0 ? [sectionEnd()] : []),
    sectionEnd(),
    '',
    section('Env Validation'),
    kv('Signals', `${envPresentCount}/${envChecks.length} key env values present`),
    ...envChecks.map((entry) => row(entry)),
    ...(warnings.length > 0
      ? [
          '',
          section('Warnings'),
          ...warnings.map((w) => row(`${colorize('! ', ansi.yellow)}${w}`)),
          sectionEnd(),
        ]
      : []),
    sectionEnd(),
    hr(),
    '',
  ];

  log.info(lines.join('\n'));
};

export interface DevHeartbeatController {
  stop: () => void;
}

export const startDevHeartbeat = (input: {
  port: number;
  requestCounter: () => number;
}): DevHeartbeatController => {
  if (isProduction() || !checkAnimatedTerminal()) {
    return { stop: () => {} };
  }

  const interval = setInterval(() => {
    const memory = process.memoryUsage();
    log.info(
      `  ${colorize('HEARTBEAT', ansi.magenta)} ${new Date().toISOString()} req:${input.requestCounter()} heap:${formatMemoryUsage(memory.heapUsed)} loop:${formatEventLoopLag()} db:${getDbStatusLabel(getDbStatusSafe())} http://localhost:${input.port}`,
    );
  }, 45_000);
  interval.unref();

  return {
    stop: () => clearInterval(interval),
  };
};

export interface ShutdownManagerOptions {
  httpServer?: HttpServer;
  timeoutMs?: number;
  onPhase?: (phase: string, task: () => Promise<void> | void) => Promise<void>;
  onComplete?: () => Promise<void> | void;
  exitProcess?: (code: number) => void;
  logger?: {
    info: (msg: string, meta?: unknown) => void;
    warn: (msg: string, meta?: unknown) => void;
    error: (msg: string, meta?: unknown) => void;
  };
}

export interface ShutdownManager {
  shutdown: (signal: string) => Promise<void>;
  isShuttingDown: () => boolean;
  registerSignalHandlers: () => () => void;
}

/**
 * Creates an idempotent, production-ready Graceful Shutdown Manager.
 * Ensures that HTTP connections drain, MongoDB disconnects safely,
 * intervals and metrics are terminated, and duplicate signals are ignored.
 */
export const createShutdownManager = (options: ShutdownManagerOptions = {}): ShutdownManager => {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const exit = options.exitProcess ?? ((code: number) => process.exit(code));
  const logInfo = options.logger?.info ?? ((msg: string) => console.log(msg));
  const logWarn = options.logger?.warn ?? ((msg: string) => console.warn(msg));
  const logError =
    options.logger?.error ?? ((msg: string, meta?: unknown) => console.error(msg, meta));

  let shutdownInProgress = false;

  const runPhase = async (phase: string, task: () => Promise<void> | void) => {
    if (options.onPhase) {
      await options.onPhase(phase, task);
    } else {
      const startedAt = Date.now();
      logInfo(`[SHUTDOWN] Phase started: ${phase}`);
      try {
        await task();
        logInfo(`[SHUTDOWN] Phase completed: ${phase} (${Date.now() - startedAt}ms)`);
      } catch (err) {
        logError(`[SHUTDOWN] Phase failed: ${phase}`, err);
        throw err;
      }
    }
  };

  const shutdown = async (signal: string): Promise<void> => {
    if (shutdownInProgress) {
      logWarn(`[SHUTDOWN] Shutdown already in progress. Ignoring signal: ${signal}`);
      return;
    }
    shutdownInProgress = true;
    setBootState('SHUTTING_DOWN');
    logWarn(`[SHUTDOWN] Graceful shutdown initiated by signal: ${signal}`);

    // Emergency fallback watchdog timer
    const forcedTimer = setTimeout(() => {
      logError(`[SHUTDOWN] Graceful shutdown timed out after ${timeoutMs}ms. Forcing exit.`);
      try {
        options.httpServer?.closeIdleConnections?.();
        options.httpServer?.closeAllConnections?.();
      } catch {
        // ignore
      }
      exit(1);
    }, timeoutMs);
    forcedTimer.unref();

    try {
      // Phase 1: Stop accepting new HTTP requests and close idle/active connections
      if (options.httpServer) {
        await runPhase('http_close', async () => {
          logInfo('[SHUTDOWN] Closing HTTP server...');
          await new Promise<void>((resolve, reject) => {
            options.httpServer!.close((err) => {
              if (err) {
                // If the server was already closed or not listening, proceed cleanly
                if ((err as any).code === 'ERR_SERVER_NOT_RUNNING') {
                  resolve();
                  return;
                }
                reject(err);
                return;
              }
              resolve();
            });
          });
          options.httpServer!.closeIdleConnections?.();
          options.httpServer!.closeAllConnections?.();
        });
      }

      // Phase 2: Disconnect database safely
      await runPhase('mongo_disconnect', async () => {
        logInfo('[SHUTDOWN] Disconnecting MongoDB...');
        try {
          if (mongoose.connection && mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
          }
        } catch (err) {
          logError('[SHUTDOWN] MongoDB disconnect error:', err);
        }
      });

      // Phase 3: Cleanup background resources & event loop monitors
      await runPhase('resource_cleanup', () => {
        stopEventLoopLagMonitor();
      });

      // Custom completion hooks (e.g. Sentry flush)
      if (options.onComplete) {
        await options.onComplete();
      }

      clearTimeout(forcedTimer);
      setBootState('TERMINATED');
      logInfo('[SHUTDOWN] Graceful shutdown completed cleanly.');
      exit(0);
    } catch (err) {
      clearTimeout(forcedTimer);
      logError('[SHUTDOWN] Error encountered during shutdown sequence:', err);
      setBootState('FAILED');
      exit(1);
    }
  };

  const registerSignalHandlers = (): (() => void) => {
    const handleSigint = () => void shutdown('SIGINT');
    const handleSigterm = () => void shutdown('SIGTERM');

    process.once('SIGINT', handleSigint);
    process.once('SIGTERM', handleSigterm);

    return () => {
      process.removeListener('SIGINT', handleSigint);
      process.removeListener('SIGTERM', handleSigterm);
    };
  };

  return {
    shutdown,
    isShuttingDown: () => shutdownInProgress,
    registerSignalHandlers,
  };
};

/**
 * Express middleware to guard requests during initialization or shutdown.
 */
export const bootReadinessMiddleware = (
  req: { path: string },
  res: {
    status: (code: number) => { json: (body: unknown) => void; send: (body: unknown) => void };
    setHeader: (name: string, val: string) => void;
  },
  next: () => void,
) => {
  // Always allow health checks through
  if (req.path === '/health' || req.path === '/api/health') {
    return next();
  }

  if (isShuttingDown()) {
    res.setHeader('Retry-After', '10');
    return res.status(503).json({
      success: false,
      status: 'shutting_down',
      message: 'Server is currently shutting down. Please retry shortly.',
    });
  }

  if (!isBootComplete()) {
    res.setHeader('Retry-After', '5');
    return res.status(503).json({
      success: false,
      status: currentBootState,
      message: 'Server is initializing. Please retry shortly.',
    });
  }

  next();
};
