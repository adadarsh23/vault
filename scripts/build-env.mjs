import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const viteArgs = ['build'];
const envOverrides = {};

for (const arg of args) {
  if (arg.startsWith('--minify=')) {
    envOverrides.VITE_BUILD_MINIFY = arg.split('=')[1];
  } else if (arg.startsWith('--sourcemap=')) {
    envOverrides.VITE_BUILD_SOURCEMAP = arg.split('=')[1];
  } else if (arg === '--analyze') {
    envOverrides.ANALYZE_BUNDLE = 'true';
  } else if (arg.startsWith('--mode=')) {
    viteArgs.push(arg);
  } else if (arg === '--debug') {
    viteArgs.push('--debug');
  } else {
    viteArgs.push(arg);
  }
}

const env = {
  ...process.env,
  ...envOverrides,
};

for (const key of Object.keys(env)) {
  if (/^npm_config_global[-_]?ignore[-_]?file$/i.test(key)) {
    delete env[key];
  }
}

const root = process.cwd();
const localViteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

let command = process.execPath;
let commandArgs = [localViteBin, ...viteArgs];

if (!existsSync(localViteBin)) {
  const isWin = process.platform === 'win32';
  if (isWin) {
    command = 'cmd.exe';
    commandArgs = ['/d', '/s', '/c', 'npx', 'vite', ...viteArgs];
  } else {
    command = 'npx';
    commandArgs = ['vite', ...viteArgs];
  }
}

const result = spawnSync(command, commandArgs, {
  stdio: 'inherit',
  env,
  shell: false,
});

process.exit(result.status ?? (result.error ? 1 : 0));
