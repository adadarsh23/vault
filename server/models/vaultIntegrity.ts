import mongoose, { Schema, Document, Model } from 'mongoose';

export interface MerkleAuditRecord {
  auditId: string;
  timestamp: Date;
  status: 'clean' | 'corrupted' | 'warning';
  itemCount: number;
  rootHash: string;
  algorithm: 'blake3' | 'sha512' | 'sha256';
  corruptedItemIds: string[];
  details?: Record<string, any>;
}

export interface VaultIntegrityDocument extends Document {
  userId: mongoose.Types.ObjectId;
  username: string;
  activeRootHash: string;
  algorithm: 'blake3' | 'sha512' | 'sha256';
  totalLeaves: number;
  treeDepth: number;
  lastAuditAt: Date;
  lastAuditStatus: 'clean' | 'corrupted' | 'warning';
  tamperIncidentCount: number;
  auditHistory: MerkleAuditRecord[];
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  recordAudit(auditRecord: MerkleAuditRecord): Promise<this>;
}

export interface VaultIntegrityModel extends Model<VaultIntegrityDocument> {
  findByUserId(userId: mongoose.Types.ObjectId | string): Promise<VaultIntegrityDocument | null>;
}

const MerkleAuditSchema = new Schema<MerkleAuditRecord>(
  {
    auditId: { type: String, required: [true, 'auditId is required'], trim: true },
    timestamp: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['clean', 'corrupted', 'warning'],
      required: [true, 'status is required'],
    },
    itemCount: { type: Number, default: 0, min: 0 },
    rootHash: { type: String, required: [true, 'rootHash is required'], trim: true },
    algorithm: {
      type: String,
      enum: ['blake3', 'sha512', 'sha256'],
      default: 'blake3',
      trim: true,
    },
    corruptedItemIds: [{ type: String, trim: true }],
    details: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  { _id: false },
);

const VaultIntegritySchema = new Schema<VaultIntegrityDocument, VaultIntegrityModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      unique: true,
    },
    username: {
      type: String,
      required: [true, 'username is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    activeRootHash: {
      type: String,
      default: '',
      trim: true,
    },
    algorithm: {
      type: String,
      enum: ['blake3', 'sha512', 'sha256'],
      default: 'blake3',
      trim: true,
    },
    totalLeaves: {
      type: Number,
      default: 0,
      min: 0,
    },
    treeDepth: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastAuditAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastAuditStatus: {
      type: String,
      enum: ['clean', 'corrupted', 'warning'],
      default: 'clean',
      index: true,
    },
    tamperIncidentCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    auditHistory: {
      type: [MerkleAuditSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'vault_integrities',
    versionKey: false,
  },
);

/* ------------------ COMPOUND INDEXES ------------------ */
VaultIntegritySchema.index({ username: 1, lastAuditStatus: 1 });
VaultIntegritySchema.index({ lastAuditAt: -1 });
VaultIntegritySchema.index({ tamperIncidentCount: -1 });

/* ------------------ PRE-SAVE HOOKS ------------------ */
// Bounding: Ensure auditHistory does not exceed 100 entries to prevent 16MB document cap
VaultIntegritySchema.pre('save', function () {
  if (Array.isArray(this.auditHistory) && this.auditHistory.length > 100) {
    this.auditHistory = this.auditHistory.slice(-100);
  }
});

/* ------------------ INSTANCE METHODS ------------------ */
VaultIntegritySchema.methods.recordAudit = async function (auditRecord: MerkleAuditRecord) {
  this.lastAuditAt = auditRecord.timestamp || new Date();
  this.lastAuditStatus = auditRecord.status;
  this.activeRootHash = auditRecord.rootHash;
  this.algorithm = auditRecord.algorithm;
  this.totalLeaves = auditRecord.itemCount;

  if (auditRecord.status === 'corrupted') {
    this.tamperIncidentCount += 1;
  }

  if (!Array.isArray(this.auditHistory)) {
    this.auditHistory = [];
  }
  this.auditHistory.push(auditRecord);

  if (this.auditHistory.length > 100) {
    this.auditHistory = this.auditHistory.slice(-100);
  }

  return this.save();
};

/* ------------------ STATIC METHODS ------------------ */
VaultIntegritySchema.statics.findByUserId = function (userId: mongoose.Types.ObjectId | string) {
  return this.findOne({ userId });
};

/**
 * Returns the VaultIntegrity model for the default or provided connection.
 */
export const getVaultIntegrityModel = (
  customConnection?: mongoose.Connection,
): VaultIntegrityModel => {
  const collectionName = 'vault_integrities';
  if (customConnection) {
    if (customConnection.models.VaultIntegrity) {
      return customConnection.models.VaultIntegrity as VaultIntegrityModel;
    }
    const model = customConnection.model<VaultIntegrityDocument, VaultIntegrityModel>(
      'VaultIntegrity',
      VaultIntegritySchema,
      collectionName,
    );
    if (typeof model?.createIndexes === 'function') {
      model.createIndexes().catch(() => {});
    }
    return model;
  }

  if (mongoose.models.VaultIntegrity) {
    return mongoose.models.VaultIntegrity as VaultIntegrityModel;
  }

  const model = mongoose.model<VaultIntegrityDocument, VaultIntegrityModel>(
    'VaultIntegrity',
    VaultIntegritySchema,
    collectionName,
  );
  if (typeof model?.createIndexes === 'function') {
    model.createIndexes().catch(() => {});
  }
  return model;
};

export const VaultIntegrity: VaultIntegrityModel = getVaultIntegrityModel();
