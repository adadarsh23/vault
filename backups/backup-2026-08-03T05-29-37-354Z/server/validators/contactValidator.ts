import { z } from 'zod';

const USERNAME_PATTERN = /^[a-z0-9._-]+$/i;

const CONTACT_SUBJECTS = [
  'General Inquiry',
  'Technical Support',
  'Security Vulnerability',
  'Vault Access',
  'Feature Request',
  'Privacy Request',
  'Other',
] as const;

const captchaTokenSchema = z
  .string()
  .trim()
  .min(20, 'CAPTCHA token is invalid')
  .max(4096, 'CAPTCHA token is invalid');

export const contactSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Full name must be between 2 and 100 characters.')
      .max(100, 'Full name must be between 2 and 100 characters.'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('A valid email address is required.')
      .max(254, 'A valid email address is required.'),
    username: z
      .string()
      .trim()
      .min(3, 'Username must be 3 to 64 characters.')
      .max(64, 'Username must be 3 to 64 characters.')
      .regex(
        USERNAME_PATTERN,
        'Username can only include letters, numbers, dots, underscores, and hyphens.'
      ),
    subject: z
      .string()
      .refine(
        (value): value is (typeof CONTACT_SUBJECTS)[number] =>
          CONTACT_SUBJECTS.includes(value as (typeof CONTACT_SUBJECTS)[number]),
        'Please select a valid query category.'
      ),
    message: z
      .string()
      .trim()
      .min(10, 'Message must be between 10 and 2000 characters.')
      .max(2000, 'Message must be between 10 and 2000 characters.'),
    captchaToken: captchaTokenSchema,
  })
  .strict();

export type ContactRequestInput = z.infer<typeof contactSchema>;
