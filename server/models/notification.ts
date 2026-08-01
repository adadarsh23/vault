import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ['device_login', 'sync_conflict', 'security_alert'],
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    collection: 'notifications',
  },
)

export const Notification = mongoose.model('Notification', notificationSchema)
