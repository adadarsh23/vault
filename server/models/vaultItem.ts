import mongoose, { Document, HydratedDocument, Model, Schema } from 'mongoose';

export interface IVaultItemFile {
  fileName?: string;
  filePath?: string;
  mimeType?: string;
  size?: number;
  encryptionIv?: string;
  encryptionTag?: string;
}

export type VaultCategory =
  | 'photo'
  | 'video'
  | 'audio'
  | 'document'
  | 'note'
  | 'chat'
  | 'todo'
  | 'password'
  | 'secret'
  | 'contact'
  | 'location'
  | 'file'
  | 'other-files'
  | 'other'
  | 'settings'
  | 'system'
  | 'users'
  | 'card'
  | 'identity'
  | 'wifi';

export interface IVaultItem extends Document {
  userId: mongoose.Types.ObjectId;
  itemId: string;
  category: VaultCategory;
  folder: string | null;
  title: string;
  payload: string | null;
  file?: IVaultItemFile;
  modernPayload?: string | null;
  encoding: 'utf-8' | 'base64' | 'binary-base64' | 'gridfs-binary' | 'file-reference' | 'modern';
  gridFsId?: string | null;
  metadata: Record<string, any>;
  isDeleted: boolean;
  deletedAt?: Date | null;
  clientUpdatedAt?: Date | null;
  isPinned: boolean;
  pinnedAt?: Date | null;
  deviceId: string;
  ipAddress: string;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  softDelete(): Promise<this>;
  restore(): Promise<this>;
}

const fileSubSchema = new Schema(
  {
    fileName: { type: String, trim: true },
    filePath: { type: String, trim: true },
    mimeType: { type: String, trim: true, lowercase: true },
    size: { type: Number, min: 0 },
    encryptionIv: { type: String, trim: true },
    encryptionTag: { type: String, trim: true },
  },
  { _id: false },
);

const vaultItemSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    itemId: {
      type: String,
      required: [true, 'itemId is required'],
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: [true, 'category is required'],
      trim: true,
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
    folder: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },

    // Legacy encrypted text payload
    payload: {
      type: String,
      default: null,
    },

    // File attachments
    file: {
      type: fileSubSchema,
      default: null,
    },

    // Modern unified encrypted structure (V2)
    modernPayload: {
      type: String,
      default: null,
      description: 'Used for V2 encrypted payloads combining metadata and content',
    },

    encoding: {
      type: String,
      default: 'utf-8',
      enum: ['utf-8', 'base64', 'binary-base64', 'gridfs-binary', 'file-reference', 'modern'],
    },
    gridFsId: {
      type: String,
      default: null,
      trim: true,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: () => ({}),
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
    clientUpdatedAt: {
      type: Date,
      default: null,
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    pinnedAt: {
      type: Date,
      default: null,
    },

    // Security & Audit Tracking
    deviceId: {
      type: String,
      default: 'unknown',
      trim: true,
    },
    ipAddress: {
      type: String,
      default: 'unknown',
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'vault_items',
  },
);

/* ------------------ COMPOUND INDEXES ------------------ */
vaultItemSchema.index({ userId: 1, itemId: 1 }, { unique: true });
vaultItemSchema.index({ userId: 1, category: 1, isDeleted: 1, updatedAt: -1 });
vaultItemSchema.index({ userId: 1, folder: 1, isDeleted: 1, updatedAt: -1 });
vaultItemSchema.index({ userId: 1, isPinned: 1, isDeleted: 1, updatedAt: -1 });
vaultItemSchema.index({ userId: 1, isDeleted: 1, updatedAt: -1 });
vaultItemSchema.index({ userId: 1, updatedAt: -1 });
vaultItemSchema.index({ userId: 1, 'file.mimeType': 1, isDeleted: 1 });
vaultItemSchema.index({ isDeleted: 1, updatedAt: -1 });
vaultItemSchema.index({ updatedAt: -1 });

export type VaultItemType = mongoose.InferSchemaType<typeof vaultItemSchema> & {
  _id?: any;
};
export type VaultItemDocument = HydratedDocument<VaultItemType>;

export interface VaultItemModel extends Model<VaultItemType> {
  findByItemId(
    userId: mongoose.Types.ObjectId | string,
    itemId: string,
  ): Promise<VaultItemDocument | null>;
  softDeleteItem(
    userId: mongoose.Types.ObjectId | string,
    itemId: string,
  ): Promise<VaultItemDocument | null>;
  restoreItem(
    userId: mongoose.Types.ObjectId | string,
    itemId: string,
  ): Promise<VaultItemDocument | null>;
  togglePin(
    userId: mongoose.Types.ObjectId | string,
    itemId: string,
  ): Promise<VaultItemDocument | null>;
}

/* ------------------ INSTANCE METHODS ------------------ */
vaultItemSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

vaultItemSchema.methods.restore = function () {
  this.isDeleted = false;
  this.deletedAt = null;
  return this.save();
};

/* ------------------ STATIC METHODS ------------------ */
vaultItemSchema.statics.findByItemId = function (
  userId: mongoose.Types.ObjectId | string,
  itemId: string,
) {
  return this.findOne({ userId, itemId: itemId.trim() });
};

vaultItemSchema.statics.softDeleteItem = function (
  userId: mongoose.Types.ObjectId | string,
  itemId: string,
) {
  return this.findOneAndUpdate(
    { userId, itemId: itemId.trim(), isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  );
};

vaultItemSchema.statics.restoreItem = function (
  userId: mongoose.Types.ObjectId | string,
  itemId: string,
) {
  return this.findOneAndUpdate(
    { userId, itemId: itemId.trim(), isDeleted: true },
    { $set: { isDeleted: false, deletedAt: null } },
    { new: true },
  );
};

vaultItemSchema.statics.togglePin = async function (
  userId: mongoose.Types.ObjectId | string,
  itemId: string,
) {
  const item = await this.findOne({ userId, itemId: itemId.trim() });
  if (!item) return null;
  item.isPinned = !item.isPinned;
  item.pinnedAt = item.isPinned ? new Date() : null;
  return item.save();
};

/**
 * Returns a user-specific VaultItem model using a dedicated collection.
 * The collection name is derived from the username to ensure total data isolation.
 * Supports passing a custom connection for multi-cluster querying.
 */
export const getVaultItemModel = (
  username: string,
  customConnection?: mongoose.Connection,
): VaultItemModel => {
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
      return customConnection.models[collectionName] as unknown as VaultItemModel;
    }
    const model = customConnection.model(collectionName, vaultItemSchema, collectionName);
    if (typeof model?.createIndexes === 'function') {
      model.createIndexes().catch(() => {});
    }
    return model as unknown as VaultItemModel;
  }

  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as unknown as VaultItemModel;
  }

  const model = mongoose.model(collectionName, vaultItemSchema, collectionName);
  if (typeof model?.createIndexes === 'function') {
    model.createIndexes().catch(() => {});
  }
  return model as unknown as VaultItemModel;
};
