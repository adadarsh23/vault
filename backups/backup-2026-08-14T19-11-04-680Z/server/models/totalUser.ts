import mongoose, { InferSchemaType, Model } from 'mongoose';

const totalUserSchema = new mongoose.Schema(
  {
    exists: { type: Boolean, required: true },
    exactMatch: { type: Boolean, required: true },
    username: { type: String, required: true, trim: true, lowercase: true },
    userId: { type: String, default: null },
    createdDate: { type: Date, default: null },
  },
  {
    collection: 'total_users',
    versionKey: false,
  }
);

totalUserSchema.index({ username: 1 }, { unique: true });

type TotalUserShape = InferSchemaType<typeof totalUserSchema>;
type TotalUserModel = Model<TotalUserShape>;

export const TotalUser =
  (mongoose.models.TotalUser as TotalUserModel) ||
  mongoose.model<TotalUserShape>('TotalUser', totalUserSchema);
