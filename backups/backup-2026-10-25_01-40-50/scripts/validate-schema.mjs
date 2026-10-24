#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const schemaPath = path.join(rootDir, 'schemas', 'vault-manifest.schema.json');

// ANSI Color Helpers
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function banner() {
  console.log(
    `\n${c.cyan}${c.bold}🛡️  Vault Manifest Schema Validator (Production-Ready)${c.reset}`,
  );
  console.log(`${c.gray}   Draft 2020-12 • Strict Non-Permissive Evaluation${c.reset}\n`);
}

function loadSchema() {
  if (!fs.existsSync(schemaPath)) {
    console.error(`${c.red}✖ Schema definition not found at:${c.reset} ${schemaPath}`);
    process.exit(1);
  }
  try {
    const raw = fs.readFileSync(schemaPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`${c.red}✖ Failed parsing schema JSON:${c.reset}`, err.message);
    process.exit(1);
  }
}

function getTargets(args) {
  if (args.includes('--all')) {
    const targets = [path.join(rootDir, 'metadata.json')];
    const backupsDir = path.join(rootDir, 'backups');
    if (fs.existsSync(backupsDir)) {
      for (const entry of fs.readdirSync(backupsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const cand = path.join(backupsDir, entry.name, 'metadata.json');
          if (fs.existsSync(cand)) targets.push(cand);
        }
      }
    }
    return targets;
  }

  const custom = args.find((a) => !a.startsWith('--'));
  if (custom) {
    return [path.resolve(process.cwd(), custom)];
  }

  return [path.join(rootDir, 'metadata.json')];
}

function validateFile(validate, filePath) {
  const relPath = path.relative(rootDir, filePath) || filePath;
  process.stdout.write(`  ${c.blue}•${c.reset} Validating ${c.bold}${relPath}${c.reset}... `);

  if (!fs.existsSync(filePath)) {
    console.log(`${c.red}FAIL (File not found)${c.reset}`);
    return false;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.log(`${c.red}FAIL (Invalid JSON syntax)${c.reset}`);
    console.error(`    ${c.dim}${err.message}${c.reset}`);
    return false;
  }

  const startTime = performance.now();
  const valid = validate(data);
  const elapsed = (performance.now() - startTime).toFixed(2);

  if (valid) {
    console.log(`${c.green}✔ PASS${c.reset} ${c.dim}(${elapsed}ms)${c.reset}`);
    if (data.paths && data.modules) {
      console.log(
        `    ${c.gray}↳ Layout: ${c.cyan}${Object.keys(data.paths).length} project paths${c.gray} • ${c.cyan}${data.modules.activeVaults?.length || 0} active vaults${c.gray} • Cascade: ${c.cyan}${data.security?.cryptography?.contentEncryption?.cascade?.magicHeader || 'N/A'}${c.reset}`,
      );
    }
    return true;
  } else {
    console.log(`${c.red}✖ FAILED${c.reset} ${c.dim}(${elapsed}ms)${c.reset}`);
    console.error(
      `\n${c.red}${c.bold}    Validation Errors (${validate.errors.length}):${c.reset}`,
    );
    for (const err of validate.errors) {
      console.error(
        `    ${c.red}• Path:${c.reset} ${err.instancePath || '/'} | ${c.yellow}${err.message}${c.reset}`,
      );
      if (err.params) {
        console.error(`      ${c.dim}Details: ${JSON.stringify(err.params)}${c.reset}`);
      }
    }
    console.log('');
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  banner();

  const schema = loadSchema();
  const ajv = new Ajv2020({ allErrors: true, strict: false });

  let validate;
  try {
    validate = ajv.compile(schema);
    console.log(
      `  ${c.green}✔${c.reset} Schema compiled successfully ${c.dim}(ID: ${schema.$id || 'local'})${c.reset}\n`,
    );
  } catch (err) {
    console.error(`${c.red}✖ Failed compiling schema with Ajv2020:${c.reset}`, err.message);
    process.exit(1);
  }

  const targets = getTargets(args);
  let passedCount = 0;

  for (const target of targets) {
    const passed = validateFile(validate, target);
    if (passed) passedCount++;
  }

  console.log(
    `\n${c.bold}Summary:${c.reset} ${passedCount}/${targets.length} targets passed validation.`,
  );
  if (passedCount !== targets.length) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
