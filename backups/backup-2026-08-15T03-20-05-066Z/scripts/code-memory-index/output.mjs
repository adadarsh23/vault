import fs from 'node:fs';
import path from 'node:path';

export const updateHistory = (index, historyDir, historyLimit) => {
  fs.mkdirSync(historyDir, { recursive: true });
  const stamp = index.generatedAt.replace(/[:.]/g, '-');
  const historyPath = path.join(historyDir, `code-index-${stamp}.json`);
  fs.writeFileSync(historyPath, JSON.stringify(index, null, 2), 'utf8');

  const historyFiles = fs
    .readdirSync(historyDir)
    .filter((name) => name.startsWith('code-index-') && name.endsWith('.json'))
    .sort();

  while (historyFiles.length > historyLimit) {
    const oldest = historyFiles.shift();
    fs.unlinkSync(path.join(historyDir, oldest));
  }

  return { historyPath, historyCount: Math.min(historyLimit, historyFiles.length + 1) };
};

export const writeSummaryMarkdown = (index, summaryFile) => {
  const lines = [
    '# Code Memory Summary',
    '',
    `Generated: ${index.generatedAt}`,
    `Schema: ${index.schema}`,
    '',
    '## Totals',
    `- Files Indexed: ${index.totals.filesIndexed}`,
    `- Lines Indexed: ${index.totals.linesIndexed}`,
    `- Symbols: ${index.totals.symbolCount}`,
    `- Imports: ${index.totals.importCount}`,
    '',
    '## Changes',
    `- Added: ${index.changes.counts.added}`,
    `- Removed: ${index.changes.counts.removed}`,
    `- Changed: ${index.changes.counts.changed}`,
    '',
    '## Risk Summary',
    `- Critical: ${index.riskSummary.critical}`,
    `- High: ${index.riskSummary.high}`,
    `- Medium: ${index.riskSummary.medium}`,
    `- Low: ${index.riskSummary.low}`,
  ];
  fs.writeFileSync(summaryFile, `${lines.join('\n')}\n`, 'utf8');
};
