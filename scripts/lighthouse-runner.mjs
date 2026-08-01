import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import net from 'node:net';

const root = process.cwd();
const DEFAULT_URL = 'http://127.0.0.1:4173/';
const DEFAULT_OUTPUT_PATH = './lighthouse/report';
const DEFAULT_SPLIT_REPORT_DIR = './lighthouse/report-split';
const DEFAULT_CATEGORIES = 'performance,accessibility,best-practices,seo';
const DEFAULT_CHROME_FLAGS =
  '--headless=new --no-sandbox --disable-dev-shm-usage --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding';
const FALLBACK_CHROME_FLAGS =
  '--headless --no-sandbox --disable-dev-shm-usage --disable-gpu --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding';

const ensureWindowsSystem32OnPath = () => {
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

const runtimePath = ensureWindowsSystem32OnPath();

const removeTempDirectorySafely = (directoryPath, retries = 4) => {
  if (!directoryPath) {
    return;
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      fs.rmSync(directoryPath, { recursive: true, force: true });
      return;
    } catch (error) {
      const isEperm =
        error && typeof error === 'object' && 'code' in error && error.code === 'EPERM';
      const isLastAttempt = attempt === retries;
      if (!isEperm || isLastAttempt) {
        return;
      }
      // Try a few times because antivirus/file locks can briefly hold these dirs.
    }
  }
};

const cleanupStaleLighthouseTempDirectories = () => {
  const tempRoot = os.tmpdir();
  let entries = [];

  try {
    entries = fs.readdirSync(tempRoot, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('lighthouse.')) {
      continue;
    }

    const fullPath = path.join(tempRoot, entry.name);
    removeTempDirectorySafely(fullPath);
  }
};

const getAvailablePort = (host = '127.0.0.1') =>
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

const splitChromeFlags = (flags) =>
  String(flags || '')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

const resolveChromeExecutablePath = () => {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');

  const candidates = [
    process.env.LIGHTHOUSE_CHROMIUM_PATH,
    process.env.CHROME_PATH,
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'Could not locate a Chromium executable. Set CHROME_PATH or LIGHTHOUSE_CHROMIUM_PATH.'
  );
};

const launchManagedChrome = async (chromeFlags) => {
  const debugPort = await getAvailablePort('127.0.0.1');
  const executablePath = resolveChromeExecutablePath();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lighthouse-managed-'));

  const args = splitChromeFlags(chromeFlags)
    .filter((flag) => !flag.startsWith('--remote-debugging-port='))
    .filter((flag) => !flag.startsWith('--user-data-dir='));
  if (!args.some((flag) => flag.startsWith('--headless'))) {
    args.push('--headless=new');
  }

  args.push(`--user-data-dir=${userDataDir}`);
  args.push(`--remote-debugging-port=${debugPort}`);
  args.push('about:blank');

  const chromeProcess = spawn(executablePath, args, {
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      PATH: runtimePath,
    },
  });

  let exited = false;
  chromeProcess.on('exit', () => {
    exited = true;
  });

  await waitForServer(`http://127.0.0.1:${debugPort}/json/version`, 15000);

  const stop = async () => {
    const pid = chromeProcess.pid;

    if (!exited) {
      try {
        chromeProcess.kill('SIGTERM');
      } catch {
        // ignore cleanup errors
      }
    }

    if (process.platform === 'win32' && pid) {
      try {
        execSync(`taskkill /pid ${pid} /T /F`, {
          stdio: 'ignore',
          windowsHide: true,
          env: {
            ...process.env,
            PATH: runtimePath,
          },
        });
      } catch {
        // ignore cleanup errors
      }
    }

    removeTempDirectorySafely(userDataDir);
  };

  return { debugPort, stop };
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {
    url: DEFAULT_URL,
    outputPath: DEFAULT_OUTPUT_PATH,
    categories: DEFAULT_CATEGORIES,
    chromeFlags: DEFAULT_CHROME_FLAGS,
    splitReports: true,
    splitReportDir: DEFAULT_SPLIT_REPORT_DIR,
    splitExistingReport: false,
    startPreview: true,
    previewHost: '127.0.0.1',
    previewPort: 4173,
    timeoutMs: 30000,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--no-preview') {
      options.startPreview = false;
      continue;
    }
    if (arg === '--no-split-report') {
      options.splitReports = false;
      continue;
    }
    if (arg === '--split-existing-report') {
      options.splitExistingReport = true;
      options.startPreview = false;
      continue;
    }
    if (arg === '--url' && args[i + 1]) {
      options.url = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--output-path' && args[i + 1]) {
      options.outputPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--split-report-dir' && args[i + 1]) {
      options.splitReportDir = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--categories' && args[i + 1]) {
      options.categories = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--chrome-flags' && args[i + 1]) {
      options.chromeFlags = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--preview-host' && args[i + 1]) {
      options.previewHost = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--preview-port' && args[i + 1]) {
      const parsed = Number.parseInt(args[i + 1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.previewPort = parsed;
      }
      i += 1;
      continue;
    }
    if (arg === '--timeout-ms' && args[i + 1]) {
      const parsed = Number.parseInt(args[i + 1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.timeoutMs = parsed;
      }
      i += 1;
    }
  }

  return options;
};

