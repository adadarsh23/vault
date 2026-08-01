import os from 'os';
import process from 'process';
import v8 from 'v8';
import { getDbStatus } from '../mongo.ts';
import { getUploadRoot } from '../utils/fileStorage.ts';
import { getAllowedCorsOrigins } from '../utils/cors.ts';
import { ansi, colorize, isProd, supportsAnimatedTerminal } from './logger/colors.ts';
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
  type RuntimeSnapshot,
  type StartupPhaseTiming,
} from './logger/metrics.ts';
import { getHealthScore, getWarnings } from './logger/health.ts';
import { getEnvChecks, normalizePublicUrl, toHealthUrl } from './logger/runtime.ts';

export { createRuntimeMetrics, type StartupPhaseTiming };

type DbState = '0' | '1' | '2' | '3';
const DB_STATE_MAP: Record<DbState, string> = {
  '0': 'disconnected',
  '1': 'connected',
  '2': 'connecting',
  '3': 'disconnecting',
};
const getDbStatusLabel = (state: string): string =>
  DB_STATE_MAP[state as DbState] ?? `state-${state}`;

export const renderStartupBanner = () => {
  const mode = isProd ? 'PRODUCTION' : 'DEVELOPMENT';
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
    ].join('\n')
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
    if (!supportsAnimatedTerminal) return;
    const frame = bootFrames[frameIndex++ % bootFrames.length];
    safeWrite(
      `\r  ${colorize(frame, ansi.cyan)} ${colorize(padRight(label, 28), ansi.bold)} ${colorize(detail, `${ansi.dim}${ansi.gray}`)}`
    );
  };

  const stop = () => {
    if (interval) clearInterval(interval);
    interval = null;
  };

  return {
    start(initialLabel: string, initialDetail: string) {
      label = initialLabel;
      detail = initialDetail;
      if (!supportsAnimatedTerminal) return log.info(`  > ${label} (${detail})`);
      render();
      interval = setInterval(render, 90);
    },
    update(nextLabel: string, nextDetail: string) {
      label = nextLabel;
      detail = nextDetail;
      if (!supportsAnimatedTerminal) log.info(`  > ${label} (${detail})`);
    },
    succeed(finalLabel: string, finalDetail: string) {
      stop();
      const message = `  ${colorize('OK', ansi.green)} ${padRight(finalLabel, 28)} ${finalDetail}`;
      supportsAnimatedTerminal ? safeWrite(`\r${message}\n`) : log.info(message);
    },
    fail(finalLabel: string, finalDetail: string) {
      stop();
      const message = `  ${colorize('ERR', ansi.yellow)} ${padRight(finalLabel, 28)} ${finalDetail}`;
      supportsAnimatedTerminal ? safeWrite(`\r${message}\n`) : log.error(message);
    },
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
}) => {
  const memory = process.memoryUsage();
  const dbStatus = getDbStatusLabel(getDbStatus());
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
  const heapCommittedPercent = memory.heapTotal > 0 ? (memory.heapUsed / memory.heapTotal) * 100 : 0;
  const heapLimit = v8.getHeapStatistics().heap_size_limit;
  const heapLimitPercent = heapLimit > 0 ? (memory.heapUsed / heapLimit) * 100 : 0;
  const warnings = getWarnings({
    jwtConfigured: Boolean(process.env.JWT_SECRET),
    publicUrlConfigured: Boolean(publicUrl),
    heapPercent: heapLimitPercent,
    p95LatencyMs: input.runtimeMetrics?.p95LatencyMs,
  });
  const healthScore = getHealthScore([
    dbStatus === 'connected',
    Boolean(process.env.JWT_SECRET),
    Boolean(publicUrl) || !isProd,
    heapLimitPercent < 85,
    uploadRoot === 'cloud-only' || uploadRoot.length > 0,
  ]);
  const [healthOk, healthTotal] = healthScore.split('/').map((n) => Number.parseInt(n, 10));
  const healthPercent =
    Number.isFinite(healthOk) && Number.isFinite(healthTotal) && healthTotal > 0
      ? (healthOk / healthTotal) * 100
      : 0;
  const latencyP95 = input.runtimeMetrics?.p95LatencyMs ?? 0;
  const latencyPressurePercent = Math.min((latencyP95 / 1000) * 100, 100);

  const lines = [
    '',
    ...titleBox(
      colorize('VAULT SERVER IS LIVE', `${ansi.bold}${ansi.green}`),
      colorize('FULL RUNTIME SNAPSHOT', `${ansi.dim}${ansi.gray}`),
    ),
    badge('UP', `Mongo ${dbStatus}`),
    badge('INFO', `Mode ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}`),
    ...(warnings.length > 0
      ? [badge('WARN', `${warnings.length} runtime warning(s) detected`)]
      : [badge('UP', 'No critical runtime warnings detected')]),
    hr(),
    '',
    section('Runtime'),
    kv('Mode', `${isProd ? 'PRODUCTION' : 'DEVELOPMENT'} (${isProd ? 'hardened' : 'developer-friendly'})`),
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
    kv('Memory', `RSS ${formatMemoryUsage(memory.rss)}  Heap ${formatMemoryUsage(memory.heapUsed)}`),
    kv(
      'Heap',
      `${formatMemoryUsage(memory.heapUsed)} / ${formatMemoryUsage(memory.heapTotal)} committed (${heapCommittedPercent.toFixed(1)}%)`
    ),
    kv('Heap Limit', `${formatMemoryUsage(memory.heapUsed)} / ${formatMemoryUsage(heapLimit)} (${heapLimitPercent.toFixed(1)}%)`),
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
          kv('Latency', `avg ${Math.round(input.runtimeMetrics.avgLatencyMs)} ms  p95 ${Math.round(input.runtimeMetrics.p95LatencyMs)} ms`),
          kv('Connections', `${input.runtimeMetrics.activeConnections} active`),
        ]
      : []),
    sectionEnd(),
    '',
    section('Security And Data'),
    kv('Mongo', dbStatus),
    kv('Uploads', uploadRoot),
    kv('Origins', `${allowedOrigins.length} allowed`),
    kv('Origin List', truncate(allowedOrigins.length > 0 ? allowedOrigins.join(', ') : 'none', 220)),
    kv('JWT Secret', process.env.JWT_SECRET ? 'configured' : 'missing'),
    kv('Refresh Secret', process.env.REFRESH_TOKEN_SECRET ? 'configured' : 'fallback-to-jwt-or-missing'),
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
      ? ['', section('Startup Phase Timings'), ...input.phaseTimings.map((phase) => kv(phase.name, formatDurationMs(phase.durationMs)))]
      : []),
    ...(input.phaseTimings && input.phaseTimings.length > 0 ? [sectionEnd()] : []),
    sectionEnd(),
    '',
    section('Env Validation'),
    kv('Signals', `${envPresentCount}/${envChecks.length} key env values present`),
    ...envChecks.map((entry) => row(entry)),
    ...(warnings.length > 0
      ? ['', section('Warnings'), ...warnings.map((w) => row(`${colorize('! ', ansi.yellow)}${w}`)), sectionEnd()]
      : []),
    sectionEnd(),
    hr(),
    '',
  ];

  log.info(lines.join('\n'));
};

export const startDevHeartbeat = (input: {
  port: number;
  requestCounter: () => number;
}) => {
  if (isProd || !supportsAnimatedTerminal) return;
  const interval = setInterval(() => {
    const memory = process.memoryUsage();
    log.info(
      `  ${colorize('HEARTBEAT', ansi.magenta)} ${new Date().toISOString()} req:${input.requestCounter()} heap:${formatMemoryUsage(memory.heapUsed)} loop:${formatEventLoopLag()} db:${getDbStatusLabel(getDbStatus())} http://localhost:${input.port}`
    );
  }, 45_000);
  interval.unref();
};
