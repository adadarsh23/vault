#!/usr/bin/env node

/**
 * Vault Project Production-Ready Lighthouse Runner
 *
 * Features:
 * - Cross-platform Chrome & Chromium executable detection (Windows, macOS, Linux)
 * - Safe Chrome process lifecycle & isolated temporary user-data-dir management
 * - Preview server monitoring with fast failure detection & auto-build capability
 * - Modern, accessible, responsive split HTML reports & category JSON exports
 * - Core Web Vitals extraction (FCP, LCP, TBT, CLS, Speed Index, INP, TTFB)
 * - CI/CD Quality Gate assertions (--min-score, --max-lcp, --max-cls, --assert)
 * - ANSI color-coded terminal summaries with pass/fail budgets
 * - Direct execution and clean programmatic API for unit testing
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import net from 'node:net';
import { execSync, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants & Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_URL = 'http://127.0.0.1:4173/';
export const DEFAULT_OUTPUT_PATH = './lighthouse/report';
export const DEFAULT_SPLIT_REPORT_DIR = './lighthouse/report-split';
export const DEFAULT_CATEGORIES = 'performance,accessibility,best-practices,seo';
export const DEFAULT_PREVIEW_HOST = '127.0.0.1';
export const DEFAULT_PREVIEW_PORT = 4173;
export const DEFAULT_TIMEOUT_MS = 30000;

export const DEFAULT_CHROME_FLAGS = [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-extensions',
  '--disable-sync',
  '--disable-default-apps',
  '--mute-audio',
].join(' ');

export const FALLBACK_CHROME_FLAGS = [
  '--headless',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-extensions',
  '--disable-sync',
  '--disable-default-apps',
  '--mute-audio',
].join(' ');

export const CWV_THRESHOLDS = {
  fcp: { name: 'First Contentful Paint', good: 1800, warn: 3000, unit: 'ms' },
  lcp: { name: 'Largest Contentful Paint', good: 2500, warn: 4000, unit: 'ms' },
  tbt: { name: 'Total Blocking Time', good: 200, warn: 600, unit: 'ms' },
  cls: { name: 'Cumulative Layout Shift', good: 0.1, warn: 0.25, unit: '' },
  si: { name: 'Speed Index', good: 3400, warn: 5800, unit: 'ms' },
  inp: { name: 'Interaction to Next Paint', good: 200, warn: 500, unit: 'ms' },
  ttfb: { name: 'Time to First Byte', good: 800, warn: 1800, unit: 'ms' },
};

// ---------------------------------------------------------------------------
// Environment & Path Utilities
// ---------------------------------------------------------------------------

export const ensureWindowsSystem32OnPath = () => {
  if (process.platform !== 'win32') {
    return process.env.PATH || '';
  }

  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const system32 = path.join(systemRoot, 'System32');
  const pathValue = process.env.PATH || '';
  const separator = path.delimiter;
  const entries = pathValue
    .split(separator)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const hasSystem32 = entries.some((entry) => entry.toLowerCase() === system32.toLowerCase());

  if (hasSystem32) {
    return pathValue;
  }

  const updatedPath = entries.length > 0 ? `${pathValue}${separator}${system32}` : system32;
  process.env.PATH = updatedPath;
  return updatedPath;
};

export const sanitizeNpmConfigEnv = (rawEnv = process.env) => {
  const sanitized = { ...rawEnv };
  for (const key of Object.keys(sanitized)) {
    if (/^npm_config_global[-_]?ignore[-_]?file$/i.test(key)) {
      delete sanitized[key];
    }
  }
  return sanitized;
};

// Clean in-place on module load to prevent downstream warnings in npm/npx subprocesses
for (const key of Object.keys(process.env)) {
  if (/^npm_config_global[-_]?ignore[-_]?file$/i.test(key)) {
    delete process.env[key];
  }
}

export const runtimePath = ensureWindowsSystem32OnPath();

export const getSanitizedProcessEnv = (extraEnv = {}) => ({
  ...sanitizeNpmConfigEnv(process.env),
  PATH: runtimePath,
  ...extraEnv,
});

/**
 * Searches for a Chrome/Chromium executable across multiple platforms.
 */
