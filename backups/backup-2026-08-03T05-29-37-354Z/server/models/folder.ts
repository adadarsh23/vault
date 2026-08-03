import mongoose, { Schema, Document, Model } from 'mongoose';

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

const folderSchema = new Schema<FolderType>(
  {
    userId: { type: String, required: true, index: true },
    username: { type: String, required: true, index: true },
    name: { type: Schema.Types.Mixed, required: true },
    nameHash: { type: String, required: false, index: true },
    itemType: { type: String, required: true },
    parentId: { type: String, default: null, index: true },
  },
  { timestamps: true }
);

folderSchema.index(
  { userId: 1, itemType: 1, nameHash: 1, parentId: 1 },
  { unique: true, partialFilterExpression: { nameHash: { $exists: true } } }
);

export const getFolderModel = (username: string): Model<FolderType> => {
  const collectionName = `${username}.${username}_folders`;
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as Model<FolderType>;
  }
  return mongoose.model<FolderType>(collectionName, folderSchema, collectionName);
};

// Removed default Folder model to prevent automatic collection creation.
// Code should use getFolderModel(username) instead.
