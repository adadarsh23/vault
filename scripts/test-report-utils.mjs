export function isValidTestReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;

  const { project, summary, results } = report;
  if (
    report.schemaVersion !== 1 ||
    !project ||
    typeof project.name !== 'string' ||
    typeof project.version !== 'string' ||
    typeof project.runAt !== 'string' ||
    !Number.isFinite(Date.parse(project.runAt)) ||
    !summary ||
    !Number.isInteger(summary.total) ||
    summary.total < 0 ||
    !Number.isInteger(summary.passed) ||
    summary.passed < 0 ||
    !Number.isInteger(summary.failed) ||
    summary.failed < 0 ||
    summary.passed + summary.failed !== summary.total ||
    summary.overallStatus !==
      (summary.failed === 0 ? 'ALL PASSED ✅' : `${summary.failed} FAILED ❌`) ||
    !Array.isArray(results) ||
    results.length !== summary.total
  ) {
    return false;
  }

  let passed = 0;
  let failed = 0;
  for (const result of results) {
    if (
      !result ||
      typeof result.label !== 'string' ||
      typeof result.cmd !== 'string' ||
      !['PASS', 'FAIL'].includes(result.status) ||
      typeof result.startedAt !== 'string' ||
      !Number.isFinite(Date.parse(result.startedAt)) ||
      !Number.isFinite(result.durationMs) ||
      result.durationMs < 0 ||
      !Number.isInteger(result.exitCode) ||
      typeof result.timedOut !== 'boolean' ||
      !(result.signal === null || typeof result.signal === 'string') ||
      typeof result.output !== 'string' ||
      typeof result.error !== 'string' ||
      (result.status === 'PASS' && result.exitCode !== 0) ||
      (result.status === 'FAIL' && result.exitCode === 0)
    ) {
      return false;
    }

    if (result.status === 'PASS') passed++;
    else failed++;
  }

  return passed === summary.passed && failed === summary.failed;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function repositoryUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function formatDuration(durationMs) {
  return `${(durationMs / 1000).toFixed(2)}s`;
}
