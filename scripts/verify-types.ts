/**
 * Verification script for server/types in production runtime
 * Runs directly via tsx without requiring any build step.
 */

import 'dotenv/config';
import {
  isRecord,
  isNonEmptyString,
  isEncryptedFieldPayload,
  isEncryptedEnvelopePayload,
  isAuthenticatedUser,
  isAccessTokenPayload,
  isRefreshTokenPayload,
  isMfaTokenPayload,
  isVaultCategory,
  isFileCategory,
  isEncryptedCategory,
  isApiSuccessResponse,
  isApiErrorResponse,
  isSecurityContext,
  type EncryptedFieldPayload,
  type EncryptedEnvelopePayload,
  type AuthenticatedUser,
  type AccessTokenPayload,
  type RefreshTokenPayload,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type SecurityContext,
} from '../server/types/index.ts';

import * as requestTypesCompat from '../server/utils/requestTypes.ts';

const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

const heading = (title: string) =>
  console.log(`\n${colors.cyan}${colors.bold}${title}${colors.reset}`);
const ok = (msg: string) => console.log(`  ${colors.green}[OK]${colors.reset} ${msg}`);
const fail = (msg: string) => {
  console.error(`  ${colors.red}[FAIL]${colors.reset} ${msg}`);
  hasFailures = true;
};

let hasFailures = false;

heading('=== SERVER/TYPES PRODUCTION READY VERIFICATION ===');

heading('[1] Module Loading & Exports');
try {
  if (typeof isRecord === 'function' && typeof isEncryptedFieldPayload === 'function') {
    ok('server/types/index.ts loaded successfully without build step');
  } else {
    fail('server/types/index.ts exports missing functions');
  }
} catch (e) {
  fail(`Failed to load server/types: ${e}`);
}

heading('[2] Backwards Compatibility Re-exports');
try {
  if (
    typeof requestTypesCompat.isAuthenticatedUser === 'function' &&
    typeof requestTypesCompat.isVaultCategory === 'function'
  ) {
    ok('server/utils/requestTypes.ts re-exports server/types seamlessly');
  } else {
    fail('server/utils/requestTypes.ts compatibility re-exports failed');
  }
} catch (e) {
  fail(`Failed to load server/utils/requestTypes.ts: ${e}`);
}

heading('[3] Cryptographic Payload Guards');
try {
  const samplePayload: EncryptedFieldPayload = {
    cipherText: 'enc_sample_data',
    iv: 'iv_sample_12b',
    authTag: 'tag_sample_16b',
    algorithm: 'aes-256-gcm',
    keyVersion: 'v1',
  };

  if (isEncryptedFieldPayload(samplePayload)) {
    ok('AES-256-GCM EncryptedFieldPayload guard passes valid structure');
  } else {
    fail('EncryptedFieldPayload guard rejected valid structure');
  }

  if (!isEncryptedFieldPayload({ cipherText: 'only_cipher' })) {
    ok('EncryptedFieldPayload guard successfully rejects incomplete structure');
  } else {
    fail('EncryptedFieldPayload guard accepted incomplete structure');
  }

  const sampleEnvelope: EncryptedEnvelopePayload = {
    algorithm: 'aes-256-gcm',
    iv: 'sample_iv',
    authTag: 'sample_tag',
    cipherText: 'sample_cipher',
    wrappedDek: 'sample_wrapped_dek',
    wrapIv: 'sample_wrap_iv',
    wrapTag: 'sample_wrap_tag',
    keyVersion: 'v1',
    keyId: 'master_key_1',
  };

  if (isEncryptedEnvelopePayload(sampleEnvelope)) {
    ok('Modern Envelope Encryption payload guard passes valid structure');
  } else {
    fail('Envelope Encryption payload guard rejected valid structure');
  }
} catch (e) {
  fail(`Cryptographic guard verification threw error: ${e}`);
}

heading('[4] Authentication & Principal Guards');
try {
  const sampleUser: AuthenticatedUser = {
    userId: 'usr_64bf91',
    username: 'alice',
    sessionId: 'sess_123',
    role: 'user',
  };

  if (isAuthenticatedUser(sampleUser)) {
    ok('AuthenticatedUser guard correctly verifies user principal');
  } else {
    fail('AuthenticatedUser guard failed on valid principal');
  }

  const sampleAccessJwt: AccessTokenPayload = {
    sub: 'usr_64bf91',
    username: 'alice',
    sessionId: 'sess_123',
    type: 'access',
  };

  const sampleRefreshJwt: RefreshTokenPayload = {
    sub: 'usr_64bf91',
    username: 'alice',
    sessionId: 'sess_123',
    deviceId: 'dev_iphone_15',
    type: 'refresh',
  };

  if (isAccessTokenPayload(sampleAccessJwt) && !isAccessTokenPayload(sampleRefreshJwt)) {
    ok('JWT Access Token discriminator works accurately');
  } else {
    fail('JWT Access Token discriminator failed');
  }

  if (isRefreshTokenPayload(sampleRefreshJwt) && !isRefreshTokenPayload(sampleAccessJwt)) {
    ok('JWT Refresh Token discriminator works accurately');
  } else {
    fail('JWT Refresh Token discriminator failed');
  }
} catch (e) {
  fail(`Auth guard verification threw error: ${e}`);
}

heading('[5] Vault Taxonomy & Classification');
try {
  const categories = ['photo', 'video', 'audio', 'document', 'note', 'password', 'wifi'];
  const allValid = categories.every(isVaultCategory);
  const fileValid = isFileCategory('photo') && !isFileCategory('note');
  const encValid = isEncryptedCategory('note') && !isEncryptedCategory('photo');

  if (allValid && fileValid && encValid) {
    ok('VaultCategory, FileCategory, and EncryptedCategory taxonomies verified');
  } else {
    fail('Category taxonomy validation failed');
  }
} catch (e) {
  fail(`Category taxonomy verification threw error: ${e}`);
}

heading('[6] API Contracts & Security Context');
try {
  const successRes: ApiSuccessResponse<{ test: boolean }> = {
    success: true,
    message: 'Action succeeded',
    data: { test: true },
  };

  const errorRes: ApiErrorResponse = {
    success: false,
    message: 'Access denied',
    error: {
      code: 'UNAUTHORIZED',
      requestId: 'req_test_123',
    },
  };

  if (isApiSuccessResponse(successRes) && isApiErrorResponse(errorRes)) {
    ok('ApiSuccessResponse and ApiErrorResponse shapes validated');
  } else {
    fail('API response contract verification failed');
  }

  const secContext: SecurityContext = {
    requestId: 'req_sec_456',
    fingerprint: 'fp_abc123',
    riskScore: 5,
    anomalies: [],
    recommendedAction: 'allow',
  };

  if (isSecurityContext(secContext)) {
    ok('SecurityContext structure validated');
  } else {
    fail('SecurityContext guard rejected valid context');
  }
} catch (e) {
  fail(`API/Security verification threw error: ${e}`);
}

heading('================================================');
if (hasFailures) {
  console.error(`\n${colors.red}${colors.bold}VERIFICATION FAILED WITH ERRORS${colors.reset}\n`);
  process.exit(1);
} else {
  console.log(
    `\n${colors.green}${colors.bold}ALL SERVER/TYPES MODULES VERIFIED & PRODUCTION READY (WITHOUT BUILD STEP)${colors.reset}\n`,
  );
  process.exit(0);
}
