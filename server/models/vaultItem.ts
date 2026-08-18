import mongoose from 'mongoose';

const vaultItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    itemId: { type: String, required: true, index: true },
    category: {
      type: String,
      required: true,
      index: true,
      enum: [
        'photo',
        'video',
        'audio',
        'document',
        'note',
        'chat',
        'todo',
        'password',
        'secret',
        'contact',
        'location',
        'file',
        'other-files',
        'other',
        'settings',
        'system',
        'users',
        'card',
        'identity',
        'wifi',
      ],
    },
    folder: { type: String, trim: true, default: null, index: true },
    title: { type: String, trim: true, default: '' },

    // For encrypted text content
    payload: { type: String, default: null },

    // For files
    file: {
      fileName: { type: String },
      filePath: { type: String },
      mimeType: { type: String },
      size: { type: Number },
      encryptionIv: { type: String }, // Store for at-rest AES-GCM
      encryptionTag: { type: String }, // Store for at-rest AES-GCM
    },

    // Modern structure (V2)
    modernPayload: {
      type: String,
      default: null,
      description: 'Used for V2 encrypted payloads which might combine metadata and content',
    },

    encoding: {
      type: String,
      default: 'utf-8',
      enum: ['utf-8', 'base64', 'binary-base64', 'gridfs-binary', 'file-reference', 'modern'],
    },
    gridFsId: { type: String, default: null },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    clientUpdatedAt: { type: Date, default: null },
    isPinned: { type: Boolean, default: false, index: true },
    pinnedAt: { type: Date, default: null },

    // Tracking
    deviceId: { type: String, default: 'unknown' },
    ipAddress: { type: String, default: 'unknown' },
  },
  {
    timestamps: true,
    collection: 'vault_items',
  }
);

// Compound index for unique items per user
vaultItemSchema.index({ userId: 1, itemId: 1 }, { unique: true });
vaultItemSchema.index({ userId: 1, category: 1, isDeleted: 1 });
vaultItemSchema.index({ userId: 1, isDeleted: 1, updatedAt: -1 });
vaultItemSchema.index({ userId: 1, updatedAt: -1 });
vaultItemSchema.index({ isDeleted: 1, updatedAt: -1 });
vaultItemSchema.index({ updatedAt: -1 });

export type VaultItemType = mongoose.InferSchemaType<typeof vaultItemSchema>;
export type VaultItemDocument = mongoose.HydratedDocument<VaultItemType>;

/**
 * Returns a user-specific VaultItem model using a dedicated collection.
 * The collection name is derived from the username to ensure data isolation.
 * Supports passing a custom connection for multi-cluster querying.
 */
export const getVaultItemModel = (
  username: string,
  customConnection?: mongoose.Connection
): mongoose.Model<VaultItemType> => {
  if (!username || !username.trim()) {
    throw new Error('Username is required for isolated vault items');
  }

  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const collectionName = `${normalized}.${normalized}_vault_items`;

  if (customConnection) {
    if (customConnection.models[collectionName]) {
      return customConnection.models[collectionName] as mongoose.Model<VaultItemType>;
    }
    const model = customConnection.model(collectionName, vaultItemSchema, collectionName);
    if (typeof model?.createIndexes === 'function') {
      model.createIndexes().catch(() => {});
    }
    return model as unknown as mongoose.Model<VaultItemType>;
  }

  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as mongoose.Model<VaultItemType>;
  }

  const model = mongoose.model<VaultItemType>(collectionName, vaultItemSchema, collectionName);
  if (typeof model?.createIndexes === 'function') {
    model.createIndexes().catch(() => {});
  }
  return model;
};

// Removed default VaultItem model to prevent automatic collection creation.
// Code should use getVaultItemModel(username) instead.
