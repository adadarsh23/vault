export interface TestReportResult {
  label: string;
  cmd: string;
  status: 'PASS' | 'FAIL';
  startedAt: string;
  durationMs: number;
  exitCode: number;
  signal: string | null;
  timedOut: boolean;
  output: string;
  error: string;
}

export interface TestReport {
  schemaVersion: 1;
  project: {
    name: string;
    version: string;
    runAt: string;
    [key: string]: unknown;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    overallStatus: string;
  };
  results: TestReportResult[];
}

export function isValidTestReport(report: unknown): report is TestReport;
export function escapeHtml(value: unknown): string;
export function repositoryUrl(value: unknown): string | null;
export function formatDuration(durationMs: number): string;
