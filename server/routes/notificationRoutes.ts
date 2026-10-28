import express from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { getNotificationModel } from '../models/notification.ts';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { requireTrustedBrowserOrigin } from '../middleware/csrfOriginMiddleware.ts';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import { sendSuccess } from '../responses.ts';
import { AppError } from '../utils/appError.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { getClientIp } from '../utils/requestIp.ts';

const router = express.Router();

const notificationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${(req as any)?.user?.userId || 'anon'}:notif`,
  message: {
    success: false,
    message: 'Too many notification requests. Please slow down.',
    error: { code: 'TOO_MANY_NOTIFICATION_REQUESTS' },
  },
});

// Prevent browser/proxy caching of private user notifications
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

router.use(requireAuth);
router.use(notificationLimiter);

/**
 * @route GET /api/notifications
 * @desc Get user notifications
 * @access Private
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { userId, username } = (req as AuthenticatedRequest).user;

    if (mongoose.connection.readyState !== 1) {
      throw AppError.serviceUnavailable(
        'Database service is temporarily unavailable or reconnecting.',
        'SERVICE_UNAVAILABLE',
      );
    }

    const Notification = getNotificationModel(username);
    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .allowDiskUse(true)
      .limit(50)
      .lean()
      .exec();

    return sendSuccess(res, notifications, 'Notifications fetched successfully');
  }),
);

/**
 * @route POST /api/notifications/read
 * @desc Mark specific or all notifications as read
 * @access Private
 */
router.post(
  '/read',
  requireTrustedBrowserOrigin,
  asyncHandler(async (req, res) => {
    const { userId, username } = (req as AuthenticatedRequest).user;
    const Notification = getNotificationModel(username);
    const { id } = req.body || {};

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

    await Notification.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
    return sendSuccess(res, null, 'All notifications marked as read');
  }),
);

/**
 * @route POST /api/notifications/clear
 * @desc Delete all notifications for the user
 * @access Private
 */
router.post(
  '/clear',
  requireTrustedBrowserOrigin,
  asyncHandler(async (req, res) => {
    const { userId, username } = (req as AuthenticatedRequest).user;
    const Notification = getNotificationModel(username);
    await Notification.deleteMany({ userId });
    return sendSuccess(res, null, 'Notifications cleared successfully');
  }),
);

/**
 * @route DELETE /api/notifications/:id
 * @desc Delete a specific notification by ID
 * @access Private
 */
router.delete(
  '/:id',
  requireTrustedBrowserOrigin,
  asyncHandler(async (req, res) => {
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
  }),
);

/**
 * @route POST /api/notifications/delete
 * @desc Delete a specific notification by ID (fallback endpoint)
 * @access Private
 */
router.post(
  '/delete',
  requireTrustedBrowserOrigin,
  asyncHandler(async (req, res) => {
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
  }),
);

export { router as notificationRouter };
