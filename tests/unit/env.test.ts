import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/utils/logger.ts', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../../server/utils/logger.ts';
import { validateRuntimeEnv } from '../../server/utils/env.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stub the minimum required env vars for non-production. */
const stubDevMinimums = () => {
  vi.stubEnv('JWT_SECRET', 'test-secret');
  vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017/test');
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('SKIP_MONGO_CONNECT', '');
};

/** Stub the minimum required env vars for production. */
const stubProdMinimums = () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('JWT_SECRET', 'test-secret');
  vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017/test');
  vi.stubEnv('CLIENT_URL', 'http://localhost:4000');
  vi.stubEnv('PUBLIC_URL', 'http://localhost:4000');
  vi.stubEnv('VITE_APP_PUBLIC_URL', 'http://localhost:4000');
  vi.stubEnv('RECAPTCHA_SECRET_KEY', 'recaptcha-secret');
  vi.stubEnv('REFRESH_TOKEN_SECRET', 'refresh-token-secret-32-chars-minimum-prod');
  vi.stubEnv(
    'VAULT_ENCRYPTION_KEY',
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  );
  vi.stubEnv('AUTH_PEPPER', 'test-auth-pepper');
  vi.stubEnv('CSRF_SECRET', 'test-csrf-secret');
  vi.stubEnv('SIGNED_URL_SECRET', 'test-signed-url-secret');
  vi.stubEnv('SKIP_MONGO_CONNECT', '');
};

// ---------------------------------------------------------------------------
// server environment validation
// ---------------------------------------------------------------------------