export const resolveChromeExecutablePath = (
  customCandidates = [],
  env = process.env,
  platform = process.platform,
) => {
  // 1. Explicit environment variable overrides
  const envCandidates = [
    env.LIGHTHOUSE_CHROMIUM_PATH,
    env.CHROME_PATH,
    env.PUPPETEER_EXECUTABLE_PATH,
    env.CHROMIUM_PATH,
    env.EDGE_PATH,
    ...customCandidates,
  ].filter(Boolean);

  for (const candidate of envCandidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 2. Platform-specific standard installations
  const candidates = [];

  if (platform === 'win32') {
    const programFiles = env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

    candidates.push(
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(localAppData, 'Chromium', 'Application', 'chrome.exe'),
    );
  } else if (platform === 'darwin') {
    const homeApps = path.join(os.homedir(), 'Applications');
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      path.join(homeApps, 'Google Chrome.app/Contents/MacOS/Google Chrome'),
      path.join(homeApps, 'Chromium.app/Contents/MacOS/Chromium'),
    );
  } else if (['linux', 'openbsd', 'freebsd'].includes(platform)) {
    // Linux / BSD
    candidates.push(
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge',
      '/usr/bin/brave-browser',
    );
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 3. Command lookup (which / where)
  if (['linux', 'darwin', 'openbsd', 'freebsd'].includes(platform)) {
    for (const bin of ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser']) {
      try {
        const out = execSync(`which ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .trim();
        if (out && fs.existsSync(out)) {
          return out;
        }
      } catch {
        // ignore
      }
    }
  }

  throw new Error(
    'Could not locate a Chrome or Chromium executable. Please install Google Chrome/Chromium or set CHROME_PATH environment variable.',
  );
};

export const isSafeWorkspaceChild = (targetPath, workspaceRoot = process.cwd()) => {
  if (!targetPath) return false;
  const resolved = path.resolve(workspaceRoot, targetPath);
  const relative = path.relative(workspaceRoot, resolved);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

// ---------------------------------------------------------------------------
// Process & Resource Lifecycle Management
// ---------------------------------------------------------------------------

export const removeTempDirectorySafely = (directoryPath, retries = 5, delayMs = 150) => {
  if (!directoryPath || !fs.existsSync(directoryPath)) {
    return;
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      fs.rmSync(directoryPath, { recursive: true, force: true, maxRetries: 3 });
      return;
    } catch (error) {
      const isLockError =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error.code === 'EPERM' || error.code === 'EBUSY' || error.code === 'EACCES');

      if (!isLockError || attempt === retries) {
        return;
      }

      // Synchronous backoff wait for file locks to release
      const stop = Date.now() + delayMs * (attempt + 1);
      while (Date.now() < stop) {
        // busy wait
      }
    }
  }
};

export const cleanupStaleLighthouseTempDirectories = (tempRoot = os.tmpdir()) => {
  let entries = [];
  try {
    entries = fs.readdirSync(tempRoot, { withFileTypes: true });
  } catch {
    return;
  }

  const cutoff = Date.now() - 3600000; // 1 hour ago

  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      (!entry.name.startsWith('lighthouse.') && !entry.name.startsWith('lighthouse-managed-'))
    ) {
      continue;
    }

    const fullPath = path.join(tempRoot, entry.name);
    try {
      const stats = fs.statSync(fullPath);
      if (stats.mtimeMs < cutoff) {
        removeTempDirectorySafely(fullPath, 2);
      }
    } catch {
      // ignore
    }
  }
};

export const getAvailablePort = (host = '127.0.0.1') =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to resolve free debug port')));
        return;
      }

      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });

export const splitChromeFlags = (flags) => {
  if (Array.isArray(flags)) {
    return flags.map(String).filter(Boolean);
  }
  return String(flags || '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
};

export const terminateProcessTree = (pid, platform = process.platform) => {
  if (!pid) return;

  if (platform === 'win32') {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, {
        stdio: 'ignore',
        windowsHide: true,
        env: getSanitizedProcessEnv(),
      });
      return;
    } catch {
      // ignore
    }
  }

  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // ignore
    }
  }
};

export const launchManagedChrome = async ({
  chromeFlags = DEFAULT_CHROME_FLAGS,
  customExecutablePath = null,
  timeoutMs = 15000,
} = {}) => {
  const debugPort = await getAvailablePort('127.0.0.1');
  const executablePath = customExecutablePath || resolveChromeExecutablePath();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-managed-'));

  const parsedFlags = splitChromeFlags(chromeFlags)
    .filter((flag) => !flag.startsWith('--remote-debugging-port='))
    .filter((flag) => !flag.startsWith('--user-data-dir='));

  if (!parsedFlags.some((flag) => flag.startsWith('--headless'))) {
    parsedFlags.push('--headless=new');
  }

  parsedFlags.push(`--user-data-dir=${userDataDir}`);
  parsedFlags.push(`--remote-debugging-port=${debugPort}`);
  parsedFlags.push('about:blank');

  const chromeProcess = spawn(executablePath, parsedFlags, {
    stdio: 'ignore',
    windowsHide: true,
    detached: process.platform !== 'win32',
    env: getSanitizedProcessEnv(),
  });

  let exited = false;
  chromeProcess.on('exit', () => {
    exited = true;
  });

  try {
    await waitForServer(`http://127.0.0.1:${debugPort}/json/version`, timeoutMs, chromeProcess);
  } catch (error) {
    if (!exited) {
      terminateProcessTree(chromeProcess.pid);
    }
    removeTempDirectorySafely(userDataDir);
    throw new Error(
      `Failed to launch Chrome on debugging port ${debugPort}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const stop = async () => {
    if (!exited && chromeProcess.pid) {
      try {
        chromeProcess.kill('SIGTERM');
      } catch {
        // ignore
      }
      terminateProcessTree(chromeProcess.pid);
    }
    removeTempDirectorySafely(userDataDir);
  };

  return { debugPort, stop, pid: chromeProcess.pid, userDataDir, process: chromeProcess };
};

// ---------------------------------------------------------------------------
// Build & Server Management
// ---------------------------------------------------------------------------

export const resolveNpxRunner = () => {
  const isWin = process.platform === 'win32';
  const nodeBin = process.execPath;
  const nodeDir = path.dirname(nodeBin);

  // Check direct npx-cli.js locations
  const candidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npx.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx.js'),
  ];

  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      return {
        command: nodeBin,
        prefixArgs: [cand],
        options: { shell: false },
      };
    }
  }

  // Windows cmd.exe direct execution fallback
  if (isWin) {
    return {
      command: 'cmd.exe',
      prefixArgs: ['/d', '/s', '/c', 'npx'],
      options: { shell: false },
    };
  }

  // POSIX fallback
  return {
    command: 'npx',
    prefixArgs: [],
    options: { shell: false },
  };
};

export const ensureProductionBuild = (workspaceRoot = process.cwd(), forceRebuild = false) => {
  const possibleBuildDirs = [
    path.join(workspaceRoot, 'build', 'index.html'),
    path.join(workspaceRoot, 'dist', 'index.html'),
  ];

  const existingBuildHtml = possibleBuildDirs.find((p) => fs.existsSync(p));
  if (existingBuildHtml && !forceRebuild) {
    const buildMtime = fs.statSync(existingBuildHtml).mtimeMs;
    const sourceFilesToCheck = [
      path.join(workspaceRoot, 'index.html'),
      path.join(workspaceRoot, 'vite.config.ts'),
      path.join(workspaceRoot, 'src', 'App.tsx'),
      path.join(workspaceRoot, 'src', 'main.tsx'),
      path.join(workspaceRoot, 'src', 'index.css'),
    ];
    const isStale = sourceFilesToCheck.some((src) => {
      try {
        return fs.existsSync(src) && fs.statSync(src).mtimeMs > buildMtime;
      } catch {
        return false;
      }
    });

    if (!isStale) {
      return true;
    }
    console.log('⚡ Source files modified since last build. Rebuilding production bundle...');
  } else if (!existingBuildHtml) {
    console.log('⚡ Production build not found. Running build step before preview...');
  }

  const buildEnvScript = path.join(workspaceRoot, 'scripts', 'build-env.mjs');
  let result;

  if (fs.existsSync(buildEnvScript)) {
    result = spawnSync(process.execPath, [buildEnvScript], {
      cwd: workspaceRoot,
      stdio: 'inherit',
      shell: false,
      env: getSanitizedProcessEnv(),
    });
  } else {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? 'cmd.exe' : 'npm';
    const args = isWin ? ['/d', '/s', '/c', 'npm', 'run', 'build'] : ['run', 'build'];
    result = spawnSync(cmd, args, {
      cwd: workspaceRoot,
      stdio: 'inherit',
      shell: false,
      env: getSanitizedProcessEnv(),
    });
  }

  if (result.status !== 0) {
    throw new Error(`Build failed with exit code ${result.status ?? 1}`);
  }

  return true;
};

export const waitForServer = (url, timeoutMs = 30000, attachedProcess = null) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    let settled = false;
    let timer = null;

    const cleanup = () => {
      settled = true;
      if (timer) clearTimeout(timer);
    };

    if (attachedProcess) {
      attachedProcess.on('exit', (code) => {
        if (!settled) {
          cleanup();
          reject(new Error(`Server process exited prematurely with code ${code}`));
        }
      });
    }

    const tryRequest = () => {
      if (settled) return;

      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          cleanup();
          resolve(true);
          return;
        }
        retry();
      });

      req.on('error', retry);
      req.setTimeout(2000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (settled) return;
      if (Date.now() - start > timeoutMs) {
        cleanup();
        reject(new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`));
        return;
      }
      timer = setTimeout(tryRequest, 400);
    };

    tryRequest();
  });

// ---------------------------------------------------------------------------
// Formatting, Scoring & Metrics
// ---------------------------------------------------------------------------

export const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const stripMarkdownLinks = (value) =>
  String(value ?? '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1');

export const slugify = (value) =>
  String(value ?? 'report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'report';

export const scorePercent = (score) => {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return null;
  }
  return Math.round(score * 100);
};

export const scoreClass = (score) => {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return 'na';
  }
  if (score >= 0.9) {
    return 'pass';
  }
  if (score >= 0.5) {
    return 'warn';
  }
  return 'fail';
};

