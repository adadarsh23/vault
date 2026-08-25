/**
 * @file scripts/open-report.mjs
 * Production-ready, secure, cross-platform report opener for Vault.
 * Supports Windows, macOS, Linux, and WSL with CI/headless detection and safe spawn execution.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Diagnostic hints for common Vault project reports
export const KNOWN_REPORT_HINTS = {
  'stats.html': "Run 'npm run build:analyze' to generate the bundle visualizer report.",
  'coverage/index.html': "Run 'npm run test:coverage' to generate test coverage reports.",
  'lighthouse/report-split/index.html':
    "Run 'npm run lighthouse' or 'npm run lighthouse:split' to generate Lighthouse audit reports.",
  'lighthouse/report.report.html': "Run 'npm run lighthouse' to generate Lighthouse audit reports.",
  '.memory/index.html':
    "Run 'npm run memory:all' or 'npm run memory:visual' to generate code memory visualizer.",
  'playwright-report/index.html': "Run 'npm run test:e2e' to generate Playwright test reports.",
};

/**
 * Detects whether the current environment is CI, Headless, or configured to not open a browser.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {Record<string, any>} [options]
 * @returns {boolean}
 */
export const isCiOrHeadless = (env = process.env, options = {}) => {
  if (options.ci || options.headless || options.noOpen || options.printOnly) {
    return true;
  }

  const isCi = Boolean(
    env.CI ||
    env.CONTINUOUS_INTEGRATION ||
    env.BUILD_ID ||
    env.BUILD_NUMBER ||
    env.TEAMCITY_VERSION ||
    env.TRAVIS ||
    env.CIRCLECI ||
    env.GITHUB_ACTIONS ||
    env.GITLAB_CI ||
    env.BITBUCKET_BUILD_NUMBER ||
    env.TF_BUILD,
  );

  const isHeadless =
    env.HEADLESS === '1' ||
    env.HEADLESS === 'true' ||
    env.NO_OPEN === '1' ||
    env.NO_OPEN === 'true' ||
    env.OPEN_REPORT === '0' ||
    env.OPEN_REPORT === 'false' ||
    env.BROWSER === 'none' ||
    env.NODE_ENV === 'test';

  return isCi || isHeadless;
};

/**
 * Detects whether the environment is running inside Windows Subsystem for Linux (WSL).
 * @returns {boolean}
 */
export const isWsl = () => {
  if (process.platform !== 'linux') {
    return false;
  }
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    return true;
  }
  try {
    const release = os.release().toLowerCase();
    return release.includes('microsoft') || release.includes('wsl');
  } catch {
    return false;
  }
};

/**
 * Resolves and validates a target path or URL.
 * @param {string} target
 * @param {string} [baseDir]
 * @returns {{ raw: string, isUrl: boolean, resolved: string, exists: boolean, displayPath: string }}
 */
