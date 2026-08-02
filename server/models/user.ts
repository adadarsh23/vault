import mongoose, { HydratedDocument, InferSchemaType, Model } from 'mongoose'


/* ------------------ COMMON HELPERS ------------------ */

const baseSchemaOptions = {
  _id: false,
  versionKey: false as const,
}

const softDeleteFields = {
  deletedAt: { type: Date, default: null, index: true },
  isDeleted: { type: Boolean, default: false, index: true },
}

const timestampFields = {
  createdAt: { type: Date, default: Date.now, immutable: true },
  updatedAt: { type: Date, default: Date.now },
}

const nullableTrimmedString = { type: String, default: null, trim: true }

/* ------------------ ENCRYPTED FIELD ------------------ */

const encryptedFieldSchema = new mongoose.Schema(
  {
    cipherText: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    algorithm: {
      type: String,
      enum: ['aes-256-gcm'],
      default: 'aes-256-gcm',
    },
    salt: { type: String, default: null },
    keyVersion: { type: String, default: 'v1' },
  },
  baseSchemaOptions,
)

/* ------------------ FILE ITEM ------------------ */

const fileItemSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true, index: true },
    fileName: { type: String, required: true, trim: true },
    filePath: { type: String, required: true },
    mimeType: { type: String, required: true, lowercase: true },
    size: { type: Number, required: true, min: 1, max: 1024 * 1024 * 500 }, // 500MB cap

    ...timestampFields,
    ...softDeleteFields,
  },
  baseSchemaOptions,
)

/* ------------------ NOTE ------------------ */

const noteSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: encryptedFieldSchema, required: true },

    ...timestampFields,
    ...softDeleteFields,
  },
  baseSchemaOptions,
)

/* ------------------ PASSWORD ------------------ */

const passwordSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true, index: true },
    label: { type: String, required: true, trim: true },
    username: { type: String, trim: true, default: '' },
    url: { type: String, trim: true, default: '' },

    password: { type: encryptedFieldSchema, required: true },
    notes: { type: encryptedFieldSchema, default: null },

    ...timestampFields,
    ...softDeleteFields,
  },
  baseSchemaOptions,
)

/* ------------------ SECRET KEY ------------------ */

const secretKeySchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true, index: true },
    label: { type: String, required: true, trim: true },
    value: { type: encryptedFieldSchema, required: true },
    description: { type: String, trim: true, default: '' },

    ...timestampFields,
    ...softDeleteFields,
  },
  baseSchemaOptions,
)

/* ------------------ LOGIN HISTORY ------------------ */

const loginHistorySchema = new mongoose.Schema(
  {
    loggedInAt: { type: Date, default: Date.now },
    ipAddress: { type: String, default: 'unknown' },
    userAgent: { type: String, default: 'unknown' },
    deviceId: { type: String, default: 'unknown' },
    sessionId: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED'],
      default: 'SUCCESS',
    },
    errorCode: { type: String, default: null },
    failureReason: { type: String, default: null },
    requestContext: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  baseSchemaOptions,
)

/* ------------------ ACTIVITY LOG ------------------ */

const activityLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    itemId: { type: String, default: null },
    ipAddress: { type: String, default: 'unknown' },
    deviceId: { type: String, default: 'unknown' },
    createdAt: { type: Date, default: Date.now },

    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  baseSchemaOptions,
)

/* ------------------ HISTORY ------------------ */

const passwordHistorySchema = new mongoose.Schema(
  {
    hash: { type: encryptedFieldSchema, required: true },
    changedAt: { type: Date, default: Date.now },
  },
  baseSchemaOptions,
)

const masterKeyHistorySchema = new mongoose.Schema(
  {
    masterKey: { type: encryptedFieldSchema, required: true },
    masterKeyHash: { type: encryptedFieldSchema, default: null },
    changedAt: { type: Date, default: Date.now },
  },
  baseSchemaOptions,
)

/* ------------------ SESSION ------------------ */

const sessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    familyId: { type: String, default: null, index: true },
    deviceId: { type: String, required: true },
    deviceName: { type: String, default: '' },

    refreshTokenHash: {
      type: String,
      required: true,
      select: false,
    },

    createdAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date, default: Date.now },
    lastRotatedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },

    revokedAt: { type: Date, default: null },

    ipAddress: { type: String, default: 'unknown' },
    userAgent: { type: String, default: 'unknown' },
    loginMethod: {
      type: String,
      enum: ['password', 'refresh', 'unknown'],
      default: 'password',
    },
    requestContext: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  baseSchemaOptions,
)

const websiteMetadataSchema = new mongoose.Schema(
  {
    origin: nullableTrimmedString,
    referer: nullableTrimmedString,
    host: nullableTrimmedString,
    forwardedHost: nullableTrimmedString,
    protocol: nullableTrimmedString,
    method: nullableTrimmedString,
    path: nullableTrimmedString,
    acceptLanguage: nullableTrimmedString,
    secFetchSite: nullableTrimmedString,
    secFetchMode: nullableTrimmedString,
    secFetchDest: nullableTrimmedString,
    secChUa: nullableTrimmedString,
    secChUaMobile: nullableTrimmedString,
    secChUaPlatform: nullableTrimmedString,
  },
  baseSchemaOptions,
)

const registrationProviderSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true, trim: true },
    succeeded: { type: Boolean, default: false },
    url: { type: String, default: null },
    fetchedAt: { type: Date, default: null },
    error: { type: String, default: null },
    responseKeys: { type: [String], default: [] },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  baseSchemaOptions,
)

const registrationProfileSchema = new mongoose.Schema(
  {
    provider: { type: String, default: null },
    url: { type: String, default: null },
    fetchedAt: { type: Date, default: null },
    data: {
      clientIp: { type: String, default: null },
      requestIp: { type: String, default: null },
      isLoopbackIp: { type: Boolean, default: false },
      isPrivateIp: { type: Boolean, default: false },
      meta: {
        username: { type: String, default: null },
        deviceId: { type: String, default: null },
        userAgent: { type: String, default: null },
        website: { type: websiteMetadataSchema, default: null },
        capturedAt: { type: Date, default: null },
        successfulProviders: { type: Number, default: 0, min: 0 },
        failedProviders: { type: Number, default: 0, min: 0 },
        totalProviders: { type: Number, default: 0, min: 0 },
      },
      providers: {
        type: [registrationProviderSchema],
        default: [],
      },
    },
    error: { type: String, default: null },
  },
  baseSchemaOptions,
)

const profileDetailsSchema = new mongoose.Schema(
  {
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  baseSchemaOptions,
)

const ENCRYPTED_PROFILE_VALUE_PREFIX = 'enc:v1:'
const MAX_PROFILE_NAME_LENGTH = 120
const MAX_ENCRYPTED_PROFILE_NAME_LENGTH = 4096

const isValidStoredProfileName = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return true
  }

  if (trimmed.startsWith(ENCRYPTED_PROFILE_VALUE_PREFIX)) {
    return trimmed.length <= MAX_ENCRYPTED_PROFILE_NAME_LENGTH
  }

  return trimmed.length <= MAX_PROFILE_NAME_LENGTH
}

const MAX_PROFILE_PHOTO_LENGTH = 50_000_000
const MAX_ENCRYPTED_PROFILE_PHOTO_LENGTH = 75_000_000

const isValidStoredProfilePhoto = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return true
  }

  if (trimmed.startsWith(ENCRYPTED_PROFILE_VALUE_PREFIX)) {
    return trimmed.length <= MAX_ENCRYPTED_PROFILE_PHOTO_LENGTH
  }

  return trimmed.length <= MAX_PROFILE_PHOTO_LENGTH
}

