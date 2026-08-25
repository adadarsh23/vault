import mongoose, { Schema, Document } from 'mongoose';

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
}

const MerkleAuditSchema = new Schema<MerkleAuditRecord>(
  {
    auditId: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, enum: ['clean', 'corrupted', 'warning'], required: true },
    itemCount: { type: Number, default: 0 },
    rootHash: { type: String, required: true },
    algorithm: { type: String, enum: ['blake3', 'sha512', 'sha256'], default: 'blake3' },
    corruptedItemIds: [{ type: String }],
    details: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

const VaultIntegritySchema = new Schema<VaultIntegrityDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true, unique: true },
    username: { type: String, required: true, index: true },
    activeRootHash: { type: String, default: '' },
    algorithm: { type: String, enum: ['blake3', 'sha512', 'sha256'], default: 'blake3' },
    totalLeaves: { type: Number, default: 0 },
    treeDepth: { type: Number, default: 0 },
    lastAuditAt: { type: Date, default: Date.now },
    lastAuditStatus: { type: String, enum: ['clean', 'corrupted', 'warning'], default: 'clean' },
    tamperIncidentCount: { type: Number, default: 0 },
    auditHistory: [MerkleAuditSchema],
  },
  {
    timestamps: true,
    collection: 'vault_integrities',
  },
);

export const VaultIntegrity = mongoose.model<VaultIntegrityDocument>(
  'VaultIntegrity',
  VaultIntegritySchema,
);
