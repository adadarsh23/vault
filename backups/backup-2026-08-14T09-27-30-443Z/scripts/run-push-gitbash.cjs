#!/usr/bin/env node

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const candidates = [
  process.env.GIT_BASH,
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
].filter(Boolean);

const bashPath = candidates.find((candidate) => fs.existsSync(candidate));

if (!bashPath) {
  console.error('[ERROR] Git Bash not found.');
  console.error('[ERROR] Install Git for Windows or set GIT_BASH to your bash.exe path.');
  process.exit(1);
}

const args = ['./push.sh', ...process.argv.slice(2)];
const result = spawnSync(bashPath, args, {
  stdio: 'inherit',
  shell: false,
});

if (result.error) {
  console.error(`[ERROR] Failed to run Git Bash: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
