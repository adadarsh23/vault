import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const mode = process.argv[2] || 'watch';
const explicitFiles = process.argv.slice(3);

const EXCLUDED_PREFIXES = [
  '.git/',
  '.memory/',
  'backups/',
  'build/',
  'dist/',
  'coverage/',
  'lighthouse/',
  'logs/',
  'test-results/',
  'node_modules/',
];

const EXCLUDED_FILENAMES = new Set(['stats.html', 'vault-production.zip']);

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.json',
]);

const runCommand = (command, args) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const shouldIncludeFile = (filePath) => {
  const normalized = filePath.replace(/\\/g, '/');

  if (EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return false;
  }

  const baseName = path.basename(normalized);
  if (EXCLUDED_FILENAMES.has(baseName)) {
    return false;
  }

  const extension = path.extname(normalized);
  return SOURCE_EXTENSIONS.has(extension);
};

const getChangedFiles = () => {
  const tracked =
    runCommand('git', ['diff', '--name-only', '--diff-filter=ACMRTUXB', 'HEAD']) || [];
  const untracked = runCommand('git', ['ls-files', '--others', '--exclude-standard']) || [];

  return [...new Set([...tracked, ...untracked])]
    .map((file) => path.normalize(file))
    .filter((file) => existsSync(file))
    .filter(shouldIncludeFile);
};

const files = explicitFiles.length > 0 ? explicitFiles : getChangedFiles();

if (files.length === 0) {
  console.log(
    explicitFiles.length > 0
      ? 'No existing files were provided to resolve related tests.'
      : 'No changed source files detected for related tests.',
  );
  process.exit(0);
}

const localVitestBin = path.join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
let command = process.execPath;
let commandArgs = [localVitestBin, 'related', '--configLoader', 'native', '--pool', 'threads'];

if (!existsSync(localVitestBin)) {
  const isWin = process.platform === 'win32';
  if (isWin) {
    command = 'cmd.exe';
    commandArgs = [
      '/d',
      '/s',
      '/c',
      'npx',
      'vitest',
      'related',
      '--configLoader',
      'native',
      '--pool',
      'threads',
    ];
  } else {
    command = 'npx';
    commandArgs = ['vitest', 'related', '--configLoader', 'native', '--pool', 'threads'];
  }
}

if (mode === 'run') {
  commandArgs.push('--run');
}

commandArgs.push(...files);

const result = spawnSync(command, commandArgs, {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? (result.error ? 1 : 0));
