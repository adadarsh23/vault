import mongoose, { HydratedDocument, InferSchemaType, Model } from 'mongoose'

/**
 * Activity Log Model - Stores individual encrypted activity log entries
 * Each entry is encrypted separately for security and better performance
 */

const encryptedActivityLogSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
      description: 'User who performed the action',
    },
    action: {
      type: String,
      required: true,
      index: true,
      description: 'Type of action performed',
    },
    category: {
      type: String,
      required: true,
      index: true,
      description: 'Vault category (auth, photos, notes, passwords, etc.)',
    },
    itemId: {
      type: String,
      default: null,
      description: 'ID of affected vault item (if applicable)',
    },
    /**
     * Encrypted activity log details
     * Contains: deviceId, ipAddress, userAgent, details, etc.
     */
    encryptedData: {
      cipherText: {
        type: String,
        required: true,
        description: 'AES-256-GCM encrypted activity details',
      },
      iv: {
        type: String,
        required: true,
        description: 'Initialization vector (base64)',
      },
      authTag: {
        type: String,
        required: true,
        description: 'Authentication tag for GCM mode',
      },
      algorithm: {
        type: String,
        default: 'aes-256-gcm',
        description: 'Encryption algorithm',
      },
    },
    /**
     * Unencrypted metadata for querying
     */
    metadata: {
      deviceId: {
        type: String,
        description: 'Device that performed the action',
      },
      ipAddress: {
        type: String,
        index: true,
        description: 'IP address from which action was performed',
      },
      userAgent: String,
      status: {
        type: String,
        enum: ['SUCCESS', 'FAILURE', 'PARTIAL'],
        default: 'SUCCESS',
      },
      errorCode: String,
      errorMessage: String,
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
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  },
)

/**
 * Indexes for optimal querying
 */
encryptedActivityLogSchema.index({ userId: 1, createdAt: -1 })
encryptedActivityLogSchema.index({ userId: 1, action: 1, createdAt: -1 })
encryptedActivityLogSchema.index({ userId: 1, 'metadata.ipAddress': 1, createdAt: -1 })
encryptedActivityLogSchema.index({ userId: 1, category: 1, createdAt: -1 })

export type ActivityLogType = InferSchemaType<typeof encryptedActivityLogSchema>
export type ActivityLogDocument = HydratedDocument<ActivityLogType>

export const getActivityLogModel = (username: string): Model<ActivityLogType> => {
  if (!username || !username.trim()) {
    throw new Error('Username is required for isolated activity logs');
  }
  const collectionName = `${username.trim()}.${username.trim()}_activity_logs`;
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as Model<ActivityLogType>;
  }
  const model = mongoose.model<ActivityLogType>(collectionName, encryptedActivityLogSchema, collectionName);
  model.createIndexes().catch(() => {});
  return model;
};

// Removed default ActivityLog model to prevent automatic collection creation.
// Code should use getActivityLogModel(username) instead.
