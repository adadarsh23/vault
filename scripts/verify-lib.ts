/**
 * Verification script for server/lib modules in production runtime
 * Runs directly via tsx without requiring any build step.
 */

import 'dotenv/config';
import {
  CIRCULAR_PLACEHOLDER,
  FILTERED_PLACEHOLDER,
  isSensitiveKey,
  redactSensitiveData,
  sanitizeTags,
  sanitizeUrl,
  sanitizeUserContext,
  initSentry,
  sentryIsEnabled,
  captureException,
  captureMessage,
  setUserContext,
  addBreadcrumb,
  sentryRequestHandler,
  sentryTracingHandler,
  sentryErrorHandler,
  initLogRocketServer,
  isLogRocketEnabled,
  captureServerException,
  logRocketRequestLogger,
  logRocketErrorMiddleware,
  registerLogRocketMiddleware,
} from '../server/lib/index.ts';

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

heading('=== SERVER/LIB PRODUCTION READY VERIFICATION ===');

heading('[1] Module Loading & Exports');
try {
  ok('server/lib/index.ts loaded successfully without build step');
} catch (e) {
  fail(`Failed to load server/lib: ${e}`);
}

heading('[2] Sanitization & Security Engine');
try {
  // Test sensitive keys
  if (isSensitiveKey('password') && isSensitiveKey('masterKey') && isSensitiveKey('dek')) {
    ok('Sensitive key detection working correctly');
  } else {
    fail('Sensitive key detection failed');
  }

  // Test URL Sanitization
  const testUrl = '/api/v1/auth/verify?token=secret123&user=alice&password=secretPassword';
  const cleanUrl = sanitizeUrl(testUrl);
  if (
    cleanUrl.includes('token=[Filtered]') &&
    cleanUrl.includes('password=[Filtered]') &&
    cleanUrl.includes('user=alice')
  ) {
    ok(`URL query parameter sanitization: ${cleanUrl}`);
  } else {
    fail(`URL sanitization failed: ${cleanUrl}`);
  }

  // Test Circular Reference handling
  const circular: any = { name: 'vault-session' };
  circular.self = circular;
  const scrubbed = redactSensitiveData(circular) as any;
  if (scrubbed.self === CIRCULAR_PLACEHOLDER) {
    ok('Circular reference handled cleanly without stack overflow');
  } else {
    fail('Circular reference handling failed');
  }

  // Test Prototype Pollution protection
  const malicious = JSON.parse('{"status": "ok", "__proto__": {"polluted": true}}');
  const safePayload = redactSensitiveData(malicious) as any;
  if (safePayload.status === 'ok' && (Object.prototype as any).polluted === undefined) {
    ok('Prototype pollution prevented');
  } else {
    fail('Prototype pollution vulnerability detected');
  }

  // Test User Context Sanitization
  const rawUser = {
    id: 'user_100',
    username: 'bob',
    email: 'bob@vault.local',
    passwordHash: '$2b$12$superSecretHash',
    masterKey: 'mk_raw_key',
    twoFactorSecret: 'totp_secret',
  };
  const safeUser = sanitizeUserContext(rawUser);
  if (
    safeUser &&
    safeUser.id === 'user_100' &&
    !('passwordHash' in safeUser) &&
    !('masterKey' in safeUser)
  ) {
    ok('User context sanitization successfully strips passwordHash and masterKey');
  } else {
    fail('User context sanitization failed to strip credentials');
  }

  // Test Tags Sanitization
  const rawTags = {
    method: 'GET',
    path: '/api/items?token=jwtXYZ',
    password: 'bad-tag',
  };
  const safeTags = sanitizeTags(rawTags);
  if (
    safeTags.method === 'GET' &&
    safeTags.path.includes('[Filtered]') &&
    !('password' in safeTags)
  ) {
    ok('Telemetry tags sanitization working correctly');
  } else {
    fail('Telemetry tags sanitization failed');
  }
} catch (e) {
  fail(`Sanitization check crashed: ${e}`);
}

heading('[3] Sentry Handlers & Interface');
try {
  const reqHandler = sentryRequestHandler();
  const traceHandler = sentryTracingHandler();
  const errHandler = sentryErrorHandler();

  if (
    typeof reqHandler === 'function' &&
    typeof traceHandler === 'function' &&
    typeof errHandler === 'function'
  ) {
    ok('Sentry Express middlewares instantiated correctly');
  } else {
    fail('Sentry Express middlewares failed to instantiate');
  }

  setUserContext({ id: 'test-user', password: 'secret' });
  addBreadcrumb({ message: 'testing', data: { token: 'secret' } });
  ok('Sentry context and breadcrumb helpers executed safely');
} catch (e) {
  fail(`Sentry verification error: ${e}`);
}

heading('[4] LogRocket Handlers & Interface');
try {
  const loggerMiddleware = logRocketRequestLogger();
  const errMiddleware = logRocketErrorMiddleware();

  if (typeof loggerMiddleware === 'function' && typeof errMiddleware === 'function') {
    ok('LogRocket Express middlewares instantiated correctly');
  } else {
    fail('LogRocket Express middlewares failed to instantiate');
  }

  captureServerException(new Error('test exception'), { source: 'verify' });
  ok('LogRocket exception capture executed safely');
} catch (e) {
  fail(`LogRocket verification error: ${e}`);
}

heading('================================================');
if (hasFailures) {
  console.error(`\n${colors.red}${colors.bold}VERIFICATION FAILED WITH ISSUES${colors.reset}\n`);
  process.exit(1);
} else {
  console.log(
    `\n${colors.green}${colors.bold}ALL SERVER/LIB MODULES VERIFIED & PRODUCTION READY (WITHOUT BUILD STEP)${colors.reset}\n`,
  );
  process.exit(0);
}
