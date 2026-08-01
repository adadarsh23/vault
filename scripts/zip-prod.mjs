import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const tempDir = path.join(root, 'dist-temp');
const zipPath = path.join(root, 'vault-production.zip');
const filesToExclude = new Set([
  '.git',
  '.memory',
  'backups',
  'build',
  'logs',
  'node_modules',
  '.env',
  'dist-temp',
  'vault-production.zip',
  'vault-production',
]);

const removeIfExists = (targetPath) => {
  if (fs.existsSync(targetPath)) {
    const targetStats = fs.lstatSync(targetPath);
    if (targetStats.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      fs.rmSync(targetPath, { force: true });
    }
  }
};

const shouldExcludePath = (targetPath) => {
  const relativePath = path.relative(root, targetPath);
  if (!relativePath || relativePath.startsWith('..')) {
    return false;
  }

  const segments = relativePath.split(path.sep);
  return segments.some((segment) => filesToExclude.has(segment));
};

const archiveWithPowerShell = (shellName) =>
  spawnSync(
    shellName,
    [
      '-NoProfile',
      '-Command',
      'Compress-Archive -Path "dist-temp\\*" -DestinationPath "vault-production.zip" -Force',
    ],
    {
      cwd: root,
      stdio: 'inherit',
    }
  );

const archiveWithTar = () =>
  spawnSync('tar', ['-a', '-c', '-f', 'vault-production.zip', '-C', 'dist-temp', '.'], {
    cwd: root,
    stdio: 'inherit',
  });

try {
  removeIfExists(tempDir);
  removeIfExists(zipPath);

  fs.mkdirSync(tempDir, { recursive: true });

  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (filesToExclude.has(entry.name)) {
      continue;
    }

    const sourcePath = path.join(root, entry.name);
    const destinationPath = path.join(tempDir, entry.name);
    fs.cpSync(sourcePath, destinationPath, {
      recursive: true,
      filter: (source) => !shouldExcludePath(source),
    });
  }

  // Prefer tar because PowerShell Compress-Archive can fail with
  // "user-mapped section open" when a source file is memory-mapped.
  let archiveResult = archiveWithTar();

  if (archiveResult.error?.code === 'ENOENT') {
    archiveResult = archiveWithPowerShell('powershell');
    if (archiveResult.error?.code === 'ENOENT') {
      archiveResult = archiveWithPowerShell('pwsh');
    }
  }

  if (archiveResult.error) {
    throw archiveResult.error;
  }

  if (archiveResult.status !== 0) {
    process.exit(archiveResult.status ?? 1);
  }
} finally {
  removeIfExists(tempDir);
}
