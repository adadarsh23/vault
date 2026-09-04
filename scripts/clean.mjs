import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);

const cleanTargets = {
  build: [path.join(root, 'build')],
  stats: [path.join(root, 'stats.html')],
  vite: [path.join(root, 'node_modules', '.vite')],
  coverage: [path.join(root, 'coverage')],
  reports: [
    path.join(root, 'stats.html'),
    path.join(root, 'lighthouse', 'report.report.html'),
    path.join(root, 'lighthouse', 'report.report.json'),
    path.join(root, 'lighthouse', 'report-split'),
    path.join(root, 'playwright-report'),
    path.join(root, 'test-results'),
  ],
  temp: [path.join(root, 'dist-temp')],
  memory: [path.join(root, '.memory')],
};

const flags = new Set(args.map((a) => a.replace(/^--/, '')));

if (flags.has('help') || flags.has('h')) {
  console.log(`
Vault Clean Utility
Usage: node scripts/clean.mjs [options]

Options:
  --build      Remove build output directory (default)
  --stats      Remove stats.html visualizer output
  --vite       Remove Vite cache (node_modules/.vite)
  --coverage   Remove test coverage reports
  --reports    Remove stats, Lighthouse, and test reports
  --memory     Remove code memory index & visual reports
  --temp       Remove temporary packaging folders
  --all        Remove build, stats, vite cache, coverage, and reports
`);
  process.exit(0);
}

const pathsToRemove = new Set();

if (flags.size === 0 || flags.has('build')) {
  cleanTargets.build.forEach((p) => pathsToRemove.add(p));
}

if (flags.has('stats')) {
  cleanTargets.stats.forEach((p) => pathsToRemove.add(p));
}

if (flags.has('vite')) {
  cleanTargets.vite.forEach((p) => pathsToRemove.add(p));
}

if (flags.has('coverage')) {
  cleanTargets.coverage.forEach((p) => pathsToRemove.add(p));
}

if (flags.has('reports')) {
  cleanTargets.reports.forEach((p) => pathsToRemove.add(p));
}

if (flags.has('temp')) {
  cleanTargets.temp.forEach((p) => pathsToRemove.add(p));
}

if (flags.has('memory')) {
  cleanTargets.memory.forEach((p) => pathsToRemove.add(p));
}

if (flags.has('all')) {
  Object.values(cleanTargets)
    .flat()
    .forEach((p) => pathsToRemove.add(p));
}

let removedCount = 0;

for (const targetPath of pathsToRemove) {
  if (fs.existsSync(targetPath)) {
    try {
      const stat = fs.lstatSync(targetPath);
      if (stat.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.rmSync(targetPath, { force: true });
      }
      const rel = path.relative(root, targetPath) || targetPath;
      console.log(`[CLEAN] Removed: ${rel}`);
      removedCount += 1;
    } catch (err) {
      console.warn(`[WARN] Could not remove ${targetPath}: ${err.message}`);
    }
  }
}

if (removedCount === 0) {
  console.log('[CLEAN] Everything clean, nothing to remove.');
} else {
  console.log(`[CLEAN] Cleaned ${removedCount} target(s).`);
}
