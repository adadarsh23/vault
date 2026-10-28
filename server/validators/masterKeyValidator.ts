import { z } from 'zod';
import {
  deviceIdSchema,
  hasPrototypePollutionKey,
  hasNoSqlOperatorKey,
  BASE64_PATTERN,
} from './commonValidator.ts';

const base64Field = (maxLen = 8192, name = 'Field') =>
  z
    .string()
    .trim()
    .min(1, `${name} is required`)
    .max(maxLen, `${name} must not exceed ${maxLen} characters`)
    .refine((val) => BASE64_PATTERN.test(val), `${name} must be valid base64`);

const derivationParamsSchema = z
  .object({
    memory: z.number().int().min(8192).max(1048576).optional(),
    iterations: z.number().int().min(1).max(12).optional(),
    parallelism: z.number().int().min(1).max(32).optional(),
  })
  .strict();

export const saveMasterKeySchema = z
  .object({
    encryptedMasterKey: z
      .object({
        cipherText: base64Field(8192, 'cipherText'),
        iv: base64Field(256, 'iv'),
        authTag: base64Field(256, 'authTag'),
        salt: base64Field(256, 'salt'),
        algorithm: z.string().trim().max(64).optional(),
        keyVersion: z.string().trim().max(32).optional(),
      })
      .strict(),
    masterKeyHash: z
      .string()
      .trim()
      .min(16, 'masterKeyHash is required')
      .max(256, 'masterKeyHash must not exceed 256 characters'),
    deviceId: deviceIdSchema,
    password: z.string().max(128).optional(),
    masterKey: z.string().max(128).optional(),
    recoveryPhrasesEncrypted: z.string().max(32768).optional(),
    metadata: z
      .object({
        derivationAlgorithm: z.string().trim().max(64).optional(),
        derivationParams: derivationParamsSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((val) => !hasPrototypePollutionKey(val) && !hasNoSqlOperatorKey(val), {
    message: 'Payload contains forbidden keys',
  });

export const retrieveMasterKeyQuerySchema = z
  .object({
    deviceId: deviceIdSchema,
  })
  .strict();

export const verifyMasterKeySchema = z
  .object({
    masterKeyHash: z
      .string()
      .trim()
      .min(16, 'masterKeyHash is required')
      .max(256, 'masterKeyHash must not exceed 256 characters'),
  })
  .strict();

export const deleteMasterKeySchema = z
  .object({
    deviceId: deviceIdSchema.optional(),
  })
  .strict();

export type SaveMasterKeyInput = z.infer<typeof saveMasterKeySchema>;
export type RetrieveMasterKeyQueryInput = z.infer<typeof retrieveMasterKeyQuerySchema>;
export type VerifyMasterKeyInput = z.infer<typeof verifyMasterKeySchema>;
export type DeleteMasterKeyInput = z.infer<typeof deleteMasterKeySchema>;
