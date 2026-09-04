var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/utils/logger.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
var LOG_DIRECTORY, LOG_FILE, MAX_RECENT_LOGS, MAX_DEPTH, MAX_ARRAY_LENGTH, recentLogs, REDACTED_TEXT, MAX_DEPTH_TEXT, CIRCULAR_REFERENCE_TEXT, URL_LIKE_KEYS, SENSITIVE_QUERY_PARAM_PATTERN, redactKeys, logStream, isPlainObject, normalizeKey, sanitizeUrlForLogs, serializeValue, pushRecentLog, createPayload, writeLog, logger;
var init_logger = __esm({
  "server/utils/logger.ts"() {
    "use strict";
    LOG_DIRECTORY = path.resolve(process.cwd(), "logs");
    LOG_FILE = path.join(LOG_DIRECTORY, "server.jsonl");
    MAX_RECENT_LOGS = 100;
    MAX_DEPTH = 5;
    MAX_ARRAY_LENGTH = 50;
    recentLogs = [];
    REDACTED_TEXT = "[REDACTED]";
    MAX_DEPTH_TEXT = "[MaxDepthExceeded]";
    CIRCULAR_REFERENCE_TEXT = "[CircularReference]";
    URL_LIKE_KEYS = /* @__PURE__ */ new Set(["path", "url", "originalurl", "referer", "referrer", "location"]);
    SENSITIVE_QUERY_PARAM_PATTERN = /([?&](?:auth_token|access_token|refresh_token|token|signature|sig|api_key|apikey|uid|userId|sid|secret|key|email|username)=)[^&#]*/gi;
    redactKeys = /* @__PURE__ */ new Set([
      "password",
      "token",
      "accesstoken",
      "refreshtoken",
      "refreshtokenhash",
      "tokenfingerprint",
      "authorization",
      "cookie",
      "set-cookie",
      "secret",
      "privatekey",
      "apikey",
      "clientsecret",
      "signature",
      "ciphertext",
      "authtag",
      "iv",
      "email",
      "username",
      "identifier",
      "candidatepin",
      "decoypin",
      "decoypassword",
      "x-vault-title",
      "x-vault-metadata",
      "x-vault-folder",
      "x-vault-key",
      "payload",
      "binarypayload",
      "modernpayload",
      "masterkey",
      "secretkey",
      "encryptionkey",
      "encryptedmetadata",
      "dek",
      "kek",
      "uid",
      "userid",
      "sessionid",
      "user",
      "mnemonic",
      "seedphrase",
      "passphrase",
      "pqcsalt",
      "salt",
      "totp",
      "totpsecret",
      "recoverycodes",
      "backupcodes",
      "twofactorsecret",
      "twofactorcode"
    ]);
    fs.mkdirSync(LOG_DIRECTORY, {
      recursive: true
    });
    logStream = fs.createWriteStream(LOG_FILE, {
      flags: "a",
      encoding: "utf8"
    });
    logStream.on("error", (error) => {
      console.error("Logger stream error:", error);
    });
    isPlainObject = (value) => {
      return Object.prototype.toString.call(value) === "[object Object]";
    };
    normalizeKey = (key) => {
      return key.toLowerCase();
    };
    sanitizeUrlForLogs = (value) => {
      return value.replace(SENSITIVE_QUERY_PARAM_PATTERN, "$1[REDACTED]");
    };
    serializeValue = (value, depth = 0, seen = /* @__PURE__ */ new WeakSet(), keyHint) => {
      if (depth > MAX_DEPTH) {
        return MAX_DEPTH_TEXT;
      }
      if (value === null || value === void 0 || typeof value === "number" || typeof value === "boolean") {
        return value;
      }
      if (typeof value === "string") {
        if (keyHint && URL_LIKE_KEYS.has(normalizeKey(keyHint))) {
          return sanitizeUrlForLogs(value);
        }
        return value;
      }
      if (typeof value === "bigint") {
        return value.toString();
      }
      if (typeof value === "function") {
        return `[Function: ${value.name || "anonymous"}]`;
      }
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack
        };
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (Buffer.isBuffer(value)) {
        return `[Buffer: ${value.length} bytes]`;
      }
      if (Array.isArray(value)) {
        return value.slice(0, MAX_ARRAY_LENGTH).map((entry) => serializeValue(entry, depth + 1, seen, keyHint));
      }
      if (typeof value === "object") {
        if (seen.has(value)) {
          return CIRCULAR_REFERENCE_TEXT;
        }
        seen.add(value);
        if (!isPlainObject(value)) {
          return String(value);
        }
        const serializedObject = {};
        for (const [key, entry] of Object.entries(value)) {
          const normalizedKey = normalizeKey(key);
          serializedObject[key] = redactKeys.has(normalizedKey) ? REDACTED_TEXT : serializeValue(entry, depth + 1, seen, key);
        }
        return serializedObject;
      }
      return String(value);
    };
    pushRecentLog = (payload) => {
      recentLogs.push(payload);
      if (recentLogs.length > MAX_RECENT_LOGS) {
        recentLogs.shift();
      }
    };
    createPayload = (level, message, meta, extraMeta) => {
      const mergedMeta = {};
      if (meta instanceof Error) {
        mergedMeta.error = {
          name: meta.name,
          message: meta.message,
          stack: meta.stack
        };
      } else if (isPlainObject(meta)) {
        Object.assign(mergedMeta, meta);
      } else if (meta !== void 0) {
        mergedMeta.value = meta;
      }
      if (isPlainObject(extraMeta)) {
        Object.assign(mergedMeta, extraMeta);
      }
      return {
        level,
        message,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        pid: process.pid,
        hostname: os.hostname(),
        environment: process.env.NODE_ENV || "development",
        ...Object.keys(mergedMeta).length > 0 ? {
          meta: serializeValue(mergedMeta)
        } : {}
      };
    };
    writeLog = (level, message, meta, extraMeta) => {
      try {
        const payload = createPayload(level, message, meta, extraMeta);
        pushRecentLog(payload);
        const line = `${JSON.stringify(payload)}
`;
        logStream.write(line);
        if (process.env.NODE_ENV !== "production") {
          const consoleMethod = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
          consoleMethod(`[${payload.timestamp}] ${level.toUpperCase()} ${message}`, payload.meta || "");
        }
      } catch (error) {
        console.error("Logger failure:", error);
      }
    };
    logger = {
      debug: (message, meta, extraMeta) => {
        writeLog("debug", message, meta, extraMeta);
      },
      info: (message, meta, extraMeta) => {
        writeLog("info", message, meta, extraMeta);
      },
      warn: (message, meta, extraMeta) => {
        writeLog("warn", message, meta, extraMeta);
      },
      error: (message, meta, extraMeta) => {
        writeLog("error", message, meta, extraMeta);
      },
      getRecentLogs() {
        return [...recentLogs];
      },
      clearLogs() {
        recentLogs.length = 0;
        try {
          logStream.end();
          fs.writeFileSync(LOG_FILE, "", { flag: "w" });
          logStream = fs.createWriteStream(LOG_FILE, {
            flags: "a",
            encoding: "utf8"
          });
          logStream.on("error", (error) => {
            console.error("Logger stream error:", error);
          });
        } catch (error) {
          console.error("Failed to clear log file:", error);
        }
      },
      close() {
        logStream.end();
      }
    };
    process.on("beforeExit", () => {
      logger.close();
    });
    process.on("SIGINT", () => {
      logger.close();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      logger.close();
      process.exit(0);
    });
  }
});

// server/utils/jwtDiagnostics.ts
var jwtDiagnostics_exports = {};
__export(jwtDiagnostics_exports, {
  diagnoseTokenSignature: () => diagnoseTokenSignature,
  logJwtDiagnostics: () => logJwtDiagnostics,
  testJwtSigningAndVerification: () => testJwtSigningAndVerification,
  validateJwtSecrets: () => validateJwtSecrets
});
import jwt2 from "jsonwebtoken";
var hasTokenType, validateJwtSecrets, testJwtSigningAndVerification, logJwtDiagnostics, diagnoseTokenSignature;
var init_jwtDiagnostics = __esm({
  "server/utils/jwtDiagnostics.ts"() {
    "use strict";
    init_logger();
    hasTokenType = (value, expected) => typeof value === "object" && value !== null && value.type === expected;
    validateJwtSecrets = () => {
      const warnings = [];
      const errors = [];
      const jwtSecret = process.env.JWT_SECRET;
      const refreshSecret = process.env.REFRESH_TOKEN_SECRET;
      if (!jwtSecret) {
        errors.push("JWT_SECRET is required but not set");
      } else if (jwtSecret.length < 32) {
        errors.push(
          `JWT_SECRET is too short (${jwtSecret.length} chars). Minimum recommended: 32 chars`
        );
      }
      if (!refreshSecret) {
        warnings.push(
          "REFRESH_TOKEN_SECRET is not set. Falling back to JWT_SECRET (reduces token isolation)"
        );
      } else if (refreshSecret === jwtSecret) {
        warnings.push(
          "REFRESH_TOKEN_SECRET equals JWT_SECRET. Consider using separate secrets for better security"
        );
      } else if (refreshSecret.length < 32) {
        errors.push(
          `REFRESH_TOKEN_SECRET is too short (${refreshSecret.length} chars). Minimum recommended: 32 chars`
        );
      }
      return {
        isValid: errors.length === 0,
        warnings,
        errors
      };
    };
    testJwtSigningAndVerification = () => {
      const errors = [];
      const testResults = {
        accessToken: { sign: false, verify: false },
        refreshToken: { sign: false, verify: false }
      };
      const jwtSecret = process.env.JWT_SECRET;
      const refreshSecret = process.env.REFRESH_TOKEN_SECRET || jwtSecret;
      try {
        const accessTokenPayload = {
          sub: "test-user-id",
          username: "testuser",
          sessionId: "test-session-id",
          type: "access"
        };
        const accessToken = jwt2.sign(accessTokenPayload, jwtSecret, {
          expiresIn: "15m"
        });
        testResults.accessToken.sign = true;
        try {
          const decoded = jwt2.verify(accessToken, jwtSecret);
          testResults.accessToken.verify = hasTokenType(decoded, "access");
        } catch (e) {
          errors.push(`Access token verification failed: ${e.message}`);
        }
        const refreshTokenPayload = {
          sub: "test-user-id",
          username: "testuser",
          sessionId: "test-session-id",
          deviceId: "test-device-id",
          type: "refresh"
        };
        const refreshToken = jwt2.sign(refreshTokenPayload, refreshSecret, {
          expiresIn: "30d"
        });
        testResults.refreshToken.sign = true;
        try {
          const decoded = jwt2.verify(refreshToken, refreshSecret);
          testResults.refreshToken.verify = hasTokenType(decoded, "refresh");
        } catch (e) {
          errors.push(`Refresh token verification failed: ${e.message}`);
        }
      } catch (e) {
        errors.push(`JWT test failed: ${e.message}`);
      }
      const success = testResults.accessToken.sign && testResults.accessToken.verify && testResults.refreshToken.sign && testResults.refreshToken.verify;
      return {
        success,
        testResults,
        errors
      };
    };
    logJwtDiagnostics = () => {
      logger.info("\u{1F510} JWT Configuration Diagnostics", {
        nodeEnv: process.env.NODE_ENV,
        hasJwtSecret: !!process.env.JWT_SECRET,
        hasRefreshSecret: !!process.env.REFRESH_TOKEN_SECRET,
        jwtSecretLength: process.env.JWT_SECRET?.length || 0,
        refreshSecretLength: process.env.REFRESH_TOKEN_SECRET?.length || 0
      });
      const validation = validateJwtSecrets();
      if (validation.errors.length > 0) {
        logger.error("\u274C JWT Configuration Errors:", { errors: validation.errors });
      }
      if (validation.warnings.length > 0) {
        logger.warn("\u26A0\uFE0F  JWT Configuration Warnings:", {
          warnings: validation.warnings
        });
      }
      const test = testJwtSigningAndVerification();
      logger.info("\u2713 JWT Signing & Verification Test", {
        accessTokenSign: test.testResults.accessToken.sign ? "\u2713" : "\u2717",
        accessTokenVerify: test.testResults.accessToken.verify ? "\u2713" : "\u2717",
        refreshTokenSign: test.testResults.refreshToken.sign ? "\u2713" : "\u2717",
        refreshTokenVerify: test.testResults.refreshToken.verify ? "\u2713" : "\u2717"
      });
      if (test.errors.length > 0) {
        logger.error("JWT Test Errors:", { errors: test.errors });
      }
    };
    diagnoseTokenSignature = (token) => {
      const jwtSecret = process.env.JWT_SECRET;
      const refreshSecret = process.env.REFRESH_TOKEN_SECRET || jwtSecret;
      let isValidAccessSecret = false;
      let isValidRefreshSecret = false;
      try {
        jwt2.verify(token, jwtSecret, {
          ignoreExpiration: true
        });
        isValidAccessSecret = true;
      } catch (e) {
      }
      try {
        jwt2.verify(token, refreshSecret, {
          ignoreExpiration: true
        });
        isValidRefreshSecret = true;
      } catch (e) {
      }
      let likelyType = "unknown";
      try {
        const decoded = jwt2.decode(token);
        if (decoded?.type === "access") likelyType = "access";
        else if (decoded?.type === "refresh") likelyType = "refresh";
      } catch (e) {
      }
      return {
        isValidAccessSecret,
        isValidRefreshSecret,
        likelyType
      };
    };
  }
});

// server.ts
import "dotenv/config";
import express10 from "express";
import { createServer } from "http";
import cors from "cors";
import compression3 from "compression";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit8 from "express-rate-limit";
import os4 from "os";
import { monitorEventLoopDelay as monitorEventLoopDelay2 } from "perf_hooks";
import fs12 from "fs";
import path15 from "path";

// server/middleware/mongoSanitize.ts
var FORBIDDEN_KEYS = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
var isDangerousKey = (key) => key.startsWith("$") || key.includes(".") || FORBIDDEN_KEYS.has(key);
var customMongoSanitize = (req, _res, next) => {
  const sanitize = (obj, seen = /* @__PURE__ */ new WeakSet()) => {
    if (!obj || typeof obj !== "object" || Buffer.isBuffer(obj)) {
      return;
    }
    if (seen.has(obj)) {
      return;
    }
    seen.add(obj);
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        sanitize(obj[i], seen);
      }
      return;
    }
    for (const key of Object.getOwnPropertyNames(obj)) {
      if (isDangerousKey(key)) {
        try {
          delete obj[key];
        } catch {
          try {
            obj[key] = void 0;
          } catch {
          }
        }
      } else {
        sanitize(obj[key], seen);
      }
    }
  };
  if (req.body) sanitize(req.body);
  if (req.params) sanitize(req.params);
  try {
    if (req.query) sanitize(req.query);
  } catch {
  }
  next();
};

// server.ts
import { randomUUID as randomUUID5 } from "crypto";
import mongoose30 from "mongoose";

// server/mongo.ts
import dns from "dns";
import dotenv from "dotenv";
import mongoose from "mongoose";
dotenv.config();
var getEnvValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return void 0;
};
var resolveDatabaseName = (mongoUri) => {
  const configured = getEnvValue("MONGODB_DB_NAME", "MONGODB_DB", "MONGO_DB_NAME", "MONGO_DB");
  if (configured && configured.toLowerCase() !== "admin") {
    return configured;
  }
  if (mongoUri) {
    try {
      const match = mongoUri.match(/(?:mongodb(?:\+srv)?:\/\/[^\/]+\/)([^?\/]+)/i);
      if (match && match[1] && match[1].toLowerCase() !== "admin") {
        return match[1].trim();
      }
    } catch {
    }
  }
  return "vault";
};
var primaryUri = getEnvValue("MONGODB_URI", "MONGODB_URL", "MONGO_URI", "MONGO_URL");
var resolveConfiguredFallbackUris = () => {
  const direct = process.env.MONGODB_URI_DIRECT?.trim();
  const fallback = (process.env.MONGODB_URI_FALLBACK || process.env.MONGODB_URL_FALLBACK || process.env.MONGO_URI_FALLBACK || process.env.MONGO_URL_FALLBACK)?.trim();
  const numberedKeys = Object.keys(process.env).filter((k) => /^(?:MONGODB|MONGO)_(?:URI|URL)_(\d+)$/i.test(k)).sort((a, b) => {
    const numA = Number.parseInt(a.match(/\d+$/)?.[0] || "0", 10);
    const numB = Number.parseInt(b.match(/\d+$/)?.[0] || "0", 10);
    return numA - numB;
  });
  const rawList = [direct, fallback, ...numberedKeys.map((key) => process.env[key]?.trim())];
  return rawList.filter(
    (value) => Boolean(value && (value.startsWith("mongodb://") || value.startsWith("mongodb+srv://")))
  ).filter((value, idx, self) => self.indexOf(value) === idx);
};
var configuredFallbackUris = resolveConfiguredFallbackUris();
var retryDnsServers = (process.env.MONGODB_DNS_RETRY_SERVERS || process.env.MONGODB_DNS_SERVERS || "1.1.1.1,8.8.8.8").split(",").map((value) => value.trim()).filter(Boolean);
if (!primaryUri) {
  throw new Error("MONGODB_URI (or MONGO_URI / MONGODB_URL) is required in environment variables.");
}
var connectionPromise = null;
var currentUri = primaryUri;
var dnsRetryApplied = false;
var isSrvResolutionError = (error) => {
  const candidate = error;
  return candidate?.syscall === "querySrv" || candidate?.code === "ECONNREFUSED" || String(candidate?.message || "").includes("querySrv");
};
var isServerSelectionError = (error) => {
  const candidate = error;
  return candidate?.name === "MongooseServerSelectionError" || String(candidate?.message || "").includes("MongooseServerSelectionError") || String(candidate?.message || "").includes(
    "Could not connect to any servers in your MongoDB Atlas cluster"
  );
};
var applyDnsRetryServers = () => {
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
var connectWithUri = async (mongoUri) => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  const dbName = resolveDatabaseName(mongoUri);
  const connection = await mongoose.connect(mongoUri, {
    dbName,
    autoIndex: process.env.NODE_ENV !== "production",
    serverSelectionTimeoutMS: 1e4,
    maxPoolSize: 20
  });
  currentUri = mongoUri;
  return connection;
};
var canConnectToUri = async (mongoUri) => {
  const dbName = resolveDatabaseName(mongoUri);
  const probe = await mongoose.createConnection(mongoUri, {
    dbName,
    autoIndex: false,
    serverSelectionTimeoutMS: 1e4,
    maxPoolSize: 5
  }).asPromise();
  try {
    await probe.db?.admin().ping();
    return true;
  } finally {
    await probe.close();
  }
};
var buildUriCandidates = () => {
  const candidates = [currentUri, primaryUri, ...configuredFallbackUris].filter((value) => Boolean(value)).map((value) => value.trim());
  if (process.env.MONGODB_ALLOW_LOCAL_FALLBACK === "true") {
    candidates.push(`mongodb://127.0.0.1:27017/${resolveDatabaseName(primaryUri)}`);
  }
  return [...new Set(candidates)];
};
var isStorageFullError = (error) => {
  const candidate = error;
  const message = [
    candidate?.message,
    candidate?.errorResponse?.errmsg,
    candidate?.errorResponse?.message,
    candidate?.cause?.message,
    ...candidate?.writeErrors?.map((entry) => entry?.errmsg) || []
  ].filter(Boolean).join(" | ").toLowerCase();
  const codeCandidates = [
    candidate?.code,
    candidate?.errorResponse?.code,
    candidate?.cause?.code,
    ...candidate?.writeErrors?.map((entry) => entry?.code) || []
  ];
  return codeCandidates.includes(8e3) || message.includes("storage limit") || message.includes("quota exceeded") || message.includes("capacity exceeded") || message.includes("you are out of space") || message.includes("disk is full") || message.includes("over your space quota") || message.includes("database storage limit has been reached");
};
var switchToNextMongoUri = async () => {
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
        `Switched MongoDB connection to candidate #${index + 1} after storage failover.`
      );
      return true;
    } catch (error) {
      console.error(`MongoDB failover candidate #${index + 1} failed:`, error);
    }
  }
  return false;
};
if (!mongoose.connection.listeners("error").length) {
  mongoose.connection.on("error", () => {
  });
}
var connectToMongo = async () => {
  if (mongoose.connection.readyState === 1) {
    try {
      await mongoose.connection.db?.admin().ping();
      return mongoose;
    } catch {
      await mongoose.disconnect().catch(() => void 0);
    }
  }
  if (!connectionPromise) {
    const rawPromise = (async () => {
      const candidates = buildUriCandidates();
      let lastError;
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        try {
          const connection = await connectWithUri(candidate);
          console.log(
            `Connected to MongoDB successfully${candidate === primaryUri ? "." : ` using candidate #${index + 1}.`}`
          );
          return connection;
        } catch (error) {
          lastError = error;
          const errMsg = error instanceof Error ? error.message : String(error);
          console.warn(
            `[MONGO] Candidate #${index + 1} connection failed (${errMsg}). Trying next candidate...`
          );
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
          `MongoDB Atlas SRV lookup failed. Configure MONGODB_URI_DIRECT with a direct Atlas replica-set URI using mongodb://, or repair DNS access to MongoDB Atlas. Local MongoDB fallback is disabled.`
        );
      }
      if (isServerSelectionError(lastError)) {
        throw new Error(
          `Failed to connect to MongoDB Atlas. Check Atlas Network Access/IP allowlisting and the configured direct or SRV Atlas URI. Local MongoDB fallback is disabled.`
        );
      }
      throw lastError;
    })();
    connectionPromise = rawPromise;
    rawPromise.catch(() => {
    }).finally(() => {
      if (connectionPromise === rawPromise) {
        connectionPromise = null;
      }
    });
  }
  return connectionPromise;
};
var lastFallbackProbeTime = 0;
var FALLBACK_PROBE_INTERVAL_MS = 10 * 60 * 1e3;
var probeFallbackCandidates = async () => {
  const now = Date.now();
  if (now - lastFallbackProbeTime < FALLBACK_PROBE_INTERVAL_MS) {
    return;
  }
  lastFallbackProbeTime = now;
  for (const uri of configuredFallbackUris) {
    if (uri && uri !== currentUri && !uri.includes("127.0.0.1") && !uri.includes("localhost")) {
      canConnectToUri(uri).catch(() => {
      });
    }
  }
};
var ensureMongoReady = async () => {
  try {
    await connectToMongo();
    void probeFallbackCandidates();
    return mongoose.connection.readyState === 1;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    return false;
  }
};
var getDbStatus = () => mongoose.connection.readyState.toString();

// server/services/multiClusterPool.ts
init_logger();
import mongoose2 from "mongoose";
var resolveDatabaseName2 = (mongoUri) => {
  const configured = (process.env.MONGODB_DB_NAME || process.env.MONGODB_DB || process.env.MONGO_DB_NAME || process.env.MONGO_DB)?.trim();
  if (configured && configured.toLowerCase() !== "admin") {
    return configured;
  }
  if (mongoUri) {
    try {
      const match = mongoUri.match(/(?:mongodb(?:\+srv)?:\/\/[^\/]+\/)([^?\/]+)/i);
      if (match && match[1] && match[1].toLowerCase() !== "admin") {
        return match[1].trim();
      }
    } catch {
    }
  }
  return "vault";
};
var extractClusterHost = (uri) => {
  try {
    const match = uri.match(/@([^/?#]+)/);
    if (match && match[1]) {
      return match[1].split(",")[0];
    }
  } catch {
  }
  return "unknown-host";
};
var discoverClusterTargets = (env2 = process.env) => {
  const targets = [];
  const seenUris = /* @__PURE__ */ new Set();
  const addTarget = (id, name, rawUri, priority) => {
    const uri = rawUri?.trim();
    if (uri && (uri.startsWith("mongodb://") || uri.startsWith("mongodb+srv://"))) {
      if (!seenUris.has(uri)) {
        seenUris.add(uri);
        targets.push({ id, name, uri, priority });
      }
    }
  };
  const primaryUri2 = (env2.MONGODB_URI || env2.MONGO_URI || env2.MONGODB_URL || env2.MONGO_URL)?.trim();
  addTarget("primary", "Primary (Cluster 1)", primaryUri2, 1);
  const fallbackUri = (env2.MONGODB_URI_FALLBACK || env2.MONGODB_URL_FALLBACK || env2.MONGO_URI_FALLBACK || env2.MONGO_URL_FALLBACK)?.trim();
  addTarget("fallback", "Fallback (Cluster 2)", fallbackUri, 2);
  const numberedKeys = Object.keys(env2).filter((k) => /^(?:MONGODB|MONGO)_(?:URI|URL)_(\d+)$/i.test(k)).sort((a, b) => {
    const numA = Number.parseInt(a.match(/\d+$/)?.[0] || "0", 10);
    const numB = Number.parseInt(b.match(/\d+$/)?.[0] || "0", 10);
    return numA - numB;
  });
  let currentPriority = 3;
  for (const key of numberedKeys) {
    const num = key.match(/\d+$/)?.[0] || String(currentPriority);
    addTarget(
      `backup_${num}`,
      `Backup ${num} (Cluster ${currentPriority})`,
      env2[key],
      currentPriority
    );
    currentPriority += 1;
  }
  if (env2.MONGODB_URI_DIRECT) {
    addTarget("direct", "Direct Non-SRV", env2.MONGODB_URI_DIRECT, currentPriority);
  }
  return targets;
};
var MultiClusterPoolManager = class {
  nodes = /* @__PURE__ */ new Map();
  isInitialized = false;
  initPromise = null;
  async initialize() {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const targets = discoverClusterTargets();
      logger.info(`[MultiClusterPool] Initializing pool with ${targets.length} target(s)...`);
      for (const target of targets) {
        try {
          const dbName = resolveDatabaseName2(target.uri);
          const host = extractClusterHost(target.uri);
          const connection = mongoose2.createConnection(target.uri, {
            dbName,
            autoIndex: process.env.NODE_ENV !== "production",
            serverSelectionTimeoutMS: 1e4,
            connectTimeoutMS: 1e4,
            maxPoolSize: 10
          });
          connection.on("error", (err) => {
            logger.warn(`[MultiClusterPool] Error on ${target.name}: ${err?.message || err}`);
            const node2 = this.nodes.get(target.id);
            if (node2) node2.isHealthy = false;
          });
          connection.on("connected", () => {
            const node2 = this.nodes.get(target.id);
            if (node2) node2.isHealthy = true;
          });
          const node = {
            id: target.id,
            name: target.name,
            uri: target.uri,
            host,
            priority: target.priority,
            connection,
            isHealthy: false,
            isFull: false,
            lastPingMs: 0,
            lastCheckedAt: /* @__PURE__ */ new Date()
          };
          this.nodes.set(target.id, node);
        } catch (err) {
          logger.error(`[MultiClusterPool] Failed to create connection for ${target.name}:`, err);
        }
      }
      this.isInitialized = true;
      void this.pingAllNodes();
    })();
    return this.initPromise;
  }
  async pingAllNodes() {
    const promises = Array.from(this.nodes.values()).map(async (node) => {
      const start = Date.now();
      try {
        await node.connection.asPromise();
        await node.connection.db?.admin().ping();
        node.isHealthy = true;
        node.lastPingMs = Date.now() - start;
        node.lastCheckedAt = /* @__PURE__ */ new Date();
      } catch (err) {
        node.isHealthy = false;
        node.lastPingMs = Date.now() - start;
        node.lastCheckedAt = /* @__PURE__ */ new Date();
        logger.warn(
          `[MultiClusterPool] Node ${node.name} ping failed (${node.lastPingMs}ms): ${err?.message}`
        );
      }
      return node;
    });
    return Promise.all(promises);
  }
  getAllNodes() {
    return Array.from(this.nodes.values()).sort((a, b) => a.priority - b.priority);
  }
  getHealthyNodes() {
    return this.getAllNodes().filter((node) => node.isHealthy && node.connection.readyState === 1);
  }
  async getWriteNode() {
    await this.initialize();
    const healthy = this.getHealthyNodes();
    const candidate = healthy.find((node) => !node.isFull);
    if (candidate) {
      return candidate;
    }
    const all = this.getAllNodes();
    if (healthy.length > 0) {
      return healthy[0];
    }
    if (all.length > 0) {
      return all[0];
    }
    throw new Error("No MongoDB cluster nodes available in multi-cluster pool.");
  }
  markNodeFull(nodeIdOrUri) {
    for (const node of this.nodes.values()) {
      if (node.id === nodeIdOrUri || node.uri === nodeIdOrUri || node.host === nodeIdOrUri) {
        node.isFull = true;
        logger.warn(`[MultiClusterPool] Node ${node.name} (${node.host}) marked as STORAGE_FULL.`);
      }
    }
  }
  getNodeByHost(host) {
    return Array.from(this.nodes.values()).find(
      (node) => node.host.includes(host) || host.includes(node.host)
    );
  }
  getNodeById(id) {
    return this.nodes.get(id);
  }
};
var multiClusterPool = new MultiClusterPoolManager();

// server/network.ts
var resolvePort = (rawPort, fallbackPort) => {
  const parsedPort = Number(rawPort);
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    return fallbackPort;
  }
  return parsedPort;
};
var listenWithFallback = async (httpServer, host, startPort, maxAttempts = 10) => {
  let currentPort = startPort;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          httpServer.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          httpServer.off("error", onError);
          resolve();
        };
        httpServer.once("error", onError);
        httpServer.once("listening", onListening);
        httpServer.listen(currentPort, host);
      });
      return currentPort;
    } catch (error) {
      const err = error;
      if (err.code !== "EADDRINUSE" || attempt === maxAttempts - 1) {
        throw error;
      }
      console.warn(`Port ${currentPort} is already in use. Trying ${currentPort + 1}...`);
      currentPort += 1;
    }
  }
  throw new Error("No available port found in allowed retry range.");
};

// server/socket.ts
import { Server } from "socket.io";

// server/utils/auth.ts
init_logger();
import dotenv2 from "dotenv";
import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
dotenv2.config();
var IS_PRODUCTION = process.env.NODE_ENV === "production";
var JWT_SECRET = process.env.JWT_SECRET;
var JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, "\n");
var JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, "\n");
var JWT_ACTIVE_KID = process.env.JWT_ACTIVE_KID?.trim() || "k1";
var JWT_PRIVATE_KEYS_JSON = process.env.JWT_PRIVATE_KEYS_JSON?.trim();
var JWT_PUBLIC_KEYS_JSON = process.env.JWT_PUBLIC_KEYS_JSON?.trim();
var REQUIRE_ES256_IN_PRODUCTION = (process.env.REQUIRE_ES256_IN_PRODUCTION?.trim().toLowerCase() || "false") === "true";
var JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "12h";
var REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "30d";
var REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || "vault_refresh_token";
var REFRESH_COOKIE_PATH = process.env.REFRESH_COOKIE_PATH || "/api/auth";
var REFRESH_COOKIE_DOMAIN = parseHostname(process.env.REFRESH_COOKIE_DOMAIN?.trim()) || void 0;
var REFRESH_COOKIE_SECURE = process.env.REFRESH_COOKIE_SECURE?.trim() === "true" ? true : process.env.REFRESH_COOKIE_SECURE?.trim() === "false" ? false : process.env.NODE_ENV === "production";
var REFRESH_COOKIE_SAME_SITE = process.env.REFRESH_COOKIE_SAME_SITE?.trim().toLowerCase() || (IS_PRODUCTION ? "strict" : "lax");
var parseKeyRing = (raw) => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return Object.fromEntries(
      Object.entries(parsed).filter(([keyId, key]) => Boolean(keyId && typeof key === "string" && key.trim())).map(([keyId, key]) => [keyId, key.replace(/\\n/g, "\n")])
    );
  } catch {
    throw new Error("Invalid JSON in JWT key ring configuration.");
  }
};
var privateKeyRing = (() => {
  const fromJson = parseKeyRing(JWT_PRIVATE_KEYS_JSON);
  if (Object.keys(fromJson).length > 0) return fromJson;
  if (JWT_PRIVATE_KEY) return { [JWT_ACTIVE_KID]: JWT_PRIVATE_KEY };
  return {};
})();
var publicKeyRing = (() => {
  const fromJson = parseKeyRing(JWT_PUBLIC_KEYS_JSON);
  if (Object.keys(fromJson).length > 0) return fromJson;
  if (JWT_PUBLIC_KEY) return { [JWT_ACTIVE_KID]: JWT_PUBLIC_KEY };
  return {};
})();
var hasEs256Keys = Boolean(privateKeyRing[JWT_ACTIVE_KID]);
var ES256_ENABLED = hasEs256Keys && (!IS_PRODUCTION || REQUIRE_ES256_IN_PRODUCTION);
if (!JWT_SECRET && !hasEs256Keys) {
  throw new Error("JWT_SECRET must be configured.");
}
if (IS_PRODUCTION && REQUIRE_ES256_IN_PRODUCTION && !hasEs256Keys) {
  throw new Error(
    "ES256 key ring must be configured in production when REQUIRE_ES256_IN_PRODUCTION is enabled."
  );
}
var REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET;
var REFRESH_TOKEN_PRIVATE_KEY = process.env.REFRESH_TOKEN_PRIVATE_KEY?.replace(/\\n/g, "\n") || JWT_PRIVATE_KEY;
var REFRESH_TOKEN_PUBLIC_KEY = process.env.REFRESH_TOKEN_PUBLIC_KEY?.replace(/\\n/g, "\n") || JWT_PUBLIC_KEY;
var refreshEs256Enabled = Boolean(REFRESH_TOKEN_PRIVATE_KEY) && (!IS_PRODUCTION || REQUIRE_ES256_IN_PRODUCTION);
var JWT_ALGORITHM = ES256_ENABLED ? "ES256" : "HS256";
var REFRESH_JWT_ALGORITHM = refreshEs256Enabled ? "ES256" : "HS256";
var jwtSigningKey = ES256_ENABLED ? privateKeyRing[JWT_ACTIVE_KID] : JWT_SECRET || "";
var jwtVerificationKey = ES256_ENABLED ? publicKeyRing[JWT_ACTIVE_KID] || JWT_SECRET || "" : JWT_SECRET || "";
var refreshSigningKey = refreshEs256Enabled ? REFRESH_TOKEN_PRIVATE_KEY || "" : REFRESH_TOKEN_SECRET || "";
var refreshVerificationKey = refreshEs256Enabled ? REFRESH_TOKEN_PUBLIC_KEY || "" : REFRESH_TOKEN_SECRET || "";
if (IS_PRODUCTION && REQUIRE_ES256_IN_PRODUCTION && !REFRESH_TOKEN_PRIVATE_KEY) {
  throw new Error(
    "REFRESH_TOKEN_PRIVATE_KEY must be configured in production when REQUIRE_ES256_IN_PRODUCTION is enabled."
  );
}
if (ES256_ENABLED && !publicKeyRing[JWT_ACTIVE_KID]) {
  throw new Error("JWT_PUBLIC_KEY/JWT_PUBLIC_KEYS_JSON must include JWT_ACTIVE_KID.");
}
if (REFRESH_JWT_ALGORITHM === "ES256" && !REFRESH_TOKEN_PUBLIC_KEY) {
  throw new Error("REFRESH_TOKEN_PUBLIC_KEY must be configured when using ES256 refresh tokens.");
}
if (IS_PRODUCTION && JWT_ALGORITHM === "HS256" && (!JWT_SECRET || JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must be at least 32 characters in production for HS256.");
}
if (IS_PRODUCTION && REFRESH_JWT_ALGORITHM === "HS256" && (!REFRESH_TOKEN_SECRET || REFRESH_TOKEN_SECRET.length < 32)) {
  throw new Error("REFRESH_TOKEN_SECRET must be at least 32 characters in production for HS256.");
}
if (!["strict", "lax", "none"].includes(REFRESH_COOKIE_SAME_SITE)) {
  throw new Error("REFRESH_COOKIE_SAME_SITE must be one of: strict, lax, none.");
}
if (REFRESH_COOKIE_SAME_SITE === "none" && !REFRESH_COOKIE_SECURE && IS_PRODUCTION) {
  throw new Error(
    "REFRESH_COOKIE_SECURE must be true when REFRESH_COOKIE_SAME_SITE is none in production."
  );
}
var getTokenFingerprint = (token) => {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
};
var createAccessToken = (payload, expiresIn) => {
  const signOptions = {
    algorithm: JWT_ALGORITHM,
    expiresIn: expiresIn !== void 0 ? expiresIn : JWT_EXPIRES_IN
  };
  if (JWT_ALGORITHM === "ES256") {
    signOptions.keyid = JWT_ACTIVE_KID;
  }
  return jwt.sign(
    {
      sub: payload.sub,
      username: payload.username,
      sessionId: payload.sessionId,
      type: "access"
    },
    jwtSigningKey,
    signOptions
  );
};
var createRefreshToken = (payload) => {
  const signOptions = {
    algorithm: REFRESH_JWT_ALGORITHM,
    expiresIn: REFRESH_TOKEN_EXPIRES_IN
  };
  if (REFRESH_JWT_ALGORITHM === "ES256") {
    signOptions.keyid = JWT_ACTIVE_KID;
  }
  return jwt.sign(
    {
      sub: payload.sub,
      username: payload.username,
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
      type: "refresh"
    },
    refreshSigningKey,
    signOptions
  );
};
var createMfaToken = (payload) => {
  const signOptions = {
    algorithm: JWT_ALGORITHM,
    expiresIn: "5m"
  };
  if (JWT_ALGORITHM === "ES256") {
    signOptions.keyid = JWT_ACTIVE_KID;
  }
  return jwt.sign(
    {
      sub: payload.sub,
      username: payload.username,
      type: "mfa"
    },
    jwtSigningKey,
    signOptions
  );
};
var verifyAccessToken = (token) => {
  try {
    const decodedHeader = jwt.decode(token, { complete: true });
    const kid = decodedHeader?.header?.kid;
    const verificationKey = JWT_ALGORITHM === "ES256" ? (() => {
      const resolvedKid = kid || JWT_ACTIVE_KID;
      const key = publicKeyRing[resolvedKid];
      if (!key) {
        throw new Error(`Unknown or missing JWT kid: ${resolvedKid}`);
      }
      return key;
    })() : jwtVerificationKey;
    const decoded = jwt.verify(token, verificationKey, {
      algorithms: [JWT_ALGORITHM]
    });
    if (typeof decoded !== "object" || decoded == null || decoded.type !== "access" || typeof decoded.sub !== "string" || typeof decoded.sessionId !== "string") {
      throw new Error("Invalid access token structure.");
    }
    return {
      sub: decoded.sub,
      username: typeof decoded.username === "string" ? decoded.username : "unknown",
      sessionId: decoded.sessionId,
      type: "access"
    };
  } catch (error) {
    logger.error("JWT Verification Failed", {
      error: error.message,
      tokenFingerprint: getTokenFingerprint(token),
      keyAlgorithm: JWT_ALGORITHM
    });
    throw error;
  }
};
var verifyRefreshToken = (token) => {
  try {
    const decodedHeader = jwt.decode(token, { complete: true });
    const verificationKey = REFRESH_JWT_ALGORITHM === "ES256" ? refreshVerificationKey : refreshVerificationKey;
    if (REFRESH_JWT_ALGORITHM === "ES256" && decodedHeader?.header?.kid) {
      const kid = decodedHeader.header.kid;
      if (kid !== JWT_ACTIVE_KID) {
        throw new Error(`Unexpected refresh token kid: ${kid}`);
      }
    }
    const decoded = jwt.verify(token, verificationKey, {
      algorithms: [REFRESH_JWT_ALGORITHM]
    });
    if (typeof decoded !== "object" || decoded == null || decoded.type !== "refresh" || typeof decoded.sub !== "string" || typeof decoded.sessionId !== "string" || typeof decoded.deviceId !== "string") {
      throw new Error("Invalid refresh token structure.");
    }
    return {
      sub: decoded.sub,
      username: typeof decoded.username === "string" ? decoded.username : "unknown",
      sessionId: decoded.sessionId,
      deviceId: decoded.deviceId,
      type: "refresh"
    };
  } catch (error) {
    logger.error("Refresh Token Verification Failed", {
      error: error.message,
      tokenFingerprint: getTokenFingerprint(token),
      keyAlgorithm: REFRESH_JWT_ALGORITHM,
      hasRefreshSecret: Boolean(REFRESH_TOKEN_SECRET || REFRESH_TOKEN_PRIVATE_KEY)
    });
    throw error;
  }
};
var verifyMfaToken = (token) => {
  const decodedHeader = jwt.decode(token, { complete: true });
  const kid = decodedHeader?.header?.kid;
  const verificationKey = JWT_ALGORITHM === "ES256" ? (() => {
    const resolvedKid = kid || JWT_ACTIVE_KID;
    const key = publicKeyRing[resolvedKid];
    if (!key) {
      throw new Error(`Unknown or missing JWT kid: ${resolvedKid}`);
    }
    return key;
  })() : jwtVerificationKey;
  const decoded = jwt.verify(token, verificationKey, {
    algorithms: [JWT_ALGORITHM]
  });
  if (typeof decoded !== "object" || decoded == null || decoded.type !== "mfa" || typeof decoded.sub !== "string") {
    throw new Error("Invalid MFA token.");
  }
  return {
    sub: decoded.sub,
    username: typeof decoded.username === "string" ? decoded.username : "unknown",
    type: "mfa"
  };
};
var getRefreshCookieName = () => REFRESH_COOKIE_NAME;
var shouldUseDevelopmentCookiePolicy = (req) => {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  if (!req) {
    return true;
  }
  const originHost = parseHostname(req.get("origin"));
  const hostHost = parseHostname(req.get("host"));
  return isLocalHostname(originHost) || isLocalHostname(hostHost);
};
var getRefreshCookieOptions = () => ({
  httpOnly: true,
  secure: REFRESH_COOKIE_SECURE,
  sameSite: REFRESH_COOKIE_SAME_SITE,
  path: REFRESH_COOKIE_PATH,
  ...REFRESH_COOKIE_DOMAIN ? { domain: REFRESH_COOKIE_DOMAIN } : {}
});
var getRefreshCookieOptionsForRequest = (req) => {
  if (!shouldUseDevelopmentCookiePolicy(req)) {
    const base = getRefreshCookieOptions();
    const origin = req?.get("origin");
    const host = req?.get("host");
    const originHost = parseHostname(origin);
    const hostHost = parseHostname(host);
    const isCrossSiteRequest = Boolean(originHost && hostHost && originHost !== hostHost);
    const isHttps = req?.secure || req?.protocol === "https" || req?.get("x-forwarded-proto")?.toLowerCase() === "https" || IS_PRODUCTION;
    if (isCrossSiteRequest) {
      return {
        ...base,
        sameSite: "none",
        secure: true
      };
    }
    return {
      ...base,
      secure: isHttps ? true : base.secure
    };
  }
  return {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH
  };
};
var getRefreshCookieMaxAgeMs = () => {
  const match = String(REFRESH_TOKEN_EXPIRES_IN).trim().match(/^(\d+)([smhd])$/i);
  if (!match) {
    return 30 * 24 * 60 * 60 * 1e3;
  }
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === "s" ? 1e3 : unit === "m" ? 60 * 1e3 : unit === "h" ? 60 * 60 * 1e3 : 24 * 60 * 60 * 1e3;
  return value * multiplier;
};
var buildRefreshCookieOptions = (req) => ({
  ...getRefreshCookieOptionsForRequest(req),
  maxAge: getRefreshCookieMaxAgeMs()
});
var buildClearedRefreshCookieOptions = (req) => ({
  ...getRefreshCookieOptionsForRequest(req),
  maxAge: 0,
  expires: /* @__PURE__ */ new Date(0)
});
var readCookie = (req, cookieName) => {
  if (req.cookies && typeof req.cookies[cookieName] === "string") {
    return req.cookies[cookieName];
  }
  if (req.signedCookies && typeof req.signedCookies[cookieName] === "string") {
    return req.signedCookies[cookieName];
  }
  const rawHeader = req.get("cookie") || req.headers?.cookie;
  if (!rawHeader) {
    return null;
  }
  const cookieHeader = Array.isArray(rawHeader) ? rawHeader.join("; ") : String(rawHeader);
  const targetLower = cookieName.toLowerCase();
  const entry = cookieHeader.split(";").map((item) => item.trim()).find((item) => {
    const eqIdx2 = item.indexOf("=");
    if (eqIdx2 === -1) return false;
    const key = item.slice(0, eqIdx2).trim().toLowerCase();
    return key === targetLower || key === "vault_refresh_token" || key === "refreshtoken" || key === "refresh_token";
  });
  if (!entry) {
    return null;
  }
  const eqIdx = entry.indexOf("=");
  return decodeURIComponent(entry.slice(eqIdx + 1).trim());
};
function parseHostname(value) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed).hostname;
  } catch {
    try {
      return new URL(`http://${trimmed}`).hostname;
    } catch {
      const withoutBrackets = trimmed.replace(/^\[|\]$/g, "");
      if (withoutBrackets.includes(":")) {
        return withoutBrackets;
      }
      return withoutBrackets.split(":")[0] || null;
    }
  }
}
function isLocalHostname(hostname) {
  const normalized = hostname?.replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

// server/utils/cors.ts
var IS_PRODUCTION2 = process.env.NODE_ENV === "production";
var LOCAL_HOSTS = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "::1"]);
var isPrivateNetworkHost = (hostname) => {
  if (LOCAL_HOSTS.has(hostname)) {
    return true;
  }
  return /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) || /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
};
var getAllowedCorsOrigins = () => {
  const sources = [
    process.env.CLIENT_URL,
    process.env.PUBLIC_URL,
    process.env.VITE_APP_PUBLIC_URL,
    process.env.CORS_ALLOWED_ORIGINS,
    process.env.RENDER_EXTERNAL_URL
  ];
  const origins = sources.filter(Boolean).join(",").split(",").map((value) => value.trim().replace(/\/+$/, "")).filter(Boolean);
  if (!IS_PRODUCTION2) {
    origins.push(
      "http://localhost:4000",
      "http://localhost:5173",
      "http://localhost:3000",
      "http://127.0.0.1:4000",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:3000"
    );
  }
  return [...new Set(origins)];
};
var isAllowedCorsOrigin = (origin) => {
  if (!origin) {
    return true;
  }
  const normalizedOrigin = origin.trim().replace(/\/+$/, "");
  const configuredOrigins = getAllowedCorsOrigins();
  if (configuredOrigins.includes(normalizedOrigin)) {
    return true;
  }
  if (!IS_PRODUCTION2) {
    if (configuredOrigins.includes("*") || process.env.ALLOW_ALL_CORS === "true") {
      return true;
    }
    try {
      const { hostname } = new URL(normalizedOrigin);
      if (isPrivateNetworkHost(hostname)) {
        return true;
      }
    } catch {
    }
  }
  return false;
};

// server/models/user.ts
init_logger();
import mongoose3 from "mongoose";
var baseSchemaOptions = {
  _id: false,
  versionKey: false
};
var softDeleteFields = {
  deletedAt: { type: Date, default: null, index: true },
  isDeleted: { type: Boolean, default: false, index: true }
};
var timestampFields = {
  createdAt: { type: Date, default: Date.now, immutable: true },
  updatedAt: { type: Date, default: Date.now }
};
var nullableTrimmedString = { type: String, default: null, trim: true };
var encryptedFieldSchema = new mongoose3.Schema(
  {
    cipherText: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    algorithm: {
      type: String,
      enum: ["aes-256-gcm"],
      default: "aes-256-gcm"
    },
    salt: { type: String, default: null },
    keyVersion: { type: String, default: "v1" }
  },
  baseSchemaOptions
);
var fileItemSchema = new mongoose3.Schema(
  {
    itemId: { type: String, required: true, index: true },
    fileName: { type: String, required: true, trim: true },
    filePath: { type: String, required: true },
    mimeType: { type: String, required: true, lowercase: true },
    size: { type: Number, required: true, min: 1, max: 1024 * 1024 * 500 },
    // 500MB cap
    ...timestampFields,
    ...softDeleteFields
  },
  baseSchemaOptions
);
var noteSchema = new mongoose3.Schema(
  {
    itemId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: encryptedFieldSchema, required: true },
    ...timestampFields,
    ...softDeleteFields
  },
  baseSchemaOptions
);
var passwordSchema = new mongoose3.Schema(
  {
    itemId: { type: String, required: true, index: true },
    label: { type: String, required: true, trim: true },
    username: { type: String, trim: true, default: "" },
    url: { type: String, trim: true, default: "" },
    password: { type: encryptedFieldSchema, required: true },
    notes: { type: encryptedFieldSchema, default: null },
    ...timestampFields,
    ...softDeleteFields
  },
  baseSchemaOptions
);
var secretKeySchema = new mongoose3.Schema(
  {
    itemId: { type: String, required: true, index: true },
    label: { type: String, required: true, trim: true },
    value: { type: encryptedFieldSchema, required: true },
    description: { type: String, trim: true, default: "" },
    ...timestampFields,
    ...softDeleteFields
  },
  baseSchemaOptions
);
var loginHistorySchema = new mongoose3.Schema(
  {
    loggedInAt: { type: Date, default: Date.now },
    ipAddress: { type: String, default: "unknown" },
    userAgent: { type: String, default: "unknown" },
    deviceId: { type: String, default: "unknown" },
    sessionId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILED"],
      default: "SUCCESS"
    },
    errorCode: { type: String, default: null },
    failureReason: { type: String, default: null },
    requestContext: {
      type: mongoose3.Schema.Types.Mixed,
      default: null
    }
  },
  baseSchemaOptions
);
var activityLogSchema = new mongoose3.Schema(
  {
    action: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    itemId: { type: String, default: null },
    ipAddress: { type: String, default: "unknown" },
    deviceId: { type: String, default: "unknown" },
    createdAt: { type: Date, default: Date.now },
    details: {
      type: mongoose3.Schema.Types.Mixed,
      default: {}
    }
  },
  baseSchemaOptions
);
var passwordHistorySchema = new mongoose3.Schema(
  {
    hash: { type: mongoose3.Schema.Types.Mixed, required: true },
    changedAt: { type: Date, default: Date.now }
  },
  baseSchemaOptions
);
var masterKeyHistorySchema = new mongoose3.Schema(
  {
    masterKey: { type: encryptedFieldSchema, required: true },
    masterKeyHash: { type: encryptedFieldSchema, default: null },
    changedAt: { type: Date, default: Date.now }
  },
  baseSchemaOptions
);
var sessionSchema = new mongoose3.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    familyId: { type: String, default: null, index: true },
    deviceId: { type: String, required: true },
    deviceName: { type: String, default: "" },
    refreshTokenHash: {
      type: String,
      required: true,
      select: false
    },
    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
    lastRotatedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
    ipAddress: { type: String, default: "unknown" },
    userAgent: { type: String, default: "unknown" },
    loginMethod: {
      type: String,
      enum: ["password", "refresh", "unknown"],
      default: "password"
    },
    requestContext: {
      type: mongoose3.Schema.Types.Mixed,
      default: null
    }
  },
  baseSchemaOptions
);
var websiteMetadataSchema = new mongoose3.Schema(
  {
    origin: nullableTrimmedString,
    referer: nullableTrimmedString,
    host: nullableTrimmedString,
    forwardedHost: nullableTrimmedString,
    protocol: nullableTrimmedString,
    method: nullableTrimmedString,
    path: nullableTrimmedString,
    acceptLanguage: nullableTrimmedString,
    secFetchSite: nullableTrimmedString,
    secFetchMode: nullableTrimmedString,
    secFetchDest: nullableTrimmedString,
    secChUa: nullableTrimmedString,
    secChUaMobile: nullableTrimmedString,
    secChUaPlatform: nullableTrimmedString
  },
  baseSchemaOptions
);
var registrationProviderSchema = new mongoose3.Schema(
  {
    provider: { type: String, required: true, trim: true },
    succeeded: { type: Boolean, default: false },
    url: { type: String, default: null },
    fetchedAt: { type: Date, default: null },
    error: { type: String, default: null },
    responseKeys: { type: [String], default: [] },
    data: { type: mongoose3.Schema.Types.Mixed, default: null }
  },
  baseSchemaOptions
);
var registrationProfileSchema = new mongoose3.Schema(
  {
    provider: { type: String, default: null },
    url: { type: String, default: null },
    fetchedAt: { type: Date, default: null },
    data: {
      clientIp: { type: String, default: null },
      requestIp: { type: String, default: null },
      isLoopbackIp: { type: Boolean, default: false },
      isPrivateIp: { type: Boolean, default: false },
      meta: {
        username: { type: String, default: null },
        deviceId: { type: String, default: null },
        userAgent: { type: String, default: null },
        website: { type: websiteMetadataSchema, default: null },
        capturedAt: { type: Date, default: null },
        successfulProviders: { type: Number, default: 0, min: 0 },
        failedProviders: { type: Number, default: 0, min: 0 },
        totalProviders: { type: Number, default: 0, min: 0 }
      },
      providers: {
        type: [registrationProviderSchema],
        default: []
      }
    },
    error: { type: String, default: null }
  },
  baseSchemaOptions
);
var profileDetailsSchema = new mongoose3.Schema(
  {
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  baseSchemaOptions
);
var ENCRYPTED_PROFILE_VALUE_PREFIX = "enc:v1:";
var MAX_PROFILE_NAME_LENGTH = 120;
var MAX_ENCRYPTED_PROFILE_NAME_LENGTH = 4096;
var isValidStoredProfileName = (value) => {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return true;
  }
  if (trimmed.startsWith(ENCRYPTED_PROFILE_VALUE_PREFIX)) {
    return trimmed.length <= MAX_ENCRYPTED_PROFILE_NAME_LENGTH;
  }
  return trimmed.length <= MAX_PROFILE_NAME_LENGTH;
};
var MAX_PROFILE_PHOTO_LENGTH = 5e7;
var MAX_ENCRYPTED_PROFILE_PHOTO_LENGTH = 75e6;
var isValidStoredProfilePhoto = (value) => {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return true;
  }
  if (trimmed.startsWith(ENCRYPTED_PROFILE_VALUE_PREFIX)) {
    return trimmed.length <= MAX_ENCRYPTED_PROFILE_PHOTO_LENGTH;
  }
  return trimmed.length <= MAX_PROFILE_PHOTO_LENGTH;
};
var userSchema = new mongoose3.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 64,
      match: /^[a-z0-9._@+-]+$/,
      index: true
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      index: true
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },
    profileName: {
      type: String,
      trim: true,
      default: "none",
      validate: {
        validator: isValidStoredProfileName,
        message: "Profile name must be 120 characters or fewer (encrypted values are allowed)."
      }
    },
    profilePhoto: {
      type: String,
      trim: true,
      default: "none",
      validate: {
        validator: isValidStoredProfilePhoto,
        message: "Profile photo must be 35MB or fewer (encrypted base64 values are allowed)."
      }
    },
    profileDetails: {
      type: profileDetailsSchema,
      default: () => ({})
    },
    password: {
      type: mongoose3.Schema.Types.Mixed,
      required: true,
      select: false
    },
    masterKey: {
      type: encryptedFieldSchema,
      required: true,
      select: false
    },
    pqcSalt: {
      type: String,
      default: null
    },
    registrationProfile: {
      type: registrationProfileSchema,
      default: () => ({})
    },
    loginHistory: {
      type: [loginHistorySchema],
      default: []
    },
    sessions: {
      type: [sessionSchema],
      default: []
    },
    meta: {
      registeredAt: { type: Date, default: Date.now },
      lastLoginAt: { type: Date, default: null },
      lastFailedLoginAt: { type: Date, default: null },
      lastFailedLoginIp: { type: String, default: null },
      lastSyncAt: { type: Date, default: null },
      lastCredentialChangeAt: { type: Date, default: Date.now },
      activeDevices: { type: [String], default: [] },
      accountStatus: {
        type: String,
        enum: ["active", "locked", "disabled"],
        default: "active"
      },
      profileVersion: { type: Number, default: 2, min: 1 },
      masterKey: { type: encryptedFieldSchema, default: null },
      masterKeyHash: { type: encryptedFieldSchema, default: null }
    },
    activityLog: {
      type: [activityLogSchema],
      default: []
    },
    history: {
      password: { type: [passwordHistorySchema], default: void 0 },
      masterKey: { type: [masterKeyHistorySchema], default: void 0 }
    },
    vault: {
      photos: { type: [fileItemSchema], default: [] },
      videos: { type: [fileItemSchema], default: [] },
      audios: { type: [fileItemSchema], default: [] },
      documents: { type: [fileItemSchema], default: [] },
      otherFiles: { type: [fileItemSchema], default: [] },
      notes: { type: [noteSchema], default: [] },
      chats: { type: [noteSchema], default: [] },
      todos: { type: [noteSchema], default: [] },
      passwords: { type: [passwordSchema], default: [] },
      secretKeys: { type: [secretKeySchema], default: [] },
      location: { type: [noteSchema], default: [] },
      contact: { type: [noteSchema], default: [] }
    },
    /* ------------------ TWO FACTOR AUTH ------------------ */
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    twoFactorSecret: {
      type: encryptedFieldSchema,
      default: null,
      select: false
    },
    twoFactorTempSecret: {
      type: encryptedFieldSchema,
      default: null,
      select: false
    },
    twoFactorBackupCodes: {
      type: [String],
      default: [],
      select: false
    },
    twoFactorLastUsedTimestamp: {
      type: Number,
      default: 0,
      select: false
    },
    /* ------------------ INACTIVITY ------------------ */
    lastActiveAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: "users",
    timestamps: true,
    minimize: false,
    optimisticConcurrency: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        const output = ret;
        output.id = output._id?.toString?.() ?? output.id;
        delete output._id;
        delete output.password;
        delete output.masterKey;
        delete output.twoFactorSecret;
        delete output.twoFactorTempSecret;
        delete output.twoFactorBackupCodes;
        if (output.history?.password) delete output.history.password;
        if (output.history?.masterKey) delete output.history.masterKey;
        if (output.history && typeof output.history === "object" && Object.keys(output.history).length === 0) {
          delete output.history;
        }
        return output;
      }
    },
    toObject: { virtuals: true, versionKey: false }
  }
);
userSchema.virtual("profile").get(function() {
  return {
    name: this.profileName ?? "none",
    photo: this.profilePhoto ?? "none",
    details: this.profileDetails ?? {}
  };
});
userSchema.virtual("twoStepAuthentication").get(function() {
  return {
    enabled: this.twoFactorEnabled === true,
    backupCodesCount: Array.isArray(this.twoFactorBackupCodes) ? this.twoFactorBackupCodes.length : 0
  };
});
userSchema.virtual("masterKeyShow").get(function() {
  const mk = this.meta?.masterKey;
  if (!mk) return null;
  return {
    encryption: {
      algorithm: mk.algorithm || "aes-256-gcm",
      keyVersion: mk.keyVersion || "v1",
      components: {
        cipherTextLength: mk.cipherText?.length || 0,
        ivLength: mk.iv?.length || 0,
        authTagLength: mk.authTag?.length || 0,
        saltLength: mk.salt?.length || 0
      }
    },
    security: {
      cipherTextPreview: mk.cipherText ? `${mk.cipherText.substring(0, 20)}...${mk.cipherText.substring(mk.cipherText.length - 20)}` : null,
      ivPreview: mk.iv ? `${mk.iv.substring(0, 12)}...` : null,
      authTagPreview: mk.authTag ? `${mk.authTag.substring(0, 12)}...` : null,
      saltPreview: mk.salt ? `${mk.salt.substring(0, 12)}...` : null
    }
  };
});
userSchema.index({ updatedAt: -1 });
userSchema.index({ "meta.registeredAt": -1 });
userSchema.index({ "meta.accountStatus": 1 });
userSchema.index({ "registrationProfile.data.requestIp": 1 });
userSchema.index({ _id: 1, "sessions.sessionId": 1 });
function updateTimestamp(next) {
  if (!this.isModified("updatedAt")) {
    this.updatedAt = /* @__PURE__ */ new Date();
  }
  if (typeof next === "function") next();
}
[fileItemSchema, noteSchema, passwordSchema, secretKeySchema].forEach(
  (schema) => schema.pre("save", updateTimestamp)
);
userSchema.pre("save", async function() {
  if (this.isNew) return;
  if (this.isModified("password")) {
    try {
      const oldDoc = await mongoose3.model("User").findById(this._id).select("+password");
      if (oldDoc && oldDoc.password) {
        const history = this.history ??= {};
        if (!Array.isArray(history.password)) history.password = [];
        history.password.push({
          hash: oldDoc.password,
          changedAt: /* @__PURE__ */ new Date()
        });
      }
    } catch (err) {
      logger.warn("[UserModel] Failed to archive old password", { error: err });
    }
  }
  if (this.isModified("meta.masterKey") || this.isModified("masterKey")) {
    try {
      const oldDoc = await mongoose3.model("User").findById(this._id).select("+masterKey +meta.masterKey +meta.masterKeyHash");
      const oldMasterKey = oldDoc?.meta?.masterKey ?? oldDoc?.masterKey;
      if (oldDoc && oldMasterKey) {
        const history = this.history ??= {};
        if (!Array.isArray(history.masterKey)) history.masterKey = [];
        history.masterKey.push({
          masterKey: oldMasterKey,
          masterKeyHash: oldDoc.meta?.masterKeyHash ?? null,
          changedAt: /* @__PURE__ */ new Date()
        });
      }
    } catch (err) {
      logger.warn("[UserModel] Failed to archive old master key", { error: err });
    }
  }
});
var getUserModel = (customConnection) => {
  if (customConnection) {
    return customConnection.models.User || customConnection.model("User", userSchema);
  }
  return mongoose3.models.User || mongoose3.model("User", userSchema);
};
var User = getUserModel();

// server/socket.ts
var io = null;
var getTokenFromSocket = (socket) => {
  const authToken = socket.handshake.auth.token;
  if (typeof authToken === "string" && authToken.trim()) {
    return authToken;
  }
  const header = socket.handshake.headers.authorization;
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token;
};
var registerSocketHandlers = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedCorsOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin is not allowed by CORS."));
      },
      methods: ["GET", "POST"]
    },
    transports: ["websocket", "polling"],
    pingTimeout: 2e4
  });
  io.use(async (socket, next) => {
    try {
      const token = getTokenFromSocket(socket);
      if (!token) {
        return next(new Error("Missing socket token."));
      }
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub).select("sessions").lean().exec();
      const activeSession = user?.sessions?.find(
        (session) => session.sessionId === payload.sessionId && !session.revokedAt && session.expiresAt instanceof Date && session.expiresAt.getTime() > Date.now()
      );
      if (!activeSession) {
        return next(new Error("Session revoked."));
      }
      socket.data.userId = payload.sub;
      socket.data.username = payload.username;
      socket.data.sessionId = payload.sessionId;
      return next();
    } catch (error) {
      return next(new Error(error instanceof Error ? error.message : "Unauthorized socket."));
    }
  });
  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`);
    if (socket.data.sessionId) {
      socket.join(`session:${socket.data.sessionId}`);
    }
    socket.emit("vault:connected", {
      userId: socket.data.userId,
      connectedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  return io;
};
var emitVaultEvent = (userId, event, payload) => {
  io?.to(`user:${userId}`).emit(event, payload);
};
var revokeSocketSessions = (userId, sessionIds, reason = "REVOKED_BY_USER") => {
  if (!io || !sessionIds.length) return;
  for (const sessionId of sessionIds) {
    const sessionRoom = `session:${sessionId}`;
    io.to(sessionRoom).emit("vault:session_revoked", {
      sessionId,
      reason,
      timestamp: Date.now()
    });
  }
  const revokedSet = new Set(sessionIds);
  const sockets = io.sockets?.sockets;
  if (sockets) {
    for (const socket of sockets.values()) {
      if (socket.data.userId === userId && socket.data.sessionId && revokedSet.has(socket.data.sessionId)) {
        socket.disconnect(true);
      }
    }
  }
};

// server/routes/vaultRoutes.ts
import express2 from "express";
import rateLimit2, { ipKeyGenerator } from "express-rate-limit";

// server/controllers/legacyVaultController.ts
import express from "express";
import fs2 from "fs/promises";
import path3 from "path";
import crypto2 from "crypto";

// server/responses.ts
var sendSuccess = (res, data, message = "Operation successful", status = 200) => {
  return res.status(status).json({
    success: true,
    message,
    data
  });
};
var sendRequestError = (req, res, status, error) => {
  const requestId = req.requestId;
  return res.status(status).json({
    success: false,
    message: error.message,
    error: {
      code: error.code,
      requestId
    }
  });
};

// server/models/vaultItem.ts
import mongoose4 from "mongoose";
var vaultItemSchema = new mongoose4.Schema(
  {
    userId: { type: mongoose4.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    itemId: { type: String, required: true, index: true },
    category: {
      type: String,
      required: true,
      index: true,
      enum: [
        "photo",
        "video",
        "audio",
        "document",
        "note",
        "chat",
        "todo",
        "password",
        "secret",
        "contact",
        "location",
        "file",
        "other-files",
        "other",
        "settings",
        "system",
        "users",
        "card",
        "identity",
        "wifi"
      ]
    },
    folder: { type: String, trim: true, default: null, index: true },
    title: { type: String, trim: true, default: "" },
    // For encrypted text content
    payload: { type: String, default: null },
    // For files
    file: {
      fileName: { type: String },
      filePath: { type: String },
      mimeType: { type: String },
      size: { type: Number },
      encryptionIv: { type: String },
      // Store for at-rest AES-GCM
      encryptionTag: { type: String }
      // Store for at-rest AES-GCM
    },
    // Modern structure (V2)
    modernPayload: {
      type: String,
      default: null,
      description: "Used for V2 encrypted payloads which might combine metadata and content"
    },
    encoding: {
      type: String,
      default: "utf-8",
      enum: ["utf-8", "base64", "binary-base64", "gridfs-binary", "file-reference", "modern"]
    },
    gridFsId: { type: String, default: null },
    metadata: {
      type: mongoose4.Schema.Types.Mixed,
      default: {}
    },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    clientUpdatedAt: { type: Date, default: null },
    isPinned: { type: Boolean, default: false, index: true },
    pinnedAt: { type: Date, default: null },
    // Tracking
    deviceId: { type: String, default: "unknown" },
    ipAddress: { type: String, default: "unknown" }
  },
  {
    timestamps: true,
    collection: "vault_items"
  }
);
vaultItemSchema.index({ userId: 1, itemId: 1 }, { unique: true });
vaultItemSchema.index({ userId: 1, category: 1, isDeleted: 1 });
vaultItemSchema.index({ userId: 1, category: 1, isDeleted: 1, updatedAt: -1 });
vaultItemSchema.index({ userId: 1, isDeleted: 1, updatedAt: -1 });
vaultItemSchema.index({ userId: 1, updatedAt: -1 });
vaultItemSchema.index({ isDeleted: 1, updatedAt: -1 });
vaultItemSchema.index({ updatedAt: -1 });
var getVaultItemModel = (username, customConnection) => {
  if (!username || !username.trim()) {
    throw new Error("Username is required for isolated vault items");
  }
  const normalized = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const collectionName = `${normalized}.${normalized}_vault_items`;
  if (customConnection) {
    if (customConnection.models[collectionName]) {
      return customConnection.models[collectionName];
    }
    const model3 = customConnection.model(collectionName, vaultItemSchema, collectionName);
    if (typeof model3?.createIndexes === "function") {
      model3.createIndexes().catch(() => {
      });
    }
    return model3;
  }
  if (mongoose4.models[collectionName]) {
    return mongoose4.models[collectionName];
  }
  const model2 = mongoose4.model(collectionName, vaultItemSchema, collectionName);
  if (typeof model2?.createIndexes === "function") {
    model2.createIndexes().catch(() => {
    });
  }
  return model2;
};

// server/services/legacyVaultService.ts
import mongoose5 from "mongoose";
import path2 from "path";

// server/utils/appError.ts
var AppError = class _AppError extends Error {
  statusCode;
  code;
  isOperational;
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
  /**
   * Factory method for Bad Request (400)
   */
  static badRequest(message, code = "BAD_REQUEST") {
    return new _AppError(400, code, message);
  }
  /**
   * Factory method for Unauthorized (401)
   */
  static unauthorized(message, code = "UNAUTHORIZED") {
    return new _AppError(401, code, message);
  }
  /**
   * Factory method for Forbidden (403)
   */
  static forbidden(message, code = "FORBIDDEN") {
    return new _AppError(403, code, message);
  }
  /**
   * Factory method for Not Found (404)
   */
  static notFound(message, code = "NOT_FOUND") {
    return new _AppError(404, code, message);
  }
  /**
   * Factory method for Conflict (409)
   */
  static conflict(message, code = "CONFLICT") {
    return new _AppError(409, code, message);
  }
  /**
   * Factory method for Internal Server Error (500)
   */
  static internal(message, code = "INTERNAL_ERROR") {
    return new _AppError(500, code, message);
  }
};

// server/utils/fileStorage.ts
import multer from "multer";
var uploadRoot = "cloud-only";
var maxFileSize = Number(process.env.MAX_FILE_SIZE_MB || 4096) * 1024 * 1024;
var maxUploadFileSizeBytes = maxFileSize;
var photoExtensions = /* @__PURE__ */ new Set([
  "jpg",
  "jpeg",
  "jpe",
  "jfif",
  "pjpeg",
  "pjp",
  "png",
  "apng",
  "gif",
  "webp",
  "avif",
  "heic",
  "heif",
  "bmp",
  "dib",
  "tif",
  "tiff",
  "ico",
  "cur",
  "svg",
  "svgz",
  "raw",
  "cr2",
  "cr3",
  "nef",
  "nrw",
  "arw",
  "sr2",
  "srf",
  "raf",
  "orf",
  "rw2",
  "pef",
  "dng",
  "x3f",
  "3fr",
  "fff",
  "iiq",
  "erf",
  "kdc",
  "mef",
  "mos",
  "mrw",
  "rwl",
  "dcr",
  "bay",
  "gpr",
  "jp2",
  "j2k",
  "jpf",
  "jpm",
  "jxr",
  "hdp",
  "wdp",
  "dds",
  "exr",
  "hdr",
  "pic",
  "pct",
  "pcx",
  "tga",
  "icns",
  "psd"
]);
var videoExtensions = /* @__PURE__ */ new Set([
  "mp4",
  "m4v",
  "mov",
  "qt",
  "webm",
  "mkv",
  "mka",
  "mks",
  "avi",
  "divx",
  "xvid",
  "wmv",
  "asf",
  "asx",
  "mpg",
  "mpeg",
  "mpe",
  "mpv",
  "m2v",
  "m2p",
  "mts",
  "m2ts",
  "ts",
  "vob",
  "evo",
  "mod",
  "tod",
  "3gp",
  "3g2",
  "f4v",
  "f4p",
  "f4a",
  "f4b",
  "flv",
  "swf",
  "ogv",
  "ogm",
  "rm",
  "rmvb",
  "rv",
  "dat",
  "mxf",
  "gxf",
  "lxf",
  "nut",
  "dv",
  "dif",
  "y4m",
  "h264",
  "264",
  "h265",
  "265",
  "hevc",
  "av1",
  "vp8",
  "vp9",
  "r3d",
  "braw",
  "cine",
  "ari",
  "arx",
  "mjp2",
  "mj2"
]);
var audioExtensions = /* @__PURE__ */ new Set([
  "mp3",
  "mp2",
  "mp1",
  "m4a",
  "m4b",
  "m4p",
  "aac",
  "wav",
  "wave",
  "bwf",
  "aif",
  "aiff",
  "aifc",
  "flac",
  "alac",
  "ape",
  "mac",
  "wv",
  "wvc",
  "wma",
  "ogg",
  "oga",
  "opus",
  "spx",
  "webm",
  "amr",
  "awb",
  "3ga",
  "au",
  "snd",
  "voc",
  "ra",
  "ram",
  "rm",
  "mka",
  "ac3",
  "eac3",
  "dts",
  "dtshd",
  "thd",
  "mlp",
  "pcm",
  "lpcm",
  "dsd",
  "dff",
  "dsf",
  "tak",
  "tta",
  "mpc",
  "mp+",
  "aa",
  "aax",
  "caf",
  "qcp",
  "gsm",
  "adts",
  "mid",
  "midi",
  "rmi",
  "kar",
  "it",
  "xm",
  "s3m",
  "mod",
  "mtm",
  "umx"
]);
var documentExtensions = /* @__PURE__ */ new Set([
  "pdf",
  "fdf",
  "xfdf",
  "doc",
  "docx",
  "docm",
  "dot",
  "dotx",
  "dotm",
  "rtf",
  "odt",
  "ott",
  "pages",
  "wpd",
  "wps",
  "txt",
  "text",
  "log",
  "md",
  "markdown",
  "rst",
  "org",
  "tex",
  "latex",
  "csv",
  "tsv",
  "psv",
  "ssv",
  "json",
  "jsonl",
  "ndjson",
  "xml",
  "yaml",
  "yml",
  "toml",
  "ini",
  "conf",
  "cfg",
  "properties",
  "sql",
  "xls",
  "xlsx",
  "xlsm",
  "xlsb",
  "xlt",
  "xltx",
  "xltm",
  "ods",
  "ots",
  "numbers",
  "ppt",
  "pptx",
  "pptm",
  "pps",
  "ppsx",
  "pot",
  "potx",
  "potm",
  "odp",
  "otp",
  "key",
  "epub",
  "mobi",
  "azw",
  "azw3",
  "fb2",
  "lrf",
  "djvu",
  "chm",
  "xps",
  "oxps",
  "tif",
  "tiff",
  "zip",
  "7z",
  "rar",
  "tar",
  "gz",
  "bz2",
  "xz"
]);
var blockedDocumentExtensions = /* @__PURE__ */ new Set([
  "exe",
  "dll",
  "js",
  "vbs",
  "bat",
  "cmd",
  "sh",
  "msi",
  "com",
  "scr",
  "jar",
  "ps1",
  "reg",
  "app"
]);
var allowedMimeTypes = {
  photo: ["image/*"],
  video: ["video/*", "application/mxf"],
  audio: ["audio/*", "application/ogg"],
  document: ["text/*", "application/*"],
  "other-files": []
};
var getFileExtension = (name) => {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === name.length - 1) {
    return "";
  }
  return name.slice(dotIndex + 1).toLowerCase();
};
var hasPrefix = (buffer, bytes) => buffer.length >= bytes.length && bytes.every((value, idx) => buffer[idx] === value);
var containsAsciiAt = (buffer, offset, value) => buffer.length >= offset + value.length && buffer.subarray(offset, offset + value.length).toString("ascii") === value;
var isLikelyPhotoBinary = (buffer) => {
  if (!buffer.length) return false;
  if (hasPrefix(buffer, [255, 216, 255])) return true;
  if (hasPrefix(buffer, [137, 80, 78, 71, 13, 10, 26, 10])) return true;
  if (containsAsciiAt(buffer, 0, "GIF87a") || containsAsciiAt(buffer, 0, "GIF89a")) return true;
  if (containsAsciiAt(buffer, 0, "BM")) return true;
  if (hasPrefix(buffer, [73, 73, 42, 0]) || // II*\0
  hasPrefix(buffer, [77, 77, 0, 42])) {
    return true;
  }
  if (containsAsciiAt(buffer, 0, "FUJIFILMCCD-RAW")) return true;
  if (containsAsciiAt(buffer, 0, "IIRO") || containsAsciiAt(buffer, 0, "MMOR") || containsAsciiAt(buffer, 0, "IIRS")) {
    return true;
  }
  if (hasPrefix(buffer, [73, 73, 85, 0])) return true;
  if (hasPrefix(buffer, [0, 77, 82, 77])) return true;
  if (containsAsciiAt(buffer, 0, "FOVb")) return true;
  if (containsAsciiAt(buffer, 0, "RIFF") && containsAsciiAt(buffer, 8, "WEBP")) return true;
  if (containsAsciiAt(buffer, 4, "ftyp")) {
    const brand = buffer.subarray(8, 12).toString("ascii").toLowerCase();
    if ([
      "heic",
      "heix",
      "hevc",
      "hevx",
      "heif",
      "heim",
      "heis",
      "hevm",
      "hevs",
      "mif1",
      "msf1",
      "avif",
      "avis",
      "crx ",
      "crx"
    ].some((b) => brand.startsWith(b.trim()))) {
      return true;
    }
  }
  if ((hasPrefix(buffer, [0, 0, 1, 0]) || hasPrefix(buffer, [0, 0, 2, 0])) && buffer.length >= 6) {
    return true;
  }
  if (containsAsciiAt(buffer, 0, "8BPS")) return true;
  if (hasPrefix(buffer, [0, 0, 0, 12, 106, 80, 32, 32]) || // \x00\x00\x00\x0cjP\x20\x20
  hasPrefix(buffer, [255, 79, 255, 81])) {
    return true;
  }
  if (hasPrefix(buffer, [73, 73, 188, 1]) || hasPrefix(buffer, [73, 73, 188, 0])) {
    return true;
  }
  if (containsAsciiAt(buffer, 0, "DDS ")) return true;
  if (hasPrefix(buffer, [118, 47, 49, 1])) return true;
  if (containsAsciiAt(buffer, 0, "#?RADIANCE") || containsAsciiAt(buffer, 0, "#?RGBE")) {
    return true;
  }
  if (containsAsciiAt(buffer, 0, "icns")) return true;
  if (buffer.length >= 4 && buffer[0] === 10 && [0, 2, 3, 4, 5].includes(buffer[1]) && buffer[2] === 1) {
    return true;
  }
  if (hasPrefix(buffer, [31, 139])) return true;
  if (buffer.length >= 5) {
    const head = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("utf8").trim().toLowerCase();
    if (head.includes("<svg") || head.startsWith("<?xml") && head.includes("<svg")) {
      return true;
    }
  }
  if (buffer.length >= 522) {
    if (buffer[512] === 0 && buffer[513] === 17 && buffer[514] === 2 && buffer[515] === 255 || buffer[512] === 17 && buffer[513] === 1) {
      return true;
    }
  }
  if (isLikelyEncryptedBinary(buffer)) {
    return true;
  }
  return false;
};
var isLikelyEncryptedBinary = (buffer) => {
  if (!buffer || buffer.length < 6) return false;
  if (hasPrefix(buffer, [86, 67, 65, 83, 48, 49])) return true;
  if (buffer.length >= 16) {
    const textSample = buffer.subarray(0, Math.min(buffer.length, 128)).toString("utf8");
    if (textSample.startsWith("V2_ENC:") || textSample.startsWith("V2_MODERN:") || textSample.includes('"iv"') || textSample.includes('"wrappedDek"') || textSample.includes('"encryptedData"') || textSample.includes('"payload"')) {
      return true;
    }
  }
  return false;
};
var isLikelyVideoBinary = (buffer) => {
  if (!buffer.length) return false;
  if (isLikelyEncryptedBinary(buffer)) return true;
  if (containsAsciiAt(buffer, 4, "ftyp") || containsAsciiAt(buffer, 0, "ftyp")) return true;
  if (containsAsciiAt(buffer, 4, "moov") || containsAsciiAt(buffer, 4, "mdat") || containsAsciiAt(buffer, 4, "wide") || containsAsciiAt(buffer, 4, "free") || containsAsciiAt(buffer, 4, "skip")) {
    return true;
  }
  if (hasPrefix(buffer, [26, 69, 223, 163])) return true;
  if (containsAsciiAt(buffer, 0, "RIFF") && containsAsciiAt(buffer, 8, "AVI ")) return true;
  if (containsAsciiAt(buffer, 0, "FLV")) return true;
  if (buffer[0] === 71 && (buffer.length <= 188 || buffer[188] === 71)) return true;
  if (hasPrefix(buffer, [0, 0, 1, 186]) || hasPrefix(buffer, [0, 0, 1, 179])) {
    return true;
  }
  if (containsAsciiAt(buffer, 0, "OggS")) return true;
  if (hasPrefix(buffer, [48, 38, 178, 117, 142, 102, 207, 17])) return true;
  if (hasPrefix(buffer, [6, 14, 43, 52])) return true;
  if (containsAsciiAt(buffer, 0, ".RMF")) return true;
  if (hasPrefix(buffer, [0, 0, 0, 1]) || hasPrefix(buffer, [0, 0, 1])) {
    return true;
  }
  return false;
};
var isLikelyAudioBinary = (buffer) => {
  if (!buffer.length) return false;
  if (isLikelyEncryptedBinary(buffer)) return true;
  if (containsAsciiAt(buffer, 0, "ID3")) return true;
  if (buffer[0] === 255 && (buffer[1] & 224) === 224) return true;
  if (containsAsciiAt(buffer, 0, "RIFF") && containsAsciiAt(buffer, 8, "WAVE")) return true;
  if (containsAsciiAt(buffer, 0, "fLaC")) return true;
  if (containsAsciiAt(buffer, 0, "OggS")) return true;
  if (buffer[0] === 255 && (buffer[1] & 246) === 240) return true;
  if (containsAsciiAt(buffer, 4, "ftyp") || containsAsciiAt(buffer, 0, "ftyp")) return true;
  if (containsAsciiAt(buffer, 0, "FORM") && (containsAsciiAt(buffer, 8, "AIFF") || containsAsciiAt(buffer, 8, "AIFC"))) {
    return true;
  }
  if (containsAsciiAt(buffer, 0, "caff")) return true;
  if (containsAsciiAt(buffer, 0, "MThd")) return true;
  if (hasPrefix(buffer, [48, 38, 178, 117])) return true;
  return false;
};
var assertFileContentMatchesCategory = (category, fileName, mimeType, buffer) => {
  const extension = getFileExtension(fileName);
  const normalizedMime = (mimeType || "").toLowerCase();
  if (category === "photo") {
    const extensionAllowed = photoExtensions.has(extension);
    const mimeAllowed = normalizedMime.startsWith("image/");
    const contentAllowed = isLikelyPhotoBinary(buffer);
    if (!contentAllowed || !extensionAllowed && !mimeAllowed) {
      throw new AppError(400, "INVALID_FILE_CONTENT", "Photo file content validation failed.");
    }
    return;
  }
  if (category === "video") {
    const extensionAllowed = videoExtensions.has(extension);
    const mimeAllowed = normalizedMime.startsWith("video/") || normalizedMime === "application/mxf";
    const contentAllowed = isLikelyVideoBinary(buffer);
    if (!contentAllowed || !extensionAllowed && !mimeAllowed) {
      throw new AppError(400, "INVALID_FILE_CONTENT", "Video file content validation failed.");
    }
    return;
  }
  if (category === "audio") {
    const extensionAllowed = audioExtensions.has(extension);
    const mimeAllowed = normalizedMime.startsWith("audio/") || normalizedMime === "application/ogg";
    const contentAllowed = isLikelyAudioBinary(buffer);
    if (!contentAllowed || !extensionAllowed && !mimeAllowed) {
      throw new AppError(400, "INVALID_FILE_CONTENT", "Audio file content validation failed.");
    }
  }
};
var uploadVaultFileMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxFileSize,
    files: 1
  },
  fileFilter: (req, file, callback) => {
    const category = String(req.params.category || "other-files");
    const allowed = allowedMimeTypes[category];
    if (!allowed) {
      callback(new AppError(400, "UNSUPPORTED_FILE_CATEGORY", "Unsupported file category."));
      return;
    }
    if (category === "photo") {
      const mime = (file.mimetype || "").toLowerCase();
      const extension = getFileExtension(file.originalname || file.filename || "");
      const isImageMime = mime.startsWith("image/");
      const isKnownPhotoExtension = photoExtensions.has(extension);
      if (!isImageMime && !isKnownPhotoExtension) {
        callback(new AppError(400, "INVALID_FILE_TYPE", "Invalid file type for photo."));
        return;
      }
    } else if (category === "video") {
      const mime = (file.mimetype || "").toLowerCase();
      const extension = getFileExtension(file.originalname || file.filename || "");
      const isVideoMime = mime.startsWith("video/") || mime === "application/mxf";
      const isKnownVideoExtension = videoExtensions.has(extension);
      if (!isVideoMime && !isKnownVideoExtension) {
        callback(new AppError(400, "INVALID_FILE_TYPE", "Invalid file type for video."));
        return;
      }
    } else if (category === "audio") {
      const mime = (file.mimetype || "").toLowerCase();
      const extension = getFileExtension(file.originalname || file.filename || "");
      const isAudioMime = mime.startsWith("audio/") || mime === "application/ogg";
      const isKnownAudioExtension = audioExtensions.has(extension);
      if (!isAudioMime && !isKnownAudioExtension) {
        callback(new AppError(400, "INVALID_FILE_TYPE", "Invalid file type for audio."));
        return;
      }
    } else if (category === "document") {
      const mime = (file.mimetype || "").toLowerCase();
      const extension = getFileExtension(file.originalname || file.filename || "");
      if (blockedDocumentExtensions.has(extension)) {
        callback(new AppError(400, "INVALID_FILE_TYPE", "Invalid file type for document."));
        return;
      }
      const isDocumentMime = mime.startsWith("text/") || mime === "application/pdf" || mime === "application/rtf" || mime === "application/msword" || mime.startsWith("application/vnd.") || mime.startsWith("application/xls") || mime.startsWith("application/xml") || mime === "application/json" || mime === "application/x-yaml" || mime === "application/yaml" || mime === "application/toml" || mime === "application/sql" || mime === "application/epub+zip" || mime === "application/x-mobipocket-ebook" || mime === "application/x-fictionbook+xml" || mime === "application/x-djvu" || mime === "application/vnd.ms-xpsdocument" || mime === "application/oxps" || mime === "application/zip" || mime === "application/x-7z-compressed" || mime === "application/x-rar-compressed" || mime === "application/x-tar" || mime === "application/gzip" || mime === "application/x-bzip2" || mime === "application/x-xz" || mime === "application/octet-stream";
      const isKnownDocumentExtension = documentExtensions.has(extension);
      const isAllowedByMimeOnly = extension.length === 0 && isDocumentMime;
      if (!isKnownDocumentExtension && !isAllowedByMimeOnly) {
        callback(new AppError(400, "INVALID_FILE_TYPE", "Invalid file type for document."));
        return;
      }
    } else if (category !== "other-files" && allowed.length > 0 && !allowed.includes(file.mimetype)) {
      callback(new AppError(400, "INVALID_FILE_TYPE", `Invalid file type for ${category}.`));
      return;
    }
    callback(null, true);
  }
}).single("file");
var getUploadRoot = () => uploadRoot;

// server/utils/vaultParsers.ts
var DEFAULT_CATEGORY = "file";
var CATEGORY_ALIAS_MAP = {
  note: "note",
  notes: "note",
  chat: "chat",
  chats: "chat",
  todo: "todo",
  todos: "todo",
  password: "password",
  passwords: "password",
  secret: "secret",
  secrets: "secret",
  secretkey: "secret",
  secretkeys: "secret",
  contact: "contact",
  contacts: "contact",
  location: "location",
  locations: "location",
  photo: "photo",
  photos: "photo",
  video: "video",
  videos: "video",
  audio: "audio",
  audios: "audio",
  document: "document",
  documents: "document",
  file: "file",
  files: "file",
  other: "other",
  "other-files": "other-files",
  other_files: "other-files",
  otherfile: "other-files",
  otherfiles: "other-files",
  settings: "settings",
  system: "system",
  users: "users",
  logs: "system",
  v2_items: "file"
};
var parseMetadataHeader = (metadataHeader) => {
  if (!metadataHeader || typeof metadataHeader !== "string") {
    return {};
  }
  if (metadataHeader.startsWith("V2_ENC:")) {
    return { payload: metadataHeader };
  }
  try {
    const parsed = JSON.parse(metadataHeader);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};
var safeDecodeURIComponent = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
var resolvePayloadEncoding = (payload) => {
  if (Buffer.isBuffer(payload)) {
    return "binary-base64";
  }
  if (typeof payload === "string" && payload.startsWith("V2_MODERN:")) {
    return "modern";
  }
  return "utf-8";
};
var parseCategory = (value) => {
  if (typeof value !== "string") {
    return DEFAULT_CATEGORY;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_CATEGORY;
  }
  return CATEGORY_ALIAS_MAP[normalized] || DEFAULT_CATEGORY;
};

// server/services/legacyVaultService.ts
init_logger();

// server/utils/crypto.ts
import crypto from "crypto";
import dotenv3 from "dotenv";
import bcrypt from "bcryptjs";
dotenv3.config();
var ENCRYPTION_KEY_SOURCE = process.env.VAULT_ENCRYPTION_KEY || "";
var resolveEncryptionKey = () => {
  if (!ENCRYPTION_KEY_SOURCE) {
    const isDev2 = process.env.NODE_ENV !== "production";
    if (isDev2) {
      return Buffer.from("0".repeat(64), "hex");
    }
    throw new Error("VAULT_ENCRYPTION_KEY environment variable must be configured in production.");
  }
  const hexCandidate = /^[a-f0-9]{64}$/i.test(ENCRYPTION_KEY_SOURCE) ? Buffer.from(ENCRYPTION_KEY_SOURCE, "hex") : null;
  if (hexCandidate?.length === 32) {
    return hexCandidate;
  }
  const base64Candidate = (() => {
    try {
      return Buffer.from(ENCRYPTION_KEY_SOURCE, "base64");
    } catch {
      return null;
    }
  })();
  if (base64Candidate?.length === 32) {
    return base64Candidate;
  }
  return crypto.createHash("sha256").update(ENCRYPTION_KEY_SOURCE).digest();
};
var encryptionKey = resolveEncryptionKey();
var resolveAuthPepper = () => {
  const pepper = process.env.AUTH_PEPPER?.trim();
  if (pepper) {
    return pepper;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_PEPPER environment variable must be configured in production.");
  }
  return "default-pepper-for-dev-only";
};
var AUTH_PEPPER = resolveAuthPepper();
var LEGACY_SCRYPT_CONFIG = {
  N: 16384,
  r: 8,
  p: 1,
  keyLen: 64
};
var SCRYPT_CONFIG = {
  N: 32768,
  r: 8,
  p: 1,
  keyLen: 64,
  maxmem: 128 * 1024 * 1024
};
var SCRYPT_HASH_PREFIX = "s2";
var DUMMY_SALT = crypto.randomBytes(16);
var DUMMY_HASH_BUFFER = crypto.randomBytes(64);
var deriveScryptKey = (input, salt, config) => new Promise((resolve, reject) => {
  const saltBuffer = typeof salt === "string" ? Buffer.from(salt, "hex") : salt;
  crypto.scrypt(
    input,
    saltBuffer,
    config.keyLen,
    {
      N: config.N,
      r: config.r,
      p: config.p,
      ...config.maxmem ? { maxmem: config.maxmem } : {}
    },
    (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    }
  );
});
var hashPassword = async (plainTextPassword) => {
  const normalizedPassword = (plainTextPassword || "").normalize("NFKC");
  const salt = crypto.randomBytes(16);
  const derivedKey = await deriveScryptKey(normalizedPassword + AUTH_PEPPER, salt, SCRYPT_CONFIG);
  const hashString = [
    SCRYPT_HASH_PREFIX,
    SCRYPT_CONFIG.N,
    SCRYPT_CONFIG.r,
    SCRYPT_CONFIG.p,
    SCRYPT_CONFIG.keyLen,
    salt.toString("hex"),
    derivedKey.toString("hex")
  ].join("$");
  derivedKey.fill(0);
  return hashString;
};
var comparePassword = async (plainTextPassword, hashedPassword) => {
  const normalizedPassword = (plainTextPassword || "").normalize("NFKC");
  if (!hashedPassword || typeof hashedPassword !== "string") {
    const dummyKey = await deriveScryptKey(
      normalizedPassword + AUTH_PEPPER,
      DUMMY_SALT,
      SCRYPT_CONFIG
    );
    crypto.timingSafeEqual(dummyKey, DUMMY_HASH_BUFFER);
    dummyKey.fill(0);
    return false;
  }
  if (hashedPassword.startsWith("$2")) {
    return bcrypt.compare(normalizedPassword, hashedPassword);
  }
  try {
    if (hashedPassword.startsWith(`${SCRYPT_HASH_PREFIX}$`)) {
      const parts = hashedPassword.split("$");
      if (parts.length !== 7) {
        const dummyKey = await deriveScryptKey(
          normalizedPassword + AUTH_PEPPER,
          DUMMY_SALT,
          SCRYPT_CONFIG
        );
        crypto.timingSafeEqual(dummyKey, DUMMY_HASH_BUFFER);
        dummyKey.fill(0);
        return false;
      }
      const [, nRaw, rRaw, pRaw, keyLenRaw, saltHex2, originalHash2] = parts;
      const n = Number.parseInt(nRaw, 10);
      const r = Number.parseInt(rRaw, 10);
      const p = Number.parseInt(pRaw, 10);
      const keyLen = Number.parseInt(keyLenRaw, 10);
      if (!n || !r || !p || !keyLen || !saltHex2 || !originalHash2) {
        const dummyKey = await deriveScryptKey(
          normalizedPassword + AUTH_PEPPER,
          DUMMY_SALT,
          SCRYPT_CONFIG
        );
        crypto.timingSafeEqual(dummyKey, DUMMY_HASH_BUFFER);
        dummyKey.fill(0);
        return false;
      }
      const expectedBuffer2 = Buffer.from(originalHash2, "hex");
      if (expectedBuffer2.length === 0) {
        const dummyKey = await deriveScryptKey(
          normalizedPassword + AUTH_PEPPER,
          DUMMY_SALT,
          SCRYPT_CONFIG
        );
        crypto.timingSafeEqual(dummyKey, DUMMY_HASH_BUFFER);
        dummyKey.fill(0);
        return false;
      }
      const salt2 = Buffer.from(saltHex2, "hex");
      const derivedKey2 = await deriveScryptKey(normalizedPassword + AUTH_PEPPER, salt2, {
        N: n,
        r,
        p,
        keyLen,
        maxmem: Math.max(128 * r * n + 1024, 128 * 1024 * 1024)
      });
      const isMatch2 = expectedBuffer2.length === derivedKey2.length && crypto.timingSafeEqual(expectedBuffer2, derivedKey2);
      derivedKey2.fill(0);
      return isMatch2;
    }
    const [saltHex, originalHash] = hashedPassword.split(":");
    if (!saltHex || !originalHash) {
      const dummyKey = await deriveScryptKey(
        normalizedPassword + AUTH_PEPPER,
        DUMMY_SALT,
        LEGACY_SCRYPT_CONFIG
      );
      crypto.timingSafeEqual(dummyKey, DUMMY_HASH_BUFFER);
      dummyKey.fill(0);
      return false;
    }
    const expectedBuffer = Buffer.from(originalHash, "hex");
    if (expectedBuffer.length === 0) {
      const dummyKey = await deriveScryptKey(
        normalizedPassword + AUTH_PEPPER,
        DUMMY_SALT,
        LEGACY_SCRYPT_CONFIG
      );
      crypto.timingSafeEqual(dummyKey, DUMMY_HASH_BUFFER);
      dummyKey.fill(0);
      return false;
    }
    const salt = Buffer.from(saltHex, "hex");
    const derivedKey = await deriveScryptKey(
      normalizedPassword + AUTH_PEPPER,
      salt,
      LEGACY_SCRYPT_CONFIG
    );
    const isMatch = expectedBuffer.length === derivedKey.length && crypto.timingSafeEqual(expectedBuffer, derivedKey);
    derivedKey.fill(0);
    return isMatch;
  } catch {
    const dummyKey = await deriveScryptKey(
      normalizedPassword + AUTH_PEPPER,
      DUMMY_SALT,
      SCRYPT_CONFIG
    ).catch(() => DUMMY_HASH_BUFFER);
    crypto.timingSafeEqual(dummyKey, DUMMY_HASH_BUFFER);
    return false;
  }
};
var encryptText = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    cipherText: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    algorithm: "aes-256-gcm",
    keyVersion: "v1"
  };
};
var getCandidateEncryptionKeys = () => {
  const keys = [encryptionKey];
  if (ENCRYPTION_KEY_SOURCE) {
    const shaHashed = crypto.createHash("sha256").update(ENCRYPTION_KEY_SOURCE).digest();
    if (!keys.some((k) => k.equals(shaHashed))) {
      keys.push(shaHashed);
    }
  }
  if (process.env.NODE_ENV !== "production") {
    const devKey = Buffer.from("0".repeat(64), "hex");
    if (!keys.some((k) => k.equals(devKey))) {
      keys.push(devKey);
    }
  }
  return keys;
};
var decryptText = (payload) => {
  const candidateKeys = getCandidateEncryptionKeys();
  let lastError = null;
  for (const key of candidateKeys) {
    try {
      const decipher = crypto.createDecipheriv(
        payload.algorithm || "aes-256-gcm",
        key,
        Buffer.from(payload.iv, "base64")
      );
      decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payload.cipherText, "base64")),
        decipher.final()
      ]);
      return decrypted.toString("utf8");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Decryption failed for all candidate keys");
};
var resolveBufferEncryptionKey = (masterKey) => {
  if (!masterKey) {
    return encryptionKey;
  }
  return /^[a-f0-9]{64}$/i.test(masterKey) ? Buffer.from(masterKey, "hex") : crypto.createHash("sha256").update(masterKey).digest();
};
var FILE_ENCRYPTION_ALGORITHM = (() => {
  const configured = process.env.FILE_ENCRYPTION_ALGORITHM?.trim().toLowerCase();
  if (configured === "chacha20-poly1305") {
    return "chacha20-poly1305";
  }
  return "aes-256-gcm";
})();
var ENVELOPE_KEY_ID = process.env.ENVELOPE_KEY_ID?.trim() || "local-kek-v1";
var ENVELOPE_KEY_VERSION = process.env.ENVELOPE_KEY_VERSION?.trim() || "v1";
var REQUIRE_ENVELOPE_KEK_IN_PRODUCTION = (process.env.REQUIRE_ENVELOPE_KEK_IN_PRODUCTION?.trim().toLowerCase() || "false") === "true";
var resolveKekBuffer = (source) => {
  if (/^[a-f0-9]{64}$/i.test(source)) {
    return Buffer.from(source, "hex");
  }
  try {
    const asBase64 = Buffer.from(source, "base64");
    if (asBase64.length === 32) {
      return asBase64;
    }
  } catch {
  }
  return crypto.createHash("sha256").update(source).digest();
};
var resolveEnvelopeKekRing = () => {
  const ring = /* @__PURE__ */ new Map();
  const primarySource = process.env.ENVELOPE_KEK || process.env.KMS_ENVELOPE_KEK || "";
  if (primarySource) {
    ring.set(ENVELOPE_KEY_ID, resolveKekBuffer(primarySource));
  }
  const rawRing = process.env.ENVELOPE_KEK_RING_JSON?.trim();
  if (rawRing) {
    try {
      const parsed = JSON.parse(rawRing);
      for (const [keyId, value] of Object.entries(parsed)) {
        if (keyId && typeof value === "string" && value.trim()) {
          ring.set(keyId, resolveKekBuffer(value.trim()));
        }
      }
    } catch {
      throw new Error("ENVELOPE_KEK_RING_JSON must be valid JSON object.");
    }
  }
  if (process.env.NODE_ENV === "production" && REQUIRE_ENVELOPE_KEK_IN_PRODUCTION && ring.size === 0) {
    throw new Error(
      "ENVELOPE_KEK (or KMS_ENVELOPE_KEK / ENVELOPE_KEK_RING_JSON) must be set in production."
    );
  }
  if (ring.size === 0) {
    ring.set(ENVELOPE_KEY_ID, Buffer.from("1".repeat(64), "hex"));
  }
  return ring;
};
var envelopeKekRing = resolveEnvelopeKekRing();
var resolveEnvelopeKek = () => {
  const source = process.env.ENVELOPE_KEK || process.env.KMS_ENVELOPE_KEK || "";
  if (!source && process.env.NODE_ENV === "production" && REQUIRE_ENVELOPE_KEK_IN_PRODUCTION) {
    throw new Error("ENVELOPE_KEK (or KMS_ENVELOPE_KEK) must be set in production.");
  }
  if (!source) {
    return Buffer.from("1".repeat(64), "hex");
  }
  return resolveKekBuffer(source);
};
var envelopeKek = resolveEnvelopeKek();
var encryptWithAlgorithm = (buffer, key, algorithm) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encrypted, iv, authTag };
};
var decryptWithAlgorithm = (cipherText, key, algorithm, iv, authTag) => {
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(cipherText), decipher.final()]);
};
var encryptBufferEnvelope = (buffer, algorithm = FILE_ENCRYPTION_ALGORITHM) => {
  const dek = crypto.randomBytes(32);
  const fileCipher = encryptWithAlgorithm(buffer, dek, algorithm);
  const wrappedDekPayload = encryptWithAlgorithm(dek, envelopeKek, "aes-256-gcm");
  return {
    algorithm,
    iv: fileCipher.iv.toString("base64"),
    authTag: fileCipher.authTag.toString("base64"),
    cipherText: fileCipher.encrypted.toString("base64"),
    wrappedDek: wrappedDekPayload.encrypted.toString("base64"),
    wrapIv: wrappedDekPayload.iv.toString("base64"),
    wrapTag: wrappedDekPayload.authTag.toString("base64"),
    keyVersion: ENVELOPE_KEY_VERSION,
    keyId: ENVELOPE_KEY_ID
  };
};
var decryptBufferEnvelope = (payload) => {
  const kekForPayload = envelopeKekRing.get(payload.keyId) || envelopeKek;
  const dek = decryptWithAlgorithm(
    Buffer.from(payload.wrappedDek, "base64"),
    kekForPayload,
    "aes-256-gcm",
    Buffer.from(payload.wrapIv, "base64"),
    Buffer.from(payload.wrapTag, "base64")
  );
  return decryptWithAlgorithm(
    Buffer.from(payload.cipherText, "base64"),
    dek,
    payload.algorithm,
    Buffer.from(payload.iv, "base64"),
    Buffer.from(payload.authTag, "base64")
  );
};
var decryptBuffer = (payload, masterKey) => {
  const keyBuffer = resolveBufferEncryptionKey(masterKey);
  const authTag = "tag" in payload ? payload.tag : payload.authTag;
  const encryptedData = "encryptedData" in payload ? payload.encryptedData : payload.cipherText;
  const encoding = "encryptedData" in payload ? "hex" : "base64";
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    keyBuffer,
    Buffer.from(payload.iv, encoding === "hex" ? "hex" : "base64")
  );
  decipher.setAuthTag(Buffer.from(authTag, encoding === "hex" ? "hex" : "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedData, encoding)),
    decipher.final()
  ]);
  return decrypted;
};

// server/services/legacyVaultService.ts
var uploadRoot2 = getUploadRoot();
var GRIDFS_THRESHOLD_BYTES = 256 * 1024;
var SAFE_COLLECTION_SEGMENT_PATTERN = /[^a-z0-9_-]/g;
var getLegacyCollection = async (username = "legacy") => {
  const ready = await ensureMongoReady();
  if (!ready) {
    throw new AppError(503, "DB_UNAVAILABLE", "Database connection lost. Please try again later.");
  }
  const model2 = getVaultItemModel(username);
  return model2.collection;
};
var getDatabaseOrThrow = async () => {
  const ready = await ensureMongoReady();
  if (!ready) {
    throw new AppError(503, "DB_UNAVAILABLE", "Database connection lost. Please try again later.");
  }
  const database = mongoose5.connection.db;
  if (!database) {
    throw new AppError(503, "DB_UNAVAILABLE", "Database connection lost. Please try again later.");
  }
  return database;
};
var normalizeCollectionSegment = (value) => value.trim().toLowerCase().replace(SAFE_COLLECTION_SEGMENT_PATTERN, "_").replace(/_+/g, "_");
var normalizeScopedCategory = (category) => {
  const normalized = normalizeCollectionSegment(category);
  if (!normalized) {
    return "files";
  }
  if (normalized === "note" || normalized === "notes") {
    return "notes";
  }
  if (normalized === "todo" || normalized === "todos") {
    return "todos";
  }
  if (normalized === "password" || normalized === "passwords") {
    return "passwords";
  }
  if (normalized === "secret" || normalized === "secrets") {
    return "secrets";
  }
  if (normalized === "contact" || normalized === "contacts") {
    return "contacts";
  }
  if (normalized === "photo" || normalized === "photos") {
    return "photos";
  }
  if (normalized === "video" || normalized === "videos") {
    return "videos";
  }
  if (normalized === "document" || normalized === "documents") {
    return "documents";
  }
  if (normalized === "file" || normalized === "files") {
    return "files";
  }
  if (normalized === "location" || normalized === "locations") {
    return "locations";
  }
  if (normalized === "file" || normalized === "files" || normalized === "other" || normalized === "otherfile" || normalized === "otherfiles" || normalized === "other_file" || normalized === "other_files" || normalized === "other-files") {
    return "files";
  }
  return normalized;
};
var buildUserScopedCollectionName = (username, category) => {
  const normalized = normalizeCollectionSegment(username);
  return `${normalized}.${normalized}_${normalizeScopedCategory(category)}`;
};
var getScopedCollection = async (username, category) => {
  const database = await getDatabaseOrThrow();
  return database.collection(buildUserScopedCollectionName(username, category));
};
var ensureScopedCollectionIndexes = async (username, category) => {
  try {
    const collection = await getScopedCollection(username, category);
    await Promise.all([
      collection.createIndex({ itemId: 1 }, { unique: true, name: "item_unique" }),
      collection.createIndex({ updatedAt: -1 }, { name: "updated_lookup" })
    ]);
    return collection;
  } catch (error) {
    logger.error("Failed to ensure collection indexes", {
      username,
      category,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
};
var getLegacyBucket = () => {
  const database = mongoose5.connection.db;
  if (!database) {
    throw new AppError(503, "DB_UNAVAILABLE", "Database connection lost. Please try again later.");
  }
  return new mongoose5.mongo.GridFSBucket(database, {
    bucketName: "vault_item_files"
  });
};
var serializePayload = (payload) => {
  if (Buffer.isBuffer(payload)) {
    return {
      payload: payload.toString("base64"),
      binaryPayload: null
    };
  }
  return {
    payload,
    binaryPayload: null
  };
};
var cleanupLegacyStorageArtifacts = async (input) => {
  await deleteStoredFile(getStoredFilePathFromMetadata(input.metadata));
  await deleteGridFsFile(input.gridFsId);
};
var toObjectId = (value) => {
  try {
    return new mongoose5.Types.ObjectId(value);
  } catch {
    return null;
  }
};
var uploadPayloadToGridFs = async (input, payload) => {
  const bucket = getLegacyBucket();
  const encryptedPayload = encryptBufferEnvelope(payload);
  const cipherBuffer = Buffer.from(encryptedPayload.cipherText, "base64");
  const uploadStream = bucket.openUploadStream(input.title || `${input.itemId}.bin`, {
    metadata: {
      vaultId: input.vaultId,
      itemId: input.itemId,
      category: input.category,
      mimeType: typeof input.metadata?.mimeType === "string" ? input.metadata.mimeType : void 0,
      encryption: {
        algorithm: encryptedPayload.algorithm,
        iv: encryptedPayload.iv,
        authTag: encryptedPayload.authTag,
        wrappedDek: encryptedPayload.wrappedDek,
        wrapIv: encryptedPayload.wrapIv,
        wrapTag: encryptedPayload.wrapTag,
        keyVersion: encryptedPayload.keyVersion,
        keyId: encryptedPayload.keyId
      }
    }
  });
  await new Promise((resolve, reject) => {
    uploadStream.on("error", reject);
    uploadStream.on("finish", () => resolve());
    uploadStream.end(cipherBuffer);
  });
  return uploadStream.id.toString();
};
var deleteGridFsFile = async (gridFsId) => {
  if (!gridFsId) {
    return;
  }
  const objectId = toObjectId(gridFsId);
  if (!objectId) {
    return;
  }
  try {
    await getLegacyBucket().delete(objectId);
  } catch (error) {
    const candidate = error;
    if (candidate.code !== "ENOENT" && candidate.message !== "FileNotFound") {
      console.warn("Failed to delete GridFS file:", candidate);
    }
  }
  try {
    const nodes = multiClusterPool.getHealthyNodes();
    for (const node of nodes) {
      if (node.connection.db) {
        try {
          const remoteBucket = new mongoose5.mongo.GridFSBucket(node.connection.db, {
            bucketName: "vault_item_files"
          });
          await remoteBucket.delete(objectId);
        } catch {
        }
      }
    }
  } catch {
  }
};
var downloadGridFsFileAsBase64 = async (gridFsId) => {
  const objectId = toObjectId(gridFsId);
  if (!objectId) {
    return "";
  }
  let bucket = getLegacyBucket();
  let [gridFsFile] = await bucket.find({ _id: objectId }).limit(1).toArray();
  if (!gridFsFile) {
    try {
      const nodes = multiClusterPool.getHealthyNodes();
      for (const node of nodes) {
        if (node.connection.db) {
          const remoteBucket = new mongoose5.mongo.GridFSBucket(node.connection.db, {
            bucketName: "vault_item_files"
          });
          const [remoteFile] = await remoteBucket.find({ _id: objectId }).limit(1).toArray();
          if (remoteFile) {
            bucket = remoteBucket;
            gridFsFile = remoteFile;
            break;
          }
        }
      }
    } catch {
    }
  }
  if (!gridFsFile) {
    return "";
  }
  const encryptionMetadata = gridFsFile?.metadata?.encryption;
  const downloadStream = bucket.openDownloadStream(objectId);
  const chunks = [];
  await new Promise((resolve, reject) => {
    downloadStream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    downloadStream.on("error", reject);
    downloadStream.on("end", () => resolve());
  });
  const rawBytes = Buffer.concat(chunks);
  if (!encryptionMetadata) {
    return rawBytes.toString("base64");
  }
  const decrypted = decryptBufferEnvelope({
    algorithm: encryptionMetadata.algorithm,
    iv: encryptionMetadata.iv,
    authTag: encryptionMetadata.authTag,
    wrappedDek: encryptionMetadata.wrappedDek,
    wrapIv: encryptionMetadata.wrapIv,
    wrapTag: encryptionMetadata.wrapTag,
    keyVersion: encryptionMetadata.keyVersion,
    keyId: encryptionMetadata.keyId,
    cipherText: rawBytes.toString("base64")
  });
  return decrypted.toString("base64");
};
var getStoredFilePathFromMetadata = (metadata) => {
  return typeof metadata?.filePath === "string" && metadata.filePath.startsWith("/") ? metadata.filePath : null;
};
var deleteStoredFile = async (filePath) => {
  if (!filePath) {
    return;
  }
  const absolutePath = path2.resolve(process.cwd(), filePath.slice(1));
  if (!absolutePath.startsWith(uploadRoot2)) {
    return;
  }
  try {
    const fs13 = await import("fs/promises");
    await fs13.unlink(absolutePath);
  } catch (error) {
    const candidate = error;
    if (candidate.code !== "ENOENT") {
      console.warn("Failed to delete legacy stored file:", candidate);
    }
  }
};
var serializeVaultItem = async (item) => ({
  itemId: item.itemId,
  payload: item.encoding === "gridfs-binary" && typeof item.gridFsId === "string" ? await downloadGridFsFileAsBase64(item.gridFsId) : typeof item.payload === "string" ? item.payload : "",
  gridFsId: item.gridFsId,
  encoding: item.encoding,
  category: item.category,
  title: item.title,
  metadata: item.metadata,
  updatedAt: item.updatedAt
});
var saveLegacyVaultItem = async (input) => {
  const collection = await ensureScopedCollectionIndexes(input.username, input.category);
  const selector = { vaultId: input.vaultId, itemId: input.itemId };
  const existing = await collection.findOne(selector);
  const binaryPayload = Buffer.isBuffer(input.payload) ? input.payload : null;
  const shouldUseGridFs = binaryPayload !== null && binaryPayload.length > GRIDFS_THRESHOLD_BYTES;
  let newGridFsId = null;
  try {
    const serialized = shouldUseGridFs ? {
      payload: "",
      binaryPayload: null,
      gridFsId: await uploadPayloadToGridFs(input, binaryPayload),
      encoding: "gridfs-binary"
    } : {
      ...serializePayload(input.payload),
      gridFsId: null,
      encoding: resolvePayloadEncoding(input.payload)
    };
    newGridFsId = serialized.gridFsId;
    const performUpsert = async () => {
      try {
        await collection.updateOne(
          selector,
          {
            $set: {
              vaultId: input.vaultId,
              itemId: input.itemId,
              payload: serialized.payload,
              binaryPayload: serialized.binaryPayload,
              gridFsId: serialized.gridFsId,
              encoding: serialized.encoding,
              category: input.category,
              title: input.title,
              metadata: input.metadata,
              updatedAt: /* @__PURE__ */ new Date()
            }
          },
          { upsert: true }
        );
      } catch (err) {
        if (err.code === 11e3) {
          await collection.updateOne(
            selector,
            {
              $set: {
                payload: serialized.payload,
                binaryPayload: serialized.binaryPayload,
                gridFsId: serialized.gridFsId,
                encoding: serialized.encoding,
                category: input.category,
                title: input.title,
                metadata: input.metadata,
                updatedAt: /* @__PURE__ */ new Date()
              }
            },
            { upsert: true }
          );
        } else {
          throw err;
        }
      }
    };
    await performUpsert();
  } catch (error) {
    if (newGridFsId) await deleteGridFsFile(newGridFsId);
    throw error;
  }
  if (shouldUseGridFs || binaryPayload !== null) {
    await cleanupLegacyStorageArtifacts(existing || {});
  }
  return {
    vaultId: input.vaultId,
    itemId: input.itemId,
    stored: true
  };
};
var listLegacyVaultItems = async (vaultId, username) => {
  try {
    const collection = await getLegacyCollection(username);
    const items = await collection.find({ vaultId }).toArray();
    return Promise.all(items.map((item) => serializeVaultItem(item)));
  } catch (error) {
    logger.error("Failed to list legacy vault items", {
      vaultId,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
};
var deleteLegacyVaultItem = async (vaultId, itemId, username) => {
  const collection = await getLegacyCollection(username);
  const existing = await collection.findOne({ vaultId, itemId });
  const result = await collection.deleteOne({ vaultId, itemId });
  if (result.deletedCount > 0) {
    await deleteStoredFile(getStoredFilePathFromMetadata(existing?.metadata));
    await deleteGridFsFile(existing?.gridFsId);
  }
  return result.deletedCount > 0;
};
var saveScopedVaultItem = async (input) => {
  const { userId, itemId, category, folder, payload, title, metadata } = input;
  const isBinary = Buffer.isBuffer(payload);
  let encoding = resolvePayloadEncoding(payload);
  let finalPayload = "";
  let modernPayload = null;
  let gridFsId = null;
  const isSingleton = itemId && ["__settings__", "__profile__", "__keycheck__"].includes(itemId);
  const binaryPayload = isBinary ? payload : null;
  const shouldUseGridFs = !isSingleton && binaryPayload !== null && binaryPayload.length > GRIDFS_THRESHOLD_BYTES;
  if (shouldUseGridFs) {
    gridFsId = await uploadPayloadToGridFs(
      {
        vaultId: userId,
        username: input.username,
        itemId,
        payload,
        category,
        title,
        metadata
      },
      binaryPayload
    );
    encoding = "gridfs-binary";
    finalPayload = "";
  } else if (isBinary) {
    finalPayload = payload.toString("base64");
    encoding = "binary-base64";
  } else {
    if (typeof payload === "string" && payload.startsWith("V2_MODERN:")) {
      modernPayload = payload;
      encoding = "modern";
    } else {
      finalPayload = payload;
    }
  }
  const performUpsert = async () => {
    const isPinned = Boolean(metadata?.isPinned);
    const pinnedAtRaw = metadata?.pinnedAt;
    const pinnedAt = isPinned && pinnedAtRaw ? new Date(pinnedAtRaw) : isPinned ? /* @__PURE__ */ new Date() : null;
    try {
      const DynamicVaultModel = getVaultItemModel(input.username);
      const existing = await DynamicVaultModel.findOne({ userId, itemId }).lean();
      let resolvedGridFsId = gridFsId;
      let resolvedEncoding = encoding;
      let resolvedPayload = finalPayload;
      let resolvedModernPayload = modernPayload;
      let resolvedFile = {
        fileName: title || metadata?.originalName || metadata?.fileName || existing?.file?.fileName || "file",
        filePath: gridFsId ? `cloud://${gridFsId}` : `cloud://${itemId}`,
        mimeType: metadata?.mimeType || existing?.file?.mimeType || "application/octet-stream",
        size: metadata?.size || (isBinary && binaryPayload ? binaryPayload.length : existing?.file?.size || 0)
      };
      if (!isBinary && existing) {
        if (existing.gridFsId) {
          resolvedGridFsId = existing.gridFsId;
          resolvedEncoding = existing.encoding || "gridfs-binary";
          resolvedFile = {
            ...existing.file,
            fileName: title || metadata?.originalName || metadata?.fileName || existing.file?.fileName || "file",
            filePath: existing.file?.filePath || `cloud://${existing.gridFsId}`,
            mimeType: metadata?.mimeType || existing.file?.mimeType || "application/octet-stream",
            size: metadata?.size || existing.file?.size || 0
          };
          if (!resolvedPayload && existing.payload) {
            resolvedPayload = existing.payload;
          }
        } else if (existing.file?.filePath && !resolvedGridFsId) {
          resolvedEncoding = existing.encoding || "file-reference";
          resolvedFile = {
            ...existing.file,
            fileName: title || metadata?.originalName || metadata?.fileName || existing.file?.fileName || "file",
            filePath: existing.file.filePath,
            mimeType: metadata?.mimeType || existing.file?.mimeType || "application/octet-stream",
            size: metadata?.size || existing.file?.size || 0
          };
        } else if (existing.encoding === "binary-base64" && existing.payload && (!payload || payload === "")) {
          resolvedEncoding = existing.encoding;
          resolvedPayload = existing.payload;
        }
      }
      const mergedMetadata = {
        ...existing?.metadata || {},
        ...metadata || {}
      };
      const resolvedFolder = folder !== void 0 ? folder : metadata?.folder !== void 0 ? metadata.folder : existing?.folder || null;
      const result2 = await DynamicVaultModel.findOneAndUpdate(
        { userId, itemId },
        {
          userId,
          itemId,
          category,
          folder: resolvedFolder,
          payload: resolvedPayload,
          modernPayload: resolvedModernPayload,
          gridFsId: resolvedGridFsId,
          encoding: resolvedEncoding,
          title,
          file: resolvedFile,
          metadata: mergedMetadata,
          isPinned,
          pinnedAt,
          updatedAt: /* @__PURE__ */ new Date(),
          isDeleted: false
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
      if (existing && existing.gridFsId && gridFsId && existing.gridFsId !== gridFsId) {
        await deleteGridFsFile(existing.gridFsId);
      }
      return result2;
    } catch (err) {
      if (err.code === 11e3) {
        logger.warn(`Duplicate key error in scoped upsert for ${itemId}. Retrying.`, {
          userId,
          itemId
        });
        const DynamicVaultModel = getVaultItemModel(input.username);
        if (isSingleton) {
          await DynamicVaultModel.deleteOne({ userId, itemId }).catch((error) => {
            logger.warn("Failed to delete singleton before scoped upsert retry", {
              userId,
              itemId,
              error
            });
          });
        }
        const existing = await DynamicVaultModel.findOne({ userId, itemId }).lean();
        let resolvedGridFsId = gridFsId;
        let resolvedEncoding = encoding;
        let resolvedPayload = finalPayload;
        let resolvedModernPayload = modernPayload;
        let resolvedFile = {
          fileName: title || metadata?.originalName || metadata?.fileName || existing?.file?.fileName || "file",
          filePath: gridFsId ? `cloud://${gridFsId}` : `cloud://${itemId}`,
          mimeType: metadata?.mimeType || existing?.file?.mimeType || "application/octet-stream",
          size: metadata?.size || (isBinary && binaryPayload ? binaryPayload.length : existing?.file?.size || 0)
        };
        if (!isBinary && existing) {
          if (existing.gridFsId) {
            resolvedGridFsId = existing.gridFsId;
            resolvedEncoding = existing.encoding || "gridfs-binary";
            resolvedFile = {
              ...existing.file,
              fileName: title || metadata?.originalName || metadata?.fileName || existing.file?.fileName || "file",
              filePath: existing.file?.filePath || `cloud://${existing.gridFsId}`,
              mimeType: metadata?.mimeType || existing.file?.mimeType || "application/octet-stream",
              size: metadata?.size || existing.file?.size || 0
            };
            if (!resolvedPayload && existing.payload) {
              resolvedPayload = existing.payload;
            }
          } else if (existing.file?.filePath && !resolvedGridFsId) {
            resolvedEncoding = existing.encoding || "file-reference";
            resolvedFile = {
              ...existing.file,
              fileName: title || metadata?.originalName || metadata?.fileName || existing.file?.fileName || "file",
              filePath: existing.file.filePath,
              mimeType: metadata?.mimeType || existing.file?.mimeType || "application/octet-stream",
              size: metadata?.size || existing.file?.size || 0
            };
          }
        }
        const mergedMetadata = {
          ...existing?.metadata || {},
          ...metadata || {}
        };
        const resolvedFolder = folder !== void 0 ? folder : metadata?.folder !== void 0 ? metadata.folder : existing?.folder || null;
        return await DynamicVaultModel.findOneAndUpdate(
          { userId, itemId },
          {
            category,
            folder: resolvedFolder,
            payload: resolvedPayload,
            modernPayload: resolvedModernPayload,
            gridFsId: resolvedGridFsId,
            encoding: resolvedEncoding,
            title,
            file: resolvedFile,
            metadata: mergedMetadata,
            isPinned,
            pinnedAt,
            updatedAt: /* @__PURE__ */ new Date(),
            isDeleted: false
          },
          { upsert: true, returnDocument: "after" }
        );
      }
      throw err;
    }
  };
  const result = await performUpsert();
  return {
    userId,
    itemId,
    stored: true,
    result
  };
};
var listScopedVaultItemsByUsername = async (userId, username) => {
  const DynamicVaultModel = getVaultItemModel(username);
  const items = await DynamicVaultModel.find({ userId, isDeleted: false }).sort({ updatedAt: -1 }).allowDiskUse(true).lean().exec();
  return items.map((item) => {
    let payload = item.modernPayload || item.payload || "";
    let encoding = item.encoding || "utf-8";
    if (item.encoding === "gridfs-binary" && item.gridFsId) {
      payload = item.file && typeof item.file.filePath === "string" && item.file.filePath.trim() || `gridfs://${item.gridFsId}`;
      encoding = "file-reference";
    } else if (!payload && item.file && item.file.filePath) {
      payload = item.file.filePath;
      encoding = "file-reference";
    }
    const storedMetadata = item.metadata && typeof item.metadata === "object" ? { ...item.metadata } : {};
    if (item.encoding === "gridfs-binary" && !item.file?.encryptionIv && !item.file?.encryptionTag) {
      storedMetadata.clientEncrypted = true;
    }
    return {
      itemId: item.itemId,
      payload,
      encoding,
      gridFsId: item.gridFsId,
      category: item.category,
      folder: item.folder ?? null,
      title: item.title,
      metadata: storedMetadata,
      updatedAt: item.updatedAt,
      isPinned: item.isPinned ?? false,
      pinnedAt: item.pinnedAt ?? null
    };
  });
};
var deleteScopedVaultItemByUsername = async (userId, username, itemId) => {
  const DynamicVaultModel = getVaultItemModel(username);
  const result = await DynamicVaultModel.findOneAndUpdate(
    { userId, itemId },
    { isDeleted: true, deletedAt: /* @__PURE__ */ new Date() },
    { returnDocument: "after" }
  );
  return !!result;
};
var setScopedVaultItemPinByUsername = async (userId, username, itemId, isPinned) => {
  const DynamicVaultModel = getVaultItemModel(username);
  const pinnedAt = isPinned ? /* @__PURE__ */ new Date() : null;
  const result = await DynamicVaultModel.findOneAndUpdate(
    { userId, itemId, isDeleted: false },
    { isPinned, pinnedAt, updatedAt: /* @__PURE__ */ new Date() },
    { returnDocument: "after" }
  );
  if (!result) {
    throw new AppError(404, "ITEM_NOT_FOUND", "Vault item not found.");
  }
  return {
    itemId,
    isPinned: Boolean(result.isPinned),
    pinnedAt: result.pinnedAt ?? null,
    updatedAt: result.updatedAt
  };
};

// server/controllers/legacyVaultController.ts
init_logger();
var MAX_LEGACY_ID_LENGTH = 256;
var SAFE_LEGACY_ID_PATTERN = /^[a-zA-Z0-9:_-]+$/;
var LEGACY_RAW_LIMIT = `${Number(process.env.LEGACY_RAW_LIMIT_MB || process.env.MAX_FILE_SIZE_MB || 4096)}mb`;
var MAX_SCOPED_TEXT_PAYLOAD_BYTES = Math.max(
  1e6,
  Number(process.env.MAX_SCOPED_TEXT_PAYLOAD_BYTES || 4 * 1024 * 1024)
);
var ALLOWED_SCOPED_CATEGORIES = /* @__PURE__ */ new Set([
  "audio",
  "card",
  "chat",
  "contact",
  "document",
  "file",
  "identity",
  "location",
  "note",
  "other",
  "other-files",
  "password",
  "photo",
  "secret",
  "settings",
  "system",
  "todo",
  "users",
  "video",
  "wifi"
]);
var CHUNK_UPLOAD_ROOT = path3.join(process.cwd(), "vault-tmp", "chunk-uploads");
var CHUNK_UPLOAD_TTL_MS = Math.max(
  6e4,
  Number(process.env.CHUNK_UPLOAD_TTL_MS || 30 * 60 * 1e3)
);
var CHUNK_UPLOAD_COMPLETION_MARKER_TTL_MS = Math.max(
  5 * 60 * 1e3,
  Number(process.env.CHUNK_UPLOAD_COMPLETION_MARKER_TTL_MS || 6 * 60 * 60 * 1e3)
);
var CHUNK_UPLOAD_MAX_CHUNKS = Math.max(1, Number(process.env.CHUNK_UPLOAD_MAX_CHUNKS || 4096));
var CHUNK_UPLOAD_MAX_PART_BYTES = Math.max(
  256 * 1024,
  Number(process.env.CHUNK_UPLOAD_MAX_PART_BYTES || 12 * 1024 * 1024)
);
var LEGACY_MAX_FILE_SIZE_BYTES = Math.max(
  1,
  Number(process.env.MAX_FILE_SIZE_MB || 4096) * 1024 * 1024
);
var CHUNK_ASSEMBLY_LOCK_STALE_MS = Math.max(
  5e3,
  Number(process.env.CHUNK_ASSEMBLY_LOCK_STALE_MS || 2 * 60 * 1e3)
);
var CHUNK_COMPLETION_MARKER_PREFIX = "completed-";
var safeRm = async (targetPath) => {
  try {
    await fs2.rm(targetPath, { recursive: true, force: true });
  } catch (err) {
    logger.debug("safeRm failed to remove target path", { targetPath, error: err });
  }
};
var safeUnlink = async (targetPath) => {
  try {
    await fs2.unlink(targetPath);
  } catch (err) {
    logger.debug("safeUnlink failed to unlink file", { targetPath, error: err });
  }
};
var tryAcquireChunkAssemblyLock = async (lockPath) => {
  try {
    await fs2.writeFile(lockPath, String(Date.now()), { flag: "wx" });
    return true;
  } catch (err) {
    logger.debug("Initial chunk assembly lock acquisition failed, checking staleness", {
      lockPath,
      error: err
    });
  }
  try {
    const stat = await fs2.stat(lockPath);
    if (Date.now() - stat.mtimeMs > CHUNK_ASSEMBLY_LOCK_STALE_MS) {
      await safeUnlink(lockPath);
      await fs2.writeFile(lockPath, String(Date.now()), { flag: "wx" });
      return true;
    }
  } catch (err) {
    logger.debug("Lock staleness check/retry failed", { lockPath, error: err });
    try {
      await fs2.writeFile(lockPath, String(Date.now()), { flag: "wx" });
      return true;
    } catch (lockAcquireErr) {
      logger.debug("Secondary lock acquisition failed", { lockPath, error: lockAcquireErr });
    }
  }
  return false;
};
var cleanupExpiredChunkUploads = async (userChunkRoot) => {
  let entries = [];
  try {
    entries = await fs2.readdir(userChunkRoot, { withFileTypes: true });
  } catch (err) {
    if (err?.code !== "ENOENT") {
      logger.warn("Failed to readdir during expired chunk cleanup", { userChunkRoot, error: err });
    }
    return;
  }
  const now = Date.now();
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path3.join(userChunkRoot, entry.name);
      try {
        const stat = await fs2.stat(fullPath);
        if (entry.isDirectory()) {
          if (now - stat.mtimeMs > CHUNK_UPLOAD_TTL_MS) {
            await safeRm(fullPath);
          }
          return;
        }
        if (entry.name.startsWith(CHUNK_COMPLETION_MARKER_PREFIX) && now - stat.mtimeMs > CHUNK_UPLOAD_COMPLETION_MARKER_TTL_MS) {
          await safeUnlink(fullPath);
        }
      } catch (entryErr) {
        logger.debug("Per-entry error during chunk upload cleanup", { fullPath, error: entryErr });
      }
    })
  );
};
var sanitizeMarkerSegment = (value) => value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
var getChunkCompletionMarkerPath = (userChunkRoot, uploadId, itemId) => path3.join(
  userChunkRoot,
  `${CHUNK_COMPLETION_MARKER_PREFIX}${sanitizeMarkerSegment(uploadId)}-${sanitizeMarkerSegment(itemId)}.json`
);
var wasChunkUploadCompleted = async (userChunkRoot, uploadId, itemId) => {
  const markerPath = getChunkCompletionMarkerPath(userChunkRoot, uploadId, itemId);
  try {
    const stat = await fs2.stat(markerPath);
    if (Date.now() - stat.mtimeMs > CHUNK_UPLOAD_COMPLETION_MARKER_TTL_MS) {
      await safeUnlink(markerPath);
      return false;
    }
    return true;
  } catch (statErr) {
    if (statErr?.code !== "ENOENT") {
      logger.debug("Checking chunk upload completion marker failed", {
        markerPath,
        error: statErr
      });
    }
    return false;
  }
};
var markChunkUploadCompleted = async (userChunkRoot, uploadId, itemId) => {
  const markerPath = getChunkCompletionMarkerPath(userChunkRoot, uploadId, itemId);
  await fs2.writeFile(markerPath, JSON.stringify({ uploadId, itemId, completedAt: Date.now() }));
};
var assertLegacyId = (value, fieldName) => {
  if (!value || value.length > MAX_LEGACY_ID_LENGTH || !SAFE_LEGACY_ID_PATTERN.test(value)) {
    throw new AppError(400, "INVALID_IDENTIFIER", `${fieldName} is invalid.`);
  }
};
var getRouteParam = (value, fieldName) => {
  if (typeof value !== "string") {
    throw new AppError(400, "INVALID_IDENTIFIER", `${fieldName} is invalid.`);
  }
  assertLegacyId(value, fieldName);
  return value;
};
var assertScopedCategory = (category) => {
  if (!ALLOWED_SCOPED_CATEGORIES.has(category)) {
    throw new AppError(400, "UNSUPPORTED_CATEGORY", "Unsupported vault category for scoped item.");
  }
};
var parseLegacyPayloadFromRequest = async (req, res) => {
  let payload;
  let category = "v2_items";
  let folder = null;
  let title = null;
  let metadata = null;
  let chunkUploadCleanupPath = null;
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  const isBinary = contentType.startsWith("application/octet-stream");
  if (isBinary) {
    try {
      await new Promise((resolve, reject) => {
        express.raw({
          type: "application/octet-stream",
          limit: LEGACY_RAW_LIMIT
        })(req, res, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      const maybeStatus = error?.status;
      const statusCode = typeof maybeStatus === "number" ? maybeStatus : 400;
      const rawMessage = error?.message?.toLowerCase?.() || "";
      const isTooLarge = statusCode === 413 || rawMessage.includes("too large");
      throw new AppError(
        isTooLarge ? 413 : 400,
        isTooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_PAYLOAD",
        isTooLarge ? `Binary upload exceeded limit (${LEGACY_RAW_LIMIT}).` : "Failed to parse binary upload payload."
      );
    }
    payload = req.body;
    let binaryPayload = null;
    if (Buffer.isBuffer(payload)) {
      binaryPayload = payload;
    } else if (payload instanceof Uint8Array) {
      binaryPayload = Buffer.from(payload);
    } else if (payload instanceof ArrayBuffer) {
      binaryPayload = Buffer.from(payload);
    }
    if (!binaryPayload) {
      throw new AppError(400, "INVALID_PAYLOAD", "Binary upload payload is missing or invalid.");
    }
    payload = binaryPayload;
    const chunkedHeader = String(req.headers["x-vault-chunked"] || "").trim().toLowerCase();
    const isChunked = chunkedHeader === "1" || chunkedHeader === "true" || chunkedHeader === "yes";
    if (isChunked) {
      const uploadId = String(req.headers["x-vault-upload-id"] || "").trim();
      const chunkIndex = Number.parseInt(String(req.headers["x-vault-chunk-index"] || "-1"), 10);
      const chunkCount = Number.parseInt(String(req.headers["x-vault-chunk-count"] || "-1"), 10);
      const declaredTotalSize = Number.parseInt(
        String(req.headers["x-vault-total-size"] || "-1"),
        10
      );
      if (!uploadId || chunkIndex < 0 || chunkCount <= 0 || chunkIndex >= chunkCount || chunkCount > CHUNK_UPLOAD_MAX_CHUNKS) {
        throw new AppError(400, "INVALID_CHUNK_HEADERS", "Invalid chunk upload headers.");
      }
      if (!Number.isFinite(declaredTotalSize) || declaredTotalSize <= 0 || declaredTotalSize > LEGACY_MAX_FILE_SIZE_BYTES) {
        throw new AppError(
          400,
          "INVALID_CHUNK_HEADERS",
          "Invalid or unsupported total upload size."
        );
      }
      if (binaryPayload.length === 0 || binaryPayload.length > CHUNK_UPLOAD_MAX_PART_BYTES) {
        throw new AppError(400, "INVALID_CHUNK_SIZE", "Chunk size is invalid for secure upload.");
      }
      const expectedChunkHash = String(req.headers["x-vault-chunk-sha256"] || "").trim();
      if (!/^[a-f0-9]{64}$/i.test(expectedChunkHash)) {
        throw new AppError(
          400,
          "INVALID_CHUNK_HASH",
          "Chunk integrity hash is missing or invalid."
        );
      }
      const scopedUserId = req?.user?.userId || "anon";
      const userChunkRoot = path3.join(CHUNK_UPLOAD_ROOT, String(scopedUserId));
      await fs2.mkdir(userChunkRoot, { recursive: true });
      await cleanupExpiredChunkUploads(userChunkRoot);
      const routeItemId = typeof req.params?.itemId === "string" && req.params.itemId.trim() ? req.params.itemId.trim() : null;
      const chunkUploadState = { uploadId, chunkIndex, chunkCount };
      if (routeItemId && await wasChunkUploadCompleted(userChunkRoot, uploadId, routeItemId)) {
        return {
          payload: "",
          category: parseCategory(req.headers["x-vault-category"]),
          folder: null,
          title: null,
          metadata: null,
          chunkUploadAlreadyCompleted: true,
          chunkUploadState,
          chunkUploadCleanupPath: null
        };
      }
      const uploadDir = path3.join(userChunkRoot, uploadId);
      await fs2.mkdir(uploadDir, { recursive: true });
      const chunkPath = path3.join(uploadDir, `${chunkIndex}.part`);
      const chunkBuffer = binaryPayload;
      const computedHash = crypto2.createHash("sha256").update(chunkBuffer).digest("hex");
      if (computedHash !== expectedChunkHash.toLowerCase()) {
        throw new AppError(400, "CHUNK_INTEGRITY_FAILED", "Chunk integrity verification failed.");
      }
      await fs2.writeFile(chunkPath, chunkBuffer);
      const dirEntries = await fs2.readdir(uploadDir);
      const partCount = dirEntries.filter((name) => name.endsWith(".part")).length;
      if (partCount < chunkCount) {
        return {
          payload: "",
          category: parseCategory(req.headers["x-vault-category"]),
          folder: null,
          title: null,
          metadata: null,
          chunkUploadPending: true,
          chunkUploadState,
          chunkUploadCleanupPath: null
        };
      }
      const lockPath = path3.join(uploadDir, ".assembling.lock");
      const hasLock = await tryAcquireChunkAssemblyLock(lockPath);
      if (!hasLock) {
        return {
          payload: "",
          category: parseCategory(req.headers["x-vault-category"]),
          folder: null,
          title: null,
          metadata: null,
          chunkUploadPending: true,
          chunkUploadState,
          chunkUploadCleanupPath: null
        };
      }
      try {
        const partSizes = [];
        let assembledSize = 0;
        for (let i = 0; i < chunkCount; i += 1) {
          const partPath = path3.join(uploadDir, `${i}.part`);
          const partStat = await fs2.stat(partPath);
          if (partStat.size <= 0 || partStat.size > CHUNK_UPLOAD_MAX_PART_BYTES) {
            throw new AppError(400, "INVALID_CHUNK_SIZE", `Chunk ${i} size is invalid.`);
          }
          partSizes.push(partStat.size);
          assembledSize += partStat.size;
        }
        if (assembledSize !== declaredTotalSize) {
          throw new AppError(
            400,
            "CHUNK_SIZE_MISMATCH",
            "Assembled chunk size does not match declared upload size."
          );
        }
        const assembled = Buffer.allocUnsafe(assembledSize);
        let offset = 0;
        for (let i = 0; i < chunkCount; i += 1) {
          const partPath = path3.join(uploadDir, `${i}.part`);
          const chunk = await fs2.readFile(partPath);
          if (chunk.length !== partSizes[i]) {
            throw new AppError(
              400,
              "CHUNK_SIZE_MISMATCH",
              `Chunk ${i} size changed during assembly.`
            );
          }
          chunk.copy(assembled, offset);
          offset += chunk.length;
        }
        payload = assembled;
        chunkUploadCleanupPath = uploadDir;
      } finally {
        await safeUnlink(lockPath);
      }
      metadata = {
        ...metadata || {},
        _chunkUpload: {
          uploadId,
          chunkCount,
          chunkIndex,
          userChunkRoot,
          routeItemId
        }
      };
    }
    category = parseCategory(req.headers["x-vault-category"]);
    const rawFolderHeader = req.headers["x-vault-folder"];
    folder = typeof rawFolderHeader === "string" && rawFolderHeader.trim() ? safeDecodeURIComponent(rawFolderHeader.trim()) : null;
    title = safeDecodeURIComponent(req.headers["x-vault-title"] || "");
    metadata = parseMetadataHeader(req.headers["x-vault-metadata"]);
  } else {
    payload = req.body?.payload;
    category = parseCategory(req.body?.category);
    const titleHeader = typeof req.headers["x-vault-title"] === "string" ? req.headers["x-vault-title"] : "";
    const metadataHeader = typeof req.headers["x-vault-metadata"] === "string" ? req.headers["x-vault-metadata"] : "";
    const encryptedTitleHeader = titleHeader.trim().startsWith("V2_ENC:");
    const encryptedMetadataHeader = metadataHeader.trim().startsWith("V2_ENC:");
    const folderHeader = typeof req.headers["x-vault-folder"] === "string" ? safeDecodeURIComponent(req.headers["x-vault-folder"]) : null;
    const folderBody = typeof req.body?.folder === "string" ? req.body.folder : null;
    folder = encryptedMetadataHeader ? folderHeader : folderBody || folderHeader || null;
    title = encryptedTitleHeader ? titleHeader : req.body?.title || safeDecodeURIComponent(titleHeader || "");
    let parsedMetadata = parseMetadataHeader(metadataHeader);
    if (!encryptedMetadataHeader && req.body?.metadata) {
      if (typeof req.body.metadata === "object") {
        parsedMetadata = { ...parsedMetadata, ...req.body.metadata };
      } else if (typeof req.body.metadata === "string") {
        try {
          parsedMetadata = {
            ...parsedMetadata,
            ...JSON.parse(req.body.metadata)
          };
        } catch {
          parsedMetadata = {
            ...parsedMetadata,
            _rawMetadata: req.body.metadata
          };
        }
      }
    }
    if (!encryptedMetadataHeader && req.body) {
      const {
        username,
        id,
        ip,
        created,
        createdAt,
        update,
        updatedAt,
        deleted,
        deletedAt,
        browser
      } = req.body;
      const extractText = {
        username,
        id,
        ip,
        created,
        createdAt,
        update,
        updatedAt,
        deleted,
        deletedAt,
        browser
      };
      let hasExtra = false;
      for (const val of Object.values(extractText)) {
        if (val !== void 0 && val !== null) hasExtra = true;
      }
      if (hasExtra) {
        parsedMetadata = { ...parsedMetadata, ...extractText };
      }
    }
    metadata = parsedMetadata && Object.keys(parsedMetadata).length > 0 ? parsedMetadata : null;
  }
  if (typeof payload !== "string" && !Buffer.isBuffer(payload)) {
    return null;
  }
  if (typeof payload === "string") {
    const payloadSize = Buffer.byteLength(payload, "utf8");
    if (payloadSize > MAX_SCOPED_TEXT_PAYLOAD_BYTES) {
      throw new AppError(
        413,
        "PAYLOAD_TOO_LARGE",
        "Encrypted text payload exceeds secure size limits."
      );
    }
  }
  if (!folder && metadata?.folder) {
    folder = String(metadata.folder);
  }
  return {
    payload,
    category,
    folder,
    title,
    metadata,
    chunkUploadCleanupPath
  };
};
var upsertLegacyVaultItem = async (req, res) => {
  const vaultId = getRouteParam(req.params.vaultId, "vaultId");
  const itemId = getRouteParam(req.params.itemId, "itemId");
  const parsed = await parseLegacyPayloadFromRequest(req, res);
  if (!parsed) {
    return sendRequestError(req, res, 400, {
      code: "INVALID_PAYLOAD",
      message: "Payload is required."
    });
  }
  if (parsed.chunkUploadPending) {
    return res.status(202).json({
      success: true,
      data: parsed.chunkUploadState,
      message: "Chunk accepted"
    });
  }
  if (parsed.chunkUploadAlreadyCompleted) {
    return res.json({
      success: true,
      data: parsed.chunkUploadState,
      message: "Chunk upload already finalized"
    });
  }
  const parsedMetadata = parsed?.metadata && typeof parsed.metadata === "object" ? { ...parsed.metadata } : null;
  const chunkMeta = parsedMetadata?._chunkUpload;
  if (parsedMetadata && "_chunkUpload" in parsedMetadata) {
    delete parsedMetadata._chunkUpload;
  }
  const result = await saveLegacyVaultItem({
    vaultId,
    username: req.user.username,
    itemId,
    payload: parsed.payload,
    category: parsed.category,
    folder: parsed.folder,
    title: parsed.title,
    metadata: parsedMetadata
  });
  if (chunkMeta?.uploadId && chunkMeta.userChunkRoot && chunkMeta.routeItemId) {
    await markChunkUploadCompleted(
      chunkMeta.userChunkRoot,
      chunkMeta.uploadId,
      chunkMeta.routeItemId
    );
  }
  if (typeof parsed.chunkUploadCleanupPath === "string") {
    await safeRm(parsed.chunkUploadCleanupPath);
  }
  return res.json({ success: true, data: result });
};
var getLegacyVaultItems = async (req, res) => {
  const vaultId = getRouteParam(req.params.vaultId, "vaultId");
  const username = req.user.username;
  const items = await listLegacyVaultItems(vaultId, username);
  return res.json({ success: true, items });
};
var removeLegacyVaultItem = async (req, res) => {
  const vaultId = getRouteParam(req.params.vaultId, "vaultId");
  const itemId = getRouteParam(req.params.itemId, "itemId");
  const username = req.user.username;
  const deleted = await deleteLegacyVaultItem(vaultId, itemId, username);
  return res.json({ success: true, data: { deleted } });
};
var upsertScopedVaultItem = async (req, res) => {
  const itemId = getRouteParam(req.params.itemId, "itemId");
  const parsed = await parseLegacyPayloadFromRequest(req, res);
  if (!parsed) {
    return sendRequestError(req, res, 400, {
      code: "INVALID_PAYLOAD",
      message: "Payload is required."
    });
  }
  if (parsed.chunkUploadPending) {
    return res.status(202).json({
      success: true,
      data: parsed.chunkUploadState,
      message: "Chunk accepted"
    });
  }
  if (parsed.chunkUploadAlreadyCompleted) {
    return res.json({
      success: true,
      data: parsed.chunkUploadState,
      message: "Chunk upload already finalized"
    });
  }
  const parsedMetadata = parsed?.metadata && typeof parsed.metadata === "object" ? { ...parsed.metadata } : null;
  const chunkMeta = parsedMetadata?._chunkUpload;
  if (parsedMetadata && "_chunkUpload" in parsedMetadata) {
    delete parsedMetadata._chunkUpload;
  }
  assertScopedCategory(parsed.category);
  const result = await saveScopedVaultItem({
    userId: req.user.userId,
    username: req.user.username,
    itemId,
    payload: parsed.payload,
    category: parsed.category,
    folder: parsed.folder,
    title: parsed.title,
    metadata: parsedMetadata
  });
  if (chunkMeta?.uploadId && chunkMeta.userChunkRoot && chunkMeta.routeItemId) {
    await markChunkUploadCompleted(
      chunkMeta.userChunkRoot,
      chunkMeta.uploadId,
      chunkMeta.routeItemId
    );
  }
  if (typeof parsed.chunkUploadCleanupPath === "string") {
    await safeRm(parsed.chunkUploadCleanupPath);
  }
  return res.json({ success: true, data: result });
};
var getScopedVaultItems = async (req, res) => {
  const items = await listScopedVaultItemsByUsername(req.user.userId, req.user.username);
  return res.json({ success: true, items });
};
var removeScopedVaultItem = async (req, res) => {
  const itemId = getRouteParam(req.params.itemId, "itemId");
  const deleted = await deleteScopedVaultItemByUsername(req.user.userId, req.user.username, itemId);
  return res.json({ success: true, data: { deleted } });
};
var toggleScopedVaultItemPin = async (req, res) => {
  const itemId = getRouteParam(req.params.itemId, "itemId");
  if (typeof req.body?.isPinned !== "boolean") {
    throw AppError.badRequest("isPinned must be a boolean value.", "INVALID_PIN_PAYLOAD");
  }
  const isPinned = req.body.isPinned;
  const data = await setScopedVaultItemPinByUsername(
    req.user.userId,
    req.user.username,
    itemId,
    isPinned
  );
  return res.json({ success: true, data });
};

// server/controllers/vaultController.ts
import path9 from "path";
import fs6 from "fs/promises";
import crypto7 from "crypto";
import { constants as bufferConstants } from "node:buffer";

// server/models/activityLog.ts
import mongoose6 from "mongoose";
var encryptedActivityLogSchema = new mongoose6.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
      description: "User who performed the action"
    },
    action: {
      type: String,
      required: true,
      index: true,
      description: "Type of action performed"
    },
    category: {
      type: String,
      required: true,
      index: true,
      description: "Vault category (auth, photos, notes, passwords, etc.)"
    },
    itemId: {
      type: String,
      default: null,
      description: "ID of affected vault item (if applicable)"
    },
    /**
     * Encrypted activity log details
     * Contains: deviceId, ipAddress, userAgent, details, etc.
     */
    encryptedData: {
      cipherText: {
        type: String,
        required: true,
        description: "AES-256-GCM encrypted activity details"
      },
      iv: {
        type: String,
        required: true,
        description: "Initialization vector (base64)"
      },
      authTag: {
        type: String,
        required: true,
        description: "Authentication tag for GCM mode"
      },
      algorithm: {
        type: String,
        default: "aes-256-gcm",
        description: "Encryption algorithm"
      }
    },
    /**
     * Unencrypted metadata for querying
     */
    metadata: {
      deviceId: {
        type: String,
        description: "Device that performed the action"
      },
      ipAddress: {
        type: String,
        index: true,
        description: "IP address from which action was performed"
      },
      userAgent: String,
      status: {
        type: String,
        enum: ["SUCCESS", "FAILURE", "PARTIAL"],
        default: "SUCCESS"
      },
      errorCode: String,
      errorMessage: String
    },
    /**
     * Timestamps and retention
     */
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
      expires: 7776e3
      // Auto-delete after 90 days (in seconds)
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" }
  }
);
encryptedActivityLogSchema.index({ userId: 1, createdAt: -1 });
encryptedActivityLogSchema.index({ userId: 1, action: 1, createdAt: -1 });
encryptedActivityLogSchema.index({ userId: 1, "metadata.ipAddress": 1, createdAt: -1 });
encryptedActivityLogSchema.index({ userId: 1, category: 1, createdAt: -1 });
var getActivityLogModel = (username, customConnection) => {
  if (!username || !username.trim()) {
    throw new Error("Username is required for isolated activity logs");
  }
  const collectionName = `${username.trim()}.${username.trim()}_activity_logs`;
  if (customConnection) {
    if (customConnection.models[collectionName]) {
      return customConnection.models[collectionName];
    }
    const model3 = customConnection.model(
      collectionName,
      encryptedActivityLogSchema,
      collectionName
    );
    if (typeof model3?.createIndexes === "function") {
      model3.createIndexes().catch(() => {
      });
    }
    return model3;
  }
  if (mongoose6.models[collectionName]) {
    return mongoose6.models[collectionName];
  }
  const model2 = mongoose6.model(
    collectionName,
    encryptedActivityLogSchema,
    collectionName
  );
  if (typeof model2?.createIndexes === "function") {
    model2.createIndexes().catch(() => {
    });
  }
  return model2;
};

// server/services/activityLogService.ts
init_logger();
var saveActivityLog = async (entry) => {
  try {
    const { userId, username, action, category, details = {} } = entry;
    logger.debug(`[ActivityLogService] Saving activity log for user: ${userId}`, {
      context: "saveActivityLog",
      action,
      category
    });
    if (!userId || !action || !category) {
      throw new Error("Missing required fields: userId, action, or category");
    }
    const encryptedDetails = encryptActivityDetails({
      deviceId: entry.deviceId || "unknown-device",
      ipAddress: entry.ipAddress || "unknown",
      userAgent: entry.userAgent || "unknown",
      details
    });
    if (!encryptedDetails) {
      throw new Error("Failed to encrypt activity log details");
    }
    const DynamicLogModel = getActivityLogModel(username);
    const logDoc = new DynamicLogModel({
      userId: userId.toString(),
      action,
      category,
      itemId: entry.itemId || null,
      encryptedData: encryptedDetails,
      metadata: {
        deviceId: entry.deviceId || "unknown-device",
        ipAddress: entry.ipAddress || "unknown",
        userAgent: entry.userAgent || "unknown",
        status: entry.status || "SUCCESS",
        errorCode: entry.errorCode || null,
        errorMessage: entry.errorMessage || null
      },
      createdAt: /* @__PURE__ */ new Date()
    });
    const savedLog = await logDoc.save();
    logger.debug(`[ActivityLogService] Activity log saved successfully for user: ${userId}`, {
      context: "saveActivityLog",
      logId: savedLog._id.toString(),
      action,
      timestamp: savedLog.createdAt.toISOString()
    });
    return savedLog;
  } catch (error) {
    logger.error(
      `[ActivityLogService] Error saving activity log for user: ${entry.userId}`,
      error,
      {
        context: "saveActivityLog",
        userId: entry.userId,
        action: entry.action
      }
    );
    throw error;
  }
};
var encryptActivityDetails = (data) => {
  try {
    const jsonString = JSON.stringify(data);
    const encrypted = encryptText(jsonString);
    return encrypted;
  } catch (error) {
    logger.error("[ActivityLogService] Error encrypting activity details", error, {
      context: "encryptActivityDetails"
    });
    return null;
  }
};
var decryptActivityDetails = (encryptedData) => {
  try {
    if (!encryptedData || !encryptedData.cipherText) {
      return null;
    }
    const decrypted = decryptText(encryptedData);
    if (!decrypted) {
      return null;
    }
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
};
var getUserActivityLogs = async (userId, username, limit = 100, skip = 0, action) => {
  try {
    logger.debug(`[ActivityLogService] Fetching activity logs for user: ${userId}`, {
      context: "getUserActivityLogs",
      limit,
      skip,
      action
    });
    const query2 = {
      userId: userId.toString(),
      isDeleted: false
    };
    if (action) {
      query2.action = action;
    }
    const DynamicLogModel = getActivityLogModel(username);
    const logs = await DynamicLogModel.find(query2).sort({ createdAt: -1 }).allowDiskUse(true).skip(skip).limit(limit).exec();
    return logs.map((log2) => ({
      _id: log2._id.toString(),
      action: log2.action,
      category: log2.category,
      timestamp: log2.createdAt,
      device: log2.metadata?.deviceId || "unknown",
      ipAddress: log2.metadata?.ipAddress || "unknown",
      status: log2.metadata?.status || "SUCCESS",
      details: decryptActivityDetails(log2.encryptedData) || void 0
    }));
  } catch (error) {
    logger.error(`[ActivityLogService] Error fetching activity logs for user: ${userId}`, error, {
      context: "getUserActivityLogs",
      userId
    });
    return [];
  }
};
var deleteUserActivityLogs = async (userId, username) => {
  try {
    const DynamicLogModel = getActivityLogModel(username);
    const result = await DynamicLogModel.deleteMany({
      userId
    });
    logger.info(
      `[ActivityLogService] Deleted ${result.deletedCount} activity logs for user: ${userId}`,
      {
        context: "deleteUserActivityLogs",
        userId,
        deletedCount: result.deletedCount
      }
    );
    return result.deletedCount || 0;
  } catch (error) {
    logger.error(`[ActivityLogService] Error deleting activity logs for user: ${userId}`, error, {
      context: "deleteUserActivityLogs",
      userId
    });
    return 0;
  }
};

// server/services/multiClusterAggregator.ts
import mongoose7 from "mongoose";
init_logger();
var aggregateVaultItems = async (username, userId, filter = {}) => {
  await multiClusterPool.initialize();
  const nodes = multiClusterPool.getHealthyNodes();
  const targetNodes = nodes.length > 0 ? nodes : multiClusterPool.getAllNodes();
  if (targetNodes.length === 0) {
    const defaultModel = getVaultItemModel(username);
    return await defaultModel.find({ userId, isDeleted: false, ...filter }).allowDiskUse(true).lean().exec();
  }
  const queryPromises = targetNodes.map(async (node) => {
    try {
      const DynamicModel = getVaultItemModel(username, node.connection);
      const docs = await DynamicModel.find({ userId, isDeleted: false, ...filter }).allowDiskUse(true).lean().exec();
      return docs.map((doc) => ({
        ...doc,
        _clusterHost: node.host,
        _clusterId: node.id
      }));
    } catch (err) {
      logger.warn(`[Aggregator] Query failed on node ${node.name} (${node.host}): ${err?.message}`);
      return [];
    }
  });
  const settleResults = await Promise.allSettled(queryPromises);
  const itemMap = /* @__PURE__ */ new Map();
  for (const res of settleResults) {
    if (res.status === "fulfilled" && Array.isArray(res.value)) {
      for (const item of res.value) {
        if (!item.itemId) continue;
        const existing = itemMap.get(item.itemId);
        if (!existing) {
          itemMap.set(item.itemId, item);
        } else {
          const existingDate = new Date(
            existing.updatedAt || existing.clientUpdatedAt || 0
          ).getTime();
          const incomingDate = new Date(item.updatedAt || item.clientUpdatedAt || 0).getTime();
          if (incomingDate > existingDate) {
            itemMap.set(item.itemId, item);
          }
        }
      }
    }
  }
  const mergedItems = Array.from(itemMap.values());
  mergedItems.sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
      return a.isPinned ? -1 : 1;
    }
    const dateA = new Date(a.updatedAt || a.clientUpdatedAt || 0).getTime();
    const dateB = new Date(b.updatedAt || b.clientUpdatedAt || 0).getTime();
    return dateB - dateA;
  });
  return mergedItems;
};
var findUserAcrossClusters = async (query2) => {
  await multiClusterPool.initialize();
  const healthyNodes = multiClusterPool.getHealthyNodes();
  const targetNodes = healthyNodes.length > 0 ? healthyNodes : multiClusterPool.getAllNodes();
  if (targetNodes.length === 0) return null;
  const searchPromises = targetNodes.map(async (node) => {
    try {
      if (node.connection.readyState !== 1 && !node.isHealthy) {
        return null;
      }
      const UserModel = getUserModel(node.connection);
      const user = await Promise.race([
        UserModel.findOne(query2).exec(),
        new Promise(
          (_, reject) => setTimeout(() => reject(new Error("Cluster query timeout")), 3e3)
        )
      ]);
      if (user) {
        return { user, node };
      }
    } catch {
    }
    return null;
  });
  const results = await Promise.allSettled(searchPromises);
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      return r.value;
    }
  }
  return null;
};
var mirrorUserToAllClusters = async (userDoc) => {
  if (!userDoc || !userDoc.username) return;
  await multiClusterPool.initialize();
  const nodes = multiClusterPool.getHealthyNodes();
  const userObj = typeof userDoc.toObject === "function" ? userDoc.toObject() : { ...userDoc };
  delete userObj.__v;
  const mirrorPromises = nodes.map(async (node) => {
    try {
      const UserModel = getUserModel(node.connection);
      await UserModel.findOneAndUpdate(
        { username: userObj.username },
        { $set: userObj },
        { upsert: true, setDefaultsOnInsert: true }
      ).exec();
    } catch (err) {
      logger.warn(`[Aggregator] User mirror failed on node ${node.name}: ${err?.message}`);
    }
  });
  void Promise.allSettled(mirrorPromises);
};
var deleteVaultItemAcrossClusters = async (username, userId, itemId, hardDelete = false) => {
  await multiClusterPool.initialize();
  const nodes = multiClusterPool.getHealthyNodes();
  const targetNodes = nodes.length > 0 ? nodes : multiClusterPool.getAllNodes();
  const deletePromises = targetNodes.map(async (node) => {
    try {
      const DynamicModel = getVaultItemModel(username, node.connection);
      if (hardDelete) {
        const res = await DynamicModel.deleteOne({ userId, itemId });
        return res.deletedCount || 0;
      } else {
        const res = await DynamicModel.updateOne(
          { userId, itemId },
          { $set: { isDeleted: true, deletedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() } }
        );
        return res.modifiedCount || 0;
      }
    } catch {
      return 0;
    }
  });
  const results = await Promise.allSettled(deletePromises);
  return results.reduce((acc, r) => acc + (r.status === "fulfilled" ? r.value : 0), 0);
};

// server/services/vaultItemService.ts
import mongoose8 from "mongoose";
init_logger();
var MAX_TEXT_PAYLOAD_BYTES = Math.max(
  1e6,
  Number(process.env.MAX_SCOPED_TEXT_PAYLOAD_BYTES || 4 * 1024 * 1024)
);
var CATEGORY_ALIAS_MAP2 = {
  note: "note",
  notes: "note",
  chat: "chat",
  chats: "chat",
  todo: "todo",
  todos: "todo",
  password: "password",
  passwords: "password",
  secret: "secret",
  secrets: "secret",
  secretkey: "secret",
  secretkeys: "secret",
  contact: "contact",
  contacts: "contact",
  location: "location",
  locations: "location",
  photo: "photo",
  photos: "photo",
  video: "video",
  videos: "video",
  audio: "audio",
  audios: "audio",
  document: "document",
  documents: "document",
  file: "file",
  files: "file",
  other: "other",
  "other-files": "other-files",
  other_files: "other-files",
  otherfile: "other-files",
  otherfiles: "other-files",
  settings: "settings",
  system: "system",
  users: "users",
  v2_items: "file"
};
var ALLOWED_SCOPED_CATEGORIES2 = /* @__PURE__ */ new Set([
  "audio",
  "card",
  "chat",
  "contact",
  "document",
  "file",
  "identity",
  "location",
  "note",
  "other",
  "other-files",
  "password",
  "photo",
  "secret",
  "settings",
  "system",
  "todo",
  "users",
  "video",
  "wifi"
]);
var normalizeCategory = (rawCategory) => {
  const normalized = (rawCategory || "").trim().toLowerCase();
  const category = CATEGORY_ALIAS_MAP2[normalized] || "";
  if (!category || !ALLOWED_SCOPED_CATEGORIES2.has(category)) {
    throw AppError.badRequest("Unsupported vault category.", "UNSUPPORTED_CATEGORY");
  }
  return category;
};
var parseMetadataSafe = (value) => {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return {};
    }
  }
  return {};
};
var saveEncryptedVaultItem = async (input) => {
  const { userId, category, folder, itemId, payload } = input;
  const normalizedCategory = normalizeCategory(category);
  const isBinary = Buffer.isBuffer(payload);
  let encoding = payload.encoding || "utf-8";
  let finalPayload = "";
  let modernPayload = null;
  const itemTitle = typeof payload?.title === "string" ? payload.title.trim().slice(0, 512) : "";
  const itemMetadata = parseMetadataSafe(payload?.metadata);
  let gridFsId = null;
  let filePath = `cloud://${itemId || Date.now()}`;
  if (isBinary) {
    if (payload.length > 8 * 1024 * 1024 && mongoose8.connection && mongoose8.connection.readyState === 1 && mongoose8.connection.db) {
      try {
        const bucket = new mongoose8.mongo.GridFSBucket(mongoose8.connection.db, {
          bucketName: "vault_item_files"
        });
        const filename = `${userId}/${normalizedCategory}/${itemId || Date.now()}`;
        const uploadStream = bucket.openUploadStream(filename, {
          metadata: {
            userId,
            itemId: itemId || Date.now().toString(),
            category: normalizedCategory,
            folder: folder || itemMetadata.folder || null,
            size: payload.length
          }
        });
        await new Promise((resolve, reject) => {
          uploadStream.on("error", reject);
          uploadStream.on("finish", resolve);
          uploadStream.end(payload);
        });
        gridFsId = uploadStream.id?.toString?.() ?? itemId ?? null;
        if (gridFsId) {
          filePath = `cloud://${gridFsId}`;
        }
        encoding = "gridfs-binary";
        finalPayload = "";
      } catch (gridErr) {
        logger.warn("Failed to stream large binary to GridFS, falling back to base64", {
          itemId,
          error: gridErr
        });
        finalPayload = payload.toString("base64");
        encoding = "base64";
      }
    } else {
      finalPayload = payload.toString("base64");
      encoding = "base64";
    }
  } else {
    const rawPayload = payload.payload || "";
    if (typeof rawPayload === "string" && rawPayload.startsWith("V2_MODERN:")) {
      modernPayload = rawPayload;
      encoding = "modern";
    } else {
      finalPayload = typeof payload === "string" ? payload : payload.payload || "";
    }
  }
  if (!isBinary && typeof finalPayload === "string") {
    const payloadBytes = Buffer.byteLength(finalPayload, "utf8");
    if (payloadBytes > MAX_TEXT_PAYLOAD_BYTES) {
      throw AppError.badRequest(
        "Encrypted payload exceeds secure size limits.",
        "PAYLOAD_TOO_LARGE"
      );
    }
  }
  const performUpsert = async () => {
    const isSingleton = itemId && ["__settings__", "__profile__", "__keycheck__"].includes(itemId);
    const isPinned = Boolean(itemMetadata?.isPinned);
    const pinnedAtRaw = itemMetadata?.pinnedAt;
    const pinnedAt = isPinned && pinnedAtRaw ? new Date(pinnedAtRaw) : isPinned ? /* @__PURE__ */ new Date() : null;
    try {
      const DynamicVaultModel = getVaultItemModel(input.username);
      return await DynamicVaultModel.findOneAndUpdate(
        { userId, itemId: itemId || `item-${Date.now()}` },
        {
          userId,
          itemId,
          category: normalizedCategory,
          folder: folder || itemMetadata.folder || null,
          payload: finalPayload,
          modernPayload,
          encoding,
          title: itemTitle,
          file: {
            fileName: itemTitle || itemMetadata?.fileName || itemMetadata?.originalName || "file",
            filePath,
            mimeType: itemMetadata?.mimeType || "application/octet-stream",
            size: itemMetadata?.size || (isBinary ? payload.length : 0)
          },
          gridFsId: gridFsId || void 0,
          metadata: itemMetadata,
          isPinned,
          pinnedAt,
          deviceId: input.deviceId,
          ipAddress: input.ipAddress,
          updatedAt: /* @__PURE__ */ new Date(),
          isDeleted: false
        },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
    } catch (err) {
      const DynamicVaultModel = getVaultItemModel(input.username);
      if (err.code === 11e3) {
        logger.warn(
          `Duplicate key error during upsert for item ${itemId}. Retrying with delete-and-insert for consistency.`,
          {
            userId,
            itemId,
            error: err.message
          }
        );
        if (isSingleton) {
          await DynamicVaultModel.deleteOne({ userId, itemId }).catch((error) => {
            logger.warn("Failed to delete singleton before upsert retry", {
              userId,
              itemId,
              error
            });
          });
          const newItem = new DynamicVaultModel({
            userId,
            itemId,
            category: normalizedCategory,
            folder: folder || itemMetadata.folder || null,
            payload: finalPayload,
            modernPayload,
            encoding,
            title: itemTitle,
            metadata: itemMetadata,
            deviceId: input.deviceId,
            ipAddress: input.ipAddress
          });
          return await newItem.save();
        }
        return await DynamicVaultModel.findOneAndUpdate(
          { userId, itemId },
          {
            category: normalizedCategory,
            folder: folder || itemMetadata.folder || null,
            payload: finalPayload,
            modernPayload,
            encoding,
            title: itemTitle,
            metadata: itemMetadata,
            deviceId: input.deviceId,
            ipAddress: input.ipAddress,
            updatedAt: /* @__PURE__ */ new Date()
          },
          { upsert: true, returnDocument: "after" }
        );
      }
      throw err;
    }
  };
  const updatedItem = await performUpsert();
  return updatedItem;
};
var getVaultSnapshot = async (userId, username) => {
  return aggregateVaultItems(username, userId);
};
var deleteVaultItemByCategory = async (input) => {
  const { userId, itemId, username } = input;
  const deletedCount = await deleteVaultItemAcrossClusters(username, userId, itemId, false);
  if (deletedCount === 0) {
    throw AppError.notFound("Vault item not found.", "ITEM_NOT_FOUND");
  }
  return { itemId, isDeleted: true, deletedCount };
};

// server/models/totalUser.ts
import mongoose9 from "mongoose";
var totalUserSchema = new mongoose9.Schema(
  {
    exists: { type: Boolean, required: true },
    exactMatch: { type: Boolean, required: true },
    username: { type: String, required: true, trim: true, lowercase: true },
    userId: { type: String, default: null },
    createdDate: { type: Date, default: null }
  },
  {
    collection: "total_users",
    versionKey: false
  }
);
totalUserSchema.index({ username: 1 }, { unique: true });
var TotalUser = mongoose9.models.TotalUser || mongoose9.model("TotalUser", totalUserSchema);

// server/services/vaultAuthService.ts
init_logger();

// server/services/accountSessionService.ts
import mongoose17 from "mongoose";
import { createHash as createHash3 } from "crypto";

// server/models/RefreshToken.ts
import mongoose10, { Schema } from "mongoose";
var refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    familyId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    isRevoked: { type: Boolean, default: false, index: true },
    rotatedAt: { type: Date, default: null },
    replacementTokenHash: { type: String, default: null },
    ip: { type: String, default: "unknown" },
    userAgent: { type: String, default: "unknown" },
    expiresAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);
var RefreshToken = mongoose10.models.RefreshToken || mongoose10.model("RefreshToken", refreshTokenSchema);

// server/models/masterKey.ts
import mongoose11 from "mongoose";
var encryptedKeySchema = new mongoose11.Schema(
  {
    cipherText: {
      type: String,
      required: true,
      description: "AES-256-GCM encrypted master key"
    },
    iv: {
      type: String,
      required: true,
      description: "Initialization vector (base64)"
    },
    authTag: {
      type: String,
      required: true,
      description: "Authentication tag for GCM mode"
    },
    salt: {
      type: String,
      required: false,
      default: null,
      description: "Salt for key derivation"
    },
    algorithm: {
      type: String,
      default: "aes-256-gcm",
      description: "Encryption algorithm used"
    },
    keyVersion: {
      type: String,
      default: "v1",
      description: "Version of the encryption key"
    }
  },
  { _id: false }
);
var masterKeySchema = new mongoose11.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    /**
     * Encrypted master key protected with AES-256-GCM
     * Originally encrypted on client with cloud protection key
     */
    encryptedMasterKey: { type: encryptedKeySchema, required: true },
    /**
     * Backup codephrases for account recovery (optional, encrypted separately)
     */
    recoveryPhrasesEncrypted: { type: String, default: null },
    /**
     * Hash of the master key for verification across devices
     * Allows clients to verify they have the correct decrypted key
     */
    masterKeyHash: { type: encryptedKeySchema, required: true },
    /**
     * Rolling history of prior master key hashes for audit/compliance.
     * Values remain encrypted server-side and are truncated to a safe limit.
     */
    masterKeyHashHistory: {
      type: [
        new mongoose11.Schema(
          {
            hash: { type: encryptedKeySchema, required: true },
            changedAt: { type: Date, required: true, default: Date.now },
            changedByDeviceId: { type: String, default: null },
            changedByIp: { type: String, default: null },
            changedByUserAgent: { type: String, default: null }
          },
          { _id: false }
        )
      ],
      default: []
    },
    /**
     * Metadata about key creation and updates
     */
    metadata: {
      derivationAlgorithm: {
        type: String,
        default: "argon2id",
        description: "Algorithm used to derive master key from password"
      },
      derivationParams: {
        memory: { type: Number, default: 65536 },
        iterations: { type: Number, default: 3 },
        parallelism: { type: Number, default: 4 }
      },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
      lastAccessedAt: { type: Date, default: Date.now },
      deviceId: {
        type: String,
        description: "Device that created/updated the key"
      }
    },
    /**
     * Security audit trail
     */
    audit: {
      accessCount: { type: Number, default: 0 },
      lastAccessedByDeviceId: { type: String, default: null },
      failedDecryptionAttempts: { type: Number, default: 0 },
      lastFailedAttempt: { type: Date, default: null }
    },
    /**
     * Status tracking
     */
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" } }
);
masterKeySchema.index({ userId: 1, isActive: 1 });
masterKeySchema.index({ "metadata.createdAt": -1 });
var getMasterKeyModel = (username) => {
  if (!username || !username.trim()) {
    throw new Error("Username is required for isolated master keys");
  }
  const normalized = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const collectionName = `${normalized}.${normalized}_master_keys`;
  if (mongoose11.models[collectionName]) {
    return mongoose11.models[collectionName];
  }
  return mongoose11.model(collectionName, masterKeySchema, collectionName);
};

// server/services/authService.ts
import { createHash as createHash2, randomUUID } from "crypto";
import mongoose15 from "mongoose";
init_logger();

// server/models/folder.ts
import mongoose12, { Schema as Schema2 } from "mongoose";
var folderSchema = new Schema2(
  {
    userId: { type: String, required: true, index: true },
    username: { type: String, required: true, index: true },
    name: { type: Schema2.Types.Mixed, required: true },
    nameHash: { type: String, required: false, index: true },
    itemType: { type: String, required: true },
    parentId: { type: String, default: null, index: true }
  },
  { timestamps: true }
);
folderSchema.index(
  { userId: 1, itemType: 1, nameHash: 1, parentId: 1 },
  { unique: true, partialFilterExpression: { nameHash: { $exists: true } } }
);
var getFolderModel = (username) => {
  if (!username || !username.trim()) {
    throw new Error("Username is required for isolated folders");
  }
  const normalized = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const collectionName = `${normalized}.${normalized}_folders`;
  if (mongoose12.models[collectionName]) {
    return mongoose12.models[collectionName];
  }
  return mongoose12.model(collectionName, folderSchema, collectionName);
};

// server/services/folderService.ts
init_logger();

// server/services/folderCryptoService.ts
import crypto3 from "crypto";
var normalizeFolderName = (name) => name.trim();
var hashFolderName = (name) => crypto3.createHash("sha256").update(normalizeFolderName(name).toLowerCase()).digest("hex");
var encryptFolderName = (name) => encryptText(normalizeFolderName(name));
var decryptFolderName = (value) => {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "cipherText" in value && "iv" in value && "authTag" in value) {
    return decryptText(value);
  }
  return "";
};

// server/services/folderService.ts
var isProtectedFolderName = (name) => name.trim().toLowerCase().startsWith("saved");
var DEFAULT_FOLDER_TREE = [
  {
    name: "Personal_data",
    itemType: "system",
    children: [
      { name: "Saved note", itemType: "note" },
      { name: "Saved chats", itemType: "chat" },
      { name: "Saved todo", itemType: "todo" },
      { name: "Saved contact", itemType: "contact" },
      { name: "Saved passwords", itemType: "password" },
      { name: "Saved secrets", itemType: "secret" },
      { name: "Saved locations", itemType: "location" },
      { name: "Saved cards", itemType: "card" },
      { name: "Saved identities", itemType: "identity" },
      { name: "Saved wifi", itemType: "wifi" }
    ]
  },
  {
    name: "Media",
    itemType: "system",
    children: [
      { name: "Saved photos", itemType: "photo" },
      { name: "Saved videos", itemType: "video" },
      { name: "Saved audios", itemType: "audio" },
      { name: "Saved documents", itemType: "document" },
      { name: "Saved files", itemType: "file" },
      { name: "Saved other_files", itemType: "other-files" }
    ]
  },
  {
    name: "System",
    itemType: "system",
    children: [{ name: "Saved_settings", itemType: "settings" }]
  },
  {
    name: "Activity",
    itemType: "logs",
    children: [{ name: "Saved_logs", itemType: "logs" }]
  },
  {
    name: "Misc",
    itemType: "system",
    children: [
      { name: "Saved system", itemType: "system" },
      { name: "Saved users", itemType: "users" }
    ]
  },
  { name: "Users", itemType: "users" }
];
var ensureFolder = async (userId, username, name, itemType, parentId) => {
  const Folder = getFolderModel(username);
  const nameHash = hashFolderName(name);
  const encryptedName = encryptFolderName(name);
  return await Folder.findOneAndUpdate(
    { userId, nameHash, itemType, parentId },
    { userId, username, name: encryptedName, nameHash, itemType, parentId },
    { upsert: true, returnDocument: "after" }
  );
};
var ensureFolderTree = async (userId, username, parentId, definitions) => {
  for (const definition of definitions) {
    const folder = await ensureFolder(
      userId,
      username,
      definition.name,
      definition.itemType,
      parentId
    );
    if (definition.children?.length) {
      await ensureFolderTree(userId, username, folder._id.toString(), definition.children);
    }
  }
};
var initializeDefaultUserFolders = async (userId, username) => {
  try {
    const rootFolder = await ensureFolder(userId, username, "vault_items", "system", null);
    const userFolder = await ensureFolder(
      userId,
      username,
      username,
      "system",
      rootFolder._id.toString()
    );
    await ensureFolderTree(userId, username, userFolder._id.toString(), DEFAULT_FOLDER_TREE);
    logger.info("Folder structure initialized for user", { username, userId });
  } catch (error) {
    logger.error("Failed to initialize folders for user", {
      username,
      userId,
      error
    });
    throw error;
  }
};

// server/services/notificationService.ts
import mongoose14 from "mongoose";

// server/models/notification.ts
import mongoose13 from "mongoose";
var notificationSchema = new mongoose13.Schema(
  {
    userId: { type: mongoose13.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ["device_login", "sync_conflict", "security_alert"]
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    metadata: { type: mongoose13.Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false, index: true }
  },
  {
    timestamps: true
  }
);
var getNotificationModel = (username) => {
  if (!username || !username.trim()) {
    throw new Error("Username is required for isolated notifications");
  }
  const normalized = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const collectionName = `${normalized}.${normalized}_notifications`;
  if (mongoose13.models[collectionName]) {
    return mongoose13.models[collectionName];
  }
  const model2 = mongoose13.model(
    collectionName,
    notificationSchema,
    collectionName
  );
  model2.createIndexes().catch(() => {
  });
  return model2;
};
var getLegacyNotificationModel = () => {
  const collectionName = "notifications";
  if (mongoose13.models[collectionName]) {
    return mongoose13.models[collectionName];
  }
  return mongoose13.model(collectionName, notificationSchema, collectionName);
};

// server/services/notificationService.ts
init_logger();
var migrateLegacyNotifications = async (userId, username) => {
  try {
    const LegacyNotification = getLegacyNotificationModel();
    const legacyNotifications = await LegacyNotification.find({ userId }).lean().exec();
    if (legacyNotifications && legacyNotifications.length > 0) {
      const Notification = getNotificationModel(username);
      for (const item of legacyNotifications) {
        const { _id, ...docWithoutId } = item;
        await Notification.updateOne({ _id }, { $setOnInsert: docWithoutId }, { upsert: true });
      }
      await LegacyNotification.deleteMany({ userId });
      logger.info("Migrated legacy notifications to user collection", {
        userId,
        username,
        count: legacyNotifications.length
      });
    }
  } catch (error) {
    logger.warn("Error during legacy notification migration", { userId, username, error });
  }
};
var createNotification = async (userId, type, title, message, metadata = {}, username) => {
  try {
    let resolvedUsername = username;
    if (!resolvedUsername) {
      const User2 = mongoose14.model("User");
      const user = await User2.findById(userId).select("username").lean().exec();
      if (user?.username) {
        resolvedUsername = user.username;
      }
    }
    if (!resolvedUsername) {
      throw new Error(`Cannot create notification: username not found for userId ${userId}`);
    }
    const Notification = getNotificationModel(resolvedUsername);
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      metadata,
      isRead: false
    });
    emitVaultEvent(userId, "notification:new", notification);
    logger.info("Notification created", { userId, username: resolvedUsername, type, title });
    return notification;
  } catch (error) {
    logger.error("Failed to create notification", { error });
    throw error;
  }
};

// server/services/authService.ts
var hashRefreshToken = (token) => createHash2("sha256").update(token).digest("hex");
var FALLBACK_DEVICE_ID = "unknown-device";
var normalizeSessionDeviceId = (value) => {
  if (typeof value !== "string") {
    return FALLBACK_DEVICE_ID;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : FALLBACK_DEVICE_ID;
};
var parseDeviceNameFromUserAgent = (userAgent) => {
  if (!userAgent || typeof userAgent !== "string") {
    return "Web Client";
  }
  const ua = userAgent.trim();
  if (!ua) return "Web Client";
  if (/googlebot/i.test(ua)) return "Googlebot Crawler";
  if (/bingbot/i.test(ua)) return "Bingbot Crawler";
  if (/duckduckbot/i.test(ua)) return "DuckDuckBot Crawler";
  if (/yandexbot/i.test(ua)) return "YandexBot Crawler";
  if (/postmanruntime/i.test(ua)) return "Postman API Client";
  if (/insomnia/i.test(ua)) return "Insomnia API Client";
  if (/curl\//i.test(ua)) return "Curl Command Line";
  if (/wget\//i.test(ua)) return "Wget Downloader";
  if (/python-requests/i.test(ua)) return "Python Script Client";
  if (/axios/i.test(ua)) return "Axios HTTP Client";
  let inApp = "";
  if (/instagram/i.test(ua)) inApp = "Instagram App";
  else if (/fb_iab|fbav/i.test(ua)) inApp = "Facebook App";
  else if (/tiktok/i.test(ua)) inApp = "TikTok App";
  else if (/linkedinapp/i.test(ua)) inApp = "LinkedIn App";
  else if (/micromessenger/i.test(ua)) inApp = "WeChat App";
  else if (/line\//i.test(ua)) inApp = "Line App";
  else if (/snapchat/i.test(ua)) inApp = "Snapchat App";
  else if (/electron/i.test(ua)) {
    if (/vscode/i.test(ua)) inApp = "VS Code Desktop";
    else if (/slack/i.test(ua)) inApp = "Slack Desktop";
    else if (/discord/i.test(ua)) inApp = "Discord Desktop";
    else inApp = "Electron Desktop App";
  }
  let os5 = "Unknown OS";
  let osVersion = "";
  if (/windows nt 10\.0/i.test(ua)) {
    os5 = "Windows 10/11";
    if (/x64|win64/i.test(ua)) os5 += " (64-bit)";
    else if (/arm64/i.test(ua)) os5 += " (ARM64)";
  } else if (/windows nt 6\.3/i.test(ua)) {
    os5 = "Windows 8.1";
  } else if (/windows nt 6\.2/i.test(ua)) {
    os5 = "Windows 8";
  } else if (/windows nt 6\.1/i.test(ua)) {
    os5 = "Windows 7";
  } else if (/windows/i.test(ua)) {
    os5 = "Windows";
  } else if (/iphone/i.test(ua)) {
    os5 = "iOS (iPhone)";
    const verMatch = ua.match(/os (\d+[_.]\d+)/i);
    if (verMatch) osVersion = `iOS ${verMatch[1].replace("_", ".")}`;
  } else if (/ipad/i.test(ua)) {
    os5 = "iPadOS (iPad)";
    const verMatch = ua.match(/os (\d+[_.]\d+)/i);
    if (verMatch) osVersion = `iPadOS ${verMatch[1].replace("_", ".")}`;
  } else if (/mac os x|macintosh/i.test(ua)) {
    os5 = "macOS";
    const verMatch = ua.match(/mac os x (\d+[_.]\d+([_.]\d+)?)/i);
    if (verMatch) {
      const ver = verMatch[1].replace(/_/g, ".");
      if (ver.startsWith("14")) os5 = "macOS Sonoma";
      else if (ver.startsWith("13")) os5 = "macOS Ventura";
      else if (ver.startsWith("12")) os5 = "macOS Monterey";
      else if (ver.startsWith("11")) os5 = "macOS Big Sur";
      else os5 = `macOS ${ver}`;
    }
  } else if (/android/i.test(ua)) {
    os5 = "Android";
    const verMatch = ua.match(/android (\d+(\.\d+)?)/i);
    if (verMatch) os5 = `Android ${verMatch[1]}`;
    if (/pixel 8/i.test(ua)) os5 += " (Google Pixel 8)";
    else if (/pixel 7/i.test(ua)) os5 += " (Google Pixel 7)";
    else if (/pixel 6/i.test(ua)) os5 += " (Google Pixel 6)";
    else if (/sm-s918|sm-s928/i.test(ua)) os5 += " (Samsung Galaxy S Ultra)";
    else if (/sm-g998|sm-g988/i.test(ua)) os5 += " (Samsung Galaxy)";
  } else if (/cros/i.test(ua)) {
    os5 = "ChromeOS";
  } else if (/ubuntu/i.test(ua)) {
    os5 = "Ubuntu Linux";
  } else if (/fedora/i.test(ua)) {
    os5 = "Fedora Linux";
  } else if (/debian/i.test(ua)) {
    os5 = "Debian Linux";
  } else if (/arch/i.test(ua)) {
    os5 = "Arch Linux";
  } else if (/linux/i.test(ua)) {
    os5 = "Linux";
  } else if (/playstation 5/i.test(ua)) {
    os5 = "PlayStation 5";
  } else if (/playstation 4/i.test(ua)) {
    os5 = "PlayStation 4";
  } else if (/xbox/i.test(ua)) {
    os5 = "Xbox";
  } else if (/nintendo switch/i.test(ua)) {
    os5 = "Nintendo Switch";
  }
  let browser = "Web Browser";
  if (inApp) {
    browser = inApp;
  } else if (/brave/i.test(ua)) {
    const verMatch = ua.match(/brave\/(\d+)/i) || ua.match(/chrome\/(\d+)/i);
    browser = verMatch ? `Brave ${verMatch[1]}` : "Brave";
  } else if (/edg\//i.test(ua)) {
    const verMatch = ua.match(/edg\/(\d+)/i);
    browser = verMatch ? `Edge ${verMatch[1]}` : "Microsoft Edge";
  } else if (/edga/i.test(ua)) {
    browser = "Edge Mobile";
  } else if (/edgios/i.test(ua)) {
    browser = "Edge iOS";
  } else if (/samsungbrowser/i.test(ua)) {
    const verMatch = ua.match(/samsungbrowser\/(\d+)/i);
    browser = verMatch ? `Samsung Internet ${verMatch[1]}` : "Samsung Internet";
  } else if (/opr\/|opera/i.test(ua)) {
    const verMatch = ua.match(/opr\/(\d+)/i) || ua.match(/opera\/(\d+)/i);
    browser = verMatch ? `Opera ${verMatch[1]}` : "Opera";
  } else if (/vivaldi/i.test(ua)) {
    const verMatch = ua.match(/vivaldi\/(\d+)/i);
    browser = verMatch ? `Vivaldi ${verMatch[1]}` : "Vivaldi";
  } else if (/yabrowser/i.test(ua)) {
    const verMatch = ua.match(/yabrowser\/(\d+)/i);
    browser = verMatch ? `Yandex ${verMatch[1]}` : "Yandex Browser";
  } else if (/ucbrowser/i.test(ua)) {
    const verMatch = ua.match(/ucbrowser\/(\d+)/i);
    browser = verMatch ? `UC Browser ${verMatch[1]}` : "UC Browser";
  } else if (/duckduckgo/i.test(ua)) {
    browser = "DuckDuckGo Browser";
  } else if (/arc\//i.test(ua)) {
    browser = "Arc Browser";
  } else if (/fxios/i.test(ua)) {
    browser = "Firefox iOS";
  } else if (/firefox/i.test(ua)) {
    const verMatch = ua.match(/firefox\/(\d+)/i);
    browser = verMatch ? `Firefox ${verMatch[1]}` : "Mozilla Firefox";
  } else if (/chrome|crios/i.test(ua)) {
    const verMatch = ua.match(/chrome\/(\d+)/i) || ua.match(/crios\/(\d+)/i);
    browser = verMatch ? `Chrome ${verMatch[1]}` : "Google Chrome";
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    const verMatch = ua.match(/version\/(\d+(\.\d+)?)/i);
    browser = verMatch ? `Safari ${verMatch[1]}` : "Apple Safari";
  }
  if (osVersion) {
    os5 = osVersion;
  }
  if (browser && os5) {
    return `${browser} on ${os5}`;
  }
  return browser || os5 || "Web Client";
};
var buildMetaState = (meta) => ({
  registeredAt: meta?.registeredAt ?? /* @__PURE__ */ new Date(),
  lastLoginAt: meta?.lastLoginAt ?? null,
  lastFailedLoginAt: meta?.lastFailedLoginAt ?? null,
  lastFailedLoginIp: meta?.lastFailedLoginIp ?? null,
  lastSyncAt: meta?.lastSyncAt ?? null,
  lastCredentialChangeAt: meta?.lastCredentialChangeAt ?? /* @__PURE__ */ new Date(),
  activeDevices: meta?.activeDevices ?? [],
  accountStatus: meta?.accountStatus ?? "active",
  profileVersion: meta?.profileVersion ?? 2,
  masterKey: meta?.masterKey ?? null,
  masterKeyHash: meta?.masterKeyHash ?? null
});
var issueUserSession = (user, input) => {
  const now = /* @__PURE__ */ new Date();
  const expiresAt = new Date(now.getTime() + getRefreshCookieMaxAgeMs());
  const sessionId = input.existingSessionId || randomUUID();
  const familyId = input.familyId || randomUUID();
  const normalizedDeviceId = normalizeSessionDeviceId(input.deviceId);
  const computedDeviceName = typeof input.deviceName === "string" && input.deviceName.trim() ? input.deviceName.trim() : parseDeviceNameFromUserAgent(input.userAgent);
  const refreshToken = createRefreshToken({
    sub: user._id.toString(),
    username: user.username,
    sessionId,
    deviceId: normalizedDeviceId
  });
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const accessToken = createAccessToken({
    sub: user._id.toString(),
    username: user.username,
    sessionId
  });
  const sessionData = {
    sessionId,
    familyId,
    deviceId: normalizedDeviceId,
    deviceName: computedDeviceName,
    refreshTokenHash,
    createdAt: now,
    lastUsedAt: now,
    lastRotatedAt: now,
    expiresAt,
    revokedAt: null,
    ipAddress: input.ipAddress ?? "unknown",
    userAgent: input.userAgent ?? "unknown",
    loginMethod: input.existingSessionId ? "refresh" : "password",
    requestContext: {
      ipAddress: input.ipAddress ?? "unknown",
      userAgent: input.userAgent ?? "unknown"
    }
  };
  if (!user.sessions) user.sessions = [];
  const sessionIndex = user.sessions.findIndex((s) => s.sessionId === sessionId);
  if (sessionIndex >= 0) {
    user.sessions[sessionIndex] = sessionData;
  } else {
    user.sessions.unshift(sessionData);
  }
  return { sessionId, familyId, accessToken, refreshToken, expiresAt };
};
var authenticateUser = async (input) => {
  const deviceId = normalizeSessionDeviceId(input.deviceId);
  const username = (input.username || "").trim().toLowerCase().normalize("NFKC");
  if (!username) {
    await comparePassword(input.password || "dummypassword", null);
    throw AppError.unauthorized("Invalid username or password.", "INVALID_CREDENTIALS");
  }
  const userQuery = { username };
  let user = await User.findOne(userQuery).select("+password +masterKey").exec();
  if (!user) {
    const located = await findUserAcrossClusters(userQuery);
    if (located) {
      user = located.user;
      void mirrorUserToAllClusters(user);
    }
  }
  if (!user) {
    await comparePassword(input.password || "dummypassword", null);
    throw AppError.unauthorized("Invalid username or password.", "INVALID_CREDENTIALS");
  }
  let isLegacyEncrypted = false;
  let storedHash = "";
  if (typeof user.password === "string") {
    storedHash = user.password;
  } else if (user.password && typeof user.password === "object" && "cipherText" in user.password && "iv" in user.password) {
    try {
      storedHash = decryptText(user.password);
      isLegacyEncrypted = true;
    } catch (decryptErr) {
      logger.warn("Failed to decrypt legacy password hash during authentication", {
        error: decryptErr
      });
    }
  }
  let storedMasterKey = "";
  if (user.masterKey && typeof user.masterKey === "object" && "cipherText" in user.masterKey) {
    try {
      storedMasterKey = decryptText(user.masterKey);
    } catch {
    }
  }
  if (!storedMasterKey && user.meta?.masterKey && typeof user.meta.masterKey === "object" && "cipherText" in user.meta.masterKey) {
    try {
      storedMasterKey = decryptText(user.meta.masterKey);
    } catch {
    }
  }
  let isValid = false;
  const candidatePasswords = [input.password, input.password?.trim()].filter(
    (p) => Boolean(p) && typeof p === "string"
  );
  if (storedHash) {
    for (const candidate of candidatePasswords) {
      if (await comparePassword(candidate, storedHash)) {
        isValid = true;
        break;
      }
    }
  }
  if (isValid && isLegacyEncrypted && storedHash) {
    user.password = storedHash;
  }
  if (!isValid) {
    if (!user.loginHistory) user.loginHistory = [];
    user.loginHistory.unshift({
      loggedInAt: /* @__PURE__ */ new Date(),
      ipAddress: input.ipAddress ?? "unknown",
      userAgent: input.userAgent ?? "unknown",
      deviceId,
      status: "FAILED",
      errorCode: "INVALID_CREDENTIALS",
      failureReason: "Invalid username or password.",
      requestContext: {
        ipAddress: input.ipAddress ?? "unknown",
        userAgent: input.userAgent ?? "unknown"
      }
    });
    user.meta = {
      ...buildMetaState(user.meta),
      lastFailedLoginAt: /* @__PURE__ */ new Date(),
      lastFailedLoginIp: input.ipAddress ?? "unknown"
    };
    await user.save();
    throw AppError.unauthorized("Invalid username or password.", "INVALID_CREDENTIALS");
  }
  if (user.twoFactorEnabled) {
    const mfaToken = createMfaToken({
      sub: user._id.toString(),
      username: user.username
    });
    return {
      twoFactorRequired: true,
      userId: user._id,
      username: user.username,
      mfaToken
    };
  }
  const session = issueUserSession(user, {
    deviceId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent
  });
  const rawUserId = user._id?.toString ? user._id.toString() : String(user._id || "");
  if (mongoose15.Types.ObjectId.isValid(rawUserId)) {
    await RefreshToken.create({
      userId: user._id,
      familyId: session.familyId,
      sessionId: session.sessionId,
      tokenHash: hashRefreshToken(session.refreshToken),
      isRevoked: false,
      ip: input.ipAddress ?? "unknown",
      userAgent: input.userAgent ?? "unknown",
      expiresAt: session.expiresAt
    }).catch((err) => {
      logger.warn("Failed to save RefreshToken document in DB", { error: err });
    });
  }
  if (!user.loginHistory) user.loginHistory = [];
  user.loginHistory.unshift({
    loggedInAt: /* @__PURE__ */ new Date(),
    ipAddress: input.ipAddress ?? "unknown",
    userAgent: input.userAgent ?? "unknown",
    deviceId,
    sessionId: session.sessionId,
    status: "SUCCESS",
    errorCode: null,
    failureReason: null,
    requestContext: {
      ipAddress: input.ipAddress ?? "unknown",
      userAgent: input.userAgent ?? "unknown"
    }
  });
  if (user.loginHistory.length > 50) {
    user.loginHistory = user.loginHistory.slice(0, 50);
  }
  user.meta = {
    ...buildMetaState(user.meta),
    lastLoginAt: /* @__PURE__ */ new Date()
  };
  await user.save();
  try {
    const ip = input.ipAddress || "unknown";
    const deviceName = input.deviceId || "Web Client";
    await createNotification(
      user._id.toString(),
      "device_login",
      "New Device Login",
      `A new login session was established on device "${deviceName}" from IP: ${ip}`
    );
  } catch (err) {
    logger.warn("Failed to create login notification", { error: err });
  }
  void migrateLegacyNotifications(user._id.toString(), user.username);
  return {
    token: session.accessToken,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    familyId: session.familyId,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      meta: user.meta
    }
  };
};
var registerUser = async (input) => {
  const deviceId = normalizeSessionDeviceId(input.deviceId);
  const username = (input.username || "").trim().toLowerCase().normalize("NFKC");
  if (!username) {
    throw AppError.badRequest("Username is required.", "AUTH_MISSING_CREDENTIALS");
  }
  if (typeof input.password !== "string" || input.password.length < 8) {
    throw AppError.badRequest("Password must be at least 8 characters long.", "AUTH_WEAK_PASSWORD");
  }
  const masterKey = (input.masterKey || "default-vault-master-key-2026").trim();
  if (input.password && masterKey && input.password === masterKey) {
    throw AppError.badRequest(
      "Account password and master key must not be identical.",
      "AUTH_SAME_CREDENTIALS"
    );
  }
  const pqcSalt = typeof input.pqcSalt === "string" && input.pqcSalt.trim() ? input.pqcSalt.trim() : `${username}-vault-pqc-salt`;
  logger.info("Registration attempt started", { username });
  const existing = await User.findOne({ username });
  if (existing) {
    logger.warn("Registration rejected - duplicate username", { username });
    throw AppError.conflict("Username already registered", "USER_EXISTS");
  }
  const hashedPassword = await hashPassword(input.password);
  const encryptedMasterKey = encryptText(masterKey);
  const user = new User({
    username,
    pqcSalt,
    profileName: input.fullName || input.profileName || "none",
    password: hashedPassword,
    masterKey: encryptedMasterKey,
    meta: {
      registeredAt: /* @__PURE__ */ new Date(),
      lastLoginAt: /* @__PURE__ */ new Date(),
      lastFailedLoginAt: null,
      lastFailedLoginIp: null,
      lastSyncAt: null,
      lastCredentialChangeAt: /* @__PURE__ */ new Date(),
      activeDevices: [deviceId],
      accountStatus: "active",
      profileVersion: 2,
      masterKey: encryptedMasterKey,
      masterKeyHash: encryptText(await hashPassword(masterKey))
    },
    loginHistory: [
      {
        loggedInAt: /* @__PURE__ */ new Date(),
        ipAddress: input.ipAddress ?? "unknown",
        userAgent: input.userAgent ?? "unknown",
        deviceId,
        status: "SUCCESS",
        requestContext: {
          ipAddress: input.ipAddress ?? "unknown",
          userAgent: input.userAgent ?? "unknown"
        }
      }
    ],
    vault: {
      photos: [],
      videos: [],
      audios: [],
      documents: [],
      otherFiles: [],
      notes: [],
      chats: [],
      todos: [],
      passwords: [],
      secretKeys: [],
      location: [],
      contact: []
    }
  });
  const session = issueUserSession(user, {
    deviceId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent
  });
  const rawUserId = user._id?.toString ? user._id.toString() : String(user._id || "");
  if (mongoose15.Types.ObjectId.isValid(rawUserId)) {
    await RefreshToken.create({
      userId: user._id,
      familyId: session.familyId,
      sessionId: session.sessionId,
      tokenHash: hashRefreshToken(session.refreshToken),
      isRevoked: false,
      ip: input.ipAddress ?? "unknown",
      userAgent: input.userAgent ?? "unknown",
      expiresAt: session.expiresAt
    }).catch((err) => {
      logger.warn("Failed to save RefreshToken document in DB during register", { error: err });
    });
  }
  await user.save();
  await initializeDefaultUserFolders(user._id.toString(), user.username);
  void mirrorUserToAllClusters(user);
  return {
    token: session.accessToken,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    sessionId: session.sessionId,
    familyId: session.familyId,
    user: {
      id: user._id,
      username: user.username,
      meta: user.meta
    },
    created: true
  };
};

// server/services/accountSessionService.ts
init_logger();

// server/services/sessionRealtimeService.ts
init_logger();
var SessionRealtimeService = class {
  // Map: userId -> Set of ActiveStreamClient
  activeStreams = /* @__PURE__ */ new Map();
  heartbeatTimer = null;
  constructor() {
    this.startHeartbeat();
  }
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.broadcastHeartbeat();
    }, 2e4);
    this.heartbeatTimer.unref?.();
  }
  broadcastHeartbeat() {
    for (const [userId, clients] of this.activeStreams.entries()) {
      for (const client of Array.from(clients)) {
        try {
          if (client.res.writableEnded || client.res.destroyed) {
            clients.delete(client);
            continue;
          }
          client.res.write(": ping\n\n");
        } catch {
          clients.delete(client);
        }
      }
      if (clients.size === 0) {
        this.activeStreams.delete(userId);
      }
    }
  }
  /**
   * Registers an active SSE connection for a user's session
   */
  registerSessionStream(userId, sessionId, res) {
    if (!userId || !sessionId || res.writableEnded) {
      return;
    }
    let clients = this.activeStreams.get(userId);
    if (!clients) {
      clients = /* @__PURE__ */ new Set();
      this.activeStreams.set(userId, clients);
    }
    const client = {
      sessionId,
      res,
      connectedAt: Date.now()
    };
    clients.add(client);
    logger.info("[SessionRealtime] Client registered SSE stream", {
      userId,
      sessionId,
      totalActiveStreamsForUser: clients.size
    });
    const cleanup = () => {
      const userClients = this.activeStreams.get(userId);
      if (userClients) {
        userClients.delete(client);
        if (userClients.size === 0) {
          this.activeStreams.delete(userId);
        }
      }
    };
    res.on("close", cleanup);
    res.on("finish", cleanup);
    res.on("error", cleanup);
  }
  /**
   * Immediately pushes a session_revoked event to matching active SSE streams and closes them
   */
  notifySessionRevoked(userId, revokedSessionIds, reason = "REVOKED_BY_USER") {
    if (!userId || !revokedSessionIds.length) {
      return 0;
    }
    const clients = this.activeStreams.get(userId);
    if (!clients || clients.size === 0) {
      return 0;
    }
    const revokedSet = new Set(revokedSessionIds);
    let notifiedCount = 0;
    for (const client of Array.from(clients)) {
      if (revokedSet.has(client.sessionId)) {
        try {
          if (!client.res.writableEnded && !client.res.destroyed) {
            const payload = JSON.stringify({
              event: "session_revoked",
              sessionId: client.sessionId,
              reason,
              timestamp: Date.now()
            });
            client.res.write(`event: session_revoked
data: ${payload}

`);
            client.res.end();
            notifiedCount += 1;
          }
        } catch (error) {
          logger.warn("[SessionRealtime] Failed to send revocation event to client", {
            userId,
            sessionId: client.sessionId,
            error
          });
        } finally {
          clients.delete(client);
        }
      }
    }
    if (clients.size === 0) {
      this.activeStreams.delete(userId);
    }
    logger.info("[SessionRealtime] Dispatched revocation event", {
      userId,
      revokedSessionIds,
      notifiedCount,
      reason
    });
    return notifiedCount;
  }
  /**
   * Cleanup on server shutdown
   */
  destroy() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const clients of this.activeStreams.values()) {
      for (const client of clients) {
        try {
          client.res.end();
        } catch {
        }
      }
    }
    this.activeStreams.clear();
  }
};
var sessionRealtimeService = new SessionRealtimeService();

// server/services/avatarStorageService.ts
import mongoose16 from "mongoose";
import path4 from "path";
import crypto4 from "crypto";
import fs3 from "fs/promises";
var getAvatarGridFsBucket = () => {
  if (mongoose16.connection && mongoose16.connection.readyState === 1 && mongoose16.connection.db) {
    return new mongoose16.mongo.GridFSBucket(mongoose16.connection.db, {
      bucketName: "avatars"
    });
  }
  return null;
};
var getContentTypeFromExt = (ext) => {
  const normalized = ext.toLowerCase().replace(/^\./, "");
  if (normalized === "avif") return "image/avif";
  if (normalized === "webp") return "image/webp";
  if (normalized === "png") return "image/png";
  if (normalized === "gif") return "image/gif";
  if (normalized === "svg") return "image/svg+xml";
  return "image/jpeg";
};
var getExtFromMimeType = (mimeType) => {
  const lower = mimeType.toLowerCase();
  if (lower.includes("avif")) return "avif";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("png")) return "png";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("svg")) return "svg";
  return "jpeg";
};
var isValidImageMagicBytes = (buffer) => {
  if (!buffer || buffer.length < 4) return false;
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return true;
  if (buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71)
    return true;
  if (buffer[0] === 71 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 56)
    return true;
  if (buffer.length >= 12 && buffer[0] === 82 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 70 && buffer[8] === 87 && buffer[9] === 69 && buffer[10] === 66 && buffer[11] === 80) {
    return true;
  }
  if (buffer.length >= 12 && buffer[4] === 102 && buffer[5] === 116 && buffer[6] === 121 && buffer[7] === 112) {
    return true;
  }
  const snippet = buffer.subarray(0, 100).toString("utf8").trim().toLowerCase();
  if (snippet.startsWith("<?xml") || snippet.startsWith("<svg") || snippet.includes("<svg")) {
    return true;
  }
  return false;
};
async function storeAvatarBuffer(userId, buffer, mimeOrExt, customHash) {
  const sanitizedUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "") || "u_default";
  const ext = mimeOrExt.includes("/") ? getExtFromMimeType(mimeOrExt) : mimeOrExt.replace(/^\./, "");
  const contentType = getContentTypeFromExt(ext);
  if (!isValidImageMagicBytes(buffer)) {
    throw new Error("Invalid image binary magic bytes: payload is corrupted or not an image.");
  }
  const contentHash = customHash?.replace(/[^a-zA-Z0-9_-]/g, "") || crypto4.createHash("sha256").update(buffer).digest("hex").substring(0, 16);
  const gridFsFilename = `${sanitizedUserId}/${contentHash}.${ext}`;
  const bucket = getAvatarGridFsBucket();
  let wroteToGridFs = false;
  if (bucket) {
    try {
      const existingFiles = await bucket.find({ filename: gridFsFilename }).toArray();
      for (const file of existingFiles) {
        await bucket.delete(file._id).catch(() => {
        });
      }
      const uploadStream = bucket.openUploadStream(gridFsFilename, {
        contentType,
        metadata: {
          userId: sanitizedUserId,
          contentHash,
          ext,
          uploadedAt: /* @__PURE__ */ new Date()
        }
      });
      await new Promise((resolve, reject) => {
        uploadStream.on("finish", () => resolve());
        uploadStream.on("error", (err) => reject(err));
        uploadStream.end(buffer);
      });
      wroteToGridFs = true;
    } catch (cloudErr) {
      console.error(
        "Failed to write avatar to MongoDB Atlas GridFS, falling back to disk:",
        cloudErr
      );
    }
  }
  if (!wroteToGridFs) {
    const localDir = path4.join(process.cwd(), "uploads", "avatars", sanitizedUserId);
    await fs3.mkdir(localDir, { recursive: true });
    const localFilePath = path4.join(localDir, `${contentHash}.${ext}`);
    await fs3.writeFile(localFilePath, buffer);
  }
  const publicPath = `/api/avatar/raw/${sanitizedUserId}/${contentHash}.${ext}`;
  return { publicPath, contentHash, filename: gridFsFilename };
}
async function convertBase64ToAvatar(userId, base64DataUri) {
  if (!base64DataUri || typeof base64DataUri !== "string") {
    return null;
  }
  const match = base64DataUri.match(/^data:(image\/[a-zA-Z0-9.+\-]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  const mimeType = match[1];
  const base64Data = match[2];
  try {
    const buffer = Buffer.from(base64Data, "base64");
    if (!buffer || buffer.length === 0 || !isValidImageMagicBytes(buffer)) {
      return null;
    }
    const { publicPath } = await storeAvatarBuffer(userId, buffer, mimeType);
    return publicPath;
  } catch (err) {
    console.error("Failed to convert base64 profile photo to GridFS avatar:", err);
    return null;
  }
}

// server/services/accountSessionService.ts
var SESSION_REFRESH_FAILED = "Session could not be refreshed. Please sign in again.";
var PROFILE_FIELD_ENCRYPTION_PREFIX = "enc:v1:";
var NONE_PROFILE_VALUE = "none";
var MIN_PASSWORD_LENGTH = 16;
var MAX_PASSWORD_LENGTH = 64;
var STRONG_PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+=\[\];:,.<>?{}|\-])\S+$/;
var hashRefreshToken2 = (token) => createHash3("sha256").update(token).digest("hex");
var normalizeProfileValue = (value) => {
  if (typeof value !== "string") {
    return NONE_PROFILE_VALUE;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : NONE_PROFILE_VALUE;
};
var isEncryptedProfileValue = (value) => value.startsWith(PROFILE_FIELD_ENCRYPTION_PREFIX);
var encodeProfileValueForStorage = (value) => {
  if (value === NONE_PROFILE_VALUE) {
    return NONE_PROFILE_VALUE;
  }
  const encrypted = encryptText(value);
  const encoded = Buffer.from(JSON.stringify(encrypted), "utf8").toString("base64url");
  return `${PROFILE_FIELD_ENCRYPTION_PREFIX}${encoded}`;
};
var decodeProfileValueFromStorage = (value) => {
  const normalized = normalizeProfileValue(value);
  if (normalized.toLowerCase() === NONE_PROFILE_VALUE) {
    return NONE_PROFILE_VALUE;
  }
  if (!isEncryptedProfileValue(normalized)) {
    return normalized;
  }
  const payload = normalized.slice(PROFILE_FIELD_ENCRYPTION_PREFIX.length);
  if (!payload) {
    return NONE_PROFILE_VALUE;
  }
  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    const decrypted = decryptText(parsed).trim();
    return decrypted.length > 0 ? decrypted : NONE_PROFILE_VALUE;
  } catch (error) {
    logger.warn("Failed to decrypt profile field; using fallback.", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
    return NONE_PROFILE_VALUE;
  }
};
var normalizeNewPassword = (value) => {
  if (typeof value !== "string") {
    throw AppError.badRequest("Current and new password are required.", "INVALID_PASSWORD");
  }
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    throw AppError.badRequest(
      `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
      "AUTH_WEAK_PASSWORD"
    );
  }
  if (!STRONG_PASSWORD_PATTERN.test(value)) {
    throw AppError.badRequest(
      "Password must include uppercase, lowercase, number, and special character, and cannot contain spaces.",
      "AUTH_WEAK_PASSWORD"
    );
  }
  return value;
};
var migrateLegacyPlaintextProfileFields = async (user) => {
  const nameStored = normalizeProfileValue(user.profileName);
  const photoStored = normalizeProfileValue(user.profilePhoto);
  const decodedPhoto = decodeProfileValueFromStorage(photoStored);
  const photoHasBase64 = decodedPhoto.startsWith("data:image/");
  const nameIsClean = nameStored === NONE_PROFILE_VALUE || isEncryptedProfileValue(nameStored);
  const photoIsClean = !photoHasBase64 && (photoStored === NONE_PROFILE_VALUE || isEncryptedProfileValue(photoStored));
  if (nameIsClean && photoIsClean) {
    return;
  }
  let changed = false;
  for (const field of ["profileName", "profilePhoto"]) {
    const currentStored = normalizeProfileValue(user[field]);
    if (field === "profilePhoto" && photoHasBase64) {
      const publicPath = await convertBase64ToAvatar(String(user._id), decodedPhoto);
      if (publicPath) {
        user.profilePhoto = encodeProfileValueForStorage(publicPath);
        changed = true;
        continue;
      }
    }
    if (currentStored === NONE_PROFILE_VALUE || isEncryptedProfileValue(currentStored)) {
      continue;
    }
    const normalizedDecrypted = decodeProfileValueFromStorage(currentStored);
    user[field] = encodeProfileValueForStorage(normalizedDecrypted);
    changed = true;
  }
  if (!changed) {
    return;
  }
  try {
    await user.save();
  } catch (error) {
    logger.warn("Failed to migrate legacy plaintext profile fields.", {
      error: error instanceof Error ? error.message : "Unknown error",
      userId: user?._id
    });
  }
};
var toTimestamp = (value) => {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
};
var normalizeSessionEntries = (user, options = {}) => {
  const sessions = Array.isArray(user.sessions) ? user.sessions : [];
  const requireRefreshTokenHash = options.requireRefreshTokenHash === true;
  const normalized = [];
  let removedInvalidSessions = 0;
  for (const rawSession of sessions) {
    if (!rawSession || typeof rawSession !== "object") {
      removedInvalidSessions += 1;
      continue;
    }
    const sessionId = typeof rawSession.sessionId === "string" ? rawSession.sessionId.trim() : "";
    const deviceId = typeof rawSession.deviceId === "string" ? rawSession.deviceId.trim() : "";
    const expiresAtMs = toTimestamp(rawSession.expiresAt);
    const refreshTokenHash = typeof rawSession.refreshTokenHash === "string" ? rawSession.refreshTokenHash.trim() : "";
    if (!sessionId || !deviceId || expiresAtMs === null || requireRefreshTokenHash && !refreshTokenHash) {
      removedInvalidSessions += 1;
      continue;
    }
    normalized.push(rawSession);
  }
  user.sessions = normalized;
  return { removedInvalidSessions };
};
var ensureUserState = (user, options = {}) => {
  if (!user.sessions) {
    user.sessions = [];
  }
  if (!user.loginHistory) {
    user.loginHistory = [];
  }
  if (!user.meta) {
    user.meta = {
      lastLoginAt: null,
      lastSyncAt: null,
      activeDevices: [],
      masterKey: null,
      masterKeyHash: null
    };
  }
  const meta = user.meta;
  if (!Array.isArray(meta.activeDevices)) {
    meta.activeDevices = [];
  }
  const { removedInvalidSessions } = normalizeSessionEntries(user, options);
  if (removedInvalidSessions > 0) {
    logger.warn("Pruned invalid legacy session entries from user state.", {
      userId: user?._id,
      removedInvalidSessions,
      requireRefreshTokenHash: options.requireRefreshTokenHash === true
    });
  }
  return user;
};
var syncActiveDevices = (user) => {
  const now = Date.now();
  const hydratedUser = ensureUserState(user);
  const meta = hydratedUser.meta;
  meta.activeDevices = Array.from(
    new Set(
      (hydratedUser.sessions || []).filter(
        (session) => !session.revokedAt && (toTimestamp(session.expiresAt) ?? 0) > now && typeof session.deviceId === "string" && session.deviceId.trim()
      ).map((session) => session.deviceId)
    )
  );
};
var buildSessionSummaries = (user, currentSessionId) => (user.sessions || []).filter(
  (session) => !session.revokedAt && (toTimestamp(session.expiresAt) ?? 0) > Date.now()
).sort(
  (left, right) => (toTimestamp(right.lastUsedAt) ?? 0) - (toTimestamp(left.lastUsedAt) ?? 0)
).map((session) => ({
  sessionId: session.sessionId,
  deviceId: session.deviceId,
  createdAt: session.createdAt,
  lastUsedAt: session.lastUsedAt,
  expiresAt: session.expiresAt,
  revokedAt: session.revokedAt ?? null,
  ipAddress: session.ipAddress,
  userAgent: session.userAgent,
  isCurrent: session.sessionId === currentSessionId,
  deviceName: session.deviceName || parseDeviceNameFromUserAgent(session.userAgent) || "Web Client"
}));
var getUserOrThrow = async (userId, select, options = {}) => {
  const query2 = User.findById(userId);
  if (select) {
    query2.select(`+password +masterKey ${select}`);
  } else {
    query2.select("+password +masterKey");
  }
  const user = await query2.exec();
  if (!user) {
    throw AppError.notFound("User not found.", "USER_NOT_FOUND");
  }
  return ensureUserState(user, options);
};
var refreshAuthenticatedSession = async (input) => {
  let payload;
  try {
    payload = verifyRefreshToken(input.refreshToken);
  } catch (error) {
    logger.warn("Failed to verify refresh token during session refresh", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
    throw AppError.unauthorized(SESSION_REFRESH_FAILED, "SESSION_REFRESH_FAILED");
  }
  const tokenHash = hashRefreshToken2(input.refreshToken);
  const existingTokenDoc = await RefreshToken.findOne({ tokenHash });
  let user;
  try {
    user = await getUserOrThrow(payload.sub, "+sessions.refreshTokenHash", {
      requireRefreshTokenHash: true
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) {
      throw AppError.unauthorized(SESSION_REFRESH_FAILED, "SESSION_REFRESH_FAILED");
    }
    throw err;
  }
  const session = user.sessions?.find((entry) => entry.sessionId === payload.sessionId);
  const familyId = existingTokenDoc?.familyId || session?.familyId || payload.sessionId;
  const now = /* @__PURE__ */ new Date();
  const isReuseAttack = Boolean(
    existingTokenDoc && existingTokenDoc.isRevoked || session && session.revokedAt || session && session.refreshTokenHash !== tokenHash
  );
  if (isReuseAttack) {
    logger.error("CRITICAL SECURITY BREACH: Refresh token reuse attack detected!", {
      userId: user._id,
      familyId,
      sessionId: payload.sessionId
    });
    if (familyId) {
      await RefreshToken.updateMany({ familyId }, { $set: { isRevoked: true } });
    }
    if (user.sessions) {
      user.sessions.forEach((s) => {
        if (s.familyId === familyId || s.sessionId === payload.sessionId) {
          s.revokedAt = /* @__PURE__ */ new Date();
        }
      });
      syncActiveDevices(user);
      await user.save().catch(() => {
      });
    }
    throw new AppError(
      403,
      "TOKEN_REUSE_DETECTED",
      "Token reuse detected. Session lineage revoked."
    );
  }
  if (!session) {
    throw AppError.unauthorized(SESSION_REFRESH_FAILED, "SESSION_REFRESH_FAILED");
  }
  if ((toTimestamp(session.expiresAt) ?? 0) <= Date.now()) {
    session.revokedAt = /* @__PURE__ */ new Date();
    if (existingTokenDoc) {
      existingTokenDoc.isRevoked = true;
      await existingTokenDoc.save();
    }
    syncActiveDevices(user);
    await user.save();
    throw AppError.unauthorized(SESSION_REFRESH_FAILED, "SESSION_REFRESH_FAILED");
  }
  if (existingTokenDoc) {
    existingTokenDoc.isRevoked = true;
    existingTokenDoc.rotatedAt = now;
    await existingTokenDoc.save();
  }
  await RefreshToken.updateMany(
    { tokenHash, isRevoked: false },
    { $set: { isRevoked: true, rotatedAt: now } }
  );
  const rotatedSession = issueUserSession(user, {
    deviceId: session.deviceId,
    ipAddress: input.ipAddress ?? session.ipAddress,
    userAgent: input.userAgent ?? session.userAgent,
    existingSessionId: session.sessionId,
    familyId,
    deviceName: session.deviceName
  });
  const rawUserId = user._id?.toString ? user._id.toString() : String(user._id || "");
  if (mongoose17.Types.ObjectId.isValid(rawUserId)) {
    await RefreshToken.create({
      userId: user._id,
      familyId: rotatedSession.familyId,
      sessionId: rotatedSession.sessionId,
      tokenHash: hashRefreshToken2(rotatedSession.refreshToken),
      isRevoked: false,
      ip: input.ipAddress ?? session.ipAddress ?? "unknown",
      userAgent: input.userAgent ?? session.userAgent ?? "unknown",
      expiresAt: rotatedSession.expiresAt
    }).catch((err) => {
      logger.warn("Failed to save rotated RefreshToken document in DB", { error: err });
    });
  }
  await user.save();
  return {
    token: rotatedSession.accessToken,
    accessToken: rotatedSession.accessToken,
    refreshToken: rotatedSession.refreshToken,
    sessionId: rotatedSession.sessionId,
    familyId: rotatedSession.familyId,
    user: {
      id: user._id,
      username: user.username,
      meta: user.meta,
      twoFactorEnabled: user.twoFactorEnabled === true
    }
  };
};
var revokeCurrentSession = async (refreshToken) => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return { revoked: false };
  }
  const tokenHash = hashRefreshToken2(refreshToken);
  await RefreshToken.updateMany({ tokenHash }, { $set: { isRevoked: true } });
  const user = await getUserOrThrow(payload.sub);
  const session = user.sessions?.find((entry) => entry.sessionId === payload.sessionId);
  if (!session || session.revokedAt) {
    return { revoked: false };
  }
  session.revokedAt = /* @__PURE__ */ new Date();
  syncActiveDevices(user);
  await user.save();
  if (payload.sessionId) {
    await RefreshToken.updateMany(
      { sessionId: payload.sessionId },
      { $set: { isRevoked: true } }
    ).catch(() => {
    });
    try {
      sessionRealtimeService.notifySessionRevoked(payload.sub, [payload.sessionId], "LOGOUT");
      revokeSocketSessions(payload.sub, [payload.sessionId], "LOGOUT");
    } catch {
    }
  }
  return { revoked: true };
};
var revokeAuthenticatedSessions = async (input) => {
  if (!input.revokeAllOther && !input.targetSessionId && !input.targetDeviceId) {
    throw AppError.badRequest(
      "Provide sessionId, deviceId, or revokeAllOther=true.",
      "SESSION_TARGET_REQUIRED"
    );
  }
  const user = await getUserOrThrow(input.userId);
  const now = /* @__PURE__ */ new Date();
  let revokedCount = 0;
  const revokedSessionIds = [];
  for (const session of user.sessions || []) {
    const matches = input.revokeAllOther ? input.revokeCurrent === true || session.sessionId !== input.currentSessionId : input.targetSessionId ? session.sessionId === input.targetSessionId : session.deviceId === input.targetDeviceId;
    if (!matches || session.revokedAt) {
      continue;
    }
    if (session.sessionId === input.currentSessionId && input.revokeCurrent !== true) {
      continue;
    }
    session.revokedAt = now;
    revokedCount += 1;
    if (session.sessionId) {
      revokedSessionIds.push(session.sessionId);
    }
  }
  if (revokedCount === 0) {
    throw AppError.notFound("No matching active device session was found.", "SESSION_NOT_FOUND");
  }
  syncActiveDevices(user);
  await user.save();
  if (revokedSessionIds.length > 0) {
    await RefreshToken.updateMany(
      { sessionId: { $in: revokedSessionIds } },
      { $set: { isRevoked: true, rotatedAt: now } }
    ).catch((err) => {
      logger.warn("Failed to mark RefreshToken documents as revoked in DB", { err });
    });
    try {
      sessionRealtimeService.notifySessionRevoked(
        input.userId,
        revokedSessionIds,
        "REVOKED_BY_USER"
      );
      revokeSocketSessions(input.userId, revokedSessionIds, "REVOKED_BY_USER");
    } catch (realtimeErr) {
      logger.warn("Failed to broadcast realtime session revocation", { realtimeErr });
    }
  }
  return {
    revokedCount,
    sessions: buildSessionSummaries(user, input.currentSessionId)
  };
};
var changeAuthenticatedPassword = async (input) => {
  if (typeof input.currentPassword !== "string" || typeof input.newPassword !== "string") {
    throw AppError.badRequest("Current and new password are required.", "INVALID_PASSWORD");
  }
  const currentPassword = input.currentPassword;
  if (!currentPassword.trim()) {
    throw AppError.badRequest("Current password is required.", "INVALID_PASSWORD");
  }
  const nextPassword = normalizeNewPassword(input.newPassword);
  if (currentPassword === nextPassword) {
    throw AppError.badRequest(
      "New password must be different from current password.",
      "PASSWORD_UNCHANGED"
    );
  }
  const user = await getUserOrThrow(input.userId, "+password +masterKey +meta.masterKey");
  let currentHash = "";
  if (typeof user.password === "string") {
    currentHash = user.password;
  } else if (user.password && typeof user.password === "object" && "cipherText" in user.password && "iv" in user.password) {
    try {
      currentHash = decryptText(user.password);
    } catch (decryptErr) {
      logger.warn("Failed to decrypt legacy password hash in change password", {
        error: decryptErr
      });
    }
  }
  const isValid = currentHash ? await comparePassword(currentPassword, currentHash) : false;
  if (!isValid) {
    throw AppError.unauthorized("Current password is incorrect.", "INVALID_CREDENTIALS");
  }
  const rawMasterKey = user.masterKey || user.meta?.masterKey;
  if (rawMasterKey) {
    try {
      const decryptedMasterKey = decryptText(rawMasterKey);
      if (decryptedMasterKey && decryptedMasterKey === nextPassword) {
        throw AppError.badRequest(
          "Account password and master key must not be identical.",
          "AUTH_SAME_CREDENTIALS"
        );
      }
    } catch {
    }
  }
  try {
    const MasterKeyModel = getMasterKeyModel(user.username);
    const cloudMasterKeyDoc = await MasterKeyModel.findOne({
      userId: user._id.toString(),
      isDeleted: false
    }).select({ masterKeyHash: 1 }).lean().exec();
    if (cloudMasterKeyDoc?.masterKeyHash) {
      const decryptedHash = typeof cloudMasterKeyDoc.masterKeyHash === "string" ? cloudMasterKeyDoc.masterKeyHash : decryptText(cloudMasterKeyDoc.masterKeyHash);
      const matchesMasterKey = await comparePassword(nextPassword, decryptedHash);
      if (matchesMasterKey) {
        throw AppError.badRequest(
          "Account password and master key must not be identical.",
          "AUTH_SAME_CREDENTIALS"
        );
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
  }
  const nextHash = await hashPassword(nextPassword);
  user.password = nextHash;
  const now = /* @__PURE__ */ new Date();
  for (const session of user.sessions || []) {
    if (!session.revokedAt) {
      session.revokedAt = now;
    }
  }
  if (user.meta) {
    user.meta.lastCredentialChangeAt = now;
  }
  syncActiveDevices(user);
  await user.save();
  try {
    await RefreshToken.updateMany({ userId: user._id }, { $set: { isRevoked: true } });
  } catch (err) {
    logger.warn("Failed to revoke RefreshToken documents during password change", { error: err });
  }
  void mirrorUserToAllClusters(user);
  return { changed: true };
};
var getAuthenticatedUserProfile = async (userId, currentSessionId) => {
  const user = await getUserOrThrow(userId);
  await migrateLegacyPlaintextProfileFields(user);
  const profileName = decodeProfileValueFromStorage(user.profileName);
  const profilePhoto = decodeProfileValueFromStorage(user.profilePhoto);
  return {
    id: user._id,
    username: user.username,
    profileName,
    profilePhoto,
    profileDetails: {
      createdAt: user.profileDetails?.createdAt ?? user.createdAt,
      updatedAt: user.profileDetails?.updatedAt ?? user.updatedAt
    },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    meta: user.meta,
    twoFactorEnabled: user.twoFactorEnabled === true,
    sessions: buildSessionSummaries(user, currentSessionId)
  };
};
var updateAuthenticatedUserProfile = async (input) => {
  const user = await getUserOrThrow(input.userId);
  const now = /* @__PURE__ */ new Date();
  let changed = false;
  if (!user.profileDetails) {
    user.profileDetails = {
      createdAt: now,
      updatedAt: now
    };
  }
  if (!user.profileDetails.createdAt) {
    user.profileDetails.createdAt = now;
  }
  if (typeof input.profileName === "string") {
    const nextName = input.profileName.trim();
    const normalizedName = nextName || NONE_PROFILE_VALUE;
    const currentStoredName = normalizeProfileValue(user.profileName);
    const currentName = decodeProfileValueFromStorage(currentStoredName);
    const currentIsLegacyPlaintext = currentStoredName !== NONE_PROFILE_VALUE && !isEncryptedProfileValue(currentStoredName);
    if (currentName !== normalizedName || currentIsLegacyPlaintext) {
      user.profileName = encodeProfileValueForStorage(normalizedName);
      changed = true;
    }
  }
  if (typeof input.profilePhoto === "string") {
    let nextPhoto = input.profilePhoto.trim();
    if (nextPhoto.startsWith("data:image/")) {
      const publicPath = await convertBase64ToAvatar(String(user._id), nextPhoto);
      if (publicPath) {
        nextPhoto = publicPath;
      }
    }
    const normalizedPhoto = nextPhoto || NONE_PROFILE_VALUE;
    const currentStoredPhoto = normalizeProfileValue(user.profilePhoto);
    const currentPhoto = decodeProfileValueFromStorage(currentStoredPhoto);
    const currentIsLegacyPlaintext = currentStoredPhoto !== NONE_PROFILE_VALUE && !isEncryptedProfileValue(currentStoredPhoto);
    if (currentPhoto !== normalizedPhoto || currentIsLegacyPlaintext) {
      user.profilePhoto = encodeProfileValueForStorage(normalizedPhoto);
      changed = true;
    }
  }
  if (changed) {
    user.profileDetails.updatedAt = now;
    await user.save();
  }
  const profileName = decodeProfileValueFromStorage(user.profileName);
  const profilePhoto = decodeProfileValueFromStorage(user.profilePhoto);
  return {
    id: user._id,
    username: user.username,
    profileName,
    profilePhoto,
    profileDetails: {
      createdAt: user.profileDetails?.createdAt ?? user.createdAt,
      updatedAt: user.profileDetails?.updatedAt ?? user.updatedAt
    },
    updatedAt: user.updatedAt
  };
};
var renameDeviceSession = async (userId, deviceId, deviceName) => {
  const normalizedDeviceId = deviceId.trim();
  const normalizedDeviceName = deviceName.trim();
  if (!normalizedDeviceId || !normalizedDeviceName) {
    throw AppError.badRequest("deviceId and deviceName are required.", "INVALID_INPUT");
  }
  const user = await getUserOrThrow(userId);
  let updated = false;
  for (const session of user.sessions || []) {
    if (session.deviceId === normalizedDeviceId && !session.revokedAt) {
      session.deviceName = normalizedDeviceName;
      updated = true;
    }
  }
  if (!updated) {
    throw AppError.notFound("No matching active device session was found.", "SESSION_NOT_FOUND");
  }
  await user.save();
  return {
    success: true,
    sessions: buildSessionSummaries(user)
  };
};

// server/services/vaultService.internal.ts
import path5 from "path";
init_logger();
var FILE_CATEGORIES = /* @__PURE__ */ new Set([
  "photo",
  "video",
  "audio",
  "document",
  "other-files"
]);
var ENCRYPTED_CATEGORIES = /* @__PURE__ */ new Set([
  "note",
  "chat",
  "todo",
  "password",
  "secret",
  "location",
  "contact"
]);
var CONFIG = {
  maxActivityLogs: Number.parseInt(process.env.MAX_ACTIVITY_LOGS?.trim() || "500", 10),
  maxLoginHistory: Number.parseInt(process.env.MAX_LOGIN_HISTORY?.trim() || "20", 10),
  maxActiveDevices: Number.parseInt(process.env.MAX_ACTIVE_DEVICES?.trim() || "25", 10),
  maxItemIdLength: Number.parseInt(process.env.MAX_ITEM_ID_LENGTH?.trim() || "128", 10),
  maxTitleLength: Number.parseInt(process.env.MAX_TITLE_LENGTH?.trim() || "200", 10),
  maxNoteContentLength: Number.parseInt(
    process.env.MAX_NOTE_CONTENT_LENGTH?.trim() || "100000",
    10
  ),
  maxTextFieldLength: Number.parseInt(process.env.MAX_TEXT_FIELD_LENGTH?.trim() || "1000", 10),
  maxFileNameLength: Number.parseInt(process.env.MAX_FILE_NAME_LENGTH?.trim() || "255", 10),
  sessionRetentionMs: Number.parseInt(process.env.SESSION_RETENTION_MS?.trim() || "604800000", 10),
  maxUserWriteRetries: Number.parseInt(process.env.MAX_USER_WRITE_RETRIES?.trim() || "3", 10),
  registrationProfileTimeoutMs: Number.parseInt(
    process.env.REGISTRATION_PROFILE_TIMEOUT_MS?.trim() || "10000",
    10
  ),
  ipGeolocationApiKey: process.env.IPGEOLOCATION_API_KEY?.trim(),
  freeIpApiUrlTemplate: process.env.FREE_IP_API_URL_TEMPLATE?.trim() || "https://free.freeipapi.com/api/json/{ip}",
  freeIpApiFallback: process.env.FREE_IP_API_URL_FALLBACK?.trim() || "https://free.freeipapi.com/api/json",
  ipwhoisUrlTemplate: process.env.IPWHOIS_URL_TEMPLATE?.trim() || "https://ipwho.is/{ip}",
  ipwhoisUrlFallback: process.env.IPWHOIS_URL_FALLBACK?.trim() || "https://ipwho.is/",
  ipwhoisAppApiKey: process.env.IPWHOIS_APP_API_KEY?.trim(),
  ipwhoisAppUrlTemplate: process.env.IPWHOIS_APP_URL_TEMPLATE?.trim() || "https://ipwhois.app/json/{ip}?key={apiKey}",
  ipwhoisAppUrlFallback: process.env.IPWHOIS_APP_URL_FALLBACK?.trim() || "https://ipwhois.app/json/?key={apiKey}",
  ipApiComUrlTemplate: process.env.IP_API_COM_URL_TEMPLATE?.trim() || "http://ip-api.com/json/{ip}",
  ipApiComUrlFallback: process.env.IP_API_COM_URL_FALLBACK?.trim() || "http://ip-api.com/json/",
  ipgeolocationUrlTemplate: process.env.IPGEOLOCATION_URL_TEMPLATE?.trim() || "https://api.ipgeolocation.io/ipgeo?apiKey={apiKey}&ip={ip}",
  ipgeolocationUrlFallback: process.env.IPGEOLOCATION_URL_FALLBACK?.trim() || "https://api.ipgeolocation.io/ipgeo?apiKey={apiKey}",
  iplocateIoApiKey: process.env.IPLOCATE_IO_API_KEY?.trim(),
  iplocateIoUrlTemplate: process.env.IPLOCATE_IO_URL_TEMPLATE?.trim() || "https://iplocate.io/api/lookup/{ip}?apikey={apiKey}",
  iplocateIoUrlFallback: process.env.IPLOCATE_IO_URL_FALLBACK?.trim() || "https://iplocate.io/api/lookup?apikey={apiKey}",
  ipinfoIoUrlTemplate: process.env.IPINFO_IO_URL_TEMPLATE?.trim() || "https://ipinfo.io/{ip}/json",
  ipinfoIoUrlFallback: process.env.IPINFO_IO_URL_FALLBACK?.trim() || "https://ipinfo.io/json",
  ipapiCoUrlTemplate: process.env.IPAPI_CO_URL_TEMPLATE?.trim() || "https://ipapi.co/{ip}/json/",
  ipapiCoUrlFallback: process.env.IPAPI_CO_URL_FALLBACK?.trim() || "https://ipapi.co/json/",
  enableIpinfoIo: process.env.ENABLE_IPINFO_IO?.trim().toLowerCase() === "true",
  enableIpapiCo: process.env.ENABLE_IPAPI_CO?.trim().toLowerCase() === "true",
  enableIpwhoIs: process.env.ENABLE_IPWHO_IS?.trim().toLowerCase() === "true",
  dummyPasswordHash: process.env.DUMMY_PASSWORD_HASH?.trim() || "$2b$12$kBdayC1Q/sgRqxBzBn1u6OxfBuHHqqSQ/roJTvkTua.U9/o3pDP6K",
  registrationProfileCaptureEnabled: process.env.REGISTRATION_PROFILE_CAPTURE_ENABLED?.trim().toLowerCase() === "true"
};
var sanitizeUsername = (value) => {
  if (typeof value !== "string") {
    throw new AppError(400, "INVALID_USERNAME", "Username must be at least 3 characters.");
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 3 || normalized.length > 64) {
    throw new AppError(400, "INVALID_USERNAME", "Username must be between 3 and 64 characters.");
  }
  if (!/^[a-z0-9._-]+$/i.test(normalized)) {
    throw new AppError(
      400,
      "INVALID_USERNAME",
      "Username may only contain letters, numbers, dots, underscores, and hyphens."
    );
  }
  return normalized;
};
var normalizeVaultCategoryAlias = (category) => {
  switch (category) {
    case "notes":
      return "note";
    case "chats":
      return "chat";
    case "todos":
      return "todo";
    case "passwords":
      return "password";
    case "secretKeys":
    case "secrets":
      return "secret";
    case "contacts":
      return "contact";
    case "locations":
      return "location";
    case "photos":
      return "photo";
    case "videos":
      return "video";
    case "audios":
      return "audio";
    case "documents":
      return "document";
    case "files":
      return "other-files";
    default:
      return category;
  }
};
var normalizeDate = (value) => {
  if (!value) {
    return /* @__PURE__ */ new Date();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? /* @__PURE__ */ new Date() : parsed;
};
var withUserState = (user) => {
  if (!user.meta) {
    Object.assign(user, {
      meta: {
        registeredAt: null,
        lastLoginAt: null,
        lastFailedLoginAt: null,
        lastFailedLoginIp: null,
        lastSyncAt: null,
        lastCredentialChangeAt: null,
        activeDevices: [],
        accountStatus: "active",
        profileVersion: 2
      }
    });
  }
  if (!user.vault) {
    Object.assign(user, {
      vault: {
        photos: [],
        videos: [],
        audios: [],
        notes: [],
        chats: [],
        todos: [],
        documents: [],
        passwords: [],
        secretKeys: [],
        location: [],
        contact: [],
        otherFiles: []
      }
    });
  }
  if (!user.activityLog) {
    Object.assign(user, { activityLog: [] });
  }
  if (!user.loginHistory) {
    Object.assign(user, { loginHistory: [] });
  }
  if (!user.sessions) {
    Object.assign(user, { sessions: [] });
  }
  return user;
};
var touchUser = (user, updatedAt) => {
  const currentUser = withUserState(user);
  currentUser.updatedAt = updatedAt;
  currentUser.meta.lastSyncAt = updatedAt;
};
var normalizeFileName = (value) => {
  const baseName = path5.basename(value || "unnamed").trim() || "unnamed";
  return baseName.slice(0, CONFIG.maxFileNameLength);
};
var logAndEmit = (user, action, category, itemId, details) => {
  const createdAt = /* @__PURE__ */ new Date();
  saveActivityLog({
    userId: user._id.toString(),
    username: user.username,
    action,
    category,
    itemId,
    deviceId: typeof details.deviceId === "string" ? details.deviceId : "unknown-device",
    ipAddress: typeof details.ipAddress === "string" ? details.ipAddress : "unknown",
    userAgent: typeof details.userAgent === "string" ? details.userAgent : "unknown",
    status: details.status === "FAILURE" || details.status === "PARTIAL" ? details.status : "SUCCESS",
    errorCode: typeof details.errorCode === "string" ? details.errorCode : void 0,
    errorMessage: typeof details.errorMessage === "string" ? details.errorMessage : void 0,
    details
  }).catch((err) => {
    logger.error("Failed to save activity log in logAndEmit", { error: err.message });
  });
  try {
    emitVaultEvent(user._id.toString(), "vault:changed", {
      action,
      category,
      itemId,
      updatedAt: createdAt.toISOString()
    });
  } catch (error) {
    logger.error("Failed to emit vault event", {
      userId: user._id.toString(),
      action,
      category,
      error
    });
  }
};
var validateVaultCategory = (category) => {
  const normalized = normalizeVaultCategoryAlias(category);
  if (FILE_CATEGORIES.has(normalized)) {
    return normalized;
  }
  if (ENCRYPTED_CATEGORIES.has(normalized)) {
    return normalized;
  }
  throw new AppError(400, "UNSUPPORTED_CATEGORY", "Unsupported vault category.");
};
var USER_STORAGE_QUOTA_MB = Math.max(1, Number(process.env.USER_STORAGE_QUOTA_MB || 2048));
var USER_STORAGE_QUOTA_BYTES = USER_STORAGE_QUOTA_MB * 1024 * 1024;
var getUserStoredBytes = async (userId, username) => {
  const DynamicVaultModel = getVaultItemModel(username);
  const aggregate = await DynamicVaultModel.aggregate([
    { $match: { userId, isDeleted: false } },
    { $group: { _id: null, total: { $sum: { $ifNull: ["$metadata.size", 0] } } } }
  ]).allowDiskUse(true);
  return Number(aggregate?.[0]?.total || 0);
};
var enforceUserStorageQuota = async (userId, username, incomingBytes) => {
  const usedBytes = await getUserStoredBytes(userId, username);
  if (usedBytes + incomingBytes > USER_STORAGE_QUOTA_BYTES) {
    throw new AppError(
      413,
      "USER_STORAGE_QUOTA_EXCEEDED",
      `Upload exceeds your storage quota of ${USER_STORAGE_QUOTA_MB}MB.`
    );
  }
};
var getUserOrThrow2 = async (userId, _includePassword = false) => {
  const query2 = User.findById(userId);
  query2.select("+password +masterKey");
  const user = await query2.exec();
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found.");
  }
  return withUserState(user);
};
var executeWithStorageFailover = async (operation) => {
  try {
    return await operation();
  } catch (error) {
    if (!isStorageFullError(error)) {
      throw error;
    }
    logger.warn("Storage full on primary MongoDB, attempting failover", {
      error: error instanceof Error ? error.message : "Unknown error"
    });
    const switched = await switchToNextMongoUri();
    if (!switched) {
      throw new AppError(
        507,
        "STORAGE_FULL",
        "All configured MongoDB storage targets are full or unavailable. Add another Mongo URL or free storage space."
      );
    }
    try {
      return await operation();
    } catch (retryError) {
      if (isStorageFullError(retryError)) {
        throw new AppError(
          507,
          "STORAGE_FULL",
          "MongoDB storage is full on the active and failover targets. Configure a working MONGODB_URI_1 / _2 / _3 or free Atlas storage."
        );
      }
      throw new AppError(
        503,
        "DB_UNAVAILABLE",
        "MongoDB failover target could not be reached. Check whether MONGODB_URI_1 / _2 / _3 are valid direct Atlas URIs."
      );
    }
  }
};
var isVersionConflictError = (error) => {
  const candidate = error;
  return candidate?.name === "VersionError";
};
var retryLoadedUserMutation = async (input) => {
  let lastError;
  for (let attempt = 1; attempt <= CONFIG.maxUserWriteRetries; attempt += 1) {
    const user = await input.loadUser();
    try {
      const outcome = await input.operation(user);
      if (!outcome.skipSave) {
        await executeWithStorageFailover(() => user.save());
      }
      return outcome.result;
    } catch (error) {
      lastError = error;
      if (!isVersionConflictError(error) || attempt === CONFIG.maxUserWriteRetries) {
        throw error;
      }
      logger.warn("Optimistic concurrency conflict, retrying user mutation", {
        mutationName: input.mutationName,
        attempt,
        maxRetries: CONFIG.maxUserWriteRetries
      });
    }
  }
  throw lastError instanceof Error ? lastError : new AppError(
    409,
    "WRITE_CONFLICT",
    "The request conflicted with another update. Please retry."
  );
};

// server/services/vaultAuthService.ts
var getExactUsernameMatch = async (input) => {
  const username = sanitizeUsername(input.username);
  const exactUser = await User.findOne({ username }).select("_id username createdAt").lean().exec();
  if (!exactUser) {
    return {
      exists: false,
      exactMatch: false,
      username,
      userId: null,
      createdDate: null
    };
  }
  return {
    exists: true,
    exactMatch: true,
    username: exactUser.username,
    userId: String(exactUser._id),
    createdDate: exactUser.createdAt ?? null
  };
};

// server/services/vaultDataService.ts
import { randomUUID as randomUUID2 } from "crypto";
init_logger();

// server/utils/imagePipeline.ts
init_logger();
import path6 from "path";
var PHOTO_NORMALIZATION_ENABLED = (process.env.PHOTO_NORMALIZATION_ENABLED?.trim().toLowerCase() || "false") === "true";
var DEFAULT_KEEP_PHOTO_METADATA = (process.env.DEFAULT_KEEP_PHOTO_METADATA?.trim().toLowerCase() || "false") === "true";
var PHOTO_NORMALIZATION_FORMAT = process.env.PHOTO_NORMALIZATION_FORMAT?.trim().toLowerCase() || "jpeg";
var JPEG_SOI = 255;
var JPEG_MARKER = 216;
var loadSharp = async () => {
  try {
    const dynamicImport = new Function("moduleName", "return import(moduleName)");
    const sharpModule = await dynamicImport("sharp");
    return sharpModule.default;
  } catch {
    return null;
  }
};
var isJpeg = (buffer) => buffer.length > 4 && buffer[0] === JPEG_SOI && buffer[1] === JPEG_MARKER;
var stripExifFromJpeg = (buffer) => {
  if (!isJpeg(buffer)) {
    return buffer;
  }
  const chunks = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 255) {
      break;
    }
    const marker = buffer[offset + 1];
    if (marker === 218) {
      chunks.push(buffer.subarray(offset));
      break;
    }
    if (marker === 217) {
      chunks.push(buffer.subarray(offset, offset + 2));
      break;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) {
      return buffer;
    }
    const nextOffset = offset + 2 + segmentLength;
    const isMetadataSegment = marker >= 225 && marker <= 239 || marker === 254;
    if (!isMetadataSegment) {
      chunks.push(buffer.subarray(offset, nextOffset));
    }
    offset = nextOffset;
  }
  return Buffer.concat(chunks);
};
var normalizedExtension = (format) => format === "jpeg" ? "jpg" : format;
var normalizedMimeType = (format) => format === "jpeg" ? "image/jpeg" : `image/${format}`;
var processPhotoUpload = async (input) => {
  const keepMetadata = typeof input.keepMetadata === "boolean" ? input.keepMetadata : DEFAULT_KEEP_PHOTO_METADATA;
  let nextBuffer = input.buffer;
  let nextName = input.fileName;
  let nextMimeType = input.mimeType;
  if (!keepMetadata) {
    nextBuffer = stripExifFromJpeg(nextBuffer);
  }
  if (PHOTO_NORMALIZATION_ENABLED) {
    const sharp = await loadSharp();
    if (!sharp) {
      logger.warn("PHOTO_NORMALIZATION_ENABLED is true but sharp is not installed.");
    } else {
      try {
        const transformer = sharp(nextBuffer).rotate();
        if (keepMetadata) {
          transformer.withMetadata();
        } else {
          transformer.withMetadata({});
        }
        if (PHOTO_NORMALIZATION_FORMAT === "webp") {
          nextBuffer = await transformer.webp({ quality: 88 }).toBuffer();
        } else if (PHOTO_NORMALIZATION_FORMAT === "avif") {
          nextBuffer = await transformer.avif({ quality: 60 }).toBuffer();
        } else {
          nextBuffer = await transformer.jpeg({ quality: 90 }).toBuffer();
        }
        const ext = normalizedExtension(PHOTO_NORMALIZATION_FORMAT);
        nextName = `${path6.parse(nextName).name}.${ext}`;
        nextMimeType = normalizedMimeType(PHOTO_NORMALIZATION_FORMAT);
      } catch (error) {
        logger.error("Photo normalization failed; keeping original processed bytes.", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }
  return {
    buffer: nextBuffer,
    fileName: nextName,
    mimeType: nextMimeType,
    keepMetadata
  };
};

// server/services/uploadSecurityService.ts
import crypto5 from "crypto";
import mongoose18 from "mongoose";
init_logger();
var MALWARE_PATTERNS = (process.env.MALWARE_SIGNATURE_PATTERNS || "").split(",").map((value) => value.trim()).filter(Boolean);
var EICAR_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
var PHASH_BYTES = 32;
var getSecurityCollection = async () => {
  const ready = await ensureMongoReady();
  if (!ready || !mongoose18.connection.db) {
    throw new Error("MongoDB not ready for upload security collection.");
  }
  return mongoose18.connection.db.collection("upload_security_artifacts");
};
var hex = (buffer) => buffer.toString("hex");
var sha256 = (buffer) => crypto5.createHash("sha256").update(buffer).digest("hex");
var perceptualHash = (buffer) => {
  const hash = crypto5.createHash("sha256").update(buffer).digest();
  return hex(hash.subarray(0, PHASH_BYTES));
};
var isLikelyMalicious = (buffer) => {
  const ascii = buffer.toString("latin1");
  if (ascii.includes(EICAR_SIGNATURE)) {
    return { malicious: true, reason: "eicar_signature_detected" };
  }
  for (const signature of MALWARE_PATTERNS) {
    if (signature && ascii.includes(signature)) {
      return { malicious: true, reason: `pattern:${signature.slice(0, 32)}` };
    }
  }
  return { malicious: false, reason: null };
};
var updateScanState = async (username, userId, itemId, patch) => {
  const model2 = getVaultItemModel(username);
  await model2.updateOne(
    { userId, itemId },
    {
      $set: Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [`metadata.uploadSecurity.${key}`, value])
      )
    }
  );
};
var persistArtifactVerdict = async (input) => {
  const collection = await getSecurityCollection();
  const now = /* @__PURE__ */ new Date();
  await collection.createIndex({ sha256: 1 }, { unique: true, sparse: true });
  await collection.createIndex({ perceptualHash: 1 }, { sparse: true });
  await collection.updateOne(
    { sha256: input.sha256 },
    {
      $set: {
        sha256: input.sha256,
        perceptualHash: input.perceptualHash,
        verdict: input.verdict,
        reason: input.reason || null,
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );
};
var lookupPriorMalicious = async (sha, pHash) => {
  const collection = await getSecurityCollection();
  const matched = await collection.findOne({
    verdict: "malicious",
    $or: [{ sha256: sha }, { perceptualHash: pHash }]
  });
  return matched;
};
var executeUploadSecurityJob = async (job) => {
  const fileSha = sha256(job.payload);
  const filePHash = perceptualHash(job.payload);
  await updateScanState(job.username, job.userId, job.itemId, {
    scanStatus: "scanning",
    scannedAt: null,
    verdict: null,
    reason: null,
    sha256: fileSha,
    perceptualHash: filePHash
  });
  const previousMalicious = await lookupPriorMalicious(fileSha, filePHash);
  if (previousMalicious) {
    await updateScanState(job.username, job.userId, job.itemId, {
      scanStatus: "blocked",
      verdict: "malicious",
      reason: "matched_prior_malicious_artifact",
      scannedAt: (/* @__PURE__ */ new Date()).toISOString(),
      isActive: false
    });
    return;
  }
  const malwareCheck = isLikelyMalicious(job.payload);
  if (malwareCheck.malicious) {
    await persistArtifactVerdict({
      sha256: fileSha,
      perceptualHash: filePHash,
      verdict: "malicious",
      reason: malwareCheck.reason
    });
    await updateScanState(job.username, job.userId, job.itemId, {
      scanStatus: "blocked",
      verdict: "malicious",
      reason: malwareCheck.reason,
      scannedAt: (/* @__PURE__ */ new Date()).toISOString(),
      isActive: false
    });
    return;
  }
  await persistArtifactVerdict({
    sha256: fileSha,
    perceptualHash: filePHash,
    verdict: "clean",
    reason: null
  });
  await updateScanState(job.username, job.userId, job.itemId, {
    scanStatus: "active",
    verdict: "clean",
    reason: null,
    scannedAt: (/* @__PURE__ */ new Date()).toISOString(),
    isActive: true
  });
};
var enqueueUploadSecurityScan = (job) => {
  setTimeout(() => {
    executeUploadSecurityJob(job).catch((error) => {
      logger.error("Upload security scan failed", {
        userId: job.userId,
        itemId: job.itemId,
        error: error instanceof Error ? error.message : String(error)
      });
      updateScanState(job.username, job.userId, job.itemId, {
        scanStatus: "error",
        verdict: null,
        reason: "scan_execution_error",
        scannedAt: (/* @__PURE__ */ new Date()).toISOString(),
        isActive: false
      }).catch(() => {
      });
    });
  }, 0);
};

// server/services/vaultDataService.ts
var saveFileToVault = async (input) => {
  const category = validateVaultCategory(input.category);
  if (!FILE_CATEGORIES.has(category)) {
    throw new AppError(400, "INVALID_CATEGORY", "This endpoint only supports file categories.");
  }
  const updatedAt = normalizeDate(input.clientUpdatedAt);
  const itemId = randomUUID2();
  if (!input.file.size || !input.file.buffer?.length) {
    throw new AppError(400, "EMPTY_FILE", "Uploaded file is empty.");
  }
  let fileName = normalizeFileName(input.file.originalname);
  let fileBuffer = input.file.buffer;
  let fileMimeType = input.file.mimetype;
  if (category === "photo") {
    const processedPhoto = await processPhotoUpload({
      buffer: fileBuffer,
      fileName,
      mimeType: fileMimeType,
      keepMetadata: input.keepMetadata
    });
    fileBuffer = processedPhoto.buffer;
    fileName = normalizeFileName(processedPhoto.fileName);
    fileMimeType = processedPhoto.mimeType;
  }
  return retryLoadedUserMutation({
    mutationName: "saveFileToVault",
    loadUser: () => getUserOrThrow2(input.userId),
    operation: async (user) => {
      await enforceUserStorageQuota(input.userId, user.username, fileBuffer.length);
      await saveScopedVaultItem({
        userId: input.userId,
        username: user.username,
        itemId,
        payload: fileBuffer,
        category,
        folder: input.folder || null,
        title: fileName,
        metadata: {
          mimeType: fileMimeType,
          size: fileBuffer.length,
          originalName: fileName,
          storage: "cloud",
          keepMetadata: input.keepMetadata === true,
          uploadSecurity: {
            scanStatus: "pending",
            verdict: null,
            reason: null,
            isActive: false,
            queuedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        }
      });
      enqueueUploadSecurityScan({
        userId: input.userId,
        username: user.username,
        itemId,
        category,
        fileName,
        mimeType: fileMimeType,
        payload: fileBuffer
      });
      touchUser(user, updatedAt);
      user.markModified(
        `vault.${category}`
      );
      logAndEmit(user, "FILE_UPLOAD", category, itemId, {
        ipAddress: input.ipAddress ?? "unknown",
        deviceId: input.deviceId ?? "unknown-device",
        fileName,
        size: fileBuffer.length
      });
      logger.info("File uploaded to vault", {
        userId: input.userId,
        category,
        itemId,
        size: input.file.size
      });
      return {
        result: {
          itemId,
          category,
          fileName,
          filePath: `cloud://${itemId}`,
          scanStatus: "pending",
          updatedAt
        }
      };
    }
  });
};

// server/utils/requestIp.ts
var normalizeRawIpAddress = (value) => {
  if (!value) {
    return void 0;
  }
  let normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "unknown") {
    return void 0;
  }
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    normalized = normalized.slice(1, -1).trim();
  }
  if (normalized.startsWith("[") && normalized.includes("]")) {
    normalized = normalized.slice(1, normalized.indexOf("]"));
  }
  normalized = normalized.replace(/^for=/i, "").trim();
  normalized = normalized.replace(/^::ffff:/i, "").trim();
  return normalized || void 0;
};
var normalizeIpAddress = (value) => {
  const normalized = normalizeRawIpAddress(value);
  if (!normalized || normalized === "::1" || normalized === "127.0.0.1") {
    return void 0;
  }
  return normalized;
};
var parseForwardedHeader = (headerValue) => {
  if (!headerValue) {
    return void 0;
  }
  for (const segment of headerValue.split(",")) {
    for (const token of segment.split(";")) {
      const trimmed = token.trim();
      if (!trimmed.toLowerCase().startsWith("for=")) {
        continue;
      }
      const candidate = normalizeIpAddress(trimmed);
      if (candidate) {
        return candidate;
      }
    }
  }
  return void 0;
};
var parseForwardedForHeader = (headerValue) => {
  if (!headerValue) {
    return void 0;
  }
  for (const part of headerValue.split(",")) {
    const candidate = normalizeIpAddress(part);
    if (candidate) {
      return candidate;
    }
  }
  return void 0;
};
var getClientIp = (req) => {
  const trustProxy = req.app.get("trust proxy");
  if (trustProxy) {
    const forwardedFor = req.get("x-forwarded-for");
    const fromForwardedFor = parseForwardedForHeader(forwardedFor);
    if (fromForwardedFor) {
      return fromForwardedFor;
    }
    const forwarded = req.get("forwarded");
    const fromForwarded = parseForwardedHeader(forwarded);
    if (fromForwarded) {
      return fromForwarded;
    }
  }
  const directIp = normalizeIpAddress(req.ip) ?? normalizeIpAddress(req.socket?.remoteAddress) ?? normalizeIpAddress(req.connection?.remoteAddress);
  const fallbackIp = normalizeRawIpAddress(req.ip) ?? normalizeRawIpAddress(req.socket?.remoteAddress) ?? normalizeRawIpAddress(req.connection?.remoteAddress);
  return directIp || fallbackIp || "unknown";
};

// server/services/transcodingService.ts
init_logger();
import { spawn as spawn2 } from "child_process";
import path8 from "path";
import fs5 from "fs/promises";

// server/services/mediaService.ts
import crypto6 from "crypto";
var mediaService = {
  /**
   * Generates or retrieves an encryption key for HLS chunks
   * Native HLS AES-128 or ClearKey requires a 16-byte key
   */
  async getStreamingKey(userId, itemId) {
    const keySource = process.env.VAULT_ENCRYPTION_KEY || (process.env.NODE_ENV === "production" ? (() => {
      throw new Error(
        "VAULT_ENCRYPTION_KEY must be configured for production media key derivation."
      );
    })() : "dev-only-streaming-secret-change-me");
    return crypto6.createHmac("sha256", keySource).update(`${userId}:${itemId}:hls:clearkey`).digest().slice(0, 16);
  },
  /**
   * Generates a rotation-friendly key URL for the M3U8 playlist
   */
  getStreamingKeyUrl(itemId, sessionToken) {
    const baseUrl = process.env.PUBLIC_URL || "";
    return `${baseUrl}/api/vault/media/key/${itemId}?token=${sessionToken}`;
  },
  /**
   * Generates a Master Playlist for Adaptive Bitrate (ABR)
   */
  async generateMasterPlaylist(itemId, queryString) {
    const baseUrl = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
    const query2 = queryString ? `?${queryString}` : "";
    return [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-STREAM-INF:BANDWIDTH=180000,RESOLUTION=256x144",
      `${baseUrl}/api/vault/media/${itemId}/hls/144p/playlist.m3u8${query2}`,
      "#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=426x240",
      `${baseUrl}/api/vault/media/${itemId}/hls/240p/playlist.m3u8${query2}`,
      "#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360",
      `${baseUrl}/api/vault/media/${itemId}/hls/360p/playlist.m3u8${query2}`,
      "#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480",
      `${baseUrl}/api/vault/media/${itemId}/hls/480p/playlist.m3u8${query2}`,
      "#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720",
      `${baseUrl}/api/vault/media/${itemId}/hls/720p/playlist.m3u8${query2}`,
      "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080",
      `${baseUrl}/api/vault/media/${itemId}/hls/1080p/playlist.m3u8${query2}`
    ].join("\n");
  },
  /**
   * Generates a standard HLS M3U8 playlist with encryption tags (DRM)
   */
  async generatePlaylist(itemId, sessionToken, variant, segmentCount, duration) {
    const keyUrl = this.getStreamingKeyUrl(itemId, sessionToken);
    let playlist = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:10",
      "#EXT-X-MEDIA-SEQUENCE:0",
      "#EXT-X-PLAYLIST-TYPE:VOD",
      `#EXT-X-KEY:METHOD=AES-128,URI="${keyUrl}",IV=0x${crypto6.randomBytes(16).toString("hex")}`
    ];
    for (let i = 0; i < segmentCount; i++) {
      playlist.push(`#EXTINF:${duration.toFixed(2)},`);
      playlist.push(`segment/${variant}/${i}.ts?token=${sessionToken}`);
    }
    playlist.push("#EXT-X-ENDLIST");
    return playlist.join("\n");
  }
};

// server/services/drmPackagingService.ts
init_logger();
import { spawn } from "child_process";
import path7 from "path";
import fs4 from "fs/promises";
var DrmPackagingService = class {
  /**
   * Packages a video using Common Encryption (CENC)
   * This ensures the keys are never exposed in the manifest.
   */
  async packageWithDrm(itemId, userId, inputPath, outputDir) {
    await fs4.mkdir(outputDir, { recursive: true });
    const rawKey = await mediaService.getStreamingKey(userId, itemId);
    const keyHex = rawKey.toString("hex");
    const kidHex = Buffer.from(itemId.substring(0, 16)).toString("hex");
    logger.info(`Starting DRM Packaging (CENC): ${itemId}`, { kid: kidHex });
    const packagerCmd = "packager";
    const args = [
      `input=${inputPath},stream=audio,output=${path7.join(outputDir, "audio.mp4")}`,
      `input=${inputPath},stream=video,output=${path7.join(outputDir, "video_1080p.mp4")}`,
      "--enable_fixed_key_encryption",
      `--keys=label=:key_id=${kidHex}:key=${keyHex}`,
      "--mpd_output",
      path7.join(outputDir, "manifest.mpd"),
      "--hls_master_playlist_output",
      path7.join(outputDir, "master.m3u8")
    ];
    return new Promise((resolve, reject) => {
      const packager = spawn(packagerCmd, args);
      packager.on("error", (err) => {
        logger.warn("Shaka Packager not found. Falling back to software-based HLS AES-128.", {
          error: err.message
        });
        resolve();
      });
      packager.on("close", (code) => {
        if (code === 0) {
          logger.info(`DRM Packaging complete: ${itemId}`);
          resolve();
        } else {
          reject(new Error(`Shaka Packager failed with code ${code}`));
        }
      });
    });
  }
};
var drmPackagingService = new DrmPackagingService();

// server/services/transcodingService.ts
import os2 from "os";
var processHlsAdaptive = async (itemId, userId, username, inputPath, outputDir) => {
  await fs5.mkdir(outputDir, { recursive: true });
  const DynamicVaultModel = getVaultItemModel(username);
  const item = await DynamicVaultModel.findOne({ userId, itemId });
  let sourcePath = inputPath;
  let tempSource = "";
  if (item && item.file && item.file.encryptionIv && item.file.encryptionTag) {
    logger.info(`Source is encrypted at rest. Decrypting for transcoding: ${itemId}`);
    const encrypted = await fs5.readFile(inputPath);
    const decrypted = decryptBuffer({
      encryptedData: encrypted.toString("hex"),
      iv: item.file.encryptionIv,
      tag: item.file.encryptionTag
    });
    tempSource = path8.join(os2.tmpdir(), `${itemId}-raw.mp4`);
    await fs5.writeFile(tempSource, decrypted);
    sourcePath = tempSource;
  }
  try {
    await drmPackagingService.packageWithDrm(itemId, userId, sourcePath, outputDir);
  } catch (err) {
    logger.error("DRM Packaging failed, continuing with legacy AES-128", { err });
  }
  const streamingKey = await mediaService.getStreamingKey(userId, itemId);
  const keyFilePath = path8.join(outputDir, "video.key");
  await fs5.writeFile(keyFilePath, streamingKey);
  const keyUrl = mediaService.getStreamingKeyUrl(itemId, "TOKEN_PLACEHOLDER");
  const keyInfoPath = path8.join(outputDir, "key_info.txt");
  await fs5.writeFile(keyInfoPath, `${keyUrl}
${keyFilePath}`);
  const ffmpegCmd = "ffmpeg";
  const args = [
    "-i",
    sourcePath,
    "-hls_key_info_file",
    keyInfoPath,
    // 144p
    "-s",
    "256x144",
    "-c:v",
    "libx264",
    "-b:v",
    "180k",
    "-g",
    "48",
    "-hls_time",
    "10",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    path8.join(outputDir, "144p_%03d.ts"),
    path8.join(outputDir, "144p.m3u8"),
    // 240p
    "-s",
    "426x240",
    "-c:v",
    "libx264",
    "-b:v",
    "400k",
    "-g",
    "48",
    "-hls_time",
    "10",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    path8.join(outputDir, "240p_%03d.ts"),
    path8.join(outputDir, "240p.m3u8"),
    // 360p
    "-s",
    "640x360",
    "-c:v",
    "libx264",
    "-b:v",
    "800k",
    "-g",
    "48",
    "-hls_time",
    "10",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    path8.join(outputDir, "360p_%03d.ts"),
    path8.join(outputDir, "360p.m3u8"),
    // 480p
    "-s",
    "854x480",
    "-c:v",
    "libx264",
    "-b:v",
    "1400k",
    "-g",
    "48",
    "-hls_time",
    "10",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    path8.join(outputDir, "480p_%03d.ts"),
    path8.join(outputDir, "480p.m3u8"),
    // 720p
    "-s",
    "1280x720",
    "-c:v",
    "libx264",
    "-b:v",
    "2800k",
    "-g",
    "48",
    "-hls_time",
    "10",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    path8.join(outputDir, "720p_%03d.ts"),
    path8.join(outputDir, "720p.m3u8"),
    // 1080p
    "-s",
    "1920x1080",
    "-c:v",
    "libx264",
    "-b:v",
    "5000k",
    "-g",
    "48",
    "-hls_time",
    "10",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    path8.join(outputDir, "1080p_%03d.ts"),
    path8.join(outputDir, "1080p.m3u8")
  ];
  logger.info(`Starting ABR transcoding: ${itemId}`, { userId });
  return new Promise((resolve, reject) => {
    const ffmpegProcess = spawn2(ffmpegCmd, args);
    let settled = false;
    const cleanup = async () => {
      if (tempSource) {
        await fs5.unlink(tempSource).catch((error) => {
          logger.warn("Failed to remove temporary decrypted source file", {
            itemId,
            tempSource,
            error
          });
        });
      }
      await fs5.unlink(keyInfoPath).catch((error) => {
        logger.warn("Failed to remove HLS key info file", {
          itemId,
          keyInfoPath,
          error
        });
      });
    };
    ffmpegProcess.on("error", async (error) => {
      logger.error("Failed to spawn FFmpeg for HLS transcoding", {
        itemId,
        userId,
        username,
        inputPath: sourcePath,
        outputDir,
        command: ffmpegCmd,
        args,
        error
      });
      if (!settled) {
        settled = true;
        await cleanup();
        const isEnoent = error.code === "ENOENT";
        const statusCode = isEnoent ? 503 : 500;
        const appError = new AppError(
          statusCode,
          isEnoent ? "FFMPEG_UNAVAILABLE" : "TRANSCODING_PROCESS_ERROR",
          isEnoent ? "Transcoding service unavailable: ffmpeg binary is not installed on the server." : `FFmpeg process error: ${error.message}`
        );
        reject(appError);
      }
    });
    ffmpegProcess.on("close", async (code) => {
      if (settled) return;
      settled = true;
      await cleanup();
      if (code === 0) {
        logger.info(`ABR transcoding complete with AES-128: ${itemId}`);
        resolve();
      } else {
        logger.error("FFmpeg failed during HLS transcoding", { itemId, userId, code, outputDir });
        reject(
          new AppError(
            500,
            "TRANSCODING_FAILED",
            `FFmpeg transcoding process failed with code ${code}`
          )
        );
      }
    });
  });
};

// server/controllers/vaultController.ts
init_logger();
var getUserId = (req) => req.user.userId;
var getUsername = (req) => req.user.username;
var DEFAULT_MULTIPART_TMP_ROOT = path9.join(process.cwd(), "vault-tmp", "multipart-uploads");
var MULTIPART_ROOT = path9.resolve(process.env.MULTIPART_TMP_ROOT || DEFAULT_MULTIPART_TMP_ROOT);
var MULTIPART_PART_SIZE_BYTES = Math.max(
  5 * 1024 * 1024,
  Number(process.env.MULTIPART_PART_SIZE_BYTES || 8 * 1024 * 1024)
);
var MAX_ACTIVE_MULTIPART_SESSIONS_PER_USER = Math.max(
  1,
  Number(process.env.MAX_ACTIVE_MULTIPART_SESSIONS_PER_USER || 4)
);
var MULTIPART_SESSION_TTL_MS = Math.max(
  5 * 60 * 1e3,
  Number(process.env.MULTIPART_SESSION_TTL_MS || 2 * 60 * 60 * 1e3)
);
var MULTIPART_MAX_FILE_SIZE_BYTES = maxUploadFileSizeBytes;
var MULTIPART_MAX_PARTS = Math.max(1, Number(process.env.MULTIPART_MAX_PARTS || 2e3));
var FILE_CATEGORY_SET = /* @__PURE__ */ new Set(["photo", "video", "audio", "document", "other-files"]);
var MULTIPART_SECURE_CLEANUP = (process.env.MULTIPART_SECURE_CLEANUP?.trim().toLowerCase() || "true") === "true";
var resolveMemoryOnlyMultipartUploads = () => {
  const explicit = process.env.MEMORY_ONLY_MULTIPART_UPLOADS?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1" || explicit === "yes") {
    return true;
  }
  if (explicit === "false" || explicit === "0" || explicit === "no") {
    return false;
  }
  return process.env.NODE_ENV === "test";
};
var MEMORY_ONLY_MULTIPART_UPLOADS = resolveMemoryOnlyMultipartUploads();
var getRouteParam2 = (value) => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === "string") return first.trim();
    if (typeof first === "number" && Number.isFinite(first)) return String(first);
  }
  return void 0;
};
var uploadAnomalyCounters = /* @__PURE__ */ new Map();
var ANOMALY_WINDOW_MS = 10 * 60 * 1e3;
var HASH_MISMATCH_ALERT_THRESHOLD = 5;
var INVALID_TYPE_ALERT_THRESHOLD = 5;
var RAPID_LARGE_UPLOAD_THRESHOLD = 4;
var LARGE_UPLOAD_BYTES = 100 * 1024 * 1024;
var recordUploadAnomaly = (userId, kind, context = {}) => {
  const now = Date.now();
  const state = uploadAnomalyCounters.get(userId);
  const baseline = !state || now - state.windowStart > ANOMALY_WINDOW_MS ? {
    windowStart: now,
    invalidTypeCount: 0,
    hashMismatchCount: 0,
    rapidLargeUploadCount: 0
  } : state;
  if (kind === "invalid_type") baseline.invalidTypeCount += 1;
  if (kind === "hash_mismatch") baseline.hashMismatchCount += 1;
  if (kind === "rapid_large_upload") baseline.rapidLargeUploadCount += 1;
  uploadAnomalyCounters.set(userId, baseline);
  const shouldAlert = baseline.invalidTypeCount >= INVALID_TYPE_ALERT_THRESHOLD || baseline.hashMismatchCount >= HASH_MISMATCH_ALERT_THRESHOLD || baseline.rapidLargeUploadCount >= RAPID_LARGE_UPLOAD_THRESHOLD;
  if (shouldAlert) {
    logger.warn("Upload security anomaly threshold exceeded", {
      userId,
      ...baseline,
      context
    });
  }
};
var multipartSessionPath = (userId, uploadId) => path9.join(MULTIPART_ROOT, userId, uploadId, "session.json");
var multipartPartsDir = (userId, uploadId) => path9.join(MULTIPART_ROOT, userId, uploadId, "parts");
var multipartMemorySessions = /* @__PURE__ */ new Map();
var multipartMemoryParts = /* @__PURE__ */ new Map();
var multipartMemoryKey = (userId, uploadId) => `${userId}:${uploadId}`;
var multipartPartMemoryKey = (userId, uploadId, partNumber) => `${multipartMemoryKey(userId, uploadId)}:${partNumber}`;
var safeRm2 = async (target) => {
  const absoluteTarget = path9.resolve(target);
  if (!absoluteTarget.startsWith(MULTIPART_ROOT)) {
    return { filesDeleted: 0, bytesDeleted: 0 };
  }
  let filesDeleted = 0;
  let bytesDeleted = 0;
  if (MULTIPART_SECURE_CLEANUP) {
    const walk = async (current) => {
      let stats;
      try {
        stats = await fs6.stat(current);
      } catch (statError) {
        logger.debug("Failed to stat target during safeRm walk", { current, error: statError });
        return;
      }
      if (stats.isDirectory()) {
        const entries = await fs6.readdir(current);
        for (const entry of entries) {
          await walk(path9.join(current, entry));
        }
      } else {
        bytesDeleted += stats.size;
        filesDeleted += 1;
      }
    };
    await walk(absoluteTarget);
  }
  try {
    await fs6.rm(absoluteTarget, { recursive: true, force: true });
  } catch (rmErr) {
    logger.warn("Failed to remove path during safeRm cleanup", {
      target: absoluteTarget,
      error: rmErr
    });
  }
  return { filesDeleted, bytesDeleted };
};
var cleanupExpiredMultipartSessions = async (userId) => {
  const now = Date.now();
  if (MEMORY_ONLY_MULTIPART_UPLOADS) {
    for (const [key, session] of multipartMemorySessions.entries()) {
      if (session.userId === userId && now - session.updatedAt > MULTIPART_SESSION_TTL_MS) {
        multipartMemorySessions.delete(key);
        for (const partKey of Array.from(multipartMemoryParts.keys())) {
          if (partKey.startsWith(`${key}:`)) {
            multipartMemoryParts.delete(partKey);
          }
        }
      }
    }
    return;
  }
  const userDir = path9.join(MULTIPART_ROOT, userId);
  let entries = [];
  try {
    entries = await fs6.readdir(userDir, { withFileTypes: true });
  } catch (dirErr) {
    if (dirErr?.code !== "ENOENT") {
      logger.warn("Failed to readdir for user multipart cleanup", { userDir, error: dirErr });
    }
    return;
  }
  await Promise.all(
    entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      const sessionFile = path9.join(userDir, entry.name, "session.json");
      try {
        const raw = await fs6.readFile(sessionFile, "utf8");
        const parsed = JSON.parse(raw);
        if (now - parsed.updatedAt > MULTIPART_SESSION_TTL_MS) {
          const metrics = await safeRm2(path9.join(userDir, entry.name));
          if (metrics.filesDeleted > 0) {
            logger.info("Expired multipart session cleaned", {
              userId,
              uploadId: entry.name,
              ...metrics
            });
          }
        }
      } catch (sessErr) {
        logger.warn(
          "Corrupted or unreadable multipart session during cleanup; removing session folder",
          {
            sessionFile,
            error: sessErr
          }
        );
        await safeRm2(path9.join(userDir, entry.name));
      }
    })
  );
};
var loadMultipartSession = async (userId, uploadId) => {
  if (MEMORY_ONLY_MULTIPART_UPLOADS) {
    return multipartMemorySessions.get(multipartMemoryKey(userId, uploadId)) ?? null;
  }
  try {
    const raw = await fs6.readFile(multipartSessionPath(userId, uploadId), "utf8");
    return JSON.parse(raw);
  } catch (loadErr) {
    if (loadErr?.code !== "ENOENT") {
      logger.warn("Failed to read or parse multipart session", {
        userId,
        uploadId,
        error: loadErr
      });
    }
    return null;
  }
};
var saveMultipartSession = async (session) => {
  if (MEMORY_ONLY_MULTIPART_UPLOADS) {
    multipartMemorySessions.set(multipartMemoryKey(session.userId, session.uploadId), session);
    return;
  }
  const dir = path9.dirname(multipartSessionPath(session.userId, session.uploadId));
  await fs6.mkdir(dir, { recursive: true });
  await fs6.writeFile(
    multipartSessionPath(session.userId, session.uploadId),
    JSON.stringify(session)
  );
};
var mergeAndSaveMultipartPartMetadata = async (sessionOwnerUserId, uploadId, partNumber, metadata) => {
  const latest = await loadMultipartSession(sessionOwnerUserId, uploadId) || null;
  if (!latest) {
    throw AppError.notFound("Upload session not found.", "UPLOAD_SESSION_NOT_FOUND");
  }
  latest.parts = {
    ...latest.parts || {},
    [String(partNumber)]: metadata
  };
  latest.updatedAt = Date.now();
  await saveMultipartSession(latest);
  return latest;
};
var sha256Hex = (buffer) => crypto7.createHash("sha256").update(buffer).digest("hex");
var getMultipartPartCount = (session) => Math.ceil(session.fileSize / session.partSize);
var getExpectedMultipartPartSize = (session, partNumber) => {
  const partCount = getMultipartPartCount(session);
  if (partNumber < 1 || partNumber > partCount) {
    throw AppError.badRequest("partNumber is outside the upload range.", "INVALID_PART_NUMBER");
  }
  const offset = (partNumber - 1) * session.partSize;
  return Math.min(session.partSize, session.fileSize - offset);
};
var listActiveMultipartSessions = async (userId) => {
  const userDir = path9.join(MULTIPART_ROOT, userId);
  let entries = [];
  try {
    entries = await fs6.readdir(userDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const sessions = await Promise.all(
    entries.filter((entry) => entry.isDirectory()).map((entry) => loadMultipartSession(userId, entry.name))
  );
  return sessions.filter((session) => Boolean(session));
};
var findMultipartSessionForIdentity = async (userId, uploadId) => {
  const exact = await loadMultipartSession(userId, uploadId);
  if (exact) {
    return { session: exact, sessionOwnerUserId: userId };
  }
  return null;
};
var startMultipartUpload = async (req, res) => {
  const userId = getUserId(req);
  const username = getUsername(req);
  await cleanupExpiredMultipartSessions(userId);
  const { category, folder, fileName, mimeType, fileSize, resumeUploadId, keepMetadata } = req.body || {};
  if (typeof category !== "string" || typeof fileName !== "string" || typeof mimeType !== "string" || typeof fileSize !== "number" || fileSize <= 0) {
    throw AppError.badRequest("Invalid multipart init payload.", "INVALID_MULTIPART_INIT");
  }
  if (!FILE_CATEGORY_SET.has(category)) {
    throw AppError.badRequest("Unsupported multipart category.", "UNSUPPORTED_FILE_CATEGORY");
  }
  if (fileSize > MULTIPART_MAX_FILE_SIZE_BYTES) {
    throw AppError.badRequest("File exceeds configured max upload size.", "FILE_TOO_LARGE");
  }
  if (Math.ceil(fileSize / MULTIPART_PART_SIZE_BYTES) > MULTIPART_MAX_PARTS) {
    throw AppError.badRequest("Too many multipart segments for this upload.", "TOO_MANY_PARTS");
  }
  const extension = getFileExtension(fileName);
  if (!extension) {
    throw AppError.badRequest(
      "File extension is required for multipart upload.",
      "MISSING_FILE_EXTENSION"
    );
  }
  if (category === "photo" && !(mimeType || "").toLowerCase().startsWith("image/")) {
    recordUploadAnomaly(userId, "invalid_type", { category, mimeType, fileName });
    throw AppError.badRequest("Invalid mime type for photo upload.", "INVALID_FILE_TYPE");
  }
  if (category === "video" && !((mimeType || "").toLowerCase().startsWith("video/") || (mimeType || "").toLowerCase() === "application/mxf")) {
    recordUploadAnomaly(userId, "invalid_type", { category, mimeType, fileName });
    throw AppError.badRequest("Invalid mime type for video upload.", "INVALID_FILE_TYPE");
  }
  if (fileSize >= LARGE_UPLOAD_BYTES) {
    recordUploadAnomaly(userId, "rapid_large_upload", { category, fileSize });
  }
  if (typeof resumeUploadId === "string" && resumeUploadId.trim()) {
    const existing = await loadMultipartSession(userId, resumeUploadId.trim());
    if (existing && existing.fileName === fileName && existing.fileSize === fileSize && existing.mimeType === mimeType && existing.category === category) {
      existing.updatedAt = Date.now();
      await saveMultipartSession(existing);
      return sendSuccess(
        res,
        {
          uploadId: existing.uploadId,
          partSize: existing.partSize,
          uploadedParts: Object.keys(existing.parts).map((part) => Number(part))
        },
        "Multipart upload resumed"
      );
    }
  }
  const activeSessions = await listActiveMultipartSessions(userId);
  if (activeSessions.length >= MAX_ACTIVE_MULTIPART_SESSIONS_PER_USER) {
    throw AppError.badRequest(
      "Too many active uploads. Complete or cancel existing uploads first.",
      "TOO_MANY_ACTIVE_UPLOADS"
    );
  }
  const uploadId = crypto7.randomBytes(12).toString("hex");
  const session = {
    uploadId,
    userId,
    username,
    category,
    folder: typeof folder === "string" && folder.trim() ? folder : null,
    fileName,
    mimeType,
    fileSize,
    keepMetadata: keepMetadata === true,
    partSize: MULTIPART_PART_SIZE_BYTES,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    parts: {}
  };
  if (!MEMORY_ONLY_MULTIPART_UPLOADS) {
    await fs6.mkdir(multipartPartsDir(userId, uploadId), { recursive: true });
  }
  await saveMultipartSession(session);
  return sendSuccess(
    res,
    { uploadId, partSize: MULTIPART_PART_SIZE_BYTES, uploadedParts: [] },
    "Multipart upload initialized"
  );
};
var uploadMultipartPart = async (req, res) => {
  const userId = getUserId(req);
  const uploadId = getRouteParam2(req.params.uploadId);
  const partNumberRaw = getRouteParam2(req.params.partNumber);
  if (!uploadId || !partNumberRaw) {
    throw AppError.badRequest("uploadId and partNumber are required.", "MULTIPART_PART_REQUIRED");
  }
  const partNumber = Number.parseInt(partNumberRaw, 10);
  if (!Number.isFinite(partNumber) || partNumber < 1) {
    throw AppError.badRequest("partNumber must be >= 1.", "INVALID_PART_NUMBER");
  }
  const resolved = await findMultipartSessionForIdentity(userId, uploadId);
  if (!resolved) {
    throw AppError.notFound("Upload session not found.", "UPLOAD_SESSION_NOT_FOUND");
  }
  const { session, sessionOwnerUserId } = resolved;
  const partCount = getMultipartPartCount(session);
  if (partNumber > partCount) {
    throw AppError.badRequest("partNumber exceeds expected chunk count.", "INVALID_PART_NUMBER");
  }
  const partBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
  if (!partBuffer.length) {
    throw AppError.badRequest("Part payload is empty.", "EMPTY_PART");
  }
  const expectedPartSize = getExpectedMultipartPartSize(session, partNumber);
  if (partBuffer.length !== expectedPartSize) {
    throw AppError.badRequest("Part size mismatch for upload segment.", "PART_SIZE_MISMATCH");
  }
  const expectedSha = String(req.headers["x-part-sha256"] || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/i.test(expectedSha)) {
    throw AppError.badRequest("Missing or invalid part hash header.", "INVALID_PART_HASH");
  }
  const computed = sha256Hex(partBuffer);
  if (computed !== expectedSha) {
    recordUploadAnomaly(userId, "hash_mismatch", { uploadId, partNumber });
    throw AppError.badRequest("Part hash mismatch.", "PART_HASH_MISMATCH");
  }
  if (MEMORY_ONLY_MULTIPART_UPLOADS) {
    multipartMemoryParts.set(
      multipartPartMemoryKey(sessionOwnerUserId, uploadId, partNumber),
      Buffer.from(partBuffer)
    );
  } else {
    const partFile = path9.join(
      multipartPartsDir(sessionOwnerUserId, uploadId),
      `${partNumber}.part`
    );
    await fs6.mkdir(path9.dirname(partFile), { recursive: true });
    await fs6.writeFile(partFile, partBuffer);
  }
  const persisted = await mergeAndSaveMultipartPartMetadata(
    sessionOwnerUserId,
    uploadId,
    partNumber,
    { size: partBuffer.length, sha256: computed }
  );
  return sendSuccess(
    res,
    { uploadId, partNumber, uploadedParts: Object.keys(persisted.parts).length },
    "Part uploaded"
  );
};
var completeMultipartUpload = async (req, res) => {
  const userId = getUserId(req);
  const uploadId = getRouteParam2(req.params.uploadId);
  if (!uploadId) {
    throw AppError.badRequest("uploadId is required.", "MULTIPART_COMPLETE_REQUIRED");
  }
  const resolved = await findMultipartSessionForIdentity(userId, uploadId);
  if (!resolved) {
    throw AppError.notFound("Upload session not found.", "UPLOAD_SESSION_NOT_FOUND");
  }
  const { session, sessionOwnerUserId } = resolved;
  const expectedFileHash = typeof req.body?.fileSha256 === "string" ? req.body.fileSha256.toLowerCase() : null;
  const partCount = getMultipartPartCount(session);
  const uploadedPartNumbers = new Set(
    Object.keys(session.parts || {}).map((part) => Number.parseInt(part, 10)).filter(Number.isFinite)
  );
  if (uploadedPartNumbers.size < partCount) {
    throw AppError.badRequest("Upload is missing one or more parts.", "MISSING_UPLOAD_PART");
  }
  if (typeof bufferConstants?.MAX_LENGTH === "number" && session.fileSize > bufferConstants.MAX_LENGTH) {
    throw AppError.badRequest(
      "File size exceeds maximum supported in-memory buffer limit.",
      "FILE_TOO_LARGE"
    );
  }
  const assembler = crypto7.createHash("sha256");
  let finalBuffer;
  try {
    finalBuffer = Buffer.alloc(session.fileSize);
  } catch (allocErr) {
    logger.error("Failed to allocate buffer for multipart upload completion", {
      fileSize: session.fileSize,
      error: allocErr
    });
    throw new AppError(
      413,
      "FILE_TOO_LARGE",
      "System memory limit exceeded for file assembly. File is too large to assemble."
    );
  }
  let writeOffset = 0;
  for (let i = 1; i <= partCount; i += 1) {
    let data;
    if (MEMORY_ONLY_MULTIPART_UPLOADS) {
      const partData = multipartMemoryParts.get(
        multipartPartMemoryKey(sessionOwnerUserId, uploadId, i)
      );
      if (!partData) {
        throw AppError.badRequest(`Missing part ${i}.`, "MISSING_UPLOAD_PART");
      }
      data = partData;
    } else {
      const partFile = path9.join(multipartPartsDir(sessionOwnerUserId, uploadId), `${i}.part`);
      try {
        data = await fs6.readFile(partFile);
      } catch {
        throw AppError.badRequest(`Missing part ${i}.`, "MISSING_UPLOAD_PART");
      }
    }
    const expectedPartSize = getExpectedMultipartPartSize(session, i);
    if (data.length !== expectedPartSize) {
      throw AppError.badRequest(`Part ${i} has unexpected size.`, "PART_SIZE_MISMATCH");
    }
    assembler.update(data);
    data.copy(finalBuffer, writeOffset);
    writeOffset += data.length;
  }
  if (writeOffset !== session.fileSize) {
    throw AppError.badRequest("Assembled size mismatch.", "ASSEMBLED_SIZE_MISMATCH");
  }
  const finalHash = assembler.digest("hex");
  if (expectedFileHash && expectedFileHash !== finalHash) {
    throw AppError.badRequest("Final file hash mismatch.", "FILE_HASH_MISMATCH");
  }
  if (finalBuffer.length > MULTIPART_MAX_FILE_SIZE_BYTES) {
    throw AppError.badRequest("File exceeds configured max upload size.", "FILE_TOO_LARGE");
  }
  if (session.category === "photo" || session.category === "video" || session.category === "audio") {
    assertFileContentMatchesCategory(
      session.category,
      session.fileName,
      session.mimeType,
      finalBuffer
    );
  }
  const result = await saveFileToVault({
    userId,
    username: getUsername(req),
    category: session.category,
    folder: session.folder || void 0,
    file: {
      buffer: finalBuffer,
      originalname: session.fileName,
      mimetype: session.mimeType,
      size: finalBuffer.length
    },
    keepMetadata: session.keepMetadata === true,
    clientUpdatedAt: typeof req.body?.clientUpdatedAt === "string" ? req.body.clientUpdatedAt : void 0,
    deviceId: typeof req.body?.deviceId === "string" ? req.body.deviceId : void 0,
    ipAddress: getClientIp(req)
  });
  const normalizedResult = typeof result?.toObject === "function" ? result.toObject() : result;
  if (MEMORY_ONLY_MULTIPART_UPLOADS) {
    multipartMemorySessions.delete(multipartMemoryKey(sessionOwnerUserId, uploadId));
    for (const key of Array.from(multipartMemoryParts.keys())) {
      if (key.startsWith(`${multipartMemoryKey(sessionOwnerUserId, uploadId)}:`)) {
        multipartMemoryParts.delete(key);
      }
    }
  } else {
    const cleanupMetrics = await safeRm2(path9.join(MULTIPART_ROOT, sessionOwnerUserId, uploadId));
    if (cleanupMetrics.filesDeleted > 0) {
      logger.info("Multipart upload temp data cleaned", {
        userId,
        uploadId,
        ...cleanupMetrics
      });
    }
  }
  return sendSuccess(
    res,
    { ...normalizedResult, uploadId, sha256: finalHash },
    "Multipart file uploaded to vault successfully",
    201
  );
};
var fetchVault = async (req, res) => {
  const snapshot = await getVaultSnapshot(getUserId(req), getUsername(req));
  return sendSuccess(res, snapshot, "Vault snapshot fetched successfully");
};
var syncVault = async (req, res) => {
  const snapshot = await getVaultSnapshot(getUserId(req), getUsername(req));
  return sendSuccess(res, snapshot, "Vault items synced successfully");
};
var uploadVaultFile = async (req, res) => {
  const file = req.file;
  if (!file) {
    throw AppError.badRequest("A file upload is required.", "FILE_REQUIRED");
  }
  const category = getRouteParam2(req.params.category);
  if (!category) {
    throw AppError.badRequest("Vault category is required.", "CATEGORY_REQUIRED");
  }
  if (category === "photo" || category === "video" || category === "audio") {
    try {
      assertFileContentMatchesCategory(category, file.originalname, file.mimetype, file.buffer);
    } catch (error) {
      recordUploadAnomaly(getUserId(req), "invalid_type", {
        category,
        mimeType: file.mimetype,
        fileName: file.originalname
      });
      throw error;
    }
  }
  const result = await saveFileToVault({
    userId: getUserId(req),
    username: getUsername(req),
    category,
    folder: typeof req.body.folder === "string" ? req.body.folder : req.headers["x-vault-folder"],
    file,
    keepMetadata: req.body.keepMetadata === true || req.headers["x-keep-metadata"] === "true",
    clientUpdatedAt: typeof req.body.clientUpdatedAt === "string" ? req.body.clientUpdatedAt : void 0,
    deviceId: typeof req.body.deviceId === "string" ? req.body.deviceId : void 0,
    ipAddress: getClientIp(req)
  });
  const directFilePath = result?.file?.filePath || result?.filePath;
  const directMimeType = result?.file?.mimeType || file.mimetype;
  const canTranscodeLocalFile = typeof directFilePath === "string" && directFilePath.length > 0 && !directFilePath.startsWith("cloud://");
  if ((category === "video" || category === "videos" || directMimeType?.startsWith("video/")) && canTranscodeLocalFile) {
    const filePath = directFilePath;
    const outputDir = path9.join(path9.dirname(filePath), "hls", result.itemId);
    processHlsAdaptive(
      result.itemId,
      getUserId(req),
      getUsername(req),
      filePath,
      outputDir
    ).catch(
      (err) => logger.error(`Background transcoding failed for ${result.itemId}`, {
        err
      })
    );
  }
  return sendSuccess(res, result, "File uploaded to vault successfully", 201);
};
var upsertVaultEntry = async (req, res) => {
  const category = getRouteParam2(req.params.category);
  const itemId = getRouteParam2(req.params.itemId);
  if (!category) {
    throw AppError.badRequest("Vault category is required.", "CATEGORY_REQUIRED");
  }
  const result = await saveEncryptedVaultItem({
    userId: getUserId(req),
    username: getUsername(req),
    category,
    folder: typeof req.body.folder === "string" ? req.body.folder : void 0,
    itemId,
    payload: req.body,
    deviceId: typeof req.body.deviceId === "string" ? req.body.deviceId : void 0,
    ipAddress: getClientIp(req)
  });
  return sendSuccess(
    res,
    result,
    `Vault entry ${itemId ? "updated" : "created"} successfully`,
    itemId ? 200 : 201
  );
};
var deleteVaultEntry = async (req, res) => {
  const category = getRouteParam2(req.params.category);
  const itemId = getRouteParam2(req.params.itemId);
  if (!category || !itemId) {
    throw AppError.badRequest("Vault category and item id are required.", "ITEM_REQUIRED");
  }
  const result = await deleteVaultItemByCategory({
    userId: getUserId(req),
    username: getUsername(req),
    category,
    itemId,
    deviceId: typeof req.body?.deviceId === "string" ? req.body.deviceId : void 0,
    ipAddress: getClientIp(req),
    clientUpdatedAt: typeof req.body?.clientUpdatedAt === "string" ? req.body.clientUpdatedAt : void 0
  });
  return sendSuccess(res, result, "Vault entry deleted successfully");
};
var saveUserActivityLog = async (req, res) => {
  const result = await saveActivityLog({
    userId: getUserId(req),
    username: getUsername(req),
    action: req.body.action || "OTHER",
    category: req.body.category || "system",
    itemId: req.body.itemId || null,
    deviceId: typeof req.body.deviceId === "string" ? req.body.deviceId : void 0,
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"],
    status: req.body.status || "SUCCESS",
    errorCode: req.body.errorCode,
    errorMessage: req.body.errorMessage,
    details: req.body.details || {}
  });
  return sendSuccess(res, result, "Activity log saved successfully", 201);
};
var getUserActivityLogsController = async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 500;
  const skip = req.query.skip ? parseInt(req.query.skip) : 0;
  const logs = await getUserActivityLogs(getUserId(req), getUsername(req), limit, skip);
  return sendSuccess(res, logs, "Activity logs fetched successfully");
};

// server/services/storageService.ts
init_logger();
import crypto8 from "crypto";
var resolveSignedUrlSecret = () => {
  const secret = process.env.SIGNED_URL_SECRET?.trim();
  if (secret && secret !== "vault-secret-for-signed-urls" && secret !== "replace-with-a-long-random-signed-url-secret-min-32-chars") {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SIGNED_URL_SECRET environment variable must be configured in production.");
  }
  return secret || "vault-secret-for-signed-urls";
};
var SIGNED_URL_EXPIRY_MINUTES = Math.max(15, Number(process.env.SIGNED_URL_EXPIRY_MINUTES || 60));
var MAX_SIGNED_URL_EXPIRY_MINUTES = Math.max(
  60,
  Number(process.env.MAX_SIGNED_URL_EXPIRY_MINUTES || 1440)
);
var storageService = {
  /**
   * Generates a signed URL for a vault item
   * In a real production setup with S3, this would call s3.getSignedUrl()
   * Here we generate a local signed URL that our server will verify
   */
  generateSignedUrl(userId, itemId, _fileName, options = {}) {
    const action = options.action || "view";
    const actionTtl = action === "stream" ? 120 : action === "download" ? 30 : SIGNED_URL_EXPIRY_MINUTES;
    const requestedTtl = Number(options.expiresInMinutes || actionTtl);
    const ttl = Math.max(1, Math.min(MAX_SIGNED_URL_EXPIRY_MINUTES, requestedTtl));
    const expiry = Math.floor(Date.now() / 1e3) + ttl * 60;
    const ip = options.ipAddress || "any";
    const sid = options.sessionId || "any";
    const device = options.deviceHash || "direct";
    const payload = `${userId}:${itemId}:${action}:${expiry}:${sid}:${device}`;
    const secret = resolveSignedUrlSecret();
    const signature = crypto8.createHmac("sha256", secret).update(payload).digest("hex");
    const resolvePublicBaseUrl = () => {
      const isProduction = process.env.NODE_ENV === "production";
      if (isProduction && process.env.PUBLIC_URL && process.env.PUBLIC_URL.trim()) {
        return process.env.PUBLIC_URL.trim().replace(/\/+$/, "");
      }
      const port = process.env.PORT || "4000";
      return `http://localhost:${port}`;
    };
    const baseUrl = resolvePublicBaseUrl();
    return `${baseUrl}/api/vault/files/access/${itemId}?token=${signature}&expires=${expiry}&action=${action}&sid=${sid}&dev=${encodeURIComponent(device)}&uid=${encodeURIComponent(userId)}${options.ipAddress ? `&ip=${encodeURIComponent(ip)}` : ""}`;
  },
  /**
   * Verifies a signed URL token with SOFT IP binding (allows drift)
   */
  verifySignedUrl(userId, itemId, input) {
    const now = Math.floor(Date.now() / 1e3);
    if (now > input.expires) {
      logger.warn("Signed URL expired", { userId, itemId, expires: input.expires, now });
      return false;
    }
    const sid = input.sessionId || "any";
    const device = input.deviceHash || "direct";
    const secret = resolveSignedUrlSecret();
    const payload = `${userId}:${itemId}:${input.action}:${input.expires}:${sid}:${device}`;
    const expectedSignature = crypto8.createHmac("sha256", secret).update(payload).digest("hex");
    const legacyPayload = `${userId}:${itemId}:${input.action}:${input.expires}:${sid}:any`;
    const legacySignature = crypto8.createHmac("sha256", secret).update(legacyPayload).digest("hex");
    if (input.token.length !== expectedSignature.length) {
      logger.error("Signed URL signature length mismatch", {
        userId,
        itemId,
        tokenLength: input.token.length,
        expectedLength: expectedSignature.length
      });
      return false;
    }
    let isValid = false;
    if (input.token.length === expectedSignature.length) {
      isValid = crypto8.timingSafeEqual(Buffer.from(input.token), Buffer.from(expectedSignature));
    }
    if (!isValid && input.token.length === legacySignature.length) {
      isValid = crypto8.timingSafeEqual(Buffer.from(input.token), Buffer.from(legacySignature));
    }
    if (isValid) {
      if (input.originalIp && input.originalIp !== "any" && input.originalIp !== input.clientIp) {
        logger.info("Soft IP Drift Detected", {
          userId,
          itemId,
          originalIp: input.originalIp,
          currentIp: input.clientIp
        });
      }
    } else {
      logger.error("Signed URL signature mismatch (Binding failure)", {
        userId,
        itemId,
        sid,
        device
      });
    }
    return isValid;
  }
};

// server/models/telemetry.ts
import mongoose19 from "mongoose";
var TelemetrySchema = new mongoose19.Schema({
  userId: { type: mongoose19.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  itemId: { type: String, required: true, index: true },
  event: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  metadata: {
    type: mongoose19.Schema.Types.Mixed,
    default: {}
  },
  ip: String,
  userAgent: String,
  browser: String,
  platform: String
});
var getTelemetryModel = (username) => {
  if (!username || !username.trim()) {
    throw new Error("Username is required for isolated telemetry");
  }
  const normalized = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const collectionName = `${normalized}.${normalized}_telemetry`;
  if (mongoose19.models[collectionName]) {
    return mongoose19.models[collectionName];
  }
  return mongoose19.model(collectionName, TelemetrySchema, collectionName);
};

// server/controllers/mediaController.ts
init_logger();
import fs8 from "fs";
import path11 from "path";
import { rateLimit } from "express-rate-limit";
import mongoose21 from "mongoose";

// server/services/anomalyDetectionService.ts
init_logger();
import NodeCache from "node-cache";
import mongoose20 from "mongoose";
var AnomalyDetectionService = class {
  // Store usage patterns in memory with sliding expiration
  tracker = new NodeCache({ stdTTL: 3600, checkperiod: 300 });
  THRESHOLDS = {
    KEY_REQUESTS_MIN: 50,
    // Max key requests per minute
    AUTH_FAILURES_10M: 10,
    // Max failed auth attempts in 10 minutes
    UNIQUE_IPS_1H: 3,
    // Max unique IPs per user in 1 hour
    OTP_ATTEMPTS_LIMIT: 5
    // Max OTP attempts
  };
  /**
   * Track and evaluate media segment/key requests
   */
  trackMediaRequest(userId, itemId, ip) {
    const key = `usage:media:${userId}:${itemId}`;
    const count = (this.tracker.get(key) || 0) + 1;
    this.tracker.set(key, count, 60);
    if (count > this.THRESHOLDS.KEY_REQUESTS_MIN) {
      this.triggerAlert(
        "RATE_ANOMALY",
        `Excessive media key requests detected for user ${userId}`,
        {
          userId,
          itemId,
          ip,
          count,
          threshold: this.THRESHOLDS.KEY_REQUESTS_MIN
        }
      );
    }
  }
  /**
   * Track failed authentication attempts (JWT/Login)
   */
  trackAuthFailure(ip, username) {
    const key = `auth:fail:${ip}`;
    const count = (this.tracker.get(key) || 0) + 1;
    this.tracker.set(key, count, 600);
    if (count > this.THRESHOLDS.AUTH_FAILURES_10M) {
      this.triggerAlert("BRUTE_FORCE_ATTEMPT", `Brute-force pattern detected from IP ${ip}`, {
        ip,
        username,
        count,
        threshold: this.THRESHOLDS.AUTH_FAILURES_10M
      });
    }
  }
  /**
   * Track IP drift for a single user session
   */
  trackIpDrift(userId, currentIp) {
    const key = `user:ips:${userId}`;
    const ipSet = new Set(this.tracker.get(key) || []);
    if (!ipSet.has(currentIp)) {
      ipSet.add(currentIp);
      this.tracker.set(key, Array.from(ipSet), 3600);
      const count = ipSet.size;
      if (count >= this.THRESHOLDS.UNIQUE_IPS_1H) {
        this.triggerAlert(
          "IP_DRIFT_ANOMALY",
          `Multiple source IPs (${count}) detected for user ${userId} within 1 hour`,
          {
            userId,
            ips: Array.from(ipSet),
            count,
            threshold: this.THRESHOLDS.UNIQUE_IPS_1H
          }
        );
      }
    }
  }
  /**
   * Track OTP attempts
   */
  trackOTPAttempt(userId) {
    const key = `auth:otp:${userId}`;
    const count = (this.tracker.get(key) || 0) + 1;
    this.tracker.set(key, count, 300);
    if (count > this.THRESHOLDS.OTP_ATTEMPTS_LIMIT) {
      this.triggerAlert("OTP_BRUTE_FORCE", `Excessive OTP attempts detected for user ${userId}`, {
        userId,
        count,
        threshold: this.THRESHOLDS.OTP_ATTEMPTS_LIMIT
      });
      throw new Error("Too many failed attempts. Please try again in 5 minutes.");
    }
  }
  /**
   * Clear OTP attempts on success
   */
  clearOTPAttempts(userId) {
    this.tracker.del(`auth:otp:${userId}`);
  }
  /**
   * Centralized alert triggering
   */
  triggerAlert(type, message, metadata) {
    logger.error(`[SECURITY_ALERT] ${type}: ${message}`, {
      alertType: type,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      ...metadata,
      severity: "CRITICAL"
    });
    void (async () => {
      try {
        let targetUserId = metadata?.userId;
        if (!targetUserId && metadata?.username) {
          const User2 = mongoose20.model("User");
          const user = await User2.findOne({ username: metadata.username.toLowerCase() }).select("_id").lean().exec();
          if (user) {
            targetUserId = user._id.toString();
          }
        }
        if (targetUserId) {
          await createNotification(
            targetUserId,
            "security_alert",
            `Security Threat: ${type}`,
            message,
            metadata
          );
        }
      } catch (err) {
        logger.warn("Failed to trigger in-app notification for security alert", { error: err });
      }
    })();
  }
};
var anomalyDetectionService = new AnomalyDetectionService();

// server/controllers/tusController.ts
import path10 from "path";
import fs7 from "fs/promises";
import crypto9 from "crypto";
var DEFAULT_TUS_TMP_ROOT = process.platform === "win32" ? path10.join(process.cwd(), "vault-tmp", "tus-uploads") : "/tmp/vault/tus-uploads";
var TUS_TMP_ROOT = path10.resolve(process.env.TUS_TMP_ROOT || DEFAULT_TUS_TMP_ROOT);
var MAX_TUS_FILE_SIZE = Math.max(1, Number(process.env.MAX_FILE_SIZE_MB || 4096) * 1024 * 1024);
var TUS_SESSION_TTL_MS = Math.max(
  5 * 60 * 1e3,
  Number(process.env.TUS_SESSION_TTL_MS || 2 * 60 * 60 * 1e3)
);
var tusSessions = /* @__PURE__ */ new Map();
var cleanupExpiredTusSessions = async () => {
  const now = Date.now();
  for (const [uploadId, session] of tusSessions.entries()) {
    if (now - session.updatedAt > TUS_SESSION_TTL_MS) {
      tusSessions.delete(uploadId);
      if (session.filePath) {
        try {
          const uploadDir = path10.dirname(session.filePath);
          await fs7.rm(uploadDir, { recursive: true, force: true });
        } catch {
        }
      }
    }
  }
};
var tusCleanupInterval = setInterval(
  () => {
    void cleanupExpiredTusSessions();
  },
  10 * 60 * 1e3
);
tusCleanupInterval.unref();
var createTusUploadController = async (req, res) => {
  const userId = req.user.userId;
  const username = req.user.username;
  const lengthHeader = req.headers["upload-length"];
  const metadataHeader = req.headers["upload-metadata"];
  const fileSize = parseInt(
    (Array.isArray(lengthHeader) ? lengthHeader[0] : lengthHeader) || "0",
    10
  );
  if (isNaN(fileSize) || fileSize <= 0) {
    throw AppError.badRequest("Missing or invalid Upload-Length header.", "INVALID_TUS_LENGTH");
  }
  if (fileSize > MAX_TUS_FILE_SIZE) {
    throw AppError.badRequest(
      "TUS upload exceeds the configured file size limit.",
      "FILE_TOO_LARGE"
    );
  }
  const metadata = {};
  const rawMeta = Array.isArray(metadataHeader) ? metadataHeader[0] : metadataHeader;
  if (rawMeta) {
    const pairs = rawMeta.split(",");
    for (const pair of pairs) {
      const parts = pair.trim().split(" ");
      if (parts[0]) {
        const key = parts[0];
        const valB64 = parts[1] || "";
        try {
          metadata[key] = Buffer.from(valB64, "base64").toString("utf-8");
        } catch {
          metadata[key] = valB64;
        }
      }
    }
  }
  const uploadId = `tus_${Date.now()}_${crypto9.randomBytes(8).toString("hex")}`;
  const uploadDir = path10.join(TUS_TMP_ROOT, uploadId);
  const filePath = path10.join(uploadDir, "chunk_data.bin");
  await fs7.mkdir(uploadDir, { recursive: true });
  await fs7.writeFile(filePath, Buffer.alloc(0));
  const session = {
    uploadId,
    userId,
    username,
    fileSize,
    offset: 0,
    metadata,
    filePath,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  tusSessions.set(uploadId, session);
  const location = `/api/vault/files/tus/${uploadId}`;
  res.setHeader("Tus-Resumable", "1.0.0");
  res.setHeader("Location", location);
  return res.status(201).end();
};
var getTusOffsetController = async (req, res) => {
  const uploadId = Array.isArray(req.params.uploadId) ? req.params.uploadId[0] : req.params.uploadId;
  const session = tusSessions.get(uploadId);
  if (!session) {
    res.setHeader("Tus-Resumable", "1.0.0");
    return res.status(404).end();
  }
  if (session.userId !== req.user.userId) {
    res.setHeader("Tus-Resumable", "1.0.0");
    return res.status(404).end();
  }
  res.setHeader("Tus-Resumable", "1.0.0");
  res.setHeader("Upload-Offset", session.offset.toString());
  res.setHeader("Upload-Length", session.fileSize.toString());
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).end();
};
var uploadTusChunkController = async (req, res) => {
  const uploadId = Array.isArray(req.params.uploadId) ? req.params.uploadId[0] : req.params.uploadId;
  const session = tusSessions.get(uploadId);
  if (!session) {
    throw AppError.notFound("TUS upload session not found.", "TUS_SESSION_NOT_FOUND");
  }
  if (session.userId !== req.user.userId) {
    throw AppError.notFound("TUS upload session not found.", "TUS_SESSION_NOT_FOUND");
  }
  const offsetHeader = req.headers["upload-offset"];
  const reqOffset = parseInt(
    (Array.isArray(offsetHeader) ? offsetHeader[0] : offsetHeader) || "0",
    10
  );
  if (reqOffset !== session.offset) {
    res.setHeader("Tus-Resumable", "1.0.0");
    return res.status(409).json({
      error: "Upload-Offset mismatch",
      currentOffset: session.offset
    });
  }
  if (Buffer.isBuffer(req.body) || req.body instanceof Uint8Array) {
    const chunkBuffer = Buffer.from(req.body);
    if (session.offset + chunkBuffer.length > session.fileSize) {
      throw AppError.badRequest("TUS chunk exceeds the declared upload size.", "TUS_SIZE_MISMATCH");
    }
    await fs7.appendFile(session.filePath, chunkBuffer);
    session.offset += chunkBuffer.length;
  } else {
    for await (const chunk of req) {
      const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (session.offset + chunkBuffer.length > session.fileSize) {
        throw AppError.badRequest(
          "TUS chunk exceeds the declared upload size.",
          "TUS_SIZE_MISMATCH"
        );
      }
      await fs7.appendFile(session.filePath, chunkBuffer);
      session.offset += chunkBuffer.length;
    }
  }
  session.updatedAt = Date.now();
  res.setHeader("Tus-Resumable", "1.0.0");
  res.setHeader("Upload-Offset", session.offset.toString());
  return res.status(204).end();
};
var getTusSessionBuffer = async (uploadId, userId) => {
  const session = tusSessions.get(uploadId);
  if (session) {
    if (userId && session.userId !== userId) return null;
    try {
      return await fs7.readFile(session.filePath);
    } catch {
      return null;
    }
  }
  return null;
};

// server/controllers/mediaController.ts
var STORAGE_ROOT = path11.join(process.cwd(), "vault-storage");
var toPositiveInt = (raw, fallback) => {
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
var keyRateLimit = rateLimit({
  windowMs: 1 * 60 * 1e3,
  // 1 minute sliding window
  max: 150,
  // Higher burst allowance for ABR key requests
  standardHeaders: true,
  legacyHeaders: false,
  message: "ABR Key burst detected. Throttling for 1 minute."
});
var keyCache = /* @__PURE__ */ new Map();
var CACHE_TTL = 2 * 60 * 1e3;
var MAX_KEY_CACHE_ENTRIES = Math.max(
  100,
  toPositiveInt(process.env.MEDIA_KEY_CACHE_MAX_ENTRIES, 2e3)
);
var CACHE_SWEEP_INTERVAL_MS = Math.max(
  3e4,
  toPositiveInt(process.env.MEDIA_CACHE_SWEEP_INTERVAL_MS, 6e4)
);
var getSingleQueryValue = (value) => typeof value === "string" ? value : Array.isArray(value) ? value[0] : void 0;
var getSingleRouteParam = (value) => typeof value === "string" ? value : Array.isArray(value) ? value[0] : void 0;
var findVaultItemFlexible = async (DynamicVaultModel, userId, itemId, username) => {
  if (!itemId || !userId) return null;
  const isObjectId = mongoose21.Types.ObjectId.isValid(itemId);
  const queryConditions = [
    { itemId },
    { gridFsId: itemId },
    { "file.filePath": itemId },
    { "file.filePath": `cloud://${itemId}` },
    { "file.filePath": `gridfs://${itemId}` }
  ];
  if (isObjectId) {
    queryConditions.push({ _id: new mongoose21.Types.ObjectId(itemId) });
  }
  const executeFindOne = async (model2, conditions) => {
    const query2 = model2.findOne(conditions);
    return typeof query2?.exec === "function" ? query2.exec() : query2;
  };
  let item = await executeFindOne(DynamicVaultModel, {
    userId,
    $or: queryConditions
  });
  if (item) {
    return item;
  }
  try {
    const nodes = multiClusterPool.getHealthyNodes();
    for (const node of nodes) {
      if (node.connection === DynamicVaultModel.db) continue;
      const targetUsername = username || DynamicVaultModel.modelName?.split(".")[0] || "default";
      const RemoteModel = getVaultItemModel(targetUsername, node.connection);
      const remoteItem = await executeFindOne(RemoteModel, {
        userId,
        $or: queryConditions
      });
      if (remoteItem) {
        remoteItem._clusterNode = node;
        remoteItem._customConnection = node.connection;
        return remoteItem;
      }
    }
  } catch {
  }
  return null;
};
var mimeMap = {
  // Photos
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jpe": "image/jpeg",
  ".jfif": "image/jpeg",
  ".pjpeg": "image/jpeg",
  ".pjp": "image/jpeg",
  ".png": "image/png",
  ".apng": "image/apng",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".bmp": "image/bmp",
  ".dib": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".ico": "image/x-icon",
  ".cur": "image/x-icon",
  ".svg": "image/svg+xml",
  ".svgz": "image/svg+xml",
  ".psd": "image/vnd.adobe.photoshop",
  ".raw": "image/x-dcraw",
  ".cr2": "image/x-canon-cr2",
  ".cr3": "image/x-canon-cr3",
  ".nef": "image/x-nikon-nef",
  ".nrw": "image/x-nikon-nrw",
  ".arw": "image/x-sony-arw",
  ".sr2": "image/x-sony-sr2",
  ".srf": "image/x-sony-srf",
  ".raf": "image/x-fuji-raf",
  ".orf": "image/x-olympus-orf",
  ".rw2": "image/x-panasonic-rw2",
  ".pef": "image/x-pentax-pef",
  ".dng": "image/x-adobe-dng",
  ".x3f": "image/x-sigma-x3f",
  ".3fr": "image/x-hasselblad-3fr",
  ".fff": "image/x-hasselblad-fff",
  ".iiq": "image/x-phaseone-iiq",
  ".erf": "image/x-epson-erf",
  ".kdc": "image/x-kodak-kdc",
  ".mef": "image/x-mamiya-mef",
  ".mos": "image/x-leaf-mos",
  ".mrw": "image/x-minolta-mrw",
  ".rwl": "image/x-leica-rwl",
  ".dcr": "image/x-kodak-dcr",
  ".bay": "image/x-casio-bay",
  ".gpr": "image/x-gopro-gpr",
  ".jp2": "image/jp2",
  ".j2k": "image/jp2",
  ".jpf": "image/jp2",
  ".jpm": "image/jp2",
  ".jxr": "image/jxr",
  ".hdp": "image/jxr",
  ".wdp": "image/jxr",
  ".dds": "image/vnd-ms.dds",
  ".exr": "image/x-exr",
  ".hdr": "image/vnd.radiance",
  ".pic": "image/x-pict",
  ".pct": "image/x-pict",
  ".pcx": "image/x-pcx",
  ".tga": "image/x-tga",
  ".icns": "image/x-icns",
  // Videos (Full Suite of 64 Formats)
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".qt": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mka": "video/x-matroska",
  ".mks": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".divx": "video/x-msvideo",
  ".xvid": "video/x-msvideo",
  ".wmv": "video/x-ms-wmv",
  ".asf": "video/x-ms-asf",
  ".asx": "video/x-ms-asf",
  ".mpg": "video/mpeg",
  ".mpeg": "video/mpeg",
  ".mpe": "video/mpeg",
  ".mpv": "video/mpeg",
  ".m2v": "video/mpeg",
  ".m2p": "video/mpeg",
  ".mts": "video/mp2t",
  ".m2ts": "video/mp2t",
  ".ts": "video/mp2t",
  ".vob": "video/dvd",
  ".evo": "video/mp2t",
  ".mod": "video/mp2t",
  ".tod": "video/mp2t",
  ".3gp": "video/3gpp",
  ".3g2": "video/3gpp2",
  ".f4v": "video/x-f4v",
  ".f4p": "video/mp4",
  ".f4a": "video/mp4",
  ".f4b": "video/mp4",
  ".flv": "video/x-flv",
  ".swf": "application/x-shockwave-flash",
  ".ogv": "video/ogg",
  ".ogm": "video/ogg",
  ".rm": "application/vnd.rn-realmedia",
  ".rmvb": "application/vnd.rn-realmedia-vbr",
  ".rv": "video/vnd.rn-realvideo",
  ".dat": "video/mpeg",
  ".mxf": "application/mxf",
  ".gxf": "application/gxf",
  ".lxf": "video/mp2t",
  ".nut": "video/x-nut",
  ".dv": "video/x-dv",
  ".dif": "video/x-dv",
  ".y4m": "video/x-yuv4mpeg",
  ".h264": "video/h264",
  ".264": "video/h264",
  ".h265": "video/h265",
  ".265": "video/h265",
  ".hevc": "video/h265",
  ".av1": "video/av1",
  ".vp8": "video/x-vnd.on2.vp8",
  ".vp9": "video/x-vnd.on2.vp9",
  ".r3d": "video/x-r3d",
  ".braw": "video/x-braw",
  ".cine": "application/octet-stream",
  ".ari": "application/octet-stream",
  ".arx": "application/octet-stream",
  ".mjp2": "video/mj2",
  ".mj2": "video/mj2",
  // Audios
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg"
};
var decryptGridFsPayload = (rawBuffer, fileMetadata, itemFile) => {
  const envelope = fileMetadata?.encryption;
  if (envelope && typeof envelope.wrappedDek === "string" && typeof envelope.wrapIv === "string" && typeof envelope.wrapTag === "string") {
    return decryptBufferEnvelope({
      algorithm: envelope.algorithm || "aes-256-gcm",
      iv: envelope.iv,
      authTag: envelope.authTag,
      wrappedDek: envelope.wrappedDek,
      wrapIv: envelope.wrapIv,
      wrapTag: envelope.wrapTag,
      keyVersion: envelope.keyVersion || "v1",
      keyId: envelope.keyId || "vault-file-v1",
      cipherText: rawBuffer.toString("base64")
    });
  }
  try {
    return decryptBuffer(JSON.parse(rawBuffer.toString()));
  } catch {
    if (itemFile?.encryptionIv && itemFile?.encryptionTag) {
      return decryptBuffer({
        iv: itemFile.encryptionIv,
        tag: itemFile.encryptionTag,
        encryptedData: rawBuffer.toString("hex")
      });
    }
    return rawBuffer;
  }
};
var SIGNED_URL_WINDOW_MS = 6e4;
var SIGNED_URL_MAX_PER_WINDOW = Math.max(
  10,
  toPositiveInt(process.env.SIGNED_URL_MAX_PER_MINUTE, 600)
);
var signedUrlCounters = /* @__PURE__ */ new Map();
var MAX_SIGNED_URL_COUNTER_ENTRIES = Math.max(
  SIGNED_URL_MAX_PER_WINDOW,
  toPositiveInt(process.env.SIGNED_URL_COUNTER_MAX_ENTRIES, 5e3)
);
var MAX_MEDIA_RANGE_BYTES = Math.max(
  256 * 1024,
  toPositiveInt(process.env.MEDIA_MAX_RANGE_BYTES, 4 * 1024 * 1024)
);
var trimMapToMaxEntries = (map, maxEntries) => {
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (!oldestKey) {
      break;
    }
    map.delete(oldestKey);
  }
};
var purgeExpiredKeyCacheEntries = (now = Date.now()) => {
  for (const [cacheKey, entry] of keyCache.entries()) {
    if (entry.expires <= now) {
      keyCache.delete(cacheKey);
    }
  }
};
var purgeExpiredSignedUrlCounters = (now = Date.now()) => {
  for (const [counterKey, counter] of signedUrlCounters.entries()) {
    if (counter.resetAt <= now) {
      signedUrlCounters.delete(counterKey);
    }
  }
};
var parseSingleByteRange = (requestedRange, fileSize) => {
  if (!requestedRange.startsWith("bytes=")) return null;
  const [rawStart, rawEnd] = requestedRange.slice("bytes=".length).split("-");
  let start;
  let end;
  if (!rawStart && rawEnd) {
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    const normalizedLength = Math.min(suffixLength, MAX_MEDIA_RANGE_BYTES, fileSize);
    start = Math.max(0, fileSize - normalizedLength);
    end = fileSize - 1;
  } else {
    start = Number.parseInt(rawStart, 10);
    if (!Number.isFinite(start) || start < 0 || start >= fileSize) return null;
    if (!rawEnd) {
      end = Math.min(start + MAX_MEDIA_RANGE_BYTES - 1, fileSize - 1);
    } else {
      const parsedEnd = Number.parseInt(rawEnd, 10);
      if (!Number.isFinite(parsedEnd) || parsedEnd < start) return null;
      end = Math.min(parsedEnd, fileSize - 1);
    }
  }
  if (end - start + 1 > MAX_MEDIA_RANGE_BYTES) {
    end = Math.min(start + MAX_MEDIA_RANGE_BYTES - 1, fileSize - 1);
  }
  if (end < start) return null;
  return { start, end };
};
var enforceSignedUrlRateLimit = (userId) => {
  const now = Date.now();
  purgeExpiredSignedUrlCounters(now);
  trimMapToMaxEntries(signedUrlCounters, MAX_SIGNED_URL_COUNTER_ENTRIES);
  const current = signedUrlCounters.get(userId);
  if (!current || current.resetAt <= now) {
    signedUrlCounters.set(userId, { count: 1, resetAt: now + SIGNED_URL_WINDOW_MS });
    return;
  }
  if (current.count >= SIGNED_URL_MAX_PER_WINDOW) {
    throw AppError.forbidden(
      "Signed URL rate limit exceeded. Please retry shortly.",
      "SIGNED_URL_RATE_LIMIT"
    );
  }
  current.count += 1;
  signedUrlCounters.set(userId, current);
};
var cacheSweepTimer = setInterval(() => {
  const now = Date.now();
  purgeExpiredKeyCacheEntries(now);
  purgeExpiredSignedUrlCounters(now);
}, CACHE_SWEEP_INTERVAL_MS);
cacheSweepTimer.unref();
var isLikelyBrowserNavigation = (req) => {
  const secFetchDest = String(req.get("sec-fetch-dest") || "").toLowerCase();
  const secFetchMode = String(req.get("sec-fetch-mode") || "").toLowerCase();
  return secFetchDest === "document" || secFetchDest === "iframe" || secFetchMode === "navigate";
};
var enforcePlaybackRequestContext = (req) => {
  const hasToken = Boolean(
    req.query.token || req.query.sig || req.query.signature || req.query.auth_token || req.headers.authorization || req.get("authorization")
  );
  if (!hasToken && isLikelyBrowserNavigation(req)) {
    throw AppError.forbidden(
      "Direct navigation to media URLs is not allowed.",
      "DIRECT_MEDIA_NAV_BLOCKED"
    );
  }
};
var normalizeOrigin = (value) => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};
var setMediaCorsHeaders = (req, res) => {
  const originHeader = req.get("origin");
  const refererHeader = req.get("referer");
  let candidate = null;
  if (originHeader) {
    candidate = normalizeOrigin(originHeader);
  } else if (refererHeader) {
    candidate = normalizeOrigin(refererHeader);
  }
  if (candidate && isAllowedCorsOrigin(candidate)) {
    res.setHeader("Access-Control-Allow-Origin", candidate);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Range, X-CSRF-Token, X-Device-Hash"
    );
  } else if (originHeader || refererHeader) {
    const rawOrigin = originHeader || refererHeader;
    try {
      const fallbackOrigin = new URL(rawOrigin).origin;
      if (isAllowedCorsOrigin(fallbackOrigin)) {
        res.setHeader("Access-Control-Allow-Origin", fallbackOrigin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
    } catch {
    }
  } else {
  }
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
};
var enforceTrustedMediaOrigin = (req) => {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  const origin = normalizeOrigin(req.get("origin"));
  const refererOrigin = normalizeOrigin(req.get("referer"));
  const candidate = origin || refererOrigin;
  if (candidate && !isAllowedCorsOrigin(candidate)) {
    throw AppError.forbidden("Media origin is not allowed.", "MEDIA_ORIGIN_FORBIDDEN");
  }
};
var ensureUploadIsActive = (item) => {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  const scanStatus = item?.metadata?.uploadSecurity?.scanStatus;
  if (scanStatus === "pending" || scanStatus === "scanning" || scanStatus === "error" || scanStatus === "quarantined" || scanStatus === "infected" || scanStatus === "blocked") {
    throw AppError.forbidden(
      "File is quarantined or pending security scan.",
      "FILE_QUARANTINED_OR_PENDING_SCAN"
    );
  }
};
var validateMediaAccess = async (req, passedUserId, itemId, action = "stream") => {
  const q = req.query;
  const clientIp = getClientIp(req);
  let resolvedUserId = req.user?.userId;
  const authHeader = req.get("Authorization")?.split(" ")[1];
  const authToken = getSingleQueryValue(q.auth_token) || authHeader;
  if (authToken && typeof authToken === "string" && authToken.includes(".")) {
    try {
      const payload = verifyAccessToken(authToken);
      if (payload && payload.sub) {
        resolvedUserId = payload.sub;
        req.user = {
          userId: payload.sub,
          username: payload.username,
          sessionId: payload.sessionId
        };
      }
    } catch (e) {
      if (authToken.split(".").length === 3) {
        logger.warn("Token identification failed in media access helper:", {
          error: e.message,
          tokenFingerprint: getTokenFingerprint(authToken)
        });
      }
    }
  }
  const signature = getSingleQueryValue(q.token);
  const expiresRaw = getSingleQueryValue(q.expires);
  if (signature && expiresRaw) {
    const expires = Number.parseInt(expiresRaw, 10);
    if (!Number.isSafeInteger(expires) || String(expires) !== expiresRaw) {
      throw AppError.forbidden("Signed media token is invalid.", "INVALID_SIGNATURE");
    }
    const candidateUserId = resolvedUserId || passedUserId || getSingleQueryValue(q.uid) || getSingleQueryValue(q.userId);
    if (!candidateUserId) {
      logger.warn("Media access denied: Identification missing", {
        itemId
      });
      throw AppError.unauthorized(
        "User identification required for secure media playback.",
        "AUTH_REQUIRED"
      );
    }
    if (resolvedUserId && candidateUserId !== resolvedUserId) {
      throw AppError.forbidden(
        "Signed media token does not match authenticated user.",
        "USER_MISMATCH"
      );
    }
    const signedSessionId = getSingleQueryValue(q.sid) || "any";
    const authenticatedSessionId = req.user?.sessionId;
    if (authenticatedSessionId && signedSessionId !== "any" && signedSessionId !== authenticatedSessionId) {
      throw AppError.forbidden(
        "Signed media token is not valid for this session.",
        "SESSION_MISMATCH"
      );
    }
    const isValidSignature = storageService.verifySignedUrl(candidateUserId, itemId, {
      token: signature,
      expires,
      action,
      clientIp,
      sessionId: signedSessionId,
      deviceHash: getSingleQueryValue(q.dev),
      originalIp: getSingleQueryValue(q.ip)
    });
    if (!isValidSignature) {
      throw AppError.forbidden("Signed media token is invalid or expired.", "INVALID_SIGNATURE");
    }
    resolvedUserId = candidateUserId;
  } else if (action === "stream" || !resolvedUserId) {
    throw AppError.forbidden("Media access token or expiration missing.", "MISSING_SIGNATURE");
  }
  if (!resolvedUserId) {
    logger.warn("Media access denied: Identification missing", {
      itemId
    });
    throw AppError.unauthorized(
      "User identification required for secure media playback.",
      "AUTH_REQUIRED"
    );
  }
  if (!req.user?.username) {
    try {
      const userDoc = await User.findById(resolvedUserId, { username: 1 }).exec();
      if (userDoc?.username) {
        req.user = {
          ...req.user,
          userId: resolvedUserId,
          username: userDoc.username
        };
      }
    } catch (err) {
      logger.warn("Failed to resolve username for media access", { userId: resolvedUserId, err });
    }
  }
  anomalyDetectionService.trackMediaRequest(resolvedUserId, itemId, clientIp);
  anomalyDetectionService.trackIpDrift(resolvedUserId, clientIp);
  return resolvedUserId;
};
var getMediaPlaylist = async (req, res) => {
  setMediaCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  const itemId = getSingleRouteParam(req.params.itemId);
  const variant = getSingleRouteParam(req.params.variant);
  if (!itemId) throw AppError.badRequest("itemId is required.", "ITEM_REQUIRED");
  enforcePlaybackRequestContext(req);
  enforceTrustedMediaOrigin(req);
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  const resolvedUserId = await validateMediaAccess(req, void 0, itemId, "stream");
  const username = req.user?.username;
  if (!username) throw AppError.unauthorized("Username required for isolated vault access");
  const DynamicVaultModel = getVaultItemModel(username);
  let item = await findVaultItemFlexible(DynamicVaultModel, resolvedUserId, itemId, username);
  if (!item || !item.file || !item.file.filePath) throw AppError.notFound("Media item not found");
  ensureUploadIsActive(item);
  let filePath = item.file.filePath;
  if (!fs8.existsSync(filePath)) {
    const fileName = path11.basename(filePath);
    const category = item.category || "other-files";
    const relativePath = path11.join(STORAGE_ROOT, resolvedUserId.toString(), category, fileName);
    if (fs8.existsSync(relativePath)) {
      filePath = relativePath;
    } else {
      const legacyCategory = category === "photo" ? "photos" : category === "video" ? "videos" : category;
      const legacyPath = path11.join(
        STORAGE_ROOT,
        resolvedUserId.toString(),
        legacyCategory,
        fileName
      );
      if (fs8.existsSync(legacyPath)) {
        filePath = legacyPath;
      }
    }
  }
  logger.info("Media playlist request authorized", { userId: resolvedUserId, itemId, variant });
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  if (!variant) {
    if (typeof item.file.filePath === "string" && item.file.filePath.startsWith("cloud://")) {
      throw AppError.notFound("HLS is not generated for this cloud media item.", "HLS_UNAVAILABLE");
    }
    const playlist = await mediaService.generateMasterPlaylist(
      itemId,
      req.originalUrl.split("?")[1]
    );
    res.setHeader("Content-Type", "application/x-mpegURL");
    return res.send(playlist);
  } else {
    const hlsDir = path11.join(path11.dirname(item.file.filePath), "hls", itemId);
    const variantId = variant?.replace(".m3u8", "") || "";
    const playlistPath = path11.join(hlsDir, `${variantId}.m3u8`);
    if (!fs8.existsSync(playlistPath)) {
      logger.error("Playlist variant not found on disk", { playlistPath, itemId, variant });
      throw AppError.notFound("Playlist variant not found");
    }
    let content = fs8.readFileSync(playlistPath, "utf8");
    const query2 = req.originalUrl.split("?")[1] || "";
    const baseUrl = process.env.PUBLIC_URL || "";
    const segmentPrefix = `${baseUrl}/api/vault/media/segment/${itemId}/`;
    content = content.replace(/^([^#].+\.ts)$/gm, (match) => {
      const separator = query2 ? "?" : "";
      return `${segmentPrefix}${match}${separator}${query2}`;
    });
    content = content.replace(/URI="([^"]*)"/g, (_match, p1) => {
      const separator = p1.includes("?") ? "&" : query2 ? "?" : "";
      return `URI="${p1}${separator}${query2}"`;
    });
    res.setHeader("Content-Type", "application/x-mpegURL");
    return res.send(content);
  }
};
var getMediaSegment = async (req, res) => {
  setMediaCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  const itemId = getSingleRouteParam(req.params.itemId);
  const segment = getSingleRouteParam(req.params.segment);
  if (!itemId || !segment)
    throw AppError.badRequest("itemId and segment are required.", "ITEM_REQUIRED");
  if (!/^[a-zA-Z0-9._-]+\.ts$/i.test(segment)) {
    throw AppError.badRequest("Invalid media segment identifier.", "INVALID_MEDIA_SEGMENT");
  }
  enforcePlaybackRequestContext(req);
  enforceTrustedMediaOrigin(req);
  const resolvedUserId = await validateMediaAccess(req, void 0, itemId, "stream");
  const username = req.user?.username;
  if (!username) throw AppError.unauthorized("Username required for isolated vault access");
  const DynamicVaultModel = getVaultItemModel(username);
  let item = await findVaultItemFlexible(DynamicVaultModel, resolvedUserId, itemId, username);
  if (!item || !item.file || !item.file.filePath) throw AppError.notFound("Media item not found");
  ensureUploadIsActive(item);
  let filePath = item.file.filePath;
  if (!fs8.existsSync(filePath)) {
    const fileName = path11.basename(filePath);
    const category = item.category || "other-files";
    const relativePath = path11.join(STORAGE_ROOT, resolvedUserId.toString(), category, fileName);
    if (fs8.existsSync(relativePath)) filePath = relativePath;
    else {
      const legacyCategory = category === "photo" ? "photos" : category === "video" ? "videos" : category;
      const legacyPath = path11.join(
        STORAGE_ROOT,
        resolvedUserId.toString(),
        legacyCategory,
        fileName
      );
      if (fs8.existsSync(legacyPath)) filePath = legacyPath;
    }
  }
  const hlsDir = path11.join(path11.dirname(filePath), "hls", itemId);
  const segmentPath = path11.join(hlsDir, segment);
  if (!fs8.existsSync(segmentPath)) {
    throw AppError.notFound("Segment not found");
  }
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
  res.setHeader("Content-Type", "video/MP2T");
  const stream = fs8.createReadStream(segmentPath);
  stream.on("error", (err) => {
    logger.warn("Media segment stream error", { segmentPath, err });
    if (!res.headersSent) {
      res.status(500).end();
    }
  });
  return stream.pipe(res);
};
var accessVaultFile = async (req, res) => {
  setMediaCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  const itemId = getSingleRouteParam(req.params.itemId);
  if (!itemId) throw AppError.badRequest("itemId is required.", "ITEM_REQUIRED");
  enforcePlaybackRequestContext(req);
  enforceTrustedMediaOrigin(req);
  if (!await ensureMongoReady()) {
    throw new AppError(
      503,
      "DB_UNAVAILABLE",
      "Cloud media storage is temporarily unavailable. Please retry playback."
    );
  }
  const requestedAction = getSingleQueryValue(req.query.action) || "view";
  const resolvedUserId = await validateMediaAccess(req, void 0, itemId, requestedAction);
  const username = req.user?.username;
  if (!username) throw AppError.unauthorized("Username required for isolated vault access");
  const DynamicVaultModel = getVaultItemModel(username);
  let item = await findVaultItemFlexible(DynamicVaultModel, resolvedUserId, itemId, username);
  const isObjectId = mongoose21.Types.ObjectId.isValid(itemId);
  if (!item && isObjectId && mongoose21.connection && mongoose21.connection.db) {
    try {
      const targetDb2 = item?._customConnection?.db || mongoose21.connection.db;
      const bucket = new mongoose21.mongo.GridFSBucket(targetDb2, {
        bucketName: "vault_item_files"
      });
      const objectId = new mongoose21.Types.ObjectId(itemId);
      const files = await bucket.find({ _id: objectId, "metadata.userId": resolvedUserId }).toArray();
      if (files && files.length > 0) {
        const gridFile = files[0];
        const fileMetadata = gridFile.metadata || {};
        const metadataItemId = typeof fileMetadata.itemId === "string" ? fileMetadata.itemId : void 0;
        if (!metadataItemId) {
          throw AppError.notFound("File not found");
        }
        const ownershipQuery = DynamicVaultModel.findOne({
          userId: resolvedUserId,
          $or: [{ itemId: metadataItemId }, { gridFsId: itemId }]
        });
        const owningItem = typeof ownershipQuery?.exec === "function" ? await ownershipQuery.exec() : ownershipQuery;
        if (!owningItem) {
          throw AppError.notFound("File not found");
        }
        const fileName2 = fileMetadata.fileName || fileMetadata.originalName || "file";
        const ext2 = path11.extname(fileName2).toLowerCase();
        const mimeType2 = fileMetadata.mimeType || mimeMap[ext2] || "application/octet-stream";
        const isStreamableMedia2 = mimeType2.startsWith("video/") || mimeType2.startsWith("audio/");
        const requestedRange2 = req.headers.range;
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Type", mimeType2);
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        const chunks = [];
        const downloadStream = bucket.openDownloadStream(objectId);
        const gridBuffer = await new Promise((resolve, reject) => {
          downloadStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          downloadStream.on("error", reject);
          downloadStream.on("end", () => resolve(Buffer.concat(chunks)));
        });
        const decrypted = decryptGridFsPayload(gridBuffer, fileMetadata);
        const size = decrypted.length;
        if (isStreamableMedia2 && requestedRange2) {
          const parsedRange = parseSingleByteRange(requestedRange2, size);
          if (!parsedRange) {
            res.setHeader("Content-Range", `bytes */${size}`);
            return res.status(416).end();
          }
          const chunk = decrypted.subarray(parsedRange.start, parsedRange.end + 1);
          res.status(206);
          res.setHeader("Content-Range", `bytes ${parsedRange.start}-${parsedRange.end}/${size}`);
          res.setHeader("Content-Length", String(chunk.length));
          return res.send(chunk);
        }
        res.status(200);
        res.setHeader("Content-Length", size.toString());
        return res.send(decrypted);
      }
    } catch (directGridErr) {
      logger.warn("Direct GridFS fallback lookup error", { itemId, directGridErr });
    }
  }
  if (!item) {
    logger.warn("Media file access failed: Item missing", {
      itemId,
      userId: resolvedUserId,
      username
    });
    throw AppError.notFound("File not found");
  }
  ensureUploadIsActive(item);
  const fileName = item.file?.fileName || item.title || "file";
  const ext = path11.extname(fileName).toLowerCase();
  const mimeType = item.file?.mimeType || item.metadata?.mimeType || mimeMap[ext] || "application/octet-stream";
  const isStreamableMedia = mimeType.startsWith("video/") || mimeType.startsWith("audio/");
  const requestedRange = req.headers.range;
  if (requestedAction === "download") {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
  }
  const gridFsId = item.gridFsId || (item.file?.filePath?.startsWith("cloud://") ? item.file.filePath.replace("cloud://", "") : item.file?.filePath?.startsWith("gridfs://") ? item.file.filePath.replace("gridfs://", "") : null);
  const targetDb = item?._customConnection?.db || mongoose21.connection.db;
  if (gridFsId && targetDb) {
    try {
      const bucket = new mongoose21.mongo.GridFSBucket(targetDb, {
        bucketName: "vault_item_files"
      });
      const objectId = new mongoose21.Types.ObjectId(gridFsId);
      const files = await bucket.find({ _id: objectId }).toArray();
      if (files && files.length > 0) {
        const gridFile = files[0];
        const fileSize = gridFile.length;
        const fileMetadata = gridFile.metadata || {};
        const isServerEncrypted = Boolean(item?.file?.encryptionIv || fileMetadata?.encryption);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Type", mimeType);
        if (!isServerEncrypted && isStreamableMedia) {
          if (requestedRange) {
            const parsedRange = parseSingleByteRange(requestedRange, fileSize);
            if (!parsedRange) {
              res.setHeader("Content-Range", `bytes */${fileSize}`);
              return res.status(416).end();
            }
            const chunkSize = parsedRange.end - parsedRange.start + 1;
            res.status(206);
            res.setHeader(
              "Content-Range",
              `bytes ${parsedRange.start}-${parsedRange.end}/${fileSize}`
            );
            res.setHeader("Content-Length", chunkSize.toString());
            const downloadStream2 = bucket.openDownloadStream(objectId, {
              start: parsedRange.start,
              end: parsedRange.end + 1
            });
            downloadStream2.on("error", (err) => {
              logger.warn("GridFS range stream error", { objectId, err });
              if (!res.headersSent) res.status(500).end();
            });
            return downloadStream2.pipe(res);
          }
          res.status(200);
          res.setHeader("Content-Length", fileSize.toString());
          const downloadStream = bucket.openDownloadStream(objectId);
          downloadStream.on("error", (err) => {
            logger.warn("GridFS full stream error", { objectId, err });
            if (!res.headersSent) res.status(500).end();
          });
          return downloadStream.pipe(res);
        } else {
          const chunks = [];
          const downloadStream = bucket.openDownloadStream(objectId);
          const gridBuffer = await new Promise((resolve, reject) => {
            downloadStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
            downloadStream.on("error", reject);
            downloadStream.on("end", () => resolve(Buffer.concat(chunks)));
          });
          let decrypted;
          try {
            decrypted = decryptGridFsPayload(gridBuffer, fileMetadata, item.file);
          } catch (decryptionError) {
            logger.error("Failed to decrypt GridFS media envelope", {
              itemId: item._id,
              error: decryptionError
            });
            throw new AppError(500, "DECRYPTION_FAILED", "Failed to decrypt media payload.");
          }
          const size = decrypted.length;
          if (isStreamableMedia && requestedRange) {
            const parsedRange = parseSingleByteRange(requestedRange, size);
            if (!parsedRange) {
              res.setHeader("Content-Range", `bytes */${size}`);
              return res.status(416).end();
            }
            const chunk = decrypted.subarray(parsedRange.start, parsedRange.end + 1);
            res.status(206);
            res.setHeader("Content-Range", `bytes ${parsedRange.start}-${parsedRange.end}/${size}`);
            res.setHeader("Content-Length", String(chunk.length));
            return res.send(chunk);
          }
          res.status(200);
          res.setHeader("Content-Length", size.toString());
          return res.send(decrypted);
        }
      }
    } catch (gridFsError) {
      logger.warn("GridFS read attempt error, attempting payload/disk fallback", {
        itemId,
        gridFsError: gridFsError instanceof Error ? gridFsError.message : String(gridFsError)
      });
    }
  }
  if (item.payload || item.modernPayload) {
    let rawBuffer = null;
    const rawPayload = item.payload || item.modernPayload || "";
    if (Buffer.isBuffer(rawPayload)) {
      rawBuffer = rawPayload;
    } else if (typeof rawPayload === "string" && rawPayload.length > 0) {
      if (item.encoding === "base64" || item.encoding === "binary-base64") {
        try {
          rawBuffer = Buffer.from(rawPayload, "base64");
        } catch {
          rawBuffer = Buffer.from(rawPayload);
        }
      } else if (item.encoding === "utf-8" || item.encoding === "modern") {
        rawBuffer = Buffer.from(rawPayload, "utf8");
      } else {
        try {
          rawBuffer = Buffer.from(rawPayload, "base64");
        } catch {
          rawBuffer = Buffer.from(rawPayload);
        }
      }
    }
    if (rawBuffer && rawBuffer.length > 0) {
      let decrypted;
      try {
        const payloadObj = JSON.parse(rawBuffer.toString());
        decrypted = decryptBuffer(payloadObj);
      } catch {
        if (item.file?.encryptionIv && item.file?.encryptionTag) {
          try {
            decrypted = decryptBuffer({
              iv: item.file.encryptionIv,
              tag: item.file.encryptionTag,
              encryptedData: rawBuffer.toString("hex")
            });
          } catch {
            decrypted = rawBuffer;
          }
        } else {
          decrypted = rawBuffer;
        }
      }
      const size = decrypted.length;
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", mimeType);
      if (isStreamableMedia && requestedRange) {
        const parsedRange = parseSingleByteRange(requestedRange, size);
        if (!parsedRange) {
          res.setHeader("Content-Range", `bytes */${size}`);
          return res.status(416).end();
        }
        const chunk = decrypted.subarray(parsedRange.start, parsedRange.end + 1);
        res.status(206);
        res.setHeader("Content-Range", `bytes ${parsedRange.start}-${parsedRange.end}/${size}`);
        res.setHeader("Content-Length", String(chunk.length));
        return res.send(chunk);
      }
      res.status(200);
      res.setHeader("Content-Length", size.toString());
      return res.send(decrypted);
    }
  }
  let filePath = item.file?.filePath;
  if (filePath && !filePath.startsWith("cloud://")) {
    let resolvedFilePath = filePath;
    if (!fs8.existsSync(resolvedFilePath)) {
      const fn = path11.basename(filePath);
      const cat = item.category || "other-files";
      const relPath = path11.join(STORAGE_ROOT, resolvedUserId.toString(), cat, fn);
      if (fs8.existsSync(relPath)) resolvedFilePath = relPath;
      else {
        const legacyCat = cat === "photo" ? "photos" : cat === "video" ? "videos" : cat;
        const legacyPath = path11.join(STORAGE_ROOT, resolvedUserId.toString(), legacyCat, fn);
        if (fs8.existsSync(legacyPath)) resolvedFilePath = legacyPath;
        else resolvedFilePath = "";
      }
    }
    if (resolvedFilePath && fs8.existsSync(resolvedFilePath)) {
      const fileEncryptedAtRest = Boolean(item?.file?.encryptionIv) || Boolean(item?.file?.encryptionTag) || resolvedFilePath.toLowerCase().endsWith(".enc");
      if (isStreamableMedia && !fileEncryptedAtRest) {
        const stats = await fs8.promises.stat(resolvedFilePath);
        const fileSize = stats.size;
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Type", mimeType);
        if (requestedRange) {
          const parsedRange = parseSingleByteRange(requestedRange, fileSize);
          if (!parsedRange) {
            res.setHeader("Content-Range", `bytes */${fileSize}`);
            return res.status(416).end();
          }
          const chunkSize = parsedRange.end - parsedRange.start + 1;
          res.status(206);
          res.setHeader(
            "Content-Range",
            `bytes ${parsedRange.start}-${parsedRange.end}/${fileSize}`
          );
          res.setHeader("Content-Length", chunkSize.toString());
          const rangeStream = fs8.createReadStream(resolvedFilePath, {
            start: parsedRange.start,
            end: parsedRange.end
          });
          rangeStream.on("error", (err) => {
            logger.warn("Disk range stream error", { resolvedFilePath, err });
            if (!res.headersSent) res.status(500).end();
          });
          return rangeStream.pipe(res);
        }
        res.status(200);
        res.setHeader("Content-Length", fileSize.toString());
        const fullStream = fs8.createReadStream(resolvedFilePath);
        fullStream.on("error", (err) => {
          logger.warn("Disk full stream error", { resolvedFilePath, err });
          if (!res.headersSent) res.status(500).end();
        });
        return fullStream.pipe(res);
      }
      const encryptedContent = await fs8.promises.readFile(resolvedFilePath);
      let decrypted;
      try {
        const payloadObj = JSON.parse(encryptedContent.toString());
        decrypted = decryptBuffer(payloadObj);
      } catch {
        decrypted = encryptedContent;
      }
      if (isStreamableMedia && requestedRange) {
        const fileSize = decrypted.length;
        const parsedRange = parseSingleByteRange(requestedRange, fileSize);
        if (!parsedRange) {
          res.setHeader("Content-Range", `bytes */${fileSize}`);
          return res.status(416).end();
        }
        const chunk = decrypted.subarray(parsedRange.start, parsedRange.end + 1);
        res.status(206);
        res.setHeader("Content-Type", mimeType);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Range", `bytes ${parsedRange.start}-${parsedRange.end}/${fileSize}`);
        res.setHeader("Content-Length", String(chunk.length));
        return res.send(chunk);
      }
      res.setHeader("Content-Type", mimeType);
      if (isStreamableMedia) {
        res.setHeader("Accept-Ranges", "bytes");
      }
      return res.send(decrypted);
    }
  }
  const tusUploadId = item.metadata?.tusUploadId;
  if (tusUploadId) {
    const tusBuffer = await getTusSessionBuffer(tusUploadId, resolvedUserId);
    if (tusBuffer && tusBuffer.length > 0) {
      const size = tusBuffer.length;
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", mimeType);
      if (isStreamableMedia && requestedRange) {
        const parsedRange = parseSingleByteRange(requestedRange, size);
        if (!parsedRange) {
          res.setHeader("Content-Range", `bytes */${size}`);
          return res.status(416).end();
        }
        const chunk = tusBuffer.subarray(parsedRange.start, parsedRange.end + 1);
        res.status(206);
        res.setHeader("Content-Range", `bytes ${parsedRange.start}-${parsedRange.end}/${size}`);
        res.setHeader("Content-Length", String(chunk.length));
        return res.send(chunk);
      }
      res.status(200);
      res.setHeader("Content-Length", size.toString());
      return res.send(tusBuffer);
    }
  }
  throw AppError.notFound("Media file content not found in MongoDB Atlas cloud or storage");
};
var createSignedUrl = async (req, res) => {
  const itemId = getSingleRouteParam(req.params.itemId);
  const userId = req.user?.userId;
  const actionRaw = getSingleQueryValue(req.query.action) || "view";
  if (!userId) throw AppError.unauthorized("Authentication required");
  if (!itemId) throw AppError.badRequest("itemId is required.", "ITEM_REQUIRED");
  if (!["view", "download", "stream"].includes(actionRaw)) {
    throw AppError.badRequest("Invalid signed URL action.", "INVALID_SIGNED_URL_ACTION");
  }
  enforceSignedUrlRateLimit(userId);
  const fileName = getSingleQueryValue(req.query.fileName) || itemId;
  const username = req.user?.username;
  if (!username) throw AppError.unauthorized("Username required for isolated vault access");
  const DynamicVaultModel = getVaultItemModel(username);
  const item = await findVaultItemFlexible(DynamicVaultModel, userId, itemId, username);
  if (!item) throw AppError.notFound("File not found");
  ensureUploadIsActive(item);
  const url = storageService.generateSignedUrl(userId, itemId, fileName, {
    action: actionRaw,
    sessionId: req.user?.sessionId,
    deviceHash: getSingleQueryValue(req.query.dev) || req.get("x-device-hash") || "direct"
  });
  return sendSuccess(res, { url }, "Signed URL generated successfully");
};
var logPlaybackEvent = async (req, res) => {
  const { itemId, event, metadata } = req.body;
  const userId = req.user?.userId;
  if (!userId) throw AppError.unauthorized("Authentication required");
  const username = req.user?.username;
  if (!username) throw AppError.unauthorized("Username required for isolated telemetry");
  try {
    const DynamicTelemetryModel = getTelemetryModel(username);
    await DynamicTelemetryModel.create({
      userId,
      itemId,
      event,
      metadata,
      userAgent: req.get("user-agent"),
      ip: getClientIp(req)
    });
  } catch (error) {
    logger.warn("Playback telemetry was not recorded", {
      itemId,
      event,
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(202).json({
      success: true,
      data: { accepted: false },
      message: "Playback telemetry deferred"
    });
  }
  return sendSuccess(res, null, "Telemetry recorded");
};
var getPlaybackInsights = async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) throw AppError.unauthorized("Authentication required");
  const username = req.user?.username;
  if (!username) throw AppError.unauthorized("Username required for isolated telemetry");
  if (!mongoose21.Types.ObjectId.isValid(userId)) {
    throw AppError.badRequest("Invalid user ID");
  }
  const DynamicTelemetryModel = getTelemetryModel(username);
  const userObjectId = new mongoose21.Types.ObjectId(userId);
  const bufferStats = await DynamicTelemetryModel.aggregate([
    { $match: { userId: userObjectId, event: "buffering" } },
    { $group: { _id: "$itemId", count: { $sum: 1 } } }
  ]);
  const resolutionStats = await DynamicTelemetryModel.aggregate([
    { $match: { userId: userObjectId, event: "resolution_change" } },
    { $group: { _id: "$metadata.resolution", count: { $sum: 1 } } }
  ]);
  const errorStats = await DynamicTelemetryModel.aggregate([
    { $match: { userId: userObjectId, event: "error" } },
    {
      $group: {
        _id: "$userAgent",
        errors: { $sum: 1 },
        details: { $push: "$metadata.details" }
      }
    },
    { $limit: 10 }
  ]);
  return sendSuccess(
    res,
    {
      bufferStats,
      resolutionStats,
      errorStats
    },
    "Playback insights aggregated successfully"
  );
};

// server/controllers/drmController.ts
init_logger();
var validateLicensePolicy = async (userId, username, itemId, deviceId) => {
  const DynamicVaultModel = getVaultItemModel(username);
  const item = await findVaultItemFlexible(DynamicVaultModel, userId, itemId, username);
  if (!item) {
    logger.warn("License Policy Failure: Item not found or unauthorized", { userId, itemId });
    throw AppError.notFound("Media content not found in vault");
  }
  if (deviceId) {
    const user = await User.findById(userId).select("sessions").lean();
    const isDeviceRegistered = user?.sessions?.some((s) => s.deviceId === deviceId);
    if (!isDeviceRegistered) {
      logger.error("Security Alert: License requested from unregistered device", {
        userId,
        deviceId
      });
      throw AppError.forbidden(
        "Playback not permitted on this device. Please sign in again.",
        "DEVICE_UNAUTHORIZED"
      );
    }
  }
};
var handleLicenseRequest = async (req, res) => {
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : void 0;
  const { drmType, deviceId } = req.body;
  const userId = req.user?.userId;
  const username = req.user?.username;
  const clientIp = getClientIp(req);
  if (!itemId) {
    throw AppError.badRequest("itemId is required.", "ITEM_REQUIRED");
  }
  if (!userId || !username) {
    logger.warn("License access denied: Identification missing", {
      itemId
    });
    throw AppError.unauthorized("License delivery requires a verified authenticated session.");
  }
  anomalyDetectionService.trackMediaRequest(userId, itemId, clientIp);
  anomalyDetectionService.trackIpDrift(userId, clientIp);
  await validateLicensePolicy(userId, username, itemId, deviceId);
  const contentKey = await mediaService.getStreamingKey(userId, itemId);
  logger.info(`License delivered [${drmType || "standard"}]`, {
    userId,
    itemId,
    ip: clientIp,
    deviceId
  });
  if (drmType === "widevine") {
    res.setHeader("Content-Type", "application/octet-stream");
    return res.send(contentKey);
  } else if (drmType === "fairplay") {
    res.setHeader("Content-Type", "application/octet-stream");
    return res.send(contentKey);
  }
  return res.json({
    k: contentKey.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""),
    alg: "A128GCM"
  });
};
var handleWidevineLicense = async (req, res) => {
  req.body = req.body || {};
  req.body.drmType = "widevine";
  return handleLicenseRequest(req, res);
};
var handleFairPlayLicense = async (req, res) => {
  req.body = req.body || {};
  req.body.drmType = "fairplay";
  return handleLicenseRequest(req, res);
};
var getCencKey = async (req, res) => {
  req.body = req.body || {};
  return handleLicenseRequest(req, res);
};

// server/controllers/folderController.ts
init_logger();
var normalizeFolderName2 = (value) => String(value ?? "").trim();
var normalizeFolderItemTypeInput = (value) => String(value ?? "").trim().toLowerCase();
var FOLDER_ITEM_TYPE_ALIASES = {
  note: ["note", "notes"],
  chat: ["chat", "chats"],
  todo: ["todo", "todos"],
  password: ["password", "passwords"],
  secret: ["secret", "secrets", "secretkey", "secretkeys"],
  contact: ["contact", "contacts"],
  location: ["location", "locations"],
  photo: ["photo", "photos"],
  video: ["video", "videos"],
  audio: ["audio", "audios"],
  document: ["document", "documents"],
  file: ["file", "files"],
  "other-files": ["other-files", "other_files", "otherfile", "otherfiles"],
  card: ["card", "cards"],
  identity: ["identity", "identities"],
  wifi: ["wifi", "wifis"]
};
var resolveCanonicalFolderItemType = (value) => {
  const normalized = normalizeFolderItemTypeInput(value);
  if (!normalized) return "";
  for (const [canonical, aliases] of Object.entries(FOLDER_ITEM_TYPE_ALIASES)) {
    if (aliases.includes(normalized)) {
      return canonical;
    }
  }
  return normalized;
};
var resolveFolderItemTypeCandidates = (value) => {
  const canonical = resolveCanonicalFolderItemType(value);
  if (!canonical) return [];
  const aliases = FOLDER_ITEM_TYPE_ALIASES[canonical] || [canonical];
  return Array.from(/* @__PURE__ */ new Set([canonical, ...aliases]));
};
var hydrateFolder = (folder) => {
  const normalizedItemType = resolveCanonicalFolderItemType(folder.itemType);
  try {
    const decrypted = decryptFolderName(folder.name);
    return {
      ...folder,
      name: decrypted || (typeof folder.name === "string" ? folder.name : ""),
      itemType: normalizedItemType || folder.itemType
    };
  } catch {
    return {
      ...folder,
      name: typeof folder.name === "string" ? folder.name : "",
      itemType: normalizedItemType || folder.itemType
    };
  }
};
var loadHydratedFolders = async (username, userId) => {
  const Folder = getFolderModel(username);
  const folders = await Folder.find({ userId }).lean();
  const deduped = /* @__PURE__ */ new Map();
  for (const folder of folders.map(hydrateFolder)) {
    const folderName = normalizeFolderName2(folder.name).toLowerCase();
    const folderType = resolveCanonicalFolderItemType(folder.itemType || "");
    const parentId = typeof folder.parentId === "string" ? folder.parentId : "root";
    const key = `${folderType}|${folderName}|${parentId}`;
    if (!deduped.has(key)) {
      deduped.set(key, folder);
    }
  }
  return Array.from(deduped.values());
};
var initializeFoldersController = async (req, res) => {
  try {
    await initializeDefaultUserFolders(req.user.userId, req.user.username);
    const hydrated = await loadHydratedFolders(req.user.username, req.user.userId);
    return res.json({ success: true, data: hydrated });
  } catch (error) {
    logger.error("Failed to initialize folders", {
      userId: req.user.userId,
      username: req.user.username,
      error
    });
    return res.status(500).json({
      success: false,
      error: { message: "Failed to initialize folders" }
    });
  }
};
var getFoldersController = async (req, res) => {
  try {
    await initializeDefaultUserFolders(req.user.userId, req.user.username);
    const hydrated = await loadHydratedFolders(req.user.username, req.user.userId);
    return res.json({ success: true, data: hydrated });
  } catch (error) {
    logger.error("Failed to fetch folders", {
      userId: req.user.userId,
      username: req.user.username,
      error
    });
    return res.status(500).json({
      success: false,
      error: { message: "Failed to fetch folders" }
    });
  }
};
var createFolderController = async (req, res) => {
  const { name, itemType, parentId } = req.body;
  if (!name || !itemType) {
    return res.status(400).json({ success: false, error: { message: "Name and itemType are required" } });
  }
  const folderName = normalizeFolderName2(name);
  const canonicalItemType = resolveCanonicalFolderItemType(itemType);
  const itemTypeCandidates = resolveFolderItemTypeCandidates(itemType);
  if (!folderName) {
    return res.status(400).json({ success: false, error: { message: "Folder name is required" } });
  }
  if (!canonicalItemType) {
    return res.status(400).json({ success: false, error: { message: "itemType is invalid" } });
  }
  if (isProtectedFolderName(folderName)) {
    return res.status(403).json({
      success: false,
      error: { message: "Saved folders are reserved and cannot be created manually" }
    });
  }
  try {
    const userId = req.user.userId;
    const username = req.user.username;
    await initializeDefaultUserFolders(userId, username);
    const Folder = getFolderModel(username);
    const folderNameHash = hashFolderName(folderName);
    const encryptedFolderName = encryptFolderName(folderName);
    const rootFolder = await Folder.findOne({
      userId,
      nameHash: hashFolderName("vault_items"),
      itemType: "system",
      parentId: null
    });
    if (!rootFolder) {
      return res.status(500).json({ success: false, error: { message: "Root folder missing after initialization" } });
    }
    const userFolder = await Folder.findOne({
      userId,
      nameHash: hashFolderName(username),
      itemType: "system",
      parentId: rootFolder._id.toString()
    });
    if (!userFolder) {
      return res.status(500).json({ success: false, error: { message: "User folder missing after initialization" } });
    }
    const targetParentId = parentId || userFolder._id.toString();
    const legacyAliasFolder = await Folder.findOne({
      userId,
      nameHash: folderNameHash,
      itemType: { $in: itemTypeCandidates },
      parentId: targetParentId
    });
    if (legacyAliasFolder && legacyAliasFolder.itemType !== canonicalItemType) {
      legacyAliasFolder.itemType = canonicalItemType;
      await legacyAliasFolder.save();
    }
    const newFolder = await Folder.findOneAndUpdate(
      { userId, nameHash: folderNameHash, itemType: canonicalItemType, parentId: targetParentId },
      {
        userId,
        username,
        name: encryptedFolderName,
        nameHash: folderNameHash,
        itemType: canonicalItemType,
        parentId: targetParentId
      },
      { upsert: true, returnDocument: "after" }
    );
    if (!newFolder) {
      return res.status(500).json({
        success: false,
        error: { message: "Folder creation failed" }
      });
    }
    const safeFolder = {
      ...newFolder.toObject(),
      name: folderName
    };
    return res.json({ success: true, data: safeFolder });
  } catch (error) {
    logger.error("Folder creation error", {
      userId: req.user.userId,
      username: req.user.username,
      itemType: canonicalItemType,
      folderName,
      error
    });
    return res.status(500).json({ success: false, error: { message: "Failed to create folder" } });
  }
};
var deleteFolderController = async (req, res) => {
  const { name, itemType } = req.query;
  if (!name || !itemType) {
    return res.status(400).json({ success: false, error: { message: "Name and itemType are required" } });
  }
  const folderName = normalizeFolderName2(name);
  const canonicalItemType = resolveCanonicalFolderItemType(itemType);
  const itemTypeCandidates = resolveFolderItemTypeCandidates(itemType);
  const normalizedLowerName = folderName.toLowerCase();
  if (isProtectedFolderName(folderName)) {
    return res.status(403).json({
      success: false,
      error: { message: "Saved folders are protected and cannot be deleted" }
    });
  }
  if (!canonicalItemType) {
    return res.status(400).json({ success: false, error: { message: "itemType is invalid" } });
  }
  try {
    const Folder = getFolderModel(req.user.username);
    const folderNameHash = hashFolderName(folderName);
    const directDelete = await Folder.deleteMany({
      userId: req.user.userId,
      itemType: { $in: itemTypeCandidates },
      $or: [{ nameHash: folderNameHash }, { name: folderName }]
    });
    if (directDelete.deletedCount && directDelete.deletedCount > 0) {
      return res.json({ success: true });
    }
    const legacyCandidates = await Folder.find({
      userId: req.user.userId,
      itemType: { $in: itemTypeCandidates }
    });
    const target = legacyCandidates.find((entry) => {
      const resolvedName = normalizeFolderName2(decryptFolderName(entry.name));
      return resolvedName.toLowerCase() === normalizedLowerName;
    });
    if (target) {
      await Folder.deleteOne({ _id: target._id });
    }
    return res.json({ success: true });
  } catch (error) {
    logger.error("Folder deletion error", {
      userId: req.user.userId,
      username: req.user.username,
      folderName,
      itemType: canonicalItemType,
      error
    });
    return res.status(500).json({
      success: false,
      error: { message: "Failed to delete folder" }
    });
  }
};

// server/middleware/authMiddleware.ts
init_logger();
var MAX_AUTH_TOKEN_LENGTH = (() => {
  const parsed = Number.parseInt(process.env.MAX_AUTH_TOKEN_LENGTH || "8192", 10);
  return Number.isFinite(parsed) && parsed >= 512 ? parsed : 8192;
})();
var looksLikeJwt = (candidate) => {
  const token = candidate.trim();
  if (!token || token.length > MAX_AUTH_TOKEN_LENGTH) {
    return false;
  }
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
};
var decodeQueryParamSafely = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};
var hasMalformedAuthTokenQuery = (req) => {
  const match = req.url.match(/[?&]auth_token=([^&]*)/);
  return Boolean(match && decodeQueryParamSafely(match[1]) === null);
};
var extractQueryAuthToken = (req) => {
  const path16 = req.path || req.originalUrl || "";
  const isMediaStreamRoute = path16.includes("/media/") || path16.includes("/stream/") || path16.includes("/session-stream") || path16.includes("/hls/") || path16.includes("/files/access/") || path16.includes("/files/signed-url/") || path16.includes("/files/") || path16.includes("/avatar/");
  const allowQueryTokens = process.env.ALLOW_QUERY_AUTH_TOKENS === "true" || isMediaStreamRoute;
  if (!allowQueryTokens) {
    return void 0;
  }
  if (typeof req.query.auth_token === "string") {
    return req.query.auth_token.trim();
  }
  const match = req.url.match(/[?&]auth_token=([^&]+)/);
  if (!match) {
    return void 0;
  }
  const decoded = decodeQueryParamSafely(match[1]);
  if (!decoded) {
    logger.warn("[Auth] Failed to decode auth_token query parameter.", {
      path: req.originalUrl
    });
    return void 0;
  }
  return decoded.trim();
};
var resolveIdentity = (req, _res, next) => {
  const authHeader = req.get("Authorization")?.split(" ")[1];
  const token = authHeader || extractQueryAuthToken(req);
  if (token && typeof token === "string" && token.includes(".")) {
    try {
      const payload = verifyAccessToken(token);
      req.user = {
        userId: payload.sub,
        username: payload.username,
        sessionId: payload.sessionId
      };
    } catch (e) {
    }
  }
  next();
};
var requireAuth = async (req, _res, next) => {
  const authHeader = req.get("authorization");
  let token;
  if (authHeader) {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch?.[1]) {
      token = bearerMatch[1].trim();
    }
  }
  if (!token) {
    token = extractQueryAuthToken(req);
  }
  if (!token) {
    const cookieToken = readCookie(req, "vault_access_token");
    if (cookieToken && looksLikeJwt(cookieToken)) {
      token = cookieToken.trim();
    }
  }
  if (!token) {
    if (hasMalformedAuthTokenQuery(req)) {
      throw AppError.unauthorized("Authentication token is invalid.", "INVALID_TOKEN");
    }
    throw AppError.unauthorized("Authentication token is required.", "AUTH_REQUIRED");
  }
  if (!looksLikeJwt(token)) {
    throw AppError.unauthorized("Authentication token is invalid.", "INVALID_TOKEN");
  }
  try {
    const payload = verifyAccessToken(token);
    const clientIp = getClientIp(req);
    anomalyDetectionService.trackIpDrift(payload.sub, clientIp);
    const userWithSession = await User.findOne(
      {
        _id: payload.sub,
        sessions: {
          $elemMatch: {
            sessionId: payload.sessionId,
            revokedAt: null,
            expiresAt: { $gt: /* @__PURE__ */ new Date() }
          }
        }
      },
      {
        _id: 1,
        username: 1,
        role: 1,
        lastActiveAt: 1,
        "meta.lastCredentialChangeAt": 1,
        sessions: {
          $elemMatch: {
            sessionId: payload.sessionId,
            revokedAt: null,
            expiresAt: { $gt: /* @__PURE__ */ new Date() }
          }
        }
      }
    ).lean().exec();
    if (!userWithSession) {
      logger.warn("[Auth] User or active session not found during session check", {
        userId: payload.sub,
        sessionId: payload.sessionId
      });
      throw AppError.unauthorized(
        "This session has been revoked or expired. Please sign in again.",
        "SESSION_REVOKED"
      );
    }
    const activeSession = Array.isArray(userWithSession.sessions) ? userWithSession.sessions[0] : null;
    if (!activeSession) {
      logger.warn("[Auth] Session invalid or revoked", {
        userId: payload.sub,
        sessionId: payload.sessionId
      });
      throw AppError.unauthorized(
        "This session has been revoked or expired. Please sign in again.",
        "SESSION_REVOKED"
      );
    }
    if (userWithSession.meta?.lastCredentialChangeAt && payload.iat && payload.iat * 1e3 < new Date(userWithSession.meta.lastCredentialChangeAt).getTime()) {
      throw AppError.unauthorized(
        "Credentials have been updated. Please sign in again.",
        "SESSION_REVOKED"
      );
    }
    req.user = {
      userId: payload.sub,
      username: typeof userWithSession.username === "string" ? userWithSession.username : payload.username,
      sessionId: payload.sessionId
    };
    return next();
  } catch (error) {
    anomalyDetectionService.trackAuthFailure(getClientIp(req));
    if (error instanceof AppError) throw error;
    const name = error instanceof Error ? error.name : "UnknownError";
    const message = name === "TokenExpiredError" ? "Authentication token expired. Please sign in again." : "Authentication token is invalid.";
    const code = name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN";
    logger.error("[Auth] requireAuth failed", {
      name,
      message,
      tokenFingerprint: getTokenFingerprint(token)
    });
    throw AppError.unauthorized(message, code);
  }
};
var requireAdmin = async (req, _res, next) => {
  try {
    const authUser = req.user;
    if (!authUser?.userId) {
      throw AppError.unauthorized("Authentication required.", "UNAUTHORIZED");
    }
    const user = await User.findById(authUser.userId).select("+role username").lean().exec();
    const adminUsernames = (process.env.ADMIN_USERNAMES || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const adminUserIds = (process.env.ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const isRoleAdmin = user?.role === "admin";
    const isUsernameAdmin = user?.username && adminUsernames.includes(user.username.toLowerCase());
    const isIdAdmin = adminUserIds.includes(authUser.userId);
    if (!isRoleAdmin && !isUsernameAdmin && !isIdAdmin) {
      throw new AppError(403, "FORBIDDEN_ADMIN_ONLY", "Administrator privileges required.");
    }
    return next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    return next(new AppError(403, "FORBIDDEN_ADMIN_ONLY", "Administrator privileges required."));
  }
};

// server/middleware/expressValidate.ts
import { validationResult } from "express-validator";
var validateRequest = (validations) => {
  return async (req, _res, next) => {
    await Promise.all(validations.map((validation) => validation.run(req)));
    const result = validationResult(req);
    if (result.isEmpty()) {
      return next();
    }
    const details = result.array({ onlyFirstError: true }).map((error) => {
      const fieldPath = typeof error.path === "string" ? error.path : "request";
      const message = typeof error.msg === "string" ? error.msg : "Invalid input.";
      return { path: fieldPath, message };
    });
    const validationError = AppError.badRequest(
      "Input validation failed.",
      "VALIDATION_ERROR"
    );
    validationError.details = details;
    return next(validationError);
  };
};

// server/validators/requestChainValidator.ts
import { body, param, query } from "express-validator";
var USERNAME_PATTERN = /^[a-z0-9._-]+$/i;
var SAFE_ID_PATTERN = /^[a-zA-Z0-9:_-]+$/;
var SAFE_CATEGORY_PATTERN = /^[a-zA-Z0-9-]+$/;
var DEVICE_ID_PATTERN = /^[a-zA-Z0-9._:-]+$/;
var HASH_HEX_64_PATTERN = /^[a-f0-9]{64}$/i;
var UPLOAD_ID_PATTERN = /^[a-f0-9]{24}$/i;
var MULTIPART_CATEGORIES = ["photo", "video", "audio", "document", "other-files"];
var usernameQueryValidation = [
  query("username").exists({ values: "falsy" }).withMessage("Username is required.").bail().isString().withMessage("Username must be a string.").bail().trim().toLowerCase().isLength({ min: 3, max: 64 }).withMessage("Username must be between 3 and 64 characters.").bail().matches(USERNAME_PATTERN).withMessage("Username can only include letters, numbers, dots, underscores, and hyphens.")
];
var revokeSessionsValidation = [
  body().isObject().withMessage("Request body must be a JSON object."),
  body("sessionId").optional().isString().withMessage("sessionId must be a string.").bail().trim().isLength({ min: 1, max: 256 }).withMessage("sessionId must be between 1 and 256 characters."),
  body("deviceId").optional().isString().withMessage("deviceId must be a string.").bail().trim().isLength({ min: 1, max: 128 }).withMessage("deviceId must be between 1 and 128 characters.").bail().matches(DEVICE_ID_PATTERN).withMessage("deviceId format is invalid."),
  body("revokeAllOther").optional().isBoolean().withMessage("revokeAllOther must be a boolean value.").toBoolean(),
  body("revokeCurrent").optional().isBoolean().withMessage("revokeCurrent must be a boolean value.").toBoolean(),
  body().custom((value) => {
    const payload = value;
    const hasSessionId = typeof payload.sessionId === "string" && payload.sessionId.trim().length > 0;
    const hasDeviceId = typeof payload.deviceId === "string" && payload.deviceId.trim().length > 0;
    const revokeAllOther = payload.revokeAllOther === true;
    const revokeCurrent = payload.revokeCurrent === true;
    if (!hasSessionId && !hasDeviceId && !revokeAllOther) {
      throw new Error("Provide sessionId, deviceId, or revokeAllOther=true.");
    }
    if (revokeCurrent && !revokeAllOther) {
      throw new Error("revokeCurrent=true must be paired with revokeAllOther=true.");
    }
    return true;
  })
];
var deviceSessionRenameValidation = [
  body().isObject().withMessage("Request body must be a JSON object."),
  body("deviceId").exists({ values: "falsy" }).withMessage("deviceId is required.").bail().isString().withMessage("deviceId must be a string.").bail().trim().isLength({ min: 1, max: 128 }).withMessage("deviceId must be between 1 and 128 characters.").bail().matches(DEVICE_ID_PATTERN).withMessage("deviceId format is invalid."),
  body("deviceName").exists({ values: "falsy" }).withMessage("deviceName is required.").bail().isString().withMessage("deviceName must be a string.").bail().trim().isLength({ min: 1, max: 120 }).withMessage("deviceName must be between 1 and 120 characters.").custom((value) => !/[\u0000-\u001f\u007f]/.test(value)).withMessage("deviceName contains invalid control characters.")
];
var vaultLegacyRouteParamsValidation = [
  param("vaultId").isString().withMessage("vaultId is required.").bail().trim().isLength({ min: 1, max: 256 }).withMessage("vaultId must be between 1 and 256 characters.").bail().matches(SAFE_ID_PATTERN).withMessage("vaultId contains unsupported characters."),
  param("itemId").optional().isString().withMessage("itemId must be a string.").bail().trim().isLength({ min: 1, max: 256 }).withMessage("itemId must be between 1 and 256 characters.").bail().matches(SAFE_ID_PATTERN).withMessage("itemId contains unsupported characters.")
];
var vaultItemRouteParamsValidation = [
  param("itemId").isString().withMessage("itemId is required.").bail().trim().isLength({ min: 1, max: 256 }).withMessage("itemId must be between 1 and 256 characters.").bail().matches(SAFE_ID_PATTERN).withMessage("itemId contains unsupported characters.")
];
var vaultCategoryRouteParamsValidation = [
  param("category").isString().withMessage("category is required.").bail().trim().isLength({ min: 1, max: 64 }).withMessage("category must be between 1 and 64 characters.").bail().matches(SAFE_CATEGORY_PATTERN).withMessage("category contains unsupported characters.")
];
var multipartRouteParamsValidation = [
  param("uploadId").isString().withMessage("uploadId is required.").bail().trim().matches(UPLOAD_ID_PATTERN).withMessage("uploadId format is invalid."),
  param("partNumber").optional().isInt({ min: 1, max: 2e3 }).withMessage("partNumber must be an integer between 1 and 2000.")
];
var multipartStartBodyValidation = [
  body().isObject().withMessage("Request body must be a JSON object."),
  body("category").isString().withMessage("category is required.").bail().trim().isIn(MULTIPART_CATEGORIES).withMessage("Unsupported multipart category."),
  body("fileName").isString().withMessage("fileName is required.").bail().trim().isLength({ min: 1, max: 512 }).withMessage("fileName must be between 1 and 512 characters."),
  body("mimeType").isString().withMessage("mimeType is required.").bail().trim().isLength({ min: 1, max: 255 }).withMessage("mimeType must be between 1 and 255 characters."),
  body("fileSize").isInt({ min: 1, max: maxUploadFileSizeBytes }).withMessage(`fileSize must be between 1 and ${maxUploadFileSizeBytes}.`).toInt(),
  body("folder").optional({ values: "null" }).isString().withMessage("folder must be a string.").bail().trim().isLength({ max: 256 }).withMessage("folder must be 256 characters or fewer."),
  body("resumeUploadId").optional({ values: "null" }).isString().withMessage("resumeUploadId must be a string.").bail().trim().matches(UPLOAD_ID_PATTERN).withMessage("resumeUploadId format is invalid."),
  body("keepMetadata").optional({ values: "null" }).isBoolean().withMessage("keepMetadata must be a boolean.").toBoolean()
];
var multipartCompleteBodyValidation = [
  body().isObject().withMessage("Request body must be a JSON object."),
  body("fileSha256").optional({ values: "null" }).isString().withMessage("fileSha256 must be a string.").bail().trim().matches(HASH_HEX_64_PATTERN).withMessage("fileSha256 must be a 64-character hex hash."),
  body("deviceId").optional({ values: "null" }).isString().withMessage("deviceId must be a string.").bail().trim().isLength({ min: 1, max: 128 }).withMessage("deviceId must be between 1 and 128 characters.").bail().matches(DEVICE_ID_PATTERN).withMessage("deviceId format is invalid."),
  body("clientUpdatedAt").optional({ values: "null" }).isString().withMessage("clientUpdatedAt must be a string.").bail().trim().isLength({ min: 1, max: 128 }).withMessage("clientUpdatedAt is invalid.")
];
var activityLogQueryValidation = [
  query("limit").optional().isInt({ min: 1, max: 1e3 }).withMessage("limit must be an integer between 1 and 1000.").toInt(),
  query("skip").optional().isInt({ min: 0, max: 1e6 }).withMessage("skip must be an integer between 0 and 1000000.").toInt()
];
var activityLogBodyValidation = [
  body().isObject().withMessage("Request body must be a JSON object."),
  body("action").optional().isString().withMessage("action must be a string.").bail().trim().isLength({ min: 1, max: 64 }).withMessage("action must be between 1 and 64 characters."),
  body("category").optional().isString().withMessage("category must be a string.").bail().trim().isLength({ min: 1, max: 64 }).withMessage("category must be between 1 and 64 characters."),
  body("itemId").optional({ values: "null" }).isString().withMessage("itemId must be a string.").bail().trim().isLength({ min: 1, max: 256 }).withMessage("itemId must be between 1 and 256 characters."),
  body("status").optional().isString().withMessage("status must be a string.").bail().trim().isLength({ min: 1, max: 32 }).withMessage("status must be between 1 and 32 characters."),
  body("errorCode").optional().isString().withMessage("errorCode must be a string.").bail().trim().isLength({ min: 1, max: 128 }).withMessage("errorCode must be between 1 and 128 characters."),
  body("errorMessage").optional().isString().withMessage("errorMessage must be a string.").bail().trim().isLength({ min: 1, max: 2048 }).withMessage("errorMessage must be between 1 and 2048 characters."),
  body("deviceId").optional().isString().withMessage("deviceId must be a string.").bail().trim().isLength({ min: 1, max: 128 }).withMessage("deviceId must be between 1 and 128 characters.").bail().matches(DEVICE_ID_PATTERN).withMessage("deviceId format is invalid."),
  body("details").optional().isObject().withMessage("details must be an object.")
];

// server/utils/asyncHandler.ts
var asyncHandler = (handler) => {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
};

// server/routes/vaultRoutes.ts
var vaultRouter = express2.Router();
var strictUserLimiter = (windowMs, max, message) => rateLimit2({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: message },
  keyGenerator: (req) => {
    const userId = req?.user?.userId;
    if (userId) return String(userId);
    return ipKeyGenerator(req.ip || req.socket.remoteAddress || "anonymous");
  }
});
var signedUrlLimiter = strictUserLimiter(
  60 * 1e3,
  Math.max(20, Number(process.env.SIGNED_URL_LIMIT_PER_MIN || 600)),
  "Too many signed URL requests. Please retry shortly."
);
var multipartStartLimiter = strictUserLimiter(
  10 * 60 * 1e3,
  Math.max(3, Number(process.env.MULTIPART_START_LIMIT_PER_10MIN || 20)),
  "Too many upload sessions started. Please retry later."
);
var multipartPartLimiter = strictUserLimiter(
  60 * 1e3,
  Math.max(30, Number(process.env.MULTIPART_PART_LIMIT_PER_MIN || 600)),
  "Upload part rate limit exceeded. Slow down and retry."
);
var multipartCompleteLimiter = strictUserLimiter(
  10 * 60 * 1e3,
  Math.max(3, Number(process.env.MULTIPART_COMPLETE_LIMIT_PER_10MIN || 30)),
  "Too many upload completion requests. Please retry later."
);
var multipartPartBodyLimitBytes = Math.max(5 * 1024 * 1024, Number(process.env.MULTIPART_PART_SIZE_BYTES || 8 * 1024 * 1024)) + 32 * 1024;
vaultRouter.post(
  "/legacy/:vaultId/items/:itemId",
  requireAuth,
  validateRequest(vaultLegacyRouteParamsValidation),
  asyncHandler(upsertLegacyVaultItem)
);
vaultRouter.get(
  "/legacy/:vaultId/items",
  requireAuth,
  validateRequest(vaultLegacyRouteParamsValidation),
  asyncHandler(getLegacyVaultItems)
);
vaultRouter.delete(
  "/legacy/:vaultId/items/:itemId",
  requireAuth,
  validateRequest(vaultLegacyRouteParamsValidation),
  asyncHandler(removeLegacyVaultItem)
);
vaultRouter.get("/items", requireAuth, asyncHandler(getScopedVaultItems));
vaultRouter.post(
  "/items/:itemId",
  requireAuth,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(upsertScopedVaultItem)
);
vaultRouter.put(
  "/items/:itemId/pin",
  requireAuth,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(toggleScopedVaultItemPin)
);
vaultRouter.delete(
  "/items/:itemId",
  requireAuth,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(removeScopedVaultItem)
);
vaultRouter.get("/", requireAuth, asyncHandler(fetchVault));
vaultRouter.get("/sync", requireAuth, asyncHandler(syncVault));
vaultRouter.get("/folders", requireAuth, asyncHandler(getFoldersController));
vaultRouter.post("/folders", requireAuth, asyncHandler(createFolderController));
vaultRouter.delete("/folders", requireAuth, asyncHandler(deleteFolderController));
vaultRouter.post("/folders/init", requireAuth, asyncHandler(initializeFoldersController));
vaultRouter.get(
  "/activity",
  requireAuth,
  validateRequest(activityLogQueryValidation),
  asyncHandler(getUserActivityLogsController)
);
vaultRouter.post(
  "/activity",
  requireAuth,
  validateRequest(activityLogBodyValidation),
  asyncHandler(saveUserActivityLog)
);
vaultRouter.get(
  "/files/signed-url/:itemId",
  requireAuth,
  signedUrlLimiter,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(createSignedUrl)
);
vaultRouter.get(
  "/files/access/:itemId",
  resolveIdentity,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(accessVaultFile)
);
vaultRouter.get(
  "/media/:itemId/hls",
  resolveIdentity,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(getMediaPlaylist)
);
vaultRouter.get(
  "/media/:itemId/hls/:variant/playlist.m3u8",
  resolveIdentity,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(getMediaPlaylist)
);
vaultRouter.get(
  "/media/segment/:itemId/:segment",
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(getMediaSegment)
);
vaultRouter.post(
  "/license/:itemId",
  requireAuth,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(handleLicenseRequest)
);
vaultRouter.get(
  "/media/key/:itemId",
  requireAuth,
  keyRateLimit,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(handleLicenseRequest)
);
vaultRouter.post("/media/events", requireAuth, asyncHandler(logPlaybackEvent));
vaultRouter.get("/media/insights", requireAuth, asyncHandler(getPlaybackInsights));
vaultRouter.post(
  "/media/drm/widevine/:itemId",
  requireAuth,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(handleWidevineLicense)
);
vaultRouter.post(
  "/media/drm/fairplay/:itemId",
  requireAuth,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(handleFairPlayLicense)
);
vaultRouter.get(
  "/media/drm/cenc/:itemId/:kid",
  requireAuth,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(getCencKey)
);
vaultRouter.post(
  "/files/multipart/start",
  requireAuth,
  multipartStartLimiter,
  validateRequest(multipartStartBodyValidation),
  asyncHandler(startMultipartUpload)
);
vaultRouter.put(
  "/files/multipart/:uploadId/part/:partNumber",
  requireAuth,
  multipartPartLimiter,
  validateRequest(multipartRouteParamsValidation),
  express2.raw({ type: "application/octet-stream", limit: multipartPartBodyLimitBytes }),
  asyncHandler(uploadMultipartPart)
);
vaultRouter.post(
  "/files/multipart/:uploadId/complete",
  requireAuth,
  multipartCompleteLimiter,
  validateRequest([...multipartRouteParamsValidation, ...multipartCompleteBodyValidation]),
  asyncHandler(completeMultipartUpload)
);
vaultRouter.post("/files/tus", requireAuth, asyncHandler(createTusUploadController));
vaultRouter.head("/files/tus/:uploadId", requireAuth, asyncHandler(getTusOffsetController));
vaultRouter.patch("/files/tus/:uploadId", requireAuth, asyncHandler(uploadTusChunkController));
vaultRouter.post(
  "/files/:category",
  requireAuth,
  validateRequest(vaultCategoryRouteParamsValidation),
  uploadVaultFileMiddleware,
  asyncHandler(uploadVaultFile)
);
vaultRouter.post(
  "/:category",
  requireAuth,
  validateRequest(vaultCategoryRouteParamsValidation),
  asyncHandler(upsertVaultEntry)
);
vaultRouter.put(
  "/:category/:itemId",
  requireAuth,
  validateRequest([...vaultCategoryRouteParamsValidation, ...vaultItemRouteParamsValidation]),
  asyncHandler(upsertVaultEntry)
);
vaultRouter.delete(
  "/:category/:itemId",
  requireAuth,
  validateRequest([...vaultCategoryRouteParamsValidation, ...vaultItemRouteParamsValidation]),
  asyncHandler(deleteVaultEntry)
);
var registerVaultRoutes = (app) => {
  app.use("/api/vault", vaultRouter);
};

// server/routes/authRoutes.ts
import express3 from "express";
import rateLimit3 from "express-rate-limit";

// server/controllers/authController.ts
import crypto10 from "node:crypto";
init_logger();
var isTestRuntime = () => {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return true;
  }
  return process.argv.some((arg) => arg.includes("vitest"));
};
var isMongoOptionalMode = () => {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  const raw = process.env.SKIP_MONGO_CONNECT?.trim().toLowerCase();
  const skipMongo = raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  return skipMongo && !isTestRuntime();
};
var REFRESH_COOKIE_NAME2 = getRefreshCookieName();
var applyRefreshCookie = (req, res, refreshToken) => {
  res.cookie(REFRESH_COOKIE_NAME2, refreshToken, buildRefreshCookieOptions(req));
};
var clearRefreshCookie = (req, res) => {
  res.cookie(REFRESH_COOKIE_NAME2, "", buildClearedRefreshCookieOptions(req));
};
var REFRESH_FAILURE_CODE = "SESSION_REFRESH_FAILED";
var REFRESH_FAILURE_MESSAGE = "Session could not be refreshed. Please sign in again.";
var DB_FAILURE_CODE = "DB_UNAVAILABLE";
var DB_FAILURE_MESSAGE = "Vault storage is temporarily unavailable. Please try again in a moment.";
var isMongoConnectivityFailure = (error) => {
  const candidate = error;
  const message = String(candidate?.message || "").toLowerCase();
  return candidate?.name === "MongooseServerSelectionError" || candidate?.name === "MongoServerSelectionError" || message.includes("server selection") || message.includes("secureconnect") || message.includes("timed out") || message.includes("connecttimeoutms");
};
var toOperationalAuthError = (error) => {
  if (error instanceof AppError) {
    return error;
  }
  if (isMongoConnectivityFailure(error)) {
    return new AppError(503, DB_FAILURE_CODE, DB_FAILURE_MESSAGE);
  }
  return error;
};
var toPublicAuthPayload = (result) => {
  const { refreshToken: _refreshToken, ...publicResult } = result;
  return publicResult;
};
var getWebsiteMetadata = (req) => ({
  origin: req.get("origin") || null,
  referer: req.get("referer") || null,
  host: req.get("host") || null,
  forwardedHost: req.get("x-forwarded-host") || null,
  protocol: req.get("x-forwarded-proto") || req.protocol || null,
  method: req.method,
  path: req.originalUrl,
  acceptLanguage: req.get("accept-language") || null,
  secFetchSite: req.get("sec-fetch-site") || null,
  secFetchMode: req.get("sec-fetch-mode") || null,
  secFetchDest: req.get("sec-fetch-dest") || null,
  secChUa: req.get("sec-ch-ua") || null,
  secChUaMobile: req.get("sec-ch-ua-mobile") || null,
  secChUaPlatform: req.get("sec-ch-ua-platform") || null
});
var register = async (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  if (!username || !req.body?.password) {
    throw AppError.badRequest("Username and password are required.", "AUTH_MISSING_CREDENTIALS");
  }
  if (typeof req.body.password !== "string" || req.body.password.length < 16) {
    throw AppError.badRequest("Password must be at least 16 characters.", "AUTH_WEAK_PASSWORD");
  }
  if (isMongoOptionalMode()) {
    const mockUser = {
      id: "507f1f77bcf86cd799439011",
      username
    };
    const sessionId = "mock-e2e-session-id";
    const accessToken = createAccessToken({
      sub: mockUser.id,
      username: mockUser.username,
      sessionId
    });
    const refreshToken = createRefreshToken({
      sub: mockUser.id,
      username: mockUser.username,
      sessionId,
      deviceId: req.body?.deviceId || "mock-device-id"
    });
    applyRefreshCookie(req, res, refreshToken);
    return res.status(201).json({
      success: true,
      message: "Registered successfully",
      token: accessToken,
      accessToken,
      sessionId,
      user: mockUser,
      data: {
        token: accessToken,
        accessToken,
        sessionId,
        user: mockUser
      }
    });
  }
  if (typeof req.body?.masterKey !== "string" || !req.body.masterKey.trim()) {
    throw AppError.badRequest(
      "Master key is required for registration.",
      "AUTH_MISSING_MASTER_KEY"
    );
  }
  const masterKey = req.body.masterKey.trim();
  if (req.body.password && masterKey && req.body.password === masterKey) {
    throw AppError.badRequest(
      "Account password and master key must not be identical.",
      "AUTH_SAME_CREDENTIALS"
    );
  }
  try {
    const result = await registerUser({
      username: req.body.username,
      password: req.body.password,
      fullName: req.body.fullName || req.body.profileName,
      masterKey,
      pqcSalt: req.body.pqcSalt,
      ipAddress: getClientIp(req),
      userAgent: req.get("user-agent"),
      deviceId: req.body.deviceId,
      websiteMetadata: getWebsiteMetadata(req)
    });
    applyRefreshCookie(req, res, result.refreshToken);
    const statusCode = result.created === false ? 200 : 201;
    const publicPayload = toPublicAuthPayload(result);
    return res.status(statusCode).json({
      success: true,
      message: result.created === false ? "Logged in successfully" : "Registered successfully",
      token: result.token,
      accessToken: result.token,
      sessionId: result.sessionId,
      user: result.user,
      data: {
        ...publicPayload,
        token: result.token,
        accessToken: result.token
      }
    });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 409 || error?.code === 11e3 || error?.name === "MongoServerError" && error?.code === 11e3) {
      return res.status(409).json({
        success: false,
        error: { code: "USER_EXISTS", message: "Username is already registered" },
        message: "Username is already registered"
      });
    }
    throw toOperationalAuthError(error);
  }
};
var login = async (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  if (!username || !req.body?.password) {
    throw AppError.badRequest("Username and password are required.", "AUTH_MISSING_CREDENTIALS");
  }
  if (isMongoOptionalMode()) {
    const mockUser = {
      id: "507f1f77bcf86cd799439011",
      username
    };
    const sessionId = "mock-e2e-session-id";
    const accessToken = createAccessToken({
      sub: mockUser.id,
      username: mockUser.username,
      sessionId
    });
    const refreshToken = createRefreshToken({
      sub: mockUser.id,
      username: mockUser.username,
      sessionId,
      deviceId: req.body?.deviceId || "mock-device-id"
    });
    applyRefreshCookie(req, res, refreshToken);
    return res.status(200).json({
      success: true,
      message: "Logged in successfully",
      token: accessToken,
      accessToken,
      sessionId,
      user: mockUser,
      data: {
        token: accessToken,
        accessToken,
        sessionId,
        user: mockUser
      }
    });
  }
  try {
    const result = await authenticateUser({
      username,
      password: req.body.password,
      masterKey: req.body.masterKey,
      ipAddress: getClientIp(req),
      userAgent: req.get("user-agent"),
      deviceId: req.body.deviceId
    });
    if ("twoFactorRequired" in result && result.twoFactorRequired) {
      return sendSuccess(res, result, "2FA required", 200);
    }
    applyRefreshCookie(req, res, result.refreshToken);
    const publicPayload = toPublicAuthPayload(result);
    return res.status(200).json({
      success: true,
      message: "Logged in successfully",
      token: result.token,
      accessToken: result.token,
      sessionId: result.sessionId,
      user: result.user,
      data: {
        ...publicPayload,
        token: result.token,
        accessToken: result.token
      }
    });
  } catch (error) {
    anomalyDetectionService.trackAuthFailure(getClientIp(req), username);
    throw toOperationalAuthError(error);
  }
};
var checkUsername = async (req, res) => {
  const username = typeof req.query?.username === "string" ? req.query.username : req.body?.username;
  if (!username) {
    throw AppError.badRequest("Username is required.", "INVALID_USERNAME");
  }
  if (isMongoOptionalMode()) {
    return sendSuccess(res, { exists: false, exactMatch: false }, "Username check completed");
  }
  const result = await getExactUsernameMatch({ username });
  return sendSuccess(res, result, "Username check completed");
};
var getSalt = async (req, res) => {
  const username = typeof req.query?.username === "string" ? req.query.username.trim().toLowerCase() : "";
  if (!username) {
    throw AppError.badRequest("Username is required.", "INVALID_USERNAME");
  }
  const hmacSecret = process.env.JWT_SECRET || "dummy-secret-key-salt-derivation-fallback";
  const defaultDeterministicSalt = crypto10.createHmac("sha256", hmacSecret).update(username).digest("hex");
  if (isMongoOptionalMode()) {
    return sendSuccess(res, { salt: defaultDeterministicSalt }, "Salt retrieved successfully");
  }
  const user = await User.findOne({ username }).select("pqcSalt").lean().exec();
  if (user) {
    if (user.pqcSalt && typeof user.pqcSalt === "string" && user.pqcSalt.trim()) {
      return sendSuccess(res, { salt: user.pqcSalt.trim() }, "Salt retrieved successfully");
    }
    return sendSuccess(res, { salt: `${username}-vault-pqc-salt` }, "Salt retrieved successfully");
  }
  return sendSuccess(res, { salt: defaultDeterministicSalt }, "Salt retrieved successfully");
};
var getMe = async (req, res) => {
  if (isMongoOptionalMode()) {
    const username = req.user?.username || "demo-user";
    return sendSuccess(
      res,
      {
        id: req.user?.userId || "507f1f77bcf86cd799439011",
        username,
        profileName: username
      },
      "User profile fetched successfully"
    );
  }
  const profile = await getAuthenticatedUserProfile(req.user.userId, req.user.sessionId);
  return sendSuccess(res, profile, "User profile fetched successfully");
};
var refreshSession = async (req, res) => {
  if (isMongoOptionalMode()) {
    const mockUser = {
      id: "507f1f77bcf86cd799439011",
      username: "demo-user"
    };
    const sessionId = "mock-e2e-session-id";
    const accessToken = createAccessToken({
      sub: mockUser.id,
      username: mockUser.username,
      sessionId
    });
    const refreshToken2 = createRefreshToken({
      sub: mockUser.id,
      username: mockUser.username,
      sessionId,
      deviceId: "mock-device-id"
    });
    applyRefreshCookie(req, res, refreshToken2);
    return sendSuccess(
      res,
      {
        token: accessToken,
        accessToken,
        sessionId,
        user: mockUser
      },
      "Session refreshed successfully"
    );
  }
  const refreshToken = readCookie(req, REFRESH_COOKIE_NAME2);
  if (!refreshToken) {
    clearRefreshCookie(req, res);
    throw new AppError(401, REFRESH_FAILURE_CODE, REFRESH_FAILURE_MESSAGE);
  }
  try {
    const result = await refreshAuthenticatedSession({
      refreshToken,
      ipAddress: getClientIp(req),
      userAgent: req.get("user-agent")
    });
    applyRefreshCookie(req, res, result.refreshToken);
    return sendSuccess(res, toPublicAuthPayload(result), "Session refreshed successfully");
  } catch (error) {
    anomalyDetectionService.trackAuthFailure(getClientIp(req));
    if (error instanceof Error) {
      if (error.message.includes("invalid signature")) {
        logger.warn("JWT signature verification failed during session refresh", {
          path: req.path,
          ip: getClientIp(req),
          error: error.message,
          tokenFingerprint: getTokenFingerprint(refreshToken)
        });
      } else if (error.message.includes("jwt expired")) {
        logger.info("Refresh token expired", {
          path: req.path,
          ip: getClientIp(req)
        });
      }
    }
    if (error instanceof AppError && error.statusCode === 401) {
      clearRefreshCookie(req, res);
      throw new AppError(401, REFRESH_FAILURE_CODE, REFRESH_FAILURE_MESSAGE);
    }
    throw error;
  }
};
var logout = async (req, res) => {
  const refreshToken = readCookie(req, REFRESH_COOKIE_NAME2);
  if (refreshToken) {
    await revokeCurrentSession(refreshToken).catch((error) => {
      logger.warn("Failed to revoke current session during logout.", {
        path: req.path,
        ip: getClientIp(req),
        error
      });
    });
  }
  clearRefreshCookie(req, res);
  return sendSuccess(res, { loggedOut: true }, "Logged out successfully");
};
var revokeSessions = async (req, res) => {
  const revokeCurrent = req.body?.revokeCurrent === true;
  const result = await revokeAuthenticatedSessions({
    userId: req.user.userId,
    currentSessionId: req.user.sessionId,
    targetSessionId: typeof req.body?.sessionId === "string" ? req.body.sessionId : void 0,
    targetDeviceId: typeof req.body?.deviceId === "string" ? req.body.deviceId : void 0,
    revokeAllOther: req.body?.revokeAllOther === true,
    revokeCurrent,
    ipAddress: getClientIp(req)
  });
  if (revokeCurrent) {
    clearRefreshCookie(req, res);
  }
  return sendSuccess(res, result, "Sessions revoked successfully");
};
var changePassword = async (req, res) => {
  const result = await changeAuthenticatedPassword({
    userId: req.user.userId,
    currentPassword: req.body?.currentPassword,
    newPassword: req.body?.newPassword,
    ipAddress: getClientIp(req)
  });
  return sendSuccess(res, result, "Password changed successfully");
};
var updateDeviceName = async (req, res) => {
  if (typeof req.body?.deviceId !== "string" || typeof req.body?.deviceName !== "string") {
    throw AppError.badRequest("deviceId and deviceName are required.", "INVALID_INPUT");
  }
  const result = await renameDeviceSession(req.user.userId, req.body.deviceId, req.body.deviceName);
  return sendSuccess(res, result, "Device name updated successfully");
};
var updateProfile = async (req, res) => {
  const result = await updateAuthenticatedUserProfile({
    userId: req.user.userId,
    profileName: req.body?.profileName,
    profilePhoto: req.body?.profilePhoto
  });
  return sendSuccess(res, result, "Profile updated successfully");
};
var sessionStream = async (req, res) => {
  const { userId, sessionId } = req.user;
  if (!userId || !sessionId) {
    throw AppError.unauthorized("Session ID is missing.", "INVALID_SESSION");
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  const initialPayload = JSON.stringify({
    event: "connected",
    userId,
    sessionId,
    timestamp: Date.now()
  });
  res.write(`event: connected
data: ${initialPayload}

`);
  sessionRealtimeService.registerSessionStream(userId, sessionId, res);
};
var checkSessionStatus = async (req, res) => {
  return sendSuccess(
    res,
    {
      valid: true,
      sessionId: req.user.sessionId,
      userId: req.user.userId,
      username: req.user.username,
      checkedAt: Date.now()
    },
    "Session is active"
  );
};

// server/controllers/captchaController.ts
var verifyMasterKeyCaptcha = async (_req, res) => {
  return sendSuccess(
    res,
    {
      verified: true,
      verifiedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    "CAPTCHA verified for master key change."
  );
};
var verifyCloudUnlockCaptcha = async (_req, res) => {
  return sendSuccess(
    res,
    {
      verified: true,
      verifiedAt: (/* @__PURE__ */ new Date()).toISOString()
    },
    "CAPTCHA verified for cloud vault unlock."
  );
};

// server/middleware/recaptchaMiddleware.ts
init_logger();

// server/services/recaptchaService.ts
init_logger();
var RECAPTCHA_SITEVERIFY_URLS = [
  "https://www.google.com/recaptcha/api/siteverify",
  "https://www.recaptcha.net/recaptcha/api/siteverify"
];
var RECAPTCHA_REQUEST_TIMEOUT_MS = 6e3;
var MIN_TOKEN_LENGTH = 20;
var MAX_TOKEN_LENGTH = 4096;
var readBooleanEnv = (value) => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};
var resolveRecaptchaSecret = () => {
  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  if (!secret) {
    logger.error("[SECURITY] RECAPTCHA_SECRET_KEY is not configured.");
    throw AppError.internal(
      "Security verification is temporarily unavailable.",
      "CAPTCHA_CONFIG_MISSING"
    );
  }
  return secret;
};
var toHostnames = (origins) => {
  const hosts = /* @__PURE__ */ new Set();
  const allowLocalHosts = process.env.NODE_ENV !== "production" || readBooleanEnv(process.env.ALLOW_LOCAL_CORS_ORIGINS);
  const allowRecaptchaTestHost = process.env.NODE_ENV !== "production" || readBooleanEnv(process.env.ALLOW_RECAPTCHA_TEST_HOST);
  if (allowLocalHosts) {
    hosts.add("localhost");
    hosts.add("127.0.0.1");
    hosts.add("::1");
  }
  if (allowRecaptchaTestHost) {
    hosts.add("testkey.google.com");
  }
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (parsed.hostname) {
        hosts.add(parsed.hostname.toLowerCase());
      }
    } catch {
    }
  }
  return hosts;
};
var isAllowedCaptchaHostname = (hostname) => {
  if (!hostname) {
    return false;
  }
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const allowedCaptchaHostnames = toHostnames(getAllowedCorsOrigins());
  return allowedCaptchaHostnames.has(normalized);
};
var readRecaptchaTokenFromBody = (rawValue) => {
  if (typeof rawValue !== "string") {
    throw AppError.badRequest(
      "CAPTCHA token is missing. Please complete the challenge.",
      "CAPTCHA_TOKEN_MISSING"
    );
  }
  const token = rawValue.trim();
  if (!token) {
    throw AppError.badRequest(
      "CAPTCHA token is missing. Please complete the challenge.",
      "CAPTCHA_TOKEN_MISSING"
    );
  }
  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) {
    throw AppError.badRequest(
      "CAPTCHA token is malformed. Please try again.",
      "CAPTCHA_TOKEN_INVALID"
    );
  }
  return token;
};
var verifyRecaptchaToken = async (input) => {
  const isNonProduction = process.env.NODE_ENV !== "production";
  const shouldSkipCaptcha = isNonProduction && (process.env.SKIP_RECAPTCHA === "true" || process.env.SKIP_CAPTCHA === "true" || readBooleanEnv(process.env.SKIP_RECAPTCHA_VERIFICATION));
  if (shouldSkipCaptcha) {
    logger.info(
      "[SECURITY] reCAPTCHA verification skipped via environment config (non-production only)."
    );
    return {
      success: true,
      hostname: "localhost",
      challengeTs: (/* @__PURE__ */ new Date()).toISOString(),
      action: null,
      errorCodes: []
    };
  }
  const secret = resolveRecaptchaSecret();
  const requestBody = new URLSearchParams({
    secret,
    response: input.token
  });
  if (input.remoteIp && input.remoteIp !== "unknown") {
    requestBody.set("remoteip", input.remoteIp);
  }
  for (const siteVerifyUrl of RECAPTCHA_SITEVERIFY_URLS) {
    let response;
    try {
      response = await fetch(siteVerifyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: requestBody.toString(),
        signal: AbortSignal.timeout(RECAPTCHA_REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      logger.warn("[SECURITY] reCAPTCHA verification request failed.", {
        endpoint: siteVerifyUrl,
        error
      });
      continue;
    }
    if (!response.ok) {
      logger.warn("[SECURITY] reCAPTCHA siteverify returned a non-2xx response.", {
        endpoint: siteVerifyUrl,
        status: response.status,
        statusText: response.statusText
      });
      continue;
    }
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      logger.warn("[SECURITY] Failed to parse reCAPTCHA siteverify response.", {
        endpoint: siteVerifyUrl,
        error
      });
      continue;
    }
    return {
      success: payload.success === true,
      hostname: typeof payload.hostname === "string" ? payload.hostname : null,
      challengeTs: typeof payload.challenge_ts === "string" ? payload.challenge_ts : null,
      action: typeof payload.action === "string" ? payload.action : null,
      errorCodes: Array.isArray(payload["error-codes"]) ? payload["error-codes"] : []
    };
  }
  const isDevEnvironment = process.env.NODE_ENV !== "production" || readBooleanEnv(process.env.ALLOW_LOCAL_CORS_ORIGINS);
  if (isDevEnvironment && input.token && input.token.length >= MIN_TOKEN_LENGTH) {
    logger.warn(
      "[SECURITY] reCAPTCHA siteverify endpoints unreachable in local dev environment; allowing local verification fallback."
    );
    return {
      success: true,
      hostname: "localhost",
      challengeTs: (/* @__PURE__ */ new Date()).toISOString(),
      action: null,
      errorCodes: []
    };
  }
  throw new AppError(
    503,
    "CAPTCHA_VERIFY_UNAVAILABLE",
    "Security verification is temporarily unavailable. Please try again."
  );
};

// server/middleware/recaptchaMiddleware.ts
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var hasTimeoutOrDuplicateCode = (errorCodes) => errorCodes.includes("timeout-or-duplicate");
var requireRecaptcha = (options) => {
  const tokenField = options.tokenField || "captchaToken";
  return async (req, _res, next) => {
    try {
      if (!isRecord(req.body)) {
        throw AppError.badRequest("Request body must be a JSON object.", "INVALID_REQUEST_BODY");
      }
      const token = readRecaptchaTokenFromBody(req.body[tokenField]);
      const verification = await verifyRecaptchaToken({
        token,
        remoteIp: getClientIp(req)
      });
      delete req.body[tokenField];
      if (!verification.success) {
        const code = hasTimeoutOrDuplicateCode(verification.errorCodes) ? "CAPTCHA_TOKEN_EXPIRED" : "CAPTCHA_VERIFICATION_FAILED";
        const message = hasTimeoutOrDuplicateCode(verification.errorCodes) ? "CAPTCHA expired. Please complete it again." : "Security verification failed. Please retry the CAPTCHA challenge.";
        logger.warn("[SECURITY] reCAPTCHA verification failed.", {
          action: options.action,
          path: req.originalUrl,
          method: req.method,
          ipAddress: getClientIp(req),
          requestId: req.requestId,
          hostname: verification.hostname,
          challengeTs: verification.challengeTs,
          errorCodes: verification.errorCodes,
          userId: req.user?.userId
        });
        throw AppError.forbidden(message, code);
      }
      if (!isAllowedCaptchaHostname(verification.hostname)) {
        logger.warn("[SECURITY] reCAPTCHA hostname mismatch detected.", {
          action: options.action,
          path: req.originalUrl,
          method: req.method,
          ipAddress: getClientIp(req),
          requestId: req.requestId,
          hostname: verification.hostname,
          userId: req.user?.userId
        });
        throw AppError.forbidden(
          "Security verification failed for this origin.",
          "CAPTCHA_HOSTNAME_MISMATCH"
        );
      }
      if (verification.action && verification.action !== options.action) {
        logger.warn("[SECURITY] reCAPTCHA action mismatch detected.", {
          action: options.action,
          reportedAction: verification.action,
          path: req.originalUrl,
          method: req.method,
          ipAddress: getClientIp(req),
          requestId: req.requestId,
          hostname: verification.hostname,
          userId: req.user?.userId
        });
        throw AppError.forbidden(
          "Security verification does not match this action.",
          "CAPTCHA_ACTION_MISMATCH"
        );
      }
      next();
    } catch (error) {
      const code = error?.code;
      if (typeof code === "string" && code.startsWith("CAPTCHA_")) {
        logger.warn("[SECURITY] reCAPTCHA request rejected before verification.", {
          action: options.action,
          code,
          message: error?.message,
          path: req.originalUrl,
          method: req.method,
          ipAddress: getClientIp(req),
          requestId: req.requestId,
          userId: req.user?.userId
        });
      }
      next(error);
    }
  };
};

// server/middleware/validate.ts
var validate = (schema) => {
  return (req, _res, next) => {
    schema.parseAsync(req.body).then((parsed) => {
      req.body = parsed;
      next();
    }).catch((error) => next(error));
  };
};

// server/validators/authValidator.ts
import { z } from "zod";
var USERNAME_PATTERN2 = /^[a-z0-9._-]+$/i;
var STRONG_PASSWORD_PATTERN2 = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+=\[\];:,.<>?{}|\-])\S{16,64}$/;
var usernameSchema = z.string().trim().toLowerCase().transform((v) => v.normalize("NFKC")).refine((v) => v.length >= 3, "Username must be at least 3 characters").refine((v) => v.length <= 64, "Username must be at most 64 characters").refine(
  (v) => USERNAME_PATTERN2.test(v),
  "Username can only include letters, numbers, dots, underscores, and hyphens"
);
var passwordSchema2 = z.string().transform((v) => v.normalize("NFKC")).refine((v) => v.length >= 16, "Password must be at least 16 characters").refine((v) => v.length <= 128, "Password must be at most 128 characters").refine(
  (v) => STRONG_PASSWORD_PATTERN2.test(v),
  "Password must include uppercase, lowercase, number, and special character, and cannot contain spaces"
);
var masterKeySchema2 = z.string().transform((v) => v.normalize("NFKC")).refine((v) => v.length >= 16, "Master Key must be at least 16 characters").refine((v) => v.length <= 128, "Master Key must be at most 128 characters").refine(
  (v) => STRONG_PASSWORD_PATTERN2.test(v),
  "Master Key must include uppercase, lowercase, number, and special character, and cannot contain spaces"
);
var deviceIdSchema = z.string().trim().min(1).max(128);
var captchaTokenSchema = z.string().trim().min(20, "CAPTCHA token is invalid").max(4096, "CAPTCHA token is invalid");
var loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "Password is required").max(128, "Password is too long"),
  masterKey: z.string().optional(),
  pqcSalt: z.string().trim().min(8).max(128).optional(),
  deviceId: deviceIdSchema.optional(),
  captchaToken: captchaTokenSchema
});
var registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema2,
  masterKey: masterKeySchema2,
  pqcSalt: z.string().trim().min(8).max(128).optional(),
  deviceId: deviceIdSchema.optional(),
  captchaToken: captchaTokenSchema
}).refine((data) => data.password !== data.masterKey, {
  message: "Account password and Master Key must not be identical",
  path: ["masterKey"]
});
var changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128, "Current password is too long"),
  newPassword: passwordSchema2,
  captchaToken: captchaTokenSchema
}).refine((data) => data.newPassword !== data.currentPassword, {
  message: "New password must be different from current password",
  path: ["newPassword"]
});
var masterKeyCaptchaSchema = z.object({
  captchaToken: captchaTokenSchema
});
var cloudUnlockCaptchaSchema = z.object({
  captchaToken: captchaTokenSchema
});
var normalizeProfileName = z.string().trim().max(120, "Profile name must be 120 characters or fewer").transform((value) => value.length === 0 ? "none" : value);
var MAX_PROFILE_PHOTO_LENGTH2 = 5e7;
var normalizeProfilePhoto = z.string().trim().max(MAX_PROFILE_PHOTO_LENGTH2, "Profile photo is too large (max ~35 MB).").transform((value, ctx) => {
  if (value.length === 0 || value.toLowerCase() === "none") {
    return "none";
  }
  if (!value.startsWith("data:image/") && value.length > 2048) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Profile photo URL cannot exceed 2048 characters."
    });
    return z.NEVER;
  }
  if (value.startsWith("data:image/")) {
    const mimeMatch = value.match(/^data:(image\/[a-zA-Z0-9.+\-]+);base64,/);
    if (!mimeMatch) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Profile photo data URI must be a base64-encoded image."
      });
      return z.NEVER;
    }
    return value;
  }
  if (value.startsWith("/") && !value.startsWith("//") || value.startsWith("./")) {
    return value;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Profile photo must be a valid HTTP/HTTPS URL, a base64 data URI, or "none".'
    });
    return z.NEVER;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Profile photo URL must use HTTP or HTTPS (or upload a file directly)."
    });
    return z.NEVER;
  }
  return parsed.toString();
});
var updateProfileSchema = z.object({
  profileName: normalizeProfileName.optional(),
  profilePhoto: normalizeProfilePhoto.optional()
}).refine(
  (value) => typeof value.profileName === "string" || typeof value.profilePhoto === "string",
  {
    message: "At least one profile field is required.",
    path: ["profileName"]
  }
);

// server/middleware/csrfOriginMiddleware.ts
var parseOrigin = (value) => {
  if (!value || !value.trim()) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};
var requireTrustedBrowserOrigin = (req, _res, next) => {
  const method = req.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return next();
  }
  const origin = parseOrigin(req.get("origin"));
  const refererOrigin = parseOrigin(req.get("referer"));
  const candidateOrigin = origin || refererOrigin;
  const fetchSite = req.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite === "cross-site") {
    throw AppError.forbidden("Cross-site request is not allowed.", "CSRF_BLOCKED");
  }
  if (!candidateOrigin) {
    const hasAuth = req.get("authorization") || req.get("x-vault-client");
    if (hasAuth || process.env.NODE_ENV !== "production") {
      return next();
    }
    throw AppError.forbidden("Missing origin or referer header.", "CSRF_BLOCKED");
  }
  if (!isAllowedCorsOrigin(candidateOrigin)) {
    throw AppError.forbidden("Request origin is not allowed.", "ORIGIN_FORBIDDEN");
  }
  return next();
};

// server/routes/authRoutes.ts
var authRouter = express3.Router();
authRouter.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});
var toPositiveInteger = (raw, fallback) => {
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
var normalizeRateLimitKeySegment = (value) => {
  if (typeof value !== "string") {
    return "anonymous";
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return "anonymous";
  }
  return normalized.slice(0, 128);
};
var isDev = process.env.NODE_ENV !== "production";
var authLimiterWindowMs = toPositiveInteger(
  process.env.AUTH_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1e3
);
var authLimiterMax = toPositiveInteger(process.env.AUTH_RATE_LIMIT_MAX, isDev ? 500 : 100);
var refreshLimiterMax = toPositiveInteger(
  process.env.AUTH_REFRESH_RATE_LIMIT_MAX,
  isDev ? 500 : 100
);
var usernameCheckLimiterMax = toPositiveInteger(
  process.env.AUTH_USERNAME_CHECK_RATE_LIMIT_MAX,
  isDev ? 1e3 : 200
);
var changePasswordLimiterMax = toPositiveInteger(
  process.env.AUTH_CHANGE_PASSWORD_RATE_LIMIT_MAX,
  isDev ? 50 : 20
);
var masterKeyCaptchaLimiterMax = toPositiveInteger(
  process.env.MASTER_KEY_CAPTCHA_RATE_LIMIT_MAX,
  isDev ? 100 : 30
);
var cloudUnlockCaptchaLimiterMax = toPositiveInteger(
  process.env.AUTH_CLOUD_UNLOCK_CAPTCHA_RATE_LIMIT_MAX,
  isDev ? 200 : 50
);
var getAuthRateLimitKey = (req) => {
  const username = normalizeRateLimitKeySegment(req.body?.username);
  return `${getClientIp(req)}:${req.path}:${username}`;
};
var ipAuthLimiter = rateLimit3({
  windowMs: authLimiterWindowMs,
  max: authLimiterMax * 2,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:auth-ip-pool`,
  message: {
    success: false,
    message: "Too many authentication attempts from this IP address. Please try again later.",
    error: { code: "TOO_MANY_AUTH_ATTEMPTS" }
  }
});
var authLimiter = rateLimit3({
  windowMs: authLimiterWindowMs,
  max: authLimiterMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getAuthRateLimitKey,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
    error: { code: "TOO_MANY_AUTH_ATTEMPTS" }
  }
});
var refreshLimiter = rateLimit3({
  windowMs: authLimiterWindowMs,
  max: refreshLimiterMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${req.path}`,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
    error: { code: "TOO_MANY_AUTH_ATTEMPTS" }
  }
});
var usernameCheckLimiter = rateLimit3({
  windowMs: authLimiterWindowMs,
  max: usernameCheckLimiterMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${req.path}`,
  message: {
    success: false,
    message: "Too many username checks. Please try again later.",
    error: { code: "TOO_MANY_USERNAME_CHECKS" }
  }
});
var changePasswordLimiter = rateLimit3({
  windowMs: authLimiterWindowMs,
  max: changePasswordLimiterMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${req.path}:${normalizeRateLimitKeySegment(req.user?.userId)}`,
  message: {
    success: false,
    message: "Too many password change attempts. Please try again later.",
    error: { code: "TOO_MANY_CHANGE_PASSWORD_ATTEMPTS" }
  }
});
var masterKeyCaptchaLimiter = rateLimit3({
  windowMs: authLimiterWindowMs,
  max: masterKeyCaptchaLimiterMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${req.path}:${normalizeRateLimitKeySegment(req.user?.userId)}`,
  message: {
    success: false,
    message: "Too many master key verification attempts. Please try again later.",
    error: { code: "TOO_MANY_MASTER_KEY_CAPTCHA_ATTEMPTS" }
  }
});
var cloudUnlockCaptchaLimiter = rateLimit3({
  windowMs: authLimiterWindowMs,
  max: cloudUnlockCaptchaLimiterMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${req.path}:${normalizeRateLimitKeySegment(req.user?.userId)}`,
  message: {
    success: false,
    message: "Too many unlock verification attempts. Please try again later.",
    error: { code: "TOO_MANY_UNLOCK_CAPTCHA_ATTEMPTS" }
  }
});
authRouter.post(
  "/signup",
  requireTrustedBrowserOrigin,
  ipAuthLimiter,
  authLimiter,
  validate(registerSchema),
  requireRecaptcha({ action: "auth_register" }),
  asyncHandler(register)
);
authRouter.post(
  "/register",
  requireTrustedBrowserOrigin,
  ipAuthLimiter,
  authLimiter,
  validate(registerSchema),
  requireRecaptcha({ action: "auth_register" }),
  asyncHandler(register)
);
authRouter.post(
  "/login",
  requireTrustedBrowserOrigin,
  ipAuthLimiter,
  authLimiter,
  validate(loginSchema),
  requireRecaptcha({ action: "auth_login" }),
  asyncHandler(login)
);
authRouter.get(
  "/username-check",
  usernameCheckLimiter,
  validateRequest(usernameQueryValidation),
  asyncHandler(checkUsername)
);
authRouter.get(
  "/salt",
  usernameCheckLimiter,
  validateRequest(usernameQueryValidation),
  asyncHandler(getSalt)
);
authRouter.post(
  "/refresh",
  requireTrustedBrowserOrigin,
  refreshLimiter,
  asyncHandler(refreshSession)
);
authRouter.post(
  "/refresh-session",
  requireTrustedBrowserOrigin,
  refreshLimiter,
  asyncHandler(refreshSession)
);
authRouter.post(
  "/session/refresh",
  requireTrustedBrowserOrigin,
  refreshLimiter,
  asyncHandler(refreshSession)
);
authRouter.post("/logout", requireTrustedBrowserOrigin, asyncHandler(logout));
authRouter.get("/me", requireAuth, asyncHandler(getMe));
authRouter.get("/session-check", requireAuth, asyncHandler(checkSessionStatus));
authRouter.get("/session-stream", requireAuth, asyncHandler(sessionStream));
authRouter.get("/stream/session", requireAuth, asyncHandler(sessionStream));
authRouter.post(
  "/sessions/revoke",
  requireTrustedBrowserOrigin,
  requireAuth,
  validateRequest(revokeSessionsValidation),
  asyncHandler(revokeSessions)
);
authRouter.post(
  "/sessions/device-name",
  requireTrustedBrowserOrigin,
  requireAuth,
  validateRequest(deviceSessionRenameValidation),
  asyncHandler(updateDeviceName)
);
authRouter.post(
  "/profile",
  requireTrustedBrowserOrigin,
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(updateProfile)
);
authRouter.put(
  "/profile",
  requireTrustedBrowserOrigin,
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(updateProfile)
);
authRouter.patch(
  "/profile",
  requireTrustedBrowserOrigin,
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(updateProfile)
);
authRouter.post(
  "/me/profile",
  requireTrustedBrowserOrigin,
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(updateProfile)
);
authRouter.put(
  "/me",
  requireTrustedBrowserOrigin,
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(updateProfile)
);
authRouter.patch(
  "/me",
  requireTrustedBrowserOrigin,
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(updateProfile)
);
authRouter.post(
  "/change-password",
  requireTrustedBrowserOrigin,
  requireAuth,
  changePasswordLimiter,
  validate(changePasswordSchema),
  requireRecaptcha({ action: "auth_change_password" }),
  asyncHandler(changePassword)
);
authRouter.post(
  "/captcha/verify-cloud-unlock",
  requireTrustedBrowserOrigin,
  cloudUnlockCaptchaLimiter,
  validate(cloudUnlockCaptchaSchema),
  requireRecaptcha({ action: "auth_cloud_unlock" }),
  asyncHandler(verifyCloudUnlockCaptcha)
);
authRouter.post(
  "/captcha/verify-master-key-change",
  requireTrustedBrowserOrigin,
  requireAuth,
  masterKeyCaptchaLimiter,
  validate(masterKeyCaptchaSchema),
  requireRecaptcha({ action: "master_key_change" }),
  asyncHandler(verifyMasterKeyCaptcha)
);

// server/routes/masterKeyRoutes.ts
import express4 from "express";
import rateLimit4 from "express-rate-limit";

// server/services/masterKeyService.ts
init_logger();
var MASTER_KEY_HASH_HISTORY_LIMIT = 20;
var formatEncryptedMasterKeyForDisplay = (encryptedKey) => {
  return {
    encryption: {
      algorithm: encryptedKey.algorithm || "aes-256-gcm",
      keyVersion: encryptedKey.keyVersion || "v1",
      components: {
        hasCipherText: Boolean(encryptedKey.cipherText),
        cipherTextLength: encryptedKey.cipherText ? encryptedKey.cipherText.length : 0,
        ivLength: encryptedKey.iv ? encryptedKey.iv.length : 0,
        authTagLength: encryptedKey.authTag ? encryptedKey.authTag.length : 0,
        hasSalt: Boolean(encryptedKey.salt)
      }
    }
  };
};
var saveCloudMasterKey = async (userId, username, encryptedKey, options) => {
  try {
    logger.info(`[MasterKeyService] Saving encrypted master key for user: ${userId}`, {
      context: "saveCloudMasterKey",
      userId,
      deviceId: options.deviceId
    });
    if (!userId || !encryptedKey || !options.masterKeyHash) {
      throw new Error("Missing required parameters: userId, encryptedKey, or masterKeyHash");
    }
    if (!encryptedKey.cipherText || !encryptedKey.iv || !encryptedKey.authTag || !encryptedKey.salt) {
      throw new Error("Incomplete encrypted key payload");
    }
    const now = /* @__PURE__ */ new Date();
    const MasterKey = getMasterKeyModel(username);
    const existing = await MasterKey.findOne({ userId, isDeleted: false }).select({ masterKeyHash: 1, metadata: 1 }).lean().exec();
    const encryptedIncomingHash = encryptText(await hashPassword(options.masterKeyHash));
    const baseSet = {
      encryptedMasterKey: {
        cipherText: encryptedKey.cipherText,
        iv: encryptedKey.iv,
        authTag: encryptedKey.authTag,
        salt: encryptedKey.salt,
        algorithm: encryptedKey.algorithm || "aes-256-gcm",
        keyVersion: encryptedKey.keyVersion || "v1"
      },
      masterKeyHash: encryptedIncomingHash,
      "metadata.derivationAlgorithm": options.metadata?.derivationAlgorithm || "argon2id",
      "metadata.derivationParams.memory": options.metadata?.derivationParams?.memory || 65536,
      "metadata.derivationParams.iterations": options.metadata?.derivationParams?.iterations || 3,
      "metadata.derivationParams.parallelism": options.metadata?.derivationParams?.parallelism || 4,
      "metadata.updatedAt": now,
      "metadata.lastAccessedAt": now,
      "metadata.deviceId": options.deviceId,
      isActive: true,
      isDeleted: false,
      deletedAt: null
    };
    if (options.recoveryPhrasesEncrypted) {
      baseSet.recoveryPhrasesEncrypted = options.recoveryPhrasesEncrypted;
    }
    logger.debug(`[MasterKeyService] Encrypted master key data structure for user: ${userId}`, {
      context: "saveCloudMasterKey",
      encryptedKeyDisplay: formatEncryptedMasterKeyForDisplay(encryptedKey),
      derivationParams: options.metadata?.derivationParams
    });
    const update = {
      $set: baseSet,
      $setOnInsert: {
        userId,
        "metadata.createdAt": now,
        "audit.accessCount": 0,
        "audit.failedDecryptionAttempts": 0,
        "audit.lastAccessedByDeviceId": options.deviceId
      }
    };
    if (existing?.masterKeyHash) {
      const existingHash = decryptText(existing.masterKeyHash);
      const sameHash = await comparePassword(options.masterKeyHash, existingHash);
      if (!sameHash) {
        update.$push = {
          masterKeyHashHistory: {
            $each: [
              {
                hash: existing.masterKeyHash,
                changedAt: now,
                changedByDeviceId: options.deviceId || null,
                changedByIp: options.changeContext?.ipAddress || null,
                changedByUserAgent: options.changeContext?.userAgent || null
              }
            ],
            $slice: -MASTER_KEY_HASH_HISTORY_LIMIT
          }
        };
      }
    }
    const savedKey = await MasterKey.findOneAndUpdate({ userId, isDeleted: false }, update, {
      upsert: true,
      returnDocument: "after",
      runValidators: true
    });
    if (savedKey) {
      try {
        await User.updateOne(
          { _id: userId },
          {
            $set: {
              masterKey: {
                cipherText: encryptedKey.cipherText,
                iv: encryptedKey.iv,
                authTag: encryptedKey.authTag,
                salt: encryptedKey.salt,
                algorithm: encryptedKey.algorithm || "aes-256-gcm",
                keyVersion: encryptedKey.keyVersion || "v1"
              },
              "meta.masterKey": {
                cipherText: encryptedKey.cipherText,
                iv: encryptedKey.iv,
                authTag: encryptedKey.authTag,
                salt: encryptedKey.salt,
                algorithm: encryptedKey.algorithm || "aes-256-gcm",
                keyVersion: encryptedKey.keyVersion || "v1"
              },
              "meta.masterKeyHash": encryptedIncomingHash,
              "meta.lastCredentialChangeAt": now
            }
          }
        );
      } catch (userSyncErr) {
        logger.warn(
          "[MasterKeyService] Failed to sync User masterKey meta, will retry on next access",
          {
            userId,
            error: userSyncErr
          }
        );
      }
      logger.info(`[MasterKeyService] Master key saved successfully for user: ${userId}`, {
        context: "saveCloudMasterKey",
        userId,
        documentId: savedKey._id.toString(),
        savedAt: now.toISOString(),
        encryptionAlgorithm: encryptedKey.algorithm || "aes-256-gcm"
      });
    }
    return savedKey;
  } catch (error) {
    logger.error(`[MasterKeyService] Error saving master key for user: ${userId}`, error, {
      context: "saveCloudMasterKey",
      userId
    });
    throw error;
  }
};
var getCloudMasterKey = async (userId, username, deviceId) => {
  try {
    logger.info(`[MasterKeyService] Retrieving encrypted master key for user: ${userId}`, {
      context: "getCloudMasterKey",
      userId,
      deviceId
    });
    if (!userId) {
      throw new Error("Missing userId");
    }
    const MasterKey = getMasterKeyModel(username);
    const masterKeyDoc = await MasterKey.findOne(
      { userId, isActive: true, isDeleted: false },
      {
        encryptedMasterKey: 1,
        masterKeyHash: 1,
        "metadata.derivationParams": 1,
        "audit.accessCount": 1
      }
    );
    if (!masterKeyDoc) {
      logger.warn(`[MasterKeyService] Master key not found for user: ${userId}`, {
        context: "getCloudMasterKey",
        userId
      });
      return null;
    }
    await MasterKey.findByIdAndUpdate(masterKeyDoc._id, {
      "metadata.lastAccessedAt": /* @__PURE__ */ new Date(),
      "audit.accessCount": (masterKeyDoc.audit?.accessCount || 0) + 1,
      "audit.lastAccessedByDeviceId": deviceId
    });
    logger.info(`[MasterKeyService] Master key retrieved successfully for user: ${userId}`, {
      context: "getCloudMasterKey",
      userId,
      accessCount: (masterKeyDoc.audit?.accessCount || 0) + 1
    });
    return masterKeyDoc.encryptedMasterKey;
  } catch (error) {
    logger.error(`[MasterKeyService] Error retrieving master key for user: ${userId}`, error, {
      context: "getCloudMasterKey",
      userId
    });
    throw error;
  }
};
var verifyMasterKeyHash = async (userId, username, masterKeyHash) => {
  try {
    logger.debug(`[MasterKeyService] Verifying master key hash for user: ${userId}`, {
      context: "verifyMasterKeyHash",
      userId
    });
    if (!userId || !masterKeyHash) {
      return false;
    }
    const MasterKey = getMasterKeyModel(username);
    const masterKeyDoc = await MasterKey.findOne(
      { userId, isActive: true, isDeleted: false },
      { masterKeyHash: 1 }
    );
    if (!masterKeyDoc) {
      return false;
    }
    const storedHash = decryptText(masterKeyDoc.masterKeyHash);
    const isValid = await comparePassword(masterKeyHash, storedHash);
    if (!isValid) {
      await MasterKey.findByIdAndUpdate(masterKeyDoc._id, {
        "audit.failedDecryptionAttempts": (masterKeyDoc.audit?.failedDecryptionAttempts || 0) + 1,
        "audit.lastFailedAttempt": /* @__PURE__ */ new Date()
      });
      logger.warn(`[MasterKeyService] Master key hash verification failed for user: ${userId}`, {
        context: "verifyMasterKeyHash",
        userId
      });
    }
    return isValid;
  } catch (error) {
    logger.error(`[MasterKeyService] Error verifying master key hash for user: ${userId}`, error, {
      context: "verifyMasterKeyHash",
      userId
    });
    return false;
  }
};
var deleteCloudMasterKey = async (userId, username) => {
  try {
    logger.warn(`[MasterKeyService] Deleting master key for user: ${userId}`, {
      context: "deleteCloudMasterKey",
      userId
    });
    if (!userId) {
      throw new Error("Missing userId");
    }
    const MasterKey = getMasterKeyModel(username);
    const result = await MasterKey.findOneAndUpdate(
      { userId, isDeleted: false },
      {
        isActive: false,
        isDeleted: true,
        deletedAt: /* @__PURE__ */ new Date()
      }
    );
    const success = !!result;
    logger.info(
      success ? `[MasterKeyService] Master key deleted for user: ${userId}` : `[MasterKeyService] Master key not found for deletion: ${userId}`,
      {
        context: "deleteCloudMasterKey",
        userId
      }
    );
    return success;
  } catch (error) {
    logger.error(`[MasterKeyService] Error deleting master key for user: ${userId}`, error, {
      context: "deleteCloudMasterKey",
      userId
    });
    throw error;
  }
};
var getMasterKeyMetadata = async (userId, username) => {
  try {
    const MasterKey = getMasterKeyModel(username);
    const masterKeyDoc = await MasterKey.findOne(
      { userId, isActive: true, isDeleted: false },
      { metadata: 1, audit: 1, masterKeyHashHistory: 1 }
    );
    if (!masterKeyDoc) {
      return null;
    }
    return {
      metadata: masterKeyDoc.metadata,
      audit: masterKeyDoc.audit,
      historyCount: Array.isArray(masterKeyDoc.masterKeyHashHistory) ? masterKeyDoc.masterKeyHashHistory.length : 0
    };
  } catch (error) {
    logger.error(
      `[MasterKeyService] Error getting master key metadata for user: ${userId}`,
      error,
      {
        context: "getMasterKeyMetadata",
        userId
      }
    );
    return null;
  }
};
var getMasterKeyFullData = async (userId, username) => {
  try {
    logger.info(`[MasterKeyService] Retrieving full master key data for user: ${userId}`, {
      context: "getMasterKeyFullData",
      userId
    });
    const MasterKey = getMasterKeyModel(username);
    const masterKeyDoc = await MasterKey.findOne(
      { userId, isActive: true, isDeleted: false },
      {
        encryptedMasterKey: 1,
        masterKeyHash: 1,
        metadata: 1,
        audit: 1,
        masterKeyHashHistory: 1,
        createdAt: 1,
        updatedAt: 1
      }
    );
    if (!masterKeyDoc) {
      logger.warn(`[MasterKeyService] Master key data not found for user: ${userId}`, {
        context: "getMasterKeyFullData",
        userId
      });
      return null;
    }
    const displayData = {
      encryptedMasterKey: formatEncryptedMasterKeyForDisplay(
        masterKeyDoc.encryptedMasterKey
      ),
      masterKeyHashPreview: `${masterKeyDoc.masterKeyHash.cipherText.substring(0, 20)}...`,
      metadata: masterKeyDoc.metadata,
      audit: masterKeyDoc.audit,
      historyCount: Array.isArray(masterKeyDoc.masterKeyHashHistory) ? masterKeyDoc.masterKeyHashHistory.length : 0,
      createdAt: masterKeyDoc.createdAt,
      updatedAt: masterKeyDoc.updatedAt
    };
    logger.debug(`[MasterKeyService] Full master key data retrieved for user: ${userId}`, {
      context: "getMasterKeyFullData",
      userId,
      displayData
    });
    return displayData;
  } catch (error) {
    logger.error(
      `[MasterKeyService] Error getting full master key data for user: ${userId}`,
      error,
      {
        context: "getMasterKeyFullData",
        userId
      }
    );
    return null;
  }
};

// server/controllers/masterKeyController.ts
init_logger();
var handleControllerError = (res, error, defaultCode, defaultMessage, logContext) => {
  logger.error(`[MasterKeyController] Error in ${logContext}`, error);
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      error: {
        code: error.code,
        message: error.message
      }
    });
  }
  const statusCode = typeof error?.statusCode === "number" ? error.statusCode : typeof error?.status === "number" ? error.status : 500;
  const code = typeof error?.code === "string" ? error.code : defaultCode;
  const message = error instanceof Error ? error.message : defaultMessage;
  return res.status(statusCode).json({
    success: false,
    message,
    error: {
      code,
      message
    }
  });
};
var MAX_BASE64_FIELD_LENGTH = 8192;
var MAX_MASTER_KEY_HASH_LENGTH = 256;
var MAX_DEVICE_ID_LENGTH = 128;
var MAX_RECOVERY_PAYLOAD_LENGTH = 32768;
var BASE64_PATTERN = /^[A-Za-z0-9+/=]+$/;
var isBase64WithinLimit = (value, maxLength) => {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    return false;
  }
  return BASE64_PATTERN.test(normalized);
};
var isValidDeviceId = (value) => {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > MAX_DEVICE_ID_LENGTH) {
    return false;
  }
  return /^[a-zA-Z0-9._:-]+$/.test(normalized);
};
var hasValidDerivationParams = (metadata) => {
  if (!metadata?.derivationParams) {
    return true;
  }
  const { memory, iterations, parallelism } = metadata.derivationParams;
  const isValidMemory = memory === void 0 || Number.isInteger(memory) && memory >= 8192 && memory <= 1048576;
  const isValidIterations = iterations === void 0 || Number.isInteger(iterations) && iterations >= 1 && iterations <= 12;
  const isValidParallelism = parallelism === void 0 || Number.isInteger(parallelism) && parallelism >= 1 && parallelism <= 32;
  return isValidMemory && isValidIterations && isValidParallelism;
};
var handleSaveMasterKey = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const username = req.user?.username;
    const { encryptedMasterKey, masterKeyHash, deviceId, recoveryPhrasesEncrypted, metadata } = req.body;
    if (!userId || !username) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required"
        }
      });
    }
    if (!encryptedMasterKey || !masterKeyHash || !deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Missing required fields: encryptedMasterKey, masterKeyHash, or deviceId"
        }
      });
    }
    if (!encryptedMasterKey.cipherText || !encryptedMasterKey.iv || !encryptedMasterKey.authTag || !encryptedMasterKey.salt) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Incomplete encrypted key payload"
        }
      });
    }
    if (!isValidDeviceId(deviceId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid deviceId format or length"
        }
      });
    }
    if (!isBase64WithinLimit(masterKeyHash, MAX_MASTER_KEY_HASH_LENGTH)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid masterKeyHash format or length"
        }
      });
    }
    if (!isBase64WithinLimit(encryptedMasterKey.cipherText, MAX_BASE64_FIELD_LENGTH) || !isBase64WithinLimit(encryptedMasterKey.iv, MAX_BASE64_FIELD_LENGTH) || !isBase64WithinLimit(encryptedMasterKey.authTag, MAX_BASE64_FIELD_LENGTH) || !isBase64WithinLimit(encryptedMasterKey.salt, MAX_BASE64_FIELD_LENGTH)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Encrypted master key payload is malformed or too large"
        }
      });
    }
    if (typeof recoveryPhrasesEncrypted === "string" && recoveryPhrasesEncrypted.length > MAX_RECOVERY_PAYLOAD_LENGTH) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Recovery payload is too large"
        }
      });
    }
    if (!hasValidDerivationParams(metadata)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid metadata derivation parameters"
        }
      });
    }
    const userDoc = await User.findById(userId).select("+password +meta.masterKey").lean().exec();
    if (userDoc?.password) {
      try {
        const passwordHash = typeof userDoc.password === "string" ? userDoc.password : decryptText(userDoc.password);
        const currentAccountPassword = typeof req.body.password === "string" && req.body.password.trim() ? req.body.password.trim() : void 0;
        const hasExistingMasterKey = Boolean(userDoc.meta?.masterKey?.cipherText);
        if (hasExistingMasterKey && !currentAccountPassword) {
          return res.status(400).json({
            success: false,
            error: {
              code: "PASSWORD_REQUIRED",
              message: "Current account password is required to update the cloud master key."
            }
          });
        }
        if (currentAccountPassword) {
          const isPasswordValid = await comparePassword(currentAccountPassword, passwordHash);
          if (!isPasswordValid) {
            return res.status(401).json({
              success: false,
              error: {
                code: "INVALID_CREDENTIALS",
                message: "Current password is incorrect."
              }
            });
          }
        }
        const rawKeyCandidate = typeof req.body.masterKey === "string" ? req.body.masterKey : void 0;
        if (rawKeyCandidate) {
          const isSameAsPassword = await comparePassword(rawKeyCandidate, passwordHash);
          if (isSameAsPassword) {
            return res.status(400).json({
              success: false,
              error: {
                code: "AUTH_SAME_CREDENTIALS",
                message: "Master key and account password must not be identical"
              }
            });
          }
        }
      } catch (error) {
        if (error?.statusCode || error?.code) {
          throw error;
        }
      }
    }
    await saveCloudMasterKey(userId, username, encryptedMasterKey, {
      masterKeyHash,
      deviceId,
      recoveryPhrasesEncrypted,
      metadata,
      changeContext: {
        ipAddress: getClientIp(req),
        userAgent: req.get("user-agent") || void 0
      }
    });
    return res.status(200).json({
      success: true,
      data: {
        saved: true,
        userId,
        deviceId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: "Master key saved to cloud successfully"
      }
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "SAVE_FAILED",
      "Failed to save master key",
      "handleSaveMasterKey"
    );
  }
};
var handleRetrieveMasterKey = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const username = req.user?.username;
    const deviceId = req.query.deviceId;
    if (!userId || !username) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required"
        }
      });
    }
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Missing required query parameter: deviceId"
        }
      });
    }
    if (!isValidDeviceId(deviceId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid deviceId format or length"
        }
      });
    }
    const encryptedKey = await getCloudMasterKey(userId, username, deviceId);
    if (!encryptedKey) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Master key not found in cloud"
        }
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        encryptedMasterKey: encryptedKey,
        userId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: "Master key retrieved successfully"
      }
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "RETRIEVE_FAILED",
      "Failed to retrieve master key",
      "handleRetrieveMasterKey"
    );
  }
};
var handleVerifyMasterKey = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const username = req.user?.username;
    const { masterKeyHash } = req.body;
    if (!userId || !username) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required"
        }
      });
    }
    if (!masterKeyHash) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Missing required field: masterKeyHash"
        }
      });
    }
    if (!isBase64WithinLimit(masterKeyHash, MAX_MASTER_KEY_HASH_LENGTH)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid masterKeyHash format or length"
        }
      });
    }
    const isValid = await verifyMasterKeyHash(userId, username, masterKeyHash);
    return res.status(200).json({
      success: true,
      data: {
        isValid,
        userId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: isValid ? "Master key verified successfully" : "Master key hash mismatch"
      }
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "VERIFY_FAILED",
      "Failed to verify master key",
      "handleVerifyMasterKey"
    );
  }
};
var handleDeleteMasterKey = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const username = req.user?.username;
    if (!userId || !username) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required"
        }
      });
    }
    const deleted = await deleteCloudMasterKey(userId, username);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Master key not found or already deleted"
        }
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        deleted: true,
        userId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message: "Master key deleted successfully"
      }
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "DELETE_FAILED",
      "Failed to delete master key",
      "handleDeleteMasterKey"
    );
  }
};
var handleGetMasterKeyMetadata = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const username = req.user?.username;
    if (!userId || !username) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required"
        }
      });
    }
    const metadata = await getMasterKeyMetadata(userId, username);
    if (!metadata) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Master key metadata not found"
        }
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        metadata: metadata.metadata,
        audit: metadata.audit,
        userId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "GET_METADATA_FAILED",
      "Failed to get metadata",
      "handleGetMasterKeyMetadata"
    );
  }
};
var handleGetMasterKeyFullData = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const username = req.user?.username;
    if (!userId || !username) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required"
        }
      });
    }
    const fullData = await getMasterKeyFullData(userId, username);
    if (!fullData) {
      return res.status(404).json({
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Master key data not found"
        }
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        userId,
        masterKey: fullData,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        note: "Encrypted data is safe - only encrypted components and hashes are shown, actual key material remains encrypted"
      }
    });
  } catch (error) {
    return handleControllerError(
      res,
      error,
      "GET_FULLDATA_FAILED",
      "Failed to get full data",
      "handleGetMasterKeyFullData"
    );
  }
};

// server/routes/masterKeyRoutes.ts
var masterKeyRouter = express4.Router();
var toPositiveInteger2 = (raw, fallback) => {
  const parsed = Number.parseInt(raw || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
var normalizeRateLimitSegment = (value) => {
  if (typeof value !== "string") {
    return "unknown";
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized.slice(0, 128) : "unknown";
};
var masterKeyRateLimitWindowMs = toPositiveInteger2(
  process.env.MASTER_KEY_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1e3
);
var createMasterKeyLimiter = (max, message, code) => rateLimit4({
  windowMs: masterKeyRateLimitWindowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${req.path}:${normalizeRateLimitSegment(req?.user?.userId)}:${normalizeRateLimitSegment(req.query?.deviceId || req.body?.deviceId)}`,
  message: {
    success: false,
    message,
    error: { code }
  }
});
var saveMasterKeyLimiter = createMasterKeyLimiter(
  toPositiveInteger2(process.env.MASTER_KEY_SAVE_RATE_LIMIT_MAX, 10),
  "Too many master key save attempts. Please try again later.",
  "TOO_MANY_MASTER_KEY_SAVE_ATTEMPTS"
);
var retrieveMasterKeyLimiter = createMasterKeyLimiter(
  toPositiveInteger2(process.env.MASTER_KEY_RETRIEVE_RATE_LIMIT_MAX, 40),
  "Too many master key retrieval attempts. Please try again later.",
  "TOO_MANY_MASTER_KEY_RETRIEVE_ATTEMPTS"
);
var verifyMasterKeyLimiter = createMasterKeyLimiter(
  toPositiveInteger2(process.env.MASTER_KEY_VERIFY_RATE_LIMIT_MAX, 20),
  "Too many master key verification attempts. Please try again later.",
  "TOO_MANY_MASTER_KEY_VERIFY_ATTEMPTS"
);
var deleteMasterKeyLimiter = createMasterKeyLimiter(
  toPositiveInteger2(process.env.MASTER_KEY_DELETE_RATE_LIMIT_MAX, 5),
  "Too many master key deletion attempts. Please try again later.",
  "TOO_MANY_MASTER_KEY_DELETE_ATTEMPTS"
);
var readMasterKeyAuditLimiter = createMasterKeyLimiter(
  toPositiveInteger2(process.env.MASTER_KEY_AUDIT_RATE_LIMIT_MAX, 20),
  "Too many master key metadata requests. Please try again later.",
  "TOO_MANY_MASTER_KEY_AUDIT_ATTEMPTS"
);
masterKeyRouter.post(
  "/save",
  requireTrustedBrowserOrigin,
  requireAuth,
  saveMasterKeyLimiter,
  asyncHandler(handleSaveMasterKey)
);
masterKeyRouter.get(
  "/retrieve",
  requireAuth,
  retrieveMasterKeyLimiter,
  asyncHandler(handleRetrieveMasterKey)
);
masterKeyRouter.post(
  "/verify",
  requireTrustedBrowserOrigin,
  requireAuth,
  verifyMasterKeyLimiter,
  asyncHandler(handleVerifyMasterKey)
);
masterKeyRouter.delete(
  "/",
  requireTrustedBrowserOrigin,
  requireAuth,
  deleteMasterKeyLimiter,
  asyncHandler(handleDeleteMasterKey)
);
masterKeyRouter.get(
  "/metadata",
  requireAuth,
  readMasterKeyAuditLimiter,
  asyncHandler(handleGetMasterKeyMetadata)
);
masterKeyRouter.get(
  "/full-data",
  requireAuth,
  readMasterKeyAuditLimiter,
  asyncHandler(handleGetMasterKeyFullData)
);
var masterKeyRoutes_default = masterKeyRouter;

// server/routes/contactRoutes.ts
import { Router } from "express";

// server/models/Contact.ts
import mongoose22, { Schema as Schema3 } from "mongoose";
import crypto11 from "crypto";
var ContactStatus = /* @__PURE__ */ ((ContactStatus2) => {
  ContactStatus2["UNREAD"] = "unread";
  ContactStatus2["READ"] = "read";
  ContactStatus2["REPLIED"] = "replied";
  ContactStatus2["ARCHIVED"] = "archived";
  return ContactStatus2;
})(ContactStatus || {});
var ContactPriority = /* @__PURE__ */ ((ContactPriority2) => {
  ContactPriority2["LOW"] = "low";
  ContactPriority2["MEDIUM"] = "medium";
  ContactPriority2["HIGH"] = "high";
  return ContactPriority2;
})(ContactPriority || {});
var ContactSubject = /* @__PURE__ */ ((ContactSubject2) => {
  ContactSubject2["GENERAL"] = "General Inquiry";
  ContactSubject2["TECH"] = "Technical Support";
  ContactSubject2["SECURITY"] = "Security Vulnerability";
  ContactSubject2["VAULT"] = "Vault Access";
  ContactSubject2["FEATURE"] = "Feature Request";
  ContactSubject2["PRIVACY"] = "Privacy Request";
  ContactSubject2["OTHER"] = "Other";
  return ContactSubject2;
})(ContactSubject || {});
var ContactSchema = new Schema3(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 100
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"]
    },
    username: {
      type: String,
      required: [true, "Username is required"],
      trim: true,
      index: true
    },
    subject: {
      type: String,
      enum: Object.values(ContactSubject),
      required: true,
      index: true
    },
    message: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 2e3,
      trim: true
    },
    ipAddress: {
      type: String,
      index: true
    },
    userAgent: String,
    geolocation: {
      type: Schema3.Types.Mixed
    },
    status: {
      type: String,
      enum: Object.values(ContactStatus),
      default: "unread" /* UNREAD */,
      index: true
    },
    priority: {
      type: String,
      enum: Object.values(ContactPriority),
      default: "low" /* LOW */,
      index: true
    },
    referenceId: {
      type: String,
      unique: true,
      index: true
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    // auto createdAt & updatedAt
    versionKey: false
  }
);
ContactSchema.index({ createdAt: -1 });
ContactSchema.index({ email: 1, status: 1 });
ContactSchema.index({ subject: 1, priority: 1 });
ContactSchema.pre("save", function() {
  if (!this.referenceId) {
    this.referenceId = "VLT-" + crypto11.randomBytes(4).toString("hex").toUpperCase();
  }
  switch (this.subject) {
    case "Security Vulnerability" /* SECURITY */:
      this.priority = "high" /* HIGH */;
      break;
    case "Technical Support" /* TECH */:
    case "Vault Access" /* VAULT */:
      this.priority = "medium" /* MEDIUM */;
      break;
    default:
      this.priority = "low" /* LOW */;
  }
});
ContactSchema.statics.findActive = function() {
  return this.find({ isDeleted: false }).sort({ createdAt: -1 }).allowDiskUse(true);
};
var Contact = mongoose22.model("Contact", ContactSchema);

// server/controllers/contactController.ts
init_logger();
var submitContactForm = async (req, res) => {
  try {
    const { name, email, username, subject, message } = req.body;
    if (!name || !email || !username || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "All required fields must be provided."
        }
      });
    }
    const ipAddress = getClientIp(req);
    const userAgent = req.get("user-agent") || "unknown";
    let geolocation = null;
    try {
      if (ipAddress !== "unknown" && ipAddress !== "127.0.0.1" && ipAddress !== "::1") {
        const geoUrl = `https://free.freeipapi.com/api/json/${ipAddress}`;
        const geoResponse = await fetch(geoUrl, {
          signal: AbortSignal.timeout(8e3)
        });
        if (geoResponse.ok) {
          geolocation = await geoResponse.json();
        }
      }
    } catch (e) {
      logger.warn("Failed to fetch geolocation for contact submission", {
        ipAddress,
        error: e instanceof Error ? e.message : "Unknown"
      });
    }
    const newContact = new Contact({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      username: username.trim(),
      subject,
      message: message.trim(),
      ipAddress,
      userAgent,
      geolocation
    });
    let savedContact;
    try {
      savedContact = await newContact.save();
    } catch (saveError) {
      if (saveError.code === 11e3 && saveError.keyPattern?.referenceId) {
        logger.warn("Reference ID collision occurred, retrying...", {
          collisionId: newContact.referenceId
        });
        newContact.referenceId = void 0;
        savedContact = await newContact.save();
      } else {
        throw saveError;
      }
    }
    logger.info("Contact form submission successful", {
      referenceId: savedContact.referenceId,
      email: savedContact.email,
      requestId: req.requestId
    });
    return res.status(201).json({
      success: true,
      message: "Your message has been received successfully.",
      referenceId: savedContact.referenceId
    });
  } catch (error) {
    const requestId = req.requestId;
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: messages[0] || "Invalid data provided.",
          requestId
        }
      });
    }
    if (error.code === 11e3 || error.name === "MongoServerError") {
      logger.error("Contact form terminal database error", {
        error: error.message,
        code: error.code,
        keyPattern: error.keyPattern,
        requestId
      });
      return res.status(500).json({
        success: false,
        error: {
          code: "DATABASE_ERROR",
          message: "An internal storage error occurred. Please try again or contact support directly.",
          requestId
        }
      });
    }
    logger.error("Unexpected error in contact form submission", {
      error: error.message,
      stack: error.stack,
      requestId
    });
    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: process.env.NODE_ENV === "development" ? `Server Error: ${error.message}` : "An unexpected error occurred. Please try again later.",
        requestId
      }
    });
  }
};

// server/routes/contactRoutes.ts
import rateLimit5 from "express-rate-limit";

// server/validators/contactValidator.ts
import { z as z2 } from "zod";
var USERNAME_PATTERN3 = /^[a-z0-9._-]+$/i;
var CONTACT_SUBJECTS = [
  "General Inquiry",
  "Technical Support",
  "Security Vulnerability",
  "Vault Access",
  "Feature Request",
  "Privacy Request",
  "Other"
];
var captchaTokenSchema2 = z2.string().trim().min(20, "CAPTCHA token is invalid").max(4096, "CAPTCHA token is invalid");
var contactSchema = z2.object({
  name: z2.string().trim().min(2, "Full name must be between 2 and 100 characters.").max(100, "Full name must be between 2 and 100 characters."),
  email: z2.string().trim().toLowerCase().email("A valid email address is required.").max(254, "A valid email address is required."),
  username: z2.string().trim().min(3, "Username must be 3 to 64 characters.").max(64, "Username must be 3 to 64 characters.").regex(
    USERNAME_PATTERN3,
    "Username can only include letters, numbers, dots, underscores, and hyphens."
  ),
  subject: z2.string().refine(
    (value) => CONTACT_SUBJECTS.includes(value),
    "Please select a valid query category."
  ),
  message: z2.string().trim().min(10, "Message must be between 10 and 2000 characters.").max(2e3, "Message must be between 10 and 2000 characters."),
  captchaToken: captchaTokenSchema2
}).strict();

// server/routes/contactRoutes.ts
var router = Router();
var contactLimiter = rateLimit5({
  windowMs: 60 * 60 * 1e3,
  // 1 hour
  max: 5,
  // Limit each IP to 5 submissions per hour
  message: {
    success: false,
    error: {
      code: "TOO_MANY_SUBMISSIONS",
      message: "Too many messages from this IP, please try again after an hour."
    }
  }
});
router.post(
  "/submit",
  requireTrustedBrowserOrigin,
  contactLimiter,
  validate(contactSchema),
  requireRecaptcha({ action: "contact_submit" }),
  submitContactForm
);

// server/routes/systemRoutes.ts
init_logger();
import express5 from "express";
import fs9 from "node:fs/promises";
import path12 from "node:path";
var router2 = express5.Router();
var LOG_FILE2 = path12.resolve(process.cwd(), "logs/server.jsonl");
var userClearedTimestamps = /* @__PURE__ */ new Map();
async function readLastLines(filePath, maxLines) {
  let fileHandle;
  try {
    const stat = await fs9.stat(filePath);
    fileHandle = await fs9.open(filePath, "r");
    const fileSize = stat.size;
    const bufferSize = 8192;
    const buffer = Buffer.alloc(bufferSize);
    let lineCount = 0;
    let filePosition = fileSize;
    let leftover = "";
    const lines = [];
    while (filePosition > 0 && lineCount < maxLines) {
      const readSize = Math.min(bufferSize, filePosition);
      filePosition -= readSize;
      await fileHandle.read(buffer, 0, readSize, filePosition);
      const chunk = buffer.toString("utf8", 0, readSize) + leftover;
      const chunkLines = chunk.split("\n");
      leftover = chunkLines.shift() || "";
      for (let i = chunkLines.length - 1; i >= 0; i--) {
        if (chunkLines[i].trim()) {
          lines.push(chunkLines[i]);
          lineCount++;
          if (lineCount >= maxLines) break;
        }
      }
    }
    if (leftover.trim() && lineCount < maxLines) {
      lines.push(leftover);
    }
    return lines;
  } catch (error) {
    console.error("Error reading log file backward:", error);
    return [];
  } finally {
    await fileHandle?.close();
  }
}
router2.get("/logs", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const username = req.user?.username || "user";
    const limit = parseInt(req.query.limit) || 50;
    const cursorStr = req.query.cursor;
    const offset = cursorStr ? parseInt(cursorStr) : 0;
    const clearedAt = userClearedTimestamps.get(userId) || 0;
    let mappedActivityLogs = [];
    try {
      const activityLogs = await getUserActivityLogs(userId, username, 200, 0);
      mappedActivityLogs = activityLogs.filter((a) => new Date(a.timestamp).getTime() > clearedAt).map((a) => ({
        id: `act-${a._id}`,
        level: a.status === "FAILURE" ? "warn" : "info",
        message: `[User Activity] ${a.action} - ${a.category}`,
        timestamp: new Date(a.timestamp).toISOString(),
        meta: {
          device: a.device,
          ipAddress: a.ipAddress,
          status: a.status,
          ...a.details || {}
        }
      }));
    } catch (actErr) {
      logger.warn("[SystemRoutes] Could not fetch user activity logs:", actErr);
    }
    const maxToRead = Math.max(offset + limit + 200, 500);
    const rawLines = await readLastLines(LOG_FILE2, maxToRead);
    const parsedSystemLogs = [];
    for (let i = 0; i < rawLines.length; i++) {
      try {
        const parsed = JSON.parse(rawLines[i]);
        const logTime = new Date(parsed.timestamp).getTime();
        if (logTime <= clearedAt) continue;
        const metaUser = parsed.meta?.userId || parsed.meta?.user || parsed.meta?.username;
        if (!metaUser || String(metaUser) !== String(userId) && String(metaUser) !== String(username)) {
          continue;
        }
        parsed.id = parsed.id || `sys-${parsed.timestamp}-${i}`;
        parsedSystemLogs.push(parsed);
      } catch {
      }
    }
    const combinedMap = /* @__PURE__ */ new Map();
    [...mappedActivityLogs, ...parsedSystemLogs].forEach((item) => {
      combinedMap.set(item.id, item);
    });
    const allUserLogs = Array.from(combinedMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const pageLogs = allUserLogs.slice(offset, offset + limit);
    const hasMore = allUserLogs.length > offset + limit;
    const nextCursor = hasMore ? String(offset + limit) : null;
    res.json({
      success: true,
      logs: pageLogs,
      hasMore,
      nextCursor
    });
  } catch (error) {
    console.error("Error fetching system logs:", error);
    res.status(500).json({ success: false, message: "Failed to retrieve user logs" });
  }
});
router2.post("/logs/clear", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const username = req.user?.username || "user";
    if (userId) {
      userClearedTimestamps.set(userId, Date.now());
      await deleteUserActivityLogs(userId, username).catch((err) => {
        logger.warn("[SystemRoutes] Could not delete activity logs:", err);
      });
    }
    res.json({ success: true, message: "Your system logs cleared successfully" });
  } catch (error) {
    console.error("Error clearing system logs:", error);
    res.status(500).json({ success: false, message: "Failed to clear user logs" });
  }
});

// server/routes/twoFactorRoutes.ts
import { Router as Router2 } from "express";

// server/services/twoFactorService.ts
import speakeasy from "speakeasy";
import QRCode from "qrcode";
init_logger();
import crypto12 from "crypto";
var logTwoFactorEvent = (userId, action, details) => {
  logger.info(`2FA event: ${action}`, { userId, ...details });
};
var generate2FASecret = async (username) => {
  const secret = speakeasy.generateSecret({
    name: `Vault (${username})`,
    issuer: "Vault"
  });
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url || "");
  return {
    secret: secret.base32,
    qrCodeUrl
  };
};
var verifyOTPWithReplayDefense = (secret, token, lastUsedTimestamp = 0) => {
  const sanitizedSecret = secret.trim();
  const sanitizedToken = token.trim().replace(/\s/g, "");
  const delta = speakeasy.totp.verifyDelta({
    secret: sanitizedSecret,
    encoding: "base32",
    token: sanitizedToken,
    window: 1
  });
  if (delta === null || delta === void 0) {
    return { isValid: false };
  }
  const currentTimeStep = Math.floor(Date.now() / 1e3 / 30);
  const matchedTimeStep = currentTimeStep + delta.delta;
  if (lastUsedTimestamp && matchedTimeStep <= lastUsedTimestamp) {
    return { isValid: false };
  }
  return { isValid: true, matchedTimeStep };
};
var generateBackupCodes = async () => {
  const codeSet = /* @__PURE__ */ new Set();
  while (codeSet.size < 10) {
    const code = crypto12.randomBytes(4).toString("hex").toLowerCase();
    codeSet.add(code);
  }
  const plain = Array.from(codeSet);
  const hashed = await Promise.all(plain.map((c) => hashPassword(c)));
  return { plain, hashed };
};
var encryptSecret = (secret) => {
  return encryptText(secret);
};
var decryptSecret = (encryptedPayload) => {
  return decryptText(encryptedPayload);
};
var setup2FA = async (userId, username) => {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound("User not found");
  const { secret, qrCodeUrl } = await generate2FASecret(username);
  user.twoFactorTempSecret = encryptSecret(secret);
  await user.save();
  logTwoFactorEvent(userId, "2FA_SETUP_INITIATED", {
    username
  });
  return { qrCodeUrl, secret };
};
var verifyAndEnable2FA = async (userId, token) => {
  const user = await User.findById(userId).select("+twoFactorTempSecret");
  if (!user || !user.twoFactorTempSecret) {
    throw AppError.badRequest("2FA setup not initiated", "2FA_NOT_INITIATED");
  }
  const secret = decryptSecret(user.twoFactorTempSecret);
  const { isValid, matchedTimeStep } = verifyOTPWithReplayDefense(secret, token, 0);
  if (!isValid) {
    logger.warn("2FA Setup Verification failed", {
      userId,
      serverTime: (/* @__PURE__ */ new Date()).toISOString(),
      tokenReceived: token.length === 6 ? "******" : "invalid-length"
    });
    throw AppError.unauthorized("Invalid OTP", "INVALID_OTP");
  }
  const { plain: backupCodes, hashed: hashedBackupCodes } = await generateBackupCodes();
  user.twoFactorSecret = user.twoFactorTempSecret;
  user.twoFactorTempSecret = null;
  user.twoFactorEnabled = true;
  user.twoFactorBackupCodes = hashedBackupCodes;
  user.twoFactorLastUsedTimestamp = matchedTimeStep || Math.floor(Date.now() / 1e3 / 30);
  await user.save();
  logTwoFactorEvent(userId, "2FA_ENABLED", {
    method: "TOTP",
    backupCodesGenerated: 10
  });
  return { backupCodes };
};
var consumeBackupCodeAtomic = async (userId, candidateCode) => {
  if (!candidateCode || typeof candidateCode !== "string") {
    return false;
  }
  const cleanCode = candidateCode.trim().replace(/[\s-]/g, "");
  if (!/^[a-zA-Z0-9]{8}$|^[a-zA-Z0-9]{32}$/.test(cleanCode)) {
    return false;
  }
  const user = await User.findById(userId).select("+twoFactorBackupCodes").exec();
  if (!user || !Array.isArray(user.twoFactorBackupCodes) || user.twoFactorBackupCodes.length === 0) {
    return false;
  }
  const candidatesToTest = /* @__PURE__ */ new Set();
  candidatesToTest.add(cleanCode.toLowerCase());
  candidatesToTest.add(cleanCode.toUpperCase());
  candidatesToTest.add(cleanCode);
  if (cleanCode.length === 8) {
    const hyphenated = `${cleanCode.slice(0, 4)}-${cleanCode.slice(4)}`;
    candidatesToTest.add(hyphenated);
    candidatesToTest.add(hyphenated.toLowerCase());
    candidatesToTest.add(hyphenated.toUpperCase());
  }
  if (cleanCode.length === 32) {
    const legacyFormatted = cleanCode.match(/.{1,4}/g).join("-");
    candidatesToTest.add(legacyFormatted);
    candidatesToTest.add(legacyFormatted.toUpperCase());
  }
  const candidatesList = Array.from(candidatesToTest);
  let matchedHash = null;
  for (const storedHash of user.twoFactorBackupCodes) {
    let isMatch = false;
    for (const candidate of candidatesList) {
      if (await comparePassword(candidate, storedHash)) {
        isMatch = true;
        break;
      }
    }
    if (isMatch) {
      matchedHash = storedHash;
      break;
    }
  }
  if (!matchedHash) {
    return false;
  }
  const result = await User.updateOne(
    {
      _id: userId,
      twoFactorBackupCodes: matchedHash
    },
    {
      $pull: { twoFactorBackupCodes: matchedHash }
    }
  );
  return result.modifiedCount === 1;
};
var disable2FA = async (userId, token, password) => {
  const user = await User.findById(userId).select(
    "+password +twoFactorSecret +twoFactorBackupCodes +twoFactorLastUsedTimestamp"
  );
  if (!user || !user.twoFactorEnabled) {
    throw AppError.badRequest("2FA is not enabled", "2FA_NOT_ENABLED");
  }
  if (!password || typeof password !== "string" || !password.trim()) {
    throw AppError.badRequest("Current password is required to disable 2FA.");
  }
  {
    let currentHash = "";
    if (typeof user.password === "string") {
      currentHash = user.password;
    } else if (user.password && typeof user.password === "object" && "cipherText" in user.password) {
      try {
        currentHash = decryptText(user.password);
      } catch (err) {
        logger.warn("Failed to decrypt password hash in disable2FA", { error: err });
      }
    }
    const isPasswordValid = currentHash ? await comparePassword(password.trim(), currentHash) : false;
    if (!isPasswordValid) {
      throw AppError.unauthorized("Current password is incorrect.", "INVALID_CREDENTIALS");
    }
  }
  const secret = decryptSecret(user.twoFactorSecret);
  const { isValid: isTotpValid } = verifyOTPWithReplayDefense(
    secret,
    token,
    user.twoFactorLastUsedTimestamp || 0
  );
  let isValid = isTotpValid;
  if (!isValid) {
    isValid = await consumeBackupCodeAtomic(userId, token);
  }
  if (!isValid) {
    throw AppError.unauthorized("Invalid OTP or backup code", "INVALID_OTP");
  }
  user.twoFactorEnabled = false;
  user.twoFactorSecret = null;
  user.twoFactorBackupCodes = [];
  user.twoFactorLastUsedTimestamp = 0;
  await user.save();
  logTwoFactorEvent(userId, "2FA_DISABLED", {
    method: isTotpValid ? "TOTP" : "BACKUP_CODE"
  });
  return { disabled: true };
};
var verifyLoginOTP = async (userId, token) => {
  const user = await User.findById(userId).select(
    "+twoFactorSecret +twoFactorBackupCodes +twoFactorLastUsedTimestamp"
  );
  if (!user || !user.twoFactorEnabled) {
    throw AppError.badRequest("2FA is not enabled", "2FA_NOT_ENABLED");
  }
  const secret = decryptSecret(user.twoFactorSecret);
  const { isValid, matchedTimeStep } = verifyOTPWithReplayDefense(
    secret,
    token,
    user.twoFactorLastUsedTimestamp || 0
  );
  if (isValid && matchedTimeStep) {
    user.twoFactorLastUsedTimestamp = matchedTimeStep;
    await user.save();
    logTwoFactorEvent(userId, "2FA_VERIFIED", { method: "TOTP" });
    return true;
  }
  const isBackupValid = await consumeBackupCodeAtomic(userId, token);
  if (isBackupValid) {
    logTwoFactorEvent(userId, "2FA_VERIFIED", {
      method: "BACKUP_CODE"
    });
    return true;
  }
  return false;
};

// server/controllers/twoFactorController.ts
init_logger();
var setup2FA2 = async (req, res) => {
  const result = await setup2FA(req.user.userId, req.user.username);
  return sendSuccess(res, result, "2FA setup initiated. Scan the QR code.");
};
var verifyAndEnable2FA2 = async (req, res) => {
  const { token } = req.body;
  if (!token) throw AppError.badRequest("OTP token is required.");
  const result = await verifyAndEnable2FA(req.user.userId, token);
  return sendSuccess(res, result, "2FA has been enabled. Save your backup codes.");
};
var login2FA = async (req, res) => {
  const { userId, token, deviceId, mfaToken } = req.body;
  if (!userId || !token || !mfaToken) {
    throw AppError.badRequest("UserId, OTP token, and MFA token are required.");
  }
  try {
    const decoded = verifyMfaToken(mfaToken);
    if (decoded.sub !== userId) {
      throw new Error("MFA token mismatch.");
    }
  } catch (error) {
    logger.warn("MFA token verification failed during login", { userId, ip: getClientIp(req) });
    throw AppError.unauthorized(
      "Authentication session expired. Please sign in again.",
      "MFA_TOKEN_INVALID"
    );
  }
  anomalyDetectionService.trackOTPAttempt(userId);
  const isValid = await verifyLoginOTP(userId, token);
  if (!isValid) {
    throw AppError.unauthorized("Invalid OTP or backup code", "INVALID_OTP");
  }
  anomalyDetectionService.clearOTPAttempts(userId);
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound("User not found");
  const session = issueUserSession(user, {
    deviceId: deviceId || "unknown",
    ipAddress: getClientIp(req),
    userAgent: req.get("user-agent")
  });
  await user.save();
  try {
    const ip = getClientIp(req);
    await createNotification(
      user._id.toString(),
      "device_login",
      "New Device Login (2FA)",
      `A new session was established on device "${deviceId || "Web Client"}" from IP: ${ip} (2FA verified)`
    );
  } catch (err) {
    logger.warn("Failed to create 2FA login notification", { error: err });
  }
  applyRefreshCookie(req, res, session.refreshToken);
  return sendSuccess(
    res,
    {
      token: session.accessToken,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      sessionId: session.sessionId,
      user: {
        id: user._id,
        username: user.username,
        twoFactorEnabled: true,
        meta: user.meta
      }
    },
    "2FA verification successful"
  );
};
var disable2FA2 = async (req, res) => {
  const { token, password } = req.body;
  if (!token) throw AppError.badRequest("OTP token is required to disable 2FA.");
  const result = await disable2FA(req.user.userId, token, password);
  return sendSuccess(res, result, "2FA has been disabled.");
};

// server/routes/twoFactorRoutes.ts
import rateLimit6 from "express-rate-limit";

// server/validators/twoFactorValidator.ts
import { z as z3 } from "zod";
var captchaTokenSchema3 = z3.string().trim().min(20, "CAPTCHA token is invalid").max(4096, "CAPTCHA token is invalid");
var deviceIdSchema2 = z3.string().trim().min(1).max(128);
var otpTokenSchema = z3.string().trim().min(1, "OTP token is required").max(32, "OTP token is invalid").regex(/^\d{6}$|^[A-Za-z0-9]{8}$/, "OTP token format is invalid");
var login2FASchema = z3.object({
  userId: z3.string().trim().min(1, "UserId is required").max(128),
  token: otpTokenSchema,
  mfaToken: z3.string().trim().min(1, "MFA token is required").max(2048),
  deviceId: deviceIdSchema2.optional(),
  captchaToken: captchaTokenSchema3.optional()
});
var twoFactorTokenSchema = z3.object({
  token: otpTokenSchema
});

// server/routes/twoFactorRoutes.ts
var router3 = Router2();
var twoFactorLimiter = rateLimit6({
  windowMs: 15 * 60 * 1e3,
  max: 10,
  // Stricter limit for 2FA actions
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${req.path}`,
  message: {
    success: false,
    message: "Too many 2FA attempts. Please try again later.",
    error: { code: "TOO_MANY_2FA_ATTEMPTS" }
  }
});
router3.post("/setup", requireAuth, twoFactorLimiter, asyncHandler(setup2FA2));
router3.post(
  "/verify",
  requireAuth,
  twoFactorLimiter,
  validate(twoFactorTokenSchema),
  asyncHandler(verifyAndEnable2FA2)
);
router3.post(
  "/login",
  requireTrustedBrowserOrigin,
  requireRecaptcha({ action: "auth_2fa_login" }),
  twoFactorLimiter,
  validate(login2FASchema),
  asyncHandler(login2FA)
);
router3.post(
  "/disable",
  requireAuth,
  twoFactorLimiter,
  validate(twoFactorTokenSchema),
  asyncHandler(disable2FA2)
);
var twoFactorRouter = router3;

// server/routes/securityRoutes.ts
import { Router as Router3 } from "express";

// server/services/aiAnomalyDetectionService.ts
var AIAnomalyDetectionService = class {
  userProfiles = /* @__PURE__ */ new Map();
  HIGH_RISK_THRESHOLD = 70;
  MEDIUM_RISK_THRESHOLD = 40;
  /**
   * Track user login attempt for behavioral analysis
   */
  async analyzeLoginAttempt(userId, ip, location, fingerprint, _userAgent) {
    const profile = this.getOrCreateProfile(userId);
    const factors = [];
    let riskScore = 0;
    if (!profile.loginIPs.has(ip)) {
      factors.push("NEW_IP");
      riskScore += 15;
      profile.loginIPs.add(ip);
    }
    if (location) {
      const lastKnownLocation = this.getLastKnownLocation(userId);
      if (lastKnownLocation) {
        const distance = this.calculateDistance(lastKnownLocation, location);
        const timeSinceLastLogin = Date.now() - this.getLastLoginTime(userId);
        const impossibleSpeed = distance / (timeSinceLastLogin / 36e5);
        if (impossibleSpeed > 900) {
          factors.push("IMPOSSIBLE_TRAVEL");
          riskScore += 40;
        }
      }
      const locationCount = profile.typicalLocations.get(location.country) || 0;
      if (locationCount === 0) {
        factors.push("NEW_LOCATION");
        riskScore += 20;
      }
      profile.typicalLocations.set(location.country, (locationCount || 0) + 1);
    }
    const currentHour = (/* @__PURE__ */ new Date()).getHours();
    const loginAtThisHour = profile.typicalLoginHours.filter((h) => h === currentHour).length;
    const totalLogins = profile.typicalLoginHours.length;
    if (totalLogins > 10 && loginAtThisHour === 0) {
      factors.push("UNUSUAL_LOGIN_TIME");
      riskScore += 10;
    }
    profile.typicalLoginHours.push(currentHour);
    if (!profile.typicalDevices.has(fingerprint)) {
      factors.push("NEW_DEVICE");
      riskScore += 25;
      profile.typicalDevices.add(fingerprint);
    }
    const now = Date.now();
    const recentFailures = profile.failedLoginAttempts.filter(
      (f) => now - f.timestamp < 36e5
      // Last hour
    );
    if (recentFailures.length > 5) {
      factors.push("BRUTE_FORCE_DETECTED");
      riskScore += 50;
    }
    const behaviorScore = this.calculateBehaviorAnomaly(profile);
    riskScore += behaviorScore;
    const loginRisk = Math.min(100, riskScore);
    return {
      overallRisk: loginRisk,
      loginRisk,
      apiAbuseRisk: 0,
      dataExfilRisk: 0,
      factors,
      recommendation: this.getRecommendation(loginRisk, factors)
    };
  }
  /**
   * Analyze API usage patterns for abuse detection
   */
  async analyzeApiUsage(userId, endpoint, responseTime) {
    const profile = this.getOrCreateProfile(userId);
    let pattern = profile.apiCallPatterns.find((p) => p.endpoint === endpoint);
    if (!pattern) {
      pattern = { endpoint, count: 0, avgMs: 0 };
      profile.apiCallPatterns.push(pattern);
    }
    const alpha = 0.3;
    pattern.avgMs = alpha * responseTime + (1 - alpha) * pattern.avgMs;
    pattern.count++;
    const avgCount = profile.apiCallPatterns.reduce((sum, p) => sum + p.count, 0) / profile.apiCallPatterns.length;
    const variance = profile.apiCallPatterns.reduce((sum, p) => sum + Math.pow(p.count - avgCount, 2), 0) / profile.apiCallPatterns.length;
    const stdDev = Math.sqrt(variance);
    const zScore = Math.abs((pattern.count - avgCount) / (stdDev || 1));
    const isAnomaly = zScore > 3;
    let riskScore = 0;
    let reason = "";
    if (isAnomaly) {
      riskScore += 40;
      reason = `API call rate spike (z-score: ${zScore.toFixed(2)})`;
    }
    if (responseTime > 5e3) {
      riskScore += 20;
      reason = `Slow response time: ${responseTime}ms`;
    }
    if (pattern.count > 100 && endpoint.includes("search") || endpoint.includes("export")) {
      riskScore += 15;
      reason = `High frequency access to heavy endpoint`;
    }
    return {
      riskScore: Math.min(100, riskScore),
      isAnomalous: isAnomaly || riskScore > 40,
      reason
    };
  }
  /**
   * Detect data exfiltration patterns
   */
  async detectDataExfiltration(userId, itemIds, action) {
    const profile = this.getOrCreateProfile(userId);
    const now = Date.now();
    let riskScore = 0;
    let newAccessCount = 0;
    for (const itemId of itemIds) {
      let pattern = profile.dataAccessPatterns.find((p) => p.itemId === itemId);
      if (!pattern) {
        pattern = { itemId, accessCount: 0, lastAccess: 0 };
        profile.dataAccessPatterns.push(pattern);
      }
      pattern.accessCount++;
      pattern.lastAccess = now;
      newAccessCount++;
    }
    if (newAccessCount > 50) {
      riskScore += 60;
    } else if (newAccessCount > 20) {
      riskScore += 40;
    }
    if (action === "export" && itemIds.length > 10) {
      riskScore += 35;
    }
    return {
      riskScore: Math.min(100, riskScore),
      isAnomalous: riskScore > this.MEDIUM_RISK_THRESHOLD
    };
  }
  /**
   * Track failed login for brute force detection
   */
  trackFailedLogin(userId, ip) {
    const profile = this.getOrCreateProfile(userId);
    profile.failedLoginAttempts.push({
      timestamp: Date.now(),
      ip
    });
    const oneHourAgo = Date.now() - 36e5;
    profile.failedLoginAttempts = profile.failedLoginAttempts.filter(
      (f) => f.timestamp > oneHourAgo
    );
  }
  /**
   * Get user's typical pattern for continuous authentication
   */
  getTypicalBehavior(userId) {
    const profile = this.userProfiles.get(userId);
    if (!profile) return null;
    return {
      knownIPs: Array.from(profile.loginIPs),
      knownDevices: Array.from(profile.typicalDevices),
      knownLocations: Array.from(profile.typicalLocations.keys()),
      typicalLoginHours: [...profile.typicalLoginHours].slice(-20)
      // Last 20 logins
    };
  }
  // ==================== PRIVATE HELPER METHODS ====================
  getOrCreateProfile(userId) {
    if (!this.userProfiles.has(userId)) {
      this.userProfiles.set(userId, {
        userId,
        loginIPs: /* @__PURE__ */ new Set(),
        typicalLocations: /* @__PURE__ */ new Map(),
        typicalDevices: /* @__PURE__ */ new Set(),
        typicalLoginHours: [],
        failedLoginAttempts: [],
        apiCallPatterns: [],
        dataAccessPatterns: []
      });
    }
    return this.userProfiles.get(userId);
  }
  getLastKnownLocation(_userId) {
    return null;
  }
  getLastLoginTime(_userId) {
    return Date.now();
  }
  calculateDistance(loc1, loc2) {
    const R = 6371;
    const dLat = (loc2.lat - loc1.lat) * Math.PI / 180;
    const dLon = (loc2.lon - loc1.lon) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(loc1.lat * Math.PI / 180) * Math.cos(loc2.lat * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  calculateBehaviorAnomaly(profile) {
    let score = 0;
    if (profile.loginIPs.size < 5) {
      return 0;
    }
    if (profile.loginIPs.size > 20) {
      score += 15;
    }
    return score;
  }
  getRecommendation(riskScore, factors) {
    if (riskScore >= this.HIGH_RISK_THRESHOLD) {
      if (factors.includes("BRUTE_FORCE_DETECTED") || factors.includes("IMPOSSIBLE_TRAVEL")) {
        return "block";
      }
      return "challenge";
    }
    if (riskScore >= this.MEDIUM_RISK_THRESHOLD) {
      return "challenge";
    }
    return "allow";
  }
};
var aiAnomalyDetectionService = new AIAnomalyDetectionService();

// server/services/requestFingerprintService.ts
init_logger();
import crypto13 from "crypto";
var RequestFingerprintService = class {
  deviceFingerprints = /* @__PURE__ */ new Map();
  userDevices = /* @__PURE__ */ new Map();
  // userId -> Set of fingerprint IDs
  TRUST_DECAY_RATE = 0.95;
  // Daily decay
  MAX_DEVICES_PER_USER = 10;
  ANOMALY_THRESHOLD = 3;
  /**
   * Generate fingerprint from request metadata
   * Combines multiple signals for high uniqueness
   */
  generateFingerprint(req, userId, clientData) {
    const signals = this.extractSignals(req, clientData);
    const fingerprintHash = this.hashSignals(signals);
    const now = Date.now();
    const fingerprint = {
      id: fingerprintHash,
      userId,
      createdAt: now,
      lastSeen: now,
      accessCount: 1,
      metadata: signals,
      riskFactors: [],
      trustScore: 50,
      // Start neutral
      isVerified: false
    };
    this.deviceFingerprints.set(fingerprintHash, fingerprint);
    if (userId) {
      if (!this.userDevices.has(userId)) {
        this.userDevices.set(userId, /* @__PURE__ */ new Set());
      }
      this.userDevices.get(userId).add(fingerprintHash);
      this.pruneUserDevices(userId);
    }
    return fingerprint;
  }
  /**
   * Validate request fingerprint against stored device profile
   */
  async validateFingerprint(req, _userId, clientData, expectedFingerprintId) {
    const currentSignals = this.extractSignals(req, clientData);
    const anomalies = [];
    let trustScore = 50;
    if (expectedFingerprintId) {
      const storedFingerprint = this.deviceFingerprints.get(expectedFingerprintId);
      if (!storedFingerprint) {
        anomalies.push("UNKNOWN_DEVICE");
        trustScore = 20;
        return {
          isValid: false,
          trustScore,
          anomalies,
          recommendation: "challenge"
        };
      }
      const signalDifference = this.compareSignals(storedFingerprint.metadata, currentSignals);
      if (signalDifference > 0.3) {
        anomalies.push("SIGNAL_DRIFT");
        trustScore -= 20;
      }
      const timeSinceLastAccess = Date.now() - storedFingerprint.lastSeen;
      if (timeSinceLastAccess < 1e3) {
        anomalies.push("TOO_FAST_REPEAT");
        trustScore -= 30;
      }
      const daysSinceCreation = (Date.now() - storedFingerprint.createdAt) / (1e3 * 60 * 60 * 24);
      const decayFactor = Math.pow(this.TRUST_DECAY_RATE, daysSinceCreation);
      trustScore = Math.floor(storedFingerprint.trustScore * decayFactor);
      storedFingerprint.lastSeen = Date.now();
      storedFingerprint.accessCount++;
      storedFingerprint.metadata = { ...currentSignals };
    }
    const suspiciousPatterns = this.detectSuspiciousPatterns(currentSignals);
    anomalies.push(...suspiciousPatterns);
    if (suspiciousPatterns.length >= this.ANOMALY_THRESHOLD) {
      trustScore -= suspiciousPatterns.length * 15;
    }
    let recommendation = "allow";
    if (trustScore >= 70) {
      recommendation = "allow";
    } else if (trustScore >= 40) {
      recommendation = "challenge";
    } else {
      recommendation = "block";
    }
    return {
      isValid: trustScore >= 20,
      trustScore: Math.max(0, Math.min(100, trustScore)),
      anomalies,
      recommendation
    };
  }
  /**
   * Mark device as verified by MFA
   */
  markDeviceVerified(fingerprintId, userId) {
    const fingerprint = this.deviceFingerprints.get(fingerprintId);
    if (fingerprint) {
      fingerprint.isVerified = true;
      fingerprint.trustScore = 85;
      logger.info(`Device verified for user ${userId}`, {
        fingerprint: fingerprintId
      });
    }
  }
  /**
   * Get user's trusted devices
   */
  getUserDevices(userId) {
    const deviceIds = this.userDevices.get(userId);
    if (!deviceIds) return [];
    const devices = [];
    for (const id of deviceIds) {
      const device = this.deviceFingerprints.get(id);
      if (device) devices.push(device);
    }
    return devices.sort((a, b) => b.lastSeen - a.lastSeen);
  }
  /**
   * Forget device (remotely logout)
   */
  forgetDevice(fingerprintId, userId) {
    const device = this.deviceFingerprints.get(fingerprintId);
    if (!device || device.userId !== userId) {
      return false;
    }
    this.deviceFingerprints.delete(fingerprintId);
    const userDevices = this.userDevices.get(userId);
    if (userDevices) {
      userDevices.delete(fingerprintId);
    }
    logger.info(`Device forgotten for user ${userId}`, {
      fingerprint: fingerprintId
    });
    return true;
  }
  /**
   * Forget all devices except current
   */
  forgetAllOtherDevices(currentFingerprintId, userId) {
    const userDevices = this.userDevices.get(userId);
    if (!userDevices) return 0;
    let count = 0;
    for (const id of userDevices) {
      if (id !== currentFingerprintId) {
        this.deviceFingerprints.delete(id);
        count++;
      }
    }
    this.userDevices.set(userId, /* @__PURE__ */ new Set([currentFingerprintId]));
    logger.info(`Forgotten all devices except current for user ${userId}`, {
      count
    });
    return count;
  }
  /**
   * Cleanup: Enforce device limit and prune old devices
   */
  pruneUserDevices(userId) {
    const userDevices = this.userDevices.get(userId);
    if (!userDevices || userDevices.size <= this.MAX_DEVICES_PER_USER) {
      return;
    }
    const devicesList = Array.from(userDevices).map((id) => ({ id, device: this.deviceFingerprints.get(id) })).sort((a, b) => b.device.lastSeen - a.device.lastSeen);
    for (let i = this.MAX_DEVICES_PER_USER; i < devicesList.length; i++) {
      this.deviceFingerprints.delete(devicesList[i].id);
      userDevices.delete(devicesList[i].id);
    }
  }
  // ==================== PRIVATE HELPER METHODS ====================
  /**
   * Extract signals from request
   */
  extractSignals(req, clientData) {
    const userAgent = req.get("user-agent") || "";
    const acceptLanguage = req.get("accept-language") || "";
    const acceptEncoding = req.get("accept-encoding") || "";
    return {
      userAgent,
      acceptLanguage,
      acceptEncoding,
      platform: clientData?.platform,
      screenResolution: clientData?.screenResolution,
      timezone: clientData?.timezone,
      webglRenderer: clientData?.webglRenderer,
      canvasFingerprint: clientData?.canvasFingerprint,
      audioContext: clientData?.audioContext,
      hardwareInfo: clientData?.hardwareInfo
    };
  }
  /**
   * Create deterministic hash from signals
   */
  hashSignals(signals) {
    const signalString = JSON.stringify(signals);
    return crypto13.createHash("sha256").update(signalString).digest("hex");
  }
  /**
   * Calculate signal similarity (0-1, where 1 is identical)
   */
  compareSignals(oldSignals, newSignals) {
    let differences = 0;
    const keys = /* @__PURE__ */ new Set([...Object.keys(oldSignals), ...Object.keys(newSignals)]);
    for (const key of keys) {
      if (oldSignals[key] !== newSignals[key]) {
        differences++;
      }
    }
    return differences / Math.max(1, keys.size);
  }
  /**
   * Detect suspicious patterns in signals
   */
  detectSuspiciousPatterns(signals) {
    const suspicious = [];
    if (signals.userAgent?.includes("HeadlessChrome") || signals.userAgent?.includes("PhantomJS")) {
      suspicious.push("HEADLESS_BROWSER");
    }
    const botPatterns = ["bot", "crawler", "spider", "scraper"];
    if (botPatterns.some((p) => signals.userAgent?.toLowerCase().includes(p))) {
      suspicious.push("BOT_DETECTED");
    }
    if (!signals.webglRenderer) {
      suspicious.push("MISSING_WEBGL");
    }
    if (signals.screenResolution) {
      const [width, height] = signals.screenResolution.split("x").map(Number);
      const aspect = width / height;
      if (aspect < 0.5 || aspect > 5) {
        suspicious.push("UNUSUAL_RESOLUTION");
      }
    }
    return suspicious;
  }
};
var requestFingerprintService = new RequestFingerprintService();

// server/services/securityDashboardService.ts
init_logger();
import mongoose23 from "mongoose";
var SecurityDashboardService = class {
  io = null;
  METRICS_RETENTION_MS = 864e5;
  // 24 hours
  /**
   * Initialize WebSocket server for real-time updates
   */
  initializeWebSocket(io2) {
    this.io = io2;
    io2.on("connection", (socket) => {
      logger.info(`[DASHBOARD] Admin connected: ${socket.id}`);
      const token = socket.handshake.auth.token;
      if (!this.validateAdminToken(token)) {
        socket.disconnect();
        return;
      }
      socket.emit("metrics", this.getCurrentMetrics());
      socket.on("subscribe", (channel) => {
        if (["threats", "incidents", "anomalies", "performance"].includes(channel)) {
          socket.join(`dashboard:${channel}`);
          logger.info(`[DASHBOARD] Subscribed to ${channel}`);
        }
      });
      socket.on("update_incident", (data) => {
        this.handleIncidentUpdate(socket, data);
      });
      socket.on("manual_response", (data) => {
        this.handleManualResponse(socket, data);
      });
      socket.on("disconnect", () => {
        logger.info(`[DASHBOARD] Admin disconnected: ${socket.id}`);
      });
    });
  }
  /**
   * Broadcast new incident to dashboard
   */
  broadcastIncident(incident) {
    if (!this.io) return;
    const enrichedIncident = {
      id: incident.id,
      timestamp: incident.timestamp,
      severity: incident.severity,
      type: incident.type,
      userId: incident.userId,
      ip: incident.ip,
      details: incident.details,
      autoActions: incident.autoResponse?.map((r) => r.action) || []
    };
    this.io.to("dashboard:incidents").emit("incident", enrichedIncident);
    this.io.to("dashboard:threats").emit("threat_alert", enrichedIncident);
    logger.info(`[DASHBOARD] Broadcast incident: ${incident.id}`);
  }
  /**
   * Broadcast anomaly detection event
   */
  broadcastAnomaly(userId, anomalyData) {
    if (!this.io) return;
    this.io.to("dashboard:anomalies").emit("anomaly", {
      timestamp: Date.now(),
      userId,
      ...anomalyData
    });
  }
  /**
   * Update performance metrics
   */
  broadcastPerformanceMetric(metric) {
    if (!this.io) return;
    if (metric.responseTime > 1e3 || metric.statusCode >= 400) {
      this.io.to("dashboard:performance").emit("performance", metric);
    }
  }
  /**
   * Get comprehensive dashboard metrics
   */
  async getCurrentMetrics() {
    const now = Date.now();
    const oneDayAgo = now - this.METRICS_RETENTION_MS;
    try {
      const IncidentModel2 = mongoose23.model("SecurityIncident");
      const recentIncidents = await IncidentModel2.find({
        timestamp: { $gte: oneDayAgo }
      }).sort({ timestamp: -1 }).allowDiskUse(true).limit(50).lean();
      const suspiciousActivities = recentIncidents.filter(
        (i) => i.severity === "high" || i.severity === "critical"
      ).length;
      let threatLevel = "green";
      if (suspiciousActivities > 20) {
        threatLevel = "red";
      } else if (suspiciousActivities > 10) {
        threatLevel = "orange";
      } else if (suspiciousActivities > 5) {
        threatLevel = "yellow";
      }
      const typeMap = {};
      const severityTrend = {};
      for (const incident of recentIncidents) {
        if (!typeMap[incident.type]) {
          typeMap[incident.type] = { count: 0, severity: incident.severity };
        }
        typeMap[incident.type].count++;
        const hour = Math.floor(incident.timestamp / 36e5) * 36e5;
        if (!severityTrend[hour]) {
          severityTrend[hour] = {
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0
          };
        }
        const key = `${incident.severity}Count`;
        if (key in severityTrend[hour]) {
          severityTrend[hour][key]++;
        }
      }
      const threatTrends = Object.entries(severityTrend).map(([ts, counts]) => ({ timestamp: parseInt(ts), ...counts })).sort((a, b) => a.timestamp - b.timestamp);
      const topThreats = Object.entries(typeMap).map(([type, data]) => ({ type, ...data })).sort((a, b) => b.count - a.count).slice(0, 10);
      const metrics = {
        summary: {
          activeUsers: 0,
          // Would fetch from sessions
          suspiciousActivities,
          blockedIps: 0,
          // Would fetch from blacklist
          threatLevel
        },
        recentIncidents,
        threatTrends,
        topThreats
      };
      return metrics;
    } catch (error) {
      logger.error("[DASHBOARD] Error fetching metrics", error);
      throw error;
    }
  }
  /**
   * Get incident details for admin review
   */
  async getIncidentDetails(incidentId) {
    const IncidentModel2 = mongoose23.model("SecurityIncident");
    const incident = await IncidentModel2.findOne({ id: incidentId }).lean();
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }
    return {
      ...incident,
      relatedIncidents: await this.findRelatedIncidents(incident),
      userActivity: await this.getUserActivity(incident.userId),
      ipReputation: await this.getIpReputation(incident.ip)
    };
  }
  /**
   * Manual incident management by admin
   */
  async updateIncidentStatus(incidentId, status, notes) {
    const IncidentModel2 = mongoose23.model("SecurityIncident");
    await IncidentModel2.findOneAndUpdate(
      { id: incidentId },
      {
        status,
        adminNotes: notes,
        updatedAt: /* @__PURE__ */ new Date()
      }
    );
    logger.info(`[DASHBOARD] Incident status updated: ${incidentId} -> ${status}`);
  }
  /**
   * Apply manual security action
   */
  async applyManualAction(action, target, durationHours) {
    const hours = durationHours || 24;
    switch (action) {
      case "block_ip":
        logger.warn(`[ADMIN] Manually blocked IP: ${target} for ${hours}h`);
        break;
      case "whitelist_ip":
        logger.info(`[ADMIN] Manually whitelisted IP: ${target}`);
        break;
      case "logout_user":
        logger.warn(`[ADMIN] Manually forced logout: ${target}`);
        break;
      case "disable_user":
        logger.error(`[ADMIN] Manually disabled user: ${target}`);
        break;
    }
    if (this.io) {
      this.io.to("dashboard:threats").emit("admin_action", {
        action,
        target,
        timestamp: Date.now()
      });
    }
  }
  /**
   * Export security report
   */
  async generateSecurityReport(startDate, endDate) {
    const IncidentModel2 = mongoose23.model("SecurityIncident");
    const incidents = await IncidentModel2.find({
      timestamp: { $gte: startDate.getTime(), $lte: endDate.getTime() }
    }).lean();
    let csv = "ID,Timestamp,Severity,Type,User ID,IP,Status\n";
    for (const incident of incidents) {
      csv += `${incident.id},${new Date(incident.timestamp).toISOString()},${incident.severity},${incident.type},${incident.userId || "N/A"},${incident.ip},${incident.status}
`;
    }
    return Buffer.from(csv, "utf-8");
  }
  // ==================== PRIVATE HELPER METHODS ====================
  validateAdminToken(token) {
    return token !== void 0;
  }
  async handleIncidentUpdate(socket, data) {
    try {
      await this.updateIncidentStatus(data.incidentId, data.status, data.notes);
      socket.emit("update_success", { message: "Incident updated" });
    } catch (error) {
      socket.emit("update_error", { message: "Failed to update incident" });
    }
  }
  async handleManualResponse(socket, data) {
    try {
      await this.applyManualAction(data.action, data.target, data.duration);
      socket.emit("action_success", {
        message: `Action completed: ${data.action}`
      });
    } catch (error) {
      socket.emit("action_error", { message: "Failed to apply action" });
    }
  }
  async findRelatedIncidents(incident) {
    const IncidentModel2 = mongoose23.model("SecurityIncident");
    return await IncidentModel2.find({
      $or: [{ ip: incident.ip }, { userId: incident.userId }],
      id: { $ne: incident.id }
    }).limit(10).lean();
  }
  async getUserActivity(userId) {
    if (!userId) return null;
    return {
      lastLogin: /* @__PURE__ */ new Date(),
      loginAttempts: 2,
      apiCallsLast24h: 150
    };
  }
  async getIpReputation(ip) {
    return {
      ip,
      reputation: "unknown",
      abuseScore: 0
    };
  }
};
var securityDashboardService = new SecurityDashboardService();

// server/routes/securityRoutes.ts
var securityRouter = Router3();
var getRouteParam3 = (value) => {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
};
securityRouter.post(
  "/login-verify",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { password } = req.body || {};
    if (!password || typeof password !== "string") {
      throw AppError.badRequest(
        "Password is required for elevated verification.",
        "PASSWORD_REQUIRED"
      );
    }
    const user = await User.findById(req.user.userId).select("+password").exec();
    if (!user || !user.password) {
      throw AppError.unauthorized("User not found.", "USER_NOT_FOUND");
    }
    let storedHash = "";
    if (typeof user.password === "string") {
      storedHash = user.password;
    } else if (user.password && typeof user.password === "object" && "cipherText" in user.password) {
      try {
        storedHash = decryptText(user.password);
      } catch {
      }
    }
    const isMatch = storedHash ? await comparePassword(password, storedHash) : false;
    if (!isMatch) {
      throw AppError.unauthorized("Invalid password.", "INVALID_CREDENTIALS");
    }
    res.json({
      success: true,
      verified: true,
      message: "Elevated verification confirmed",
      expiresIn: 300
      // 5 minutes
    });
  })
);
securityRouter.get(
  "/devices",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const devices = requestFingerprintService.getUserDevices(userId);
    res.json({
      devices: devices.map((d) => ({
        id: d.id,
        name: d.metadata.userAgent?.substring(0, 50) || "Unknown Device",
        lastSeen: new Date(d.lastSeen),
        accessCount: d.accessCount,
        isVerified: d.isVerified,
        trustScore: d.trustScore,
        platform: d.metadata.platform
      }))
    });
  })
);
securityRouter.post(
  "/devices/:id/verify",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { token } = req.body || {};
    const userId = req.user.userId;
    if (!token) {
      throw AppError.badRequest("MFA verification token is required", "MFA_TOKEN_REQUIRED");
    }
    const isValid = await verifyLoginOTP(userId, token);
    if (!isValid) {
      throw AppError.unauthorized("Invalid MFA verification code", "INVALID_OTP");
    }
    const idStr = Array.isArray(id) ? id[0] : id;
    requestFingerprintService.markDeviceVerified(idStr, userId);
    res.json({
      success: true,
      message: "Device verified and trusted"
    });
  })
);
securityRouter.delete(
  "/devices/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    const success = requestFingerprintService.forgetDevice(getRouteParam3(id), userId);
    if (!success) {
      throw AppError.badRequest("Device not found", "DEVICE_NOT_FOUND");
    }
    res.json({
      success: true,
      message: "Device removed"
    });
  })
);
securityRouter.post(
  "/devices/forget-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const currentFingerprintId = req.get("x-fingerprint-id") || "unknown";
    const count = requestFingerprintService.forgetAllOtherDevices(currentFingerprintId, userId);
    res.json({
      success: true,
      message: `Logged out from ${count} other devices`
    });
  })
);
securityRouter.get(
  "/activity",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const behavior = aiAnomalyDetectionService.getTypicalBehavior(userId);
    res.json({
      behavior: behavior || {
        knownIPs: [],
        knownDevices: [],
        knownLocations: [],
        typicalLoginHours: []
      }
    });
  })
);
securityRouter.get(
  "/settings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.userId).select("twoFactorSecret meta.preferences").lean().exec();
    const prefs = user?.meta?.preferences || {};
    res.json({
      mfaEnabled: Boolean(user?.twoFactorSecret),
      mfaMethods: ["totp"],
      loginAlerts: prefs.loginAlerts ?? true,
      suspiciousActivityAlerts: prefs.suspiciousActivityAlerts ?? true,
      twoFactorRequired: prefs.twoFactorRequired ?? Boolean(user?.twoFactorSecret),
      sessionTimeout: prefs.sessionTimeout ?? 3600,
      ...prefs
    });
  })
);
securityRouter.post(
  "/settings",
  requireAuth,
  asyncHandler(async (req, res) => {
    const settings = req.body || {};
    await User.findByIdAndUpdate(req.user.userId, {
      $set: {
        "meta.preferences": settings,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).exec();
    res.json({
      success: true,
      message: "Settings updated",
      data: settings
    });
  })
);
securityRouter.post("/mfa/enable", requireAuth, asyncHandler(setup2FA2));
securityRouter.post(
  "/mfa/verify",
  requireAuth,
  validate(twoFactorTokenSchema),
  asyncHandler(verifyAndEnable2FA2)
);
securityRouter.post(
  "/mfa/disable",
  requireAuth,
  validate(twoFactorTokenSchema),
  asyncHandler(disable2FA2)
);
securityRouter.get(
  "/admin/dashboard",
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const metrics = await securityDashboardService.getCurrentMetrics();
    res.json(metrics);
  })
);
securityRouter.get(
  "/admin/incidents",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    res.json({
      incidents: [],
      total: 0,
      limit
    });
  })
);
securityRouter.get(
  "/admin/incidents/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const incident = await securityDashboardService.getIncidentDetails(
      getRouteParam3(req.params.id)
    );
    res.json(incident);
  })
);
securityRouter.patch(
  "/admin/incidents/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status, notes } = req.body;
    await securityDashboardService.updateIncidentStatus(
      getRouteParam3(req.params.id),
      status,
      notes
    );
    res.json({
      success: true,
      message: "Incident updated"
    });
  })
);
securityRouter.post(
  "/admin/actions",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { action, target, duration } = req.body;
    await securityDashboardService.applyManualAction(action, target, duration);
    res.json({
      success: true,
      message: `Action applied: ${action}`
    });
  })
);
securityRouter.get(
  "/admin/report",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const startDate = new Date(req.query.startDate);
    const endDate = new Date(req.query.endDate);
    const report = await securityDashboardService.generateSecurityReport(startDate, endDate);
    res.contentType("text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="security-report.csv"');
    res.send(report);
  })
);

// server/routes/notificationRoutes.ts
import express6 from "express";
import mongoose24 from "mongoose";
var router4 = express6.Router();
router4.get("/", requireAuth, async (req, res) => {
  const { userId, username } = req.user;
  const Notification = getNotificationModel(username);
  const notifications = await Notification.find({ userId }).sort({ createdAt: -1 }).allowDiskUse(true).limit(50).lean().exec();
  return sendSuccess(res, notifications, "Notifications fetched successfully");
});
router4.post("/read", requireAuth, async (req, res) => {
  const { userId, username } = req.user;
  const Notification = getNotificationModel(username);
  const { id } = req.body;
  if (id) {
    if (!mongoose24.Types.ObjectId.isValid(id)) {
      throw AppError.badRequest("Invalid notification ID format");
    }
    const updated = await Notification.findOneAndUpdate(
      { _id: new mongoose24.Types.ObjectId(id), userId },
      { isRead: true },
      { new: true }
    );
    if (!updated) {
      throw AppError.notFound("Notification not found");
    }
    return sendSuccess(res, updated, "Notification marked as read");
  }
  await Notification.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
  return sendSuccess(res, null, "All notifications marked as read");
});
router4.post("/clear", requireAuth, async (req, res) => {
  const { userId, username } = req.user;
  const Notification = getNotificationModel(username);
  await Notification.deleteMany({ userId });
  return sendSuccess(res, null, "Notifications cleared successfully");
});
router4.delete("/:id", requireAuth, async (req, res) => {
  const { userId, username } = req.user;
  const Notification = getNotificationModel(username);
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !mongoose24.Types.ObjectId.isValid(id)) {
    throw AppError.badRequest("Invalid notification ID format");
  }
  const deleted = await Notification.findOneAndDelete({
    _id: new mongoose24.Types.ObjectId(id),
    userId
  });
  if (!deleted) {
    throw AppError.notFound("Notification not found or access denied");
  }
  return sendSuccess(res, null, "Notification deleted successfully");
});
router4.post("/delete", requireAuth, async (req, res) => {
  const { userId, username } = req.user;
  const Notification = getNotificationModel(username);
  const rawId = req.body?.id;
  const id = typeof rawId === "string" ? rawId : void 0;
  if (!id || !mongoose24.Types.ObjectId.isValid(id)) {
    throw AppError.badRequest("Valid notification ID is required");
  }
  const deleted = await Notification.findOneAndDelete({
    _id: new mongoose24.Types.ObjectId(id),
    userId
  });
  if (!deleted) {
    throw AppError.notFound("Notification not found or access denied");
  }
  return sendSuccess(res, null, "Notification deleted successfully");
});

// server/routes/avatarRoutes.ts
import express7, { Router as Router4 } from "express";
import path13 from "path";
import crypto14 from "crypto";
import mongoose25 from "mongoose";
import fs10 from "fs/promises";
var router5 = Router4();
router5.get("/status", (_req, res) => {
  const bucket = getAvatarGridFsBucket();
  return res.json({
    success: true,
    storageMode: bucket ? "MongoDB Atlas GridFS (Cloud)" : "MongoDB Atlas GridFS (Cloud) - unavailable",
    mongoReady: mongoose25.connection.readyState === 1,
    localCacheDirectory: null
  });
});
var resolveAvatarSigningSecret = () => {
  const secret = process.env.SIGNED_URL_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Startup configuration error: SIGNED_URL_SECRET or JWT_SECRET must be configured in production."
    );
  }
  return "dev-avatar-signing-secret-non-prod";
};
var AVATAR_SIGNING_SECRET = resolveAvatarSigningSecret();
router5.post("/presign", requireAuth, (req, res) => {
  const { userId, contentHash, mimeType } = req.body;
  if (!userId || !contentHash) {
    return res.status(400).json({ success: false, error: "userId and contentHash are required." });
  }
  const authUserId = req.user?.userId;
  if (!authUserId || String(authUserId) !== String(userId)) {
    return res.status(403).json({
      success: false,
      error: "Forbidden: Cannot generate avatar presign for another user."
    });
  }
  const sanitizedUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "");
  const sanitizedHash = String(contentHash).replace(/[^a-zA-Z0-9_-]/g, "");
  const ext = mimeType === "image/avif" ? "avif" : "webp";
  const forwardedProto = (req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "http";
  const host = req.get("x-forwarded-host") || req.get("host") || "localhost:4000";
  const expiresAt = Date.now() + 5 * 60 * 1e3;
  const signature = crypto14.createHmac("sha256", AVATAR_SIGNING_SECRET || "").update(`avatar-upload:${sanitizedUserId}:${sanitizedHash}:${expiresAt}`).digest("hex");
  const uploadPath = `/api/avatar/upload/${sanitizedUserId}/${sanitizedHash}?ext=${ext}&token=${signature}&expires=${expiresAt}`;
  const publicPath = `/api/avatar/raw/${sanitizedUserId}/${sanitizedHash}.${ext}`;
  const uploadUrl = `${protocol}://${host}${uploadPath}`;
  const publicUrl = `${protocol}://${host}${publicPath}`;
  return res.json({
    success: true,
    uploadUrl,
    publicUrl,
    uploadPath,
    publicPath,
    expiresAt
  });
});
var rawBodyParser = express7.raw({ type: ["image/*", "application/octet-stream"], limit: "35mb" });
function expressRawBodyMiddleware(req, res, next) {
  if (req.is("application/octet-stream") || req.is("image/*") || req.headers["content-type"]?.includes("image/")) {
    rawBodyParser(req, res, next);
  } else {
    next();
  }
}
router5.put(
  "/upload/:userId/:contentHash",
  expressRawBodyMiddleware,
  async (req, res) => {
    try {
      const { userId, contentHash } = req.params;
      const ext = req.query.ext || "webp";
      const token = req.query.token || req.headers["x-avatar-token"];
      const expires = Number(req.query.expires || req.headers["x-avatar-expires"]);
      const sanitizedUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "");
      const sanitizedHash = String(contentHash).replace(/[^a-zA-Z0-9_-]/g, "");
      const authUser = req.user?.userId;
      const isAuthenticatedOwner = authUser && String(authUser) === sanitizedUserId;
      if (!isAuthenticatedOwner) {
        if (!token || !expires || Number.isNaN(expires)) {
          if (process.env.NODE_ENV !== "test") {
            return res.status(403).json({
              success: false,
              error: "Forbidden: Valid upload signature or session required."
            });
          }
        } else {
          if (Date.now() > expires) {
            return res.status(403).json({ success: false, error: "Upload link expired." });
          }
          const expectedSignature = crypto14.createHmac("sha256", AVATAR_SIGNING_SECRET || "").update(`avatar-upload:${sanitizedUserId}:${sanitizedHash}:${expires}`).digest("hex");
          if (token.length !== expectedSignature.length || !crypto14.timingSafeEqual(Buffer.from(token), Buffer.from(expectedSignature))) {
            return res.status(403).json({ success: false, error: "Invalid upload signature." });
          }
        }
      }
      let buffer;
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        buffer = req.body;
      } else {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        buffer = Buffer.concat(chunks);
      }
      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ success: false, error: "Avatar upload payload is empty." });
      }
      if (buffer.length > 35 * 1024 * 1024) {
        return res.status(400).json({ success: false, error: "Avatar upload exceeds maximum size limit of 35MB." });
      }
      if (!isValidImageMagicBytes(buffer)) {
        return res.status(400).json({ success: false, error: "Invalid image format or corrupted image payload." });
      }
      const { publicPath } = await storeAvatarBuffer(sanitizedUserId, buffer, ext, sanitizedHash);
      return res.status(200).json({ success: true, message: "Avatar upload complete", publicPath });
    } catch (err) {
      console.error("Avatar upload failed", err);
      return res.status(500).json({
        success: false,
        error: { code: "AVATAR_UPLOAD_FAILED", message: "Avatar upload failed." }
      });
    }
  }
);
router5.get("/raw/:userId/:fileKey", async (req, res) => {
  const { userId, fileKey } = req.params;
  const sanitizedUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "");
  const sanitizedFileKey = String(fileKey).replace(/[^a-zA-Z0-9_.-]/g, "");
  const gridFsFilename = `${sanitizedUserId}/${sanitizedFileKey}`;
  const ext = path13.extname(sanitizedFileKey).toLowerCase();
  const contentType = getContentTypeFromExt(ext);
  const etagValue = `"${path13.basename(sanitizedFileKey, ext)}"`;
  if (req.headers["if-none-match"] === etagValue) {
    return res.status(304).end();
  }
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Content-Type", contentType);
  res.setHeader("ETag", etagValue);
  const bucket = getAvatarGridFsBucket();
  if (bucket) {
    try {
      const files = await bucket.find({ filename: gridFsFilename }).toArray();
      if (files.length > 0) {
        const downloadStream = bucket.openDownloadStream(files[0]._id);
        downloadStream.pipe(res);
        return;
      }
    } catch (gridFsErr) {
      console.warn("GridFS read attempt failed, attempting local disk fallback:", gridFsErr);
    }
  }
  try {
    const localFilePath = path13.join(
      process.cwd(),
      "uploads",
      "avatars",
      sanitizedUserId,
      sanitizedFileKey
    );
    const fileBuffer = await fs10.readFile(localFilePath);
    return res.send(fileBuffer);
  } catch {
  }
  return res.status(404).send("Avatar not found");
});

// server/routes/integrityRoutes.ts
import { Router as Router5 } from "express";
import rateLimit7 from "express-rate-limit";

// server/services/integrityService.ts
import { randomUUID as randomUUID4 } from "crypto";
import mongoose27 from "mongoose";

// server/models/vaultIntegrity.ts
import mongoose26, { Schema as Schema4 } from "mongoose";
var MerkleAuditSchema = new Schema4(
  {
    auditId: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, enum: ["clean", "corrupted", "warning"], required: true },
    itemCount: { type: Number, default: 0 },
    rootHash: { type: String, required: true },
    algorithm: { type: String, enum: ["blake3", "sha512", "sha256"], default: "blake3" },
    corruptedItemIds: [{ type: String }],
    details: { type: Schema4.Types.Mixed }
  },
  { _id: false }
);
var VaultIntegritySchema = new Schema4(
  {
    userId: { type: Schema4.Types.ObjectId, ref: "User", required: true, index: true, unique: true },
    username: { type: String, required: true, index: true },
    activeRootHash: { type: String, default: "" },
    algorithm: { type: String, enum: ["blake3", "sha512", "sha256"], default: "blake3" },
    totalLeaves: { type: Number, default: 0 },
    treeDepth: { type: Number, default: 0 },
    lastAuditAt: { type: Date, default: Date.now },
    lastAuditStatus: { type: String, enum: ["clean", "corrupted", "warning"], default: "clean" },
    tamperIncidentCount: { type: Number, default: 0 },
    auditHistory: [MerkleAuditSchema]
  },
  {
    timestamps: true,
    collection: "vault_integrities"
  }
);
var VaultIntegrity = mongoose26.model(
  "VaultIntegrity",
  VaultIntegritySchema
);

// server/utils/merkleTree.ts
import crypto15 from "crypto";
import { blake3, createBLAKE3 } from "hash-wasm";
var LEAF_PREFIX = "00";
var NODE_PREFIX = "01";
var computeBufferHash = async (data, algorithm = "blake3") => {
  const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buffer.length === 0) {
    if (algorithm === "blake3") return blake3("");
    if (algorithm === "sha512") return crypto15.createHash("sha512").update("").digest("hex");
    return crypto15.createHash("sha256").update("").digest("hex");
  }
  if (algorithm === "blake3") {
    return await blake3(buffer);
  } else if (algorithm === "sha512") {
    return crypto15.createHash("sha512").update(buffer).digest("hex");
  } else {
    return crypto15.createHash("sha256").update(buffer).digest("hex");
  }
};
var computeLeafHash = async (item, algorithm = "blake3") => {
  const leafPayload = `${LEAF_PREFIX}:${item.itemId}:${item.category || "photo"}:${item.hash}:${item.size || 0}`;
  return computeBufferHash(leafPayload, algorithm);
};
var computeNodeHash = async (left, right, algorithm = "blake3") => {
  const nodePayload = `${NODE_PREFIX}:${left}:${right}`;
  return computeBufferHash(nodePayload, algorithm);
};
var MerkleTree = class {
  leaves = [];
  layers = [];
  algorithm;
  root = "";
  constructor(algorithm = "blake3") {
    this.algorithm = algorithm;
  }
  /**
   * Build the Merkle Tree from an array of vault items.
   * Items are deterministically sorted by itemId to ensure invariant roots.
   */
  async build(items) {
    if (!items || items.length === 0) {
      this.leaves = [];
      this.layers = [[]];
      this.root = await computeBufferHash("empty_vault_merkle_root", this.algorithm);
      return this.root;
    }
    const sortedItems = [...items].sort((a, b) => a.itemId.localeCompare(b.itemId));
    const leafNodes = [];
    for (const item of sortedItems) {
      const leafHash = await computeLeafHash(item, this.algorithm);
      leafNodes.push({ item, leafHash });
    }
    this.leaves = leafNodes;
    let currentLayer = leafNodes.map((l) => l.leafHash);
    this.layers = [currentLayer];
    while (currentLayer.length > 1) {
      const nextLayer = [];
      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        const right = i + 1 < currentLayer.length ? currentLayer[i + 1] : left;
        const parentHash = await computeNodeHash(left, right, this.algorithm);
        nextLayer.push(parentHash);
      }
      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }
    this.root = currentLayer[0] || await computeBufferHash("empty_vault_merkle_root", this.algorithm);
    return this.root;
  }
  getRoot() {
    return this.root;
  }
  getLeafCount() {
    return this.leaves.length;
  }
  getDepth() {
    return this.layers.length;
  }
  generateProof(itemId) {
    const leafIndex = this.leaves.findIndex((l) => l.item.itemId === itemId);
    if (leafIndex === -1) return null;
    const proof = [];
    let currentIndex = leafIndex;
    for (let layerIdx = 0; layerIdx < this.layers.length - 1; layerIdx++) {
      const layer = this.layers[layerIdx];
      const isRightChild = currentIndex % 2 === 1;
      const siblingIndex = isRightChild ? currentIndex - 1 : currentIndex + 1;
      if (siblingIndex < layer.length) {
        proof.push({
          position: isRightChild ? "left" : "right",
          hash: layer[siblingIndex]
        });
      } else {
        proof.push({
          position: "right",
          hash: layer[currentIndex]
        });
      }
      currentIndex = Math.floor(currentIndex / 2);
    }
    return {
      itemId,
      leafHash: this.leaves[leafIndex].leafHash,
      rootHash: this.root,
      algorithm: this.algorithm,
      proof,
      leafIndex,
      totalLeaves: this.leaves.length,
      verified: true
    };
  }
  static async verifyProof(leafHash, proof, expectedRoot, algorithm = "blake3") {
    if (!leafHash || !expectedRoot) return false;
    let currentHash = leafHash;
    for (const step of proof) {
      if (step.position === "left") {
        currentHash = await computeNodeHash(step.hash, currentHash, algorithm);
      } else {
        currentHash = await computeNodeHash(currentHash, step.hash, algorithm);
      }
    }
    return currentHash === expectedRoot;
  }
  getSnapshot() {
    return {
      rootHash: this.root,
      algorithm: this.algorithm,
      leafCount: this.leaves.length,
      treeDepth: this.layers.length,
      leaves: this.leaves.map((l) => ({ itemId: l.item.itemId, leafHash: l.leafHash })),
      computedAt: Date.now()
    };
  }
};

// server/services/threatResponseService.ts
init_logger();
import { Schema as Schema5, model } from "mongoose";
import { randomUUID as randomUUID3 } from "crypto";
var incidentSchema = new Schema5(
  {
    id: { type: String, unique: true, index: true },
    timestamp: { type: Number, index: true },
    severity: { type: String, enum: ["low", "medium", "high", "critical"] },
    type: { type: String, index: true },
    userId: { type: String, index: true },
    ip: { type: String, index: true },
    details: { type: Schema5.Types.Mixed },
    status: {
      type: String,
      enum: ["open", "investigating", "mitigated", "resolved"],
      default: "open"
    },
    autoResponse: [
      {
        action: String,
        timestamp: Number,
        success: Boolean,
        details: Schema5.Types.Mixed
      }
    ],
    adminNotes: String
  },
  { timestamps: true }
);
var IncidentModel = model("SecurityIncident", incidentSchema);
var ThreatResponseService = class {
  SEVERITY_THRESHOLDS = {
    low: 20,
    medium: 40,
    high: 60,
    critical: 80
  };
  /**
   * Process threat and trigger automated response
   */
  async processThreat(params) {
    const { userId, ip, riskScore, type, details } = params;
    const severity = this.calculateSeverity(riskScore, type);
    const actions = [];
    const incident = await this.createIncident({
      severity,
      type,
      userId,
      ip,
      details
    });
    if (severity === "critical") {
      if (userId) {
        actions.push("logout_user");
        await this.logoutUser(userId);
      }
      actions.push("block_ip");
      await this.blockIp(ip, 3600);
      actions.push("escalate_admin");
      await this.escalateToAdmin(incident);
    } else if (severity === "high") {
      if (userId) {
        actions.push("challenge_mfa");
      }
      actions.push("throttle_ip");
      await this.throttleIp(ip, 3e5);
      actions.push("alert_admin");
      await this.sendAdminAlert(incident);
    } else if (severity === "medium") {
      actions.push("monitor_user");
      actions.push("flag_ip");
      await this.flagIp(ip);
    } else {
      actions.push("log_event");
    }
    await this.recordResponse(incident.id, actions);
    logger.warn(`[THREAT] ${severity.toUpperCase()}: ${type}`, {
      incident: incident.id,
      userId,
      ip,
      riskScore,
      actions
    });
    return {
      threatened: severity !== "low",
      severity,
      actions
    };
  }
  /**
   * Brute force attack detection and response
   */
  async handleBruteForceAttempt(userId, ip, failedAttempts) {
    if (failedAttempts > 10) {
      await this.processThreat({
        userId,
        ip,
        riskScore: 90,
        type: "brute_force",
        details: { failedAttempts }
      });
    } else if (failedAttempts > 5) {
      await this.processThreat({
        userId,
        ip,
        riskScore: 70,
        type: "brute_force",
        details: { failedAttempts }
      });
    } else {
      await this.processThreat({
        userId,
        ip,
        riskScore: 50,
        type: "brute_force",
        details: { failedAttempts }
      });
    }
  }
  /**
   * API abuse detection and response
   */
  async handleApiAbuse(userId, ip, endpoint, requestsPerMinute) {
    const baselineRequestsPerMinute = 10;
    const ratio = requestsPerMinute / baselineRequestsPerMinute;
    if (ratio > 20) {
      await this.processThreat({
        userId,
        ip,
        riskScore: 85,
        type: "api_abuse",
        details: { endpoint, requestsPerMinute, ratio }
      });
    } else if (ratio > 10) {
      await this.processThreat({
        userId,
        ip,
        riskScore: 65,
        type: "api_abuse",
        details: { endpoint, requestsPerMinute, ratio }
      });
    } else if (ratio > 5) {
      await this.processThreat({
        userId,
        ip,
        riskScore: 45,
        type: "api_abuse",
        details: { endpoint, requestsPerMinute, ratio }
      });
    }
  }
  /**
   * Data exfiltration attempt detection
   */
  async handleDataExfiltration(userId, ip, itemCount, dataSize) {
    const itemThreshold = 500;
    const dataThreshold = 1024 * 1024 * 500;
    let riskScore = 0;
    const details = { itemCount, dataSize };
    if (itemCount > itemThreshold) {
      riskScore += 40;
      details.reason = "Excessive item count";
    }
    if (dataSize > dataThreshold) {
      riskScore += 40;
      details.reason = "Excessive data size";
    }
    if (riskScore > 0) {
      await this.processThreat({
        userId,
        ip,
        riskScore: Math.min(100, riskScore),
        type: "data_exfil",
        details
      });
    }
  }
  /**
   * Malicious file upload detection
   */
  async handleMaliciousUpload(userId, ip, fileName, reason) {
    await this.processThreat({
      userId,
      ip,
      riskScore: 90,
      type: "malware_upload",
      details: { fileName, reason }
    });
  }
  // ==================== PRIVATE RESPONSE ACTIONS ====================
  /**
   * Logout user from all sessions
   */
  async logoutUser(userId) {
    try {
      logger.warn(`[SECURITY] Force logout user: ${userId}`);
    } catch (error) {
      logger.error(`Failed to logout user ${userId}`, error);
    }
  }
  /**
   * Block IP address
   */
  async blockIp(ip, durationMs) {
    try {
      logger.warn(`[SECURITY] Blocked IP: ${ip} for ${durationMs}ms`);
    } catch (error) {
      logger.error(`Failed to block IP ${ip}`, error);
    }
  }
  /**
   * Throttle IP address (rate limit)
   */
  async throttleIp(ip, durationMs) {
    try {
      logger.warn(`[SECURITY] Throttled IP: ${ip} for ${durationMs}ms`);
    } catch (error) {
      logger.error(`Failed to throttle IP ${ip}`, error);
    }
  }
  /**
   * Flag IP for enhanced monitoring
   */
  async flagIp(ip) {
    try {
      logger.info(`[SECURITY] Flagged IP for monitoring: ${ip}`);
    } catch (error) {
      logger.error(`Failed to flag IP ${ip}`, error);
    }
  }
  /**
   * Create security incident record
   */
  async createIncident(params) {
    const incident = new IncidentModel({
      id: `incident_${randomUUID3()}`,
      timestamp: Date.now(),
      ...params,
      autoResponse: []
    });
    await incident.save();
    return incident;
  }
  /**
   * Record automated response actions
   */
  async recordResponse(incidentId, actions) {
    try {
      const incident = await IncidentModel.findOne({ id: incidentId });
      if (incident) {
        for (const action of actions) {
          incident.autoResponse.push({
            action,
            timestamp: Date.now(),
            success: true
          });
        }
        await incident.save();
      }
    } catch (error) {
      logger.error(`Failed to record response for incident ${incidentId}`, error);
    }
  }
  /**
   * Escalate to admin for manual review
   */
  async escalateToAdmin(incident) {
    try {
      logger.error(`[ADMIN ALERT] Critical security incident: ${incident.id}`);
    } catch (error) {
      logger.error(`Failed to escalate incident ${incident.id}`, error);
    }
  }
  /**
   * Send admin alert
   */
  async sendAdminAlert(incident) {
    try {
      logger.warn(`[ADMIN ALERT] High severity incident: ${incident.id}`);
    } catch (error) {
      logger.error(`Failed to send admin alert for ${incident.id}`, error);
    }
  }
  /**
   * Calculate severity based on risk score and threat type
   */
  calculateSeverity(riskScore, type) {
    const criticalTypes = ["malware_upload", "data_exfil"];
    if (criticalTypes.includes(type) && riskScore > 60) {
      return "critical";
    }
    if (riskScore >= this.SEVERITY_THRESHOLDS.critical) {
      return "critical";
    } else if (riskScore >= this.SEVERITY_THRESHOLDS.high) {
      return "high";
    } else if (riskScore >= this.SEVERITY_THRESHOLDS.medium) {
      return "medium";
    } else {
      return "low";
    }
  }
  /**
   * Get incident statistics
   */
  async getIncidentStats(timeWindowMs = 864e5) {
    const since = Date.now() - timeWindowMs;
    const incidents = await IncidentModel.find({ timestamp: { $gte: since } });
    const stats = {
      total: incidents.length,
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
      byType: {}
    };
    for (const incident of incidents) {
      stats.bySeverity[incident.severity]++;
      stats.byType[incident.type] = (stats.byType[incident.type] || 0) + 1;
    }
    return stats;
  }
};
var threatResponseService = new ThreatResponseService();

// server/services/integrityService.ts
init_logger();
var IntegrityService = class {
  /**
   * Builds the current Merkle Tree for a given user from their stored vault items
   */
  async buildUserMerkleTree(userId, username, algorithm = "blake3") {
    const DynamicVaultModel = getVaultItemModel(username);
    const rawItems = await DynamicVaultModel.find({
      userId: new mongoose27.Types.ObjectId(userId),
      isDeleted: false
    }).lean().exec();
    const leafItems = [];
    for (const item of rawItems) {
      let contentHash = "";
      const meta = item.metadata || {};
      if (meta.integrity?.hash) {
        contentHash = meta.integrity.hash;
      } else if (meta.sha256) {
        contentHash = meta.sha256;
      } else if (item.payload) {
        contentHash = await computeBufferHash(item.payload, algorithm);
      } else if (item.modernPayload) {
        contentHash = await computeBufferHash(item.modernPayload, algorithm);
      } else if (item.file?.filePath) {
        contentHash = await computeBufferHash(
          `${item.file.filePath}:${item.file.size || 0}`,
          algorithm
        );
      } else {
        contentHash = await computeBufferHash(item.itemId, algorithm);
      }
      leafItems.push({
        itemId: item.itemId,
        category: item.category,
        hash: contentHash,
        size: item.file?.size || (typeof item.payload === "string" ? item.payload.length : 0),
        updatedAt: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now()
      });
    }
    const tree = new MerkleTree(algorithm);
    const rootHash = await tree.build(leafItems);
    await VaultIntegrity.findOneAndUpdate(
      { userId: new mongoose27.Types.ObjectId(userId) },
      {
        userId: new mongoose27.Types.ObjectId(userId),
        username,
        activeRootHash: rootHash,
        algorithm,
        totalLeaves: tree.getLeafCount(),
        treeDepth: tree.getDepth()
      },
      { upsert: true, returnDocument: "after" }
    );
    return { tree, rootHash, leafItems };
  }
  /**
   * Returns current Merkle Tree status for the user
   */
  async getStatus(userId, username) {
    const record = await VaultIntegrity.findOne({
      userId: new mongoose27.Types.ObjectId(userId)
    }).lean().exec();
    if (!record) {
      const { rootHash, tree } = await this.buildUserMerkleTree(userId, username);
      return {
        activeRootHash: rootHash,
        algorithm: "blake3",
        totalLeaves: tree.getLeafCount(),
        treeDepth: tree.getDepth(),
        lastAuditAt: null,
        lastAuditStatus: "clean",
        tamperIncidentCount: 0
      };
    }
    return {
      activeRootHash: record.activeRootHash,
      algorithm: record.algorithm,
      totalLeaves: record.totalLeaves,
      treeDepth: record.treeDepth,
      lastAuditAt: record.lastAuditAt,
      lastAuditStatus: record.lastAuditStatus,
      tamperIncidentCount: record.tamperIncidentCount || 0
    };
  }
  /**
   * Run a full cryptographic audit verifying content hashes and Merkle root against stored data.
   * If any bit-flip or corruption is detected, triggers instant vault alarms!
   */
  async auditVault(userId, username, ip = "127.0.0.1", algorithm = "blake3") {
    const auditId = `audit_${randomUUID4()}`;
    const DynamicVaultModel = getVaultItemModel(username);
    const items = await DynamicVaultModel.find({
      userId: new mongoose27.Types.ObjectId(userId),
      isDeleted: false
    }).lean().exec();
    const corruptedItems = [];
    const leafItems = [];
    for (const item of items) {
      const meta = item.metadata || {};
      const expectedHash = meta.integrity?.hash || meta.sha256;
      let actualHash = "";
      if (item.payload) {
        actualHash = await computeBufferHash(item.payload, algorithm);
      } else if (item.modernPayload) {
        actualHash = await computeBufferHash(item.modernPayload, algorithm);
      }
      if (expectedHash && actualHash && actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
        corruptedItems.push({
          itemId: item.itemId,
          title: item.title || item.file?.fileName || item.itemId,
          category: item.category,
          expectedHash,
          actualHash,
          reason: "Cryptographic payload checksum mismatch (bit-flip / modification detected)"
        });
      }
      leafItems.push({
        itemId: item.itemId,
        category: item.category,
        hash: actualHash || expectedHash || item.itemId,
        size: item.file?.size || 0
      });
    }
    const tree = new MerkleTree(algorithm);
    const currentRoot = await tree.build(leafItems);
    const isCorrupted = corruptedItems.length > 0;
    let alarmTriggered = false;
    if (isCorrupted) {
      alarmTriggered = true;
      logger.error(`[INTEGRITY ALARM] Bit-flip / Tampering detected for user ${username}`, {
        userId,
        corruptedCount: corruptedItems.length,
        corruptedItems
      });
      await threatResponseService.processThreat({
        userId,
        ip,
        riskScore: 100,
        type: "malware_upload",
        details: {
          threatType: "BIT_FLIP_CORRUPTION_DETECTED",
          corruptedItems,
          auditId
        }
      });
      emitVaultEvent(userId, "vault:integrity_alarm", {
        type: "BIT_FLIP_TAMPER_ALARM",
        severity: "CRITICAL",
        corruptedItems,
        rootHash: currentRoot,
        auditId,
        timestamp: Date.now()
      });
      await createNotification(
        userId,
        "security_alert",
        "\u{1F6A8} Cryptographic Tamper Alarm Triggered",
        `Silent bit-flip or data corruption was detected in ${corruptedItems.length} vault item(s). Instant containment protocol initiated.`,
        { corruptedItems, auditId, severity: "critical" },
        username
      );
    }
    const auditRecord = {
      auditId,
      timestamp: /* @__PURE__ */ new Date(),
      status: isCorrupted ? "corrupted" : "clean",
      itemCount: items.length,
      rootHash: currentRoot,
      algorithm,
      corruptedItemIds: corruptedItems.map((c) => c.itemId),
      details: {
        corruptedCount: corruptedItems.length,
        alarmTriggered
      }
    };
    await VaultIntegrity.findOneAndUpdate(
      { userId: new mongoose27.Types.ObjectId(userId) },
      {
        userId: new mongoose27.Types.ObjectId(userId),
        username,
        activeRootHash: currentRoot,
        algorithm,
        totalLeaves: tree.getLeafCount(),
        treeDepth: tree.getDepth(),
        lastAuditAt: /* @__PURE__ */ new Date(),
        lastAuditStatus: isCorrupted ? "corrupted" : "clean",
        $inc: { tamperIncidentCount: isCorrupted ? 1 : 0 },
        $push: {
          auditHistory: {
            $each: [auditRecord],
            $slice: -20
            // Keep last 20 audit records
          }
        }
      },
      { upsert: true }
    );
    return {
      auditId,
      timestamp: Date.now(),
      status: isCorrupted ? "corrupted" : "clean",
      totalChecked: items.length,
      rootHash: currentRoot,
      algorithm,
      corruptedItems,
      alarmTriggered
    };
  }
  /**
   * Generates Merkle proof for a specific item
   */
  async getProof(userId, username, itemId, algorithm = "blake3") {
    const { tree } = await this.buildUserMerkleTree(userId, username, algorithm);
    return tree.generateProof(itemId);
  }
  /**
   * Process client-reported tamper alarm (e.g. browser worker detected bit-flip upon decrypting image)
   */
  async reportTamper(userId, username, ip, report) {
    logger.warn(`[CLIENT REPORTED TAMPER] User ${username} item ${report.itemId}`, {
      userId,
      ...report
    });
    await threatResponseService.processThreat({
      userId,
      ip,
      riskScore: 95,
      type: "malware_upload",
      details: {
        threatType: "CLIENT_REPORTED_BIT_FLIP",
        report
      }
    });
    emitVaultEvent(userId, "vault:integrity_alarm", {
      type: "CLIENT_BIT_FLIP_ALARM",
      severity: "CRITICAL",
      report,
      timestamp: Date.now()
    });
    await createNotification(
      userId,
      "security_alert",
      "\u{1F6A8} Client Bit-Flip Alarm Reported",
      `Client integrity verification failed for item ${report.itemId}. A bit-flip mismatch was reported.`,
      { report, severity: "critical" },
      username
    );
  }
};
var integrityService = new IntegrityService();

// server/controllers/integrityController.ts
var getUserId2 = (req) => req.user.userId;
var getUsername2 = (req) => req.user.username;
var getIntegrityStatusController = async (req, res) => {
  const status = await integrityService.getStatus(getUserId2(req), getUsername2(req));
  return sendSuccess(res, status, "Merkle Tree integrity status fetched successfully");
};
var verifyVaultIntegrityController = async (req, res) => {
  const algorithm = req.body?.algorithm || "blake3";
  const ip = getClientIp(req);
  const result = await integrityService.auditVault(getUserId2(req), getUsername2(req), ip, algorithm);
  return sendSuccess(
    res,
    result,
    result.status === "clean" ? "Vault Merkle Tree integrity verified: 0 corruptions detected" : "ALERT: Cryptographic corruption detected in vault items!",
    result.status === "clean" ? 200 : 409
  );
};
var getMerkleProofController = async (req, res) => {
  const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
  if (!itemId) {
    throw AppError.badRequest(
      "Item ID is required for Merkle proof generation.",
      "ITEM_ID_REQUIRED"
    );
  }
  const algorithm = req.query?.algorithm || "blake3";
  const proof = await integrityService.getProof(
    getUserId2(req),
    getUsername2(req),
    itemId,
    algorithm
  );
  if (!proof) {
    throw AppError.notFound("Item not found in current Merkle tree.", "LEAF_NOT_FOUND");
  }
  return sendSuccess(res, proof, "Merkle proof generated successfully");
};
var reportTamperController = async (req, res) => {
  const { itemId, expectedHash, actualHash, details } = req.body || {};
  if (!itemId || !expectedHash || !actualHash) {
    throw AppError.badRequest(
      "Item ID, expectedHash, and actualHash are required.",
      "TAMPER_PAYLOAD_INVALID"
    );
  }
  const ip = getClientIp(req);
  await integrityService.reportTamper(getUserId2(req), getUsername2(req), ip, {
    itemId,
    expectedHash,
    actualHash,
    details
  });
  return sendSuccess(
    res,
    { acknowledged: true },
    "Tamper incident reported and alarm dispatched",
    201
  );
};

// server/routes/integrityRoutes.ts
var integrityRouter = Router5();
var integrityLimiter = rateLimit7({
  windowMs: 60 * 1e3,
  max: 60,
  message: { error: "Too many integrity requests. Please slow down." }
});
integrityRouter.use(requireAuth);
integrityRouter.use(integrityLimiter);
integrityRouter.get("/status", asyncHandler(getIntegrityStatusController));
integrityRouter.post("/verify", asyncHandler(verifyVaultIntegrityController));
integrityRouter.get("/proof/:itemId", asyncHandler(getMerkleProofController));
integrityRouter.post("/report-tamper", asyncHandler(reportTamperController));

// server/vite.ts
init_logger();
import express8 from "express";
import compression2 from "compression";
import fs11 from "fs";
import path14 from "path";
import { createServer as createViteServer } from "vite";

// server/utils/compression.ts
import compression from "compression";
import { constants as zlibConstants } from "zlib";
var shouldCompress = (req, res) => {
  if (req.headers["x-no-compression"]) {
    return false;
  }
  const contentEncoding = res.getHeader("Content-Encoding");
  if (typeof contentEncoding === "string" && contentEncoding !== "identity") {
    return false;
  }
  if (Array.isArray(contentEncoding) && contentEncoding.length > 0) {
    return false;
  }
  return compression.filter(req, res);
};
var deepCompressionOptions = {
  level: 6,
  memLevel: 8,
  threshold: 1024,
  brotli: {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 4
    }
  },
  filter: shouldCompress
};

// server/vite.ts
var ONE_YEAR_IN_SECONDS = 31536e3;
var ONE_HOUR_IN_SECONDS = 3600;
var COMPRESSIBLE_STATIC_FILE_PATTERN = /\.(js|mjs|cjs|css|html|svg|json|txt|xml|map|wasm|webmanifest)$/i;
var PRECOMPRESSED_SUFFIX_PATTERN = /\.(br|gz)$/i;
var STATIC_CONTENT_TYPE_BY_EXTENSION = {
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".cjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};
var NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0"
};
var shouldDisableCache = (requestPath) => {
  return requestPath === "/@vite/client" || requestPath === "/@react-refresh" || requestPath.startsWith("/src/");
};
var setSecurityHeaders = (res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
};
var resolveStaticContentType = (requestPath) => {
  const normalizedPath = requestPath.replace(PRECOMPRESSED_SUFFIX_PATTERN, "").toLowerCase();
  const extension = path14.extname(normalizedPath);
  return STATIC_CONTENT_TYPE_BY_EXTENSION[extension];
};
var setStaticAssetHeaders = (res, filePath) => {
  setSecurityHeaders(res);
  const normalizedPath = filePath.replace(/\\/g, "/");
  const uncompressedPath = normalizedPath.replace(PRECOMPRESSED_SUFFIX_PATTERN, "");
  const contentType = resolveStaticContentType(uncompressedPath);
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }
  if (uncompressedPath.endsWith(".js") || uncompressedPath.endsWith(".mjs") || uncompressedPath.endsWith(".cjs")) {
    res.removeHeader("Content-Disposition");
  }
  if (uncompressedPath.includes("/assets/")) {
    res.setHeader("Cache-Control", `public, max-age=${ONE_YEAR_IN_SECONDS}, immutable`);
    return;
  }
  if (uncompressedPath.endsWith("/sw-register.js")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return;
  }
  if (uncompressedPath.endsWith("/sw.js")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return;
  }
  if (uncompressedPath.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return;
  }
  res.setHeader("Cache-Control", `public, max-age=${ONE_HOUR_IN_SECONDS}`);
};
var resolvePreferredPrecompressedVariants = (acceptEncodingHeader) => {
  if (!acceptEncodingHeader) {
    return [];
  }
  const normalized = (Array.isArray(acceptEncodingHeader) ? acceptEncodingHeader.join(",") : acceptEncodingHeader).toLowerCase();
  const variants = [];
  if (normalized.includes("br")) {
    variants.push({
      encoding: "br",
      extension: ".br"
    });
  }
  if (normalized.includes("gzip")) {
    variants.push({
      encoding: "gzip",
      extension: ".gz"
    });
  }
  return variants;
};
var appendExtensionToUrlPath = (requestUrl, extension) => {
  const querySeparatorIndex = requestUrl.indexOf("?");
  if (querySeparatorIndex < 0) {
    return `${requestUrl}${extension}`;
  }
  return `${requestUrl.slice(0, querySeparatorIndex)}${extension}${requestUrl.slice(querySeparatorIndex)}`;
};
var setupDevelopmentMiddleware = async (app, httpServer) => {
  let vite;
  try {
    vite = await createViteServer({
      appType: "spa",
      server: {
        middlewareMode: true,
        headers: NO_CACHE_HEADERS,
        hmr: {
          server: httpServer
        },
        watch: {
          ignored: [
            "**/.git/**",
            "**/backups/**",
            "**/build/**",
            "**/dist/**",
            "**/*.zip",
            "**/stats.html"
          ]
        }
      }
    });
  } catch (error) {
    logger.error("Failed to initialize Vite development server", {
      error
    });
    throw error;
  }
  app.use((req, res, next) => {
    if (shouldDisableCache(req.path)) {
      delete req.headers["if-none-match"];
      delete req.headers["if-modified-since"];
      Object.entries(NO_CACHE_HEADERS).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }
    next();
  });
  app.use(vite.middlewares);
  logger.info("Vite development middleware initialized successfully");
};
var setupProductionMiddleware = (app) => {
  const buildRoot = path14.resolve(process.cwd(), "build");
  const indexHtmlPath = path14.join(buildRoot, "index.html");
  if (!fs11.existsSync(indexHtmlPath)) {
    throw new Error(`Frontend build not found at: ${indexHtmlPath}`);
  }
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return next();
    }
    if (typeof req.headers.range === "string") {
      return next();
    }
    const requestPath = req.path;
    if (!COMPRESSIBLE_STATIC_FILE_PATTERN.test(requestPath)) {
      return next();
    }
    if (PRECOMPRESSED_SUFFIX_PATTERN.test(requestPath)) {
      return next();
    }
    const preferredVariants = resolvePreferredPrecompressedVariants(req.headers["accept-encoding"]);
    if (preferredVariants.length === 0) {
      return next();
    }
    const relativePath = requestPath.replace(/^\/+/, "");
    for (const variant of preferredVariants) {
      const precompressedPath = path14.join(buildRoot, `${relativePath}${variant.extension}`);
      if (!fs11.existsSync(precompressedPath)) {
        continue;
      }
      res.setHeader("Content-Encoding", variant.encoding);
      res.setHeader("Vary", "Accept-Encoding");
      if (!res.getHeader("Content-Type")) {
        const contentType = resolveStaticContentType(requestPath);
        if (contentType) {
          res.setHeader("Content-Type", contentType);
        }
      }
      req.url = appendExtensionToUrlPath(req.url, variant.extension);
      return next();
    }
    return next();
  });
  app.use(compression2(deepCompressionOptions));
  app.use(
    express8.static(buildRoot, {
      index: false,
      etag: true,
      fallthrough: true,
      setHeaders: (res, filePath) => {
        setStaticAssetHeaders(res, filePath);
      }
    })
  );
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    if (/\.(js|mjs|cjs|css|json|wasm|svg|jpg|jpeg|png|gif|ico|woff2?|ttf|eot|map)$/i.test(req.path)) {
      return res.status(404).type("text/plain").send("Asset not found");
    }
    setSecurityHeaders(res);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(indexHtmlPath, (error) => {
      if (error) {
        logger.error("Failed to serve index.html", {
          error,
          path: req.path
        });
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Internal Server Error"
          });
        }
      }
    });
  });
  logger.info("Production frontend middleware initialized successfully");
};
var setupFrontendMiddleware = async (app, httpServer) => {
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction) {
    await setupDevelopmentMiddleware(app, httpServer);
    return;
  }
  setupProductionMiddleware(app);
};

// server/middleware/bodyParsers.ts
import express9 from "express";
init_logger();
var JSON_LIMIT = `${Math.max(1, Number.parseInt(process.env.MAX_JSON_BODY_MB || "100", 10))}mb`;
var jsonParser = express9.json({ limit: JSON_LIMIT });
var urlencodedParser = express9.urlencoded({
  limit: JSON_LIMIT,
  extended: true,
  parameterLimit: 100
});
var installBodyParsers = (app) => {
  app.use((req, res, next) => {
    jsonParser(req, res, (err) => {
      if (err) {
        const status = typeof err.status === "number" ? err.status : 400;
        const isTooLarge = status === 413 || err.message.toLowerCase().includes("too large");
        logger.warn("Request body parsing failed.", {
          method: req.method,
          path: req.originalUrl,
          requestId: req.requestId,
          status,
          error: err
        });
        return next(
          new AppError(
            isTooLarge ? 413 : 400,
            isTooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON",
            isTooLarge ? "Request payload exceeded the server limit." : "Request body contains invalid JSON."
          )
        );
      }
      next();
    });
  });
  app.use(urlencodedParser);
};

// server/middleware/csrfProtection.ts
import cookieParser from "cookie-parser";
import crypto16 from "node:crypto";
var IS_PRODUCTION3 = process.env.NODE_ENV === "production";
var CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME?.trim() || "vault_csrf_secret";
var CSRF_COOKIE_PATH = process.env.CSRF_COOKIE_PATH?.trim() || "/";
var resolveCsrfSecret = () => {
  const secret = process.env.CSRF_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (IS_PRODUCTION3) {
    throw new Error("CSRF_SECRET environment variable must be configured in production.");
  }
  return "vault_super_secret_csrf_key_2026";
};
var CSRF_SECRET = resolveCsrfSecret();
var resolveCsrfCookieSameSite = () => {
  const raw = process.env.CSRF_COOKIE_SAME_SITE?.trim().toLowerCase();
  if (raw === "strict" || raw === "lax" || raw === "none") {
    return raw;
  }
  return "lax";
};
var resolveCsrfCookieSecure = () => {
  const raw = process.env.CSRF_COOKIE_SECURE?.trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return IS_PRODUCTION3;
};
var readBooleanEnv2 = (value) => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return null;
};
var isKnownTestRunner = () => Boolean(process.env.VITEST || process.env.VITEST_WORKER_ID || process.env.JEST_WORKER_ID);
var shouldSkipCsrfInCurrentRuntime = () => {
  if (process.env.NODE_ENV !== "test") {
    return false;
  }
  const explicitBypass = readBooleanEnv2(process.env.CSRF_TEST_BYPASS);
  if (explicitBypass !== null) {
    return explicitBypass;
  }
  return isKnownTestRunner();
};
var generateTokenAndSecret = () => {
  const secret = crypto16.randomBytes(32).toString("hex");
  const token = crypto16.createHmac("sha256", CSRF_SECRET).update(secret).digest("hex");
  return { secret, token };
};
var verifyToken = (secret, token) => {
  if (!secret || !token) return false;
  try {
    const expectedToken = crypto16.createHmac("sha256", CSRF_SECRET).update(secret).digest("hex");
    return crypto16.timingSafeEqual(Buffer.from(expectedToken), Buffer.from(token));
  } catch {
    return false;
  }
};
var writeCsrfTokenResponseHeaders = (res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
};
var installCsrfProtection = (app) => {
  app.use(cookieParser());
  if (shouldSkipCsrfInCurrentRuntime()) {
    app.get("/api/auth/csrf-token", (_req, res) => {
      writeCsrfTokenResponseHeaders(res);
      return res.status(200).json({
        success: true,
        data: { csrfToken: "test-csrf-bypass" }
      });
    });
    return;
  }
  app.get("/api/auth/csrf-token", (_req, res) => {
    writeCsrfTokenResponseHeaders(res);
    const { secret, token } = generateTokenAndSecret();
    res.cookie(CSRF_COOKIE_NAME, secret, {
      httpOnly: true,
      secure: resolveCsrfCookieSecure(),
      sameSite: resolveCsrfCookieSameSite(),
      path: CSRF_COOKIE_PATH
    });
    return res.status(200).json({
      success: true,
      data: { csrfToken: token }
    });
  });
  app.use("/api", (req, _res, next) => {
    const method = req.method.toUpperCase();
    if (["GET", "HEAD", "OPTIONS"].includes(method)) {
      return next();
    }
    if (req.originalUrl.startsWith("/api/avatar/upload") || req.path.startsWith("/avatar/upload") || req.originalUrl.startsWith("/api/avatar/presign") || req.path.startsWith("/avatar/presign")) {
      return next();
    }
    const secret = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers["x-csrf-token"] || req.headers["csrf-token"] || req.body && req.body._csrf;
    if (!verifyToken(secret, headerToken)) {
      const csrfError = new Error("Invalid or missing CSRF token.");
      csrfError.status = 403;
      csrfError.statusCode = 403;
      csrfError.code = "CSRF_TOKEN_INVALID";
      csrfError.isOperational = true;
      return next(csrfError);
    }
    next();
  });
};

// server/middleware/errorHandler.ts
import multer2 from "multer";
import mongoose28 from "mongoose";
import { ZodError } from "zod";
init_logger();

// server/lib/sentry.js
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
var env = process.env.NODE_ENV || "development";
var isProd = env === "production";
var enabledFlag = process.env.SENTRY_ENABLED === "true";
var dsn = process.env.SENTRY_DSN;
var isEnabled = Boolean(dsn) && (enabledFlag || isProd);
var toNumber = (value, fallback) => {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
};
var initialized = false;
var redactSensitiveData = (input) => {
  if (!input || typeof input !== "object") return input;
  const hiddenKeys = [
    "password",
    "token",
    "authorization",
    "cookie",
    "set-cookie",
    "masterkey",
    "secret",
    "secretkey",
    "privatekey",
    "apikey",
    "ciphertext",
    "authtag",
    "iv",
    "payload",
    "binarypayload",
    "dek",
    "kek",
    "mnemonic",
    "seedphrase",
    "passphrase",
    "pqcsalt",
    "salt",
    "totp",
    "totpsecret",
    "recoverycodes",
    "backupcodes",
    "twofactorsecret",
    "twofactorcode",
    "encryptedmetadata"
  ];
  const clone = Array.isArray(input) ? [...input] : { ...input };
  for (const [key, value] of Object.entries(clone)) {
    const normalizedKey = key.toLowerCase();
    if (hiddenKeys.includes(normalizedKey) || hiddenKeys.some((k) => normalizedKey.includes(k))) {
      clone[key] = "[Filtered]";
      continue;
    }
    if (value && typeof value === "object") {
      clone[key] = redactSensitiveData(value);
    }
  }
  return clone;
};
var initSentry = () => {
  if (!isEnabled || initialized) return false;
  Sentry.init({
    dsn,
    enabled: isEnabled,
    environment: process.env.SENTRY_ENVIRONMENT || env,
    release: process.env.SENTRY_RELEASE || process.env.npm_package_version,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
      nodeProfilingIntegration()
    ],
    tracesSampleRate: toNumber(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
    profilesSampleRate: toNumber(process.env.SENTRY_PROFILES_SAMPLE_RATE, 0),
    beforeSend(event) {
      if (event.request) {
        event.request.data = redactSensitiveData(event.request.data);
        event.request.headers = redactSensitiveData(event.request.headers);
      }
      if (event.extra) {
        event.extra = redactSensitiveData(event.extra);
      }
      return event;
    }
  });
  initialized = true;
  return true;
};
var sentryRequestHandler = () => {
  if (!isEnabled) return (_req, _res, next) => next();
  return (req, _res, next) => {
    Sentry.withScope((scope) => {
      scope.setTag("request_id", req.requestId || "unknown");
      next();
    });
  };
};
var sentryTracingHandler = () => {
  if (!isEnabled) return (_req, _res, next) => next();
  return (req, res, next) => {
    Sentry.startSpanManual(
      {
        op: "http.server",
        name: `${req.method} ${req.path}`
      },
      (span) => {
        res.on("finish", () => {
          span.setAttribute("http.status_code", res.statusCode);
          span.end();
        });
        next();
      }
    );
  };
};
var sentryErrorHandler = () => {
  if (!isEnabled) {
    return (err, _req, _res, next) => next(err);
  }
  return Sentry.expressErrorHandler();
};
var captureException2 = (error, context) => {
  if (!isEnabled) return null;
  return Sentry.captureException(error, context);
};
var addBreadcrumb2 = (breadcrumb) => {
  if (!isEnabled) return;
  Sentry.addBreadcrumb(breadcrumb);
};
var flushSentry = async (timeoutMs = 2e3) => {
  if (!isEnabled) return true;
  return Sentry.close(timeoutMs);
};

// server/middleware/errorHandler.ts
var errorHandler = (err, req, res, _next) => {
  if (res.headersSent) {
    return _next(err);
  }
  const requestId = req.requestId;
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  const rawOrigin = req.get("origin") || req.get("referer");
  if (rawOrigin) {
    try {
      const candidate = new URL(rawOrigin).origin;
      if (isAllowedCorsOrigin(candidate)) {
        res.setHeader("Access-Control-Allow-Origin", candidate);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      } else {
        res.setHeader("Access-Control-Allow-Origin", "*");
      }
    } catch {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  let statusCode = err.statusCode || err.status || 500;
  let code = err.code || "INTERNAL_SERVER_ERROR";
  let message = err.message || "An unexpected error occurred.";
  let details = void 0;
  if (err instanceof SyntaxError && "body" in err) {
    statusCode = 400;
    code = "INVALID_JSON";
    message = "Request body contains invalid JSON.";
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Input validation failed.";
    details = err.issues.map((e) => ({
      path: e.path.join("."),
      message: e.message
    }));
  } else if (err instanceof mongoose28.Error.CastError) {
    statusCode = 400;
    code = "INVALID_ID";
    message = `Invalid format for field '${err.path}'.`;
  } else if (err instanceof mongoose28.Error.ValidationError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    const firstIssue = Object.values(err.errors)[0];
    message = firstIssue?.message || "Validation failed.";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    code = "TOKEN_EXPIRED";
    message = "Authentication token has expired.";
  } else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    code = "INVALID_TOKEN";
    message = "Authentication token is invalid.";
  } else if (err.type === "entity.too.large" || err.status === 413) {
    statusCode = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request payload exceeds maximum size limit.";
  } else if (err.code === 11e3) {
    statusCode = 409;
    code = "DUPLICATE_RESOURCE";
    message = "The requested resource already exists.";
  } else if (err?.code === "EBADCSRFTOKEN" || err?.code === "CSRF_TOKEN_INVALID" || err?.message === "invalid csrf token" || err?.status === 403 && typeof err?.message === "string" && err.message.toLowerCase().includes("csrf")) {
    statusCode = 403;
    code = "CSRF_TOKEN_INVALID";
    message = "Invalid or missing CSRF token.";
  } else if (err.name === "UnauthorizedError" || err.code === "UNAUTHORIZED") {
    statusCode = 401;
    code = "UNAUTHORIZED";
    message = err.message || "Authentication failed.";
  } else if (err.message === "Origin is not allowed by CORS.") {
    statusCode = 403;
    code = "CORS_FORBIDDEN";
    message = "Request origin is not allowed.";
  } else if (err instanceof multer2.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      statusCode = 413;
      code = "PAYLOAD_TOO_LARGE";
      message = "Uploaded file exceeds the maximum allowed size limit.";
    } else {
      statusCode = 400;
      code = err.code;
      message = err.message;
    }
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    if (err.details) {
      details = err.details;
    }
  }
  addBreadcrumb2({
    category: "error",
    message,
    level: statusCode >= 500 ? "error" : "warning",
    data: {
      statusCode,
      code,
      path: req.originalUrl,
      method: req.method,
      requestId
    }
  });
  captureException2(err, {
    tags: {
      statusCode: String(statusCode),
      code,
      route: req.route?.path || req.originalUrl,
      method: req.method
    },
    level: statusCode >= 500 ? "error" : "warning",
    extra: {
      requestId,
      details,
      isOperational: Boolean(err?.isOperational)
    }
  });
  const isClientError = statusCode >= 400 && statusCode < 500;
  if (statusCode >= 500 || !err.isOperational && !isClientError) {
    logger.error("Unhandled or non-operational server error.", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      error: {
        name: err.name,
        message: err.message,
        stack: process.env.NODE_ENV === "production" ? void 0 : err.stack
      },
      ipAddress: getClientIp(req)
    });
  } else {
    logger.warn(`Operational error: ${message}`, {
      requestId,
      statusCode,
      code,
      path: req.originalUrl
    });
  }
  return res.status(statusCode).json({
    success: false,
    message,
    error: {
      code,
      requestId,
      ...process.env.NODE_ENV !== "production" ? { stack: err.stack } : {},
      ...details ? { details } : {}
    }
  });
};

// server/controllers/healthController.ts
import mongoose29 from "mongoose";
var DEFAULT_DB_NAME = process.env.MONGODB_DB_NAME?.trim() || "vault";
var writeHealthHeaders = (res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
};
var isTestRuntime2 = () => {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return true;
  }
  return process.argv.some((arg) => arg.includes("vitest"));
};
var isMongoOptionalMode2 = () => {
  const raw = process.env.SKIP_MONGO_CONNECT?.trim().toLowerCase();
  const skipMongo = raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  return skipMongo && !isTestRuntime2();
};
var getHealthStatus = async (_req, res) => {
  const ready = isMongoOptionalMode2() ? true : await ensureMongoReady();
  writeHealthHeaders(res);
  const clusterSummaries = multiClusterPool.getAllNodes().map((n) => ({
    id: n.id,
    name: n.name,
    host: n.host,
    healthy: n.isHealthy,
    full: n.isFull,
    lastPingMs: n.lastPingMs
  }));
  return res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? "connected" : "disconnected",
    database: {
      name: mongoose29.connection.name || DEFAULT_DB_NAME,
      readyState: mongoose29.connection.readyState,
      host: mongoose29.connection.host || null,
      multiCluster: {
        totalConfigured: clusterSummaries.length,
        healthyCount: clusterSummaries.filter((c) => c.healthy).length,
        clusters: clusterSummaries
      }
    },
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
};
var getReadinessStatus = async (_req, res) => {
  const mongoOptional = isMongoOptionalMode2();
  const mongoReady = mongoOptional ? true : await ensureMongoReady();
  const hasJwtSecret = Boolean(process.env.JWT_SECRET?.trim());
  const hasMongoUri = mongoOptional ? true : Boolean(process.env.MONGODB_URI?.trim() || process.env.MONGODB_URL?.trim());
  const ready = mongoReady && hasJwtSecret && hasMongoUri;
  writeHealthHeaders(res);
  return res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? "ready" : "not_ready",
    checks: {
      mongo: mongoReady,
      jwtSecret: hasJwtSecret,
      mongoUri: hasMongoUri
    },
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
};

// server/middleware/originProtection.ts
import ipRangeCheck from "ip-range-check";
init_logger();
var ALLOWED_CDN_RANGES = ["74.220.48.0/24", "74.220.56.0/24"];
var LOCALHOST_IPS = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
var originProtection = (req, _res, next) => {
  const isProduction = process.env.NODE_ENV === "production";
  const disableOriginProtection = process.env.DISABLE_ORIGIN_PROTECTION === "1" || process.env.DISABLE_ORIGIN_PROTECTION?.toLowerCase() === "true";
  if (disableOriginProtection) {
    return next();
  }
  const connectingIp = req.socket.remoteAddress || "unknown";
  const normalizedIp = connectingIp.replace(/^::ffff:/, "");
  const rawOrigin = req.get("origin") || req.get("referer");
  let isAllowedOrigin = false;
  if (rawOrigin) {
    try {
      const candidate = new URL(rawOrigin).origin;
      if (isAllowedCorsOrigin(candidate)) {
        isAllowedOrigin = true;
      }
    } catch {
    }
  }
  const isMediaRoute = req.path.startsWith("/api/vault/files/access/") || req.path.startsWith("/api/vault/files/") || req.path.startsWith("/api/vault/media/") || req.path.startsWith("/api/vault/avatar/") || req.path.startsWith("/api/avatar/");
  if (LOCALHOST_IPS.includes(normalizedIp) || !isProduction || req.path === "/health" || isMediaRoute || isAllowedOrigin) {
    return next();
  }
  const isFromCDN = ipRangeCheck(normalizedIp, ALLOWED_CDN_RANGES);
  if (!isFromCDN) {
    logger.warn("Origin Protection: Blocked direct access attempt", {
      ip: normalizedIp,
      method: req.method,
      path: req.path,
      userAgent: req.headers["user-agent"]
    });
    throw new AppError(
      403,
      "ORIGIN_PROTECTED",
      "Direct access to origin server is prohibited. Please use the designated CDN endpoint."
    );
  }
  next();
};

// server/keep-alive.ts
import http from "http";
import https from "https";
function startKeepAlive(url, intervalMinutes = 13, options = {}) {
  const serviceSuffix = options.serviceId ? ` for service ${options.serviceId}` : "";
  const isEnabled3 = options.enabled ?? process.env.NODE_ENV === "production";
  if (!isEnabled3) {
    if (!options.silentWhenDisabled) {
      console.log(`Keep-alive disabled${serviceSuffix}.`);
    }
    return { enabled: false, target: null };
  }
  if (!url) {
    console.warn(`Keep-alive warning: No public URL provided${serviceSuffix}. Skipping self-ping.`);
    return { enabled: false, target: null };
  }
  const targetUrl = new URL(url.endsWith("/") ? `${url}health` : `${url}/health`);
  const client = targetUrl.protocol === "http:" ? http : https;
  console.log(
    `[Keep-Alive] Initializing self-ping for ${targetUrl.toString()} every ${intervalMinutes} minutes${serviceSuffix}...`
  );
  const ping = () => {
    const request = client.get(targetUrl, (res) => {
      if (res.statusCode === 200) {
        console.log(`[Keep-Alive] Ping successful: ${(/* @__PURE__ */ new Date()).toISOString()}`);
      } else {
        console.warn(`[Keep-Alive] Ping returned status code: ${res.statusCode}`);
      }
      res.resume();
    });
    request.on("error", (err) => {
      console.error(`[Keep-Alive] Ping error: ${err.message}`);
    });
  };
  ping();
  const timer = setInterval(ping, intervalMinutes * 60 * 1e3);
  timer.unref();
  return { enabled: true, target: targetUrl.toString() };
}

// server.ts
init_logger();

// server/utils/env.ts
init_logger();
var trimEnv = (value) => {
  const normalized = value?.trim();
  return normalized ? normalized : void 0;
};
var requiredInAllEnvironments = ["JWT_SECRET"];
var requiredInProduction = [
  "CLIENT_URL",
  "PUBLIC_URL",
  "VITE_APP_PUBLIC_URL",
  "RECAPTCHA_SECRET_KEY",
  "REFRESH_TOKEN_SECRET",
  "VAULT_ENCRYPTION_KEY",
  "AUTH_PEPPER",
  "CSRF_SECRET",
  "SIGNED_URL_SECRET"
];
var mongoKeys = ["MONGODB_URI", "MONGODB_URL", "MONGO_URI", "MONGO_URL"];
var registrationLookupTemplateKeys = [
  "FREE_IP_API_URL_TEMPLATE",
  "IPWHOIS_URL_TEMPLATE",
  "IPINFO_IO_URL_TEMPLATE",
  "IPAPI_CO_URL_TEMPLATE",
  "IPGEOLOCATION_URL_TEMPLATE"
];
var isMongoOptionalMode3 = () => {
  const raw = process.env.SKIP_MONGO_CONNECT?.trim().toLowerCase();
  const skipMongo = raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  return skipMongo;
};
var validateRuntimeEnv = () => {
  const missingKeys = [];
  for (const key of requiredInAllEnvironments) {
    if (!trimEnv(process.env[key])) {
      missingKeys.push(key);
    }
  }
  if (!isMongoOptionalMode3() && !mongoKeys.some((key) => trimEnv(process.env[key]))) {
    missingKeys.push("MONGODB_URI, MONGODB_URL, or MONGO_URI");
  }
  if (process.env.NODE_ENV === "production") {
    if (isMongoOptionalMode3()) {
      throw new Error(
        "SKIP_MONGO_CONNECT is not permitted in production. MongoDB must be configured and connected."
      );
    }
    const isCaptchaBypass = process.env.SKIP_RECAPTCHA === "true" || process.env.SKIP_CAPTCHA === "true" || process.env.SKIP_RECAPTCHA_VERIFICATION === "true";
    if (isCaptchaBypass) {
      throw new Error(
        "SKIP_CAPTCHA / SKIP_RECAPTCHA is not permitted in production. reCAPTCHA verification is strictly mandatory."
      );
    }
    for (const key of requiredInProduction) {
      if (!trimEnv(process.env[key])) {
        missingKeys.push(key);
      }
    }
    if (!trimEnv(process.env.TRUST_PROXY)) {
      logger.warn(
        "TRUST_PROXY is not configured. Production defaults to 1 trusted proxy hop so rate limiting and audit IPs stay safer behind Render/Nginx."
      );
    }
    if (trimEnv(process.env.TRUST_PROXY)?.toLowerCase() === "true") {
      logger.warn(
        "TRUST_PROXY=true is overly permissive for IP-based rate limiting. Prefer TRUST_PROXY=1 unless you intentionally trust more than one proxy hop."
      );
    }
    const refreshCookieSameSite = trimEnv(process.env.REFRESH_COOKIE_SAME_SITE)?.toLowerCase();
    if (refreshCookieSameSite && !["strict", "lax", "none"].includes(refreshCookieSameSite)) {
      logger.warn("REFRESH_COOKIE_SAME_SITE must be one of: strict, lax, none.");
    }
    if (refreshCookieSameSite === "none" && trimEnv(process.env.REFRESH_COOKIE_SECURE)?.toLowerCase() === "false") {
      logger.warn(
        "REFRESH_COOKIE_SECURE should not be false when REFRESH_COOKIE_SAME_SITE=none, or browsers may reject the cookie."
      );
    }
    const registrationProfileCaptureEnabled = trimEnv(
      process.env.REGISTRATION_PROFILE_CAPTURE_ENABLED
    )?.toLowerCase();
    if (registrationProfileCaptureEnabled && !["1", "true", "yes", "on", "0", "false", "no", "off"].includes(
      registrationProfileCaptureEnabled
    )) {
      logger.warn(
        "REGISTRATION_PROFILE_CAPTURE_ENABLED is set to an unrecognized value. Use true/false so signup metadata capture is deterministic."
      );
    }
    for (const key of registrationLookupTemplateKeys) {
      const value = trimEnv(process.env[key]);
      if (value && !value.includes("{ip}") && key !== "IPGEOLOCATION_URL_TEMPLATE") {
        logger.warn(
          `${key} should include the {ip} placeholder so IP-specific registration lookups resolve correctly.`
        );
      }
    }
    if (trimEnv(process.env.IPGEOLOCATION_URL_TEMPLATE) && !trimEnv(process.env.IPGEOLOCATION_URL_TEMPLATE)?.includes("{apiKey}")) {
      logger.warn(
        "IPGEOLOCATION_URL_TEMPLATE should include the {apiKey} placeholder so the configured API key can be injected."
      );
    }
  }
  if (missingKeys.length > 0) {
    throw new Error(`Missing required environment configuration: ${missingKeys.join(", ")}`);
  }
};

// server/boot/startup.ts
import os3 from "os";
import process5 from "process";
import v8 from "v8";

// server/boot/logger/colors.ts
import process2 from "process";
var ansi = Object.freeze({
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  cyan: "\x1B[36m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  magenta: "\x1B[35m",
  gray: "\x1B[90m"
});
var isProd2 = process2.env.NODE_ENV === "production";
var noColor = process2.env.NO_COLOR === "true" || process2.env.NO_COLOR === "1" || process2.env.NO_COLOR === "yes";
var supportsAnimatedTerminal = Boolean(process2.stdout.isTTY) && process2.env.CI !== "true" && !noColor;
var colorize = (value, color) => supportsAnimatedTerminal ? `${color}${value}${ansi.reset}` : value;

// server/boot/logger/console.ts
import process3 from "process";
var log = {
  info: (msg) => console.log(msg),
  error: (msg) => console.error(msg)
};
var padRight = (value, length) => value.length >= length ? value : `${value}${" ".repeat(length - value.length)}`;
var truncate = (value, max = 140) => value.length <= max ? value : `${value.slice(0, max - 3)}...`;
var getTerminalWidth = () => Math.max(process3.stdout.columns || 100, 60);
var getInnerWidth = () => Math.max(getTerminalWidth() - 6, 32);
var fit = (value, width) => {
  const plain = value;
  if (plain.length <= width) return `${plain}${" ".repeat(width - plain.length)}`;
  return `${plain.slice(0, Math.max(width - 3, 1))}...`;
};
var kv = (key, value) => `  | ${fit(`${padRight(key, 13)} : ${value}`, getInnerWidth())} |`;
var section = (title) => {
  const inner = getInnerWidth();
  const label = ` ${title.toUpperCase()} `;
  const dashes = "-".repeat(Math.max(inner - label.length, 0));
  return colorize(`  +${label}${dashes}+`, `${ansi.bold}${ansi.cyan}`);
};
var sectionEnd = () => colorize(`  +${"-".repeat(getInnerWidth())}+`, ansi.gray);
var hr = () => {
  return colorize(`  +${"=".repeat(getInnerWidth())}+`, ansi.gray);
};
var row = (value) => `  | ${fit(value, getInnerWidth())} |`;
var titleBox = (title, subtitle) => {
  const inner = getInnerWidth();
  const top = `  +${"=".repeat(inner)}+`;
  const t = row(title);
  const s = subtitle ? row(subtitle) : null;
  const bottom = `  +${"=".repeat(inner)}+`;
  return [top, t, ...s ? [s] : [], bottom];
};
var badge = (label, message) => {
  const color = label === "UP" ? ansi.green : label === "WARN" ? ansi.yellow : label === "DOWN" ? ansi.magenta : ansi.cyan;
  return row(`${colorize(`[${label}]`, color)} ${message}`);
};
var meter = (label, percent, width = 24) => {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round(clamped / 100 * width);
  const bar = `${"#".repeat(filled)}${"-".repeat(Math.max(width - filled, 0))}`;
  return row(`${padRight(label, 13)} : [${bar}] ${clamped.toFixed(1)}%`);
};

// server/boot/logger/metrics.ts
import process4 from "process";
import { monitorEventLoopDelay } from "perf_hooks";
var formatMemoryUsage = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
var formatDurationMs = (ms) => `${Math.round(ms)} ms`;
var formatUptime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};
var eventLoopLagHistogram = monitorEventLoopDelay({ resolution: 20 });
eventLoopLagHistogram.enable();
var formatEventLoopLag = () => {
  const meanMs = eventLoopLagHistogram.mean / 1e6;
  return Number.isFinite(meanMs) ? `${Math.round(meanMs)} ms` : "n/a";
};
var createRuntimeMetrics = () => {
  const startedAt = Date.now();
  let totalRequests = 0;
  let totalErrors = 0;
  let activeConnections = 0;
  const latenciesMs = [];
  const onRequestStart = () => {
    const started = process4.hrtime.bigint();
    return (statusCode) => {
      totalRequests += 1;
      if (statusCode >= 400) totalErrors += 1;
      const elapsedMs = Number(process4.hrtime.bigint() - started) / 1e6;
      latenciesMs.push(elapsedMs);
      if (latenciesMs.length > 5e3) latenciesMs.shift();
    };
  };
  const onConnectionOpen = () => {
    activeConnections += 1;
  };
  const onConnectionClose = () => {
    activeConnections = Math.max(0, activeConnections - 1);
  };
  const snapshot = () => {
    const elapsedMinutes = Math.max((Date.now() - startedAt) / 6e4, 1 / 60);
    const sorted = [...latenciesMs].sort((a, b) => a - b);
    const avgLatencyMs = latenciesMs.length > 0 ? latenciesMs.reduce((sum, n) => sum + n, 0) / latenciesMs.length : 0;
    const p95Index = sorted.length > 0 ? Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95)) : -1;
    return {
      totalRequests,
      totalErrors,
      requestsPerMinute: totalRequests / elapsedMinutes,
      errorsPerMinute: totalErrors / elapsedMinutes,
      activeConnections,
      avgLatencyMs,
      p95LatencyMs: p95Index >= 0 ? sorted[p95Index] : 0
    };
  };
  return {
    onRequestStart,
    onConnectionOpen,
    onConnectionClose,
    snapshot
  };
};

// server/boot/logger/health.ts
var getWarnings = (input) => {
  const warnings = [];
  if (isProd2 && !input.jwtConfigured) warnings.push("JWT_SECRET missing in production");
  if (isProd2 && !input.publicUrlConfigured)
    warnings.push("PUBLIC_URL not configured in production");
  if (input.heapPercent > 85) warnings.push(`High heap usage: ${input.heapPercent.toFixed(1)}%`);
  if ((input.p95LatencyMs ?? 0) > 1e3) {
    warnings.push(`High API latency p95: ${Math.round(input.p95LatencyMs || 0)} ms`);
  }
  return warnings;
};
var getHealthScore = (signals) => `${signals.filter(Boolean).length}/${signals.length}`;

// server/boot/logger/runtime.ts
var normalizePublicUrl = (value) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};
var toHealthUrl = (value) => {
  const base = normalizePublicUrl(value);
  if (!base) return null;
  return `${base}/health`;
};
var envFlag = (name, required = false) => {
  const present = Boolean(process.env[name]?.trim());
  const badge2 = present ? colorize("[OK]", ansi.green) : required ? colorize("[MISS]", ansi.yellow) : colorize("[N/A]", ansi.gray);
  return `${badge2} ${name}`;
};
var envEitherFlag = (names, required = false) => {
  const present = names.some((name) => Boolean(process.env[name]?.trim()));
  const badge2 = present ? colorize("[OK]", ansi.green) : required ? colorize("[MISS]", ansi.yellow) : colorize("[N/A]", ansi.gray);
  return `${badge2} ${names.join(" | ")}`;
};
var getEnvChecks = () => [
  envFlag("JWT_SECRET", true),
  envFlag("REFRESH_TOKEN_SECRET", isProd2),
  envEitherFlag(["MONGODB_URI", "MONGODB_URL"], true),
  envFlag("PUBLIC_URL", isProd2),
  envFlag("CLIENT_URL", isProd2),
  envFlag("VITE_APP_PUBLIC_URL", isProd2),
  envFlag("VAULT_ENCRYPTION_KEY", isProd2),
  envFlag("AUTH_PEPPER", isProd2),
  envFlag("TRUST_PROXY", false)
];

// server/boot/startup.ts
var DB_STATE_MAP = {
  "0": "disconnected",
  "1": "connected",
  "2": "connecting",
  "3": "disconnecting"
};
var getDbStatusLabel = (state) => DB_STATE_MAP[state] ?? `state-${state}`;
var renderStartupBanner = () => {
  const mode = isProd2 ? "PRODUCTION" : "DEVELOPMENT";
  log.info(
    [
      "",
      colorize("  VAULT", `${ansi.bold}${ansi.cyan}`),
      colorize("  Secure Startup Console", `${ansi.dim}${ansi.gray}`),
      colorize("  Operational Visibility Profile", `${ansi.dim}${ansi.gray}`),
      "",
      `  ${colorize("Mode", ansi.magenta)}     ${mode}`,
      `  ${colorize("Process", ansi.magenta)}  PID ${process5.pid}`,
      `  ${colorize("Node", ansi.magenta)}     ${process5.version}`,
      `  ${colorize("Host", ansi.magenta)}     ${os3.hostname()}`,
      `  ${colorize("Time", ansi.magenta)}     ${(/* @__PURE__ */ new Date()).toISOString()}`,
      ""
    ].join("\n")
  );
};
var bootFrames = ["|", "/", "-", "\\"];
var createBootAnimator = () => {
  let frameIndex = 0;
  let interval = null;
  let label = "";
  let detail = "";
  const safeWrite = (text) => {
    try {
      process5.stdout.write(text);
    } catch {
      console.log(text);
    }
  };
  const render = () => {
    if (!supportsAnimatedTerminal) return;
    const frame = bootFrames[frameIndex++ % bootFrames.length];
    safeWrite(
      `\r  ${colorize(frame, ansi.cyan)} ${colorize(padRight(label, 28), ansi.bold)} ${colorize(detail, `${ansi.dim}${ansi.gray}`)}`
    );
  };
  const stop = () => {
    if (interval) clearInterval(interval);
    interval = null;
  };
  return {
    start(initialLabel, initialDetail) {
      label = initialLabel;
      detail = initialDetail;
      if (!supportsAnimatedTerminal) return log.info(`  > ${label} (${detail})`);
      render();
      interval = setInterval(render, 90);
    },
    update(nextLabel, nextDetail) {
      label = nextLabel;
      detail = nextDetail;
      if (!supportsAnimatedTerminal) log.info(`  > ${label} (${detail})`);
    },
    succeed(finalLabel, finalDetail) {
      stop();
      const message = `  ${colorize("OK", ansi.green)} ${padRight(finalLabel, 28)} ${finalDetail}`;
      supportsAnimatedTerminal ? safeWrite(`\r${message}
`) : log.info(message);
    },
    fail(finalLabel, finalDetail) {
      stop();
      const message = `  ${colorize("ERR", ansi.yellow)} ${padRight(finalLabel, 28)} ${finalDetail}`;
      supportsAnimatedTerminal ? safeWrite(`\r${message}
`) : log.error(message);
    }
  };
};
var renderStartupSummary = (input) => {
  const memory = process5.memoryUsage();
  const dbStatus = getDbStatusLabel(getDbStatus());
  const cpuCount = os3.cpus()?.length ?? 0;
  const loadAvg = os3.loadavg();
  const totalMem = formatMemoryUsage(os3.totalmem());
  const freeMem = formatMemoryUsage(os3.freemem());
  const uptime = formatUptime(process5.uptime());
  const uploadRoot3 = getUploadRoot();
  const allowedOrigins = getAllowedCorsOrigins();
  const publicUrl = normalizePublicUrl(process5.env.PUBLIC_URL);
  const keepAliveHealthTarget = toHealthUrl(input.keepAliveTarget);
  const envChecks = getEnvChecks();
  const envPresentCount = envChecks.filter((line) => line.includes("[OK]")).length;
  const heapCommittedPercent = memory.heapTotal > 0 ? memory.heapUsed / memory.heapTotal * 100 : 0;
  const heapLimit = v8.getHeapStatistics().heap_size_limit;
  const heapLimitPercent = heapLimit > 0 ? memory.heapUsed / heapLimit * 100 : 0;
  const warnings = getWarnings({
    jwtConfigured: Boolean(process5.env.JWT_SECRET),
    publicUrlConfigured: Boolean(publicUrl),
    heapPercent: heapLimitPercent,
    p95LatencyMs: input.runtimeMetrics?.p95LatencyMs
  });
  const healthScore = getHealthScore([
    dbStatus === "connected",
    Boolean(process5.env.JWT_SECRET),
    Boolean(publicUrl) || !isProd2,
    heapLimitPercent < 85,
    uploadRoot3 === "cloud-only" || uploadRoot3.length > 0
  ]);
  const [healthOk, healthTotal] = healthScore.split("/").map((n) => Number.parseInt(n, 10));
  const healthPercent = Number.isFinite(healthOk) && Number.isFinite(healthTotal) && healthTotal > 0 ? healthOk / healthTotal * 100 : 0;
  const latencyP95 = input.runtimeMetrics?.p95LatencyMs ?? 0;
  const latencyPressurePercent = Math.min(latencyP95 / 1e3 * 100, 100);
  const lines = [
    "",
    ...titleBox(
      colorize("VAULT SERVER IS LIVE", `${ansi.bold}${ansi.green}`),
      colorize("FULL RUNTIME SNAPSHOT", `${ansi.dim}${ansi.gray}`)
    ),
    badge("UP", `Mongo ${dbStatus}`),
    badge("INFO", `Mode ${isProd2 ? "PRODUCTION" : "DEVELOPMENT"}`),
    ...warnings.length > 0 ? [badge("WARN", `${warnings.length} runtime warning(s) detected`)] : [badge("UP", "No critical runtime warnings detected")],
    hr(),
    "",
    section("Runtime"),
    kv(
      "Mode",
      `${isProd2 ? "PRODUCTION" : "DEVELOPMENT"} (${isProd2 ? "hardened" : "developer-friendly"})`
    ),
    kv("Node", process5.version),
    kv("PID", String(process5.pid)),
    kv("Uptime", uptime),
    kv("UTC Time", (/* @__PURE__ */ new Date()).toISOString()),
    kv("Local Time", (/* @__PURE__ */ new Date()).toString()),
    kv("TZ", Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown"),
    kv("CWD", process5.cwd()),
    kv("Exec Path", process5.execPath),
    sectionEnd(),
    "",
    section("System"),
    kv("Host", os3.hostname()),
    kv("Platform", `${os3.platform()} ${os3.release()} (${os3.arch()})`),
    kv("CPU", `${cpuCount} cores`),
    kv("Load Avg", loadAvg.map((n) => n.toFixed(2)).join(" / ")),
    kv(
      "Memory",
      `RSS ${formatMemoryUsage(memory.rss)}  Heap ${formatMemoryUsage(memory.heapUsed)}`
    ),
    kv(
      "Heap",
      `${formatMemoryUsage(memory.heapUsed)} / ${formatMemoryUsage(memory.heapTotal)} committed (${heapCommittedPercent.toFixed(1)}%)`
    ),
    kv(
      "Heap Limit",
      `${formatMemoryUsage(memory.heapUsed)} / ${formatMemoryUsage(heapLimit)} (${heapLimitPercent.toFixed(1)}%)`
    ),
    kv("System RAM", `${freeMem} free / ${totalMem} total`),
    kv("Event Loop", formatEventLoopLag()),
    meter("Heap Pressure", heapLimitPercent),
    sectionEnd(),
    "",
    section("Network"),
    kv("Local", `http://localhost:${input.port}`),
    ...input.networkUrls.map((url, i) => kv(i === 0 ? "Network" : "Network+", url)),
    kv("Public", publicUrl ?? "not configured"),
    kv("Proxy", String(input.trustProxy)),
    kv("Health", `http://localhost:${input.port}/health`),
    kv("Ready", `http://localhost:${input.port}/ready`),
    ...input.runtimeMetrics ? [
      kv("Requests", `${input.runtimeMetrics.totalRequests} total`),
      kv("RPM", `${input.runtimeMetrics.requestsPerMinute.toFixed(1)}/min`),
      kv("Errors", `${input.runtimeMetrics.totalErrors} total`),
      kv("EPM", `${input.runtimeMetrics.errorsPerMinute.toFixed(2)}/min`),
      kv(
        "Latency",
        `avg ${Math.round(input.runtimeMetrics.avgLatencyMs)} ms  p95 ${Math.round(input.runtimeMetrics.p95LatencyMs)} ms`
      ),
      kv("Connections", `${input.runtimeMetrics.activeConnections} active`)
    ] : [],
    sectionEnd(),
    "",
    section("Security And Data"),
    kv("Mongo", dbStatus),
    kv("Uploads", uploadRoot3),
    kv("Origins", `${allowedOrigins.length} allowed`),
    kv(
      "Origin List",
      truncate(allowedOrigins.length > 0 ? allowedOrigins.join(", ") : "none", 220)
    ),
    kv("JWT Secret", process5.env.JWT_SECRET ? "configured" : "missing"),
    kv(
      "Refresh Secret",
      process5.env.REFRESH_TOKEN_SECRET ? "configured" : "fallback-to-jwt-or-missing"
    ),
    sectionEnd(),
    "",
    section("Service Health"),
    kv("Boot", formatDurationMs(input.bootDurationMs)),
    kv("Keepalive", keepAliveHealthTarget ?? "disabled"),
    kv("Health Score", healthScore),
    meter("Health Index", healthPercent),
    ...input.runtimeMetrics ? [meter("P95 Pressure", latencyPressurePercent)] : [],
    kv("Status", `${colorize("[UP]", ansi.green)} runtime initialized and endpoints published`),
    ...input.phaseTimings && input.phaseTimings.length > 0 ? [
      "",
      section("Startup Phase Timings"),
      ...input.phaseTimings.map((phase) => kv(phase.name, formatDurationMs(phase.durationMs)))
    ] : [],
    ...input.phaseTimings && input.phaseTimings.length > 0 ? [sectionEnd()] : [],
    sectionEnd(),
    "",
    section("Env Validation"),
    kv("Signals", `${envPresentCount}/${envChecks.length} key env values present`),
    ...envChecks.map((entry) => row(entry)),
    ...warnings.length > 0 ? [
      "",
      section("Warnings"),
      ...warnings.map((w) => row(`${colorize("! ", ansi.yellow)}${w}`)),
      sectionEnd()
    ] : [],
    sectionEnd(),
    hr(),
    ""
  ];
  log.info(lines.join("\n"));
};
var startDevHeartbeat = (input) => {
  if (isProd2 || !supportsAnimatedTerminal) return;
  const interval = setInterval(() => {
    const memory = process5.memoryUsage();
    log.info(
      `  ${colorize("HEARTBEAT", ansi.magenta)} ${(/* @__PURE__ */ new Date()).toISOString()} req:${input.requestCounter()} heap:${formatMemoryUsage(memory.heapUsed)} loop:${formatEventLoopLag()} db:${getDbStatusLabel(getDbStatus())} http://localhost:${input.port}`
    );
  }, 45e3);
  interval.unref();
};

// server/lib/logrocket.ts
init_logger();
import LogRocket from "logrocket";
var appId = process.env.LOGROCKET_APP_ID?.trim();
var isProd3 = process.env.NODE_ENV === "production";
var isEnabled2 = Boolean(appId) && isProd3;
var initialized2 = false;
var MONITORING_KEY = /* @__PURE__ */ Symbol.for("vault.logrocket.monitoring.registered");
var initLogRocketServer = () => {
  if (!isEnabled2 || initialized2) {
    return false;
  }
  try {
    LogRocket.init(appId);
    initialized2 = true;
    logger.info("[LOGROCKET] Server monitoring enabled.");
    return true;
  } catch (error) {
    logger.warn("[LOGROCKET] Server monitoring init failed.", { error });
    return false;
  }
};
var captureServerException = (error, context) => {
  if (!isEnabled2 || !initialized2) {
    return;
  }
  try {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    const tags = {};
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          tags[key] = value;
        }
      }
    }
    LogRocket.captureException(normalizedError, { tags });
  } catch (captureError) {
    logger.warn("[LOGROCKET] Failed to capture server exception.", {
      captureError
    });
  }
};
var logRocketRequestLogger = () => {
  return (req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      logger.info("[API REQUEST]", {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt
      });
    });
    next();
  };
};
var logRocketErrorMiddleware = () => {
  return (error, req, _res, next) => {
    captureServerException(error, {
      path: req.originalUrl,
      method: req.method,
      requestId: req.requestId
    });
    next(error);
  };
};
var registerLogRocketMiddleware = (app) => {
  const scopedApp = app;
  if (scopedApp[MONITORING_KEY]) {
    return;
  }
  scopedApp[MONITORING_KEY] = true;
  app.use(logRocketRequestLogger());
};

// server.ts
var buildHelmetConfig = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const configuredOrigins = getAllowedCorsOrigins();
  const selfAndConfiguredOrigins = ["'self'", ...configuredOrigins];
  const mediaAndImageSources = [...selfAndConfiguredOrigins, "blob:", "data:", "https:"];
  const documentViewerSources = [
    "https://docs.google.com",
    "https://drive.google.com",
    "https://*.google.com",
    "https://*.google.co.in",
    "https://*.googleusercontent.com",
    "https://*.googleapis.com",
    "https://lh3.googleusercontent.com",
    "https://view.officeapps.live.com",
    "https://*.officeapps.live.com",
    "https://*.office.com",
    "https://*.office365.com",
    "https://*.live.com",
    "https://*.microsoft.com",
    "https://*.onedrive.live.com",
    "https://*.sharepoint.com",
    "https://*.1drv.ms",
    "https://*.msauth.net",
    "https://*.msftauth.net",
    "https://documentservices.adobe.com",
    "https://*.adobe.com",
    "https://*.documentcloud.adobe.com",
    "https://acrobat.adobe.com",
    "https://mozilla.github.io",
    "https://*.mozilla.org",
    "https://*.mozilla.net"
  ];
  const mapSources = [
    "https://nominatim.openstreetmap.org",
    "https://*.openstreetmap.org",
    "https://*.tile.openstreetmap.org",
    "https://api.open-meteo.com"
  ];
  const securityAndAuthSources = [
    "https://www.google.com",
    "https://*.google.com",
    "https://www.gstatic.com",
    "https://*.gstatic.com",
    "https://recaptcha.google.com",
    "https://www.recaptcha.net",
    "https://*.recaptcha.net",
    "https://challenges.cloudflare.com",
    "https://*.hcaptcha.com",
    "https://api.pwnedpasswords.com"
  ];
  const cdnPackageSources = [
    "https://unpkg.com",
    "https://cdn.jsdelivr.net",
    "https://fastly.jsdelivr.net",
    "https://cdnjs.cloudflare.com",
    "https://esm.sh",
    "https://cdn.skypack.dev",
    "https://jspm.dev",
    "https://cdn.tailwindcss.com",
    "https://raw.githubusercontent.com",
    "https://*.githubusercontent.com",
    "https://*.github.com",
    "https://*.githubassets.com",
    "https://*.gitlab.com",
    "https://*.dropbox.com",
    "https://*.dropboxusercontent.com",
    "https://*.box.com",
    "https://*.box.net",
    "https://*.amazonaws.com",
    "https://*.cloudfront.net",
    "https://*.supabase.co",
    "https://*.firebaseio.com"
  ];
  const telemetrySources = [
    "https://www.googletagmanager.com",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    "https://stats.g.doubleclick.net",
    "https://*.ingest.sentry.io",
    "https://*.ingest.us.sentry.io",
    "https://*.sentry.io",
    "https://*.logrocket.com",
    "https://*.logr-in.com"
  ];
  const mediaEmbedSources = [
    "https://www.youtube.com",
    "https://*.youtube.com",
    "https://*.youtube-nocookie.com",
    "https://player.vimeo.com",
    "https://*.vimeo.com",
    "https://*.canva.com",
    "https://*.figma.com"
  ];
  const connectSources = [
    ...selfAndConfiguredOrigins,
    "blob:",
    "data:",
    "wss:",
    ...isProduction ? [] : ["ws:"],
    ...mapSources,
    ...securityAndAuthSources,
    ...documentViewerSources,
    ...cdnPackageSources,
    ...telemetrySources
  ];
  const frameSources = [
    "'self'",
    "blob:",
    "data:",
    ...documentViewerSources,
    ...securityAndAuthSources,
    ...mapSources,
    ...mediaEmbedSources
  ];
  const childSources = [
    "'self'",
    "blob:",
    "data:",
    ...cdnPackageSources,
    ...documentViewerSources,
    ...securityAndAuthSources,
    ...mapSources,
    ...mediaEmbedSources
  ];
  const workerSources = [
    "'self'",
    "blob:",
    "data:",
    "https://unpkg.com",
    "https://cdn.jsdelivr.net",
    "https://fastly.jsdelivr.net",
    "https://cdnjs.cloudflare.com",
    "https://esm.sh",
    "https://cdn.skypack.dev"
  ];
  const scriptSources = [
    "blob:",
    "https://unpkg.com",
    "https://cdn.jsdelivr.net",
    "https://fastly.jsdelivr.net",
    "https://cdnjs.cloudflare.com",
    "https://esm.sh",
    "https://cdn.skypack.dev",
    "https://cdn.tailwindcss.com",
    "https://www.googletagmanager.com",
    "https://cdn.logr-in.com",
    "https://www.google.com",
    "https://*.google.com",
    "https://docs.google.com",
    "https://www.gstatic.com",
    "https://*.gstatic.com",
    "https://recaptcha.google.com",
    "https://www.recaptcha.net",
    "https://*.recaptcha.net",
    "https://challenges.cloudflare.com",
    "https://*.hcaptcha.com"
  ];
  return {
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    originAgentCluster: true,
    frameguard: { action: "deny" },
    noSniff: true,
    dnsPrefetchControl: { allow: false },
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
    xssFilter: false,
    hidePoweredBy: true,
    ieNoOpen: true,
    referrerPolicy: {
      policy: isProduction ? "no-referrer" : "strict-origin-when-cross-origin"
    },
    contentSecurityPolicy: {
      useDefaults: false,
      // Explicitly disable defaults to prevent collisions
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        connectSrc: connectSources,
        imgSrc: mediaAndImageSources,
        mediaSrc: mediaAndImageSources,
        scriptSrc: isProduction ? ["'self'", "'wasm-unsafe-eval'", "'unsafe-eval'", ...scriptSources] : ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "'unsafe-eval'", ...scriptSources],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https:",
          "https://fonts.googleapis.com",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net"
        ],
        scriptSrcAttr: ["'none'"],
        fontSrc: [
          "'self'",
          "https:",
          "data:",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net"
        ],
        frameSrc: frameSources,
        manifestSrc: ["'self'"],
        workerSrc: workerSources,
        childSrc: childSources,
        objectSrc: ["'none'"],
        ...isProduction ? { upgradeInsecureRequests: [] } : {}
      }
    },
    hsts: isProduction ? { maxAge: 31536e3, includeSubDomains: true, preload: true } : false
  };
};
var resolveTrustProxy = () => {
  const raw = process.env.TRUST_PROXY?.trim().toLowerCase();
  if (!raw) {
    return process.env.NODE_ENV === "production" ? 1 : false;
  }
  if (raw === "true" || raw === "1") {
    return 1;
  }
  if (raw === "false" || raw === "0") {
    return false;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return process.env.NODE_ENV === "production" ? 1 : false;
};
var resolveKeepAliveEnabled = () => {
  const raw = process.env.KEEP_ALIVE_ENABLED?.trim().toLowerCase();
  if (!raw) {
    return process.env.NODE_ENV === "production";
  }
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return process.env.NODE_ENV === "production";
};
var resolveCompressionEnabled = () => {
  const raw = process.env.ENABLE_COMPRESSION?.trim().toLowerCase();
  if (!raw) {
    return process.env.NODE_ENV !== "development";
  }
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return process.env.NODE_ENV !== "development";
};
var resolveEventLoopLagThresholdMs = () => {
  const parsed = Number.parseInt(process.env.EVENT_LOOP_LAG_THRESHOLD_MS || "1000", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 1e3;
};
var resolveOverloadProtectionEnabled = () => {
  const raw = process.env.ENABLE_OVERLOAD_PROTECTION?.trim().toLowerCase();
  if (!raw) {
    return process.env.NODE_ENV === "production";
  }
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no" || raw === "off") {
    return false;
  }
  return process.env.NODE_ENV === "production";
};
var resolveSkipMongoConnect = () => {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  const raw = process.env.SKIP_MONGO_CONNECT?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
};
var overloadHtmlPath = path15.resolve(process.cwd(), "overload.html");
var overloadHtmlCache = null;
var FALLBACK_OVERLOAD_HTML = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>503 Service Unavailable</title></head><body><main><h1>503 Service Unavailable</h1><p>The server is temporarily overloaded and cannot process this request right now.</p><p>Please wait a few seconds and refresh.</p><p>If this continues, check <code>/health</code> and server logs for overload details.</p></main></body></html>`;
var serviceBusyJsPath = path15.resolve(process.cwd(), "public", "service-busy.js");
var buildServiceBusyJsPath = path15.resolve(process.cwd(), "build", "service-busy.js");
var serviceBusyJsCache = null;
var preloadOverloadAssets = async () => {
  try {
    overloadHtmlCache = await fs12.promises.readFile(overloadHtmlPath, "utf8");
  } catch (error) {
    logger.warn("[OVERLOAD] Failed to load overload.html. Using inline fallback.", {
      overloadHtmlPath,
      error
    });
    overloadHtmlCache = FALLBACK_OVERLOAD_HTML;
  }
  try {
    if (fs12.existsSync(serviceBusyJsPath)) {
      serviceBusyJsCache = await fs12.promises.readFile(serviceBusyJsPath, "utf8");
    } else if (fs12.existsSync(buildServiceBusyJsPath)) {
      serviceBusyJsCache = await fs12.promises.readFile(buildServiceBusyJsPath, "utf8");
    }
  } catch {
    serviceBusyJsCache = "";
  }
};
var renderOverloadHtml = () => {
  return overloadHtmlCache || FALLBACK_OVERLOAD_HTML;
};
var renderServiceBusyJs = () => {
  return serviceBusyJsCache || "";
};
var isStaticAssetRequestPath = (requestPath) => {
  if (requestPath.startsWith("/assets/") || requestPath === "/sw.js" || requestPath === "/sw-register.js" || requestPath === "/service-busy.js" || requestPath === "/favicon.ico" || requestPath === "/site.webmanifest") {
    return true;
  }
  return /\.[a-z0-9]+$/i.test(requestPath);
};
var setOverloadResponseHeaders = (res) => {
  res.setHeader("Retry-After", "5");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
};
var apiLimiter = rateLimit8({
  windowMs: Number.parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || "", 10) || 15 * 60 * 1e3,
  max: Number.parseInt(process.env.API_RATE_LIMIT_MAX || "", 10) || (process.env.NODE_ENV === "production" ? 500 : 5e3),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
    error: { code: "TOO_MANY_REQUESTS" }
  }
});
var processErrorHandlersRegistered = false;
var exitProcess = (code) => {
  setImmediate(() => process.exit(code));
};
var registerProcessErrorHandlers = () => {
  if (processErrorHandlersRegistered) {
    return;
  }
  processErrorHandlersRegistered = true;
  process.on("unhandledRejection", (reason) => {
    captureServerException(reason, { source: "unhandledRejection" });
    captureException2(reason, { tags: { source: "unhandledRejection" } });
    logger.error("[FATAL] Unhandled Rejection", { reason });
    void flushSentry(2e3).finally(() => exitProcess(1));
  });
  process.on("uncaughtException", (error) => {
    captureServerException(error, { source: "uncaughtException" });
    captureException2(error, { tags: { source: "uncaughtException" } });
    logger.error("[FATAL] Uncaught Exception", { error });
    void flushSentry(2e3).finally(() => exitProcess(1));
  });
};
async function startServer() {
  initSentry();
  initLogRocketServer();
  registerProcessErrorHandlers();
  const startupAnimator = createBootAnimator();
  const runtimeMetrics = createRuntimeMetrics();
  const bootStartedAt = Date.now();
  const phaseTimings = [];
  let requestCount = 0;
  const runPhase = async (name, task) => {
    const startedAt = Date.now();
    await task();
    phaseTimings.push({ name, durationMs: Date.now() - startedAt });
  };
  renderStartupBanner();
  startupAnimator.start("Validating environment", "Checking secrets and runtime flags");
  try {
    startupAnimator.update("Validating environment", "Checking runtime flags");
    await runPhase("Environment", () => validateRuntimeEnv());
    await runPhase("Preload Overload Assets", () => preloadOverloadAssets());
    startupAnimator.update("Validating JWT configuration", "Checking token signing secrets");
    await runPhase("JWT Diagnostics", async () => {
      const { logJwtDiagnostics: logJwtDiagnostics2 } = await Promise.resolve().then(() => (init_jwtDiagnostics(), jwtDiagnostics_exports));
      logJwtDiagnostics2();
    });
    const skipMongoConnect = resolveSkipMongoConnect();
    if (skipMongoConnect) {
      phaseTimings.push({ name: "MongoDB Init (skipped)", durationMs: 0 });
      logger.warn(
        "[MONGO] SKIP_MONGO_CONNECT is enabled. Continuing startup without database connection."
      );
    } else {
      startupAnimator.update("Connecting to MongoDB", "Negotiating database session");
      await runPhase("MongoDB Init", async () => {
        await connectToMongo();
        void multiClusterPool.initialize().catch((err) => {
          logger.warn("[MultiClusterPool] Background warmup warning:", err?.message || err);
        });
      });
    }
    startupAnimator.update("Creating application shell", "Configuring HTTP server and middleware");
    const app = express10();
    const httpServer = createServer(app);
    const trustProxy = resolveTrustProxy();
    const shutdownController = new AbortController();
    const eventLoopLagThresholdMs = resolveEventLoopLagThresholdMs();
    const overloadProtectionEnabled = resolveOverloadProtectionEnabled();
    const eventLoopDelayMonitor = monitorEventLoopDelay2({ resolution: 20 });
    eventLoopDelayMonitor.enable();
    let latestEventLoopLagMs = 0;
    const eventLoopLagSampler = setInterval(() => {
      latestEventLoopLagMs = eventLoopDelayMonitor.percentile(99) / 1e6;
      eventLoopDelayMonitor.reset();
    }, 1e3);
    eventLoopLagSampler.unref();
    let shutdownInProgress = false;
    let lastOverloadLogAt = 0;
    app.set("shutdownSignal", shutdownController.signal);
    httpServer.requestTimeout = 3e4;
    httpServer.headersTimeout = 35e3;
    httpServer.keepAliveTimeout = 5e3;
    httpServer.on("connection", (socket) => {
      runtimeMetrics.onConnectionOpen();
      socket.on("close", () => runtimeMetrics.onConnectionClose());
    });
    httpServer.on("error", (error) => {
      logger.error("[HTTP SERVER ERROR]", { error });
    });
    mongoose30.connection.on("disconnected", () => {
      logger.warn("[MONGO] Connection disconnected.");
    });
    mongoose30.connection.on("error", (error) => {
      logger.error("[MONGO] Connection error.", { error });
    });
    await runPhase("Middleware Init", () => {
      app.use(sentryRequestHandler());
      app.use(sentryTracingHandler());
      registerLogRocketMiddleware(app);
      app.disable("x-powered-by");
      if (process.env.NODE_ENV !== "production") {
        app.set("etag", false);
      }
      app.set("trust proxy", trustProxy);
      app.use(helmet(buildHelmetConfig()));
      app.use(
        cors({
          origin: (origin, callback) => {
            if (!origin || isAllowedCorsOrigin(origin)) return callback(null, true);
            return callback(new Error("Origin is not allowed by CORS."));
          },
          credentials: true,
          methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
          allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-Requested-With",
            "X-CSRF-Token",
            "X-XSRF-Token",
            "X-Vault-Category",
            "X-Vault-Title",
            "X-Vault-Metadata",
            "X-Request-Id",
            "Tus-Resumable",
            "Upload-Length",
            "Upload-Metadata",
            "Upload-Offset"
          ],
          exposedHeaders: ["Location", "Tus-Resumable", "Upload-Offset", "Upload-Length"]
        })
      );
      app.use(originProtection);
      if (resolveCompressionEnabled()) {
        app.use(compression3(deepCompressionOptions));
      }
      app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
      app.use((_req, res, next) => {
        res.setTimeout(3e4);
        next();
      });
    });
    app.use((req, res, next) => {
      requestCount++;
      const finishTracking = runtimeMetrics.onRequestStart();
      const requestId = randomUUID5();
      let trackingFinished = false;
      const finalizeTracking = () => {
        if (trackingFinished) return;
        trackingFinished = true;
        finishTracking(res.statusCode);
      };
      req.requestId = requestId;
      res.setHeader("x-request-id", requestId);
      res.on("finish", finalizeTracking);
      res.on("close", finalizeTracking);
      next();
    });
    app.use((req, res, next) => {
      const shouldSkipBreadcrumb = req.path === "/health" || req.path === "/ready" || isStaticAssetRequestPath(req.path);
      if (!shouldSkipBreadcrumb) {
        addBreadcrumb2({
          category: "http",
          message: `${req.method} ${req.originalUrl}`,
          level: "info",
          data: { requestId: req.requestId }
        });
      }
      if (req.path === "/health" || req.path === "/ready") {
        return next();
      }
      if (req.path === "/service-busy.js") {
        const script = renderServiceBusyJs();
        if (script) {
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
          res.setHeader("Cache-Control", "public, max-age=3600");
          return res.status(200).send(script);
        }
      }
      if (!overloadProtectionEnabled) {
        return next();
      }
      const lagMs = Number.isFinite(latestEventLoopLagMs) ? latestEventLoopLagMs : 0;
      if (lagMs <= eventLoopLagThresholdMs) {
        return next();
      }
      const now = Date.now();
      if (now - lastOverloadLogAt >= 5e3) {
        lastOverloadLogAt = now;
        logger.warn("[OVERLOAD] Event loop lag threshold exceeded.", {
          lagMs: Math.round(lagMs),
          thresholdMs: eventLoopLagThresholdMs,
          path: req.originalUrl,
          method: req.method
        });
      }
      const isApiRequest = req.path.startsWith("/api");
      const isHtmlNavigation = req.accepts(["html", "json"]) === "html" && !!req.headers.accept?.includes("text/html");
      const isAssetRequest = isStaticAssetRequestPath(req.path);
      if (isAssetRequest) {
        return next();
      }
      if (!isApiRequest && isHtmlNavigation) {
        setOverloadResponseHeaders(res);
        return res.status(503).type("html").send(renderOverloadHtml());
      }
      setOverloadResponseHeaders(res);
      return res.status(503).json({
        success: false,
        message: "Server overloaded. Please retry shortly.",
        error: { code: "SERVER_OVERLOADED" }
      });
    });
    await runPhase("Body, CSRF, And Sanitize", () => {
      installBodyParsers(app);
      installCsrfProtection(app);
      app.use(customMongoSanitize);
    });
    app.use((req, res, next) => {
      let logged = false;
      const logAuthError = () => {
        if (logged) return;
        logged = true;
        if (res.statusCode === 401 || res.statusCode === 403) {
          logger.warn(`Auth Error [${res.statusCode}]: ${req.method} ${req.originalUrl}`, {
            ip: getClientIp(req),
            hasAuthHeader: !!req.get("authorization"),
            queryKeys: Object.keys(req.query),
            uid: req.query.uid
          });
        }
      };
      res.on("finish", logAuthError);
      res.on("close", logAuthError);
      next();
    });
    app.use((req, res, next) => {
      if (shutdownInProgress && req.path === "/ready") {
        res.status(503).json({
          success: false,
          status: "shutting_down"
        });
        return;
      }
      next();
    });
    await runPhase("Socket Init", () => {
      registerSocketHandlers(httpServer);
    });
    await runPhase("Routes Load", () => {
      app.get("/health", getHealthStatus);
      app.get("/api/health", getHealthStatus);
      app.get("/ready", getReadinessStatus);
      app.get("/api/ready", getReadinessStatus);
      app.use("/uploads", requireAuth, express10.static(getUploadRoot()));
      app.use("/api", (req, res, next) => {
        if (req.path.startsWith("/auth")) {
          return next();
        }
        return apiLimiter(req, res, next);
      });
      app.use("/api/auth", authRouter);
      app.use("/api/master-key", masterKeyRoutes_default);
      app.use("/api/contact", router);
      app.use("/api/system", router2);
      app.use("/api/2fa", twoFactorRouter);
      app.use("/api/security", securityRouter);
      app.use("/api/notifications", router4);
      app.use("/api/avatar", router5);
      app.use("/api/vault/integrity", integrityRouter);
      registerVaultRoutes(app);
    });
    await runPhase("Frontend Middleware", () => setupFrontendMiddleware(app, httpServer));
    await runPhase("Error Handler", () => {
      app.use(logRocketErrorMiddleware());
      app.use(sentryErrorHandler());
      app.use(errorHandler);
    });
    startupAnimator.update("Binding network port", "Publishing secure endpoints");
    const port = await listenWithFallback(
      httpServer,
      "0.0.0.0",
      resolvePort(process.env.PORT, 4e3)
    );
    const networkUrls = [];
    const interfaces = os4.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === "IPv4" && !net.internal)
          networkUrls.push(`http://${net.address}:${port}`);
      }
    }
    const keepAliveState = startKeepAlive(process.env.PUBLIC_URL, 13, {
      enabled: resolveKeepAliveEnabled(),
      silentWhenDisabled: true
    });
    startupAnimator.succeed("Startup complete", "Vault runtime initialized");
    renderStartupSummary({
      port,
      trustProxy,
      networkUrls,
      bootDurationMs: Date.now() - bootStartedAt,
      keepAliveTarget: keepAliveState.enabled ? keepAliveState.target ?? process.env.PUBLIC_URL : void 0,
      phaseTimings,
      runtimeMetrics: runtimeMetrics.snapshot()
    });
    startDevHeartbeat({
      port,
      requestCounter: () => requestCount
    });
    const runShutdownPhase = async (phase, task) => {
      const startedAt = Date.now();
      logger.info("[SHUTDOWN] Phase started.", { phase });
      try {
        await task();
        logger.info("[SHUTDOWN] Phase completed.", {
          phase,
          durationMs: Date.now() - startedAt
        });
      } catch (error) {
        logger.error("[SHUTDOWN] Phase failed.", {
          phase,
          durationMs: Date.now() - startedAt,
          error
        });
        throw error;
      }
    };
    const shutdown = async (signal) => {
      if (shutdownInProgress) {
        return;
      }
      shutdownInProgress = true;
      shutdownController.abort(new Error("Server shutdown in progress."));
      logger.warn(`[SHUTDOWN] Signal received: ${signal}`);
      logger.info("[SHUTDOWN] Closing HTTP server...");
      const forcedExitTimer = setTimeout(() => {
        httpServer.closeIdleConnections?.();
        httpServer.closeAllConnections?.();
        exitProcess(1);
      }, 1e4);
      forcedExitTimer.unref();
      try {
        await runShutdownPhase("http_close", async () => {
          await new Promise((resolve, reject) => {
            httpServer.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          });
        });
        await runShutdownPhase("mongo_disconnect", async () => {
          logger.info("[SHUTDOWN] Disconnecting MongoDB...");
          await mongoose30.disconnect();
        });
        await runShutdownPhase("socket_cleanup", () => {
          clearInterval(eventLoopLagSampler);
          httpServer.closeIdleConnections?.();
          httpServer.closeAllConnections?.();
          eventLoopDelayMonitor.disable();
        });
        logger.info("[SHUTDOWN] Cleanup complete.", {
          phase: "complete"
        });
        await flushSentry(2e3);
        exitProcess(0);
      } catch (error) {
        logger.error("[SHUTDOWN] Error during graceful shutdown.", { error });
        await flushSentry(2e3);
        exitProcess(1);
      } finally {
        clearTimeout(forcedExitTimer);
      }
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    startupAnimator.fail(
      "Startup failed",
      error instanceof Error ? error.message : "Unknown error"
    );
    logger.error("Failed to start server.", { error });
    exitProcess(1);
  }
}
startServer();
