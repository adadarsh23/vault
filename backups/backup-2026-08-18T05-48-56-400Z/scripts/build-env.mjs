import { spawnSync } from 'node:child_process';
import path from 'node:path';

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

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

const result = spawnSync(npxCmd, ['vite', ...viteArgs], {
  stdio: 'inherit',
  env,
  shell: isWin,
});

process.exit(result.status ?? 1);
