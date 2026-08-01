import { z } from "zod";

const captchaTokenSchema = z
  .string()
  .trim()
  .min(20, "CAPTCHA token is invalid")
  .max(4096, "CAPTCHA token is invalid");

const deviceIdSchema = z.string().trim().min(1).max(128);

const otpTokenSchema = z
  .string()
  .trim()
  .min(1, "OTP token is required")
  .max(32, "OTP token is invalid")
  .regex(/^\d{6}$|^[A-Za-z0-9]{8}$/, "OTP token format is invalid");

export const login2FASchema = z.object({
  userId: z.string().trim().min(1, "UserId is required").max(128),
  token: otpTokenSchema,
  mfaToken: z.string().trim().min(1, "MFA token is required").max(2048),
  deviceId: deviceIdSchema.optional(),
  captchaToken: captchaTokenSchema.optional(),
});

export const twoFactorTokenSchema = z.object({
  token: otpTokenSchema,
});
