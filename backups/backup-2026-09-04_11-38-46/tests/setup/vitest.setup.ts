import { beforeEach, vi } from 'vitest';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env / .env.local
dotenv.config();

// Polyfill self for WebAssembly & wasm-bindgen libraries (e.g. pqc-kyber, libsodium) in Node test environments
if (typeof (globalThis as any).self === 'undefined') {
  (globalThis as any).self = globalThis;
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret';
process.env.REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'vault_refresh_token';
process.env.REFRESH_COOKIE_PATH = process.env.REFRESH_COOKIE_PATH || '/api/auth';

// Use Atlas URI from .env if present (or TEST_MONGODB_URI / MONGODB_URI), fallback to local test DB
process.env.MONGODB_URI =
  process.env.MONGODB_TEST_URI ||
  process.env.TEST_MONGODB_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGODB_URL ||
  process.env.MONGO_URI ||
  'mongodb://127.0.0.1:27017/vault-test';

// Use isolated test DB name
process.env.MONGODB_DB_NAME =
  process.env.MONGODB_TEST_DB_NAME || process.env.TEST_MONGODB_DB_NAME || 'vault-test';

process.env.MULTIPART_TMP_ROOT =
  process.env.MULTIPART_TMP_ROOT ||
  path.join(process.cwd(), 'vault-tmp', 'multipart-uploads-tests');
process.env.NODE_ENV = 'test';

beforeEach(() => {
  vi.restoreAllMocks();
});
