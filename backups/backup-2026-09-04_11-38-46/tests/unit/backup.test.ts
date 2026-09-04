import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  formatBytes,
  sanitizeBackupName,
  getFormattedDate,
  isExcludedItem,
  shouldExcludePath,
  calculateDirectoryStats,
  collectProjectFiles,
  createBackup,
  renameWithRetrySync,
  verifyBackup,
  restoreBackup,
  pruneOldBackups,
  parseCliArgs,
  loadBackupsIndex,
  MANIFEST_FILENAME,
} from '../../scripts/backup.mjs';

describe('backup utility', () => {
  let tempRoot: string;
  let backupsRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-backup-test-'));
    backupsRoot = path.join(tempRoot, 'backups');
    fs.mkdirSync(backupsRoot, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempRoot)) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    } catch {
      // ignore temp cleanup error
    }
  });

  describe('formatBytes', () => {
    it('formats 0 bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('formats bytes, KB, MB, and GB', () => {
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1024 * 1024 * 5.5)).toBe('5.50 MB');
      expect(formatBytes(1024 * 1024 * 1024 * 2)).toBe('2.00 GB');
    });

    it('handles negative or invalid inputs gracefully', () => {
      expect(formatBytes(-100 as any)).toBe('0 B');
      expect(formatBytes(NaN as any)).toBe('0 B');
    });
  });

  describe('sanitizeBackupName', () => {
    it('sanitizes special characters and spaces', () => {
      expect(sanitizeBackupName('my backup: v1.0 / test*?')).toBe('my-backup-v1.0-test');
      expect(sanitizeBackupName('   pre-release..test   ')).toBe('pre-release.test');
    });

    it('handles empty input', () => {
      expect(sanitizeBackupName('')).toBe('');
      expect(sanitizeBackupName(null as any)).toBe('');
    });
  });

  describe('getFormattedDate', () => {
    it('generates consistent timestamps and format strings', () => {
      const fixedDate = new Date(2026, 7, 25, 20, 30, 45); // Month is 0-indexed (7 = Aug)
      const res = getFormattedDate(fixedDate);

      expect(res.localDateStr).toBe('2026-08-25 20:30:45');
      expect(res.folderStamp).toBe('2026-08-25_20-30-45');
      expect(res.timestamp).toBe(fixedDate.getTime());
    });
  });

  describe('exclusions & filtering', () => {
    it('excludes specified directories (node_modules, .git, backups, backup, logs, log)', () => {
      expect(isExcludedItem('node_modules')).toBe(true);
      expect(isExcludedItem('.git')).toBe(true);
      expect(isExcludedItem('backups')).toBe(true);
      expect(isExcludedItem('backup')).toBe(true);
      expect(isExcludedItem('logs')).toBe(true);
      expect(isExcludedItem('log')).toBe(true);
    });

    it('excludes specified file names and extensions', () => {
      expect(isExcludedItem('.DS_Store')).toBe(true);
      expect(isExcludedItem('Thumbs.db')).toBe(true);
      expect(isExcludedItem('desktop.ini')).toBe(true);
      expect(isExcludedItem('vault-production.zip')).toBe(true);

      expect(isExcludedItem('test.log')).toBe(true);
      expect(isExcludedItem('test.tmp')).toBe(true);
      expect(isExcludedItem('test.temp')).toBe(true);
      expect(isExcludedItem('test.bak')).toBe(true);
      expect(isExcludedItem('test.swp')).toBe(true);
      expect(isExcludedItem('test.swo')).toBe(true);
    });

    it('excludes npm/yarn/pnpm debug logs', () => {
      expect(isExcludedItem('npm-debug.log')).toBe(true);
      expect(isExcludedItem('npm-debug.log.1234')).toBe(true);
      expect(isExcludedItem('yarn-debug.log')).toBe(true);
      expect(isExcludedItem('yarn-error.log')).toBe(true);
      expect(isExcludedItem('pnpm-debug.log')).toBe(true);
    });

    it('includes all other project files and configs in backup (e.g. .env, build, dist, source files)', () => {
      expect(isExcludedItem('.env')).toBe(false);
      expect(isExcludedItem('.env.local')).toBe(false);
      expect(isExcludedItem('.env.production')).toBe(false);
      expect(isExcludedItem('.env.example')).toBe(false);
      expect(isExcludedItem('dist')).toBe(false);
      expect(isExcludedItem('build')).toBe(false);
      expect(isExcludedItem('coverage')).toBe(false);
      expect(isExcludedItem('.cache')).toBe(false);
      expect(isExcludedItem('secrets.json')).toBe(false);
    });

    it('correctly evaluates shouldExcludePath with nested paths', () => {
      const srcFile = path.join(tempRoot, 'src', 'index.ts');
      const envFile = path.join(tempRoot, '.env');
      const nodeModulesFile = path.join(tempRoot, 'node_modules', 'pkg', 'index.js');
      const backupDir = path.join(backupsRoot, 'backup-123');

      expect(shouldExcludePath(srcFile, tempRoot, backupsRoot)).toBe(false);
      expect(shouldExcludePath(envFile, tempRoot, backupsRoot)).toBe(false);
      expect(shouldExcludePath(nodeModulesFile, tempRoot, backupsRoot)).toBe(true);
      expect(shouldExcludePath(backupDir, tempRoot, backupsRoot)).toBe(true);
    });
  });

  describe('directory traversal and stats', () => {
    it('calculates stats for directory correctly', () => {
      const testDir = path.join(tempRoot, 'test-stats');
      fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(path.join(testDir, 'file1.txt'), 'hello', 'utf8');
      fs.writeFileSync(path.join(testDir, 'file2.txt'), 'world123', 'utf8');

      const subDir = path.join(testDir, 'sub');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'file3.txt'), '!', 'utf8');

      const stats = calculateDirectoryStats(testDir);
      expect(stats.fileCount).toBe(3);
      expect(stats.dirCount).toBe(1);
      expect(stats.totalSize).toBe(5 + 8 + 1);
    });

    it('collects project files while respecting exclusions and including other files', () => {
      fs.writeFileSync(path.join(tempRoot, 'package.json'), '{"name":"test"}', 'utf8');
      fs.mkdirSync(path.join(tempRoot, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, 'src', 'index.ts'), 'console.log("hi");', 'utf8');
      fs.writeFileSync(path.join(tempRoot, '.env'), 'MONGODB_URI=xyz', 'utf8');

      // Excluded dirs and files
      fs.mkdirSync(path.join(tempRoot, 'node_modules', 'pkg'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, 'node_modules', 'pkg', 'index.js'), 'bad', 'utf8');
      fs.writeFileSync(path.join(tempRoot, 'error.log'), 'error', 'utf8');
      fs.writeFileSync(path.join(tempRoot, '.DS_Store'), 'ds', 'utf8');

      const result = collectProjectFiles(tempRoot, backupsRoot);
      const relativePaths = result.files.map((f: any) => f.relativePath);

      expect(relativePaths).toContain('package.json');
      expect(relativePaths).toContain('src/index.ts');
      expect(relativePaths).toContain('.env');
      expect(relativePaths).not.toContain('node_modules/pkg/index.js');
      expect(relativePaths).not.toContain('error.log');
      expect(relativePaths).not.toContain('.DS_Store');
    });
  });

  describe('createBackup & verifyBackup lifecycle', () => {
    it('creates a verified backup with manifest and index', () => {
      fs.writeFileSync(path.join(tempRoot, 'index.html'), '<html>test</html>', 'utf8');
      fs.mkdirSync(path.join(tempRoot, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, 'src', 'app.ts'), 'export const a = 1;', 'utf8');

      const result = createBackup({
        root: tempRoot,
        backupsRoot,
        name: 'test-backup',
        verify: true,
      });

      expect(result.status).toBe('success');
      expect(result.totalFiles).toBe(2);
      expect(result.verified).toBe(true);

      const targetDir = result.path;
      expect(fs.existsSync(targetDir)).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'src', 'app.ts'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, MANIFEST_FILENAME))).toBe(true);

      // Verify manifest contents
      const manifest = JSON.parse(fs.readFileSync(path.join(targetDir, MANIFEST_FILENAME), 'utf8'));
      expect(manifest.backupVersion).toBe('2.0.0');
      expect(manifest.folder).toBe('backup-test-backup');
      expect(manifest.totalFiles).toBe(2);
      expect(manifest.files).toHaveLength(2);
      expect(manifest.files[0].sha256).toBeDefined();

      // Verify index
      const index = loadBackupsIndex(backupsRoot);
      expect(index.totalBackups).toBe(1);
      expect(index.backups[0].folder).toBe('backup-test-backup');

      // Verify integrity check function
      const verification = verifyBackup(targetDir, { checkSha256: true });
      expect(verification.valid).toBe(true);
      expect(verification.errors).toHaveLength(0);
    });

    it('detects tampering or corruption during verification', () => {
      fs.writeFileSync(path.join(tempRoot, 'test.txt'), 'original content', 'utf8');

      const result = createBackup({
        root: tempRoot,
        backupsRoot,
        name: 'tamper-test',
      });

      const backupDir = result.path;

      // Tamper with file
      fs.writeFileSync(path.join(backupDir, 'test.txt'), 'corrupted modified content', 'utf8');

      const verification = verifyBackup(backupDir, { checkSha256: true });
      expect(verification.valid).toBe(false);
      expect(verification.errors.length).toBeGreaterThan(0);
      expect(verification.errors.some((e: any) => e.includes('mismatch'))).toBe(true);
    });

    it('supports dry-run mode without writing to destination', () => {
      fs.writeFileSync(path.join(tempRoot, 'file.txt'), 'dry run content', 'utf8');

      const result = createBackup({
        root: tempRoot,
        backupsRoot,
        name: 'dry-run-backup',
        dryRun: true,
      });

      expect(result.status).toBe('dry-run');
      expect(result.totalFiles).toBe(1);
      expect(fs.existsSync(result.destination)).toBe(false);
    });

    it('retries transient Windows rename errors', () => {
      const sourceDir = path.join(tempRoot, 'staging');
      const targetDir = path.join(tempRoot, 'final');
      fs.mkdirSync(sourceDir);

      const renameSpy = vi.spyOn(fs, 'renameSync');
      renameSpy.mockImplementationOnce(() => {
        const error = new Error('file is temporarily locked') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      });

      try {
        renameWithRetrySync(sourceDir, targetDir, 2, 1);
      } finally {
        renameSpy.mockRestore();
      }

      expect(fs.existsSync(sourceDir)).toBe(false);
      expect(fs.existsSync(targetDir)).toBe(true);
    });
  });

  describe('pruning', () => {
    it('prunes older backups keeping only latest N', () => {
      // Create 3 mock backup folders
      const b1 = path.join(backupsRoot, 'backup-2026-08-01_10-00-00');
      const b2 = path.join(backupsRoot, 'backup-2026-08-02_10-00-00');
      const b3 = path.join(backupsRoot, 'backup-2026-08-03_10-00-00');

      fs.mkdirSync(b1, { recursive: true });
      fs.mkdirSync(b2, { recursive: true });
      fs.mkdirSync(b3, { recursive: true });

      const pruneResult = pruneOldBackups(backupsRoot, 2, { quiet: true });
      expect(pruneResult.pruned).toEqual(['backup-2026-08-01_10-00-00']);
      expect(pruneResult.kept).toEqual([
        'backup-2026-08-03_10-00-00',
        'backup-2026-08-02_10-00-00',
      ]);

      expect(fs.existsSync(b1)).toBe(false);
      expect(fs.existsSync(b2)).toBe(true);
      expect(fs.existsSync(b3)).toBe(true);
    });
  });

  describe('restoreBackup', () => {
    it('restores files from a valid backup to a clean target directory', () => {
      fs.writeFileSync(path.join(tempRoot, 'app.config.json'), '{"port":3000}', 'utf8');
      fs.mkdirSync(path.join(tempRoot, 'public'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, 'public', 'logo.svg'), '<svg></svg>', 'utf8');

      createBackup({
        root: tempRoot,
        backupsRoot,
        name: 'restore-source',
      });

      const restoreDest = path.join(tempRoot, 'restored-output');
      const restoreResult = restoreBackup({
        root: tempRoot,
        backupsRoot,
        backupName: 'backup-restore-source',
        targetDir: restoreDest,
      });

      expect(restoreResult.status).toBe('restored');
      expect(restoreResult.totalFiles).toBe(2);
      expect(fs.existsSync(path.join(restoreDest, 'app.config.json'))).toBe(true);
      expect(fs.existsSync(path.join(restoreDest, 'public', 'logo.svg'))).toBe(true);
    });
  });

  describe('parseCliArgs', () => {
    it('parses commands and options correctly', () => {
      const args1 = parseCliArgs(['--name=deploy-1', '--keep=3', '--verify', '--dry-run']);
      expect(args1.name).toBe('deploy-1');
      expect(args1.keep).toBe(3);
      expect(args1.verify).toBe(true);
      expect(args1.dryRun).toBe(true);
      expect(args1.command).toBe('backup');

      const args2 = parseCliArgs(['info', '--json']);
      expect(args2.command).toBe('info');
      expect(args2.json).toBe(true);

      const args3 = parseCliArgs(['verify', 'backup-123']);
      expect(args3.command).toBe('verify');
      expect(args3.target).toBe('backup-123');

      const args4 = parseCliArgs(['restore', 'backup-123', '--restore-to=/tmp/test']);
      expect(args4.command).toBe('restore');
      expect(args4.target).toBe('backup-123');
      expect(args4.restoreTo).toBe('/tmp/test');
    });
  });
});