export const resolveTarget = (target, baseDir = process.cwd()) => {
  if (!target || typeof target !== 'string') {
    return {
      raw: '',
      isUrl: false,
      resolved: '',
      exists: false,
      displayPath: '',
    };
  }

  const trimmed = target.trim();
  const isHttpOrHttps = trimmed.startsWith('http://') || trimmed.startsWith('https://');
  const isFileUrl = trimmed.startsWith('file://');

  if (isHttpOrHttps) {
    return {
      raw: trimmed,
      isUrl: true,
      resolved: trimmed,
      exists: true,
      displayPath: trimmed,
    };
  }

  let localPath;
  if (isFileUrl) {
    try {
      localPath = fileURLToPath(trimmed);
    } catch {
      localPath = trimmed.replace(/^file:\/\//, '');
    }
  } else {
    localPath = path.isAbsolute(trimmed) ? trimmed : path.resolve(baseDir, trimmed);
  }

  const exists = fs.existsSync(localPath);
  const relPath = path.relative(baseDir, localPath);
  const displayPath = !relPath.startsWith('..') && !path.isAbsolute(relPath) ? relPath : localPath;

  return {
    raw: trimmed,
    isUrl: false,
    resolved: localPath,
    exists,
    displayPath,
  };
};

/**
 * Retrieves a helpful diagnostic hint for known report files.
 * @param {string} targetPath
 * @param {string} [baseDir]
 * @returns {string | null}
 */
export const getReportHint = (targetPath, baseDir = process.cwd()) => {
  if (!targetPath) return null;
  const normalized = targetPath.replace(/\\/g, '/');

  for (const [reportKey, hint] of Object.entries(KNOWN_REPORT_HINTS)) {
    if (normalized.endsWith(reportKey) || normalized === reportKey) {
      return hint;
    }
  }
  return null;
};

/**
 * Returns the platform-specific command and arguments to safely open a file or URL.
 * Avoids shell string interpolation vulnerabilities by using structured spawn arguments.
 * @param {string} target
 * @param {NodeJS.Platform} [platform]
 * @param {boolean} [isWslEnvironment]
 * @param {string | null} [browser]
 * @returns {{ cmd: string, args: string[], windowsVerbatimArguments?: boolean, fallbackCmd?: string, fallbackArgs?: string[] }}
 */
export const getOpenCommand = (
  target,
  platform = process.platform,
  isWslEnvironment = isWsl(),
  browser = null,
) => {
  const normalizedBrowser = typeof browser === 'string' ? browser.trim().toLowerCase() : null;

  if (platform === 'win32') {
    if (normalizedBrowser) {
      const winApp =
        normalizedBrowser === 'chrome' || normalizedBrowser === 'google-chrome'
          ? 'chrome'
          : normalizedBrowser === 'edge' || normalizedBrowser === 'msedge'
            ? 'msedge'
            : normalizedBrowser === 'firefox'
              ? 'firefox'
              : normalizedBrowser === 'brave'
                ? 'brave'
                : normalizedBrowser;

      return {
        cmd: 'cmd.exe',
        args: ['/c', 'start', winApp, target],
        windowsVerbatimArguments: true,
      };
    }

    return {
      cmd: 'cmd.exe',
      args: ['/c', 'start', '""', target],
      windowsVerbatimArguments: true,
    };
  }

  if (platform === 'darwin') {
    if (normalizedBrowser) {
      const macApp =
        normalizedBrowser === 'chrome' || normalizedBrowser === 'google-chrome'
          ? 'Google Chrome'
          : normalizedBrowser === 'edge' || normalizedBrowser === 'msedge'
            ? 'Microsoft Edge'
            : normalizedBrowser === 'firefox'
              ? 'Firefox'
              : normalizedBrowser === 'safari'
                ? 'Safari'
                : normalizedBrowser === 'brave'
                  ? 'Brave Browser'
                  : browser;

      return {
        cmd: 'open',
        args: ['-a', macApp, target],
        windowsVerbatimArguments: false,
      };
    }

    return {
      cmd: 'open',
      args: [target],
      windowsVerbatimArguments: false,
    };
  }

  if (isWslEnvironment) {
    if (normalizedBrowser) {
      const winApp =
        normalizedBrowser === 'chrome' || normalizedBrowser === 'google-chrome'
          ? 'chrome'
          : normalizedBrowser === 'edge' || normalizedBrowser === 'msedge'
            ? 'msedge'
            : normalizedBrowser === 'firefox'
              ? 'firefox'
              : normalizedBrowser;

      return {
        cmd: 'cmd.exe',
        args: ['/c', 'start', winApp, target],
        windowsVerbatimArguments: true,
        fallbackCmd: 'powershell.exe',
        fallbackArgs: [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Start-Process ${winApp} "${target}"`,
        ],
      };
    }

    return {
      cmd: 'wslview',
      args: [target],
      windowsVerbatimArguments: false,
      fallbackCmd: 'powershell.exe',
      fallbackArgs: ['-NoProfile', '-NonInteractive', '-Command', `Start-Process "${target}"`],
    };
  }

  // Linux / Unix / BSD default
  if (normalizedBrowser) {
    const linuxCmd =
      normalizedBrowser === 'chrome' || normalizedBrowser === 'google-chrome'
        ? 'google-chrome'
        : normalizedBrowser === 'edge' || normalizedBrowser === 'msedge'
          ? 'microsoft-edge'
          : normalizedBrowser === 'firefox'
            ? 'firefox'
            : normalizedBrowser === 'brave'
              ? 'brave-browser'
              : normalizedBrowser === 'chromium'
                ? 'chromium'
                : normalizedBrowser;

    const fallbackLinux =
      linuxCmd === 'google-chrome'
        ? 'google-chrome-stable'
        : linuxCmd === 'chromium'
          ? 'chromium-browser'
          : 'xdg-open';

    return {
      cmd: linuxCmd,
      args: [target],
      windowsVerbatimArguments: false,
      fallbackCmd: fallbackLinux,
      fallbackArgs: [target],
    };
  }

  return {
    cmd: 'xdg-open',
    args: [target],
    windowsVerbatimArguments: false,
  };
};

/**
 * Main report opener function.
 * @param {string} targetInput
 * @param {Record<string, any>} [options]
 * @returns {Promise<{ success: boolean, opened: boolean, reason: string, message: string, hint?: string | null, target?: any, error?: string }>}
 */
export const openReport = async (targetInput, options = {}) => {
  const {
    baseDir = process.cwd(),
    env = process.env,
    platform = process.platform,
    browser = options.browser || (env.BROWSER && env.BROWSER !== 'none' ? env.BROWSER : null),
    quiet = false,
    printOnly = false,
    spawnFn = spawn,
  } = options;

  if (!targetInput) {
    return {
      success: false,
      opened: false,
      reason: 'MISSING_TARGET',
      message: 'No report target specified.',
    };
  }

  const targetInfo = resolveTarget(targetInput, baseDir);

  // If local file does not exist
  if (!targetInfo.isUrl && !targetInfo.exists) {
    const hint = getReportHint(targetInfo.resolved, baseDir);
    const message = `Target report does not exist yet: ${targetInfo.displayPath || targetInfo.resolved}`;

    if (!quiet) {
      console.warn(`[WARN] ${message}`);
      if (hint) {
        console.warn(`[HINT] ${hint}`);
      }
    }

    return {
      success: false,
      opened: false,
      reason: 'NOT_FOUND',
      message,
      hint,
      target: targetInfo,
    };
  }

  // Check if CI or Headless environment
  if (isCiOrHeadless(env, options) || printOnly) {
    const message = `[CI/Headless] Report available at: ${targetInfo.resolved}`;
    if (!quiet) {
      console.log(message);
    }
    return {
      success: true,
      opened: false,
      reason: 'HEADLESS_ENV',
      message,
      target: targetInfo,
    };
  }

  const openConfig = getOpenCommand(
    targetInfo.resolved,
    platform,
    options.isWsl ?? isWsl(),
    browser,
  );

  return new Promise((resolve) => {
    let isResolved = false;

    const trySpawn = (cmd, args, windowsVerbatimArguments, isFallback = false) => {
      try {
        const child = spawnFn(cmd, args, {
          detached: true,
          stdio: 'ignore',
          windowsVerbatimArguments,
        });

        child.on('error', (err) => {
          if (!isFallback && openConfig.fallbackCmd) {
            trySpawn(openConfig.fallbackCmd, openConfig.fallbackArgs || [], false, true);
            return;
          }

          if (!isResolved) {
            isResolved = true;
            if (!quiet) {
              console.log(`Report available at: ${targetInfo.resolved}`);
            }
            resolve({
              success: true,
              opened: false,
              reason: 'SPAWN_ERROR',
              error: err.message,
              message: `Report available at: ${targetInfo.resolved}`,
              target: targetInfo,
            });
          }
        });

        // Detach child process so Node process can exit immediately
        child.unref();

        setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            if (!quiet) {
              console.log(`Opened report: ${targetInfo.displayPath || targetInfo.resolved}`);
            }
            resolve({
              success: true,
              opened: true,
              reason: 'OPENED',
              message: `Opened report: ${targetInfo.displayPath || targetInfo.resolved}`,
              target: targetInfo,
            });
          }
        }, 100);
      } catch (err) {
        if (!isResolved) {
          isResolved = true;
          if (!quiet) {
            console.log(`Report available at: ${targetInfo.resolved}`);
          }
          resolve({
            success: true,
            opened: false,
            reason: 'EXECUTION_ERROR',
            error: err.message,
            message: `Report available at: ${targetInfo.resolved}`,
            target: targetInfo,
          });
        }
      }
    };

    trySpawn(openConfig.cmd, openConfig.args, openConfig.windowsVerbatimArguments);
  });
};

/**
 * Parses command line arguments.
 * @param {string[]} [argv]
 * @returns {Record<string, any>}
 */
export const parseCliArgs = (argv = process.argv.slice(2)) => {
  const options = {
    target: null,
    browser: null,
    quiet: false,
    noOpen: false,
    printOnly: false,
    headless: false,
    json: false,
    help: false,
  };

  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '-q' || arg === '--quiet' || arg === '--silent') {
      options.quiet = true;
    } else if (arg === '--no-open') {
      options.noOpen = true;
    } else if (arg === '--print-only') {
      options.printOnly = true;
    } else if (arg === '--headless') {
      options.headless = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--chrome' || arg === '-c') {
      options.browser = 'chrome';
    } else if (arg.startsWith('--browser=')) {
      options.browser = arg.slice('--browser='.length).trim();
    } else if (arg === '--browser' || arg === '-b') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        options.browser = argv[++i].trim();
      }
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    options.target = positional[0];
  }

  return options;
};

/**
 * Displays user help manual.
 */
export const showHelp = () => {
  console.log(`
Vault Report Opener
Production-ready cross-platform report viewer.

Usage:
  node scripts/open-report.mjs <file-or-url> [options]
  npm run stats
  npm run stats:chrome
  npm run test:coverage:open
  npm run lighthouse:open
  npm run memory:open

Arguments:
  <file-or-url>          Path to the HTML report file or HTTP(S) URL to open

Options:
  -h, --help             Show this help screen
  -c, --chrome           Open specifically in Google Chrome
  -b, --browser <name>   Open in specified browser (e.g. chrome, firefox, edge, brave, safari)
  -q, --quiet, --silent  Suppress output messages
  --no-open              Print report location without launching browser
  --print-only           Alias for --no-open
  --headless             Simulate headless/CI environment
  --json                 Output result in structured JSON format

Environment Variables:
  CI=1                   Skips browser launch and logs report path
  HEADLESS=1             Skips browser launch (useful for automated scripts)
  NO_OPEN=1              Skips browser launch
  OPEN_REPORT=0          Disables automatic report opening
  BROWSER=chrome         Default browser to open reports with
  BROWSER=none           Prevents browser launch

Common Reports:
  stats.html                        Bundle visualizer report (npm run build:analyze)
  coverage/index.html               Vitest coverage report (npm run test:coverage)
  lighthouse/report-split/index.html Lighthouse audit report (npm run lighthouse)
  .memory/index.html                Code memory graph (npm run memory:visual)
`);
};

/**
 * CLI execution entrypoint.
 * @param {string[]} [argv]
 */
export const runOpenReportCli = async (argv = process.argv.slice(2)) => {
  const options = parseCliArgs(argv);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (!options.target) {
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            success: false,
            reason: 'MISSING_TARGET',
            message: 'No target specified.',
          },
          null,
          2,
        ),
      );
    } else {
      console.log('Usage: node scripts/open-report.mjs <file-or-url-path> [options]');
      console.log('Use --help to see all available options.');
    }
    process.exit(0);
  }

  const result = await openReport(options.target, {
    browser: options.browser,
    quiet: options.quiet || options.json,
    noOpen: options.noOpen,
    printOnly: options.printOnly,
    headless: options.headless,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  }

  process.exit(0);
};

export const isDirectExecution = () => {
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
  runOpenReportCli();
}
