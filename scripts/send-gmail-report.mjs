#!/usr/bin/env node
/**
 * send-gmail-report.mjs
 * Reads test-results/test-report.json and sends a formatted HTML email
 * through Gmail using an App Password.
 *
 * Required env vars (add to .env):
 *   GMAIL_USER          — your Gmail address (sender)
 *   GMAIL_APP_PASSWORD  — 16-char Google App Password (NOT your main password)
 *   GMAIL_TO            — report recipient (defaults to GMAIL_USER)
 *
 * Gmail App Password setup:
 *   1. Go to https://myaccount.google.com/apppasswords
 *   2. Create an app password for "Mail" > "Windows Computer"
 *   3. Copy the 16-char code into .env as GMAIL_APP_PASSWORD
 */

import nodemailer from 'nodemailer';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  escapeHtml,
  formatDuration,
  isValidTestReport,
  repositoryUrl,
} from './test-report-utils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REPORT_PATH = join(ROOT, 'test-results', 'test-report.json');

// ─── Load .env manually (no dotenv dependency assumption) ────────────────────
function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const RECIPIENT = process.env.GMAIL_TO || GMAIL_USER;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error(
    '\n❌  Missing env vars: GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env\n' +
      '    See scripts/send-gmail-report.mjs for setup instructions.\n',
  );
  process.exit(1);
}

// ─── Load report ─────────────────────────────────────────────────────────────
if (!existsSync(REPORT_PATH)) {
  console.error(`❌  Report not found: ${REPORT_PATH}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(readFileSync(REPORT_PATH, 'utf8'));
} catch (err) {
  console.error(`❌  Could not read a valid test report: ${err.message}`);
  process.exit(1);
}
if (!isValidTestReport(report)) {
  console.error('❌  Test report is missing required fields or has an unsupported schema.');
  process.exit(1);
}
const { project, summary, results } = report;

// ─── Build HTML email ─────────────────────────────────────────────────────────
function statusBadge(status) {
  const bg = status === 'PASS' ? '#22c55e' : '#ef4444';
  return `<span style="background:${bg};color:#fff;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;">${status}</span>`;
}

function rowsHtml() {
  return results
    .map(
      (r) => `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:8px 12px;font-size:13px;">${escapeHtml(r.label)}</td>
        <td style="padding:8px 12px;text-align:center;">${statusBadge(r.status)}</td>
        <td style="padding:8px 12px;text-align:center;color:#6b7280;font-size:12px;">${escapeHtml(formatDuration(r.durationMs))}</td>
        <td style="padding:8px 12px;font-family:monospace;font-size:11px;color:#374151;max-width:300px;word-break:break-all;">
          ${r.status === 'FAIL' ? `<details><summary style="cursor:pointer;color:#ef4444;">Error</summary><pre style="white-space:pre-wrap;font-size:10px;">${escapeHtml(r.error.slice(0, 800))}</pre></details>` : ''}
        </td>
      </tr>`,
    )
    .join('');
}

const overallColor = summary.failed === 0 ? '#22c55e' : '#ef4444';
const overallIcon = summary.failed === 0 ? '✅' : '❌';
const repoUrl = repositoryUrl(project.repo);

const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;">
    <tr><td align="center">
      <table width="680" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr>
          <td style="background:${overallColor};padding:24px 32px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">
              ${overallIcon} Vault — Test Report
            </h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:14px;">
              ${escapeHtml(summary.overallStatus)} &nbsp;·&nbsp; ${escapeHtml(new Date(project.runAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }))} IST
            </p>
          </td>
        </tr>

        <!-- Project info -->
        <tr>
          <td style="padding:24px 32px;border-bottom:1px solid #f3f4f6;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="width:50%;vertical-align:top;">
                  <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;">Project</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${escapeHtml(project.name)} <span style="font-weight:400;color:#6b7280;">v${escapeHtml(project.version)}</span></p>
                  <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${escapeHtml(project.description)}</p>
                </td>
                <td style="width:50%;vertical-align:top;padding-left:24px;">
                  <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;">Environment</p>
                  <p style="margin:0;font-size:13px;color:#374151;">Node.js ${escapeHtml(project.node)}</p>
                  <p style="margin:4px 0 0;font-size:13px;color:#374151;">Author: ${escapeHtml(project.author)}</p>
                  <p style="margin:4px 0 0;font-size:13px;">${repoUrl ? `<a href="${escapeHtml(repoUrl)}" style="color:#3b82f6;text-decoration:none;">GitHub Repository</a>` : 'Repository unavailable'}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Stats -->
        <tr>
          <td style="padding:20px 32px;border-bottom:1px solid #f3f4f6;">
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                ${[
                  ['Total Suites', summary.total, '#3b82f6'],
                  ['Passed', summary.passed, '#22c55e'],
                  ['Failed', summary.failed, summary.failed > 0 ? '#ef4444' : '#9ca3af'],
                ]
                  .map(
                    ([label, val, color]) => `
                  <td style="text-align:center;padding:0 8px;">
                    <p style="margin:0;font-size:28px;font-weight:700;color:${color};">${val}</p>
                    <p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${label}</p>
                  </td>`,
                  )
                  .join('')}
              </tr>
            </table>
          </td>
        </tr>

        <!-- Results table -->
        <tr>
          <td style="padding:0 32px 24px;">
            <h2 style="font-size:15px;font-weight:600;color:#111827;margin:20px 0 12px;">Test Suite Results</h2>
            <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;border-collapse:collapse;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">Suite</th>
                  <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;">Status</th>
                  <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;">Time</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">Details</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml()}
              </tbody>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              Generated automatically by <strong>Vault Test Report Automation</strong>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
`;

// Plain text fallback
const plain = [
  `VAULT TEST REPORT — ${project.runAt}`,
  `Status: ${summary.overallStatus}`,
  `Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed}`,
  '',
  'RESULTS:',
  ...results.map((r) => `  [${r.status}] ${r.label} (${formatDuration(r.durationMs)})`),
].join('\n');

// ─── Send via nodemailer ──────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

const subject =
  summary.failed === 0
    ? `✅ Vault Tests Passed — ${summary.passed}/${summary.total} suites`
    : `❌ Vault Tests Failed — ${summary.failed} failure(s) detected`;

try {
  const info = await transporter.sendMail({
    from: `"Vault CI" <${GMAIL_USER}>`,
    to: RECIPIENT,
    subject,
    text: plain,
    html,
  });

  console.log(`✅  Email sent successfully!`);
  console.log(`    Message ID: ${info.messageId}`);
  console.log(`    To: ${RECIPIENT}`);
} catch (err) {
  console.error(`❌  Failed to send email:`, err.message);
  process.exit(1);
}
