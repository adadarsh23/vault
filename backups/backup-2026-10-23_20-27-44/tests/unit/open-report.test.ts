import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  isCiOrHeadless,
  resolveTarget,
  getReportHint,
  getOpenCommand,
  parseCliArgs,
  openReport,
  showHelp,
} from '../../scripts/open-report.mjs';

describe('open-report utility', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-report-test-'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors in tests
    }
    vi.restoreAllMocks();
  });

  describe('isCiOrHeadless', () => {
    it('returns false for default clean environment', () => {
      expect(isCiOrHeadless({}, {})).toBe(false);
    });

    it('detects standard CI environment variables', () => {
      expect(isCiOrHeadless({ CI: 'true' })).toBe(true);
      expect(isCiOrHeadless({ CONTINUOUS_INTEGRATION: '1' })).toBe(true);
      expect(isCiOrHeadless({ GITHUB_ACTIONS: 'true' })).toBe(true);
      expect(isCiOrHeadless({ GITLAB_CI: 'true' })).toBe(true);
      expect(isCiOrHeadless({ BUILD_ID: '1234' })).toBe(true);
      expect(isCiOrHeadless({ TF_BUILD: '1' })).toBe(true);
    });

    it('detects headless and no-open environment flags', () => {
      expect(isCiOrHeadless({ HEADLESS: '1' })).toBe(true);
      expect(isCiOrHeadless({ HEADLESS: 'true' })).toBe(true);
      expect(isCiOrHeadless({ NO_OPEN: '1' })).toBe(true);
      expect(isCiOrHeadless({ NO_OPEN: 'true' })).toBe(true);
      expect(isCiOrHeadless({ OPEN_REPORT: '0' })).toBe(true);
      expect(isCiOrHeadless({ OPEN_REPORT: 'false' })).toBe(true);
      expect(isCiOrHeadless({ BROWSER: 'none' })).toBe(true);
      expect(isCiOrHeadless({ NODE_ENV: 'test' })).toBe(true);
    });

    it('detects CLI options for CI or headless', () => {
      expect(isCiOrHeadless({}, { ci: true })).toBe(true);
      expect(isCiOrHeadless({}, { headless: true })).toBe(true);
      expect(isCiOrHeadless({}, { noOpen: true })).toBe(true);
      expect(isCiOrHeadless({}, { printOnly: true })).toBe(true);
    });
  });

  describe('resolveTarget', () => {
    it('handles empty or non-string input safely', () => {
      const result = resolveTarget('');
      expect(result.resolved).toBe('');
      expect(result.exists).toBe(false);
      expect(result.isUrl).toBe(false);
    });

    it('resolves HTTP and HTTPS URLs', () => {
      const httpRes = resolveTarget('http://localhost:5173/report');
      expect(httpRes.isUrl).toBe(true);
      expect(httpRes.resolved).toBe('http://localhost:5173/report');
      expect(httpRes.exists).toBe(true);

      const httpsRes = resolveTarget('https://example.com/stats.html');
      expect(httpsRes.isUrl).toBe(true);
      expect(httpsRes.resolved).toBe('https://example.com/stats.html');
      expect(httpsRes.exists).toBe(true);
    });

    it('resolves existing local file paths', () => {
      const dummyFile = path.join(tempDir, 'stats.html');
      fs.writeFileSync(dummyFile, '<html><body>Report</body></html>');

      const result = resolveTarget('stats.html', tempDir);
      expect(result.isUrl).toBe(false);
      expect(result.resolved).toBe(dummyFile);
      expect(result.exists).toBe(true);
      expect(result.displayPath).toBe('stats.html');
    });

    it('identifies non-existent file paths', () => {
      const result = resolveTarget('nonexistent.html', tempDir);
      expect(result.isUrl).toBe(false);
      expect(result.exists).toBe(false);
    });
  });

  describe('getReportHint', () => {
    it('provides tailored hints for known reports', () => {
      expect(getReportHint('stats.html')).toContain('build:analyze');
      expect(getReportHint('coverage/index.html')).toContain('test:coverage');
      expect(getReportHint('lighthouse/report-split/index.html')).toContain('lighthouse');
      expect(getReportHint('.memory/index.html')).toContain('memory');
    });

    it('returns null for unknown reports', () => {
      expect(getReportHint('custom/custom-report.html')).toBeNull();
      expect(getReportHint('')).toBeNull();
    });
  });

  describe('getOpenCommand', () => {
    it('returns cmd.exe on Windows', () => {
      const cmd = getOpenCommand('stats.html', 'win32', false);
      expect(cmd.cmd).toBe('cmd.exe');
      expect(cmd.args).toEqual(['/c', 'start', '""', 'stats.html']);
      expect(cmd.windowsVerbatimArguments).toBe(true);
    });

    it('returns chrome command on Windows when chrome requested', () => {
      const cmd = getOpenCommand('stats.html', 'win32', false, 'chrome');
      expect(cmd.cmd).toBe('cmd.exe');
      expect(cmd.args).toEqual(['/c', 'start', 'chrome', 'stats.html']);
      expect(cmd.windowsVerbatimArguments).toBe(true);
    });

    it('returns open on macOS', () => {
      const cmd = getOpenCommand('stats.html', 'darwin', false);
      expect(cmd.cmd).toBe('open');
      expect(cmd.args).toEqual(['stats.html']);
    });

    it('returns Google Chrome on macOS when chrome requested', () => {
      const cmd = getOpenCommand('stats.html', 'darwin', false, 'chrome');
      expect(cmd.cmd).toBe('open');
      expect(cmd.args).toEqual(['-a', 'Google Chrome', 'stats.html']);
    });

    it('returns wslview with powershell fallback on WSL', () => {
      const cmd = getOpenCommand('stats.html', 'linux', true);
      expect(cmd.cmd).toBe('wslview');
      expect(cmd.args).toEqual(['stats.html']);
      expect(cmd.fallbackCmd).toBe('powershell.exe');
    });

    it('returns chrome with powershell fallback on WSL when chrome requested', () => {
      const cmd = getOpenCommand('stats.html', 'linux', true, 'chrome');
      expect(cmd.cmd).toBe('cmd.exe');
      expect(cmd.args).toEqual(['/c', 'start', 'chrome', 'stats.html']);
      expect(cmd.fallbackCmd).toBe('powershell.exe');
    });

    it('returns xdg-open on standard Linux', () => {
      const cmd = getOpenCommand('stats.html', 'linux', false);
      expect(cmd.cmd).toBe('xdg-open');
      expect(cmd.args).toEqual(['stats.html']);
    });

    it('returns google-chrome on standard Linux when chrome requested', () => {
      const cmd = getOpenCommand('stats.html', 'linux', false, 'chrome');
      expect(cmd.cmd).toBe('google-chrome');
      expect(cmd.args).toEqual(['stats.html']);
      expect(cmd.fallbackCmd).toBe('google-chrome-stable');
    });
  });

  describe('parseCliArgs', () => {
    it('parses help flag', () => {
      expect(parseCliArgs(['--help']).help).toBe(true);
      expect(parseCliArgs(['-h']).help).toBe(true);
    });

    it('parses quiet flags', () => {
      expect(parseCliArgs(['--quiet']).quiet).toBe(true);
      expect(parseCliArgs(['-q']).quiet).toBe(true);
      expect(parseCliArgs(['--silent']).quiet).toBe(true);
    });

    it('parses no-open and print-only flags', () => {
      expect(parseCliArgs(['--no-open']).noOpen).toBe(true);
      expect(parseCliArgs(['--print-only']).printOnly).toBe(true);
    });

    it('parses chrome and browser flags', () => {
      expect(parseCliArgs(['--chrome']).browser).toBe('chrome');
      expect(parseCliArgs(['-c']).browser).toBe('chrome');
      expect(parseCliArgs(['--browser=firefox']).browser).toBe('firefox');
      expect(parseCliArgs(['--browser', 'edge']).browser).toBe('edge');
      expect(parseCliArgs(['-b', 'brave']).browser).toBe('brave');
    });

    it('parses target positional argument', () => {
      const args = parseCliArgs(['stats.html', '--chrome']);
      expect(args.target).toBe('stats.html');
      expect(args.browser).toBe('chrome');
    });
  });

  describe('showHelp', () => {
    it('prints help message without throwing', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      showHelp();
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('openReport', () => {
    it('fails gracefully when target is empty', async () => {
      const res = await openReport('', { quiet: true });
      expect(res.success).toBe(false);
      expect(res.reason).toBe('MISSING_TARGET');
    });

    it('handles missing local target gracefully with hint', async () => {
      const res = await openReport('stats.html', {
        baseDir: tempDir,
        quiet: true,
      });
      expect(res.success).toBe(false);
      expect(res.reason).toBe('NOT_FOUND');
      expect(res.hint).toContain('build:analyze');
    });

    it('does not open browser in CI mode', async () => {
      const dummyFile = path.join(tempDir, 'stats.html');
      fs.writeFileSync(dummyFile, '<html><body>Report</body></html>');

      const res = await openReport(dummyFile, {
        baseDir: tempDir,
        env: { CI: 'true' },
        quiet: true,
      });

      expect(res.success).toBe(true);
      expect(res.opened).toBe(false);
      expect(res.reason).toBe('HEADLESS_ENV');
    });

    it('spawns opener when file exists in non-CI mode', async () => {
      const dummyFile = path.join(tempDir, 'stats.html');
      fs.writeFileSync(dummyFile, '<html><body>Report</body></html>');

      const fakeChild: any = {
        unref: vi.fn(),
        on: vi.fn(),
      };

      const mockSpawn = vi.fn().mockReturnValue(fakeChild);

      const res = await openReport(dummyFile, {
        baseDir: tempDir,
        env: {},
        quiet: true,
        spawnFn: mockSpawn,
      });

      expect(mockSpawn).toHaveBeenCalled();
      expect(fakeChild.unref).toHaveBeenCalled();
      expect(res.success).toBe(true);
      expect(res.opened).toBe(true);
      expect(res.reason).toBe('OPENED');
    });

    it('handles spawn error gracefully', async () => {
      const dummyFile = path.join(tempDir, 'stats.html');
      fs.writeFileSync(dummyFile, '<html><body>Report</body></html>');

      const fakeChild: any = {
        unref: vi.fn(),
        on: (event: string, cb: Function) => {
          if (event === 'error') {
            setTimeout(() => cb(new Error('ENOENT')), 5);
          }
        },
      };

      const mockSpawn = vi.fn().mockReturnValue(fakeChild);

      const res = await openReport(dummyFile, {
        baseDir: tempDir,
        env: {},
        quiet: true,
        spawnFn: mockSpawn,
        platform: 'linux',
        isWsl: false,
      });

      expect(res.success).toBe(true);
      expect(res.opened).toBe(false);
      expect(res.reason).toBe('SPAWN_ERROR');
    });
  });
});
