import mongoose from 'mongoose';

const TelemetrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  itemId: { type: String, required: true, index: true },
  event: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  ip: String,
  userAgent: String,
  browser: String,
  platform: String,
});

export type TelemetryType = mongoose.InferSchemaType<typeof TelemetrySchema>;

/**
 * Returns a user-specific Telemetry model using a dedicated collection.
 */
export const getTelemetryModel = (username: string): mongoose.Model<TelemetryType> => {
  if (!username || !username.trim()) {
    throw new Error('Username is required for isolated telemetry');
  }

  const normalized = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  const collectionName = `${normalized}.${normalized}_telemetry`;

  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName] as mongoose.Model<TelemetryType>;
  }

  return mongoose.model<TelemetryType>(collectionName, TelemetrySchema, collectionName);
};

// Removed default Telemetry model to prevent automatic collection creation.
// Code should use getTelemetryModel(username) instead.