export const scoreColor = (score) => {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return '\x1b[90m'; // Gray
  }
  if (score >= 0.9) {
    return '\x1b[32m'; // Green
  }
  if (score >= 0.5) {
    return '\x1b[33m'; // Yellow
  }
  return '\x1b[31m'; // Red
};

export const scoreLabel = (audit) => {
  const mode = audit?.scoreDisplayMode;
  if (mode === 'notApplicable') {
    return 'N/A';
  }
  if (mode === 'manual') {
    return 'Manual';
  }
  if (mode === 'informative') {
    return 'Info';
  }

  const percent = scorePercent(audit?.score);
  return percent === null ? '-' : `${percent}`;
};

export const formatDuration = (ms) => {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return '-';
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  return `${Math.round(ms)} ms`;
};

export const formatBytes = (bytes) => {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) return '-';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024)) - 1;
  const unitIndex = Math.min(Math.max(i, 0), units.length - 1);
  const value = bytes / Math.pow(1024, unitIndex + 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
};

export const extractCoreWebVitals = (report) => {
  const audits = report?.audits || {};

  const getMetric = (id, thresholdKey) => {
    const audit = audits[id];
    const cfg = CWV_THRESHOLDS[thresholdKey] || { good: 0, warn: 0, unit: '' };
    const rawVal = audit?.numericValue;
    const displayVal = audit?.displayValue || (rawVal != null ? `${rawVal}` : '-');
    const score = audit?.score ?? null;

    let rating = 'na';
    if (typeof rawVal === 'number') {
      if (rawVal <= cfg.good) rating = 'good';
      else if (rawVal <= cfg.warn) rating = 'warn';
      else rating = 'poor';
    }

    return {
      id,
      name: audit?.title || cfg.name || id,
      value: rawVal,
      displayValue: displayVal,
      score,
      rating,
      unit: cfg.unit,
      thresholds: { good: cfg.good, warn: cfg.warn },
    };
  };

  return {
    fcp: getMetric('first-contentful-paint', 'fcp'),
    lcp: getMetric('largest-contentful-paint', 'lcp'),
    tbt: getMetric('total-blocking-time', 'tbt'),
    cls: getMetric('cumulative-layout-shift', 'cls'),
    si: getMetric('speed-index', 'si'),
    inp: getMetric('interaction-to-next-paint', 'inp'),
    ttfb: getMetric('server-response-time', 'ttfb'),
  };
};

export const extractOpportunities = (report) => {
  const audits = report?.audits || {};
  const opportunities = [];

  for (const [id, audit] of Object.entries(audits)) {
    if (
      audit?.details?.type === 'opportunity' ||
      (typeof audit?.numericValue === 'number' &&
        audit.numericValue > 50 &&
        typeof audit.score === 'number' &&
        audit.score < 0.9 &&
        (audit?.details?.overallSavingsMs || audit?.details?.overallSavingsBytes))
    ) {
      opportunities.push({
        id,
        title: audit.title,
        description: stripMarkdownLinks(audit.description),
        score: audit.score,
        savingsMs: audit?.details?.overallSavingsMs ?? null,
        savingsBytes: audit?.details?.overallSavingsBytes ?? null,
        displayValue: audit.displayValue || '',
      });
    }
  }

  return opportunities.sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0));
};

export const evaluateAssertions = (report, assertions = {}) => {
  const categories = report?.categories || {};
  const cwv = extractCoreWebVitals(report);
  const failures = [];
  const passes = [];

  // Minimum Category Scores
  const minScoreAll = assertions.minScore ?? null;

  for (const [catId, cat] of Object.entries(categories)) {
    let minTarget = minScoreAll;
    if (catId === 'performance' && assertions.minScorePerformance != null) {
      minTarget = assertions.minScorePerformance;
    } else if (catId === 'accessibility' && assertions.minScoreAccessibility != null) {
      minTarget = assertions.minScoreAccessibility;
    } else if (catId === 'best-practices' && assertions.minScoreBestPractices != null) {
      minTarget = assertions.minScoreBestPractices;
    } else if (catId === 'seo' && assertions.minScoreSeo != null) {
      minTarget = assertions.minScoreSeo;
    }

    if (minTarget == null) continue;
    const actual = scorePercent(cat.score) ?? 0;
    if (actual < minTarget) {
      failures.push(
        `Category '${cat.title || catId}' score ${actual} is below required threshold ${minTarget}`,
      );
    } else {
      passes.push(`Category '${cat.title || catId}' score ${actual} >= ${minTarget}`);
    }
  }

  // Core Web Vitals Assertions
  if (assertions.maxLcp && cwv.lcp.value != null && cwv.lcp.value > assertions.maxLcp) {
    failures.push(
      `LCP of ${Math.round(cwv.lcp.value)}ms exceeds maximum allowed ${assertions.maxLcp}ms`,
    );
  }
  if (assertions.maxFcp && cwv.fcp.value != null && cwv.fcp.value > assertions.maxFcp) {
    failures.push(
      `FCP of ${Math.round(cwv.fcp.value)}ms exceeds maximum allowed ${assertions.maxFcp}ms`,
    );
  }
  if (assertions.maxTbt && cwv.tbt.value != null && cwv.tbt.value > assertions.maxTbt) {
    failures.push(
      `TBT of ${Math.round(cwv.tbt.value)}ms exceeds maximum allowed ${assertions.maxTbt}ms`,
    );
  }
  if (assertions.maxCls && cwv.cls.value != null && cwv.cls.value > assertions.maxCls) {
    failures.push(
      `CLS of ${cwv.cls.value.toFixed(3)} exceeds maximum allowed ${assertions.maxCls}`,
    );
  }

  return {
    passed: failures.length === 0,
    failures,
    passes,
    assertionsCount: failures.length + passes.length,
  };
};