/* ------------------ USER ------------------ */

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 64,
      match: /^[a-z0-9._@+-]+$/,
      index: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    profileName: {
      type: String,
      trim: true,
      default: 'none',
      validate: {
        validator: isValidStoredProfileName,
        message:
          'Profile name must be 120 characters or fewer (encrypted values are allowed).',
      },
    },
    profilePhoto: {
      type: String,
      trim: true,
      default: 'none',
      validate: {
        validator: isValidStoredProfilePhoto,
        message:
          'Profile photo must be 35MB or fewer (encrypted base64 values are allowed).',
      },
    },
    profileDetails: {
      type: profileDetailsSchema,
      default: () => ({}),
    },

    password: {
      type: encryptedFieldSchema,
      required: true,
      select: false,
    },

    masterKey: {
      type: encryptedFieldSchema,
      required: true,
      select: false,
    },

    pqcSalt: {
      type: String,
      default: null,
    },

    registrationProfile: {
      type: registrationProfileSchema,
      default: () => ({}),
    },

    loginHistory: {
      type: [loginHistorySchema],
      default: [],
    },

    sessions: {
      type: [sessionSchema],
      default: [],
    },

    meta: {
      registeredAt: { type: Date, default: Date.now },
      lastLoginAt: { type: Date, default: null },
      lastFailedLoginAt: { type: Date, default: null },
      lastFailedLoginIp: { type: String, default: null },
      lastSyncAt: { type: Date, default: null },
      lastCredentialChangeAt: { type: Date, default: Date.now },
      activeDevices: { type: [String], default: [] },
      accountStatus: {
        type: String,
        enum: ['active', 'locked', 'disabled'],
        default: 'active',
      },
      profileVersion: { type: Number, default: 2, min: 1 },
      masterKey: { type: encryptedFieldSchema, default: null },
      masterKeyHash: { type: encryptedFieldSchema, default: null },
    },

    activityLog: {
      type: [activityLogSchema],
      default: [],
    },

    history: {
      password: { type: [passwordHistorySchema], default: undefined },
      masterKey: { type: [masterKeyHistorySchema], default: undefined },
    },

    vault: {
      photos: { type: [fileItemSchema], default: [] },
      videos: { type: [fileItemSchema], default: [] },
      audios: { type: [fileItemSchema], default: [] },
      documents: { type: [fileItemSchema], default: [] },
      otherFiles: { type: [fileItemSchema], default: [] },

      notes: { type: [noteSchema], default: [] },
      chats: { type: [noteSchema], default: [] },
      todos: { type: [noteSchema], default: [] },
      passwords: { type: [passwordSchema], default: [] },
      secretKeys: { type: [secretKeySchema], default: [] },

      location: { type: [noteSchema], default: [] },
      contact: { type: [noteSchema], default: [] },
    },

    /* ------------------ TWO FACTOR AUTH ------------------ */
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: encryptedFieldSchema,
      default: null,
      select: false,
    },
    twoFactorTempSecret: {
      type: encryptedFieldSchema,
      default: null,
      select: false,
    },
    twoFactorBackupCodes: {
      type: [String],
      default: [],
      select: false,
    },

    /* ------------------ INACTIVITY ------------------ */
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'users',
    timestamps: true,
    minimize: false,
    optimisticConcurrency: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        const output = ret as Record<string, any>

        output.id = output._id?.toString?.() ?? output.id
        delete output._id

        // Hide sensitive secrets from serialized output.
        delete output.password
        delete output.masterKey
        delete output.twoFactorSecret
        delete output.twoFactorTempSecret
        delete output.twoFactorBackupCodes

        if (output.history?.password) delete output.history.password

        if (output.history?.masterKey) delete output.history.masterKey
        if (
          output.history &&
          typeof output.history === 'object' &&
          Object.keys(output.history).length === 0
        ) {
          delete output.history
        }

        return output
      },
    },
    toObject: { virtuals: true, versionKey: false },
  },
)

/* ------------------ VIRTUALS ------------------ */

userSchema.virtual('profile').get(function () {
  return {
    name: this.profileName ?? 'none',
    photo: this.profilePhoto ?? 'none',
    details: this.profileDetails ?? {},
  }
})

userSchema.virtual('twoStepAuthentication').get(function () {
  return {
    enabled: this.twoFactorEnabled === true,
    backupCodesCount: Array.isArray(this.twoFactorBackupCodes)
      ? this.twoFactorBackupCodes.length
      : 0,
  }
})

