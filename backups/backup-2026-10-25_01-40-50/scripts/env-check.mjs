import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const root = process.cwd();
const envExamplePath = path.join(root, '.env.example');
const envPath = path.join(root, '.env');

if (!fs.existsSync(envExamplePath)) {
  console.log('[INFO] No .env.example file found to compare against.');
  process.exit(0);
}

const parseEnvKeys = (filePath) => {
  if (!fs.existsSync(filePath)) return new Set();
  const content = fs.readFileSync(filePath, 'utf8');
  const keys = new Set();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=/i);
    if (match) {
      keys.add(match[1]);
    }
  }
  return keys;
};

const exampleKeys = parseEnvKeys(envExamplePath);
const currentKeys = parseEnvKeys(envPath);

console.log(`\nChecking environment variables (.env vs .env.example)...`);
console.log(`Found ${exampleKeys.size} template variables in .env.example.\n`);

const missing = [];
for (const key of exampleKeys) {
  if (!process.env[key] && !currentKeys.has(key)) {
    missing.push(key);
  }
}

if (missing.length > 0) {
  console.warn(`[WARN] ${missing.length} variable(s) from .env.example are missing in .env:`);
  missing.forEach((k) => console.warn(`  - ${k}`));
  console.log('\nConsider adding them to your local .env file.');
} else {
  console.log(`[PASS] All variables from .env.example are present in .env!`);
}
