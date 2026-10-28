import mongoose, { Schema, Document, Model, HydratedDocument } from 'mongoose';
import crypto from 'crypto';

// ─────────────────────────────────────────────
// Enums (centralized for reuse & type safety)
// ─────────────────────────────────────────────
export enum ContactStatus {
  UNREAD = 'unread',
  READ = 'read',
  REPLIED = 'replied',
  ARCHIVED = 'archived',
}

export enum ContactPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum ContactSubject {
  GENERAL = 'General Inquiry',
  TECH = 'Technical Support',
  SECURITY = 'Security Vulnerability',
  VAULT = 'Vault Access',
  FEATURE = 'Feature Request',
  PRIVACY = 'Privacy Request',
  OTHER = 'Other',
}

// ─────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────
export interface IContact extends Document {
  name: string;
  email: string;
  username: string;
  subject: ContactSubject;
  message: string;
  ipAddress?: string;
  userAgent?: string;
  geolocation?: Record<string, any>;
  status: ContactStatus;
  priority: ContactPriority;
  referenceId: string;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  markRead(): Promise<this>;
  markReplied(): Promise<this>;
}

export type ContactDocument = HydratedDocument<IContact>;

export interface ContactModel extends Model<IContact> {
  findActive(): Promise<IContact[]>;
  findByReference(referenceId: string): Promise<IContact | null>;
  softDelete(referenceId: string): Promise<IContact | null>;
}

/**
 * Contact Model
 * Handles user inquiries, support tickets, and security reports.
 */

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────
const ContactSchema = new Schema<IContact, ContactModel>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },

    username: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
      index: true,
    },

    subject: {
      type: String,
      enum: Object.values(ContactSubject),
      required: [true, 'Subject is required'],
      index: true,
    },

    message: {
      type: String,
      required: [true, 'Message is required'],
      minlength: [10, 'Message must be at least 10 characters'],
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
      trim: true,
    },

    ipAddress: {
      type: String,
      trim: true,
      index: true,
    },

    userAgent: {
      type: String,
      trim: true,
    },

    geolocation: {
      type: Schema.Types.Mixed,
      default: null,
    },

    status: {
      type: String,
      enum: Object.values(ContactStatus),
      default: ContactStatus.UNREAD,
      index: true,
    },

    priority: {
      type: String,
      enum: Object.values(ContactPriority),
      default: ContactPriority.LOW,
      index: true,
    },

    referenceId: {
      type: String,
      unique: true,
      trim: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'contacts',
  },
);

// ─────────────────────────────────────────────
// Indexes (important for scaling)
// ─────────────────────────────────────────────
ContactSchema.index({ createdAt: -1 });
ContactSchema.index({ email: 1, status: 1 });
ContactSchema.index({ subject: 1, priority: 1 });
ContactSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });
ContactSchema.index({ isDeleted: 1, priority: 1, createdAt: -1 });
ContactSchema.index({ username: 1, createdAt: -1 });
ContactSchema.index({ ipAddress: 1, createdAt: -1 });

// ─────────────────────────────────────────────
// Pre-save Hook
// ─────────────────────────────────────────────
ContactSchema.pre('save', function () {
  // Generate high-entropy reference ID safely if not present
  if (!this.referenceId) {
    this.referenceId = 'VLT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
  }

  // Auto priority logic based on security criticality
  switch (this.subject) {
    case ContactSubject.SECURITY:
      this.priority = ContactPriority.HIGH;
      break;
    case ContactSubject.TECH:
    case ContactSubject.VAULT:
      this.priority = ContactPriority.MEDIUM;
      break;
    default:
      this.priority = ContactPriority.LOW;
  }
});

// ─────────────────────────────────────────────
// Instance Methods
// ─────────────────────────────────────────────
ContactSchema.methods.markRead = async function () {
  this.status = ContactStatus.READ;
  return this.save();
};

ContactSchema.methods.markReplied = async function () {
  this.status = ContactStatus.REPLIED;
  return this.save();
};

// ─────────────────────────────────────────────
// Static Methods (clean API layer)
// ─────────────────────────────────────────────
ContactSchema.statics.findActive = function () {
  return this.find({ isDeleted: false }).sort({ createdAt: -1 }).allowDiskUse(true);
};

ContactSchema.statics.findByReference = function (referenceId: string) {
  return this.findOne({ referenceId: referenceId.trim().toUpperCase(), isDeleted: false });
};

ContactSchema.statics.softDelete = function (referenceId: string) {
  return this.findOneAndUpdate(
    { referenceId: referenceId.trim().toUpperCase(), isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
    { new: true },
  );
};

// ─────────────────────────────────────────────
// Model Factory & Export
// ─────────────────────────────────────────────
export const getContactModel = (customConnection?: mongoose.Connection): ContactModel => {
  const collectionName = 'contacts';
  if (customConnection) {
    if (customConnection.models.Contact) {
      return customConnection.models.Contact as ContactModel;
    }
    const model = customConnection.model<IContact, ContactModel>(
      'Contact',
      ContactSchema,
      collectionName,
    );
    if (typeof model?.createIndexes === 'function') {
      model.createIndexes().catch(() => {});
    }
    return model;
  }

  if (mongoose.models.Contact) {
    return mongoose.models.Contact as ContactModel;
  }
  const model = mongoose.model<IContact, ContactModel>('Contact', ContactSchema, collectionName);
  if (typeof model?.createIndexes === 'function') {
    model.createIndexes().catch(() => {});
  }
  return model;
};

export const Contact: ContactModel = getContactModel();
