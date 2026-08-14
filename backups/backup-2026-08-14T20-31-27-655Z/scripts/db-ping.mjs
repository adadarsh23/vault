import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uriCandidates = [
  ['MONGODB_URI', process.env.MONGODB_URI],
  ['MONGO_URI', process.env.MONGO_URI],
  ['MONGODB_URI_FALLBACK', process.env.MONGODB_URI_FALLBACK],
].filter(([, value]) => Boolean(value && value.trim()));

if (uriCandidates.length === 0) {
  console.error('[FAIL] Missing MongoDB URI in environment variables (MONGODB_URI or MONGO_URI).');
  process.exit(1);
}

const dbName = process.env.MONGODB_DB || 'admin';

async function ping() {
  let lastError = null;

  for (const [name, rawUri] of uriCandidates) {
    const uri = rawUri.trim();
    const masked = uri.replace(/(:\/\/)(.*)(@)/, '$1***:***$3');
    console.log(`[PING] Attempting connection via ${name} (${masked})...`);

    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000 });
    const startTime = Date.now();

    try {
      await client.connect();
      const res = await client.db(dbName).command({ ping: 1 });
      const elapsed = Date.now() - startTime;
      console.log(`[PASS] MongoDB responded to ping in ${elapsed}ms (ok=${res.ok})`);
      await client.close();
      process.exit(0);
    } catch (err) {
      lastError = err;
      console.warn(`[WARN] Connection via ${name} failed: ${err.message}`);
      await client.close().catch(() => {});
    }
  }

  console.error(`[FAIL] All MongoDB connection candidates failed.`);
  if (lastError) {
    console.error(lastError);
  }
  process.exit(1);
}

ping();
