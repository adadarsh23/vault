import 'dotenv/config';
import { MongoClient } from 'mongodb';

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

if (rawUriCandidates.length === 0) {
  console.error(
    '[FAIL] Missing MongoDB URI in environment variables (MONGODB_URI, MONGODB_URI_FALLBACK, MONGODB_URI_1, etc.).',
  );
  process.exit(1);
}

const dbName = process.env.MONGODB_DB_NAME || process.env.MONGODB_DB || 'vault';

function maskUri(uri) {
  return uri.replace(/(:\/\/)(.*)(@)/, '$1***:***$3');
}

// Deduplicate
const uniqueMap = new Map();
for (const [name, rawValue] of rawUriCandidates) {
  const value = rawValue.trim();
  if (/^mongodb(\+srv)?:\/\//i.test(value)) {
    if (!uniqueMap.has(value)) {
      uniqueMap.set(value, name);
    }
  }
}

const uriCandidates = Array.from(uniqueMap.entries()).map(([uri, name]) => ({ name, uri }));

async function ping() {
  console.log(`[PING] Checking all ${uriCandidates.length} MongoDB cluster candidate(s)...`);
  let passedCount = 0;

  for (const { name, uri } of uriCandidates) {
    const masked = maskUri(uri);
    console.log(`[PING] Attempting connection via ${name} (${masked})...`);

    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    const startTime = Date.now();

    try {
      await client.connect();
      const res = await client.db(dbName).command({ ping: 1 });
      const elapsed = Date.now() - startTime;
      console.log(`[PASS] ${name} responded to ping in ${elapsed}ms (ok=${res.ok})`);
      passedCount += 1;
    } catch (err) {
      console.warn(`[WARN] Connection via ${name} failed: ${err.message}`);
    } finally {
      await client.close().catch(() => {});
    }
  }

  if (passedCount > 0) {
    console.log(
      `\n[SUMMARY] ${passedCount}/${uriCandidates.length} cluster(s) active and responsive.`,
    );
    process.exit(0);
  } else {
    console.error(`\n[FAIL] All MongoDB connection candidates failed.`);
    process.exit(1);
  }
}

ping();
