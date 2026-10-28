import mongoose, { Document, HydratedDocument, Model, Schema } from 'mongoose';

/**
 * Interface representing a Telemetry document.
 * Telemetry stores metrics, media playback tracking, error telemetry,
 * and client performance diagnostics.
 */
export interface ITelemetry extends Document {
  userId: mongoose.Types.ObjectId;
  itemId: string;
  event: string;
  timestamp: Date;
  metadata: Record<string, any>;
  ip?: string;
  userAgent?: string;
  browser?: string;
  platform?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TelemetryType = {
  userId: mongoose.Types.ObjectId;
  itemId: string;
  event: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  browser?: string;
  platform?: string;
};

export type TelemetryDocument = HydratedDocument<ITelemetry>;

export interface TelemetryModel extends Model<ITelemetry> {
  recordEvent(data: TelemetryType): Promise<TelemetryDocument>;
}

const TelemetrySchema = new Schema<ITelemetry, TelemetryModel>(
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
    event: {
      type: String,
      required: [true, 'event is required'],
      trim: true,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
      // 90-day TTL index for automatic telemetry pruning
      expires: 7776000,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: () => ({}),
    },
    ip: {
      type: String,
      trim: true,
      default: null,
    },
    userAgent: {
      type: String,
      trim: true,
      default: null,
    },
    browser: {
      type: String,
      trim: true,
      default: null,
    },
    platform: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

/* ------------------ COMPOUND INDEXES ------------------ */
TelemetrySchema.index({ userId: 1, event: 1, timestamp: -1 });
TelemetrySchema.index({ itemId: 1, timestamp: -1 });
TelemetrySchema.index({ event: 1, timestamp: -1 });
TelemetrySchema.index({ userId: 1, timestamp: -1 });

/* ------------------ STATIC METHODS ------------------ */
TelemetrySchema.statics.recordEvent = function (data: TelemetryType) {
  return this.create({
    ...data,
    timestamp: data.timestamp || new Date(),
  });
};

/**
 * Returns a user-specific Telemetry model using a dedicated collection.
 * Supports passing an optional custom connection for multi-cluster querying.
 */
export const getTelemetryModel = (
  username: string,
  customConnection?: mongoose.Connection,
): TelemetryModel => {
  if (!username || !username.trim()) {
    throw new Error('Username is required for isolated telemetry');
  }

  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const collectionName = `${normalized}.${normalized}_telemetry`;

  if (customConnection) {
    if (customConnection.models[collectionName]) {
      return customConnection.models[collectionName] as TelemetryModel;
    }
    const model = customConnection.model<ITelemetry, TelemetryModel>(
      collectionName,
      TelemetrySchema,
      collectionName,
    );
    if (typeof model?.createIndexes === 'function') {
      model.createIndexes().catch(() => {});
    }
    return model;
  }

  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as TelemetryModel;
  }

  const model = mongoose.model<ITelemetry, TelemetryModel>(
    collectionName,
    TelemetrySchema,
    collectionName,
  );
  if (typeof model?.createIndexes === 'function') {
    model.createIndexes().catch(() => {});
  }
  return model;
};
