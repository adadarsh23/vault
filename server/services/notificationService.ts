import { Notification } from '../models/notification.ts'
import { emitVaultEvent } from '../socket.ts'
import { logger } from '../utils/logger.ts'

export const createNotification = async (
  userId: string,
  type: 'device_login' | 'sync_conflict' | 'security_alert',
  title: string,
  message: string,
  metadata: Record<string, any> = {},
): Promise<any> => {
  try {
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      metadata,
      isRead: false,
    })

    // Emit real-time socket event
    emitVaultEvent(userId, 'notification:new', notification)

    logger.info('Notification created', { userId, type, title })
    return notification
  } catch (error) {
    logger.error('Failed to create notification', { error })
    throw error
  }
}
