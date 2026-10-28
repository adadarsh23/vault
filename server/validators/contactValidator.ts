import { z } from 'zod';
import {
  USERNAME_PATTERN,
  captchaTokenSchema,
  hasPrototypePollutionKey,
} from './commonValidator.ts';

export const CONTACT_SUBJECTS = [
  'General Inquiry',
  'Technical Support',
  'Security Vulnerability',
  'Vault Access',
  'Feature Request',
  'Privacy Request',
  'Other',
] as const;

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];

export const contactSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Full name must be between 2 and 100 characters.')
      .max(100, 'Full name must be between 2 and 100 characters.')
      .refine(
        (v) => !/[\u0000-\u001f\u007f]/.test(v),
        'Full name contains invalid control characters.',
      ),
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
        'Username can only include letters, numbers, dots, underscores, and hyphens.',
      ),
    subject: z
      .string()
      .refine(
        (value): value is ContactSubject => CONTACT_SUBJECTS.includes(value as ContactSubject),
        'Please select a valid query category.',
      ),
    message: z
      .string()
      .trim()
      .min(10, 'Message must be between 10 and 2000 characters.')
      .max(2000, 'Message must be between 10 and 2000 characters.')
      .refine((v) => !/[\u0000]/.test(v), 'Message contains null byte characters.'),
    captchaToken: captchaTokenSchema,
  })
  .strict()
  .refine((val) => !hasPrototypePollutionKey(val), {
    message: 'Payload contains forbidden keys',
  });

export type ContactRequestInput = z.infer<typeof contactSchema>;
