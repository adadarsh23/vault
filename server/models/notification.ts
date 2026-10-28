import mongoose, { Document, HydratedDocument, Model, Schema, UpdateWriteOpResult } from 'mongoose';

export type NotificationCategory =
  | 'device_login'
  | 'sync_conflict'
  | 'security_alert'
  | 'key_rotation'
  | 'backup_status'
  | 'system_announcement'
  | string;

/**
 * Interface representing a Notification document.
 */
export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: NotificationCategory;
  title: string;
  message: string;
  metadata: Record<string, any>;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationType = {
  userId: mongoose.Types.ObjectId;
  type: NotificationCategory;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  isRead?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

export type NotificationDocument = HydratedDocument<INotification>;

export interface NotificationModel extends Model<INotification> {
  markAsRead(
    userId: mongoose.Types.ObjectId | string,
    notificationId: mongoose.Types.ObjectId | string,
  ): Promise<NotificationDocument | null>;
  markAllAsRead(userId: mongoose.Types.ObjectId | string): Promise<UpdateWriteOpResult>;
  getUnreadCount(userId: mongoose.Types.ObjectId | string): Promise<number>;
}

const notificationSchema = new Schema<INotification, NotificationModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    type: {
      type: String,
      required: [true, 'notification type is required'],
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'notification title is required'],
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: [true, 'notification message is required'],
      trim: true,
      maxlength: 2000,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/* ------------------ COMPOUND INDEXES ------------------ */
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });

/* ------------------ STATIC METHODS ------------------ */
notificationSchema.statics.markAsRead = function (
  userId: mongoose.Types.ObjectId | string,
  notificationId: mongoose.Types.ObjectId | string,
) {
  return this.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { isRead: true } },
    { new: true },
  );
};

notificationSchema.statics.markAllAsRead = function (userId: mongoose.Types.ObjectId | string) {
  return this.updateMany({ userId, isRead: false }, { $set: { isRead: true } });
};

notificationSchema.statics.getUnreadCount = function (userId: mongoose.Types.ObjectId | string) {
  return this.countDocuments({ userId, isRead: false });
};

/**
 * Returns a user-specific Notification model using a dedicated collection.
 * Supports passing an optional custom connection for multi-cluster querying.
 */
export const getNotificationModel = (
  username: string,
  customConnection?: mongoose.Connection,
): NotificationModel => {
  if (!username || !username.trim()) {
    throw new Error('Username is required for isolated notifications');
  }

  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const collectionName = `${normalized}.${normalized}_notifications`;

  if (customConnection) {
    if (customConnection.models[collectionName]) {
      return customConnection.models[collectionName] as NotificationModel;
    }
    const model = customConnection.model<INotification, NotificationModel>(
      collectionName,
      notificationSchema,
      collectionName,
    );
    if (typeof model?.createIndexes === 'function') {
      model.createIndexes().catch(() => {});
    }
    return model;
  }

  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as NotificationModel;
  }

  const model = mongoose.model<INotification, NotificationModel>(
    collectionName,
    notificationSchema,
    collectionName,
  );
  if (typeof model?.createIndexes === 'function') {
    model.createIndexes().catch(() => {});
  }
  return model;
};

/**
 * Returns the legacy global Notification model for fallback and migration.
 */
export const getLegacyNotificationModel = (
  customConnection?: mongoose.Connection,
): NotificationModel => {
  const collectionName = 'notifications';
  if (customConnection) {
    if (customConnection.models[collectionName]) {
      return customConnection.models[collectionName] as NotificationModel;
    }
    return customConnection.model<INotification, NotificationModel>(
      collectionName,
      notificationSchema,
      collectionName,
    );
  }

  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as NotificationModel;
  }
  return mongoose.model<INotification, NotificationModel>(
    collectionName,
    notificationSchema,
    collectionName,
  );
};
