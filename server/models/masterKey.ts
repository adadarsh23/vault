import mongoose, { HydratedDocument, InferSchemaType, Model } from 'mongoose'

/**
 * Schema for encrypted master key storage on cloud
 * Stores user's master key encrypted with AES-256-GCM
 */
const encryptedKeySchema = new mongoose.Schema(
  {
    cipherText: {
      type: String,
      required: true,
      description: 'AES-256-GCM encrypted master key',
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
    salt: {
      type: String,
      required: true,
      description: 'Salt for key derivation',
    },
    algorithm: {
      type: String,
      default: 'aes-256-gcm',
      description: 'Encryption algorithm used',
    },
    keyVersion: {
      type: String,
      default: 'v1',
      description: 'Version of the encryption key',
    },
  },
  { _id: false },
)

const masterKeySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    /**
     * Encrypted master key protected with AES-256-GCM
     * Originally encrypted on client with cloud protection key
     */
    encryptedMasterKey: { type: encryptedKeySchema, required: true },
    /**
     * Backup codephrases for account recovery (optional, encrypted separately)
     */
    recoveryPhrasesEncrypted: { type: String, default: null },
    /**
     * Hash of the master key for verification across devices
     * Allows clients to verify they have the correct decrypted key
     */
    masterKeyHash: { type: encryptedKeySchema, required: true },
    /**
     * Rolling history of prior master key hashes for audit/compliance.
     * Values remain encrypted server-side and are truncated to a safe limit.
     */
    masterKeyHashHistory: {
      type: [
        new mongoose.Schema(
          {
            hash: { type: encryptedKeySchema, required: true },
            changedAt: { type: Date, required: true, default: Date.now },
            changedByDeviceId: { type: String, default: null },
            changedByIp: { type: String, default: null },
            changedByUserAgent: { type: String, default: null },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    /**
     * Metadata about key creation and updates
     */
    metadata: {
      derivationAlgorithm: {
        type: String,
        default: 'argon2id',
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
        description: 'Device that created/updated the key',
      },
    },
    /**
     * Security audit trail
     */
    audit: {
      accessCount: { type: Number, default: 0 },
      lastAccessedByDeviceId: { type: String, default: null },
      failedDecryptionAttempts: { type: Number, default: 0 },
      lastFailedAttempt: { type: Date, default: null },
    },
    /**
     * Status tracking
     */
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
)

/**
 * Indexes for optimization
 */
masterKeySchema.index({ userId: 1, isActive: 1 })
masterKeySchema.index({ 'metadata.createdAt': -1 })

export type MasterKeyType = InferSchemaType<typeof masterKeySchema>
export type MasterKeyDocument = HydratedDocument<MasterKeyType>

/**
 * Returns a user-specific MasterKey model using a dedicated collection.
 */
export const getMasterKeyModel = (username: string): Model<MasterKeyType> => {
  if (!username || !username.trim()) {
    throw new Error('Username is required for isolated master keys');
  }
  
  const normalized = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const collectionName = `${normalized}.${normalized}_master_keys`;
  
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as Model<MasterKeyType>;
  }
  
  return mongoose.model<MasterKeyType>(collectionName, masterKeySchema, collectionName);
};

// Removed default MasterKey model to prevent automatic collection creation.
// Code should use getMasterKeyModel(username) instead.
