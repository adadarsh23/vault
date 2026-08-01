import "dotenv/config";
import { MongoClient } from "mongodb";

const rawUriCandidates = [
  ["MONGODB_URI", process.env.MONGODB_URI],
  ["MONGO_URI", process.env.MONGO_URI],
  ["MONGODB_URI_FALLBACK", process.env.MONGODB_URI_FALLBACK],
].filter(([, value]) => Boolean(value && value.trim()));
const dbName = process.env.MONGODB_DB || "admin";
const intervalMinutes = Number(process.env.ATLAS_KEEPALIVE_MINUTES || 10);

if (rawUriCandidates.length === 0) {
  console.error(
    "Missing MongoDB URI. Set MONGODB_URI/MONGO_URI and optionally MONGODB_URI_FALLBACK."
  );
  process.exit(1);
}

const uriCandidates = rawUriCandidates
  .map(([name, value]) => [name, value.trim()])
  .filter(([, value]) => /^mongodb(\+srv)?:\/\//i.test(value));

if (uriCandidates.length === 0) {
  console.error(
    'No valid MongoDB URI found. URI must start with "mongodb://" or "mongodb+srv://".'
  );
  console.error(
    "Example: mongodb+srv://<username>:<password>@<cluster-url>/<db>?retryWrites=true&w=majority"
  );
  process.exit(1);
}

for (const [name, value] of rawUriCandidates) {
  if (!/^mongodb(\+srv)?:\/\//i.test(value.trim())) {
    console.warn(`Skipping invalid URI in ${name}.`);
  }
}

if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
  console.error("ATLAS_KEEPALIVE_MINUTES must be a positive number.");
  process.exit(1);
}

const intervalMs = intervalMinutes * 60 * 1000;
let client = null;
let activeUri = "";
let activeUriName = "";

let stopped = false;

async function connectWithFailover() {
  let lastError = null;
  for (const [name, uri] of uriCandidates) {
    const nextClient = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
    try {
      await nextClient.connect();
      client = nextClient;
      activeUri = uri;
      activeUriName = name;
      console.log("Connected to MongoDB Atlas.");
      return;
    } catch (error) {
      lastError = error;
      await nextClient.close().catch(() => {});
    }
  }
  throw lastError || new Error("Unable to connect to any MongoDB URI.");
}

async function pingAtlas() {
  const startedAt = new Date();
  try {
    if (!client) await connectWithFailover();
    await client.db(dbName).command({ ping: 1 });
    console.log(
      `[${startedAt.toISOString()}] Atlas ping ok (db="${dbName}", every ${intervalMinutes}m)`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${startedAt.toISOString()}] Atlas ping failed: ${message}`);
    try {
      if (client) await client.close();
    } catch {}
    client = null;
    activeUri = "";
    activeUriName = "";
  }
}

async function shutdown(signal) {
  if (stopped) return;
  stopped = true;
  console.log(`Received ${signal}. Closing MongoDB connection...`);
  try {
    if (client) await client.close();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function main() {
  console.log("Connecting to MongoDB Atlas (with fallback support)...");
  await connectWithFailover();
  console.log(`Keep-alive interval: ${intervalMinutes} minute(s).`);
  console.log(`Active URI source: ${activeUriName || "unknown"}`);

  await pingAtlas();
  setInterval(pingAtlas, intervalMs);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error("Failed to start Atlas keep-alive script:\n", message);
  process.exit(1);
});
