import fs from 'node:fs';
import path from 'node:path';

import { EXPORT_LINE_RE, IMPORT_LINE_RE, TODO_RE, TOP_LIMIT } from './constants.mjs';
import {
  classifyImport,
  countKeywords,
  extractFunctions,
  extractImportSpecifiers,
  extractMatches,
  sha256,
  summarizeLines,
} from './content-analysis.mjs';
import { safeReadJson, walkFiles } from './file-system.mjs';
import { writeSummaryMarkdown, updateHistory } from './output.mjs';
import { createPathHelpers } from './path-utils.mjs';
import {
  computeChangeSet,
  computeDependencyStats,
  computeDuplicateGroups,
  computeTrend,
  createEmptyMap,
  scoreRisk,
} from './stats.mjs';

export const buildIndex = ({ root, options, outputDir }) => {
  const outputFile = path.join(outputDir, 'code-index.json');
  const historyDir = path.join(outputDir, 'history');
  const summaryFile = path.join(outputDir, 'code-index-summary.md');
  const { dirnameRel, resolveRelativeImport, toRelPath } = createPathHelpers(root);

  const previousIndex = safeReadJson(outputFile);
  const startedAt = new Date().toISOString();
  const scannedFiles = walkFiles(root, options);
  const records = [];
  const skipped = [];

  for (const absoluteFile of scannedFiles) {
    const stat = fs.statSync(absoluteFile);
    const relPath = toRelPath(absoluteFile);
    if (stat.size > options.maxFileSizeBytes) {
      skipped.push({ path: relPath, reason: 'max_size_exceeded', bytes: stat.size });
      continue;
    }

    let content = '';
    try {
      content = fs.readFileSync(absoluteFile, 'utf8');
    } catch {
      skipped.push({ path: relPath, reason: 'read_error', bytes: stat.size });
      continue;
    }

    const lineStats = summarizeLines(content);
    const symbols = extractFunctions(content);
    const importLines = extractMatches(content, IMPORT_LINE_RE);
    const exportLines = extractMatches(content, EXPORT_LINE_RE);
    const importSpecifiers = extractImportSpecifiers(content);
    const tags = [...new Set((content.match(TODO_RE) || []).map((x) => x.toUpperCase()))];
    const keywordCounts = countKeywords(content);

    const importsDetailed = importSpecifiers.map((specifier) => ({
      specifier,
      kind: classifyImport(specifier),
      target: resolveRelativeImport(relPath, specifier),
    }));
    const complexityScore =
      lineStats.code + symbols.length * 6 + importSpecifiers.length * 3 + tags.length * 12;

    records.push({
      path: relPath,
      extension: path.extname(absoluteFile).toLowerCase(),
      directory: dirnameRel(relPath),
      bytes: stat.size,
      hash: sha256(content),
      lines: lineStats,
      imports: importLines,
      exports: exportLines,
      importSpecifiers,
      importsDetailed,
      symbols,
      symbolCount: symbols.length,
      tags,
      tagCount: tags.length,
      keywordCounts,
      complexityScore,
      updatedAt: stat.mtime.toISOString(),
    });
  }

  const files = records.sort((a, b) => a.path.localeCompare(b.path));
  const dependencyStats = computeDependencyStats(files);
  for (const file of files) file.riskScore = scoreRisk(file, dependencyStats);

  const totals = {
    filesScanned: scannedFiles.length,
    filesIndexed: files.length,
    filesSkipped: skipped.length,
    bytesIndexed: files.reduce((sum, file) => sum + file.bytes, 0),
    linesIndexed: files.reduce((sum, file) => sum + file.lines.total, 0),
    codeLines: files.reduce((sum, file) => sum + file.lines.code, 0),
    commentLines: files.reduce((sum, file) => sum + file.lines.comments, 0),
    blankLines: files.reduce((sum, file) => sum + file.lines.blanks, 0),
    symbolCount: files.reduce((sum, file) => sum + file.symbolCount, 0),
    importCount: files.reduce((sum, file) => sum + file.importSpecifiers.length, 0),
    exportCount: files.reduce((sum, file) => sum + file.exports.length, 0),
    tagCount: files.reduce((sum, file) => sum + file.tagCount, 0),
  };

  const extensionStatsMap = createEmptyMap();
  for (const file of files) {
    if (!extensionStatsMap[file.extension])
      extensionStatsMap[file.extension] = {
        extension: file.extension,
        files: 0,
        lines: 0,
        bytes: 0,
        symbols: 0,
        riskScore: 0,
      };
    extensionStatsMap[file.extension].files += 1;
    extensionStatsMap[file.extension].lines += file.lines.total;
    extensionStatsMap[file.extension].bytes += file.bytes;
    extensionStatsMap[file.extension].symbols += file.symbolCount;
    extensionStatsMap[file.extension].riskScore += file.riskScore;
  }
  const extensionStats = Object.values(extensionStatsMap).sort((a, b) => b.files - a.files);

  const tagStatsMap = createEmptyMap();
  for (const file of files)
    for (const tag of file.tags) tagStatsMap[tag] = (tagStatsMap[tag] || 0) + 1;
  const tagStats = Object.entries(tagStatsMap)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  const importTypeStatsMap = createEmptyMap();
  const dependencyEdges = [];
  for (const file of files) {
    for (const imp of file.importsDetailed) {
      importTypeStatsMap[imp.kind] = (importTypeStatsMap[imp.kind] || 0) + 1;
      dependencyEdges.push({ from: file.path, to: imp.target || imp.specifier, kind: imp.kind });
    }
  }
  const importTypeStats = Object.entries(importTypeStatsMap)
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count);

  const hotspots = {
    largestByLines: [...files].sort((a, b) => b.lines.total - a.lines.total).slice(0, TOP_LIMIT),
    largestByBytes: [...files].sort((a, b) => b.bytes - a.bytes).slice(0, TOP_LIMIT),
    mostSymbols: [...files].sort((a, b) => b.symbolCount - a.symbolCount).slice(0, TOP_LIMIT),
    highestComplexity: [...files]
      .sort((a, b) => b.complexityScore - a.complexityScore)
      .slice(0, TOP_LIMIT),
    mostImports: [...files]
      .sort((a, b) => b.importSpecifiers.length - a.importSpecifiers.length)
      .slice(0, TOP_LIMIT),
    mostTags: [...files].sort((a, b) => b.tagCount - a.tagCount).slice(0, TOP_LIMIT),
    highestRisk: [...files].sort((a, b) => b.riskScore - a.riskScore).slice(0, TOP_LIMIT),
    highestAsyncDensity: [...files]
      .sort(
        (a, b) =>
          b.keywordCounts.awaitCount +
          b.keywordCounts.asyncCount -
          (a.keywordCounts.awaitCount + a.keywordCounts.asyncCount)
      )
      .slice(0, TOP_LIMIT),
  };

  const changes = computeChangeSet(files, previousIndex);

  const quality = {
    commentDensity:
      totals.codeLines === 0 ? 0 : Number((totals.commentLines / totals.codeLines).toFixed(3)),
    blankLineRatio:
      totals.linesIndexed === 0 ? 0 : Number((totals.blankLines / totals.linesIndexed).toFixed(3)),
    todoFilesRatio:
      totals.filesIndexed === 0
        ? 0
        : Number((files.filter((f) => f.tagCount > 0).length / totals.filesIndexed).toFixed(3)),
    avgSymbolsPerFile:
      totals.filesIndexed === 0 ? 0 : Number((totals.symbolCount / totals.filesIndexed).toFixed(2)),
    avgImportsPerFile:
      totals.filesIndexed === 0 ? 0 : Number((totals.importCount / totals.filesIndexed).toFixed(2)),
    avgRiskPerFile:
      totals.filesIndexed === 0
        ? 0
        : Number((files.reduce((sum, f) => sum + f.riskScore, 0) / totals.filesIndexed).toFixed(2)),
  };

  const riskSummary = {
    critical: files.filter((f) => f.riskScore >= 55).length,
    high: files.filter((f) => f.riskScore >= 40 && f.riskScore < 55).length,
    medium: files.filter((f) => f.riskScore >= 25 && f.riskScore < 40).length,
    low: files.filter((f) => f.riskScore < 25).length,
  };

  const recommendations = [];
  if (changes.counts.changed > Math.max(20, Math.floor(totals.filesIndexed * 0.1)))
    recommendations.push('Large change volume detected: prioritize regression and smoke testing.');
  if (dependencyStats.totals.missingRelativeTargets > 0)
    recommendations.push(
      'Relative imports with missing targets detected. Verify file extension resolution and alias settings.'
    );
  if (riskSummary.critical > 0)
    recommendations.push(
      'Critical-risk files found. Split large modules and reduce dependency concentration.'
    );
  if (quality.todoFilesRatio > 0.25)
    recommendations.push('TODO density is elevated. Plan cleanup to reduce maintenance debt.');

  const index = {
    version: 5,
    schema: 'code-memory-index/v5',
    generatedAt: new Date().toISOString(),
    startedAt,
    root,
    options,
    totals,
    quality,
    riskSummary,
    extensionStats,
    tagStats,
    importTypeStats,
    hotspots,
    duplicates: computeDuplicateGroups(files),
    dependencyStats: {
      hubsByInDegree: dependencyStats.hubsByInDegree,
      hubsByOutDegree: dependencyStats.hubsByOutDegree,
      missingRelativeTargets: dependencyStats.missingRelativeTargets,
      totals: dependencyStats.totals,
    },
    changes,
    recommendations,
    diagnostics: {
      generatedInMs: Date.now() - new Date(startedAt).getTime(),
      skippedByReason: skipped.reduce((acc, item) => {
        acc[item.reason] = (acc[item.reason] || 0) + 1;
        return acc;
      }, createEmptyMap()),
      topRiskPaths: hotspots.highestRisk.slice(0, 10).map((x) => x.path),
      topComplexityPaths: hotspots.highestComplexity.slice(0, 10).map((x) => x.path),
    },
    dependencyEdges,
    skipped,
    generatedArtifacts: {
      outputFile,
      outputDir,
      summaryFile,
      historyDir,
    },
    files,
  };

  index.trend = computeTrend(index, previousIndex);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  const historyMeta = updateHistory(index, historyDir, options.historyLimit);
  index.history = historyMeta;
  fs.writeFileSync(outputFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  writeSummaryMarkdown(index, summaryFile);

  return index;
};
