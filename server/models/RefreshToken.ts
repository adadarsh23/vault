import mongoose, { Document, Schema } from 'mongoose';

export interface IRefreshToken extends Document {
  userId: mongoose.Types.ObjectId;
  familyId: string;
  sessionId: string;
  tokenHash: string;
  isRevoked: boolean;
  ip: string;
  userAgent: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    isRevoked: { type: Boolean, default: false, index: true },
    ip: { type: String, default: 'unknown' },
    userAgent: { type: String, default: 'unknown' },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

export const RefreshToken =
  mongoose.models.RefreshToken || mongoose.model<IRefreshToken>('RefreshToken', refreshTokenSchema);
