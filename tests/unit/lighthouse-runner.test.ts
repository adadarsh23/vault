import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  DEFAULT_URL,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_SPLIT_REPORT_DIR,
  DEFAULT_CATEGORIES,
  DEFAULT_CHROME_FLAGS,
  FALLBACK_CHROME_FLAGS,
  parseArgs,
  splitChromeFlags,
  isSafeWorkspaceChild,
  escapeHtml,
  stripMarkdownLinks,
  slugify,
  scorePercent,
  scoreClass,
  scoreColor,
  scoreLabel,
  formatDuration,
  formatBytes,
  extractCoreWebVitals,
  extractOpportunities,
  evaluateAssertions,
  renderPage,
  renderAuditTable,
  renderOpportunitiesTable,
  renderMetricsGrid,
  writeSplitReports,
  resolveChromeExecutablePath,
  removeTempDirectorySafely,
  cleanupStaleLighthouseTempDirectories,
  resolveNpxRunner,
  ensureProductionBuild,
  sanitizeNpmConfigEnv,
  getSanitizedProcessEnv,
} from '../../scripts/lighthouse-runner.mjs';

describe('Lighthouse Runner Utility', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-lh-test-'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup
    }
  });

  describe('CLI Argument Parsing (parseArgs)', () => {
    it('returns default options when no args provided', () => {
      const options = parseArgs([]);
      expect(options.url).toBe(DEFAULT_URL);
      expect(options.outputPath).toBe(DEFAULT_OUTPUT_PATH);
      expect(options.splitReportDir).toBe(DEFAULT_SPLIT_REPORT_DIR);
      expect(options.categories).toBe(DEFAULT_CATEGORIES);
      expect(options.preset).toBe('mobile');
      expect(options.splitReports).toBe(true);
      expect(options.startPreview).toBe(true);
      expect(options.autoBuild).toBe(true);
      expect(options.splitExistingReport).toBe(false);
      expect(options.assertMode).toBe(false);
    });

    it('parses boolean toggle flags', () => {
      const options = parseArgs([
        '--no-preview',
        '--no-build',
        '--no-split-report',
        '--split-existing-report',
        '--desktop',
        '--open',
        '--assert',
        '--quiet',
        '--help',
      ]);

      expect(options.startPreview).toBe(false);
      expect(options.autoBuild).toBe(false);
      expect(options.splitReports).toBe(false);
      expect(options.splitExistingReport).toBe(true);
      expect(options.preset).toBe('desktop');
      expect(options.openReport).toBe(true);
      expect(options.assertMode).toBe(true);
      expect(options.quiet).toBe(true);
      expect(options.showHelp).toBe(true);
    });

    it('parses space-separated option pairs', () => {
      const options = parseArgs([
        '--url',
        'http://localhost:3000/app',
        '--output-path',
        './custom/report',
        '--split-report-dir',
        './custom/split',
        '--categories',
        'performance,seo',
        '--chrome-flags',
        '--custom-flag',
        '--preview-host',
        '0.0.0.0',
        '--preview-port',
        '8080',
        '--timeout-ms',
        '45000',
      ]);

      expect(options.url).toBe('http://localhost:3000/app');
      expect(options.outputPath).toBe('./custom/report');
      expect(options.splitReportDir).toBe('./custom/split');
      expect(options.categories).toBe('performance,seo');
      expect(options.chromeFlags).toBe('--custom-flag');
      expect(options.previewHost).toBe('0.0.0.0');
      expect(options.previewPort).toBe(8080);
      expect(options.timeoutMs).toBe(45000);
    });

    it('parses key=value style arguments', () => {
      const options = parseArgs([
        '--url=http://example.com',
        '--output-path=./out/rep',
        '--split-report-dir=./out/split',
        '--categories=accessibility',
        '--chrome-flags=--disable-gpu',
        '--preview-host=127.0.0.1',
        '--preview-port=5000',
        '--timeout-ms=20000',
      ]);

      expect(options.url).toBe('http://example.com');
      expect(options.outputPath).toBe('./out/rep');
      expect(options.splitReportDir).toBe('./out/split');
      expect(options.categories).toBe('accessibility');
      expect(options.chromeFlags).toBe('--disable-gpu');
      expect(options.previewHost).toBe('127.0.0.1');
      expect(options.previewPort).toBe(5000);
      expect(options.timeoutMs).toBe(20000);
    });

    it('parses CI threshold and quality gate assertions', () => {
      const options = parseArgs([
        '--min-score=90',
        '--min-score-performance=80',
        '--min-score-accessibility=95',
        '--min-score-best-practices=85',
        '--min-score-seo=90',
        '--max-lcp=2500',
        '--max-fcp=1800',
        '--max-tbt=200',
        '--max-cls=0.1',
      ]);

      expect(options.assertMode).toBe(true);
      expect(options.minScore).toBe(90);
      expect(options.minScorePerformance).toBe(80);
      expect(options.minScoreAccessibility).toBe(95);
      expect(options.minScoreBestPractices).toBe(85);
      expect(options.minScoreSeo).toBe(90);
      expect(options.maxLcp).toBe(2500);
      expect(options.maxFcp).toBe(1800);
      expect(options.maxTbt).toBe(200);
      expect(options.maxCls).toBe(0.1);
    });
  });

  describe('Chrome Flags Splitting (splitChromeFlags)', () => {
    it('splits whitespace separated flags into array', () => {
      const flags = splitChromeFlags('--headless=new --no-sandbox   --disable-gpu');
      expect(flags).toEqual(['--headless=new', '--no-sandbox', '--disable-gpu']);
    });

    it('handles arrays and empty inputs gracefully', () => {
      expect(splitChromeFlags(['--flag1', '--flag2'])).toEqual(['--flag1', '--flag2']);
      expect(splitChromeFlags('')).toEqual([]);
      expect(splitChromeFlags(null)).toEqual([]);
    });
  });

  describe('Path Safety Checks (isSafeWorkspaceChild)', () => {
    it('allows child directories within workspace', () => {
      expect(isSafeWorkspaceChild('./lighthouse/report-split', tempRoot)).toBe(true);
      expect(isSafeWorkspaceChild('nested/folder', tempRoot)).toBe(true);
    });

    it('blocks directory traversal attempts outside workspace', () => {
      expect(isSafeWorkspaceChild('../outside', tempRoot)).toBe(false);
      expect(isSafeWorkspaceChild('../../etc', tempRoot)).toBe(false);
      expect(isSafeWorkspaceChild('', tempRoot)).toBe(false);
      expect(isSafeWorkspaceChild(null, tempRoot)).toBe(false);
    });
  });

  describe('HTML & String Utilities', () => {
    it('escapes HTML special characters', () => {
      expect(escapeHtml('<script>alert("XSS & test\'s")</script>')).toBe(
        '&lt;script&gt;alert(&quot;XSS &amp; test&#39;s&quot;)&lt;/script&gt;',
      );
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null)).toBe('');
    });

    it('strips markdown links and backticks', () => {
      expect(stripMarkdownLinks('Learn more at [Web.dev](https://web.dev) about `LCP`')).toBe(
        'Learn more at Web.dev about LCP',
      );
      expect(stripMarkdownLinks('Plain text')).toBe('Plain text');
    });

    it('slugifies string into valid url/file names', () => {
      expect(slugify('Best Practices')).toBe('best-practices');
      expect(slugify('Accessibility (A11y)')).toBe('accessibility-a11y');
      expect(slugify('')).toBe('report');
      expect(slugify(null)).toBe('report');
    });
  });

  describe('Score Formatting & Classifications', () => {
    it('calculates score percent correctly', () => {
      expect(scorePercent(0.96)).toBe(96);
      expect(scorePercent(1.0)).toBe(100);
      expect(scorePercent(0)).toBe(0);
      expect(scorePercent(null)).toBeNull();
      expect(scorePercent(NaN)).toBeNull();
    });

    it('classifies score ranges into pass, warn, fail, na', () => {
      expect(scoreClass(0.9)).toBe('pass');
      expect(scoreClass(0.95)).toBe('pass');
      expect(scoreClass(0.5)).toBe('warn');
      expect(scoreClass(0.89)).toBe('warn');
      expect(scoreClass(0.49)).toBe('fail');
      expect(scoreClass(0)).toBe('fail');
      expect(scoreClass(null)).toBe('na');
    });

    it('returns appropriate score labels based on displayMode', () => {
      expect(scoreLabel({ score: 0.95 })).toBe('95');
      expect(scoreLabel({ scoreDisplayMode: 'notApplicable' })).toBe('N/A');
      expect(scoreLabel({ scoreDisplayMode: 'manual' })).toBe('Manual');
      expect(scoreLabel({ scoreDisplayMode: 'informative' })).toBe('Info');
      expect(scoreLabel(null)).toBe('-');
    });

    it('assigns ANSI color codes for terminal display', () => {
      expect(scoreColor(0.95)).toBe('\x1b[32m'); // Green
      expect(scoreColor(0.7)).toBe('\x1b[33m'); // Yellow
      expect(scoreColor(0.3)).toBe('\x1b[31m'); // Red
      expect(scoreColor(null)).toBe('\x1b[90m'); // Gray
    });
  });

  describe('Duration and Byte Formatting', () => {
    it('formats duration in ms and seconds', () => {
      expect(formatDuration(450)).toBe('450 ms');
      expect(formatDuration(2540)).toBe('2.54 s');
      expect(formatDuration(null as any)).toBe('-');
    });

    it('formats bytes into B, KB, MB, GB', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(2048)).toBe('2.0 KB');
      expect(formatBytes(1024 * 1024 * 3.5)).toBe('3.5 MB');
      expect(formatBytes(1024 * 1024 * 1024 * 2)).toBe('2.0 GB');
      expect(formatBytes(-100)).toBe('-');
    });
  });

  describe('Core Web Vitals Extraction (extractCoreWebVitals)', () => {
    const mockReport = {
      audits: {
        'first-contentful-paint': {
          title: 'First Contentful Paint',
          numericValue: 1200,
          displayValue: '1.2 s',
          score: 0.98,
        },
        'largest-contentful-paint': {
          title: 'Largest Contentful Paint',
          numericValue: 2100,
          displayValue: '2.1 s',
          score: 0.95,
        },
        'total-blocking-time': {
          title: 'Total Blocking Time',
          numericValue: 150,
          displayValue: '150 ms',
          score: 0.92,
        },
        'cumulative-layout-shift': {
          title: 'Cumulative Layout Shift',
          numericValue: 0.05,
          displayValue: '0.05',
          score: 0.99,
        },
        'speed-index': {
          title: 'Speed Index',
          numericValue: 1600,
          displayValue: '1.6 s',
          score: 0.96,
        },
        'interaction-to-next-paint': {
          title: 'Interaction to Next Paint',
          numericValue: 180,
          displayValue: '180 ms',
          score: 0.95,
        },
        'server-response-time': {
          title: 'Initial Server Response Time',
          numericValue: 120,
          displayValue: '120 ms',
          score: 1.0,
        },
      },
    };

    it('extracts all metrics with rating classifications', () => {
      const cwv = extractCoreWebVitals(mockReport);
      expect(cwv.fcp.value).toBe(1200);
      expect(cwv.fcp.rating).toBe('good');
      expect(cwv.lcp.value).toBe(2100);
      expect(cwv.lcp.rating).toBe('good');
      expect(cwv.tbt.value).toBe(150);
      expect(cwv.tbt.rating).toBe('good');
      expect(cwv.cls.value).toBe(0.05);
      expect(cwv.cls.rating).toBe('good');
      expect(cwv.si.value).toBe(1600);
      expect(cwv.si.rating).toBe('good');
    });

    it('classifies poor and warning metrics appropriately', () => {
      const degradedReport = {
        audits: {
          'largest-contentful-paint': {
            numericValue: 4500,
            displayValue: '4.5 s',
            score: 0.25,
          },
          'total-blocking-time': {
            numericValue: 450,
            displayValue: '450 ms',
            score: 0.65,
          },
        },
      };

      const cwv = extractCoreWebVitals(degradedReport);
      expect(cwv.lcp.rating).toBe('poor');
      expect(cwv.tbt.rating).toBe('warn');
    });
  });

  describe('CI Quality Gate Assertions (evaluateAssertions)', () => {
    const mockReport = {
      categories: {
        performance: { title: 'Performance', score: 0.95 },
        accessibility: { title: 'Accessibility', score: 0.98 },
        'best-practices': { title: 'Best Practices', score: 0.92 },
        seo: { title: 'SEO', score: 1.0 },
      },
      audits: {
        'first-contentful-paint': { numericValue: 1200, displayValue: '1.2 s' },
        'largest-contentful-paint': { numericValue: 2000, displayValue: '2.0 s' },
        'total-blocking-time': { numericValue: 100, displayValue: '100 ms' },
        'cumulative-layout-shift': { numericValue: 0.02, displayValue: '0.02' },
      },
    };

    it('passes when all scores and metrics meet thresholds', () => {
      const assertions = {
        minScore: 90,
        maxLcp: 2500,
        maxFcp: 1800,
        maxTbt: 200,
        maxCls: 0.1,
      };

      const result = evaluateAssertions(mockReport, assertions);
      expect(result.passed).toBe(true);
      expect(result.failures).toHaveLength(0);
      expect(result.passes.length).toBeGreaterThan(0);
    });

    it('detects violations in category scores', () => {
      const assertions = {
        minScore: 96, // Performance (95) and Best Practices (92) will fail
      };

      const result = evaluateAssertions(mockReport, assertions);
      expect(result.passed).toBe(false);
      expect(result.failures.length).toBe(2);
      expect(result.failures[0]).toContain('Performance');
      expect(result.failures[1]).toContain('Best Practices');
    });

    it('detects violations in Core Web Vitals thresholds', () => {
      const assertions = {
        maxLcp: 1500, // Actual is 2000ms
        maxCls: 0.01, // Actual is 0.02
      };

      const result = evaluateAssertions(mockReport, assertions);
      expect(result.passed).toBe(false);
      expect(result.failures.some((f) => f.includes('LCP'))).toBe(true);
      expect(result.failures.some((f) => f.includes('CLS'))).toBe(true);
    });
  });

  describe('Opportunity Extraction (extractOpportunities)', () => {
    it('extracts actionable performance optimization opportunities', () => {
      const report = {
        audits: {
          'unused-javascript': {
            title: 'Reduce unused JavaScript',
            description: 'Reduce unused JavaScript [learn more](https://web.dev).',
            score: 0.45,
            numericValue: 400,
            displayValue: 'Potential savings of 400 ms',
            details: {
              type: 'opportunity',
              overallSavingsMs: 400,
              overallSavingsBytes: 150000,
            },
          },
          'uses-optimized-images': {
            title: 'Efficiently encode images',
            description: 'Optimize images',
            score: 0.6,
            numericValue: 200,
            displayValue: 'Potential savings of 200 ms',
            details: {
              type: 'opportunity',
              overallSavingsMs: 200,
            },
          },
        },
      };

      const opps = extractOpportunities(report);
      expect(opps).toHaveLength(2);
      expect(opps[0].id).toBe('unused-javascript');
      expect(opps[0].savingsMs).toBe(400);
      expect(opps[0].description).toBe('Reduce unused JavaScript learn more.');
    });
  });

  describe('HTML Rendering Functions', () => {
    it('renders base HTML page structure', () => {
      const html = renderPage({ title: 'Test Report', body: '<p>Content</p>' });
      expect(html).toContain('<!doctype html>');
      expect(html).toContain('<title>Test Report</title>');
      expect(html).toContain('<p>Content</p>');
    });

    it('renders audit table with scores and values', () => {
      const rows = [
        {
          auditRef: { id: 'test-audit' },
          audit: {
            id: 'test-audit',
            title: 'Test Audit',
            description: 'Check something',
            score: 0.95,
            displayValue: 'Pass',
          },
        },
      ];

      const tableHtml = renderAuditTable(rows);
      expect(tableHtml).toContain('Test Audit');
      expect(tableHtml).toContain('score-pill pass');
      expect(tableHtml).toContain('Pass');
    });

    it('renders metrics grid with badges', () => {
      const cwv = {
        fcp: { displayValue: '1.2 s', rating: 'good', name: 'First Contentful Paint' },
        lcp: { displayValue: '2.1 s', rating: 'good', name: 'Largest Contentful Paint' },
        tbt: { displayValue: '150 ms', rating: 'good', name: 'Total Blocking Time' },
        cls: { displayValue: '0.05', rating: 'good', name: 'Cumulative Layout Shift' },
        si: { displayValue: '1.6 s', rating: 'good', name: 'Speed Index' },
      };

      const gridHtml = renderMetricsGrid(cwv as any);
      expect(gridHtml).toContain('cwv-grid');
      expect(gridHtml).toContain('1.2 s');
      expect(gridHtml).toContain('Largest Contentful Paint');
    });
  });

  describe('Split Reports Generation (writeSplitReports)', () => {
    it('generates modular HTML and JSON files per category and overview index', () => {
      const splitDir = path.join(tempRoot, 'lighthouse-split');
      const mockReport = {
        requestedUrl: 'http://127.0.0.1:4173/',
        finalUrl: 'http://127.0.0.1:4173/',
        fetchTime: new Date().toISOString(),
        categories: {
          performance: {
            id: 'performance',
            title: 'Performance',
            score: 0.95,
            auditRefs: [{ id: 'fcp' }],
          },
          accessibility: {
            id: 'accessibility',
            title: 'Accessibility',
            score: 0.98,
            auditRefs: [{ id: 'aria' }],
          },
        },
        audits: {
          fcp: {
            id: 'fcp',
            title: 'First Contentful Paint',
            score: 0.95,
            numericValue: 1200,
            displayValue: '1.2 s',
          },
          aria: { id: 'aria', title: 'ARIA attributes', score: 1.0, displayValue: 'Valid' },
        },
      };

      const options = {
        splitReports: true,
        splitReportDir: 'lighthouse-split',
        workspaceRoot: tempRoot,
        outputPath: './lighthouse/report',
      };

      const indexFile = writeSplitReports(options, mockReport, tempRoot);
      expect(indexFile).toBeDefined();
      expect(fs.existsSync(indexFile!)).toBe(true);

      // Verify Category HTML and JSON files
      expect(fs.existsSync(path.join(splitDir, 'performance.html'))).toBe(true);
      expect(fs.existsSync(path.join(splitDir, 'performance.json'))).toBe(true);
      expect(fs.existsSync(path.join(splitDir, 'accessibility.html'))).toBe(true);
      expect(fs.existsSync(path.join(splitDir, 'accessibility.json'))).toBe(true);

      // Check content of category JSON
      const perfJson = JSON.parse(fs.readFileSync(path.join(splitDir, 'performance.json'), 'utf8'));
      expect(perfJson.category.title).toBe('Performance');
      expect(perfJson.audits.fcp).toBeDefined();
    });
  });

  describe('Chrome Discovery (resolveChromeExecutablePath)', () => {
    it('resolves explicit environment variable if file exists', () => {
      const dummyExe = path.join(tempRoot, 'dummy-chrome.exe');
      fs.writeFileSync(dummyExe, 'binary', 'utf8');

      const resolved = resolveChromeExecutablePath([], { CHROME_PATH: dummyExe } as any);
      expect(resolved).toBe(dummyExe);
    });

    it('throws error when no browser executable exists', () => {
      expect(() => {
        resolveChromeExecutablePath([], {} as any, 'unknown-os' as any);
      }).toThrow(/Could not locate a Chrome or Chromium executable/);
    });
  });

  describe('Temporary Directory Cleanups', () => {
    it('safely removes temp directories with retries', () => {
      const testDir = path.join(tempRoot, 'temp-target');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'sample.txt'), 'hello', 'utf8');

      expect(fs.existsSync(testDir)).toBe(true);
      removeTempDirectorySafely(testDir);
      expect(fs.existsSync(testDir)).toBe(false);
    });

    it('handles non-existent or null directories gracefully', () => {
      expect(() => removeTempDirectorySafely(null)).not.toThrow();
      expect(() => removeTempDirectorySafely('/non/existent/path/123')).not.toThrow();
    });
  });

  describe('resolveNpxRunner', () => {
    it('returns a valid command runner configuration', () => {
      const runner = resolveNpxRunner();
      expect(runner).toBeDefined();
      expect(typeof runner.command).toBe('string');
      expect(Array.isArray(runner.prefixArgs)).toBe(true);
      expect(runner.options.shell).toBe(false);
    });
  });

  describe('ensureProductionBuild', () => {
    it('returns true when build output exists and is up to date', () => {
      const fakeBuildDir = path.join(tempRoot, 'build');
      fs.mkdirSync(fakeBuildDir, { recursive: true });
      fs.writeFileSync(path.join(fakeBuildDir, 'index.html'), '<html></html>', 'utf8');

      const isReady = ensureProductionBuild(tempRoot);
      expect(isReady).toBe(true);
    });
  });

  describe('npm Environment Sanitization (sanitizeNpmConfigEnv & getSanitizedProcessEnv)', () => {
    it('strips legacy or unrecognized npm config environment variables', () => {
      const mockEnv = {
        PATH: '/usr/bin',
        NODE_ENV: 'test',
        npm_config_global_ignore_file: 'C:\\Users\\user\\.gitignore',
        npm_config_global_ignorefile: 'C:\\Users\\user\\.gitignore',
        'npm_config_global-ignore-file': 'C:\\Users\\user\\.gitignore',
        NPM_CONFIG_GLOBAL_IGNORE_FILE: 'C:\\Users\\user\\.gitignore',
        npm_config_loglevel: 'warn',
      };

      const sanitized = sanitizeNpmConfigEnv(mockEnv);
      expect(sanitized.PATH).toBe('/usr/bin');
      expect(sanitized.NODE_ENV).toBe('test');
      expect(sanitized.npm_config_loglevel).toBe('warn');
      expect(sanitized.npm_config_global_ignore_file).toBeUndefined();
      expect(sanitized.npm_config_global_ignorefile).toBeUndefined();
      expect(sanitized['npm_config_global-ignore-file']).toBeUndefined();
      expect(sanitized.NPM_CONFIG_GLOBAL_IGNORE_FILE).toBeUndefined();
    });

    it('returns sanitized process environment with PATH ensured', () => {
      const env = getSanitizedProcessEnv({ EXTRA_VAR: '123' });
      expect(env).toBeDefined();
      expect(env.PATH).toBeDefined();
      expect(env.EXTRA_VAR).toBe('123');
      expect(env.npm_config_global_ignore_file).toBeUndefined();
      expect(env.NPM_CONFIG_GLOBAL_IGNORE_FILE).toBeUndefined();
    });
  });
});
