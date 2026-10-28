/**
 * Production-ready Data Sanitizer & Redaction Engine
 *
 * Provides high-performance, circular-reference-safe, prototype-pollution-safe
 * data scrubbing for server logs, Sentry error events, LogRocket telemetry,
 * and request monitoring.
 *
 * @module server/lib/sanitizer
 */

export const FILTERED_PLACEHOLDER = '[Filtered]';
export const CIRCULAR_PLACEHOLDER = '[CircularReference]';
export const MAX_DEPTH_PLACEHOLDER = '[MaxDepthExceeded]';

/**
 * Pre-compiled regular expressions for high-performance sensitive pattern matching.
 */
const SENSITIVE_QUERY_PARAM_PATTERN =
  /((?:^|[?&])(?:auth_token|access_token|refresh_token|token|signature|sig|api_key|apikey|secret|key|password|passphrase|code|totp|dek|kek|salt|candidatepin|decoypin)=)[^&#]*/gi;

const BASIC_AUTH_PATTERN = /^(https?:\/\/)([^:@\s]+):([^@\s]+)@/i;

const SENSITIVE_KEY_SUBSTRING_PATTERN =
  /(?:password|token|authoriz|cookie|secret|private|masterkey|ciphertext|authtag|mnemonic|passphrase|totp|recovery|backup|dek|kek|salt|credential)/i;

/**
 * Common exact sensitive keys normalized to lowercase for O(1) set lookup.
 */
const SENSITIVE_KEYS_SET = new Set<string>([
  'password',
  'token',
  'authorization',
  'cookie',
  'set-cookie',
  'masterkey',
  'secret',
  'secretkey',
  'privatekey',
  'apikey',
  'ciphertext',
  'authtag',
  'iv',
  'payload',
  'binarypayload',
  'modernpayload',
  'dek',
  'kek',
  'mnemonic',
  'seedphrase',
  'passphrase',
  'pqcsalt',
  'salt',
  'totp',
  'totpsecret',
  'recoverycodes',
  'backupcodes',
  'twofactorsecret',
  'twofactorcode',
  'encryptedmetadata',
  'refreshtoken',
  'refreshtokenhash',
  'tokenfingerprint',
  'accesstoken',
  'clientsecret',
  'signature',
  'candidatepin',
  'decoypin',
  'decoypassword',
  'x-vault-key',
  'x-vault-metadata',
  'encryptionkey',
]);

const URL_LIKE_KEY_NAMES = new Set<string>([
  'url',
  'path',
  'originalurl',
  'referer',
  'referrer',
  'location',
]);

const DANGEROUS_PROTO_KEYS = new Set<string>(['__proto__', 'constructor', 'prototype']);

export interface RedactOptions {
  /** Text to substitute for sensitive field values (defaults to '[Filtered]') */
  placeholder?: string;
  /** Maximum recursion depth to prevent stack overflow or ReDoS (defaults to 8) */
  maxDepth?: number;
  /** Maximum array elements to inspect before truncating (defaults to 100) */
  maxArrayLength?: number;
  /** Custom additional sensitive keys (case-insensitive) */
  customSensitiveKeys?: string[];
}

/**
 * Checks whether a given property key is considered sensitive.
 */
export function isSensitiveKey(key: string, customKeys?: Set<string>): boolean {
  if (typeof key !== 'string') return false;
  const normalized = key.toLowerCase().trim();
  if (customKeys && customKeys.has(normalized)) return true;
  if (SENSITIVE_KEYS_SET.has(normalized)) return true;
  return SENSITIVE_KEY_SUBSTRING_PATTERN.test(normalized);
}

/**
 * Sanitizes URLs and request paths by redacting sensitive query parameters
 * and basic authentication credentials.
 */
export function sanitizeUrl(url: unknown, placeholder: string = FILTERED_PLACEHOLDER): string {
  if (typeof url !== 'string' || !url) {
    return typeof url === 'string' ? url : '';
  }

  let sanitized = url;

  // Redact basic auth username:password
  if (BASIC_AUTH_PATTERN.test(sanitized)) {
    sanitized = sanitized.replace(BASIC_AUTH_PATTERN, `$1$2:${placeholder}@`);
  }

  // Redact sensitive query parameters
  if (sanitized.includes('=')) {
    sanitized = sanitized.replace(SENSITIVE_QUERY_PARAM_PATTERN, `$1${placeholder}`);
  }

  return sanitized;
}

/**
 * Deeply sanitizes arbitrary data structures, scrubbing sensitive keys,
 * preventing prototype pollution, protecting against circular references,
 * and handling Error, Buffer, and Date objects safely.
 */
export function redactSensitiveData(input: unknown, options?: RedactOptions): unknown {
  const placeholder = options?.placeholder ?? FILTERED_PLACEHOLDER;
  const maxDepth = options?.maxDepth ?? 8;
  const maxArrayLength = options?.maxArrayLength ?? 100;
  const customKeys = options?.customSensitiveKeys
    ? new Set(options.customSensitiveKeys.map((k) => k.toLowerCase().trim()))
    : undefined;

  const seen = new WeakSet<object>();

  function walk(value: unknown, depth: number, keyHint?: string): unknown {
    // Return primitives directly
    if (value === null || value === undefined) return value;
    const valType = typeof value;
    if (valType === 'number' || valType === 'boolean' || valType === 'bigint') {
      return value;
    }

    if (valType === 'string') {
      const strVal = value as string;
      if (keyHint && URL_LIKE_KEY_NAMES.has(keyHint.toLowerCase())) {
        return sanitizeUrl(strVal, placeholder);
      }
      return strVal;
    }

    if (valType === 'function') {
      const fn = value as (...args: unknown[]) => unknown;
      return `[Function: ${fn.name || 'anonymous'}]`;
    }

    if (valType !== 'object') {
      return String(value);
    }

    // Handle circular reference
    const obj = value as object;
    if (seen.has(obj)) {
      return CIRCULAR_PLACEHOLDER;
    }

    // Guard recursion depth
    if (depth > maxDepth) {
      return MAX_DEPTH_PLACEHOLDER;
    }

    // Date preservation
    if (obj instanceof Date) {
      return Number.isNaN(obj.getTime()) ? 'Invalid Date' : new Date(obj.getTime());
    }

    // Buffer / TypedArray protection - avoid dumping binary memory
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(obj)) {
      return `[Buffer: ${obj.length} bytes]`;
    }
    if (ArrayBuffer.isView(obj)) {
      return `[TypedArray: ${obj.byteLength} bytes]`;
    }

    // Error handling - preserve name, message, stack, while sanitizing message & custom props
    if (obj instanceof Error) {
      seen.add(obj);
      const errorObj: Record<string, unknown> = {
        name: obj.name,
        message: sanitizeUrl(obj.message, placeholder),
        stack: obj.stack,
      };

      for (const [k, v] of Object.entries(obj)) {
        if (DANGEROUS_PROTO_KEYS.has(k)) continue;
        if (isSensitiveKey(k, customKeys)) {
          errorObj[k] = placeholder;
        } else {
          errorObj[k] = walk(v, depth + 1, k);
        }
      }
      return errorObj;
    }

    seen.add(obj);

    // Array handling
    if (Array.isArray(obj)) {
      const truncated = obj.slice(0, maxArrayLength);
      return truncated.map((item) => walk(item, depth + 1, keyHint));
    }

    // Plain object or general object handling
    const result: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(obj)) {
      // Prevent Prototype Pollution
      if (DANGEROUS_PROTO_KEYS.has(k)) {
        continue;
      }

      if (isSensitiveKey(k, customKeys)) {
        result[k] = placeholder;
        continue;
      }

      if (v && typeof v === 'object') {
        result[k] = walk(v, depth + 1, k);
      } else if (typeof v === 'string' && URL_LIKE_KEY_NAMES.has(k.toLowerCase())) {
        result[k] = sanitizeUrl(v, placeholder);
      } else {
        result[k] = walk(v, depth + 1, k);
      }
    }

    return result;
  }

  return walk(input, 0);
}