// ---------------------------------------------------------------------------
// HTML Report Generation & Templates
// ---------------------------------------------------------------------------

export const renderPage = ({ title, body, subTitle = '' }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f8fafc;
      --panel: #ffffff;
      --panel-alt: #f1f5f9;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --pass: #10b981;
      --pass-bg: #ecfdf5;
      --warn: #f59e0b;
      --warn-bg: #fffbeb;
      --fail: #ef4444;
      --fail-bg: #fef2f2;
      --na: #94a3b8;
      --accent: #3b82f6;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0b0f19;
        --panel: #111827;
        --panel-alt: #1f2937;
        --text: #f9fafb;
        --muted: #9ca3af;
        --border: #374151;
        --pass-bg: #064e3b;
        --warn-bg: #78350f;
        --fail-bg: #7f1d1d;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    }
    main {
      width: min(1200px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 64px;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    header {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }
    h1, h2, h3 { line-height: 1.2; margin: 0; font-weight: 700; }
    h1 { font-size: clamp(24px, 4vw, 36px); letter-spacing: -0.02em; }
    h2 { font-size: 18px; margin-top: 32px; margin-bottom: 14px; }
    .muted { color: var(--muted); }
    .nav-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 16px 0 24px;
    }
    .nav-links a {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 6px 14px;
      background: var(--panel);
      color: var(--text);
      font-weight: 500;
      font-size: 13px;
      transition: all 0.15s ease;
    }
    .nav-links a:hover {
      background: var(--panel-alt);
      border-color: var(--accent);
      text-decoration: none;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.06);
    }
    .score-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      font-size: 20px;
      font-weight: 800;
      border: 3px solid currentColor;
    }
    .score-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 44px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      border: 1px solid currentColor;
    }
    .pass { color: var(--pass); }
    .warn { color: var(--warn); }
    .fail { color: var(--fail); }
    .na { color: var(--na); }
    .table-container {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 24px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th, td {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th {
      background: var(--panel-alt);
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.05em;
    }
    tr:last-child td { border-bottom: 0; }
    tr:hover td { background: var(--panel-alt); }
    .audit-title { font-weight: 600; color: var(--text); }
    .audit-description { color: var(--muted); font-size: 13px; margin-top: 4px; }
    .badge-metric {
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-metric.good { background: var(--pass-bg); color: var(--pass); }
    .badge-metric.warn { background: var(--warn-bg); color: var(--warn); }
    .badge-metric.poor { background: var(--fail-bg); color: var(--fail); }
    .badge-metric.na { background: var(--panel-alt); color: var(--na); }
    .cwv-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin: 16px 0 28px;
    }
    .cwv-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      text-align: center;
    }
    .cwv-title { font-size: 12px; color: var(--muted); margin-bottom: 6px; font-weight: 600; }
    .cwv-value { font-size: 20px; font-weight: 800; }
  </style>
</head>
<body>
  <main>
    ${body}
  </main>
</body>
</html>`;

export const renderAuditTable = (rows) => {
  if (!rows || rows.length === 0) {
    return '<p class="muted" style="padding: 16px;">No audits in this section.</p>';
  }

  const body = rows
    .map(({ audit }) => {
      const description = stripMarkdownLinks(audit.description || '');
      const cls = scoreClass(audit.score);
      return `<tr>
      <td style="width: 70px;"><span class="score-pill ${cls}">${escapeHtml(scoreLabel(audit))}</span></td>
      <td>
        <div class="audit-title">${escapeHtml(audit.title || audit.id)}</div>
        ${description ? `<div class="audit-description">${escapeHtml(description)}</div>` : ''}
      </td>
      <td style="width: 140px; font-weight: 600;">${escapeHtml(audit.displayValue || '')}</td>
    </tr>`;
    })
    .join('\n');

  return `<div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Score</th>
          <th>Audit</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
};

