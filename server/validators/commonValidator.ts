import { z } from 'zod';

export const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
export const SAFE_ID_PATTERN = /^[a-zA-Z0-9:_-]+$/;
export const DEVICE_ID_PATTERN = /^[a-zA-Z0-9._:-]+$/;
export const USERNAME_PATTERN = /^[a-z0-9._-]+$/i;
export const HASH_HEX_64_PATTERN = /^[a-fA-F0-9]{64}$/;
export const HASH_HEX_32_128_PATTERN = /^[a-fA-F0-9]{32,128}$/;
export const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
export const NO_CONTROL_CHARS_PATTERN = /^[^\u0000-\u001f\u007f]*$/;

/**
 * Checks recursively if an object or any of its nested children contain
 * prototype-pollution keys (__proto__, constructor, prototype).
 */
export const hasPrototypePollutionKey = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasPrototypePollutionKey(item));
  }

  // Detect prototype tampering where prototype is altered
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype && proto !== Array.prototype) {
    return true;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.getOwnPropertyNames(record);

  for (const key of keys) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return true;
    }
    const child = record[key];
    if (typeof child === 'object' && child !== null && hasPrototypePollutionKey(child)) {
      return true;
    }
  }

  return false;
};

/**
 * Checks recursively if an object contains keys starting with '$' (MongoDB query operators),
 * protecting against NoSQL injection via untrusted object payloads.
 */
export const hasNoSqlOperatorKey = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasNoSqlOperatorKey(item));
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);

  for (const key of keys) {
    if (key.startsWith('$')) {
      return true;
    }
    const child = record[key];
    if (typeof child === 'object' && child !== null && hasNoSqlOperatorKey(child)) {
      return true;
    }
  }

  return false;
};

/**
 * MongoDB ObjectId schema validating a 24-character hexadecimal string.
 */
export const objectIdSchema = z
  .string()
  .trim()
  .regex(OBJECT_ID_PATTERN, 'Invalid MongoDB ObjectId format');

/**
 * Safe identifier schema allowing letters, numbers, colons, underscores, and hyphens.
 */
export const safeIdSchema = z
  .string()
  .trim()
  .min(1, 'Identifier is required')
  .max(256, 'Identifier must not exceed 256 characters')
  .regex(SAFE_ID_PATTERN, 'Identifier contains unsupported characters');

/**
 * Device identifier schema.
 */
export const deviceIdSchema = z
  .string()
  .trim()
  .min(1, 'deviceId is required')
  .max(128, 'deviceId must not exceed 128 characters')
  .regex(DEVICE_ID_PATTERN, 'deviceId format is invalid');

/**
 * CAPTCHA token schema.
 */
export const captchaTokenSchema = z
  .string()
  .trim()
  .min(20, 'CAPTCHA token is invalid')
  .max(4096, 'CAPTCHA token is invalid');

/**
 * Safe string schema rejecting control characters and null bytes.
 */
export const createSafeStringSchema = (min = 1, max = 256, fieldName = 'Field') =>
  z
    .string()
    .min(min, `${fieldName} must be at least ${min} character(s)`)
    .max(max, `${fieldName} must not exceed ${max} characters`)
    .refine(
      (val) => NO_CONTROL_CHARS_PATTERN.test(val),
      `${fieldName} contains invalid control characters`,
    );

/**
 * Base64 string schema with bounded size.
 */
export const createBase64Schema = (maxBytes = 8192, fieldName = 'Base64 payload') =>
  z
    .string()
    .trim()
    .min(1, `${fieldName} is required`)
    .max(maxBytes, `${fieldName} exceeds maximum size of ${maxBytes} bytes`)
    .refine((val) => BASE64_PATTERN.test(val), `${fieldName} must be valid base64`);

/**
 * Hex hash schema for cryptographic checksums (e.g., SHA-256).
 */
export const sha256HexSchema = z
  .string()
  .trim()
  .regex(HASH_HEX_64_PATTERN, 'Must be a valid 64-character hex SHA-256 hash');

/**
 * Reusable pagination query schema.
 */
export const paginationQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int('limit must be an integer')
      .min(1, 'limit must be between 1 and 1000')
      .max(1000, 'limit must be between 1 and 1000')
      .default(50),
    skip: z.coerce
      .number()
      .int('skip must be an integer')
      .min(0, 'skip must be at least 0')
      .max(1000000, 'skip must not exceed 1000000')
      .default(0),
    cursor: z.string().trim().max(256).optional(),
  })
  .strict();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
