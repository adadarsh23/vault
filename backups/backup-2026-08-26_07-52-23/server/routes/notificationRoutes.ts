import express from 'express';
import mongoose from 'mongoose';
import { getNotificationModel } from '../models/notification.ts';
import { migrateLegacyNotifications } from '../services/notificationService.ts';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import { sendSuccess } from '../responses.ts';
import { AppError } from '../utils/appError.ts';

const router = express.Router();

/**
 * @route GET /api/notifications
 * @desc Get user notifications
 * @access Private
 */
router.get('/', requireAuth, async (req, res) => {
  const { userId, username } = (req as AuthenticatedRequest).user;
  await migrateLegacyNotifications(userId, username);

  const Notification = getNotificationModel(username);
  const notifications = await Notification.find({ userId })
    .sort({ createdAt: -1 })
    .allowDiskUse(true)
    .limit(50)
    .lean()
    .exec();

  return sendSuccess(res, notifications, 'Notifications fetched successfully');
});

/**
 * @route POST /api/notifications/read
 * @desc Mark specific or all notifications as read
 * @access Private
 */
router.post('/read', requireAuth, async (req, res) => {
  const { userId, username } = (req as AuthenticatedRequest).user;
  const Notification = getNotificationModel(username);
  const { id } = req.body;

  if (id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw AppError.badRequest('Invalid notification ID format');
    }
    const updated = await Notification.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(id), userId },
      { isRead: true },
      { new: true },
    );
    if (!updated) {
      throw AppError.notFound('Notification not found');
    }
    return sendSuccess(res, updated, 'Notification marked as read');
  }

  await Notification.updateMany({ userId, isRead: false }, { isRead: true });
  return sendSuccess(res, null, 'All notifications marked as read');
});

/**
 * @route POST /api/notifications/clear
 * @desc Delete all notifications for the user
 * @access Private
 */
router.post('/clear', requireAuth, async (req, res) => {
  const { userId, username } = (req as AuthenticatedRequest).user;
  const Notification = getNotificationModel(username);
  await Notification.deleteMany({ userId });
  return sendSuccess(res, null, 'Notifications cleared successfully');
});

/**
 * @route DELETE /api/notifications/:id
 * @desc Delete a specific notification by ID
 * @access Private
 */
router.delete('/:id', requireAuth, async (req, res) => {
  const { userId, username } = (req as AuthenticatedRequest).user;
  const Notification = getNotificationModel(username);
  const rawId = req.params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw AppError.badRequest('Invalid notification ID format');
  }

  const deleted = await Notification.findOneAndDelete({
    _id: new mongoose.Types.ObjectId(id),
    userId,
  });
  if (!deleted) {
    throw AppError.notFound('Notification not found or access denied');
  }

  return sendSuccess(res, null, 'Notification deleted successfully');
});

/**
 * @route POST /api/notifications/delete
 * @desc Delete a specific notification by ID (fallback endpoint)
 * @access Private
 */
router.post('/delete', requireAuth, async (req, res) => {
  const { userId, username } = (req as AuthenticatedRequest).user;
  const Notification = getNotificationModel(username);
  const rawId = req.body?.id;
  const id = typeof rawId === 'string' ? rawId : undefined;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw AppError.badRequest('Valid notification ID is required');
  }

  const deleted = await Notification.findOneAndDelete({
    _id: new mongoose.Types.ObjectId(id),
    userId,
  });
  if (!deleted) {
    throw AppError.notFound('Notification not found or access denied');
  }

  return sendSuccess(res, null, 'Notification deleted successfully');
});

export { router as notificationRouter };
