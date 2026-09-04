import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateJwtSecrets,
  testJwtSigningAndVerification,
} from '../server/utils/jwtDiagnostics.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

const heading = (title: string) =>
  console.log(`\n${colors.cyan}${colors.bold}${title}${colors.reset}`);
const ok = (msg: string) => console.log(`  ${colors.green}[OK]${colors.reset} ${msg}`);
const warn = (msg: string) => console.log(`  ${colors.yellow}[WARN]${colors.reset} ${msg}`);
const fail = (msg: string) => console.log(`  ${colors.red}[FAIL]${colors.reset} ${msg}`);

heading('JWT Refresh Token Fix Verification Checklist');
heading('============================================');

heading('[1] Environment Variables');
const jwtSecret = process.env.JWT_SECRET;
const refreshSecret = process.env.REFRESH_TOKEN_SECRET;

if (!jwtSecret) {
  fail('JWT_SECRET is not set');
} else {
  ok(`JWT_SECRET is set (${jwtSecret.length} chars)`);
}

if (!refreshSecret) {
  warn('REFRESH_TOKEN_SECRET is not set (fallback is JWT_SECRET)');
} else if (refreshSecret === jwtSecret) {
  warn('REFRESH_TOKEN_SECRET equals JWT_SECRET (use different values)');
} else {
  ok(`REFRESH_TOKEN_SECRET is set separately (${refreshSecret.length} chars)`);
}

heading('[2] Required Files');
const requiredFiles = [
  'server/utils/auth.ts',
  'server/controllers/authController.ts',
  'server/utils/jwtDiagnostics.ts',
  'server.ts',
];

for (const relPath of requiredFiles) {
  const full = path.join(rootDir, relPath);
  if (fs.existsSync(full)) {
    ok(`${relPath} exists`);
  } else {
    fail(`${relPath} is missing`);
  }
}

heading('[3] Key Code Checks');
const authPath = path.join(rootDir, 'server/utils/auth.ts');
if (fs.existsSync(authPath)) {
  const authCode = fs.readFileSync(authPath, 'utf8');
  if (authCode.includes('REFRESH_TOKEN_SECRET')) {
    ok('REFRESH_TOKEN_SECRET reference found in server/utils/auth.ts');
  } else {
    fail('REFRESH_TOKEN_SECRET reference missing in server/utils/auth.ts');
  }

  if (authCode.includes('createRefreshToken')) {
    ok('createRefreshToken function found in server/utils/auth.ts');
  } else {
    fail('createRefreshToken function missing in server/utils/auth.ts');
  }
}

heading('[4] Secret Validation & Live JWT Signing/Verification Test');
const validation = validateJwtSecrets();
if (validation.isValid) {
  ok('validateJwtSecrets() passed with no errors');
} else {
  validation.errors.forEach((e) => fail(e));
}
validation.warnings.forEach((w) => warn(w));

const testResult = testJwtSigningAndVerification();
if (testResult.testResults.accessToken.sign) ok('Access Token signing passed');
else fail('Access Token signing failed');

if (testResult.testResults.accessToken.verify) ok('Access Token verification passed');
else fail('Access Token verification failed');

if (testResult.testResults.refreshToken.sign) ok('Refresh Token signing passed');
else fail('Refresh Token signing failed');

if (testResult.testResults.refreshToken.verify) ok('Refresh Token verification passed');
else fail('Refresh Token verification failed');

if (testResult.errors.length > 0) {
  testResult.errors.forEach((e) => fail(e));
}

heading('============================================');
heading('Checklist complete.');
