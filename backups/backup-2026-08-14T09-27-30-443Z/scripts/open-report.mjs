import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';

const target = process.argv[2];

if (!target) {
  console.log('Usage: node scripts/open-report.mjs <file-or-url-path>');
  process.exit(0);
}

// In headless/CI environments, do not attempt to open a browser window
if (process.env.CI || process.env.CONTINUOUS_INTEGRATION || process.env.HEADLESS) {
  console.log(`[CI/Headless] Report generated at: ${target}`);
  process.exit(0);
}

const resolvedPath =
  target.startsWith('http://') || target.startsWith('https://')
    ? target
    : path.resolve(process.cwd(), target);

if (
  !target.startsWith('http://') &&
  !target.startsWith('https://') &&
  !fs.existsSync(resolvedPath)
) {
  console.warn(`[WARN] Target report does not exist yet: ${resolvedPath}`);
  process.exit(0);
}

const getOpenCommand = (filePath) => {
  const quoted = `"${filePath}"`;
  switch (process.platform) {
    case 'win32':
      return `start "" ${quoted}`;
    case 'darwin':
      return `open ${quoted}`;
    default:
      return `xdg-open ${quoted}`;
  }
};

const command = getOpenCommand(resolvedPath);

exec(command, (error) => {
  if (error) {
    console.log(`Report available at: ${resolvedPath}`);
  } else {
    console.log(`Opened report: ${resolvedPath}`);
  }
});
