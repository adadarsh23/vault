import mongoose, { Document, HydratedDocument, Model, Schema } from 'mongoose';

/**
 * Interface representing an encrypted key structure (AES-256-GCM).
 */
export interface IEncryptedKeyPayload {
  cipherText: string;
  iv: string;
  authTag: string;
  salt?: string | null;
  algorithm?: string;
  keyVersion?: string;
}

export interface IMasterKeyHistoryEntry {
  hash: IEncryptedKeyPayload;
  changedAt: Date;
  changedByDeviceId?: string | null;
  changedByIp?: string | null;
  changedByUserAgent?: string | null;
}

export interface IMasterKeyMetadata {
  derivationAlgorithm?: string;
  derivationParams?: {
    memory?: number;
    iterations?: number;
    parallelism?: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
  lastAccessedAt?: Date;
  deviceId?: string;
}

export interface IMasterKeyAudit {
  accessCount: number;
  lastAccessedByDeviceId?: string | null;
  failedDecryptionAttempts: number;
  lastFailedAttempt?: Date | null;
}

/**
 * Interface representing a MasterKey document.
 */
export interface IMasterKey extends Document {
  userId: string;
  encryptedMasterKey: IEncryptedKeyPayload;
  recoveryPhrasesEncrypted?: string | null;
  masterKeyHash: IEncryptedKeyPayload;
  masterKeyHashHistory: IMasterKeyHistoryEntry[];
  metadata: IMasterKeyMetadata;
  audit: IMasterKeyAudit;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MasterKeyType = {
  userId: string;
  encryptedMasterKey: IEncryptedKeyPayload;
  recoveryPhrasesEncrypted?: string | null;
  masterKeyHash: IEncryptedKeyPayload;
  masterKeyHashHistory?: IMasterKeyHistoryEntry[];
  metadata?: IMasterKeyMetadata;
  audit?: IMasterKeyAudit;
  isActive?: boolean;
  isDeleted?: boolean;
  deletedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type MasterKeyDocument = HydratedDocument<IMasterKey>;

export interface MasterKeyModel extends Model<IMasterKey> {
  recordAccess(userId: string, deviceId?: string): Promise<MasterKeyDocument | null>;
  recordFailedAttempt(userId: string): Promise<MasterKeyDocument | null>;
  findByUserIdActive(userId: string): Promise<MasterKeyDocument | null>;
}

/**
 * Sub-schema for AES-256-GCM encrypted key payloads.
 */
const encryptedKeySchema = new Schema<IEncryptedKeyPayload>(
  {
    cipherText: {
      type: String,
      required: [true, 'cipherText is required'],
      trim: true,
      description: 'AES-256-GCM encrypted master key',
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
    salt: {
      type: String,
      required: false,
      default: null,
      trim: true,
      description: 'Salt for key derivation',
    },
    algorithm: {
      type: String,
      default: 'aes-256-gcm',
      trim: true,
      description: 'Encryption algorithm used',
    },
    keyVersion: {
      type: String,
      default: 'v1',
      trim: true,
      description: 'Version of the encryption key',
    },
  },
  { _id: false },
);

const masterKeySchema = new Schema<IMasterKey, MasterKeyModel>(
  {
    userId: {
      type: String,
      required: [true, 'userId is required'],
      unique: true,
      trim: true,
    },
    encryptedMasterKey: {
      type: encryptedKeySchema,
      required: [true, 'encryptedMasterKey is required'],
    },
    recoveryPhrasesEncrypted: {
      type: String,
      default: null,
      trim: true,
    },
    masterKeyHash: {
      type: encryptedKeySchema,
      required: [true, 'masterKeyHash is required'],
    },
    masterKeyHashHistory: {
      type: [
        new Schema<IMasterKeyHistoryEntry>(
          {
            hash: { type: encryptedKeySchema, required: true },
            changedAt: { type: Date, required: true, default: Date.now },
            changedByDeviceId: { type: String, default: null, trim: true },
            changedByIp: { type: String, default: null, trim: true },
            changedByUserAgent: { type: String, default: null, trim: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    metadata: {
      derivationAlgorithm: {
        type: String,
        default: 'argon2id',
        trim: true,
        description: 'Algorithm used to derive master key from password',
      },
      derivationParams: {
        memory: { type: Number, default: 65536 },
        iterations: { type: Number, default: 3 },
        parallelism: { type: Number, default: 4 },
      },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now },
      lastAccessedAt: { type: Date, default: Date.now },
      deviceId: {
        type: String,
        trim: true,
        description: 'Device that created/updated the key',
      },
    },
    audit: {
      accessCount: { type: Number, default: 0, min: 0 },
      lastAccessedByDeviceId: { type: String, default: null, trim: true },
      failedDecryptionAttempts: { type: Number, default: 0, min: 0 },
      lastFailedAttempt: { type: Date, default: null },
    },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/* ------------------ COMPOUND INDEXES ------------------ */
masterKeySchema.index({ userId: 1, isActive: 1, isDeleted: 1 });
masterKeySchema.index({ userId: 1, isDeleted: 1 });
masterKeySchema.index({ 'metadata.createdAt': -1 });
masterKeySchema.index({ 'metadata.deviceId': 1 });

/* ------------------ PRE-SAVE HOOKS ------------------ */
// Bounding: Ensure masterKeyHashHistory does not exceed safe audit limit (50 entries)
masterKeySchema.pre('save', function () {
  if (Array.isArray(this.masterKeyHashHistory) && this.masterKeyHashHistory.length > 50) {
    this.masterKeyHashHistory = this.masterKeyHashHistory.slice(-50);
  }
});

/* ------------------ STATIC METHODS ------------------ */
masterKeySchema.statics.recordAccess = function (userId: string, deviceId?: string) {
  const update: Record<string, any> = {
    $inc: { 'audit.accessCount': 1 },
    $set: {
      'metadata.lastAccessedAt': new Date(),
      'audit.lastAccessedByDeviceId': deviceId || null,
    },
  };
  return this.findOneAndUpdate({ userId: userId.trim(), isDeleted: false }, update, { new: true });
};

masterKeySchema.statics.recordFailedAttempt = function (userId: string) {
  return this.findOneAndUpdate(
    { userId: userId.trim(), isDeleted: false },
    {
      $inc: { 'audit.failedDecryptionAttempts': 1 },
      $set: { 'audit.lastFailedAttempt': new Date() },
    },
    { new: true },
  );
};

masterKeySchema.statics.findByUserIdActive = function (userId: string) {
  return this.findOne({
    userId: userId.trim(),
    isActive: true,
    isDeleted: false,
  });
};

/**
 * Returns a user-specific MasterKey model using a dedicated collection.
 * Supports passing an optional custom connection for multi-cluster querying.
 */
export const getMasterKeyModel = (
  username: string,
  customConnection?: mongoose.Connection,
): MasterKeyModel => {
  if (!username || !username.trim()) {
    throw new Error('Username is required for isolated master keys');
  }

  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const collectionName = `${normalized}.${normalized}_master_keys`;

  if (customConnection) {
    if (customConnection.models[collectionName]) {
      return customConnection.models[collectionName] as MasterKeyModel;
    }
    const model = customConnection.model<IMasterKey, MasterKeyModel>(
      collectionName,
      masterKeySchema,
      collectionName,
    );
    if (typeof model?.createIndexes === 'function') {
      model.createIndexes().catch(() => {});
    }
    return model;
  }

  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as MasterKeyModel;
  }

  const model = mongoose.model<IMasterKey, MasterKeyModel>(
    collectionName,
    masterKeySchema,
    collectionName,
  );
  if (typeof model?.createIndexes === 'function') {
    model.createIndexes().catch(() => {});
  }
  return model;
};
