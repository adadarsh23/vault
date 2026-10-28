import { z } from 'zod';
import { objectIdSchema, hasPrototypePollutionKey } from './commonValidator.ts';

/**
 * Schema for marking notifications as read.
 * If id is omitted, marks all notifications for user as read.
 */
export const markNotificationReadSchema = z
  .object({
    id: objectIdSchema.optional(),
  })
  .strict()
  .refine((val) => !hasPrototypePollutionKey(val), {
    message: 'Payload contains forbidden keys',
  });

/**
 * Schema for notification route parameters with ID (:id).
 */
export const notificationParamSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

/**
 * Schema for deleting a specific notification via body.
 */
export const deleteNotificationBodySchema = z
  .object({
    id: objectIdSchema,
  })
  .strict()
  .refine((val) => !hasPrototypePollutionKey(val), {
    message: 'Payload contains forbidden keys',
  });

export type MarkNotificationReadInput = z.infer<typeof markNotificationReadSchema>;
export type NotificationParamInput = z.infer<typeof notificationParamSchema>;
export type DeleteNotificationBodyInput = z.infer<typeof deleteNotificationBodySchema>;
