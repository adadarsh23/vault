/**
 * JWT Configuration Diagnostic Tool
 *
 * Helps debug JWT secret mismatches and token verification issues
 */

import jwt from 'jsonwebtoken'
import { logger } from './logger.ts'

const hasTokenType = (
  value: string | jwt.JwtPayload,
  expected: 'access' | 'refresh',
): boolean => typeof value === 'object' && value !== null && value.type === expected

/**
 * Validate JWT secrets are properly configured
 */
export const validateJwtSecrets = (): {
  isValid: boolean
  warnings: string[]
  errors: string[]
} => {
  const warnings: string[] = []
  const errors: string[] = []

  const jwtSecret = process.env.JWT_SECRET
  const refreshSecret = process.env.REFRESH_TOKEN_SECRET

  // Check if JWT_SECRET is set
  if (!jwtSecret) {
    errors.push('JWT_SECRET is required but not set')
  } else if (jwtSecret.length < 32) {
    errors.push(
      `JWT_SECRET is too short (${jwtSecret.length} chars). Minimum recommended: 32 chars`,
    )
  }

  // Check if REFRESH_TOKEN_SECRET is separate
  if (!refreshSecret) {
    warnings.push(
      'REFRESH_TOKEN_SECRET is not set. Falling back to JWT_SECRET (reduces token isolation)',
    )
  } else if (refreshSecret === jwtSecret) {
    warnings.push(
      'REFRESH_TOKEN_SECRET equals JWT_SECRET. Consider using separate secrets for better security',
    )
  } else if (refreshSecret.length < 32) {
    errors.push(
      `REFRESH_TOKEN_SECRET is too short (${refreshSecret.length} chars). Minimum recommended: 32 chars`,
    )
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  }
}

/**
 * Test JWT signing and verification
 */
export const testJwtSigningAndVerification = (): {
  success: boolean
  testResults: {
    accessToken: { sign: boolean; verify: boolean }
    refreshToken: { sign: boolean; verify: boolean }
  }
  errors: string[]
} => {
  const errors: string[] = []
  const testResults = {
    accessToken: { sign: false, verify: false },
    refreshToken: { sign: false, verify: false },
  }

  const jwtSecret = process.env.JWT_SECRET
  const refreshSecret = process.env.REFRESH_TOKEN_SECRET || jwtSecret

  try {
    // Test access token
    const accessTokenPayload = {
      sub: 'test-user-id',
      username: 'testuser',
      sessionId: 'test-session-id',
      type: 'access',
    }

    const accessToken = jwt.sign(accessTokenPayload, jwtSecret!, {
      expiresIn: '15m',
    })
    testResults.accessToken.sign = true

    try {
      const decoded = jwt.verify(accessToken, jwtSecret!)
      testResults.accessToken.verify = hasTokenType(decoded, 'access')
    } catch (e) {
      errors.push(`Access token verification failed: ${(e as Error).message}`)
    }

    // Test refresh token
    const refreshTokenPayload = {
      sub: 'test-user-id',
      username: 'testuser',
      sessionId: 'test-session-id',
      deviceId: 'test-device-id',
      type: 'refresh',
    }

    const refreshToken = jwt.sign(refreshTokenPayload, refreshSecret!, {
      expiresIn: '30d',
    })
    testResults.refreshToken.sign = true

    try {
      const decoded = jwt.verify(refreshToken, refreshSecret!)
      testResults.refreshToken.verify = hasTokenType(decoded, 'refresh')
    } catch (e) {
      errors.push(`Refresh token verification failed: ${(e as Error).message}`)
    }
  } catch (e) {
    errors.push(`JWT test failed: ${(e as Error).message}`)
  }

  const success =
    testResults.accessToken.sign &&
    testResults.accessToken.verify &&
    testResults.refreshToken.sign &&
    testResults.refreshToken.verify

  return {
    success,
    testResults,
    errors,
  }
}

/**
 * Log JWT configuration diagnostics
 */
export const logJwtDiagnostics = (): void => {
  logger.info('🔐 JWT Configuration Diagnostics', {
    nodeEnv: process.env.NODE_ENV,
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasRefreshSecret: !!process.env.REFRESH_TOKEN_SECRET,
    jwtSecretLength: process.env.JWT_SECRET?.length || 0,
    refreshSecretLength: process.env.REFRESH_TOKEN_SECRET?.length || 0,
  })

  const validation = validateJwtSecrets()
  if (validation.errors.length > 0) {
    logger.error('❌ JWT Configuration Errors:', { errors: validation.errors })
  }
  if (validation.warnings.length > 0) {
    logger.warn('⚠️  JWT Configuration Warnings:', {
      warnings: validation.warnings,
    })
  }

  const test = testJwtSigningAndVerification()
  logger.info('✓ JWT Signing & Verification Test', {
    accessTokenSign: test.testResults.accessToken.sign ? '✓' : '✗',
    accessTokenVerify: test.testResults.accessToken.verify ? '✓' : '✗',
    refreshTokenSign: test.testResults.refreshToken.sign ? '✓' : '✗',
    refreshTokenVerify: test.testResults.refreshToken.verify ? '✓' : '✗',
  })

  if (test.errors.length > 0) {
    logger.error('JWT Test Errors:', { errors: test.errors })
  }
}

/**
 * Check if a token's signature was created with JWT_SECRET vs REFRESH_TOKEN_SECRET
 */
export const diagnoseTokenSignature = (
  token: string,
): {
  isValidAccessSecret: boolean
  isValidRefreshSecret: boolean
  likelyType: 'access' | 'refresh' | 'unknown'
} => {
  const jwtSecret = process.env.JWT_SECRET
  const refreshSecret = process.env.REFRESH_TOKEN_SECRET || jwtSecret

  let isValidAccessSecret = false
  let isValidRefreshSecret = false

  try {
    jwt.verify(token, jwtSecret!, {
      ignoreExpiration: true,
    })
    isValidAccessSecret = true
  } catch (e) {
    // Not valid with JWT_SECRET
  }

  try {
    jwt.verify(token, refreshSecret!, {
      ignoreExpiration: true,
    })
    isValidRefreshSecret = true
  } catch (e) {
    // Not valid with REFRESH_TOKEN_SECRET
  }

  let likelyType: 'access' | 'refresh' | 'unknown' = 'unknown'
  try {
    const decoded = jwt.decode(token) as any
    if (decoded?.type === 'access') likelyType = 'access'
    else if (decoded?.type === 'refresh') likelyType = 'refresh'
  } catch (e) {
    // Can't decode
  }

  return {
    isValidAccessSecret,
    isValidRefreshSecret,
    likelyType,
  }
}
