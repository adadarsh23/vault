import { z } from 'zod';
import {
  safeIdSchema,
  hasPrototypePollutionKey,
  hasNoSqlOperatorKey,
  HASH_HEX_32_128_PATTERN,
  NO_CONTROL_CHARS_PATTERN,
} from './commonValidator.ts';
import { ALL_VAULT_CATEGORIES } from './requestChainValidator.ts';

export const INTEGRITY_HASH_ALGORITHMS = ['blake3', 'sha512', 'sha256'] as const;
export type IntegrityHashAlgorithm = (typeof INTEGRITY_HASH_ALGORITHMS)[number];

/**
 * Schema for creating a new vault folder.
 */
export const createFolderSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Folder name is required')
      .max(100, 'Folder name must not exceed 100 characters')
      .refine(
        (val) => NO_CONTROL_CHARS_PATTERN.test(val),
        'Folder name contains invalid control characters',
      ),
    itemType: z
      .string()
      .trim()
      .min(1, 'itemType is required')
      .max(64, 'itemType must not exceed 64 characters'),
    parentId: z.string().trim().max(256).nullable().optional(),
  })
  .strict()
  .refine((val) => !hasPrototypePollutionKey(val), {
    message: 'Payload contains forbidden keys',
  });

/**
 * Schema for folder deletion query parameters.
 */
export const deleteFolderQuerySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Folder name must not exceed 100 characters')
      .refine(
        (val) => NO_CONTROL_CHARS_PATTERN.test(val),
        'Folder name contains invalid control characters',
      ),
    itemType: z
      .string()
      .trim()
      .min(1, 'itemType is required')
      .max(64, 'itemType must not exceed 64 characters'),
  })
  .strict();

/**
 * Schema for vault item category validation.
 */
export const vaultCategorySchema = z.enum(ALL_VAULT_CATEGORIES);

/**
 * Schema for vault signed URL query parameters.
 */
export const signedUrlQuerySchema = z
  .object({
    expiresIn: z.coerce
      .number()
      .int('expiresIn must be an integer')
      .min(1, 'expiresIn must be at least 1 second')
      .max(86400, 'expiresIn must not exceed 86400 seconds (24 hours)')
      .optional(),
    download: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((val) => val === true || val === 'true')
      .optional(),
  })
  .strict();

/**
 * Schema for running vault integrity audit.
 */
export const verifyIntegritySchema = z
  .object({
    algorithm: z.enum(INTEGRITY_HASH_ALGORITHMS).default('blake3'),
  })
  .strict();

/**
 * Schema for reporting vault item tampering / corruption.
 */
export const reportTamperSchema = z
  .object({
    itemId: safeIdSchema,
    expectedHash: z
      .string()
      .trim()
      .regex(
        HASH_HEX_32_128_PATTERN,
        'expectedHash must be a valid hex hash string (32-128 chars)',
      ),
    actualHash: z
      .string()
      .trim()
      .regex(HASH_HEX_32_128_PATTERN, 'actualHash must be a valid hex hash string (32-128 chars)'),
    details: z
      .record(z.string(), z.unknown())
      .optional()
      .refine((val) => !val || (!hasPrototypePollutionKey(val) && !hasNoSqlOperatorKey(val)), {
        message: 'details contains forbidden keys or query operators',
      }),
  })
  .strict();

/**
 * Schema for DRM / CENC key request parameters.
 */
export const cencKeyParamsSchema = z
  .object({
    itemId: safeIdSchema,
    kid: z
      .string()
      .trim()
      .min(1, 'kid is required')
      .max(128, 'kid must not exceed 128 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'kid contains unsupported characters'),
  })
  .strict();

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type DeleteFolderQueryInput = z.infer<typeof deleteFolderQuerySchema>;
export type SignedUrlQueryInput = z.infer<typeof signedUrlQuerySchema>;
export type VerifyIntegrityInput = z.infer<typeof verifyIntegritySchema>;
export type ReportTamperInput = z.infer<typeof reportTamperSchema>;
export type CencKeyParamsInput = z.infer<typeof cencKeyParamsSchema>;
