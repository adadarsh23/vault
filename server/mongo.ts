import dns from 'dns';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const getEnvValue = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
};

const resolveDatabaseName = (mongoUri?: string): string => {
  const configured = getEnvValue('MONGODB_DB_NAME', 'MONGODB_DB', 'MONGO_DB_NAME', 'MONGO_DB');
  // 'admin' is MongoDB's internal auth/system database, not an application data database
  if (configured && configured.toLowerCase() !== 'admin') {
    return configured;
  }
  if (mongoUri) {
    try {
      const match = mongoUri.match(/(?:mongodb(?:\+srv)?:\/\/[^\/]+\/)([^?\/]+)/i);
      if (match && match[1] && match[1].toLowerCase() !== 'admin') {
        return match[1].trim();
      }
    } catch {
      // ignore parsing errors
    }
  }
  return 'vault';
};

const primaryUri = getEnvValue('MONGODB_URI', 'MONGODB_URL', 'MONGO_URI', 'MONGO_URL');
const resolveConfiguredFallbackUris = (): string[] => {
  const direct = process.env.MONGODB_URI_DIRECT?.trim();
  const fallback = (
    process.env.MONGODB_URI_FALLBACK ||
    process.env.MONGODB_URL_FALLBACK ||
    process.env.MONGO_URI_FALLBACK ||
    process.env.MONGO_URL_FALLBACK
  )?.trim();

  const numberedKeys = Object.keys(process.env)
    .filter((k) => /^(?:MONGODB|MONGO)_(?:URI|URL)_(\d+)$/i.test(k))
    .sort((a, b) => {
      const numA = Number.parseInt(a.match(/\d+$/)?.[0] || '0', 10);
      const numB = Number.parseInt(b.match(/\d+$/)?.[0] || '0', 10);
      return numA - numB;
    });

  const rawList = [direct, fallback, ...numberedKeys.map((key) => process.env[key]?.trim())];

  return rawList
    .filter((value): value is string =>
      Boolean(value && (value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'))),
    )
    .filter((value, idx, self) => self.indexOf(value) === idx);
};

const configuredFallbackUris = resolveConfiguredFallbackUris();

const retryDnsServers = (
  process.env.MONGODB_DNS_RETRY_SERVERS ||
  process.env.MONGODB_DNS_SERVERS ||
  '1.1.1.1,8.8.8.8'
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (!primaryUri) {
  throw new Error('MONGODB_URI (or MONGO_URI / MONGODB_URL) is required in environment variables.');
}

let connectionPromise: Promise<typeof mongoose> | null = null;
let currentUri = primaryUri;
let dnsRetryApplied = false;

const isSrvResolutionError = (error: unknown): boolean => {
  const candidate = error as { code?: string; syscall?: string; message?: string };
  return (
    candidate?.syscall === 'querySrv' ||
    candidate?.code === 'ECONNREFUSED' ||
    String(candidate?.message || '').includes('querySrv')
  );
};

const isServerSelectionError = (error: unknown): boolean => {
  const candidate = error as { name?: string; message?: string };
  return (
    candidate?.name === 'MongooseServerSelectionError' ||
    String(candidate?.message || '').includes('MongooseServerSelectionError') ||
    String(candidate?.message || '').includes(
      'Could not connect to any servers in your MongoDB Atlas cluster',
    )
  );
};

const applyDnsRetryServers = (): boolean => {
  if (dnsRetryApplied || retryDnsServers.length === 0) {
    return false;
  }

  try {
    dns.setServers(retryDnsServers);
    dnsRetryApplied = true;
    console.warn(`Retrying MongoDB SRV lookup with DNS servers: ${retryDnsServers.join(', ')}`);
    return true;
  } catch {
    return false;
  }
};

const connectWithUri = async (mongoUri: string): Promise<typeof mongoose> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  const dbName = resolveDatabaseName(mongoUri);
  const connection = await mongoose.connect(mongoUri, {
    dbName,
    autoIndex: process.env.NODE_ENV !== 'production',
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
  });
  currentUri = mongoUri;
  return connection;
};

const canConnectToUri = async (mongoUri: string): Promise<boolean> => {
  const dbName = resolveDatabaseName(mongoUri);
  const probe = await mongoose
    .createConnection(mongoUri, {
      dbName,
      autoIndex: false,
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 5,
    })
    .asPromise();

  try {
    await probe.db?.admin().ping();
    return true;
  } finally {
    await probe.close();
  }
};

const buildUriCandidates = (): string[] => {
  const candidates = [currentUri, primaryUri, ...configuredFallbackUris]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim());

  // Do not silently downgrade cloud vault storage to a local database.
  // Local fallback is explicitly opt-in for development only.
  if (process.env.MONGODB_ALLOW_LOCAL_FALLBACK === 'true') {
    candidates.push(`mongodb://127.0.0.1:27017/${resolveDatabaseName(primaryUri)}`);
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
    .join(' | ')
    .toLowerCase();
  const codeCandidates = [
    candidate?.code,
    candidate?.errorResponse?.code,
    candidate?.cause?.code,
    ...(candidate?.writeErrors?.map((entry) => entry?.code) || []),
  ];

  return (
    codeCandidates.includes(8000) ||
    message.includes('storage limit') ||
    message.includes('quota exceeded') ||
    message.includes('capacity exceeded') ||
    message.includes('you are out of space') ||
    message.includes('disk is full') ||
    message.includes('over your space quota') ||
    message.includes('database storage limit has been reached')
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
      console.warn(
        `Switched MongoDB connection to candidate #${index + 1} after storage failover.`,
      );
      return true;
    } catch (error) {
      console.error(`MongoDB failover candidate #${index + 1} failed:`, error);
    }
  }

  return false;
};

if (!mongoose.connection.listeners('error').length) {
  mongoose.connection.on('error', () => {
    // Prevent unhandled 'error' events on mongoose.connection EventEmitter
  });
}

export const connectToMongo = async (): Promise<typeof mongoose> => {
  if (mongoose.connection.readyState === 1) {
    try {
      await mongoose.connection.db?.admin().ping();
      return mongoose;
    } catch {
      // A stale Atlas monitor can leave Mongoose in readyState=1 while the
      // socket is already closed. Force the normal candidate/retry flow.
      await mongoose.disconnect().catch(() => undefined);
    }
  }

  if (!connectionPromise) {
    const rawPromise = (async () => {
      const candidates = buildUriCandidates();
      let lastError: unknown;

      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];

        try {
          const connection = await connectWithUri(candidate);
          console.log(
            `Connected to MongoDB successfully${
              candidate === primaryUri ? '.' : ` using candidate #${index + 1}.`
            }`,
          );
          return connection;
        } catch (error) {
          lastError = error;
          const errMsg = error instanceof Error ? error.message : String(error);
          console.warn(
            `[MONGO] Candidate #${index + 1} connection failed (${errMsg}). Trying next candidate...`,
          );

          if (candidate === primaryUri && isSrvResolutionError(error) && applyDnsRetryServers()) {
            try {
              const connection = await connectWithUri(primaryUri);
              console.log('Connected to MongoDB successfully after DNS retry.');
              return connection;
            } catch (retryError) {
              lastError = retryError;
            }
          }
        }
      }

      if (isSrvResolutionError(lastError)) {
        throw new Error(
          `MongoDB Atlas SRV lookup failed. Configure MONGODB_URI_DIRECT with a direct Atlas replica-set URI using mongodb://, or repair DNS access to MongoDB Atlas. Local MongoDB fallback is disabled.`,
        );
      }

      if (isServerSelectionError(lastError)) {
        throw new Error(
          `Failed to connect to MongoDB Atlas. Check Atlas Network Access/IP allowlisting and the configured direct or SRV Atlas URI. Local MongoDB fallback is disabled.`,
        );
      }

      throw lastError;
    })();

    connectionPromise = rawPromise;

    rawPromise
      .catch(() => {})
      .finally(() => {
        if (connectionPromise === rawPromise) {
          connectionPromise = null;
        }
      });
  }

  return connectionPromise;
};

let lastFallbackProbeTime = 0;
const FALLBACK_PROBE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export const probeFallbackCandidates = async (): Promise<void> => {
  const now = Date.now();
  if (now - lastFallbackProbeTime < FALLBACK_PROBE_INTERVAL_MS) {
    return;
  }
  lastFallbackProbeTime = now;

  for (const uri of configuredFallbackUris) {
    if (uri && uri !== currentUri && !uri.includes('127.0.0.1') && !uri.includes('localhost')) {
      canConnectToUri(uri).catch(() => {
        // Non-blocking background keepalive probe
      });
    }
  }
};

export const ensureMongoReady = async (): Promise<boolean> => {
  try {
    await connectToMongo();
    // Non-blocking background keep-alive for fallback clusters
    void probeFallbackCandidates();
    return mongoose.connection.readyState === 1;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    return false;
  }
};

export const getDbStatus = (): string => mongoose.connection.readyState.toString();
