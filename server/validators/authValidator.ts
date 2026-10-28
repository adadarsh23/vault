import { z } from 'zod';
import {
  USERNAME_PATTERN,
  deviceIdSchema,
  captchaTokenSchema,
  hasPrototypePollutionKey,
} from './commonValidator.ts';

export const STRONG_PASSWORD_PATTERN =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+=\[\];:,.<>?{}|\-])\S{16,128}$/;

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.normalize('NFKC'))
  .refine((v) => v.length >= 3, 'Username must be at least 3 characters')
  .refine((v) => v.length <= 64, 'Username must be at most 64 characters')
  .refine(
    (v) => USERNAME_PATTERN.test(v),
    'Username can only include letters, numbers, dots, underscores, and hyphens',
  );

const passwordSchema = z
  .string()
  .transform((v) => v.normalize('NFKC'))
  .refine((v) => v.length >= 16, 'Password must be at least 16 characters')
  .refine((v) => v.length <= 128, 'Password must be at most 128 characters')
  .refine(
    (v) => STRONG_PASSWORD_PATTERN.test(v),
    'Password must include uppercase, lowercase, number, and special character, and cannot contain spaces',
  );

const masterKeySchema = z
  .string()
  .transform((v) => v.normalize('NFKC'))
  .refine((v) => v.length >= 16, 'Master Key must be at least 16 characters')
  .refine((v) => v.length <= 128, 'Master Key must be at most 128 characters')
  .refine(
    (v) => STRONG_PASSWORD_PATTERN.test(v),
    'Master Key must include uppercase, lowercase, number, and special character, and cannot contain spaces',
  );

export const loginSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
    masterKey: z.string().max(128, 'Master Key is too long').optional(),
    pqcSalt: z.string().trim().min(8).max(128).optional(),
    deviceId: deviceIdSchema.optional(),
    captchaToken: captchaTokenSchema,
  })
  .strict()
  .refine((val) => !hasPrototypePollutionKey(val), {
    message: 'Payload contains forbidden keys',
  });

export const registerSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    masterKey: masterKeySchema,
    pqcSalt: z.string().trim().min(8).max(128).optional(),
    deviceId: deviceIdSchema.optional(),
    captchaToken: captchaTokenSchema,
  })
  .strict()
  .refine((val) => !hasPrototypePollutionKey(val), {
    message: 'Payload contains forbidden keys',
  })
  .refine((data) => data.password !== data.masterKey, {
    message: 'Account password and Master Key must not be identical',
    path: ['masterKey'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Current password is required')
      .max(128, 'Current password is too long'),
    newPassword: passwordSchema,
    captchaToken: captchaTokenSchema,
  })
  .strict()
  .refine((val) => !hasPrototypePollutionKey(val), {
    message: 'Payload contains forbidden keys',
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

export const masterKeyCaptchaSchema = z
  .object({
    captchaToken: captchaTokenSchema,
  })
  .strict();

export const cloudUnlockCaptchaSchema = z
  .object({
    captchaToken: captchaTokenSchema,
  })
  .strict();

const normalizeProfileName = z
  .string()
  .trim()
  .max(120, 'Profile name must be 120 characters or fewer')
  .refine(
    (val) => !/[\u0000-\u001f\u007f]/.test(val),
    'Profile name contains invalid control characters',
  )
  .transform((value) => (value.length === 0 ? 'none' : value));

// ~50M chars covers up to ~35 MB image file encoded as base64
const MAX_PROFILE_PHOTO_LENGTH = 50_000_000;

const normalizeProfilePhoto = z
  .string()
  .trim()
  .max(MAX_PROFILE_PHOTO_LENGTH, 'Profile photo is too large (max ~35 MB).')
  .transform((value, ctx) => {
    if (value.length === 0 || value.toLowerCase() === 'none') {
      return 'none';
    }

    // Explicitly disallow protocol-relative URLs (e.g. //attacker.com)
    if (value.startsWith('//')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Protocol-relative URLs are not allowed.',
      });
      return z.NEVER;
    }

    // Disallow path traversal attempts
    if (value.includes('..')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Path traversal sequences are not allowed.',
      });
      return z.NEVER;
    }

    if (!value.startsWith('data:image/') && value.length > 2048) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Profile photo URL cannot exceed 2048 characters.',
      });
      return z.NEVER;
    }

    // Allow base64 data URIs for locally-uploaded images
    if (value.startsWith('data:image/')) {
      // Only permit safe image MIME types
      const mimeMatch = value.match(/^data:(image\/(?:png|jpeg|jpg|webp|avif|gif));base64,/i);
      if (!mimeMatch) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Profile photo data URI must be a valid base64-encoded image (png, jpeg, webp, avif, or gif).',
        });
        return z.NEVER;
      }
      return value;
    }

    // Allow safe root-relative or relative paths (e.g. /api/avatar/raw/... or ./uploads/...)
    if ((value.startsWith('/') && !value.startsWith('//')) || value.startsWith('./')) {
      return value;
    }

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Profile photo must be a valid HTTP/HTTPS URL, a base64 data URI, or "none".',
      });
      return z.NEVER;
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Profile photo URL must use HTTP or HTTPS (or upload a file directly).',
      });
      return z.NEVER;
    }

    return parsed.toString();
  });

export const updateProfileSchema = z
  .object({
    profileName: normalizeProfileName.optional(),
    profilePhoto: normalizeProfilePhoto.optional(),
  })
  .strict()
  .refine((val) => !hasPrototypePollutionKey(val), {
    message: 'Payload contains forbidden keys',
  })
  .refine(
    (value) => typeof value.profileName === 'string' || typeof value.profilePhoto === 'string',
    {
      message: 'At least one profile field is required.',
      path: ['profileName'],
    },
  );

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type MasterKeyCaptchaInput = z.infer<typeof masterKeyCaptchaSchema>;
export type CloudUnlockCaptchaInput = z.infer<typeof cloudUnlockCaptchaSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
