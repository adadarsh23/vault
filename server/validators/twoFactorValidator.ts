import { z } from 'zod';
import {
  captchaTokenSchema,
  deviceIdSchema,
  objectIdSchema,
  hasPrototypePollutionKey,
} from './commonValidator.ts';

export const otpTokenSchema = z
  .string()
  .trim()
  .min(1, 'OTP token is required')
  .max(32, 'OTP token is invalid')
  .regex(/^\d{6}$|^[A-Za-z0-9]{8}$/, 'OTP token format is invalid');

export const login2FASchema = z
  .object({
    userId: objectIdSchema,
    token: otpTokenSchema,
    mfaToken: z.string().trim().min(1, 'MFA token is required').max(2048),
    deviceId: deviceIdSchema.optional(),
    captchaToken: captchaTokenSchema.optional(),
  })
  .strict()
  .refine((val) => !hasPrototypePollutionKey(val), {
    message: 'Payload contains forbidden keys',
  });

export const twoFactorTokenSchema = z
  .object({
    token: otpTokenSchema,
  })
  .strict()
  .refine((val) => !hasPrototypePollutionKey(val), {
    message: 'Payload contains forbidden keys',
  });

export type Login2FAInput = z.infer<typeof login2FASchema>;
export type TwoFactorTokenInput = z.infer<typeof twoFactorTokenSchema>;