userSchema.virtual('masterKeyShow').get(function () {
  const mk = this.meta?.masterKey
  if (!mk) return null

  return {
    encryption: {
      algorithm: mk.algorithm || 'aes-256-gcm',
      keyVersion: mk.keyVersion || 'v1',
      components: {
        cipherTextLength: mk.cipherText?.length || 0,
        ivLength: mk.iv?.length || 0,
        authTagLength: mk.authTag?.length || 0,
        saltLength: mk.salt?.length || 0,
      },
    },
    security: {
      cipherTextPreview: mk.cipherText
        ? `${mk.cipherText.substring(0, 20)}...${mk.cipherText.substring(mk.cipherText.length - 20)}`
        : null,
      ivPreview: mk.iv ? `${mk.iv.substring(0, 12)}...` : null,
      authTagPreview: mk.authTag ? `${mk.authTag.substring(0, 12)}...` : null,
      saltPreview: mk.salt ? `${mk.salt.substring(0, 12)}...` : null,
    },
  }
})

/* ------------------ INDEXES ------------------ */

userSchema.index({ updatedAt: -1 })
userSchema.index({ 'meta.registeredAt': -1 })
userSchema.index({ 'meta.accountStatus': 1 })
userSchema.index({ 'registrationProfile.data.requestIp': 1 })

/* ------------------ HOOKS ------------------ */

function updateTimestamp(this: any, next?: Function) {
  if (!this.isModified('updatedAt')) {
    this.updatedAt = new Date()
  }
  if (typeof next === 'function') next()
}

;[fileItemSchema, noteSchema, passwordSchema, secretKeySchema].forEach(
  (schema) => schema.pre('save' as any, updateTimestamp),
)

userSchema.pre('save', async function () {
  if (this.isNew) return

  if (this.isModified('password')) {
    try {
      const oldDoc = await mongoose
        .model('User')
        .findById(this._id)
        .select('+password')
      if (oldDoc && oldDoc.password) {
        const history = ((this.history ??= {} as any) as any)
        if (!Array.isArray(history.password)) history.password = []
        history.password.push({
          hash: oldDoc.password,
          changedAt: new Date(),
        })
      }
    } catch (err) {
      console.error('[UserModel] Failed to archive old password', err)
    }
  }

  if (this.isModified('meta.masterKey') || this.isModified('masterKey')) {
    try {
      const oldDoc = await mongoose
        .model('User')
        .findById(this._id)
        .select('+masterKey +meta.masterKey +meta.masterKeyHash')
      const oldMasterKey = oldDoc?.meta?.masterKey ?? oldDoc?.masterKey
      if (oldDoc && oldMasterKey) {
        const history = ((this.history ??= {} as any) as any)
        if (!Array.isArray(history.masterKey)) history.masterKey = []
        history.masterKey.push({
          masterKey: oldMasterKey,
          masterKeyHash: oldDoc.meta?.masterKeyHash ?? null,
          changedAt: new Date(),
        })
      }
    } catch (err) {
      console.error('[UserModel] Failed to archive old master key', err)
    }
  }
})

/* ------------------ TYPES ------------------ */

export interface UserMetaShape {
  registeredAt?: Date | null
  lastLoginAt?: Date | null
  lastFailedLoginAt?: Date | null
  lastFailedLoginIp?: string | null
  lastSyncAt?: Date | null
  lastCredentialChangeAt?: Date | null
  activeDevices?: string[]
  accountStatus?: 'active' | 'locked' | 'disabled'
  profileVersion?: number
  masterKey?: unknown
  masterKeyHash?: unknown
}

type InferredUserShape = InferSchemaType<typeof userSchema>

export type UserShape = Omit<
  InferredUserShape,
  'username' | 'email' | 'meta' | 'twoFactorBackupCodes' | 'lastActiveAt'
> & {
  username: string
  email?: string
  meta?: UserMetaShape | null
  twoFactorBackupCodes: string[]
  lastActiveAt?: Date | null
}
export type UserDocument = HydratedDocument<UserShape>
export type UserModel = Model<UserShape>

/* ------------------ MODEL ------------------ */

export const User =
  (mongoose.models.User as UserModel) ||
  mongoose.model<UserShape>('User', userSchema)