describe('server environment validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  // ---- Required variables --------------------------------------------------

  it('throws when JWT_SECRET is missing', () => {
    vi.stubEnv('JWT_SECRET', '');
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017/test');
    vi.stubEnv('SKIP_MONGO_CONNECT', '');

    expect(() => validateRuntimeEnv()).toThrow(
      /Missing required environment configuration: JWT_SECRET/,
    );
  });

  it('throws when MongoDB connection strings are missing', () => {
    vi.stubEnv('JWT_SECRET', 'test-secret');
    vi.stubEnv('MONGODB_URI', '');
    vi.stubEnv('MONGODB_URL', '');
    vi.stubEnv('MONGO_URI', '');
    vi.stubEnv('MONGO_URL', '');
    vi.stubEnv('SKIP_MONGO_CONNECT', '');

    expect(() => validateRuntimeEnv()).toThrow(
      /Missing required environment configuration: MONGODB_URI, MONGODB_URL, or MONGO_URI/,
    );
  });

  it('does not throw when MONGODB_URI is missing but SKIP_MONGO_CONNECT is enabled in development', () => {
    vi.stubEnv('JWT_SECRET', 'test-secret');
    vi.stubEnv('MONGODB_URI', '');
    vi.stubEnv('MONGODB_URL', '');
    vi.stubEnv('MONGO_URI', '');
    vi.stubEnv('MONGO_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SKIP_MONGO_CONNECT', '1');

    expect(() => validateRuntimeEnv()).not.toThrow();
  });

  it('throws in production when SKIP_MONGO_CONNECT is enabled', () => {
    stubProdMinimums();
    vi.stubEnv('SKIP_MONGO_CONNECT', '1');

    expect(() => validateRuntimeEnv()).toThrow(/SKIP_MONGO_CONNECT is not permitted in production/);
  });

  it('accepts MONGODB_URL as a valid fallback when MONGODB_URI is absent', () => {
    vi.stubEnv('JWT_SECRET', 'test-secret');
    vi.stubEnv('MONGODB_URI', '');
    vi.stubEnv('MONGODB_URL', 'mongodb://localhost:27017/test');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SKIP_MONGO_CONNECT', '');

    expect(() => validateRuntimeEnv()).not.toThrow();
  });

  it('accepts MONGO_URI as a valid fallback when MONGODB_URI is absent', () => {
    vi.stubEnv('JWT_SECRET', 'test-secret');
    vi.stubEnv('MONGODB_URI', '');
    vi.stubEnv('MONGODB_URL', '');
    vi.stubEnv('MONGO_URI', 'mongodb://localhost:27017/test');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SKIP_MONGO_CONNECT', '');

    expect(() => validateRuntimeEnv()).not.toThrow();
  });

  it('passes when minimum required variables are present in non-production', () => {
    stubDevMinimums();

    expect(() => validateRuntimeEnv()).not.toThrow();
  });

  it('does not produce any warnings in a clean development environment', () => {
    stubDevMinimums();
    validateRuntimeEnv();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  // ---- Production-required variables ---------------------------------------

  it('throws missing production keys in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'test-secret');
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017/test');
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'recaptcha-secret');
    vi.stubEnv('CLIENT_URL', '');
    vi.stubEnv('PUBLIC_URL', '');
    vi.stubEnv('VITE_APP_PUBLIC_URL', '');

    expect(() => validateRuntimeEnv()).toThrow(
      /Missing required environment configuration: CLIENT_URL, PUBLIC_URL, VITE_APP_PUBLIC_URL/,
    );
  });

  it('passes with all required production variables set', () => {
    stubProdMinimums();

    // May still warn about optional vars, but must not throw
    expect(() => validateRuntimeEnv()).not.toThrow();
  });

  // ---- Mandatory production security secrets -------------------------------

  it('throws when mandatory security secrets are missing in production', () => {
    stubProdMinimums();
    vi.stubEnv('REFRESH_TOKEN_SECRET', '');
    vi.stubEnv('VAULT_ENCRYPTION_KEY', '');
    vi.stubEnv('AUTH_PEPPER', '');

    expect(() => validateRuntimeEnv()).toThrow(
      /Missing required environment configuration: REFRESH_TOKEN_SECRET, VAULT_ENCRYPTION_KEY, AUTH_PEPPER/,
    );
  });

  it('warns about TRUST_PROXY in production when unset', () => {
    stubProdMinimums();
    vi.stubEnv('TRUST_PROXY', '');

    validateRuntimeEnv();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('TRUST_PROXY is not configured'),
    );
  });

  // ---- REGISTRATION_PROFILE_CAPTURE_ENABLED --------------------------------

  it('warns about invalid REGISTRATION_PROFILE_CAPTURE_ENABLED in production', () => {
    stubProdMinimums();
    vi.stubEnv('REGISTRATION_PROFILE_CAPTURE_ENABLED', 'maybe');

    validateRuntimeEnv();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'REGISTRATION_PROFILE_CAPTURE_ENABLED is set to an unrecognized value',
      ),
    );
  });

  it('does not warn when REGISTRATION_PROFILE_CAPTURE_ENABLED is "true"', () => {
    stubProdMinimums();
    vi.stubEnv('REGISTRATION_PROFILE_CAPTURE_ENABLED', 'true');

    validateRuntimeEnv();

    const calls: string[] = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat();
    expect(calls.some((c) => c.includes('REGISTRATION_PROFILE_CAPTURE_ENABLED'))).toBe(false);
  });

  it('does not warn when REGISTRATION_PROFILE_CAPTURE_ENABLED is "false"', () => {
    stubProdMinimums();
    vi.stubEnv('REGISTRATION_PROFILE_CAPTURE_ENABLED', 'false');

    validateRuntimeEnv();

    const calls: string[] = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat();
    expect(calls.some((c) => c.includes('REGISTRATION_PROFILE_CAPTURE_ENABLED'))).toBe(false);
  });

  // ---- URL template placeholders -------------------------------------------

  it('warns about missing {ip} placeholder in FREE_IP_API_URL_TEMPLATE', () => {
    stubProdMinimums();
    vi.stubEnv('FREE_IP_API_URL_TEMPLATE', 'http://api.com/lookup'); // Missing {ip}

    validateRuntimeEnv();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('FREE_IP_API_URL_TEMPLATE should include the {ip} placeholder'),
    );
  });

  it('does not warn when FREE_IP_API_URL_TEMPLATE contains {ip}', () => {
    stubProdMinimums();
    vi.stubEnv('FREE_IP_API_URL_TEMPLATE', 'http://api.com/lookup/{ip}');

    validateRuntimeEnv();

    const calls: string[] = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat();
    expect(calls.some((c) => c.includes('FREE_IP_API_URL_TEMPLATE'))).toBe(false);
  });
});
