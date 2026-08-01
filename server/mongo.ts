import dns from "dns";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME?.trim() || "vault";

const getEnvValue = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
};

const primaryUri = getEnvValue("MONGODB_URI", "MONGODB_URL");
const fallbackUri = getEnvValue("MONGODB_URI_FALLBACK", "MONGODB_URL_FALLBACK");
const retryDnsServers =
  process.env.MONGODB_DNS_SERVERS?.split(",").map((value) => value.trim()).filter(Boolean) ||
  ["1.1.1.1", "8.8.8.8"];

if (!primaryUri) {
  throw new Error("MONGODB_URI or MONGODB_URL is required in environment variables.");
}

let connectionPromise: Promise<typeof mongoose> | null = null;
let currentUri = primaryUri;
let dnsRetryApplied = false;

const isSrvResolutionError = (error: unknown): boolean => {
  const candidate = error as { code?: string; syscall?: string; message?: string };
  return (
    candidate?.syscall === "querySrv" ||
    candidate?.code === "ECONNREFUSED" ||
    String(candidate?.message || "").includes("querySrv")
  );
};

const isServerSelectionError = (error: unknown): boolean => {
  const candidate = error as { name?: string; message?: string };
  return (
    candidate?.name === "MongooseServerSelectionError" ||
    String(candidate?.message || "").includes("MongooseServerSelectionError") ||
    String(candidate?.message || "").includes("Could not connect to any servers in your MongoDB Atlas cluster")
  );
};

const applyDnsRetryServers = (): boolean => {
  if (dnsRetryApplied || retryDnsServers.length === 0) {
    return false;
  }

  try {
    dns.setServers(retryDnsServers);
    dnsRetryApplied = true;
    console.warn(`Retrying MongoDB SRV lookup with DNS servers: ${retryDnsServers.join(", ")}`);
    return true;
  } catch {
    return false;
  }
};

const connectWithUri = async (mongoUri: string): Promise<typeof mongoose> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  const connection = await mongoose.connect(mongoUri, {
    dbName: MONGODB_DB_NAME,
    autoIndex: process.env.NODE_ENV !== "production",
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
  });
  currentUri = mongoUri;
  return connection;
};

const canConnectToUri = async (mongoUri: string): Promise<boolean> => {
  const probe = await mongoose.createConnection(mongoUri, {
    dbName: MONGODB_DB_NAME,
    autoIndex: false,
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 5,
  }).asPromise();

  try {
    await probe.db?.admin().ping();
    return true;
  } finally {
    await probe.close();
  }
};

const buildUriCandidates = (): string[] => {
  const candidates = [currentUri, primaryUri, fallbackUri]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim());

  // Add local development fallback if not in production
  if (process.env.NODE_ENV !== "production") {
    candidates.push(`mongodb://127.0.0.1:27017/${MONGODB_DB_NAME}`);
  }

  return [...new Set(candidates)];
};

export const isStorageFullError = (error: unknown): boolean => {
  const candidate = error as {
    code?: number | string;
    message?: string;
    errorResponse?: { code?: number | string; errmsg?: string; message?: string };
    cause?: { code?: number | string; message?: string };
    writeErrors?: Array<{ code?: number | string; errmsg?: string }>;
  };
  const message = [
    candidate?.message,
    candidate?.errorResponse?.errmsg,
    candidate?.errorResponse?.message,
    candidate?.cause?.message,
    ...(candidate?.writeErrors?.map((entry) => entry?.errmsg) || []),
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();
  const codeCandidates = [
    candidate?.code,
    candidate?.errorResponse?.code,
    candidate?.cause?.code,
    ...(candidate?.writeErrors?.map((entry) => entry?.code) || []),
  ];

  return (
    codeCandidates.includes(8000) ||
    message.includes("storage limit") ||
    message.includes("quota exceeded") ||
    message.includes("capacity exceeded") ||
    message.includes("you are out of space") ||
    message.includes("disk is full") ||
    message.includes("over your space quota") ||
    message.includes("database storage limit has been reached")
  );
};

export const switchToNextMongoUri = async (): Promise<boolean> => {
  const candidates = buildUriCandidates();
  const currentIndex = Math.max(candidates.indexOf(currentUri), 0);

  for (let index = currentIndex + 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];

    try {
      const reachable = await canConnectToUri(candidate);
      if (!reachable) {
        continue;
      }
      await connectWithUri(candidate);
      console.warn(`Switched MongoDB connection to candidate #${index + 1} after storage failover.`);
      return true;
    } catch (error) {
      console.error(`MongoDB failover candidate #${index + 1} failed:`, error);
    }
  }

  return false;
};

export const connectToMongo = async (): Promise<typeof mongoose> => {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!connectionPromise) {
    connectionPromise = (async () => {
      const candidates = buildUriCandidates();
      let lastError: unknown;

      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];

        try {
          const connection = await connectWithUri(candidate);
          console.log(
            `Connected to MongoDB successfully${candidate === primaryUri ? "." : ` using candidate #${index + 1}.`}`,
          );
          return connection;
        } catch (error) {
          lastError = error;

          if (candidate === primaryUri && isSrvResolutionError(error) && applyDnsRetryServers()) {
            try {
              const connection = await connectWithUri(primaryUri);
              console.log("Connected to MongoDB successfully after DNS retry.");
              return connection;
            } catch (retryError) {
              lastError = retryError;
            }
          }
        }
      }

      if (isSrvResolutionError(lastError)) {
        throw new Error(
          `MongoDB SRV lookup failed (querySrv/ECONNREFUSED). This usually means your DNS is blocking Atlas lookups. Configure MONGODB_URI_FALLBACK with a direct connection string or use a local instance: mongodb://127.0.0.1:27017/${MONGODB_DB_NAME}.`,
        );
      }

      if (isServerSelectionError(lastError)) {
        throw new Error(
          `Failed to connect to MongoDB Atlas. This is most likely because your current IP address is not whitelisted in your Atlas cluster configuration. Please visit https://www.mongodb.com/docs/atlas/security-whitelist/ to allow access from your current location, or ensure a local MongoDB instance is running at mongodb://127.0.0.1:27017/${MONGODB_DB_NAME}.`,
        );
      }

      throw lastError;
    })().finally(() => {
      connectionPromise = null;
    });
  }

  return connectionPromise;
};

export const ensureMongoReady = async (): Promise<boolean> => {
  try {
    await connectToMongo();
    return mongoose.connection.readyState === 1;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    return false;
  }
};

export const getDbStatus = (): string => mongoose.connection.readyState.toString();
