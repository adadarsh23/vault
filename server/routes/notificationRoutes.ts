import express from 'express'
import { Notification } from '../models/notification.ts'
import { requireAuth } from '../middleware/authMiddleware.ts'
import { AuthenticatedRequest } from '../utils/requestTypes.ts'
import { sendSuccess } from '../responses.ts'
import { AppError } from '../utils/appError.ts'

const router = express.Router()

/**
 * @route GET /api/notifications
 * @desc Get user notifications
 * @access Private
 */
router.get('/', requireAuth, async (req, res) => {
  const userId = (req as AuthenticatedRequest).user.userId
  const notifications = await Notification.find({ userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()
    .exec()

  return sendSuccess(res, notifications, 'Notifications fetched successfully')
})

/**
 * @route POST /api/notifications/read
 * @desc Mark specific or all notifications as read
 * @access Private
 */
router.post('/read', requireAuth, async (req, res) => {
  const userId = (req as AuthenticatedRequest).user.userId
  const { id } = req.body

  if (id) {
    const updated = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { isRead: true },
      { new: true },
    )
    if (!updated) {
      throw AppError.notFound('Notification not found')
    }
    return sendSuccess(res, updated, 'Notification marked as read')
  }

  await Notification.updateMany({ userId, isRead: false }, { isRead: true })
  return sendSuccess(res, null, 'All notifications marked as read')
})

/**
 * @route POST /api/notifications/clear
 * @desc Delete all notifications for the user
 * @access Private
 */
router.post('/clear', requireAuth, async (req, res) => {
  const userId = (req as AuthenticatedRequest).user.userId
  await Notification.deleteMany({ userId })
  return sendSuccess(res, null, 'Notifications cleared successfully')
})

export { router as notificationRouter }
