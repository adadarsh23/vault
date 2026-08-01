import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../server/utils/logger.ts', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

import { logger } from '../../server/utils/logger.ts'
import { validateRuntimeEnv } from '../../server/utils/env.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stub the minimum required env vars for non-production. */
const stubDevMinimums = () => {
  vi.stubEnv('JWT_SECRET', 'test-secret')
  vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017/test')
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('SKIP_MONGO_CONNECT', '')
}

/** Stub the minimum required env vars for production. */
const stubProdMinimums = () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('JWT_SECRET', 'test-secret')
  vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017/test')
  vi.stubEnv('CLIENT_URL', 'http://localhost:4000')
  vi.stubEnv('PUBLIC_URL', 'http://localhost:4000')
  vi.stubEnv('VITE_APP_PUBLIC_URL', 'http://localhost:4000')
  vi.stubEnv('RECAPTCHA_SECRET_KEY', 'recaptcha-secret')
  vi.stubEnv('SKIP_MONGO_CONNECT', '')
}

// ---------------------------------------------------------------------------
// server environment validation
// ---------------------------------------------------------------------------

describe('server environment validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  // ---- Required variables --------------------------------------------------

  it('throws when JWT_SECRET is missing', () => {
    vi.stubEnv('JWT_SECRET', '')
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017/test')
    vi.stubEnv('SKIP_MONGO_CONNECT', '')

    expect(() => validateRuntimeEnv()).toThrow(
      /Missing required environment configuration: JWT_SECRET/,
    )
  })

  it('throws when both MONGODB_URI and MONGODB_URL are missing', () => {
    vi.stubEnv('JWT_SECRET', 'test-secret')
    vi.stubEnv('MONGODB_URI', '')
    vi.stubEnv('MONGODB_URL', '')
    vi.stubEnv('SKIP_MONGO_CONNECT', '')

    expect(() => validateRuntimeEnv()).toThrow(
      /Missing required environment configuration: MONGODB_URI or MONGODB_URL/,
    )
  })

  it('does not throw when MONGODB_URI is missing but SKIP_MONGO_CONNECT is enabled', () => {
    vi.stubEnv('JWT_SECRET', 'test-secret')
    vi.stubEnv('MONGODB_URI', '')
    vi.stubEnv('MONGODB_URL', '')
    vi.stubEnv('SKIP_MONGO_CONNECT', '1')

    expect(() => validateRuntimeEnv()).not.toThrow()
  })

  it('accepts MONGODB_URL as a valid fallback when MONGODB_URI is absent', () => {
    vi.stubEnv('JWT_SECRET', 'test-secret')
    vi.stubEnv('MONGODB_URI', '')
    vi.stubEnv('MONGODB_URL', 'mongodb://localhost:27017/test')
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('SKIP_MONGO_CONNECT', '')

    expect(() => validateRuntimeEnv()).not.toThrow()
  })

  it('passes when minimum required variables are present in non-production', () => {
    stubDevMinimums()

    expect(() => validateRuntimeEnv()).not.toThrow()
  })

  it('does not produce any warnings in a clean development environment', () => {
    stubDevMinimums()
    validateRuntimeEnv()

    expect(logger.warn).not.toHaveBeenCalled()
  })

  // ---- Production-required variables ---------------------------------------

  it('throws missing production keys in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('JWT_SECRET', 'test-secret')
    vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017/test')
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'recaptcha-secret')
    vi.stubEnv('CLIENT_URL', '')
    vi.stubEnv('PUBLIC_URL', '')
    vi.stubEnv('VITE_APP_PUBLIC_URL', '')

    expect(() => validateRuntimeEnv()).toThrow(
      /Missing required environment configuration: CLIENT_URL, PUBLIC_URL, VITE_APP_PUBLIC_URL/,
    )
  })

  it('passes with all required production variables set', () => {
    stubProdMinimums()

    // May still warn about optional vars, but must not throw
    expect(() => validateRuntimeEnv()).not.toThrow()
  })

  // ---- Optional secrets / warnings -----------------------------------------

  it('warns about missing optional secrets in production', () => {
    stubProdMinimums()

    vi.stubEnv('REFRESH_TOKEN_SECRET', '')
    vi.stubEnv('VAULT_ENCRYPTION_KEY', '')
    vi.stubEnv('TRUST_PROXY', '')

    validateRuntimeEnv()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('REFRESH_TOKEN_SECRET is not configured'),
    )
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('VAULT_ENCRYPTION_KEY is not configured'),
    )
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('TRUST_PROXY is not configured'),
    )
  })

  it('does not warn about REFRESH_TOKEN_SECRET when it is configured', () => {
    stubProdMinimums()
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'some-secret')
    vi.stubEnv('VAULT_ENCRYPTION_KEY', '')
    vi.stubEnv('TRUST_PROXY', '')

    validateRuntimeEnv()

    const calls: string[] = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat()
    expect(calls.some((c) => c.includes('REFRESH_TOKEN_SECRET'))).toBe(false)
  })

  // ---- REGISTRATION_PROFILE_CAPTURE_ENABLED --------------------------------

  it('warns about invalid REGISTRATION_PROFILE_CAPTURE_ENABLED in production', () => {
    stubProdMinimums()
    vi.stubEnv('REGISTRATION_PROFILE_CAPTURE_ENABLED', 'maybe')

    validateRuntimeEnv()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'REGISTRATION_PROFILE_CAPTURE_ENABLED is set to an unrecognized value',
      ),
    )
  })

  it('does not warn when REGISTRATION_PROFILE_CAPTURE_ENABLED is "true"', () => {
    stubProdMinimums()
    vi.stubEnv('REGISTRATION_PROFILE_CAPTURE_ENABLED', 'true')

    validateRuntimeEnv()

    const calls: string[] = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat()
    expect(calls.some((c) => c.includes('REGISTRATION_PROFILE_CAPTURE_ENABLED'))).toBe(false)
  })

  it('does not warn when REGISTRATION_PROFILE_CAPTURE_ENABLED is "false"', () => {
    stubProdMinimums()
    vi.stubEnv('REGISTRATION_PROFILE_CAPTURE_ENABLED', 'false')

    validateRuntimeEnv()

    const calls: string[] = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat()
    expect(calls.some((c) => c.includes('REGISTRATION_PROFILE_CAPTURE_ENABLED'))).toBe(false)
  })

  // ---- URL template placeholders -------------------------------------------

  it('warns about missing {ip} placeholder in FREE_IP_API_URL_TEMPLATE', () => {
    stubProdMinimums()
    vi.stubEnv('FREE_IP_API_URL_TEMPLATE', 'http://api.com/lookup') // Missing {ip}

    validateRuntimeEnv()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('FREE_IP_API_URL_TEMPLATE should include the {ip} placeholder'),
    )
  })

  it('does not warn when FREE_IP_API_URL_TEMPLATE contains {ip}', () => {
    stubProdMinimums()
    vi.stubEnv('FREE_IP_API_URL_TEMPLATE', 'http://api.com/lookup/{ip}')

    validateRuntimeEnv()

    const calls: string[] = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.flat()
    expect(calls.some((c) => c.includes('FREE_IP_API_URL_TEMPLATE'))).toBe(false)
  })
})
