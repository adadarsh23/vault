import fs from 'node:fs';
import path from 'node:path';

import { EXCLUDED_BASENAMES, EXCLUDED_DIRECTORIES, INCLUDED_EXTENSIONS } from './constants.mjs';

export const safeReadJson = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const createEffectiveScanOptions = (options) => ({
  excludedBasenames: new Set([
    ...[...EXCLUDED_BASENAMES].map((x) => x.toLowerCase()),
    ...options.excludeBasenames.map((x) => x.toLowerCase()),
  ]),
  includedExtensions: new Set([
    ...(options.includeExtensions.length > 0
      ? options.includeExtensions
      : [...INCLUDED_EXTENSIONS]),
  ]),
  excludedDirectories: new Set([...[...EXCLUDED_DIRECTORIES], ...options.excludeDirectories]),
});

export const walkFiles = (
  directory,
  options,
  collector = [],
  effectiveOptions = createEffectiveScanOptions(options)
) => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!options.includeHidden && entry.name.startsWith('.')) {
      if (entry.name !== '.eslintrc' && entry.name !== '.prettierrc') continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (effectiveOptions.excludedDirectories.has(entry.name)) continue;
      walkFiles(fullPath, options, collector, effectiveOptions);
      continue;
    }

    if (effectiveOptions.excludedBasenames.has(entry.name.toLowerCase())) continue;

    const extension = path.extname(entry.name).toLowerCase();
    if (effectiveOptions.includedExtensions.has(extension)) collector.push(fullPath);
  }
  return collector;
};
