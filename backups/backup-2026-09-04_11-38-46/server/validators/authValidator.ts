import { z } from 'zod';

const USERNAME_PATTERN = /^[a-z0-9._-]+$/i;
const STRONG_PASSWORD_PATTERN =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+=\[\];:,.<>?{}|\-])\S{16,64}$/;

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

const deviceIdSchema = z.string().trim().min(1).max(128);
const captchaTokenSchema = z
  .string()
  .trim()
  .min(20, 'CAPTCHA token is invalid')
  .max(4096, 'CAPTCHA token is invalid');

export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
  masterKey: z.string().optional(),
  pqcSalt: z.string().trim().min(8).max(128).optional(),
  deviceId: deviceIdSchema.optional(),
  captchaToken: captchaTokenSchema,
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
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

export const masterKeyCaptchaSchema = z.object({
  captchaToken: captchaTokenSchema,
});

export const cloudUnlockCaptchaSchema = z.object({
  captchaToken: captchaTokenSchema,
});

const normalizeProfileName = z
  .string()
  .trim()
  .max(120, 'Profile name must be 120 characters or fewer')
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
      const mimeMatch = value.match(/^data:(image\/[a-zA-Z0-9.+\-]+);base64,/);
      if (!mimeMatch) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Profile photo data URI must be a base64-encoded image.',
        });
        return z.NEVER;
      }
      return value;
    }

    // Allow root-relative or relative paths (e.g. /api/avatar/raw/... or /uploads/...)
    // Explicitly disallow protocol-relative URLs (e.g. //attacker.com)
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
  .refine(
    (value) => typeof value.profileName === 'string' || typeof value.profilePhoto === 'string',
    {
      message: 'At least one profile field is required.',
      path: ['profileName'],
    },
  );
