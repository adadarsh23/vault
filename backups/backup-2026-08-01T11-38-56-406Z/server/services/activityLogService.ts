import { getActivityLogModel, ActivityLogDocument } from '../models/activityLog.ts'
import { logger } from '../utils/logger.ts'
import { encryptText, decryptText } from '../utils/crypto.ts'

/**
 * Activity Log Service
 * Handles secure, individual logging of user actions
 * Each log entry is encrypted with AES-256-GCM
 */

export type ActivityAction = string;

export interface ActivityLogEntry {
  userId: string
  username: string
  action: ActivityAction
  category: string
  itemId?: string | null
  deviceId?: string
  ipAddress?: string
  userAgent?: string
  status?: 'SUCCESS' | 'FAILURE' | 'PARTIAL'
  errorCode?: string
  errorMessage?: string
  details?: Record<string, unknown>
}

/**
 * Save a single activity log entry
 * Encrypts details and saves immediately - one by one approach
 *
 * @param entry - Activity log entry to save
 * @returns Saved activity log document
 */
export const saveActivityLog = async (
  entry: ActivityLogEntry,
): Promise<ActivityLogDocument | null> => {
  try {
    const { userId, username, action, category, details = {} } = entry

    logger.debug(
      `[ActivityLogService] Saving activity log for user: ${userId}`,
      {
        context: 'saveActivityLog',
        action,
        category,
      },
    )

    if (!userId || !action || !category) {
      throw new Error('Missing required fields: userId, action, or category')
    }

    // Encrypt the detailed information
    const encryptedDetails = encryptActivityDetails({
      deviceId: entry.deviceId || 'unknown-device',
      ipAddress: entry.ipAddress || 'unknown',
      userAgent: entry.userAgent || 'unknown',
      details,
    })

    if (!encryptedDetails) {
      throw new Error('Failed to encrypt activity log details')
    }

    // Save individual log entry
    const DynamicLogModel = getActivityLogModel(username);
    const logDoc = new DynamicLogModel({
      userId: userId.toString(),
      action,
      category,
      itemId: entry.itemId || null,
      encryptedData: encryptedDetails,
      metadata: {
        deviceId: entry.deviceId || 'unknown-device',
        ipAddress: entry.ipAddress || 'unknown',
        userAgent: entry.userAgent || 'unknown',
        status: entry.status || 'SUCCESS',
        errorCode: entry.errorCode || null,
        errorMessage: entry.errorMessage || null,
      },
      createdAt: new Date(),
    })

    const savedLog = await logDoc.save()

    logger.debug(
      `[ActivityLogService] Activity log saved successfully for user: ${userId}`,
      {
        context: 'saveActivityLog',
        logId: savedLog._id.toString(),
        action,
        timestamp: savedLog.createdAt.toISOString(),
      },
    )

    return savedLog
  } catch (error) {
    logger.error(
      `[ActivityLogService] Error saving activity log for user: ${entry.userId}`,
      error,
      {
        context: 'saveActivityLog',
        userId: entry.userId,
        action: entry.action,
      },
    )
    throw error
  }
}

/**
 * Encrypt activity log details with AES-256-GCM
 */
const encryptActivityDetails = (data: Record<string, unknown>) => {
  try {
    const jsonString = JSON.stringify(data)
    const encrypted = encryptText(jsonString)
    return encrypted
  } catch (error) {
    logger.error(
      '[ActivityLogService] Error encrypting activity details',
      error,
      {
        context: 'encryptActivityDetails',
      },
    )
    return null
  }
}

/**
 * Decrypt activity log details
 */
const decryptActivityDetails = (encryptedData: any): Record<string, unknown> | null => {
  try {
    if (!encryptedData || !encryptedData.cipherText) {
      return null
    }
    const decrypted = decryptText(encryptedData)

    if (!decrypted) {
      return null
    }

    return JSON.parse(decrypted) as Record<string, unknown>
  } catch (error) {
    logger.error(
      '[ActivityLogService] Error decrypting activity details',
      error,
      {
        context: 'decryptActivityDetails',
      },
    )
    return null
  }
}

/**
 * Get activity logs for a user with pagination
 *
 * @param userId - User ID
 * @param limit - Number of logs to return (default: 100)
 * @param skip - Number of logs to skip for pagination (default: 0)
 * @param action - Optional action filter
 * @returns Array of activity logs with decrypted details
 */
export const getUserActivityLogs = async (
  userId: string,
  username: string,
  limit = 100,
  skip = 0,
  action?: ActivityAction,
): Promise<
  Array<{
    _id: string
    action: ActivityAction
    category: string
    timestamp: Date
    device: string
    ipAddress: string
    status: string
    details?: Record<string, unknown>
  }>
> => {
  try {
    logger.debug(
      `[ActivityLogService] Fetching activity logs for user: ${userId}`,
      {
        context: 'getUserActivityLogs',
        limit,
        skip,
        action,
      },
    )

    const query: any = {
      userId: userId.toString(),
      isDeleted: false,
    }

    if (action) {
      query.action = action
    }

    const DynamicLogModel = getActivityLogModel(username);
    const logs = await DynamicLogModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec()

    return logs.map((log) => ({
      _id: log._id.toString(),
      action: log.action as ActivityAction,
      category: log.category,
      timestamp: log.createdAt,
      device: log.metadata?.deviceId || 'unknown',
      ipAddress: log.metadata?.ipAddress || 'unknown',
      status: log.metadata?.status || 'SUCCESS',
      details: decryptActivityDetails(log.encryptedData) || undefined,
    }))
  } catch (error) {
    logger.error(
      `[ActivityLogService] Error fetching activity logs for user: ${userId}`,
      error,
      {
        context: 'getUserActivityLogs',
        userId,
      },
    )
    return []
  }
}

