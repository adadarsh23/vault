import mongoose from 'mongoose';
import { getNotificationModel, getLegacyNotificationModel } from '../models/notification.ts';
import { emitVaultEvent } from '../socket.ts';
import { logger } from '../utils/logger.ts';

export const migrateLegacyNotifications = async (
  userId: string,
  username: string,
): Promise<void> => {
  try {
    const LegacyNotification = getLegacyNotificationModel();
    const legacyNotifications = await LegacyNotification.find({ userId }).lean().exec();

    if (legacyNotifications && legacyNotifications.length > 0) {
      const Notification = getNotificationModel(username);
      for (const item of legacyNotifications) {
        const { _id, ...docWithoutId } = item as any;
        await Notification.updateOne({ _id }, { $setOnInsert: docWithoutId }, { upsert: true });
      }
      await LegacyNotification.deleteMany({ userId });
      logger.info('Migrated legacy notifications to user collection', {
        userId,
        username,
        count: legacyNotifications.length,
      });
    }
  } catch (error) {
    logger.warn('Error during legacy notification migration', { userId, username, error });
  }
};

export const createNotification = async (
  userId: string,
  type: 'device_login' | 'sync_conflict' | 'security_alert',
  title: string,
  message: string,
  metadata: Record<string, any> = {},
  username?: string,
): Promise<any> => {
  try {
    let resolvedUsername = username;
    if (!resolvedUsername) {
      const User = mongoose.model('User');
      const user = (await User.findById(userId).select('username').lean().exec()) as any;
      if (user?.username) {
        resolvedUsername = user.username;
      }
    }

    if (!resolvedUsername) {
      throw new Error(`Cannot create notification: username not found for userId ${userId}`);
    }

    const Notification = getNotificationModel(resolvedUsername);
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      metadata,
      isRead: false,
    });

    // Emit real-time socket event
    emitVaultEvent(userId, 'notification:new', notification);

    logger.info('Notification created', { userId, username: resolvedUsername, type, title });
    return notification;
  } catch (error) {
    logger.error('Failed to create notification', { error });
    throw error;
  }
};