const options = parseArgs();
const reportBase = path.resolve(root, options.outputPath);
const reportDir = path.dirname(reportBase);
const htmlReportPath = `${reportBase}.report.html`;
const jsonReportPath = `${reportBase}.report.json`;
const splitReportDir = path.resolve(root, options.splitReportDir);
const splitReportIndexPath = path.join(splitReportDir, 'index.html');

fs.mkdirSync(reportDir, { recursive: true });
if (!options.splitExistingReport) {
  for (const file of [htmlReportPath, jsonReportPath]) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

const isSafeWorkspaceChild = (targetPath) => {
  const relative = path.relative(root, targetPath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
};

if (options.splitReports && !options.splitExistingReport && isSafeWorkspaceChild(splitReportDir)) {
  try {
    fs.rmSync(splitReportDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

const waitForServer = (url, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const start = Date.now();

    const tryRequest = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve(true);
          return;
        }
        retry();
      });

      req.on('error', retry);
      req.setTimeout(2500, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Preview server did not start within ${timeoutMs}ms`));
        return;
      }
      setTimeout(tryRequest, 500);
    };

    tryRequest();
  });

const shellQuote = (value) => {
  if (process.platform === 'win32') {
    return `"${String(value).replace(/"/g, '\\"')}"`;
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const stripMarkdownLinks = (value) => String(value ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

const slugify = (value) =>
  String(value ?? 'report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'report';

const scorePercent = (score) => {
  if (typeof score !== 'number') {
    return null;
  }
  return Math.round(score * 100);
};

const scoreClass = (score) => {
  if (typeof score !== 'number') {
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

const scoreLabel = (audit) => {
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
  return percent === null ? '-' : String(percent);
};

const getAuditRows = (report, category) =>
  (category.auditRefs || [])
    .map((auditRef) => ({
      auditRef,
      audit: report.audits?.[auditRef.id],
    }))
    .filter(({ audit }) => audit);

const renderPage = ({ title, body }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f7f7f8;
      --panel: #ffffff;
      --text: #1f2328;
      --muted: #59636e;
      --border: #d0d7de;
      --pass: #1a7f37;
      --warn: #9a6700;
      --fail: #d1242f;
      --na: #6e7781;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #111418;
        --panel: #171b21;
        --text: #f0f3f6;
        --muted: #9ea7b3;
        --border: #30363d;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font: 14px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }
    a { color: inherit; }
    header {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: end;
      justify-content: space-between;
      margin-bottom: 24px;
    }
    h1, h2 { line-height: 1.15; margin: 0; }
    h1 { font-size: clamp(28px, 5vw, 44px); }
    h2 { font-size: 20px; margin-top: 28px; margin-bottom: 12px; }
    .muted { color: var(--muted); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }
    .score {
      display: inline-grid;
      min-width: 54px;
      min-height: 34px;
      place-items: center;
      border-radius: 999px;
      border: 1px solid currentColor;
      font-weight: 700;
    }
    .pass { color: var(--pass); }
    .warn { color: var(--warn); }
    .fail { color: var(--fail); }
    .na { color: var(--na); }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
    }
    tr:last-child td { border-bottom: 0; }
    .audit-title { font-weight: 650; }
    .audit-description { color: var(--muted); margin-top: 4px; }
    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }
    .links a {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 6px 10px;
      text-decoration: none;
      background: var(--panel);
    }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>
`;

const renderAuditTable = (rows) => {
  if (rows.length === 0) {
    return '<p class="muted">No audits in this section.</p>';
  }

  const body = rows
    .map(({ audit }) => {
      const description = stripMarkdownLinks(audit.description || '');
      return `<tr>
      <td><span class="score ${scoreClass(audit.score)}">${escapeHtml(scoreLabel(audit))}</span></td>
      <td>
        <div class="audit-title">${escapeHtml(audit.title || audit.id)}</div>
        ${description ? `<div class="audit-description">${escapeHtml(description)}</div>` : ''}
      </td>
      <td>${escapeHtml(audit.displayValue || '')}</td>
    </tr>`;
    })
    .join('\n');

  return `<table>
    <thead>
      <tr>
        <th>Score</th>
        <th>Audit</th>
        <th>Value</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
};

const writeSplitReports = () => {
  if (!options.splitReports) {
    return null;
  }

  if (!isSafeWorkspaceChild(splitReportDir)) {
    console.warn(
      `Skipping split report because the directory is outside the workspace: ${splitReportDir}`
    );
    return null;
  }

  const report = JSON.parse(fs.readFileSync(jsonReportPath, 'utf8'));
  const categories = Object.entries(report.categories ?? {});

  fs.mkdirSync(splitReportDir, { recursive: true });

  const categoryLinks = [];
  for (const [categoryId, category] of categories) {
    const fileName = `${slugify(categoryId)}.html`;
    const jsonFileName = `${slugify(categoryId)}.json`;
    const rows = getAuditRows(report, category);
    const attentionRows = rows
      .filter(({ audit }) => typeof audit.score === 'number' && audit.score < 0.9)
      .sort((left, right) => (left.audit.score ?? 1) - (right.audit.score ?? 1));
    const categoryScore = scorePercent(category.score);

    const categoryJson = {
      requestedUrl: report.requestedUrl,
      finalUrl: report.finalDisplayedUrl || report.finalUrl,
      fetchTime: report.fetchTime,
      category,
      audits: Object.fromEntries(rows.map(({ auditRef, audit }) => [auditRef.id, audit])),
    };

    fs.writeFileSync(
      path.join(splitReportDir, jsonFileName),
      `${JSON.stringify(categoryJson, null, 2)}\n`,
      'utf8'
    );

    fs.writeFileSync(
      path.join(splitReportDir, fileName),
      renderPage({
        title: `${category.title || categoryId} - Lighthouse`,
        body: `<header>
          <div>
            <p class="muted"><a href="./index.html">Split Lighthouse Report</a></p>
            <h1>${escapeHtml(category.title || categoryId)}</h1>
            <p class="muted">${escapeHtml(report.finalDisplayedUrl || report.finalUrl || report.requestedUrl || '')}</p>
          </div>
          <span class="score ${scoreClass(category.score)}">${categoryScore ?? '-'}</span>
        </header>
        <div class="links">
          <a href="./${escapeHtml(jsonFileName)}">Category JSON</a>
          <a href="../${escapeHtml(path.basename(htmlReportPath))}">Full Lighthouse HTML</a>
          <a href="../${escapeHtml(path.basename(jsonReportPath))}">Full Lighthouse JSON</a>
        </div>
        <h2>Needs Attention</h2>
        ${renderAuditTable(attentionRows)}
        <h2>All Audits</h2>
        ${renderAuditTable(rows)}`,
      }),
      'utf8'
    );

    categoryLinks.push({
      id: categoryId,
      title: category.title || categoryId,
      score: category.score,
      fileName,
      jsonFileName,
    });
  }

  const generatedAt = report.fetchTime
    ? new Date(report.fetchTime).toLocaleString()
    : new Date().toLocaleString();

  fs.writeFileSync(
    splitReportIndexPath,
    renderPage({
      title: 'Lighthouse Split Report',
      body: `<header>
        <div>
          <p class="muted">Generated ${escapeHtml(generatedAt)}</p>
          <h1>Lighthouse Split Report</h1>
          <p class="muted">${escapeHtml(report.finalDisplayedUrl || report.finalUrl || report.requestedUrl || '')}</p>
        </div>
      </header>
      <section class="grid">
        ${categoryLinks
          .map((category) => {
            const categoryScore = scorePercent(category.score);
            return `<a class="card" href="./${escapeHtml(category.fileName)}">
            <span class="score ${scoreClass(category.score)}">${categoryScore ?? '-'}</span>
            <h2>${escapeHtml(category.title)}</h2>
            <p class="muted">${escapeHtml(category.id)}</p>
          </a>`;
          })
          .join('\n')}
      </section>
      <h2>Artifacts</h2>
      <div class="links">
        <a href="../${escapeHtml(path.basename(htmlReportPath))}">Full Lighthouse HTML</a>
        <a href="../${escapeHtml(path.basename(jsonReportPath))}">Full Lighthouse JSON</a>
        ${categoryLinks.map((category) => `<a href="./${escapeHtml(category.jsonFileName)}">${escapeHtml(category.title)} JSON</a>`).join('\n')}
      </div>`,
    }),
    'utf8'
  );

  return splitReportIndexPath;
};

const printScoreSummary = () => {
  try {
    const raw = fs.readFileSync(jsonReportPath, 'utf8');
    const report = JSON.parse(raw);
    const categories = report?.categories ?? {};
    const score = (key) => Math.round((categories[key]?.score ?? 0) * 100);
    console.log('');
    console.log('Lighthouse scores:');
    console.log(`Performance: ${score('performance')}`);
    console.log(`Accessibility: ${score('accessibility')}`);
    console.log(`Best Practices: ${score('best-practices')}`);
    console.log(`SEO: ${score('seo')}`);
    console.log(`HTML report: ${htmlReportPath}`);
    console.log(`JSON report: ${jsonReportPath}`);
    if (options.splitReports && fs.existsSync(splitReportIndexPath)) {
      console.log(`Split report: ${splitReportIndexPath}`);
    }
  } catch {
    // ignore parse errors
  }
};

const run = async () => {
  if (options.splitExistingReport) {
    if (!fs.existsSync(jsonReportPath)) {
      throw new Error(`Cannot split report because JSON report does not exist: ${jsonReportPath}`);
    }
    writeSplitReports();
    printScoreSummary();
    return;
  }

  let preview = null;
  let managedChrome = null;

  if (options.startPreview) {
    preview = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
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
        env: {
          ...process.env,
          PATH: runtimePath,
        },
      }
    );
  }

  let previewClosed = false;
  preview?.on('close', () => {
    previewClosed = true;
  });

  try {
    cleanupStaleLighthouseTempDirectories();
    await waitForServer(options.url, options.timeoutMs);

    if (process.platform === 'win32') {
      managedChrome = await launchManagedChrome(options.chromeFlags);
    }

    const runLighthouseOnce = async (chromeFlags) => {
      const command = [
        'npm exec -- lighthouse',
        shellQuote(options.url),
        `--only-categories=${shellQuote(options.categories)}`,
        '--output=html',
        '--output=json',
        `--output-path=${shellQuote(reportBase)}`,
        managedChrome
          ? `--port=${managedChrome.debugPort}`
          : `--chrome-flags=${shellQuote(chromeFlags)}`,
        '--no-enable-error-reporting',
      ].join(' ');

      try {
        execSync(command, {
          cwd: root,
          stdio: 'inherit',
          windowsHide: true,
          env: {
            ...process.env,
            PATH: runtimePath,
          },
        });
        return 0;
      } catch {
        return 1;
      }
    };

    let exitCode = await runLighthouseOnce(options.chromeFlags);

    const hasHtml = fs.existsSync(htmlReportPath);
    const hasJson = fs.existsSync(jsonReportPath);
    if (exitCode !== 0 && !(hasHtml && hasJson)) {
      exitCode = await runLighthouseOnce(FALLBACK_CHROME_FLAGS);
    }

    const hasHtmlAfterRetry = fs.existsSync(htmlReportPath);
    const hasJsonAfterRetry = fs.existsSync(jsonReportPath);
    if (hasHtmlAfterRetry && hasJsonAfterRetry) {
      writeSplitReports();
      printScoreSummary();
    }
    if (exitCode !== 0 && !(hasHtmlAfterRetry && hasJsonAfterRetry)) {
      process.exitCode = exitCode;
    }
  } finally {
    if (managedChrome) {
      try {
        await managedChrome.stop();
      } catch {
        // ignore cleanup errors
      }
    }
    if (preview && !previewClosed) {
      try {
        preview.kill('SIGTERM');
      } catch {
        // ignore cleanup errors
      }
    }
  }
};

await run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
