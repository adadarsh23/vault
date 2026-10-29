#!/usr/bin/env node
/**
 * run-tests-report.mjs
 * Runs all Vault test commands sequentially, collects results,
 * writes a JSON report, and optionally invokes send-gmail-report.mjs.
 *
 * Usage:
 *   node scripts/run-tests-report.mjs              # runs tests + sends email
 *   node scripts/run-tests-report.mjs --no-email   # runs tests only
 */

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, renameSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REPORT_DIR = join(ROOT, 'test-results');
const REPORT_PATH = join(REPORT_DIR, 'test-report.json');

const NO_EMAIL = process.argv.includes('--no-email');

// ─── Project meta ────────────────────────────────────────────────────────────
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const PROJECT = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  author: pkg.author?.name ?? pkg.author ?? 'unknown',
  repo: pkg.repository?.url ?? 'N/A',
  node: process.version,
  runAt: new Date().toISOString(),
};

// ─── All test commands (no watch / ui / debug variants) ──────────────────────
const TEST_COMMANDS = [
  // TypeScript checks
  { label: 'TypeCheck (client)', cmd: 'npm run typecheck' },
  { label: 'TypeCheck (server)', cmd: 'npm run typecheck:server' },

  // Unit tests
  { label: 'Unit Tests', cmd: 'npm run test:unit' },

  // Integration tests
  { label: 'Integration Tests', cmd: 'npm run test:integration' },

  // Auth tests
  { label: 'Auth Tests (unit)', cmd: 'npm run test:auth:unit' },
  { label: 'Auth Tests (integration)', cmd: 'npm run test:auth:integration' },
  { label: 'Auth Tests (security)', cmd: 'npm run test:auth:security' },

  // Security
  { label: 'Security Tests', cmd: 'npm run test:security' },

  // Crypto / Encryption
  { label: 'Crypto Tests', cmd: 'npm run test:crypto' },

  // Vault core
  { label: 'Vault Tests', cmd: 'npm run test:vault' },

  // Middleware
  { label: 'Middleware Tests', cmd: 'npm run test:middleware' },

  // Models & Validators
  { label: 'Model Schema Tests', cmd: 'npm run test:models' },
  { label: 'Validator Tests', cmd: 'npm run test:validators' },

  // API & Utils
  { label: 'API Client Tests', cmd: 'npm run test:api' },
  { label: 'Util Tests', cmd: 'npm run test:utils' },

  // Stores
  { label: 'Store Tests', cmd: 'npm run test:stores' },

  // Media & Streaming
  { label: 'Streaming Tests', cmd: 'npm run test:streaming' },
  { label: 'Streaming Media Tests', cmd: 'npm run test:streaming:media' },

  // Sync
  { label: 'Sync Tests', cmd: 'npm run test:sync' },

  // Monitoring / Lib
  { label: 'Monitoring Tests', cmd: 'npm run test:monitoring' },

  // Backup & Schema
  { label: 'Backup Tests', cmd: 'npm run test:backup' },
  { label: 'Schema Tests', cmd: 'npm run test:schema' },

  // Boot / Types
  { label: 'Boot Startup Tests', cmd: 'npm run test:boot' },
  { label: 'Type Guard Tests', cmd: 'npm run test:types' },

  // Password & Avatar
  { label: 'Password Tests', cmd: 'npm run test:password' },
  { label: 'Avatar Tests', cmd: 'npm run test:avatar' },

  // Workers / Multipart
  { label: 'Worker Pipeline Tests', cmd: 'npm run test:workers' },
  { label: 'Multipart Upload Tests', cmd: 'npm run test:multipart' },

  // Router & Layout
  { label: 'Router Tests', cmd: 'npm run test:router' },
  { label: 'Layout Tests', cmd: 'npm run test:layout' },
  { label: 'Error Boundary Tests', cmd: 'npm run test:error-boundary' },

  // Settings & Shortcuts
  { label: 'Settings Tests', cmd: 'npm run test:settings' },
  { label: 'Shortcut Tests', cmd: 'npm run test:shortcuts' },

  // Reports & Lighthouse runner
  { label: 'Report Open Tests', cmd: 'npm run test:reports' },
  { label: 'Lighthouse Runner Tests', cmd: 'npm run test:lighthouse' },
];

// ─── Run each command ─────────────────────────────────────────────────────────
console.log(`\n🚀  Vault Test Runner — ${PROJECT.runAt}`);
console.log(`📦  Project: ${PROJECT.name} v${PROJECT.version}\n`);
console.log(`▶   Running ${TEST_COMMANDS.length} test suites...\n`);

mkdirSync(REPORT_DIR, { recursive: true });

const results = [];
let passed = 0;
let failed = 0;

for (const { label, cmd } of TEST_COMMANDS) {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  process.stdout.write(`  ⏳  ${label.padEnd(40)}`);

  let status = 'PASS';
  let output = '';
  let error = '';
  let exitCode = 0;
  let signal = null;
  let timedOut = false;

  try {
    output = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 300_000, // 5 min per suite
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    status = 'FAIL';
    const stdout = typeof err.stdout === 'string' ? err.stdout : '';
    const stderr = typeof err.stderr === 'string' ? err.stderr : '';
    output = stdout;
    error = stderr || err.message || 'Command failed without error output';
    exitCode = Number.isInteger(err.status) ? err.status : 1;
    signal = err.signal ?? null;
    timedOut = err.killed === true;
  }

  if (status === 'PASS') {
    passed++;
    process.stdout.write(`✅  PASS\n`);
  } else {
    failed++;
    process.stdout.write(`❌  FAIL (exit ${exitCode}${timedOut ? ', timeout' : ''})\n`);
  }

  const durationMs = Date.now() - start;

  results.push({
    label,
    cmd,
    status,
    startedAt,
    durationMs,
    exitCode,
    signal,
    timedOut,
    output: output.slice(-3000), // trim to last 3k chars
    error: error.slice(-2000),
  });
}

// ─── Summary ─────────────────────────────────────────────────────────────────
const total = results.length;
const overallStatus = failed === 0 ? 'ALL PASSED ✅' : `${failed} FAILED ❌`;

console.log(`\n${'─'.repeat(55)}`);
console.log(`  Total: ${total}  |  Passed: ${passed}  |  Failed: ${failed}`);
console.log(`  Status: ${overallStatus}`);
console.log(`${'─'.repeat(55)}\n`);

// ─── Write JSON report ────────────────────────────────────────────────────────
const report = {
  schemaVersion: 1,
  project: PROJECT,
  summary: { total, passed, failed, overallStatus },
  results,
};

const temporaryReportPath = `${REPORT_PATH}.tmp`;
writeFileSync(temporaryReportPath, JSON.stringify(report, null, 2), 'utf8');
renameSync(temporaryReportPath, REPORT_PATH);
console.log(`📄  Report written → ${REPORT_PATH}`);

// ─── Send email ───────────────────────────────────────────────────────────────
if (!NO_EMAIL) {
  console.log(`\n📧  Sending Gmail report…`);
  try {
    execSync(`"${process.execPath}" "${join(__dirname, 'send-gmail-report.mjs')}"`, {
      cwd: ROOT,
      stdio: 'inherit',
      timeout: 60_000,
    });
  } catch (err) {
    console.error(
      `⚠️  Email send failed${err.status ? ` (exit ${err.status})` : ''}. ` +
        'Check GMAIL_USER, GMAIL_APP_PASSWORD, and GMAIL_TO in .env.',
    );
    process.exit(1);
  }
}

process.exit(failed > 0 ? 1 : 0);
