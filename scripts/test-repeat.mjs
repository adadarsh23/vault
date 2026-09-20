import { spawnSync } from 'node:child_process';

// Cross-platform Vitest test repeater
// Usage:
//   node scripts/test-repeat.mjs [count] [vitest-args...]
// Examples:
//   node scripts/test-repeat.mjs 5
//   node scripts/test-repeat.mjs 10 tests/unit/session-realtime-revocation.test.ts

const rawArg = process.argv[2];
let count = 5;
let extraArgs = [];

if (rawArg && !isNaN(Number(rawArg))) {
  count = Math.max(1, parseInt(rawArg, 10));
  extraArgs = process.argv.slice(3);
} else {
  extraArgs = process.argv.slice(2);
}

if (!extraArgs.includes('run')) {
  extraArgs.unshift('run');
}

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

console.log(
  `\x1b[36mRepeating Vitest ${count} time(s): npx vitest ${extraArgs.join(' ')}\x1b[0m\n`,
);

let passed = 0;

for (let i = 1; i <= count; i++) {
  console.log(`\x1b[33m--- Iteration ${i} of ${count} ---\x1b[0m`);
  const result = spawnSync(npxCmd, ['vitest', ...extraArgs], {
    stdio: 'inherit',
    shell: isWin,
  });

  if (result.status !== 0) {
    console.error(
      `\x1b[31m\n[FAILED] Test run failed on iteration ${i} of ${count} (exit code ${result.status})\x1b[0m`,
    );
    process.exit(result.status || 1);
  }
  passed++;
}

console.log(`\x1b[32m\n[SUCCESS] All ${passed}/${count} iterations passed without failure!\x1b[0m`);
