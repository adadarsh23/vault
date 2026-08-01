import mongoose, { Schema, Document, Model } from 'mongoose'
import crypto from 'crypto'

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
  name: string
  email: string
  username: string
  subject: ContactSubject
  message: string
  ipAddress?: string
  userAgent?: string
  geolocation?: Record<string, any>
  status: ContactStatus
  priority: ContactPriority
  referenceId: string
  isDeleted: boolean
  deletedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Contact Model
 * Handles user inquiries, support tickets, and security reports.
 */

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────
const ContactSchema = new Schema<IContact>(
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
      required: true,
      index: true,
    },

    message: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 2000,
      trim: true,
    },

    ipAddress: {
      type: String,
      index: true,
    },

    userAgent: String,

    geolocation: {
      type: Schema.Types.Mixed,
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
      index: true,
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
    timestamps: true, // auto createdAt & updatedAt
    versionKey: false,
  }
)

// ─────────────────────────────────────────────
// Indexes (important for scaling)
// ─────────────────────────────────────────────
ContactSchema.index({ createdAt: -1 })
ContactSchema.index({ email: 1, status: 1 })
ContactSchema.index({ subject: 1, priority: 1 })

// ─────────────────────────────────────────────
// Pre-save Hook
// ─────────────────────────────────────────────
ContactSchema.pre<IContact>('save', function () {
  // Generate reference ID safely
  if (!this.referenceId) {
    this.referenceId =
      'VLT-' + crypto.randomBytes(4).toString('hex').toUpperCase()
  }

  // Auto priority logic
  switch (this.subject) {
    case ContactSubject.SECURITY:
      this.priority = ContactPriority.HIGH
      break
    case ContactSubject.TECH:
    case ContactSubject.VAULT:
      this.priority = ContactPriority.MEDIUM
      break
    default:
      this.priority = ContactPriority.LOW
  }
})

// ─────────────────────────────────────────────
// Static Methods (clean API layer)
// ─────────────────────────────────────────────
interface ContactModel extends Model<IContact> {
  findActive(): Promise<IContact[]>
}

ContactSchema.statics.findActive = function () {
  return this.find({ isDeleted: false }).sort({ createdAt: -1 })
}

// ─────────────────────────────────────────────
// Model Export
// ─────────────────────────────────────────────
export const Contact = mongoose.model<IContact, ContactModel>(
  'Contact',
  ContactSchema
)