/**
 * Replacement functions for improved activity logging
 * Use these to replace the inline logging in vaultService.ts
 */

import { saveActivityLog } from './activityLogService.ts';
import { logger } from '../utils/logger.ts';
import { emitVaultEvent } from '../socket.ts';

/**
 * Logs activity event to dedicated ActivityLog collection
 * Each log is encrypted and saved individually
 * Async function - fire and forget with error handling
 *
 * @param userId - User ID
 * @param action - Action performed
 * @param category - Vault category
 * @param itemId - Item ID (if applicable)
 * @param details - Additional details to encrypt
 */
export const logActivityAsync = async (
  userId: string,
  username: string,
  action: string,
  category: string,
  itemId: string | null,
  details: Record<string, unknown>
): Promise<void> => {
  try {
    // Save to activity log collection (encrypted, one by one)
    await saveActivityLog({
      userId,
      username,
      action: action as any,
      category,
      itemId: itemId || undefined,
      deviceId: typeof details.deviceId === 'string' ? details.deviceId : 'unknown-device',
      ipAddress: typeof details.ipAddress === 'string' ? details.ipAddress : 'unknown',
      userAgent: typeof details.userAgent === 'string' ? details.userAgent : 'unknown',
      status: 'SUCCESS',
      details,
    });

    logger.debug(`[VaultService] Activity logged for user: ${userId}, action: ${action}`, {
      context: 'logActivityAsync',
      userId,
      action,
      category,
    });
  } catch (error) {
    logger.error(`[VaultService] Failed to log activity for user: ${userId}`, error, {
      context: 'logActivityAsync',
      userId,
      action,
    });
    // Don't throw - logging should not break operations
  }
};

/**
 * Logs activity event and emits vault change notification via WebSocket
 * Uses new encrypted activity log service
 * Function is async but can be called without await
 *
 * @param userId - User ID
 * @param action - Action performed
 * @param category - Vault category
 * @param itemId - Item ID (if applicable)
 * @param details - Additional details
 */
export const logAndEmitAsync = (
  userId: string,
  username: string,
  action: string,
  category: string,
  itemId: string | null,
  details: Record<string, unknown>
): void => {
  const createdAt = new Date();

  // Log activity (fire and forget)
  logActivityAsync(userId, username, action, category, itemId, {
    ...details,
    loggedAt: createdAt.toISOString(),
  }).catch((error) => {
    logger.error('Failed to log activity', error, {
      context: 'logAndEmitAsync',
      userId,
    });
  });

  // Emit real-time event to connected clients
  try {
    emitVaultEvent(userId, 'vault:changed', {
      action,
      category,
      itemId,
      updatedAt: createdAt.toISOString(),
    });
  } catch (error) {
    logger.error('[VaultService] Failed to emit vault event', error, {
      userId,
      action,
    });
  }
};

/**
 * Log failed activity (for security events)
 * @param userId - User ID
 * @param action - Action that failed
 * @param category - Category
 * @param errorCode - Error code
 * @param errorMessage - Error message
 * @param details - Additional details
 */
export const logFailedActivityAsync = async (
  userId: string,
  username: string,
  action: string,
  category: string,
  errorCode: string,
  errorMessage: string,
  details: Record<string, unknown>
): Promise<void> => {
  try {
    await saveActivityLog({
      userId,
      username,
      action: action as any,
      category,
      deviceId: typeof details.deviceId === 'string' ? details.deviceId : 'unknown-device',
      ipAddress: typeof details.ipAddress === 'string' ? details.ipAddress : 'unknown',
      status: 'FAILURE',
      errorCode,
      errorMessage,
      details,
    });

    logger.warn(`[VaultService] Failed activity logged for user: ${userId}`, {
      context: 'logFailedActivityAsync',
      userId,
      action,
      errorCode,
    });
  } catch (error) {
    logger.error('[VaultService] Failed to log failed activity', error, {
      userId,
    });
  }
};

export default {
  logActivityAsync,
  logAndEmitAsync,
  logFailedActivityAsync,
};
