import mongoose, { Document, HydratedDocument, Model, Schema } from 'mongoose';

/**
 * Interface representing a TotalUser mirror document.
 * TotalUser maintains an optimized, fast-lookup directory of registered usernames
 * to prevent duplicates, detect collisions, and power user existence checks.
 */
export interface ITotalUser extends Document {
  exists: boolean;
  exactMatch: boolean;
  username: string;
  userId: string | null;
  createdDate: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TotalUserDocument = HydratedDocument<ITotalUser>;

export interface TotalUserModel extends Model<ITotalUser> {
  mirrorUser(username: string, userId: string, createdDate?: Date): Promise<TotalUserDocument>;
  isRegistered(username: string): Promise<boolean>;
  findByUsernameNormalized(username: string): Promise<TotalUserDocument | null>;
}

const totalUserSchema = new Schema<ITotalUser, TotalUserModel>(
  {
    exists: {
      type: Boolean,
      required: true,
      default: true,
    },
    exactMatch: {
      type: Boolean,
      required: true,
      default: true,
    },
    username: {
      type: String,
      required: [true, 'username is required'],
      trim: true,
      lowercase: true,
    },
    userId: {
      type: String,
      default: null,
      trim: true,
    },
    createdDate: {
      type: Date,
      default: () => new Date(),
    },
  },
  {
    collection: 'total_users',
    timestamps: true,
    versionKey: false,
  },
);

/* ------------------ INDEXES ------------------ */
totalUserSchema.index({ username: 1 }, { unique: true });
totalUserSchema.index({ userId: 1 }, { sparse: true });
totalUserSchema.index({ exists: 1, exactMatch: 1 });

/* ------------------ STATIC METHODS ------------------ */
totalUserSchema.statics.mirrorUser = async function (
  username: string,
  userId: string,
  createdDate?: Date,
) {
  const normalized = username.trim().toLowerCase();
  return this.findOneAndUpdate(
    { username: normalized },
    {
      $set: {
        exists: true,
        exactMatch: true,
        userId: userId.trim(),
        createdDate: createdDate || new Date(),
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );
};

totalUserSchema.statics.isRegistered = async function (username: string): Promise<boolean> {
  const normalized = username.trim().toLowerCase();
  const doc = await this.findOne({ username: normalized, exists: true }).select('_id').lean();
  return Boolean(doc);
};

totalUserSchema.statics.findByUsernameNormalized = function (username: string) {
  const normalized = username.trim().toLowerCase();
  return this.findOne({ username: normalized });
};

/* ------------------ FACTORY & MODEL EXPORT ------------------ */
export const getTotalUserModel = (customConnection?: mongoose.Connection): TotalUserModel => {
  if (customConnection) {
    if (customConnection.models.TotalUser) {
      return customConnection.models.TotalUser as TotalUserModel;
    }
    const model = customConnection.model<ITotalUser, TotalUserModel>(
      'TotalUser',
      totalUserSchema,
      'total_users',
    );
    if (typeof model?.createIndexes === 'function') {
      model.createIndexes().catch(() => {});
    }
    return model;
  }

  if (mongoose.models.TotalUser) {
    return mongoose.models.TotalUser as TotalUserModel;
  }
  const model = mongoose.model<ITotalUser, TotalUserModel>(
    'TotalUser',
    totalUserSchema,
    'total_users',
  );
  if (typeof model?.createIndexes === 'function') {
    model.createIndexes().catch(() => {});
  }
  return model;
};

export const TotalUser: TotalUserModel = getTotalUserModel();
