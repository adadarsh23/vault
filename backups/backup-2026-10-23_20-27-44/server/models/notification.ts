import mongoose, { InferSchemaType, HydratedDocument, Model } from 'mongoose';

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
  },
);

export type NotificationType = InferSchemaType<typeof notificationSchema>;
export type NotificationDocument = HydratedDocument<NotificationType>;

/**
 * Returns a user-specific Notification model using a dedicated collection.
 */
export const getNotificationModel = (username: string): Model<NotificationType> => {
  if (!username || !username.trim()) {
    throw new Error('Username is required for isolated notifications');
  }

  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const collectionName = `${normalized}.${normalized}_notifications`;

  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as Model<NotificationType>;
  }

  const model = mongoose.model<NotificationType>(
    collectionName,
    notificationSchema,
    collectionName,
  );
  model.createIndexes().catch(() => {});
  return model;
};

/**
 * Returns the legacy global Notification model for fallback and migration.
 */
export const getLegacyNotificationModel = (): Model<NotificationType> => {
  const collectionName = 'notifications';
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as Model<NotificationType>;
  }
  return mongoose.model<NotificationType>(collectionName, notificationSchema, collectionName);
};
