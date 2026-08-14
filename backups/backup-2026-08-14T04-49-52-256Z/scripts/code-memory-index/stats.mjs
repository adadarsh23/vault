import { TOP_LIMIT } from './constants.mjs';

export const createEmptyMap = () => Object.create(null);

export const computeDuplicateGroups = (files) => {
  const byHash = new Map();
  for (const file of files) {
    if (!byHash.has(file.hash)) byHash.set(file.hash, []);
    byHash.get(file.hash).push(file.path);
  }
  return [...byHash.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([hash, paths]) => ({ hash, copies: paths.length, paths: paths.sort() }))
    .sort((a, b) => b.copies - a.copies);
};

export const computeChangeSet = (currentFiles, previousIndex) => {
  const previousFiles = previousIndex?.files || [];
  const prevMap = new Map(previousFiles.map((f) => [f.path, f]));
  const currMap = new Map(currentFiles.map((f) => [f.path, f]));

  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  for (const file of currentFiles) {
    const prev = prevMap.get(file.path);
    if (!prev) {
      added.push(file.path);
      continue;
    }
    if (prev.hash !== file.hash) {
      const prevLines = typeof prev.lines === 'number' ? prev.lines : prev.lines?.total || 0;
      changed.push({
        path: file.path,
        previousHash: prev.hash,
        currentHash: file.hash,
        previousLines: prevLines,
        currentLines: file.lines.total,
        deltaLines: file.lines.total - prevLines,
        deltaSymbols: file.symbolCount - (prev.symbolCount || (prev.symbols || []).length || 0),
      });
      continue;
    }
    unchanged.push(file.path);
  }

  for (const file of previousFiles) if (!currMap.has(file.path)) removed.push(file.path);

  return {
    hasPreviousIndex: Boolean(previousIndex),
    previousGeneratedAt: previousIndex?.generatedAt || null,
    counts: {
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: unchanged.length,
    },
    added,
    removed,
    changed: changed.sort((a, b) => Math.abs(b.deltaLines) - Math.abs(a.deltaLines)).slice(0, 300),
    unchanged: unchanged.slice(0, 500),
  };
};

export const computeDependencyStats = (files) => {
  const indegree = createEmptyMap();
  const outdegree = createEmptyMap();
  const missingRelatives = [];

  for (const file of files) {
    outdegree[file.path] = file.importsDetailed.filter((i) => i.kind === 'relative').length;
    for (const imp of file.importsDetailed) {
      if (imp.kind !== 'relative' || !imp.target) continue;
      indegree[imp.target] = (indegree[imp.target] || 0) + 1;
    }
  }

  const filePaths = new Set(files.map((f) => f.path));
  for (const file of files) {
    for (const imp of file.importsDetailed) {
      if (imp.kind === 'relative' && imp.target && !filePaths.has(imp.target)) {
        missingRelatives.push({ from: file.path, target: imp.target, specifier: imp.specifier });
      }
    }
  }

  const hubsByInDegree = files
    .map((f) => ({ path: f.path, inDegree: indegree[f.path] || 0 }))
    .sort((a, b) => b.inDegree - a.inDegree)
    .slice(0, TOP_LIMIT);
  const hubsByOutDegree = files
    .map((f) => ({ path: f.path, outDegree: outdegree[f.path] || 0 }))
    .sort((a, b) => b.outDegree - a.outDegree)
    .slice(0, TOP_LIMIT);

  return {
    hubsByInDegree,
    hubsByOutDegree,
    missingRelativeTargets: missingRelatives.slice(0, 600),
    totals: {
      filesWithInboundLinks: hubsByInDegree.filter((x) => x.inDegree > 0).length,
      filesWithOutboundLinks: hubsByOutDegree.filter((x) => x.outDegree > 0).length,
      missingRelativeTargets: missingRelatives.length,
    },
    indegreeMap: indegree,
    outdegreeMap: outdegree,
  };
};

export const scoreRisk = (file, depStats) => {
  const lineWeight =
    file.lines.total > 600 ? 20 : file.lines.total > 300 ? 12 : file.lines.total > 150 ? 6 : 2;
  const importWeight =
    file.importSpecifiers.length > 15 ? 14 : file.importSpecifiers.length > 8 ? 8 : 3;
  const symbolWeight = file.symbolCount > 20 ? 14 : file.symbolCount > 10 ? 8 : 3;
  const todoWeight = file.tagCount * 7;
  const dependencyWeight =
    (depStats.indegreeMap[file.path] || 0) > 8
      ? 16
      : (depStats.indegreeMap[file.path] || 0) > 3
        ? 8
        : 2;
  const controlFlowWeight =
    file.keywordCounts.ifCount > 40 || file.keywordCounts.switchCount > 8 ? 8 : 2;
  return (
    lineWeight + importWeight + symbolWeight + todoWeight + dependencyWeight + controlFlowWeight
  );
};

export const computeTrend = (current, previous) => {
  if (!previous) return null;
  const prevTotals = previous.totals || {};
  return {
    filesIndexedDelta: (current.totals.filesIndexed || 0) - (prevTotals.filesIndexed || 0),
    linesIndexedDelta: (current.totals.linesIndexed || 0) - (prevTotals.linesIndexed || 0),
    symbolCountDelta: (current.totals.symbolCount || 0) - (prevTotals.symbolCount || 0),
    importCountDelta: (current.totals.importCount || 0) - (prevTotals.importCount || 0),
    avgRiskPerFileDelta: Number(
      ((current.quality.avgRiskPerFile || 0) - (previous.quality?.avgRiskPerFile || 0)).toFixed(2)
    ),
  };
};