/**
 * Sanitizes a user object for logging or telemetry reporting.
 * Extracts only non-sensitive identity metadata and discards password hashes,
 * tokens, session keys, master keys, and salts.
 */
export function sanitizeUserContext(user: unknown): Record<string, unknown> | null {
  if (!user || typeof user !== 'object') {
    return null;
  }

  const userObj = user as Record<string, unknown>;
  const safeUser: Record<string, unknown> = {};

  const SAFE_IDENTITY_FIELDS = [
    'id',
    '_id',
    'userId',
    'username',
    'email',
    'role',
    'ip_address',
    'createdAt',
    'updatedAt',
  ];

  for (const field of SAFE_IDENTITY_FIELDS) {
    if (field in userObj && userObj[field] !== undefined) {
      const val = userObj[field];
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        safeUser[field] = val;
      } else if (val && typeof val === 'object' && 'toString' in val) {
        safeUser[field] = String(val);
      }
    }
  }

  return Object.keys(safeUser).length > 0 ? safeUser : null;
}

/**
 * Sanitizes and extracts flat telemetry tags suitable for LogRocket or Sentry tags.
 * Rejects non-primitive values, filters out sensitive keys, and redacts sensitive URLs.
 */
export function sanitizeTags(
  context: unknown,
  maxTagLength: number = 256,
): Record<string, string | number | boolean> {
  const tags: Record<string, string | number | boolean> = {};

  if (!context || typeof context !== 'object') {
    return tags;
  }

  for (const [key, value] of Object.entries(context as Record<string, unknown>)) {
    if (DANGEROUS_PROTO_KEYS.has(key)) continue;
    if (isSensitiveKey(key)) continue;

    if (typeof value === 'boolean' || typeof value === 'number') {
      tags[key] = value;
    } else if (typeof value === 'string') {
      const sanitized = URL_LIKE_KEY_NAMES.has(key.toLowerCase()) ? sanitizeUrl(value) : value;
      tags[key] =
        sanitized.length > maxTagLength ? `${sanitized.substring(0, maxTagLength)}...` : sanitized;
    }
  }

  return tags;
}
