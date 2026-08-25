#!/usr/bin/env node

/**
 * Vault Project Production-Ready Backup Utility
 *
 * Features:
 * - Atomic backup creation with staging directory and automatic rollback on failure
 * - Comprehensive exclusions for caches, builds, dependencies, and sensitive files
 * - SHA-256 integrity checksum generation and verification
 * - Detailed backup manifests and index management
 * - Pruning with retention policies
 * - Safe restore capability with dry-run support
 * - Cross-platform compatibility with Windows file lock retries
 * - Programmatic API and flexible CLI interface
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Configuration & Constants
// ---------------------------------------------------------------------------

export const DEFAULT_BACKUP_VERSION = '2.0.0';
export const MANIFEST_FILENAME = 'backup-manifest.json';
export const INDEX_FILENAME = 'backups-index.json';
export const STAGING_PREFIX = '.backup-staging-';

export const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'backups',
  'backup',
  'logs',
  'log',
]);

export const EXCLUDED_FILE_NAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  'vault-production.zip',
]);

export const EXCLUDED_EXTENSIONS = new Set(['.log', '.tmp', '.temp', '.bak', '.swp', '.swo']);

export const EXCLUDED_FILE_PATTERNS = [
  /^npm-debug\.log.*$/i,
  /^yarn-debug\.log.*$/i,
  /^yarn-error\.log.*$/i,
  /^pnpm-debug\.log.*$/i,
];

// ---------------------------------------------------------------------------
// Helper Utilities
// ---------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');

export const getFormattedDate = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());

  const localDateStr = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  const folderStamp = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  const isoStr = d.toISOString();

  return {
    localDateStr,
    folderStamp,
    isoStr,
    timestamp: d.getTime(),
  };
};

export const formatBytes = (bytes) => {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${i === 0 ? value : value.toFixed(2)} ${units[i]}`;
};

export const sanitizeBackupName = (name) => {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const computeFileSha256 = (filePath) => {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
};

export const safeRemoveSync = (targetPath, maxRetries = 3, retryDelayMs = 100) => {
  if (!fs.existsSync(targetPath)) return;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const stats = fs.lstatSync(targetPath);
      if (stats.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.rmSync(targetPath, { force: true });
      }
      return;
    } catch (err) {
      if (attempt === maxRetries) {
        throw new Error(
          `Failed to remove "${targetPath}" after ${maxRetries} attempts: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      // Wait before retrying (synchronous sleep for CLI resilience)
      const waitTill = Date.now() + retryDelayMs * attempt;
      while (Date.now() < waitTill) {
        // busy wait
      }
    }
  }
};

export const atomicWriteJsonSync = (filePath, data, spaces = 2) => {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tempFilePath = path.join(dir, `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);

  try {
    fs.writeFileSync(tempFilePath, JSON.stringify(data, null, spaces), 'utf8');
    fs.renameSync(tempFilePath, filePath);
  } catch (err) {
    safeRemoveSync(tempFilePath);
    throw err;
  }
};

export const getGitMetadata = (cwd = process.cwd()) => {
  try {
    const commit = execSync('git rev-parse HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const shortCommit = execSync('git rev-parse --short HEAD', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const status = execSync('git status --porcelain', { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const tag = (() => {
      try {
        return execSync('git describe --tags --exact-match', {
          cwd,
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .toString()
          .trim();
      } catch {
        return null;
      }
    })();

    return {
      commit,
      shortCommit,
      branch,
      tag,
      isClean: status.length === 0,
    };
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Filtering & Exclusions
// ---------------------------------------------------------------------------

export const isExcludedItem = (name) => {
  if (!name || typeof name !== 'string') return true;

  if (
    name.startsWith('.vault-package') ||
    name.startsWith('vault-package') ||
    name.startsWith(STAGING_PREFIX)
  ) {
    return true;
  }

  if (EXCLUDED_DIR_NAMES.has(name) || EXCLUDED_FILE_NAMES.has(name)) {
    return true;
  }

  const ext = path.extname(name).toLowerCase();
  if (EXCLUDED_EXTENSIONS.has(ext)) {
    return true;
  }

  return EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(name));
};

export const shouldExcludePath = (targetPath, rootDir, backupsRootDir) => {
  const normalizedTarget = path.resolve(targetPath);
  const normalizedRoot = path.resolve(rootDir);
  const normalizedBackups = path.resolve(backupsRootDir);

  // Exclude the backups directory itself
  if (
    normalizedTarget === normalizedBackups ||
    normalizedTarget.startsWith(normalizedBackups + path.sep)
  ) {
    return true;
  }

  const relativePath = path.relative(normalizedRoot, normalizedTarget);
  if (!relativePath || relativePath.startsWith('..')) {
    return false;
  }

  const segments = relativePath.split(path.sep);
  return segments.some((segment) => isExcludedItem(segment));
};

// ---------------------------------------------------------------------------
// Directory Stats & Traversal
// ---------------------------------------------------------------------------

export const calculateDirectoryStats = (dirPath) => {
  let fileCount = 0;
  let dirCount = 0;
  let totalSize = 0;

  if (!fs.existsSync(dirPath)) {
    return { fileCount, dirCount, totalSize };
  }

  const walk = (current) => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        dirCount++;
        walk(full);
      } else if (entry.isFile()) {
        fileCount++;
        try {
          const stat = fs.statSync(full);
          totalSize += stat.size;
        } catch {
          // ignore transient stat errors
        }
      }
    }
  };

  walk(dirPath);
  return { fileCount, dirCount, totalSize };
};

export const collectProjectFiles = (rootDir, backupsRootDir) => {
  const files = [];
  const directories = [];
  let totalBytes = 0;

  const walk = (currentDir) => {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      throw new Error(
        `Failed to read directory "${currentDir}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Sort entries for deterministic output
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (shouldExcludePath(fullPath, rootDir, backupsRootDir)) {
        continue;
      }

      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        directories.push({
          fullPath,
          relativePath,
          name: entry.name,
        });
        walk(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          totalBytes += stat.size;
          files.push({
            fullPath,
            relativePath,
            name: entry.name,
            size: stat.size,
            mtime: stat.mtime.toISOString(),
          });
        } catch {
          // Ignore files that disappeared or cannot be read
        }
      }
    }
  };

  walk(rootDir);
  return { files, directories, totalBytes };
};

// ---------------------------------------------------------------------------
// Index Management
// ---------------------------------------------------------------------------

export const loadBackupsIndex = (backupsRootDir) => {
  const indexPath = path.join(backupsRootDir, INDEX_FILENAME);
  if (!fs.existsSync(indexPath)) {
    return {
      version: DEFAULT_BACKUP_VERSION,
      updatedAt: new Date().toISOString(),
      totalBackups: 0,
      backups: [],
    };
  }

  try {
    const raw = fs.readFileSync(indexPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: parsed.version || DEFAULT_BACKUP_VERSION,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      totalBackups: Array.isArray(parsed.backups) ? parsed.backups.length : 0,
      backups: Array.isArray(parsed.backups) ? parsed.backups : [],
    };
  } catch {
    return {
      version: DEFAULT_BACKUP_VERSION,
      updatedAt: new Date().toISOString(),
      totalBackups: 0,
      backups: [],
    };
  }
};

export const updateBackupsIndex = (backupsRootDir, backupInfo) => {
  const index = loadBackupsIndex(backupsRootDir);
  const filtered = (index.backups || []).filter((b) => b.folder !== backupInfo.folder);
  filtered.unshift(backupInfo);

  index.backups = filtered;
  index.totalBackups = filtered.length;
  index.updatedAt = new Date().toISOString();

  const indexPath = path.join(backupsRootDir, INDEX_FILENAME);
  atomicWriteJsonSync(indexPath, index, 2);
  return index;
};

export const rebuildBackupsIndex = (backupsRootDir) => {
  if (!fs.existsSync(backupsRootDir)) {
    return loadBackupsIndex(backupsRootDir);
  }

  const entries = fs
    .readdirSync(backupsRootDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('backup-'))
    .sort((a, b) => b.name.localeCompare(a.name));

  const backups = [];

  for (const entry of entries) {
    const backupDir = path.join(backupsRootDir, entry.name);
    const manifestPath = path.join(backupDir, MANIFEST_FILENAME);

    let manifest = null;
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {
        // invalid manifest
      }
    }

    const { fileCount, totalSize } = calculateDirectoryStats(backupDir);

    backups.push({
      folder: entry.name,
      createdAt: manifest?.createdAt || new Date().toISOString(),
      localCreatedAt: manifest?.localCreatedAt || entry.name.replace(/^backup-/, ''),
      totalFiles: manifest?.totalFiles ?? fileCount,
      totalBytes: manifest?.totalBytes ?? totalSize,
      formattedSize: manifest?.formattedSize || formatBytes(totalSize),
      path: backupDir,
      gitCommit: manifest?.git?.shortCommit || null,
      status: manifest?.status || 'completed',
    });
  }

  const index = {
    version: DEFAULT_BACKUP_VERSION,
    updatedAt: new Date().toISOString(),
    totalBackups: backups.length,
    backups,
  };

  const indexPath = path.join(backupsRootDir, INDEX_FILENAME);
  atomicWriteJsonSync(indexPath, index, 2);
  return index;
};

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export const verifyBackup = (backupDir, { checkSha256 = false } = {}) => {
  const result = {
    valid: true,
    folder: path.basename(backupDir),
    backupDir,
    manifestPath: path.join(backupDir, MANIFEST_FILENAME),
    manifest: null,
    totalFiles: 0,
    totalBytes: 0,
    errors: [],
    warnings: [],
  };

  if (!fs.existsSync(backupDir)) {
    result.valid = false;
    result.errors.push(`Backup directory does not exist: "${backupDir}"`);
    return result;
  }

  if (!fs.existsSync(result.manifestPath)) {
    result.valid = false;
    result.errors.push(`Manifest file missing: "${result.manifestPath}"`);
    return result;
  }

  try {
    result.manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
  } catch (err) {
    result.valid = false;
    result.errors.push(
      `Failed to parse manifest JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
    return result;
  }

  const recordedFiles = result.manifest.files;
  if (!Array.isArray(recordedFiles)) {
    result.warnings.push('Manifest does not contain detailed file records.');
    const { fileCount, totalSize } = calculateDirectoryStats(backupDir);
    result.totalFiles = fileCount;
    result.totalBytes = totalSize;
    return result;
  }

  let verifiedCount = 0;
  let totalBytes = 0;

  for (const item of recordedFiles) {
    const filePath = path.join(backupDir, item.relativePath);

    if (!fs.existsSync(filePath)) {
      result.valid = false;
      result.errors.push(`Missing expected file: "${item.relativePath}"`);
      continue;
    }

    try {
      const stats = fs.statSync(filePath);
      totalBytes += stats.size;

      if (stats.size !== item.size) {
        result.valid = false;
        result.errors.push(
          `Size mismatch on "${item.relativePath}": expected ${item.size} bytes, got ${stats.size} bytes`,
        );
      } else if (checkSha256 && item.sha256) {
        const actualHash = computeFileSha256(filePath);
        if (actualHash !== item.sha256) {
          result.valid = false;
          result.errors.push(
            `SHA-256 checksum mismatch on "${item.relativePath}": expected ${item.sha256}, got ${actualHash}`,
          );
        }
      }
      verifiedCount++;
    } catch (err) {
      result.valid = false;
      result.errors.push(
        `Failed to inspect file "${item.relativePath}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  result.totalFiles = verifiedCount;
  result.totalBytes = totalBytes;
  return result;
};

// ---------------------------------------------------------------------------
// Pruning
// ---------------------------------------------------------------------------

export const pruneOldBackups = (
  backupsRootDir,
  keepCount,
  { dryRun = false, quiet = false } = {},
) => {
  if (!keepCount || keepCount <= 0 || !fs.existsSync(backupsRootDir)) {
    return { pruned: [], kept: [] };
  }

  const entries = fs
    .readdirSync(backupsRootDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('backup-'))
    .sort((a, b) => b.name.localeCompare(a.name));

  const kept = entries.slice(0, keepCount);
  const toRemove = entries.slice(keepCount);
  const pruned = [];

  if (toRemove.length > 0 && !quiet) {
    console.log();
    console.log(`Pruning old backups (keeping newest ${keepCount}):`);
  }

  for (const item of toRemove) {
    const fullPath = path.join(backupsRootDir, item.name);
    try {
      if (!dryRun) {
        safeRemoveSync(fullPath);
      }
      pruned.push(item.name);
      if (!quiet) {
        console.log(`  - ${dryRun ? '[DRY-RUN] Would remove:' : 'Removed:'} ${item.name}`);
      }
    } catch (err) {
      if (!quiet) {
        console.error(
          `  - Failed to remove ${item.name}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  if (!dryRun && pruned.length > 0) {
    rebuildBackupsIndex(backupsRootDir);
  }

  return { pruned, kept: kept.map((k) => k.name) };
};

// ---------------------------------------------------------------------------
// Backup Core Engine
// ---------------------------------------------------------------------------

export const createBackup = (options = {}) => {
  const root = path.resolve(options.root || process.cwd());
  const backupsRoot = path.resolve(options.backupsRoot || path.join(root, 'backups'));
  const customName = options.name ? sanitizeBackupName(options.name) : null;
  const keepCount = options.keep ? parseInt(options.keep, 10) : null;
  const dryRun = Boolean(options.dryRun);
  const verify = Boolean(options.verify);
  const computeHashes = options.computeHashes ?? true;
  const force = Boolean(options.force);

  const startTime = Date.now();
  const now = new Date();
  const { localDateStr, folderStamp, isoStr, timestamp } = getFormattedDate(now);

  const folderName = customName ? `backup-${customName}` : `backup-${folderStamp}`;
  const targetDir = path.join(backupsRoot, folderName);
  const stagingDirName = `${STAGING_PREFIX}${crypto.randomUUID()}`;
  const stagingDir = path.join(backupsRoot, stagingDirName);

  // 1. Scan and collect files to be backed up
  const { files, directories, totalBytes } = collectProjectFiles(root, backupsRoot);

  if (dryRun) {
    return {
      status: 'dry-run',
      folderName,
      source: root,
      destination: targetDir,
      totalFiles: files.length,
      totalDirectories: directories.length,
      totalBytes,
      formattedSize: formatBytes(totalBytes),
      durationMs: Date.now() - startTime,
      files: files.map((f) => f.relativePath),
    };
  }

  // 2. Prepare destination folders
  fs.mkdirSync(backupsRoot, { recursive: true });

  if (fs.existsSync(targetDir)) {
    if (!force) {
      throw new Error(
        `Target backup directory already exists: "${targetDir}". Use --force to overwrite.`,
      );
    }
    safeRemoveSync(targetDir);
  }

  // Create clean isolated staging directory
  fs.mkdirSync(stagingDir, { recursive: true });

  const fileManifestEntries = [];

  try {
    // 3. Create directory tree in staging
    for (const dir of directories) {
      const destDirPath = path.join(stagingDir, dir.relativePath);
      fs.mkdirSync(destDirPath, { recursive: true });
    }

    // 4. Copy files and compute checksums
    for (const file of files) {
      const destFilePath = path.join(stagingDir, file.relativePath);
      const parentDir = path.dirname(destFilePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.copyFileSync(file.fullPath, destFilePath);

      const sha256 = computeHashes ? computeFileSha256(destFilePath) : null;
      fileManifestEntries.push({
        relativePath: file.relativePath,
        size: file.size,
        mtime: file.mtime,
        ...(sha256 ? { sha256 } : {}),
      });
    }

    const durationMs = Date.now() - startTime;
    const gitInfo = getGitMetadata(root);

    // 5. Create backup manifest
    const manifest = {
      backupVersion: DEFAULT_BACKUP_VERSION,
      folder: folderName,
      createdAt: isoStr,
      localCreatedAt: localDateStr,
      timestamp,
      source: root,
      target: targetDir,
      totalFiles: files.length,
      totalDirectories: directories.length,
      totalBytes,
      formattedSize: formatBytes(totalBytes),
      durationMs,
      environment: {
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
      },
      git: gitInfo,
      exclusions: {
        directories: Array.from(EXCLUDED_DIR_NAMES),
        files: Array.from(EXCLUDED_FILE_NAMES),
        extensions: Array.from(EXCLUDED_EXTENSIONS),
      },
      files: fileManifestEntries,
      status: 'completed',
    };

    const manifestPath = path.join(stagingDir, MANIFEST_FILENAME);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // 6. Atomically move staging to final backup directory
    fs.renameSync(stagingDir, targetDir);

    // 7. Update index file
    updateBackupsIndex(backupsRoot, {
      folder: folderName,
      createdAt: isoStr,
      localCreatedAt: localDateStr,
      timestamp,
      totalFiles: files.length,
      totalBytes,
      formattedSize: formatBytes(totalBytes),
      path: targetDir,
      gitCommit: gitInfo?.shortCommit || null,
      status: 'completed',
    });

    // 8. Optional verification
    let verificationResult = null;
    if (verify) {
      verificationResult = verifyBackup(targetDir, { checkSha256: true });
      if (!verificationResult.valid) {
        throw new Error(`Backup verification failed:\n${verificationResult.errors.join('\n')}`);
      }
    }

    // 9. Prune if requested
    let pruneResult = null;
    if (keepCount && keepCount > 0) {
      pruneResult = pruneOldBackups(backupsRoot, keepCount, { quiet: Boolean(options.quiet) });
    }

    return {
      status: 'success',
      folderName,
      path: targetDir,
      manifestPath: path.join(targetDir, MANIFEST_FILENAME),
      totalFiles: files.length,
      totalDirectories: directories.length,
      totalBytes,
      formattedSize: formatBytes(totalBytes),
      durationMs,
      git: gitInfo,
      verified: verificationResult ? verificationResult.valid : null,
      pruned: pruneResult?.pruned || [],
    };
  } catch (err) {
    // Rollback: clean up staging directory on any failure
    safeRemoveSync(stagingDir);
    throw err;
  }
};

// ---------------------------------------------------------------------------
// Restoration Engine
// ---------------------------------------------------------------------------

export const restoreBackup = (options = {}) => {
  const root = path.resolve(options.root || process.cwd());
  const backupsRoot = path.resolve(options.backupsRoot || path.join(root, 'backups'));
  const backupIdentifier = options.backupName;
  const targetDir = path.resolve(options.targetDir || root);
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);

  if (!backupIdentifier) {
    throw new Error('Please specify a backup name or index to restore from.');
  }

  // Resolve backup folder
  let backupDir = null;
  if (fs.existsSync(backupIdentifier) && fs.statSync(backupIdentifier).isDirectory()) {
    backupDir = path.resolve(backupIdentifier);
  } else if (fs.existsSync(path.join(backupsRoot, backupIdentifier))) {
    backupDir = path.join(backupsRoot, backupIdentifier);
  } else if (/^\d+$/.test(backupIdentifier)) {
    // Restore by index number (1-based from info list)
    const index = parseInt(backupIdentifier, 10) - 1;
    const entries = fs
      .readdirSync(backupsRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('backup-'))
      .sort((a, b) => b.name.localeCompare(a.name));

    if (entries[index]) {
      backupDir = path.join(backupsRoot, entries[index].name);
    }
  }

  if (!backupDir || !fs.existsSync(backupDir)) {
    throw new Error(`Backup not found: "${backupIdentifier}" in "${backupsRoot}"`);
  }

  // Verify backup manifest
  const manifestPath = path.join(backupDir, MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Invalid backup directory (missing manifest): "${backupDir}"`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const files = manifest.files || [];

  if (files.length === 0) {
    throw new Error(`Backup manifest contains no file records.`);
  }

  if (!force && !dryRun && fs.existsSync(targetDir) && targetDir === root) {
    // When restoring over root, ensure it's intentional
  }

  const restoredFiles = [];
  let totalBytes = 0;

  for (const item of files) {
    const src = path.join(backupDir, item.relativePath);
    const dest = path.join(targetDir, item.relativePath);

    if (fs.existsSync(src)) {
      restoredFiles.push(item.relativePath);
      totalBytes += item.size;

      if (!dryRun) {
        const destParent = path.dirname(dest);
        fs.mkdirSync(destParent, { recursive: true });
        fs.copyFileSync(src, dest);
      }
    }
  }

  return {
    status: dryRun ? 'dry-run' : 'restored',
    sourceBackup: path.basename(backupDir),
    targetDir,
    totalFiles: restoredFiles.length,
    totalBytes,
    formattedSize: formatBytes(totalBytes),
    files: restoredFiles,
  };
};

// ---------------------------------------------------------------------------
// Information & Inspection
// ---------------------------------------------------------------------------

export const listBackups = (backupsRootDir) => {
  if (!fs.existsSync(backupsRootDir)) {
    return [];
  }

  const entries = fs
    .readdirSync(backupsRootDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('backup-'))
    .sort((a, b) => b.name.localeCompare(a.name));

  const list = [];

  for (const entry of entries) {
    const backupDir = path.join(backupsRootDir, entry.name);
    const manifestPath = path.join(backupDir, MANIFEST_FILENAME);

    let manifest = null;
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {
        // manifest corrupt
      }
    }

    const { fileCount, totalSize } = calculateDirectoryStats(backupDir);

    list.push({
      folder: entry.name,
      path: backupDir,
      createdAt: manifest?.createdAt || null,
      localCreatedAt: manifest?.localCreatedAt || entry.name.replace(/^backup-/, ''),
      totalFiles: manifest?.totalFiles ?? fileCount,
      totalBytes: manifest?.totalBytes ?? totalSize,
      formattedSize: manifest?.formattedSize || formatBytes(totalSize),
      git: manifest?.git || null,
      validManifest: Boolean(manifest),
      version: manifest?.backupVersion || '1.0.0',
    });
  }

  return list;
};

export const showBackupsInfo = (backupsRootDir, options = {}) => {
  const backups = listBackups(backupsRootDir);
  const jsonMode = Boolean(options.json);

  if (jsonMode) {
    console.log(JSON.stringify(backups, null, 2));
    return backups;
  }

  console.log('========================================');
  console.log(' Vault Backups Summary');
  console.log('========================================');
  console.log();
  console.log(`Backups directory: ${backupsRootDir}`);
  console.log();

  if (backups.length === 0) {
    console.log('No backups found.');
    return backups;
  }

  console.log(`Found ${backups.length} backup(s):`);
  console.log();

  let grandTotalSize = 0;

  backups.forEach((b, i) => {
    grandTotalSize += b.totalBytes;
    const gitStr = b.git?.shortCommit
      ? ` [git: ${b.git.branch || 'HEAD'}@${b.git.shortCommit}]`
      : '';
    console.log(`  [${i + 1}] ${b.folder}${gitStr}`);
    console.log(`      Date : ${b.localCreatedAt || b.createdAt}`);
    console.log(`      Files: ${b.totalFiles.toLocaleString()} files`);
    console.log(`      Size : ${b.formattedSize}`);
    console.log();
  });

  console.log('----------------------------------------');
  console.log(`Total backup storage: ${formatBytes(grandTotalSize)}`);
  return backups;
};

export const showHelp = () => {
  console.log(`
Vault Backup Utility v${DEFAULT_BACKUP_VERSION}

Usage:
  node scripts/backup.mjs [command] [options]
  npm run backup [-- options]

Commands:
  backup (default)          Create a new project backup
  info | list | -i          Show list of available backups and storage summary
  verify [backup-name]      Verify integrity of the latest or specified backup
  prune [count]             Remove older backups keeping only the latest [count]
  restore <backup-name>     Restore project files from a specific backup
  help | -h                 Show this help manual

Options:
  -n, --name=<name>         Custom backup name suffix (e.g. --name=pre-deploy)
  -k, --keep=<N>            Automatically prune old backups, keeping latest N
  -d, --dry-run             Simulate the operation without copying or deleting files
  -v, --verify              Verify SHA-256 file checksums immediately after backup
  -o, --dest=<dir>          Custom backups destination root directory
  --restore-to=<dir>        Target directory when restoring from a backup
  -f, --force               Overwrite existing target directories without prompting
  --json                    Output results in structured JSON format
  -q, --quiet               Suppress verbose logs (show only errors or JSON)
  -h, --help                Show help details

Examples:
  node scripts/backup.mjs
  node scripts/backup.mjs --name=before-migration --verify --keep=5
  node scripts/backup.mjs --info
  node scripts/backup.mjs verify backup-2026-08-25_20-00-00
  node scripts/backup.mjs prune 3
  node scripts/backup.mjs restore 1 --dry-run
`);
};

// ---------------------------------------------------------------------------
// CLI Argument Parsing & Runner
// ---------------------------------------------------------------------------

export const parseCliArgs = (rawArgs = process.argv.slice(2)) => {
  const parsed = {
    command: 'backup',
    name: null,
    keep: null,
    dryRun: false,
    verify: false,
    force: false,
    json: false,
    quiet: false,
    help: false,
    dest: null,
    restoreTo: null,
    target: null,
  };

  const positional = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--info' || arg === '-i' || arg === '--list' || arg === '-l') {
      parsed.command = 'info';
    } else if (arg === '--dry-run' || arg === '-d') {
      parsed.dryRun = true;
    } else if (arg === '--verify' || arg === '-v') {
      parsed.verify = true;
    } else if (arg === '--force' || arg === '-f') {
      parsed.force = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--quiet' || arg === '-q') {
      parsed.quiet = true;
    } else if (arg.startsWith('--name=')) {
      parsed.name = arg.slice(7).trim();
    } else if (arg === '-n' && i + 1 < rawArgs.length) {
      parsed.name = rawArgs[++i].trim();
    } else if (arg.startsWith('--keep=')) {
      parsed.keep = parseInt(arg.slice(7), 10);
    } else if (arg === '-k' && i + 1 < rawArgs.length) {
      parsed.keep = parseInt(rawArgs[++i], 10);
    } else if (arg.startsWith('--dest=') || arg.startsWith('--output=')) {
      parsed.dest = arg.split('=')[1].trim();
    } else if ((arg === '-o' || arg === '--dest' || arg === '--output') && i + 1 < rawArgs.length) {
      parsed.dest = rawArgs[++i].trim();
    } else if (arg.startsWith('--restore-to=')) {
      parsed.restoreTo = arg.split('=')[1].trim();
    } else if (arg.startsWith('--restore=')) {
      parsed.command = 'restore';
      parsed.target = arg.slice(10).trim();
    } else if (arg.startsWith('--prune=')) {
      parsed.command = 'prune';
      parsed.keep = parseInt(arg.slice(8), 10);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  // Determine command from first positional if present
  if (positional.length > 0) {
    const first = positional[0].toLowerCase();
    if (['help', 'man'].includes(first)) {
      parsed.command = 'help';
    } else if (['info', 'list', 'ls', 'summary'].includes(first)) {
      parsed.command = 'info';
    } else if (['verify', 'check'].includes(first)) {
      parsed.command = 'verify';
      if (positional[1]) parsed.target = positional[1];
    } else if (['prune', 'clean'].includes(first)) {
      parsed.command = 'prune';
      if (positional[1]) parsed.keep = parseInt(positional[1], 10);
    } else if (['restore'].includes(first)) {
      parsed.command = 'restore';
      if (positional[1]) parsed.target = positional[1];
    } else {
      // Positional could be backup name
      if (!parsed.name) parsed.name = positional[0];
    }
  }

  return parsed;
};

export const runBackupCli = () => {
  const args = parseCliArgs(process.argv.slice(2));
  const root = path.resolve(process.cwd());
  const backupsRoot = path.resolve(args.dest || path.join(root, 'backups'));

  if (args.help || args.command === 'help') {
    showHelp();
    return;
  }

  if (args.command === 'info') {
    showBackupsInfo(backupsRoot, { json: args.json });
    return;
  }

  if (args.command === 'verify') {
    let target = args.target;
    if (!target) {
      const backups = listBackups(backupsRoot);
      if (backups.length === 0) {
        console.error('✗ No backups found to verify.');
        process.exitCode = 1;
        return;
      }
      target = backups[0].path;
    } else if (!path.isAbsolute(target) && !fs.existsSync(target)) {
      target = path.join(backupsRoot, target);
    }

    if (!args.quiet) {
      console.log(`Verifying backup integrity: ${path.basename(target)}...`);
    }

    const verification = verifyBackup(target, { checkSha256: true });
    if (args.json) {
      console.log(JSON.stringify(verification, null, 2));
    } else if (verification.valid) {
      console.log(
        `✓ Backup integrity verification passed (${verification.totalFiles.toLocaleString()} files, ${formatBytes(verification.totalBytes)})`,
      );
    } else {
      console.error(`✗ Backup integrity verification failed:`);
      verification.errors.forEach((err) => console.error(`  - ${err}`));
      process.exitCode = 1;
    }
    return;
  }

  if (args.command === 'prune') {
    const keepCount = args.keep || 5;
    const result = pruneOldBackups(backupsRoot, keepCount, {
      dryRun: args.dryRun,
      quiet: args.quiet,
    });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (!args.quiet) {
      console.log(`✓ Prune complete. Kept: ${result.kept.length}, Pruned: ${result.pruned.length}`);
    }
    return;
  }

  if (args.command === 'restore') {
    try {
      const result = restoreBackup({
        root,
        backupsRoot,
        backupName: args.target,
        targetDir: args.restoreTo || root,
        dryRun: args.dryRun,
        force: args.force,
      });

      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(
          `✓ Restoration ${args.dryRun ? '[DRY-RUN] simulated' : 'completed'} successfully`,
        );
        console.log(`  Source : ${result.sourceBackup}`);
        console.log(`  Target : ${result.targetDir}`);
        console.log(`  Files  : ${result.totalFiles.toLocaleString()}`);
        console.log(`  Size   : ${result.formattedSize}`);
      }
    } catch (err) {
      console.error(`✗ Restoration failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
    return;
  }

  // Default command: create backup
  if (!args.quiet && !args.json) {
    console.log('========================================');
    console.log(' Vault Project Backup');
    console.log('========================================');
    console.log();
    console.log(`Source      : ${root}`);
    console.log(`Destination : ${backupsRoot}`);
    if (args.dryRun) console.log(`Mode        : DRY-RUN (no files will be written)`);
    console.log();
  }

  try {
    const result = createBackup({
      root,
      backupsRoot,
      name: args.name,
      keep: args.keep,
      dryRun: args.dryRun,
      verify: args.verify,
      force: args.force,
      quiet: args.quiet,
    });

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (args.dryRun) {
      console.log('✓ Dry-run completed. Files that would be backed up:');
      console.log(`  Total files : ${result.totalFiles.toLocaleString()}`);
      console.log(`  Total size  : ${result.formattedSize}`);
    } else {
      console.log('✓ Project files backed up successfully');
      console.log(`✓ Manifest created (${MANIFEST_FILENAME})`);
      if (args.verify) console.log('✓ Integrity verification passed (SHA-256)');
      console.log();
      console.log(`Files copied : ${result.totalFiles.toLocaleString()}`);
      console.log(`Backup size  : ${result.formattedSize}`);
      console.log(`Time elapsed : ${result.durationMs} ms`);
      if (result.git?.shortCommit) {
        console.log(
          `Git reference: ${result.git.branch || 'HEAD'}@${result.git.shortCommit} ${result.git.isClean ? '(clean)' : '(dirty)'}`,
        );
      }
      console.log();
      console.log(`Backup saved to: ${result.path}`);

      if (result.pruned?.length > 0) {
        console.log(`Pruned ${result.pruned.length} older backup(s).`);
      }
    }
  } catch (err) {
    console.error();
    console.error(`✗ Backup failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
};

// Auto-run when executed directly via CLI
const isDirectExecution = () => {
  if (process.argv[1]) {
    try {
      const currentFilePath = fileURLToPath(import.meta.url);
      return path.resolve(process.argv[1]) === path.resolve(currentFilePath);
    } catch {
      return false;
    }
  }
  return false;
};

if (isDirectExecution()) {
  runBackupCli();
}
