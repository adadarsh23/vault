import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import 'dotenv/config';

const root = process.cwd();
const checks = [];

const addCheck = (category, title, status, details = '') => {
  checks.push({ category, title, status, details });
};

// 1. Node.js Version Check
const nodeVersion = process.version;
const major = parseInt(nodeVersion.replace(/^v/, '').split('.')[0], 10);
if (major >= 18) {
  addCheck(
    'Runtime',
    `Node.js version (${nodeVersion})`,
    'PASS',
    'Meets >= 18.0.0 engine requirement',
  );
} else {
  addCheck('Runtime', `Node.js version (${nodeVersion})`, 'FAIL', 'Requires Node.js >= 18.0.0');
}

// 2. TypeScript Configs
for (const config of ['tsconfig.json', 'tsconfig.server.json']) {
  const p = path.join(root, config);
  if (fs.existsSync(p)) {
    addCheck('TypeScript', `${config} exists`, 'PASS');
  } else {
    addCheck('TypeScript', `${config} missing`, 'FAIL', `Expected at ${p}`);
  }
}

// 3. Essential Workspace Directories
const essentialDirs = ['src', 'server', 'tests', 'scripts', 'public', 'schemas'];
for (const dir of essentialDirs) {
  const p = path.join(root, dir);
  if (fs.existsSync(p) && fs.lstatSync(p).isDirectory()) {
    addCheck('Workspace', `Directory '${dir}/'`, 'PASS');
  } else {
    addCheck('Workspace', `Directory '${dir}/'`, 'WARN', 'Optional or missing directory');
  }
}

// 4. Schema & Manifest Integrity
const schemaFile = path.join(root, 'schemas', 'vault-manifest.schema.json');
const metaFile = path.join(root, 'metadata.json');
if (fs.existsSync(schemaFile) && fs.existsSync(metaFile)) {
  addCheck('Schema', 'vault-manifest.schema.json', 'PASS', 'Production schema & metadata present');
} else {
  addCheck(
    'Schema',
    'vault-manifest.schema.json',
    'FAIL',
    'Manifest schema or metadata.json missing',
  );
}

// 4. Environment Configuration
const envPath = path.join(root, '.env');
const envExamplePath = path.join(root, '.env.example');

if (fs.existsSync(envPath)) {
  addCheck('Environment', '.env file present', 'PASS');
} else {
  addCheck(
    'Environment',
    '.env file present',
    'WARN',
    'No .env file found. Copy from .env.example if running full stack.',
  );
}

const mongoUri =
  process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGODB_URI_FALLBACK;
if (mongoUri) {
  const masked = mongoUri.replace(/(:\/\/)(.*)(@)/, '$1***:***$3');
  addCheck('Environment', 'MongoDB URI configured', 'PASS', masked);
} else {
  addCheck('Environment', 'MongoDB URI configured', 'WARN', 'MONGODB_URI not set in environment.');
}

const jwtSecret = process.env.JWT_SECRET;
if (jwtSecret && jwtSecret.length >= 16) {
  addCheck('Security', 'JWT_SECRET configured', 'PASS', `Length: ${jwtSecret.length} chars`);
} else if (jwtSecret) {
  addCheck('Security', 'JWT_SECRET configured', 'WARN', 'JWT_SECRET is short (< 16 chars)');
} else {
  addCheck(
    'Security',
    'JWT_SECRET configured',
    'WARN',
    'JWT_SECRET is unset in current environment',
  );
}

// 5. npm Configuration & Environment Check
let strayNpmEnvVars = Object.keys(process.env).filter((key) =>
  /^npm_config_global[-_]?ignore[-_]?file$/i.test(key),
);

const isFixMode = process.argv.includes('--fix');
if (isFixMode && strayNpmEnvVars.length > 0) {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const regExe = path.join(systemRoot, 'System32', 'reg.exe');
    const exe = fs.existsSync(regExe) ? `"${regExe}"` : 'reg';

    for (const envVar of strayNpmEnvVars) {
      try {
        execSync(`${exe} delete "HKCU\\Environment" /v "${envVar}" /f`, { stdio: 'ignore' });
      } catch {
        // user scope entry may not exist
      }
      try {
        execSync(
          `${exe} delete "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v "${envVar}" /f`,
          { stdio: 'ignore' },
        );
      } catch {
        // machine scope entry may not exist or require elevated admin
      }
    }
  }

  for (const envVar of strayNpmEnvVars) {
    delete process.env[envVar];
  }

  strayNpmEnvVars = Object.keys(process.env).filter((key) =>
    /^npm_config_global[-_]?ignore[-_]?file$/i.test(key),
  );
}

if (strayNpmEnvVars.length === 0) {
  addCheck(
    'Toolchain',
    'npm Environment Variables',
    'PASS',
    isFixMode ? 'Clean npm environment (fixed invalid vars)' : 'Clean npm environment',
  );
} else {
  addCheck(
    'Toolchain',
    'npm Environment Variables',
    'WARN',
    `Found invalid env var (${strayNpmEnvVars.join(', ')}). Run 'npm run doctor:fix' or remove via [Environment]::SetEnvironmentVariable() or reg delete`,
  );
}

// Summary Output
console.log('\n==========================================');
console.log('       VAULT PROJECT HEALTH DOCTOR        ');
console.log('==========================================\n');

let passCount = 0;
let warnCount = 0;
let failCount = 0;

for (const check of checks) {
  let tag = '[PASS]';
  if (check.status === 'PASS') {
    tag = '\x1b[32m[PASS]\x1b[0m';
    passCount += 1;
  } else if (check.status === 'WARN') {
    tag = '\x1b[33m[WARN]\x1b[0m';
    warnCount += 1;
  } else {
    tag = '\x1b[31m[FAIL]\x1b[0m';
    failCount += 1;
  }

  console.log(
    `${tag} ${check.category.padEnd(12)} : ${check.title} ${check.details ? `(${check.details})` : ''}`,
  );
}

console.log('\n------------------------------------------');
console.log(`Results: ${passCount} Passed, ${warnCount} Warnings, ${failCount} Failures\n`);

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
