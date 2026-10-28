import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server as HttpServer } from 'http';

import {
  acquireBootLock,
  bootReadinessMiddleware,
  createBootAnimator,
  createRuntimeMetrics,
  createShutdownManager,
  getBootState,
  getDbStatusLabel,
  getDbStatusSafe,
  isBootComplete,
  isShuttingDown,
  renderStartupBanner,
  renderStartupSummary,
  resetBootState,
  sanitizeStartupError,
  setBootState,
  startDevHeartbeat,
  startEventLoopLagMonitor,
  stopEventLoopLagMonitor,
} from '../../server/boot/startup.ts';

import {
  colorize,
  isNoColorSet,
  isProduction,
  supportsColor,
} from '../../server/boot/logger/colors.ts';

import {
  badge,
  fit,
  getTerminalWidth,
  meter,
  padRight,
  stripAnsi,
  truncate,
  visibleLength,
} from '../../server/boot/logger/console.ts';

import {
  calculateHealthPercent,
  getHealthScore,
  getWarnings,
} from '../../server/boot/logger/health.ts';

import { getEnvChecks, normalizePublicUrl, toHealthUrl } from '../../server/boot/logger/runtime.ts';

describe('Production Boot System (server/boot)', () => {
  beforeEach(() => {
    resetBootState();
    stopEventLoopLagMonitor();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetBootState();
    stopEventLoopLagMonitor();
    vi.unstubAllEnvs();
  });

  describe('Boot Lifecycle & Duplicate Startup Prevention', () => {
    it('initializes in UNINITIALIZED state and acquires boot lock once', () => {
      expect(getBootState()).toBe('UNINITIALIZED');
      expect(isBootComplete()).toBe(false);
      expect(isShuttingDown()).toBe(false);

      const acquired = acquireBootLock();
      expect(acquired).toBe(true);
      expect(getBootState()).toBe('INITIALIZING');

      // Subsequent attempt while INITIALIZING must be rejected
      const duplicateAttempt = acquireBootLock();
      expect(duplicateAttempt).toBe(false);
    });

    it('prevents starting again when already READY', () => {
      acquireBootLock();
      setBootState('READY');
      expect(isBootComplete()).toBe(true);

      const duplicateAttempt = acquireBootLock();
      expect(duplicateAttempt).toBe(false);
    });

    it('resets lifecycle state and lock when resetBootState is called', () => {
      acquireBootLock();
      setBootState('READY');
      resetBootState();

      expect(getBootState()).toBe('UNINITIALIZED');
      expect(acquireBootLock()).toBe(true);
    });
  });

  describe('Startup Error Sanitization (Security)', () => {
    it('sanitizes MongoDB connection string passwords in error messages', () => {
      const sensitiveError = new Error(
        'Failed to connect to mongodb+srv://db_admin:P%40ssw0rd123!@cluster0.vault.net/vault?retryWrites=true',
      );
      const { sanitizedMessage } = sanitizeStartupError(sensitiveError);

      expect(sanitizedMessage).not.toContain('P%40ssw0rd123!');
      expect(sanitizedMessage).toContain('mongodb+srv://db_admin:***@cluster0.vault.net/vault');
    });

    it('sanitizes standard mongodb:// URIs with credentials', () => {
      const err = 'Connection refused at mongodb://root:supersecret@127.0.0.1:27017/vault';
      const { sanitizedMessage } = sanitizeStartupError(err);

      expect(sanitizedMessage).not.toContain('supersecret');
      expect(sanitizedMessage).toContain('mongodb://root:***@127.0.0.1:27017/vault');
    });

    it('redacts JWT tokens and hex keys from startup errors', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature';
      const keyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const err = new Error(`Validation failed for JWT=${token} with key=${keyHex}`);

      const { sanitizedMessage } = sanitizeStartupError(err);
      expect(sanitizedMessage).not.toContain(token);
      expect(sanitizedMessage).not.toContain(keyHex);
      expect(sanitizedMessage).toContain('[REDACTED_JWT]');
      expect(sanitizedMessage).toContain('[REDACTED_KEY]');
    });
  });

  describe('Graceful Shutdown Manager', () => {
    it('executes shutdown phases in the correct order and exits with code 0', async () => {
      const phasesCalled: string[] = [];
      const exitMock = vi.fn();

      const mockHttpServer = {
        close: vi.fn((cb) => cb()),
        closeIdleConnections: vi.fn(),
        closeAllConnections: vi.fn(),
      } as unknown as HttpServer;

      const shutdownManager = createShutdownManager({
        httpServer: mockHttpServer,
        timeoutMs: 5000,
        exitProcess: exitMock,
        onPhase: async (phase, task) => {
          phasesCalled.push(phase);
          await task();
        },
      });

      await shutdownManager.shutdown('SIGTERM');

      expect(phasesCalled).toEqual(['http_close', 'mongo_disconnect', 'resource_cleanup']);
      expect(mockHttpServer.close).toHaveBeenCalledTimes(1);
      expect(mockHttpServer.closeIdleConnections).toHaveBeenCalled();
      expect(mockHttpServer.closeAllConnections).toHaveBeenCalled();
      expect(exitMock).toHaveBeenCalledWith(0);
      expect(getBootState()).toBe('TERMINATED');
    });

    it('is idempotent and ignores duplicate shutdown signals', async () => {
      const exitMock = vi.fn();
      const mockHttpServer = {
        close: vi.fn((cb) => cb()),
        closeIdleConnections: vi.fn(),
        closeAllConnections: vi.fn(),
      } as unknown as HttpServer;

      const shutdownManager = createShutdownManager({
        httpServer: mockHttpServer,
        exitProcess: exitMock,
      });

      // Call twice concurrently
      await Promise.all([shutdownManager.shutdown('SIGINT'), shutdownManager.shutdown('SIGINT')]);

      expect(mockHttpServer.close).toHaveBeenCalledTimes(1);
      expect(exitMock).toHaveBeenCalledTimes(1);
    });

    it('handles already closed HTTP server gracefully without throwing', async () => {
      const exitMock = vi.fn();
      const errNotRunning = new Error('Server is not running');
      (errNotRunning as any).code = 'ERR_SERVER_NOT_RUNNING';

      const mockHttpServer = {
        close: vi.fn((cb) => cb(errNotRunning)),
      } as unknown as HttpServer;

      const shutdownManager = createShutdownManager({
        httpServer: mockHttpServer,
        exitProcess: exitMock,
      });

      await shutdownManager.shutdown('SIGTERM');

      expect(exitMock).toHaveBeenCalledWith(0);
      expect(getBootState()).toBe('TERMINATED');
    });

    it('registers and removes process signal listeners', () => {
      const shutdownManager = createShutdownManager();
      const unregister = shutdownManager.registerSignalHandlers();

      expect(typeof unregister).toBe('function');
      unregister();
    });
  });

  describe('Boot Readiness Middleware', () => {
    it('blocks API requests with 503 while initializing', () => {
      setBootState('INITIALIZING');
      const req = { path: '/api/vault/items' };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        send: vi.fn(),
        setHeader: vi.fn(),
      };
      const next = vi.fn();

      bootReadinessMiddleware(req, res as any, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, status: 'INITIALIZING' }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks API requests with 503 during shutdown with Retry-After', () => {
      setBootState('SHUTTING_DOWN');
      const req = { path: '/api/vault/items' };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        send: vi.fn(),
        setHeader: vi.fn(),
      };
      const next = vi.fn();

      bootReadinessMiddleware(req, res as any, next);

      expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '10');
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'shutting_down' }));
      expect(next).not.toHaveBeenCalled();
    });

    it('always allows health probe endpoints through even when booting', () => {
      setBootState('INITIALIZING');
      const req = { path: '/health' };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        send: vi.fn(),
        setHeader: vi.fn(),
      };
      const next = vi.fn();

      bootReadinessMiddleware(req, res as any, next);
      expect(next).toHaveBeenCalled();
    });

    it('allows requests through when boot state is READY', () => {
      setBootState('READY');
      const req = { path: '/api/vault/items' };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        send: vi.fn(),
        setHeader: vi.fn(),
      };
      const next = vi.fn();

      bootReadinessMiddleware(req, res as any, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Runtime Metrics & Ring Buffer Performance', () => {
    it('tracks requests and errors with O(1) reservoir sampling without memory leak', () => {
      const metrics = createRuntimeMetrics(100);

      // Simulate 200 requests (exceeding capacity to test ring buffer wrap-around)
      for (let i = 0; i < 200; i++) {
        const finish = metrics.onRequestStart();
        finish(i % 10 === 0 ? 500 : 200);
      }

      const snap = metrics.snapshot();
      expect(snap.totalRequests).toBe(200);
      expect(snap.totalErrors).toBe(20);
      expect(snap.avgLatencyMs).toBeGreaterThanOrEqual(0);
      expect(snap.p95LatencyMs).toBeGreaterThanOrEqual(0);

      metrics.reset();
      const resetSnap = metrics.snapshot();
      expect(resetSnap.totalRequests).toBe(0);
      expect(resetSnap.totalErrors).toBe(0);
    });

    it('tracks active connection count without negative underflow', () => {
      const metrics = createRuntimeMetrics(50);
      metrics.onConnectionOpen();
      metrics.onConnectionOpen();
      expect(metrics.snapshot().activeConnections).toBe(2);

      metrics.onConnectionClose();
      expect(metrics.snapshot().activeConnections).toBe(1);

      metrics.onConnectionClose();
      metrics.onConnectionClose(); // Extra close should clamp at 0
      expect(metrics.snapshot().activeConnections).toBe(0);
    });
  });

  describe('Console ANSI Stripping & Formatting', () => {
    it('measures visible string width ignoring ANSI escape codes', () => {
      const colored = colorize('SECURE', '\x1b[32m');
      expect(stripAnsi(colored)).toBe('SECURE');
      expect(visibleLength(colored)).toBe(6);
    });

    it('truncates strings at visible max length', () => {
      const truncated = truncate('This is a very long string that should be trimmed', 15);
      expect(visibleLength(truncated)).toBeLessThanOrEqual(15);
      expect(truncated.endsWith('...')).toBe(true);
    });

    it('resolves terminal width within bounded limits', () => {
      const width = getTerminalWidth();
      expect(width).toBeGreaterThanOrEqual(60);
      expect(width).toBeLessThanOrEqual(120);
    });

    it('pads right based on visible length without breaking on colors', () => {
      const colored = colorize('OK', '\x1b[32m');
      const padded = padRight(colored, 6);
      expect(visibleLength(padded)).toBe(6);
      expect(stripAnsi(padded)).toBe('OK    ');
    });

    it('fits text cleanly inside columns without misaligning borders', () => {
      const fitted = fit('Vault Status', 20);
      expect(visibleLength(fitted)).toBe(20);
    });

    it('meter accurately clamps percentages to 0-100%', () => {
      const negativeMeter = meter('Memory', -10);
      expect(stripAnsi(negativeMeter)).toContain('0.0%');

      const fullMeter = meter('Memory', 150);
      expect(stripAnsi(fullMeter)).toContain('100.0%');
    });

    it('badges format UP, WARN, DOWN, INFO correctly', () => {
      expect(stripAnsi(badge('UP', 'All services green'))).toContain('[UP] All services green');
      expect(stripAnsi(badge('WARN', 'High latency'))).toContain('[WARN] High latency');
    });
  });

  describe('Health Warnings & Score Evaluation', () => {
    it('warns when production secrets or mongodb are missing', () => {
      vi.stubEnv('NODE_ENV', 'production');

      const warnings = getWarnings({
        jwtConfigured: false,
        publicUrlConfigured: false,
        heapPercent: 92,
        mongoConnected: false,
        refreshTokenConfigured: false,
        encryptionKeyConfigured: false,
        p95LatencyMs: 1500,
        eventLoopLagMs: 200,
      });

      expect(warnings).toContain('JWT_SECRET missing in production');
      expect(warnings).toContain('PUBLIC_URL not configured in production');
      expect(warnings).toContain('MongoDB is not connected in production');
      expect(warnings).toContain('REFRESH_TOKEN_SECRET missing in production');
      expect(warnings).toContain('VAULT_ENCRYPTION_KEY missing in production');
      expect(warnings).toContain('High heap usage: 92.0%');
      expect(warnings).toContain('High API latency p95: 1500 ms');
      expect(warnings).toContain('High event loop lag: 200 ms');
    });

    it('calculates health score and percentage safely without NaN on empty array', () => {
      expect(getHealthScore([])).toBe('0/0');
      expect(calculateHealthPercent([])).toBe(0);

      const signals = [true, true, false, true];
      expect(getHealthScore(signals)).toBe('3/4');
      expect(calculateHealthPercent(signals)).toBe(75);
    });
  });

  describe('URL Normalization & Environment Validation Badges', () => {
    it('normalizes valid public URLs by trimming trailing slashes', () => {
      expect(normalizePublicUrl('https://vault.example.com/')).toBe('https://vault.example.com');
      expect(normalizePublicUrl('http://localhost:4000///')).toBe('http://localhost:4000');
    });

    it('rejects invalid or unsafe URL protocols', () => {
      expect(normalizePublicUrl('javascript:alert(1)')).toBeNull();
      expect(normalizePublicUrl('file:///etc/passwd')).toBeNull();
      expect(normalizePublicUrl('not-a-valid-url')).toBeNull();
      expect(normalizePublicUrl('')).toBeNull();
      expect(normalizePublicUrl(undefined)).toBeNull();
    });

    it('resolves health URLs correctly', () => {
      expect(toHealthUrl('https://vault.example.com')).toBe('https://vault.example.com/health');
      expect(toHealthUrl('invalid')).toBeNull();
    });

    it('generates environment check badges without leaking secret values', () => {
      vi.stubEnv('JWT_SECRET', 'my-super-secret-jwt-key');
      vi.stubEnv('NODE_ENV', 'development');

      const checks = getEnvChecks();
      const checksJoined = checks.join('\n');

      // Crucial: values must NEVER appear in the checks
      expect(checksJoined).not.toContain('my-super-secret-jwt-key');
      expect(checksJoined).toContain('JWT_SECRET');
      expect(checksJoined).toContain('MONGODB_URI');
    });
  });

  describe('Database Status Safety', () => {
    it('resolves database status without throwing even when disconnected', () => {
      const status = getDbStatusSafe();
      expect(typeof status).toBe('string');
      expect(getDbStatusLabel(status)).toBeDefined();
    });

    it('maps readyState numbers to human labels accurately', () => {
      expect(getDbStatusLabel(0)).toBe('disconnected');
      expect(getDbStatusLabel(1)).toBe('connected');
      expect(getDbStatusLabel(2)).toBe('connecting');
      expect(getDbStatusLabel(3)).toBe('disconnecting');
      expect(getDbStatusLabel(99)).toBe('uninitialized');
      expect(getDbStatusLabel('unknown')).toBe('state-unknown');
    });
  });

  describe('Dev Heartbeat & Animator Lifecycle', () => {
    it('manages event loop lag monitor lifecycle', () => {
      const monitor = startEventLoopLagMonitor();
      expect(monitor).toBeDefined();
      stopEventLoopLagMonitor();
    });

    it('renders startup banner and summary without crashing', () => {
      expect(() => renderStartupBanner()).not.toThrow();
      expect(() =>
        renderStartupSummary({
          port: 4000,
          trustProxy: 1,
          networkUrls: ['http://192.168.1.100:4000'],
          bootDurationMs: 150,
        }),
      ).not.toThrow();
    });

    it('evaluates production environment and NO_COLOR settings', () => {
      vi.stubEnv('NODE_ENV', 'production');
      expect(isProduction()).toBe(true);

      vi.stubEnv('NO_COLOR', '1');
      expect(isNoColorSet()).toBe(true);
      expect(supportsColor()).toBe(false);
    });

    it('creates an animator that starts, updates, succeeds, and fails cleanly', () => {
      const animator = createBootAnimator();
      animator.start('Booting', 'Initializing subsystems');
      animator.update('Database', 'Connecting to cluster');
      animator.succeed('Subsystems Ready', 'All OK');
      animator.stop();
    });

    it('starts dev heartbeat in development and stops on demand', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const heartbeat = startDevHeartbeat({
        port: 4000,
        requestCounter: () => 42,
      });
      expect(heartbeat).toHaveProperty('stop');
      heartbeat.stop();
    });

    it('does not run dev heartbeat in production', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const heartbeat = startDevHeartbeat({
        port: 4000,
        requestCounter: () => 10,
      });
      heartbeat.stop();
    });
  });
});
