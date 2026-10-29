import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  formatDuration,
  isValidTestReport,
  repositoryUrl,
  type TestReport,
} from '../../scripts/test-report-utils.mjs';

const passedResult: TestReport['results'][number] = {
  label: 'Unit Tests',
  cmd: 'npm run test:unit',
  status: 'PASS',
  startedAt: '2026-10-29T00:00:00.000Z',
  durationMs: 1200,
  exitCode: 0,
  signal: null,
  timedOut: false,
  output: 'passed',
  error: '',
};

function createReport(): TestReport {
  return {
    schemaVersion: 1,
    project: {
      name: 'vault',
      version: '1.0.0',
      runAt: '2026-10-29T00:00:00.000Z',
    },
    summary: {
      total: 1,
      passed: 1,
      failed: 0,
      overallStatus: 'ALL PASSED ✅',
    },
    results: [{ ...passedResult }],
  };
}

describe('test report automation utilities', () => {
  describe('isValidTestReport', () => {
    it('accepts a complete report with consistent counts', () => {
      expect(isValidTestReport(createReport())).toBe(true);
    });

    it('accepts a valid report containing a failed and timed-out suite', () => {
      const report = createReport();
      report.summary = {
        total: 1,
        passed: 0,
        failed: 1,
        overallStatus: '1 FAILED ❌',
      };
      report.results[0] = {
        ...passedResult,
        status: 'FAIL',
        exitCode: 1,
        signal: 'SIGTERM',
        timedOut: true,
        error: 'Suite exceeded its timeout',
      };

      expect(isValidTestReport(report)).toBe(true);
    });

    it.each([
      ['unsupported schema', (report: TestReport) => ({ ...report, schemaVersion: 2 })],
      [
        'inconsistent summary counts',
        (report: TestReport) => ({
          ...report,
          summary: { ...report.summary, passed: 0 },
        }),
      ],
      [
        'incorrect overall status',
        (report: TestReport) => ({
          ...report,
          summary: { ...report.summary, overallStatus: 'ALL PASSED' },
        }),
      ],
      [
        'invalid run timestamp',
        (report: TestReport) => ({
          ...report,
          project: { ...report.project, runAt: 'not-a-date' },
        }),
      ],
      [
        'passing suite with non-zero exit code',
        (report: TestReport) => ({
          ...report,
          results: [{ ...passedResult, exitCode: 1 }],
        }),
      ],
      [
        'negative duration',
        (report: TestReport) => ({
          ...report,
          results: [{ ...passedResult, durationMs: -1 }],
        }),
      ],
    ])('rejects %s', (_description, mutate) => {
      expect(isValidTestReport(mutate(createReport()))).toBe(false);
    });

    it('rejects null and non-object input', () => {
      expect(isValidTestReport(null)).toBe(false);
      expect(isValidTestReport([])).toBe(false);
      expect(isValidTestReport('report')).toBe(false);
    });
  });

  it('escapes all HTML-sensitive characters in dynamic content', () => {
    expect(escapeHtml(`<img src="x" onerror='run()'>&`)).toBe(
      '&lt;img src=&quot;x&quot; onerror=&#39;run()&#39;&gt;&amp;',
    );
    expect(escapeHtml(null)).toBe('');
  });

  it('only accepts HTTP and HTTPS repository links', () => {
    expect(repositoryUrl('https://github.com/adadarsh23/vault')).toBe(
      'https://github.com/adadarsh23/vault',
    );
    expect(repositoryUrl('javascript:alert(1)')).toBeNull();
    expect(repositoryUrl('not a URL')).toBeNull();
    expect(repositoryUrl(undefined)).toBeNull();
  });

  it('formats suite durations in seconds to two decimal places', () => {
    expect(formatDuration(0)).toBe('0.00s');
    expect(formatDuration(1234)).toBe('1.23s');
  });
});
