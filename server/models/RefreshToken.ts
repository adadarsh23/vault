import mongoose, { Document, Model, Schema, UpdateWriteOpResult } from 'mongoose';

/**
 * Interface representing a RefreshToken document.
 */
export interface IRefreshToken extends Document {
  userId: mongoose.Types.ObjectId;
  familyId: string;
  sessionId: string;
  tokenHash: string;
  isRevoked: boolean;
  rotatedAt?: Date | null;
  replacementTokenHash?: string | null;
  ip: string;
  userAgent: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  revoke(replacementHash?: string): Promise<this>;
  isValid(): boolean;
}

/**
 * Model interface with custom static methods for RefreshToken.
 */
export interface RefreshTokenModel extends Model<IRefreshToken> {
  revokeFamily(familyId: string): Promise<UpdateWriteOpResult>;
  revokeSession(sessionId: string): Promise<UpdateWriteOpResult>;
  revokeUserTokens(userId: mongoose.Types.ObjectId | string): Promise<UpdateWriteOpResult>;
  findValidByTokenHash(tokenHash: string): Promise<IRefreshToken | null>;
}

const refreshTokenSchema = new Schema<IRefreshToken, RefreshTokenModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    familyId: {
      type: String,
      required: [true, 'familyId is required'],
      trim: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: [true, 'sessionId is required'],
      trim: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: [true, 'tokenHash is required'],
      trim: true,
      index: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
      index: true,
    },
    rotatedAt: {
      type: Date,
      default: null,
    },
    replacementTokenHash: {
      type: String,
      default: null,
      trim: true,
    },
    ip: {
      type: String,
      default: 'unknown',
      trim: true,
    },
    userAgent: {
      type: String,
      default: 'unknown',
      trim: true,
    },
    expiresAt: {
      type: Date,
      required: [true, 'expiresAt is required'],
      // MongoDB TTL index: automatically deletes document once expiresAt has passed
      expires: 0,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'refreshtokens',
    versionKey: false,
  },
);

/* ------------------ COMPOUND INDEXES ------------------ */
refreshTokenSchema.index({ tokenHash: 1, isRevoked: 1 });
refreshTokenSchema.index({ familyId: 1, isRevoked: 1 });
refreshTokenSchema.index({ userId: 1, isRevoked: 1 });
refreshTokenSchema.index({ sessionId: 1, isRevoked: 1 });
refreshTokenSchema.index({ userId: 1, createdAt: -1 });

/* ------------------ INSTANCE METHODS ------------------ */
refreshTokenSchema.methods.revoke = async function (replacementHash?: string) {
  this.isRevoked = true;
  this.rotatedAt = new Date();
  if (replacementHash) {
    this.replacementTokenHash = replacementHash;
  }
  return this.save();
};

refreshTokenSchema.methods.isValid = function () {
  return !this.isRevoked && this.expiresAt.getTime() > Date.now();
};

/* ------------------ STATIC METHODS ------------------ */
refreshTokenSchema.statics.revokeFamily = function (familyId: string) {
  return this.updateMany(
    { familyId: familyId.trim(), isRevoked: false },
    { $set: { isRevoked: true, rotatedAt: new Date() } },
  );
};

refreshTokenSchema.statics.revokeSession = function (sessionId: string) {
  return this.updateMany(
    { sessionId: sessionId.trim(), isRevoked: false },
    { $set: { isRevoked: true, rotatedAt: new Date() } },
  );
};

refreshTokenSchema.statics.revokeUserTokens = function (userId: mongoose.Types.ObjectId | string) {
  return this.updateMany(
    { userId, isRevoked: false },
    { $set: { isRevoked: true, rotatedAt: new Date() } },
  );
};

refreshTokenSchema.statics.findValidByTokenHash = function (tokenHash: string) {
  return this.findOne({
    tokenHash: tokenHash.trim(),
    isRevoked: false,
    expiresAt: { $gt: new Date() },
  });
};

/* ------------------ FACTORY & MODEL EXPORT ------------------ */
export const getRefreshTokenModel = (customConnection?: mongoose.Connection): RefreshTokenModel => {
  if (customConnection) {
    if (customConnection.models.RefreshToken) {
      return customConnection.models.RefreshToken as RefreshTokenModel;
    }
    const model = customConnection.model<IRefreshToken, RefreshTokenModel>(
      'RefreshToken',
      refreshTokenSchema,
      'refreshtokens',
    );
    if (typeof model?.createIndexes === 'function') {
      model.createIndexes().catch(() => {});
    }
    return model;
  }

  if (mongoose.models.RefreshToken) {
    return mongoose.models.RefreshToken as RefreshTokenModel;
  }
  const model = mongoose.model<IRefreshToken, RefreshTokenModel>(
    'RefreshToken',
    refreshTokenSchema,
    'refreshtokens',
  );
  if (typeof model?.createIndexes === 'function') {
    model.createIndexes().catch(() => {});
  }
  return model;
};

export const RefreshToken: RefreshTokenModel = getRefreshTokenModel();
