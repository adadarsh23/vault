import { beforeEach, vi } from 'vitest';
import path from 'path';

// Polyfill self for WebAssembly & wasm-bindgen libraries (e.g. pqc-kyber, libsodium) in Node test environments
if (typeof (globalThis as any).self === 'undefined') {
  (globalThis as any).self = globalThis;
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret';
process.env.REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'vault_refresh_token';
process.env.REFRESH_COOKIE_PATH = process.env.REFRESH_COOKIE_PATH || '/api/auth';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vault-test';
process.env.MULTIPART_TMP_ROOT =
  process.env.MULTIPART_TMP_ROOT ||
  path.join(process.cwd(), 'vault-tmp', 'multipart-uploads-tests');
process.env.NODE_ENV = 'test';

beforeEach(() => {
  vi.restoreAllMocks();
});
