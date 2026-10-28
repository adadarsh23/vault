import mongoose, { Schema, Document, Model, HydratedDocument } from 'mongoose';

/**
 * Interface representing a Folder document in MongoDB.
 * Folders provide hierarchical organization for user vault items.
 * Each user has their own isolated collection for maximum security and data partitioning.
 */
export interface FolderType extends Document {
  userId: string;
  username: string;
  name: string | Record<string, unknown>;
  nameHash?: string;
  itemType: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type FolderDocument = HydratedDocument<FolderType>;

export interface FolderModel extends Model<FolderType> {
  findUserFolders(userId: string): Promise<FolderDocument[]>;
  findSubfolders(userId: string, parentId: string | null): Promise<FolderDocument[]>;
}

const folderSchema = new Schema<FolderType, FolderModel>(
  {
    userId: {
      type: String,
      required: [true, 'userId is required'],
      trim: true,
      index: true,
    },
    username: {
      type: String,
      required: [true, 'username is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    name: {
      type: Schema.Types.Mixed,
      required: [true, 'name is required'],
      validate: {
        validator: (v: unknown) => {
          if (typeof v === 'string') return v.trim().length > 0;
          if (typeof v === 'object' && v !== null) return Object.keys(v).length > 0;
          return false;
        },
        message: 'Folder name must be a non-empty string or encrypted object',
      },
    },
    nameHash: {
      type: String,
      required: false,
      trim: true,
      index: true,
    },
    itemType: {
      type: String,
      required: [true, 'itemType is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    parentId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/* ------------------ COMPOUND INDEXES ------------------ */
folderSchema.index(
  { userId: 1, itemType: 1, nameHash: 1, parentId: 1 },
  { unique: true, partialFilterExpression: { nameHash: { $exists: true } } },
);
folderSchema.index({ userId: 1, parentId: 1 });
folderSchema.index({ userId: 1, itemType: 1 });
folderSchema.index({ userId: 1, parentId: 1, itemType: 1 });
folderSchema.index({ userId: 1, createdAt: -1 });

/* ------------------ STATIC METHODS ------------------ */
folderSchema.statics.findUserFolders = function (userId: string) {
  return this.find({ userId: userId.trim() }).sort({ createdAt: 1 });
};

folderSchema.statics.findSubfolders = function (userId: string, parentId: string | null) {
  return this.find({ userId: userId.trim(), parentId }).sort({ createdAt: 1 });
};

/**
 * Returns a user-specific Folder model using a dedicated collection.
 * The collection name is partitioned by username for data isolation.
 * Supports passing a custom connection for multi-cluster querying.
 */
export const getFolderModel = (
  username: string,
  customConnection?: mongoose.Connection,
): FolderModel => {
  if (!username || !username.trim()) {
    throw new Error('Username is required for isolated folders');
  }

  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const collectionName = `${normalized}.${normalized}_folders`;

  if (customConnection) {
    if (customConnection.models[collectionName]) {
      return customConnection.models[collectionName] as FolderModel;
    }
    const model = customConnection.model<FolderType, FolderModel>(
      collectionName,
      folderSchema,
      collectionName,
    );
    if (typeof model?.createIndexes === 'function') {
      model.createIndexes().catch(() => {});
    }
    return model;
  }

  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as FolderModel;
  }

  const model = mongoose.model<FolderType, FolderModel>(
    collectionName,
    folderSchema,
    collectionName,
  );
  if (typeof model?.createIndexes === 'function') {
    model.createIndexes().catch(() => {});
  }
  return model;
};
