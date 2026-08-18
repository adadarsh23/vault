import 'dotenv/config';
import { MongoClient } from 'mongodb';

const isOnce = process.argv.includes('--once');

function getRawUriCandidates() {
  const list = [];
  const primaryKeys = ['MONGODB_URI', 'MONGO_URI', 'MONGODB_URL', 'MONGO_URL'];
  for (const k of primaryKeys) {
    if (process.env[k]?.trim()) list.push([k, process.env[k].trim()]);
  }

  const fallbackKeys = [
    'MONGODB_URI_FALLBACK',
    'MONGODB_URL_FALLBACK',
    'MONGO_URI_FALLBACK',
    'MONGO_URL_FALLBACK',
    'MONGODB_URI_DIRECT',
  ];
  for (const k of fallbackKeys) {
    if (process.env[k]?.trim()) list.push([k, process.env[k].trim()]);
  }

  const numberedKeys = Object.keys(process.env)
    .filter((k) => /^(?:MONGODB|MONGO)_(?:URI|URL)_(\d+)$/i.test(k))
    .sort((a, b) => {
      const numA = Number.parseInt(a.match(/\d+$/)?.[0] || '0', 10);
      const numB = Number.parseInt(b.match(/\d+$/)?.[0] || '0', 10);
      return numA - numB;
    });

  for (const k of numberedKeys) {
    if (process.env[k]?.trim()) list.push([k, process.env[k].trim()]);
  }

  return list;
}

const rawUriCandidates = getRawUriCandidates();

const dbName = process.env.MONGODB_DB_NAME || process.env.MONGODB_DB || 'vault';
const intervalMinutes = Number(process.env.ATLAS_KEEPALIVE_MINUTES || 10);

if (rawUriCandidates.length === 0) {
  console.error(
    'Missing MongoDB URI. Set MONGODB_URI/MONGO_URI and optionally MONGODB_URI_FALLBACK, MONGODB_URI_1, MONGODB_URI_2, etc.'
  );
  process.exit(1);
}

// Deduplicate candidate URIs by trimmed value
const uniqueMap = new Map();
for (const [name, rawValue] of rawUriCandidates) {
  const value = rawValue.trim();
  if (/^mongodb(\+srv)?:\/\//i.test(value)) {
    if (!uniqueMap.has(value)) {
      uniqueMap.set(value, name);
    }
  } else {
    console.warn(`Skipping invalid URI in ${name}.`);
  }
}

const uriCandidates = Array.from(uniqueMap.entries()).map(([uri, name]) => ({ name, uri }));

if (uriCandidates.length === 0) {
  console.error(
    'No valid MongoDB URI found. URI must start with "mongodb://" or "mongodb+srv://".'
  );
  process.exit(1);
}

if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
  console.error('ATLAS_KEEPALIVE_MINUTES must be a positive number.');
  process.exit(1);
}

const intervalMs = intervalMinutes * 60 * 1000;
let stopped = false;

function maskUri(uri) {
  return uri.replace(/(:\/\/)(.*)(@)/, '$1***:***$3');
}

async function pingSingleCluster({ name, uri }) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 12000,
    connectTimeoutMS: 12000,
  });
  const start = Date.now();
  try {
    await client.connect();
    const res = await client.db(dbName).command({ ping: 1 });
    const elapsed = Date.now() - start;
    console.log(`[PASS] ${name} (${maskUri(uri)}) -> Ping OK in ${elapsed}ms (ok=${res.ok})`);
    return { ok: true, name, uri, elapsed };
  } catch (error) {
    const elapsed = Date.now() - start;
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[WARN] ${name} (${maskUri(uri)}) -> Ping Failed in ${elapsed}ms: ${msg}`);
    return { ok: false, name, uri, error: msg };
  } finally {
    await client.close().catch(() => {});
  }
}

async function pingAllClusters() {
  const startedAt = new Date().toISOString();
  console.log(`\n[${startedAt}] Pinging all ${uriCandidates.length} MongoDB Atlas candidate(s)...`);

  const results = await Promise.allSettled(
    uriCandidates.map((candidate) => pingSingleCluster(candidate))
  );

  const summary = results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { ok: false, name: uriCandidates[i].name, error: r.reason }
  );

  const successCount = summary.filter((s) => s.ok).length;
  console.log(
    `[${startedAt}] Atlas keep-alive cycle complete: ${successCount}/${uriCandidates.length} clusters responded.`
  );

  return successCount > 0;
}

async function shutdown(signal) {
  if (stopped) return;
  stopped = true;
  console.log(`\nReceived ${signal}. Exiting Atlas keep-alive...`);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function main() {
  console.log('=== MongoDB Atlas Multi-Cluster Keep-Alive ===');
  console.log(`Total configured cluster targets: ${uriCandidates.length}`);
  uriCandidates.forEach(({ name, uri }, idx) => {
    console.log(`  ${idx + 1}. [${name}] ${maskUri(uri)}`);
  });

  if (isOnce) {
    console.log('Running in one-shot mode (--once)...');
    const success = await pingAllClusters();
    process.exit(success ? 0 : 1);
  }

  console.log(`Interval: Every ${intervalMinutes} minute(s).`);
  await pingAllClusters();
  setInterval(pingAllClusters, intervalMs);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error('Failed to start Atlas keep-alive script:\n', message);
  process.exit(1);
});