export const renderOpportunitiesTable = (opportunities) => {
  if (!opportunities || opportunities.length === 0) {
    return '';
  }

  const rows = opportunities
    .map((opp) => {
      let savings = opp.displayValue;
      if (opp.savingsMs) savings = `${formatDuration(opp.savingsMs)} saved`;
      else if (opp.savingsBytes) savings = `${formatBytes(opp.savingsBytes)} saved`;

      return `<tr>
      <td style="width: 70px;"><span class="score-pill ${scoreClass(opp.score)}">${escapeHtml(scoreLabel(opp))}</span></td>
      <td>
        <div class="audit-title">${escapeHtml(opp.title)}</div>
        <div class="audit-description">${escapeHtml(opp.description)}</div>
      </td>
      <td style="width: 140px; font-weight: 700; color: var(--warn);">${escapeHtml(savings)}</td>
    </tr>`;
    })
    .join('\n');

  return `<h2>Suggested Opportunities</h2>
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Score</th>
          <th>Opportunity</th>
          <th>Estimated Savings</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
};

export const renderMetricsGrid = (cwv) => {
  const items = [
    {
      label: 'FCP',
      val: cwv.fcp.displayValue,
      rating: cwv.fcp.rating,
      name: 'First Contentful Paint',
    },
    {
      label: 'LCP',
      val: cwv.lcp.displayValue,
      rating: cwv.lcp.rating,
      name: 'Largest Contentful Paint',
    },
    {
      label: 'TBT',
      val: cwv.tbt.displayValue,
      rating: cwv.tbt.rating,
      name: 'Total Blocking Time',
    },
    {
      label: 'CLS',
      val: cwv.cls.displayValue,
      rating: cwv.cls.rating,
      name: 'Cumulative Layout Shift',
    },
    { label: 'Speed Index', val: cwv.si.displayValue, rating: cwv.si.rating, name: 'Speed Index' },
  ];

  return `<div class="cwv-grid">
    ${items
      .map(
        (m) => `<div class="cwv-card">
      <div class="cwv-title" title="${escapeHtml(m.name)}">${escapeHtml(m.label)}</div>
      <div class="cwv-value badge-metric ${m.rating}">${escapeHtml(m.val)}</div>
    </div>`,
      )
      .join('\n')}
  </div>`;
};

export const writeSplitReports = (options, report, workspaceRoot = process.cwd()) => {
  if (!options?.splitReports) {
    return null;
  }

  const effectiveRoot = options.workspaceRoot || workspaceRoot;
  const splitReportDir = path.resolve(effectiveRoot, options.splitReportDir);
  if (!options.skipWorkspaceCheck && !isSafeWorkspaceChild(splitReportDir, effectiveRoot)) {
    console.warn(`Skipping split report: directory outside workspace: ${splitReportDir}`);
    return null;
  }

  fs.mkdirSync(splitReportDir, { recursive: true });

  const categories = Object.entries(report.categories || {});
  const cwv = extractCoreWebVitals(report);
  const htmlReportBase = path.basename(options.outputPath) + '.report.html';
  const jsonReportBase = path.basename(options.outputPath) + '.report.json';
  const categoryLinks = [];

  for (const [categoryId, category] of categories) {
    const fileName = `${slugify(categoryId)}.html`;
    const jsonFileName = `${slugify(categoryId)}.json`;
    const auditRows = (category.auditRefs || [])
      .map((ref) => ({ auditRef: ref, audit: report.audits?.[ref.id] }))
      .filter(({ audit }) => Boolean(audit));

    const attentionRows = auditRows
      .filter(({ audit }) => typeof audit.score === 'number' && audit.score < 0.9)
      .sort((a, b) => (a.audit.score ?? 1) - (b.audit.score ?? 1));

    const passedRows = auditRows.filter(
      ({ audit }) => typeof audit.score === 'number' && audit.score >= 0.9,
    );

    const categoryScore = scorePercent(category.score);
    const cls = scoreClass(category.score);

    // Save Category JSON
    const categoryJson = {
      requestedUrl: report.requestedUrl,
      finalUrl: report.finalDisplayedUrl || report.finalUrl,
      fetchTime: report.fetchTime,
      category,
      audits: Object.fromEntries(auditRows.map(({ auditRef, audit }) => [auditRef.id, audit])),
    };

    fs.writeFileSync(
      path.join(splitReportDir, jsonFileName),
      `${JSON.stringify(categoryJson, null, 2)}\n`,
      'utf8',
    );

    // Optional category opportunities for performance
    let extraSection = '';
    if (categoryId === 'performance') {
      const opps = extractOpportunities(report);
      extraSection = renderOpportunitiesTable(opps);
    }

    // Save Category HTML
    fs.writeFileSync(
      path.join(splitReportDir, fileName),
      renderPage({
        title: `${category.title || categoryId} - Lighthouse Report`,
        body: `<header>
          <div>
            <p class="muted"><a href="./index.html">← Back to Overview</a></p>
            <h1>${escapeHtml(category.title || categoryId)}</h1>
            <p class="muted">${escapeHtml(report.finalDisplayedUrl || report.finalUrl || report.requestedUrl || '')}</p>
          </div>
          <div class="score-badge ${cls}">${categoryScore ?? '-'}</div>
        </header>

        <div class="nav-links">
          <a href="./index.html">📊 Overview</a>
          <a href="./${escapeHtml(jsonFileName)}">📄 Category JSON</a>
          <a href="../${escapeHtml(htmlReportBase)}">🌐 Full HTML Report</a>
          <a href="../${escapeHtml(jsonReportBase)}">💾 Full JSON Report</a>
        </div>

        ${categoryId === 'performance' ? `<h2>Core Web Vitals</h2>${renderMetricsGrid(cwv)}` : ''}
        ${extraSection}

        <h2>Needs Attention (${attentionRows.length})</h2>
        ${renderAuditTable(attentionRows)}

        <h2>Passed Audits (${passedRows.length})</h2>
        ${renderAuditTable(passedRows)}`,
      }),
      'utf8',
    );

    categoryLinks.push({
      id: categoryId,
      title: category.title || categoryId,
      score: category.score,
      fileName,
      jsonFileName,
    });
  }

  // Generate Overview Index HTML
  const splitIndexHtml = path.join(splitReportDir, 'index.html');
  const generatedAt = report.fetchTime
    ? new Date(report.fetchTime).toLocaleString()
    : new Date().toLocaleString();

  fs.writeFileSync(
    splitIndexHtml,
    renderPage({
      title: 'Lighthouse Quality Overview',
      body: `<header>
        <div>
          <p class="muted">Generated on ${escapeHtml(generatedAt)}</p>
          <h1>Lighthouse Quality Dashboard</h1>
          <p class="muted">${escapeHtml(report.finalDisplayedUrl || report.finalUrl || report.requestedUrl || '')}</p>
        </div>
      </header>

      <h2>Category Scores</h2>
      <section class="grid">
        ${categoryLinks
          .map((cat) => {
            const pct = scorePercent(cat.score);
            const cls = scoreClass(cat.score);
            return `<a class="card" href="./${escapeHtml(cat.fileName)}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
              <h3 style="font-size: 16px;">${escapeHtml(cat.title)}</h3>
              <span class="score-pill ${cls}">${pct ?? '-'}</span>
            </div>
            <p class="muted" style="margin: 0; font-size: 13px;">View details & audits →</p>
          </a>`;
          })
          .join('\n')}
      </section>

      <h2>Core Web Vitals Summary</h2>
      ${renderMetricsGrid(cwv)}

      <h2>Report Artifacts</h2>
      <div class="nav-links">
        <a href="../${escapeHtml(htmlReportBase)}">🌐 Full Lighthouse HTML</a>
        <a href="../${escapeHtml(jsonReportBase)}">💾 Full Lighthouse JSON</a>
        ${categoryLinks.map((cat) => `<a href="./${escapeHtml(cat.jsonFileName)}">📄 ${escapeHtml(cat.title)} JSON</a>`).join('\n')}
      </div>`,
    }),
    'utf8',
  );

  return splitIndexHtml;
};

// ---------------------------------------------------------------------------
// CLI Argument Parsing & Help
// ---------------------------------------------------------------------------

export const parseArgs = (argv = process.argv.slice(2)) => {
  const options = {
    url: DEFAULT_URL,
    outputPath: DEFAULT_OUTPUT_PATH,
    categories: DEFAULT_CATEGORIES,
    chromeFlags: DEFAULT_CHROME_FLAGS,
    preset: 'mobile',
    splitReports: true,
    splitReportDir: DEFAULT_SPLIT_REPORT_DIR,
    splitExistingReport: false,
    startPreview: true,
    autoBuild: true,
    previewHost: DEFAULT_PREVIEW_HOST,
    previewPort: DEFAULT_PREVIEW_PORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    minScore: null,
    minScorePerformance: null,
    minScoreAccessibility: null,
    minScoreBestPractices: null,
    minScoreSeo: null,
    maxLcp: null,
    maxFcp: null,
    maxTbt: null,
    maxCls: null,
    assertMode: false,
    openReport: false,
    quiet: false,
    showHelp: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.showHelp = true;
      continue;
    }
    if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
      continue;
    }
    if (arg === '--no-preview') {
      options.startPreview = false;
      continue;
    }
    if (arg === '--no-build') {
      options.autoBuild = false;
      continue;
    }
    if (arg === '--build') {
      options.autoBuild = true;
      continue;
    }
    if (arg === '--no-split-report' || arg === '--no-split-reports') {
      options.splitReports = false;
      continue;
    }
    if (arg === '--split-existing-report') {
      options.splitExistingReport = true;
      options.startPreview = false;
      continue;
    }
    if (arg === '--desktop' || arg === '--preset=desktop') {
      options.preset = 'desktop';
      continue;
    }
    if (arg === '--mobile' || arg === '--preset=mobile') {
      options.preset = 'mobile';
      continue;
    }
    if (arg === '--open' || arg === '--view') {
      options.openReport = true;
      continue;
    }
    if (arg === '--assert' || arg === '--ci') {
      options.assertMode = true;
      continue;
    }

    // Value pairs
    const nextVal = argv[i + 1];
    if (arg === '--url' && nextVal) {
      options.url = nextVal;
      i += 1;
    } else if (arg.startsWith('--url=')) {
      options.url = arg.split('=')[1];
    } else if (arg === '--output-path' && nextVal) {
      options.outputPath = nextVal;
      i += 1;
    } else if (arg.startsWith('--output-path=')) {
      options.outputPath = arg.split('=')[1];
    } else if (arg === '--split-report-dir' && nextVal) {
      options.splitReportDir = nextVal;
      i += 1;
    } else if (arg.startsWith('--split-report-dir=')) {
      options.splitReportDir = arg.split('=')[1];
    } else if (arg === '--categories' && nextVal) {
      options.categories = nextVal;
      i += 1;
    } else if (arg.startsWith('--categories=')) {
      options.categories = arg.split('=')[1];
    } else if (arg === '--chrome-flags' && nextVal) {
      options.chromeFlags = nextVal;
      i += 1;
    } else if (arg.startsWith('--chrome-flags=')) {
      options.chromeFlags = arg.split('=')[1];
    } else if (arg === '--preview-host' && nextVal) {
      options.previewHost = nextVal;
      i += 1;
    } else if (arg.startsWith('--preview-host=')) {
      options.previewHost = arg.split('=')[1];
    } else if (arg === '--preview-port' && nextVal) {
      const port = Number.parseInt(nextVal, 10);
      if (Number.isFinite(port) && port > 0) options.previewPort = port;
      i += 1;
    } else if (arg.startsWith('--preview-port=')) {
      const port = Number.parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(port) && port > 0) options.previewPort = port;
    } else if (arg === '--timeout-ms' && nextVal) {
      const timeout = Number.parseInt(nextVal, 10);
      if (Number.isFinite(timeout) && timeout > 0) options.timeoutMs = timeout;
      i += 1;
    } else if (arg.startsWith('--timeout-ms=')) {
      const timeout = Number.parseInt(arg.split('=')[1], 10);
      if (Number.isFinite(timeout) && timeout > 0) options.timeoutMs = timeout;
    } else if (arg.startsWith('--min-score=')) {
      options.minScore = Number.parseInt(arg.split('=')[1], 10);
      options.assertMode = true;
    } else if (arg.startsWith('--min-score-performance=')) {
      options.minScorePerformance = Number.parseInt(arg.split('=')[1], 10);
      options.assertMode = true;
    } else if (arg.startsWith('--min-score-accessibility=')) {
      options.minScoreAccessibility = Number.parseInt(arg.split('=')[1], 10);
      options.assertMode = true;
    } else if (arg.startsWith('--min-score-best-practices=')) {
      options.minScoreBestPractices = Number.parseInt(arg.split('=')[1], 10);
      options.assertMode = true;
    } else if (arg.startsWith('--min-score-seo=')) {
      options.minScoreSeo = Number.parseInt(arg.split('=')[1], 10);
      options.assertMode = true;
    } else if (arg.startsWith('--max-lcp=')) {
      options.maxLcp = Number.parseFloat(arg.split('=')[1]);
      options.assertMode = true;
    } else if (arg.startsWith('--max-fcp=')) {
      options.maxFcp = Number.parseFloat(arg.split('=')[1]);
      options.assertMode = true;
    } else if (arg.startsWith('--max-tbt=')) {
      options.maxTbt = Number.parseFloat(arg.split('=')[1]);
      options.assertMode = true;
    } else if (arg.startsWith('--max-cls=')) {
      options.maxCls = Number.parseFloat(arg.split('=')[1]);
      options.assertMode = true;
    }
  }

  return options;
};

export const printHelp = () => {
  console.log(`
Vault Lighthouse Quality Suite
Usage: node scripts/lighthouse-runner.mjs [options]

Core Options:
  --url <url>                 Target URL to audit (default: ${DEFAULT_URL})
  --output-path <path>        Base path for generated reports (default: ${DEFAULT_OUTPUT_PATH})
  --split-report-dir <dir>    Output directory for modular split reports (default: ${DEFAULT_SPLIT_REPORT_DIR})
  --categories <list>         Comma-separated categories to audit (default: performance,accessibility,best-practices,seo)
  --desktop                   Run Lighthouse with desktop emulation preset
  --mobile                    Run Lighthouse with mobile emulation preset (default)
  --no-preview                Skip starting local Vite preview server
  --no-build                  Skip auto-building if build folder is missing
  --no-split-report           Disable generating modular HTML/JSON split reports
  --split-existing-report     Re-generate split reports from an existing JSON report without re-running Lighthouse
  --open, --view              Open the generated overview report in the default browser upon completion
  --chrome-flags <flags>      Custom flags passed to the Chromium process
  --timeout-ms <ms>           Maximum wait time for preview server readiness (default: 30000ms)

CI & Quality Gate Assertions:
  --assert, --ci              Enable assertion mode (fails with exit code 1 if thresholds are violated)
  --min-score=<0-100>         Minimum score required for all categories
  --min-score-performance=<N> Minimum performance score
  --min-score-accessibility=<N> Minimum accessibility score
  --min-score-best-practices=<N> Minimum best-practices score
  --min-score-seo=<N>         Minimum SEO score
  --max-lcp=<ms>              Maximum allowed Largest Contentful Paint (e.g. --max-lcp=2500)
  --max-fcp=<ms>              Maximum allowed First Contentful Paint (e.g. --max-fcp=1800)
  --max-tbt=<ms>              Maximum allowed Total Blocking Time (e.g. --max-tbt=200)
  --max-cls=<score>           Maximum allowed Cumulative Layout Shift (e.g. --max-cls=0.1)

Help & Output:
  --quiet, -q                 Suppress non-essential progress output
  --help, -h                  Display this help message
`);
};

// ---------------------------------------------------------------------------
// Terminal Reporter
// ---------------------------------------------------------------------------

export const printTerminalReport = (report, assertionResult, options) => {
  const categories = report?.categories || {};
  const cwv = extractCoreWebVitals(report);

  const reset = '\x1b[0m';
  const bold = '\x1b[1m';
  const dim = '\x1b[90m';

  console.log(`\n${bold}==========================================${reset}`);
  console.log(`${bold}         LIGHTHOUSE AUDIT RESULTS         ${reset}`);
  console.log(`${bold}==========================================${reset}\n`);

  console.log(`${bold}Categories:${reset}`);
  for (const [id, cat] of Object.entries(categories)) {
    const score = scorePercent(cat.score);
    const color = scoreColor(cat.score);
    const bar = score != null ? '█'.repeat(Math.round(score / 10)) : '';
    console.log(
      `  ${cat.title.padEnd(16)} : ${color}${bold}${String(score ?? '-').padStart(3)}/100${reset} ${dim}${bar}${reset}`,
    );
  }

  console.log(`\n${bold}Core Web Vitals:${reset}`);
  const printMetric = (m) => {
    const col = m.rating === 'good' ? '\x1b[32m' : m.rating === 'warn' ? '\x1b[33m' : '\x1b[31m';
    console.log(`  ${m.name.padEnd(26)} : ${col}${bold}${m.displayValue}${reset}`);
  };

  printMetric(cwv.fcp);
  printMetric(cwv.lcp);
  printMetric(cwv.tbt);
  printMetric(cwv.cls);
  printMetric(cwv.si);

  if (assertionResult && assertionResult.assertionsCount > 0) {
    console.log(`\n${bold}Quality Gate Assertions:${reset}`);
    for (const passMsg of assertionResult.passes) {
      console.log(`  \x1b[32m✓\x1b[0m ${passMsg}`);
    }
    for (const failMsg of assertionResult.failures) {
      console.log(`  \x1b[31m✗\x1b[0m ${failMsg}`);
    }
  }

  console.log(`\n${bold}Generated Artifacts:${reset}`);
  const htmlPath = `${options.outputPath}.report.html`;
  const jsonPath = `${options.outputPath}.report.json`;
  console.log(`  HTML Report : ${htmlPath}`);
  console.log(`  JSON Report : ${jsonPath}`);
  if (options.splitReports) {
    console.log(`  Split Report: ${path.join(options.splitReportDir, 'index.html')}`);
  }
  console.log();
};

export const openReportFile = (filePath) => {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) return;

  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  try {
    if (isWin) {
      spawn('cmd.exe', ['/c', 'start', '""', resolved], { detached: true, stdio: 'ignore' });
    } else if (isMac) {
      spawn('open', [resolved], { detached: true, stdio: 'ignore' });
    } else {
      spawn('xdg-open', [resolved], { detached: true, stdio: 'ignore' });
    }
  } catch {
    // ignore open failure
  }
};

// ---------------------------------------------------------------------------
// Main Runner Orchestration
// ---------------------------------------------------------------------------

export const run = async (customOptions = null) => {
  const options = customOptions ? { ...parseArgs([]), ...customOptions } : parseArgs();

  if (options.showHelp) {
    printHelp();
    return { status: 'help' };
  }

  const root = process.cwd();
  const reportBase = path.resolve(root, options.outputPath);
  const reportDir = path.dirname(reportBase);
  const htmlReportPath = `${reportBase}.report.html`;
  const jsonReportPath = `${reportBase}.report.json`;
  const splitReportDir = path.resolve(root, options.splitReportDir);

  fs.mkdirSync(reportDir, { recursive: true });

  // Mode: Split existing report only
  if (options.splitExistingReport) {
    if (!fs.existsSync(jsonReportPath)) {
      throw new Error(`Cannot split report: JSON file not found at ${jsonReportPath}`);
    }
    const raw = fs.readFileSync(jsonReportPath, 'utf8');
    const parsed = JSON.parse(raw);
    const splitIndex = writeSplitReports(options, parsed);
    const assertionResult = evaluateAssertions(parsed, options);
    printTerminalReport(parsed, assertionResult, options);
    if (options.openReport && splitIndex) {
      openReportFile(splitIndex);
    }
    return { status: 'success', report: parsed, assertionResult };
  }

  // Clean old outputs
  for (const file of [htmlReportPath, jsonReportPath]) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // ignore
    }
  }

  if (options.splitReports && isSafeWorkspaceChild(splitReportDir)) {
    try {
      fs.rmSync(splitReportDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  let preview = null;
  let managedChrome = null;
  let previewClosed = false;

  // Global exit cleanup hooks
  const cleanupAll = async () => {
    if (managedChrome) {
      try {
        await managedChrome.stop();
      } catch {
        // ignore
      }
      managedChrome = null;
    }
    if (preview && !previewClosed) {
      try {
        preview.kill('SIGTERM');
        terminateProcessTree(preview.pid);
      } catch {
        // ignore
      }
      previewClosed = true;
    }
  };

  const handleInterrupt = async () => {
    await cleanupAll();
    process.exit(130);
  };

  process.once('SIGINT', handleInterrupt);
  process.once('SIGTERM', handleInterrupt);

  try {
    cleanupStaleLighthouseTempDirectories();

    // 1. Build step if needed
    if (options.startPreview && options.autoBuild) {
      ensureProductionBuild(root);
    }

    // 2. Start Preview Server
    if (options.startPreview) {
      const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
      const isWin = process.platform === 'win32';
      const nodeBin = process.execPath;

      preview = spawn(
        nodeBin,
        [
          viteBin,
          'preview',
          '--host',
          options.previewHost,
          '--port',
          String(options.previewPort),
          '--strictPort',
        ],
        {
          cwd: root,
          stdio: 'ignore',
          windowsHide: true,
          env: getSanitizedProcessEnv(),
        },
      );

      preview.on('close', () => {
        previewClosed = true;
      });

      if (!options.quiet) {
        console.log(`🚀 Starting Vite preview server at ${options.url}...`);
      }
    }

    await waitForServer(options.url, options.timeoutMs, preview);

    // 3. Launch Managed Chrome (all platforms for clean port control & reliability)
    managedChrome = await launchManagedChrome({
      chromeFlags: options.chromeFlags,
      timeoutMs: options.timeoutMs,
    });

    // 4. Run Lighthouse CLI
    const resolveReportPath = (base, ext) => {
      const reportCandidate = `${base}.report.${ext}`;
      if (fs.existsSync(reportCandidate)) return reportCandidate;
      const directCandidate = `${base}.${ext}`;
      if (fs.existsSync(directCandidate)) return directCandidate;
      return reportCandidate;
    };

    const hasValidReports = () => {
      const html = resolveReportPath(reportBase, 'html');
      const json = resolveReportPath(reportBase, 'json');
      return fs.existsSync(html) && fs.existsSync(json);
    };

    const executeLighthouse = (flags, useManagedChrome = true) => {
      const runner = resolveNpxRunner();

      const args = [
        ...runner.prefixArgs,
        '--yes',
        'lighthouse',
        options.url,
        `--only-categories=${options.categories}`,
        '--output=html',
        '--output=json',
        `--output-path=${reportBase}`,
        '--no-enable-error-reporting',
      ];

      if (useManagedChrome && managedChrome) {
        args.push(`--port=${managedChrome.debugPort}`);
      } else {
        args.push(`--chrome-flags=${flags}`);
      }

      if (options.preset === 'desktop') {
        args.push('--preset=desktop');
      }

      if (!options.quiet) {
        console.log(`🔍 Running Lighthouse audit (${options.preset} mode)...`);
      }

      const result = spawnSync(runner.command, args, {
        cwd: root,
        stdio: options.quiet ? 'ignore' : 'inherit',
        ...runner.options,
        env: getSanitizedProcessEnv(),
      });

      if (result.error && !options.quiet) {
        console.warn(`⚠️ Lighthouse invocation notice:`, result.error.message);
      }

      return result.status ?? 1;
    };

    let exitCode = executeLighthouse(options.chromeFlags, true);

    // Fallback retry 1: managed Chrome with fallback flags
    if (exitCode !== 0 && !hasValidReports()) {
      if (!options.quiet) {
        console.warn(
          '⚠️ First Lighthouse pass encountered an issue. Retrying with fallback flags...',
        );
      }
      exitCode = executeLighthouse(FALLBACK_CHROME_FLAGS, true);
    }

    // Fallback retry 2: standalone Chrome flags if port connection had issues
    if (exitCode !== 0 && !hasValidReports()) {
      if (!options.quiet) {
        console.warn('⚠️ Retrying with standalone browser launch...');
      }
      exitCode = executeLighthouse(FALLBACK_CHROME_FLAGS, false);
    }

    const finalHtmlPath = resolveReportPath(reportBase, 'html');
    const finalJsonPath = resolveReportPath(reportBase, 'json');

    if (!fs.existsSync(finalHtmlPath) || !fs.existsSync(finalJsonPath)) {
      throw new Error(`Lighthouse failed to generate output reports at ${reportBase}`);
    }

    // 5. Generate Split Reports & Summarize
    const raw = fs.readFileSync(finalJsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    const splitIndex = writeSplitReports(options, parsed);
    const assertionResult = evaluateAssertions(parsed, options);

    if (!options.quiet) {
      printTerminalReport(parsed, assertionResult, options);
    }

    if (options.openReport) {
      openReportFile(splitIndex || finalHtmlPath);
    }

    if (options.assertMode && !assertionResult.passed) {
      process.exitCode = 1;
    } else if (exitCode !== 0 && !hasValidReports()) {
      process.exitCode = exitCode;
    }

    return {
      status: 'success',
      report: parsed,
      assertionResult,
      htmlReportPath: finalHtmlPath,
      jsonReportPath: finalJsonPath,
      splitIndex,
    };
  } finally {
    process.removeListener('SIGINT', handleInterrupt);
    process.removeListener('SIGTERM', handleInterrupt);
    await cleanupAll();
  }
};

// ---------------------------------------------------------------------------
// CLI Direct Execution Detection
// ---------------------------------------------------------------------------

const isDirectExecution = () => {
  if (process.argv[1]) {
    try {
      const currentFilePath = fileURLToPath(import.meta.url);
      return path.resolve(process.argv[1]) === path.resolve(currentFilePath);
    } catch {
      return false;
    }
  }
  return false;
};

if (isDirectExecution()) {
  run().catch((error) => {
    console.error(
      `\n❌ Lighthouse Runner Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}
