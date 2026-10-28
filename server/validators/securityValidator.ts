import { z } from 'zod';
import {
  objectIdSchema,
  safeIdSchema,
  hasPrototypePollutionKey,
  hasNoSqlOperatorKey,
  NO_CONTROL_CHARS_PATTERN,
} from './commonValidator.ts';
import { otpTokenSchema } from './twoFactorValidator.ts';

export const ANOMALY_STATUSES = ['investigating', 'resolved', 'false_positive'] as const;
export type AnomalyStatus = (typeof ANOMALY_STATUSES)[number];

/**
 * Schema for elevated session verification.
 */
export const elevatedLoginVerifySchema = z
  .object({
    password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
  })
  .strict();

/**
 * Schema for MFA device verification.
 */
export const deviceVerifyBodySchema = z
  .object({
    token: otpTokenSchema,
  })
  .strict()
  .refine((val) => !hasPrototypePollutionKey(val), {
    message: 'Payload contains forbidden keys',
  });

/**
 * Schema for updating anomaly status (Admin).
 */
export const anomalyStatusUpdateSchema = z
  .object({
    status: z.enum(ANOMALY_STATUSES),
    notes: z
      .string()
      .trim()
      .max(1000, 'Notes must not exceed 1000 characters')
      .refine(
        (val) => NO_CONTROL_CHARS_PATTERN.test(val),
        'Notes contains invalid control characters',
      )
      .optional(),
  })
  .strict()
  .refine((val) => !hasPrototypePollutionKey(val) && !hasNoSqlOperatorKey(val), {
    message: 'Payload contains forbidden keys',
  });

/**
 * Schema for admin account lock action.
 */
export const lockAccountSchema = z
  .object({
    userId: objectIdSchema,
    reason: z
      .string()
      .trim()
      .min(1, 'Reason is required')
      .max(500, 'Reason must not exceed 500 characters')
      .refine(
        (val) => NO_CONTROL_CHARS_PATTERN.test(val),
        'Reason contains invalid control characters',
      ),
  })
  .strict()
  .refine((val) => !hasPrototypePollutionKey(val) && !hasNoSqlOperatorKey(val), {
    message: 'Payload contains forbidden keys',
  });

/**
 * Schema for anomaly parameter in admin routes (:anomalyId).
 */
export const anomalyParamSchema = z
  .object({
    anomalyId: safeIdSchema,
  })
  .strict();

export type ElevatedLoginVerifyInput = z.infer<typeof elevatedLoginVerifySchema>;
export type DeviceVerifyBodyInput = z.infer<typeof deviceVerifyBodySchema>;
export type AnomalyStatusUpdateInput = z.infer<typeof anomalyStatusUpdateSchema>;
export type LockAccountInput = z.infer<typeof lockAccountSchema>;
export type AnomalyParamInput = z.infer<typeof anomalyParamSchema>;
