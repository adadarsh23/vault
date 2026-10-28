import mongoose, { Document, HydratedDocument, InferSchemaType, Model, Schema } from 'mongoose';

/**
 * Activity Log Model - Stores individual encrypted activity log entries.
 * Each entry is encrypted separately for security, zero-knowledge preservation,
 * and high throughput auditing.
 */

export interface IActivityLogEncryptedData {
  cipherText: string;
  iv: string;
  authTag: string;
  algorithm?: string;
}

export interface IActivityLogMetadata {
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILURE' | 'PARTIAL';
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface IActivityLog extends Document {
  userId: string;
  action: string;
  category: string;
  itemId?: string | null;
  encryptedData: IActivityLogEncryptedData;
  metadata: IActivityLogMetadata;
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean;
  deletedAt?: Date | null;
}

const encryptedActivityLogSchema = new Schema(
  {
    userId: {
      type: String,
      required: [true, 'userId is required'],
      trim: true,
      index: true,
      description: 'User who performed the action',
    },
    action: {
      type: String,
      required: [true, 'action is required'],
      trim: true,
      index: true,
      description: 'Type of action performed',
    },
    category: {
      type: String,
      required: [true, 'category is required'],
      trim: true,
      index: true,
      description: 'Vault category (auth, photos, notes, passwords, etc.)',
    },
    itemId: {
      type: String,
      default: null,
      trim: true,
      description: 'ID of affected vault item (if applicable)',
    },
    /**
     * Encrypted activity log details
     * Contains: deviceId, ipAddress, userAgent, details, etc.
     */
    encryptedData: {
      cipherText: {
        type: String,
        required: [true, 'cipherText is required'],
        trim: true,
        description: 'AES-256-GCM encrypted activity details',
      },
      iv: {
        type: String,
        required: [true, 'iv is required'],
        trim: true,
        description: 'Initialization vector (base64)',
      },
      authTag: {
        type: String,
        required: [true, 'authTag is required'],
        trim: true,
        description: 'Authentication tag for GCM mode',
      },
      algorithm: {
        type: String,
        default: 'aes-256-gcm',
        trim: true,
        description: 'Encryption algorithm',
      },
    },
    /**
     * Unencrypted metadata for querying and alerting
     */
    metadata: {
      deviceId: {
        type: String,
        trim: true,
        description: 'Device that performed the action',
      },
      ipAddress: {
        type: String,
        trim: true,
        index: true,
        description: 'IP address from which action was performed',
      },
      userAgent: {
        type: String,
        trim: true,
      },
      status: {
        type: String,
        enum: ['SUCCESS', 'FAILURE', 'PARTIAL'],
        default: 'SUCCESS',
        index: true,
      },
      errorCode: {
        type: String,
        default: null,
        trim: true,
      },
      errorMessage: {
        type: String,
        default: null,
        trim: true,
      },
    },
    /**
     * Timestamps and retention
     */
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
      expires: 7776000, // Auto-delete after 90 days (in seconds)
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/* ------------------ COMPOUND INDEXES ------------------ */
encryptedActivityLogSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 });
encryptedActivityLogSchema.index({ userId: 1, createdAt: -1 });
encryptedActivityLogSchema.index({ userId: 1, action: 1, createdAt: -1 });
encryptedActivityLogSchema.index({ userId: 1, 'metadata.ipAddress': 1, createdAt: -1 });
encryptedActivityLogSchema.index({ userId: 1, category: 1, createdAt: -1 });
encryptedActivityLogSchema.index({ userId: 1, 'metadata.status': 1, createdAt: -1 });
encryptedActivityLogSchema.index({ userId: 1, itemId: 1, createdAt: -1 });

export type ActivityLogType = InferSchemaType<typeof encryptedActivityLogSchema> & {
  _id?: any;
};
export type ActivityLogDocument = HydratedDocument<ActivityLogType>;

export interface ActivityLogModel extends Model<ActivityLogType> {
  findRecentByUser(userId: string, limit?: number): Promise<ActivityLogDocument[]>;
  softDelete(userId: string, logId: string): Promise<ActivityLogDocument | null>;
}

encryptedActivityLogSchema.statics.findRecentByUser = function (
  userId: string,
  limit: number = 50,
) {
  return this.find({ userId: userId.trim(), isDeleted: false })
    .sort({ createdAt: -1 })
    .limit(limit)
    .allowDiskUse(true);
};

encryptedActivityLogSchema.statics.softDelete = function (userId: string, logId: string) {
  return this.findOneAndUpdate(
    { _id: logId, userId: userId.trim(), isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  );
};

/**
 * Returns a user-specific ActivityLog model using a dedicated collection.
 * The collection name is derived from the username to ensure multi-tenant data isolation.
 * Supports passing a custom connection for multi-cluster querying.
 */
export const getActivityLogModel = (
  username: string,
  customConnection?: mongoose.Connection,
): ActivityLogModel => {
  if (!username || !username.trim()) {
    throw new Error('Username is required for isolated activity logs');
  }

  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const collectionName = `${normalized}.${normalized}_activity_logs`;

  if (customConnection) {
    if (customConnection.models[collectionName]) {
      return customConnection.models[collectionName] as unknown as ActivityLogModel;
    }
    const model = customConnection.model(
      collectionName,
      encryptedActivityLogSchema,
      collectionName,
    );
    if (typeof model?.createIndexes === 'function') {
      model.createIndexes().catch(() => {});
    }
    return model as unknown as ActivityLogModel;
  }

  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as unknown as ActivityLogModel;
  }

  const model = mongoose.model(collectionName, encryptedActivityLogSchema, collectionName);
  if (typeof model?.createIndexes === 'function') {
    model.createIndexes().catch(() => {});
  }
  return model as unknown as ActivityLogModel;
};
