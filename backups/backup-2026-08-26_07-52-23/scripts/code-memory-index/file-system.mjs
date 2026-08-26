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

export const safeWriteFileSync = (filePath, content, maxRetries = 5, retryDelayMs = 60) => {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tempFilePath = path.join(
    dir,
    `.${path.basename(filePath)}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`,
  );

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      fs.writeFileSync(tempFilePath, content, 'utf8');
      try {
        fs.renameSync(tempFilePath, filePath);
      } catch {
        fs.copyFileSync(tempFilePath, filePath);
        try {
          fs.unlinkSync(tempFilePath);
        } catch {
          // ignore
        }
      }
      return;
    } catch (err) {
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch {
        // ignore
      }

      if (attempt === maxRetries) {
        try {
          fs.writeFileSync(filePath, content, 'utf8');
          return;
        } catch (directErr) {
          throw new Error(
            `Failed to write to "${filePath}" after ${maxRetries} attempts: ${directErr instanceof Error ? directErr.message : String(directErr)}`,
          );
        }
      }

      const waitTill = Date.now() + retryDelayMs * attempt;
      while (Date.now() < waitTill) {
        // busy wait backoff
      }
    }
  }
};

export const safeWriteJsonSync = (filePath, data, spaces = 2) => {
  safeWriteFileSync(filePath, `${JSON.stringify(data, null, spaces)}\n`);
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
  effectiveOptions = createEffectiveScanOptions(options),
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