/**
 * Get activity logs count for a user
 *
 * @param userId - User ID
 * @returns Number of activity logs
 */
export const getActivityLogCount = async (userId: string, username: string): Promise<number> => {
  try {
    const DynamicLogModel = getActivityLogModel(username);
    const count = await DynamicLogModel.countDocuments({
      userId,
      isDeleted: false,
    })

    return count
  } catch (error) {
    logger.error(
      `[ActivityLogService] Error counting activity logs for user: ${userId}`,
      error,
      {
        context: 'getActivityLogCount',
        userId,
      },
    )
    return 0
  }
}

/**
 * Get recent activity for a user (last N days)
 *
 * @param userId - User ID
 * @param daysBack - Number of days to look back (default: 7)
 * @returns Array of activity logs
 */
export const getRecentActivityLogs = async (
  userId: string,
  username: string,
  daysBack = 7,
): Promise<ActivityLogDocument[]> => {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysBack)

    const DynamicLogModel = getActivityLogModel(username);
    const logs = await DynamicLogModel.find({
      userId,
      isDeleted: false,
      createdAt: { $gte: cutoffDate },
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .exec()

    return logs
  } catch (error) {
    logger.error(
      `[ActivityLogService] Error fetching recent activity logs for user: ${userId}`,
      error,
      {
        context: 'getRecentActivityLogs',
        userId,
        daysBack,
      },
    )
    return []
  }
}

/**
 * Get activity logs by action type
 *
 * @param userId - User ID
 * @param action - Action to filter by
 * @param limit - Number of logs to return
 * @returns Array of activity logs
 */
export const getActivityLogsByAction = async (
  userId: string,
  username: string,
  action: ActivityAction,
  limit = 100,
): Promise<ActivityLogDocument[]> => {
  try {
    const DynamicLogModel = getActivityLogModel(username);
    const logs = await DynamicLogModel.find({
      userId,
      action,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec()

    return logs
  } catch (error) {
    logger.error(
      `[ActivityLogService] Error fetching activity logs by action for user: ${userId}`,
      error,
      {
        context: 'getActivityLogsByAction',
        userId,
        action,
      },
    )
    return []
  }
}

/**
 * Soft delete activity log
 *
 * @param logId - Log ID to delete
 * @returns Boolean indicating success
 */
export const deleteActivityLog = async (logId: string, username: string): Promise<boolean> => {
  try {
    const DynamicLogModel = getActivityLogModel(username);
    const result = await DynamicLogModel.findByIdAndUpdate(logId, {
      isDeleted: true,
      deletedAt: new Date(),
    })

    return !!result
  } catch (error) {
    logger.error(
      `[ActivityLogService] Error deleting activity log: ${logId}`,
      error,
      {
        context: 'deleteActivityLog',
        logId,
      },
    )
    return false
  }
}

/**
 * Delete all activity logs for a user
 * (Hard delete - for GDPR/account deletion)
 *
 * @param userId - User ID
 * @returns Number of deleted logs
 */
export const deleteUserActivityLogs = async (
  userId: string,
  username: string,
): Promise<number> => {
  try {
    const DynamicLogModel = getActivityLogModel(username);
    const result = await DynamicLogModel.deleteMany({
      userId,
    })

    logger.info(
      `[ActivityLogService] Deleted ${result.deletedCount} activity logs for user: ${userId}`,
      {
        context: 'deleteUserActivityLogs',
        userId,
        deletedCount: result.deletedCount,
      },
    )

    return result.deletedCount || 0
  } catch (error) {
    logger.error(
      `[ActivityLogService] Error deleting activity logs for user: ${userId}`,
      error,
      {
        context: 'deleteUserActivityLogs',
        userId,
      },
    )
    return 0
  }
}

/**
 * Get suspicious activity (failed attempts, multiple devices, unusual IPs)
 *
 * @param userId - User ID
 * @returns Array of suspicious activity logs
 */
export const getSuspiciousActivity = async (
  userId: string,
  username: string,
): Promise<ActivityLogDocument[]> => {
  try {
    const DynamicLogModel = getActivityLogModel(username);
    const recentLogs = await DynamicLogModel.find({
      userId,
      isDeleted: false,
      createdAt: {
        $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
      },
    }).exec()

    // Filter for suspicious patterns
    const suspicious = recentLogs.filter(
      (log) => {
        const meta = log.metadata as any;
        return meta?.status === 'FAILURE' ||
        (log.action === 'LOGIN' && meta?.status === 'FAILURE') ||
        meta?.errorCode === 'INVALID_CREDENTIALS';
      }
    )

    // Get unique IPs
    const ips = new Set(recentLogs.map((log) => (log.metadata as any)?.ipAddress))

    // If more than 3 different IPs, mark all as suspicious
    if (ips.size > 3) {
      return recentLogs.filter((log) => (log.metadata as any)?.status === 'SUCCESS')
    }

    return suspicious
  } catch (error) {
    logger.error(
      `[ActivityLogService] Error getting suspicious activity for user: ${userId}`,
      error,
      {
        context: 'getSuspiciousActivity',
        userId,
      },
    )
    return []
  }
}

export default {
  saveActivityLog,
  getUserActivityLogs,
  getActivityLogCount,
  getRecentActivityLogs,
  getActivityLogsByAction,
  deleteActivityLog,
  deleteUserActivityLogs,
  getSuspiciousActivity,
}
