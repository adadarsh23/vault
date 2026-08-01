import { getVaultItemModel } from '../models/vaultItem.ts'
import mongoose from 'mongoose'
import path from 'path'

import { ensureMongoReady } from '../mongo.ts'
import { AppError } from '../utils/appError.ts'
import { getUploadRoot } from '../utils/fileStorage.ts'
import { resolvePayloadEncoding } from '../utils/vaultParsers.ts'
import { logger } from '../utils/logger.ts'
import {
  decryptBufferEnvelope,
  encryptBufferEnvelope,
  EncryptedEnvelopePayload,
  rewrapEnvelopeDek,
} from '../utils/crypto.ts'

interface LegacySaveInput {
  vaultId: string
  username: string
  itemId: string
  payload: string | Buffer
  category: string
  folder?: string | null
  title: string | null
  metadata: Record<string, unknown> | null
}

interface ScopedSaveInput {
  userId: string
  username: string
  itemId: string
  payload: string | Buffer
  category: string
  folder?: string | null
  title: string | null
  metadata: Record<string, unknown> | null
}

let legacyIndexesPromise: Promise<void> | null = null
const uploadRoot = getUploadRoot()
const GRIDFS_THRESHOLD_BYTES = 256 * 1024
const USER_VAULT_COLLECTION_CATEGORIES = [
  'notes',
  'todos',
  'passwords',
  'secrets',
  'contacts',
  'location',
  'photos',
  'videos',
  'audio',
  'documents',
  'files',
  'settings',
  'system',
  'logs',
  'users',
] as const
const SAFE_COLLECTION_SEGMENT_PATTERN = /[^a-z0-9_-]/g

const ensureLegacyIndexes = async () => {
  if (!legacyIndexesPromise) {
    legacyIndexesPromise = (async () => {
      const collection = await getLegacyCollection()
      await Promise.all([
        collection.createIndex(
          { vaultId: 1, itemId: 1 },
          {
            unique: true,
            name: 'vault_item_unique',
            partialFilterExpression: { vaultId: { $exists: true } },
          },
        ),
        collection.createIndex(
          { vaultId: 1, updatedAt: -1 },
          { name: 'vault_updated_lookup' },
        ),
        collection.createIndex(
          { ownerType: 1, ownerId: 1, itemId: 1 },
          {
            unique: true,
            name: 'scoped_item_unique',
            partialFilterExpression: {
              ownerType: { $exists: true },
              ownerId: { $exists: true },
            },
          },
        ),
        collection.createIndex(
          { ownerType: 1, ownerId: 1, updatedAt: -1 },
          {
            name: 'scoped_item_lookup',
            partialFilterExpression: {
              ownerType: { $exists: true },
              ownerId: { $exists: true },
            },
          },
        ),
      ])
    })().catch((error) => {
      legacyIndexesPromise = null
      throw error
    })
  }

  await legacyIndexesPromise
}

const getLegacyCollection = async (username = 'legacy') => {
  const ready = await ensureMongoReady()
  if (!ready) {
    throw new AppError(
      503,
      'DB_UNAVAILABLE',
      'Database connection lost. Please try again later.',
    )
  }

  const model = getVaultItemModel(username);
  return model.collection;
}

const getDatabaseOrThrow = async () => {
  const ready = await ensureMongoReady()
  if (!ready) {
    throw new AppError(
      503,
      'DB_UNAVAILABLE',
      'Database connection lost. Please try again later.',
    )
  }

  const database = mongoose.connection.db
  if (!database) {
    throw new AppError(
      503,
      'DB_UNAVAILABLE',
      'Database connection lost. Please try again later.',
    )
  }

  return database
}

const normalizeCollectionSegment = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(SAFE_COLLECTION_SEGMENT_PATTERN, '_')
    .replace(/_+/g, '_')

const normalizeScopedCategory = (category: string) => {
  const normalized = normalizeCollectionSegment(category)
  if (!normalized) {
    return 'files'
  }

  if (normalized === 'note' || normalized === 'notes') {
    return 'notes'
  }

  if (normalized === 'todo' || normalized === 'todos') {
    return 'todos'
  }


  if (normalized === 'password' || normalized === 'passwords') {
    return 'passwords'
  }

  if (normalized === 'secret' || normalized === 'secrets') {
    return 'secrets'
  }

  if (normalized === 'contact' || normalized === 'contacts') {
    return 'contacts'
  }

  if (normalized === 'photo' || normalized === 'photos') {
    return 'photos'
  }

  if (normalized === 'video' || normalized === 'videos') {
    return 'videos'
  }

  if (normalized === 'document' || normalized === 'documents') {
    return 'documents'
  }

  if (normalized === 'file' || normalized === 'files') {
    return 'files'
  }

  if (normalized === 'location' || normalized === 'locations') {
    return 'locations'
  }

  if (normalized === 'otherfile' || normalized === 'otherfiles') {
    return 'files'
  }

  return normalized
}

const resolveScopedCategoryGroup = (category: string) => {
  switch (normalizeScopedCategory(category)) {
    case 'notes':
    case 'todos':
    case 'secrets':
    case 'passwords':
    case 'contacts':
    case 'location':
      return 'personal_data'
    case 'photos':
    case 'videos':
    case 'audio':
      return 'media'
    case 'documents':
    case 'files':
      return 'documents'
    case 'settings':
      return 'system'
    default:
      return 'misc'
  }
}

const buildUserScopedCollectionName = (username: string, category: string) => {
  const normalized = normalizeCollectionSegment(username);
  return `${normalized}.${normalized}_${normalizeScopedCategory(category)}`;
};

const buildScopedSelector = (userId: string, itemId: string) => ({
  ownerType: 'user',
  ownerId: userId,
  itemId,
})

const getScopedCollection = async (username: string, category: string) => {
  const database = await getDatabaseOrThrow()
  return database.collection(buildUserScopedCollectionName(username, category))
}

const ensureScopedCollectionIndexes = async (
  username: string,
  category: string,
) => {
  try {
    const collection = await getScopedCollection(username, category)
    await Promise.all([
      collection.createIndex(
        { itemId: 1 },
        { unique: true, name: 'item_unique' },
      ),
      collection.createIndex({ updatedAt: -1 }, { name: 'updated_lookup' }),
    ])
    return collection
  } catch (error) {
    logger.error('Failed to ensure collection indexes', {
      username,
      category,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

const getUserVaultCollectionCategories = () => [
  ...USER_VAULT_COLLECTION_CATEGORIES,
]

export const ensureUserVaultCollections = async (username: string) => {
  try {
    // Only initialize the most critical collections during registration to reduce overhead
    const criticalCategories = ["notes", "todos", "passwords", "secrets", "settings"];

    // Use sequential processing to avoid overwhelming the database with concurrent index creations
    for (const category of criticalCategories) {
      await ensureScopedCollectionIndexes(username, category);
    }
  } catch (error) {
    logger.error("Failed to ensure user vault collections", {
      username,
      error: error instanceof Error ? error.message : String(error),
    })
    throw new AppError(
      503,
      'VAULT_SETUP_FAILED',
      'User vault setup failed. Please try registering again. If the problem persists, contact support.',
    )
  }
}

const getLegacyBucket = () => {
  const database = mongoose.connection.db
  if (!database) {
    throw new AppError(
      503,
      'DB_UNAVAILABLE',
      'Database connection lost. Please try again later.',
    )
  }

  return new mongoose.mongo.GridFSBucket(database, {
    bucketName: 'vault_item_files',
  })
}

const serializePayload = (payload: string | Buffer) => {
  if (Buffer.isBuffer(payload)) {
    return {
      payload: payload.toString('base64'),
      binaryPayload: null,
    }
  }

  return {
    payload,
    binaryPayload: null,
  }
}

const cleanupLegacyStorageArtifacts = async (input: {
  metadata?: Record<string, unknown> | null
  gridFsId?: string | null
}) => {
  await deleteStoredFile(getStoredFilePathFromMetadata(input.metadata))
  await deleteGridFsFile(input.gridFsId)
}

const toObjectId = (value: string) => {
  try {
    return new mongoose.Types.ObjectId(value)
  } catch {
    return null
  }
}

const uploadPayloadToGridFs = async (
  input: LegacySaveInput,
  payload: Buffer,
) => {
  const bucket = getLegacyBucket()
  const encryptedPayload = encryptBufferEnvelope(payload)
  const cipherBuffer = Buffer.from(encryptedPayload.cipherText, 'base64')
  const uploadStream = bucket.openUploadStream(
    input.title || `${input.itemId}.bin`,
    {
      metadata: {
        vaultId: input.vaultId,
        itemId: input.itemId,
        category: input.category,
        mimeType:
          typeof input.metadata?.mimeType === 'string'
            ? input.metadata.mimeType
            : undefined,
        encryption: {
          algorithm: encryptedPayload.algorithm,
          iv: encryptedPayload.iv,
          authTag: encryptedPayload.authTag,
          wrappedDek: encryptedPayload.wrappedDek,
          wrapIv: encryptedPayload.wrapIv,
          wrapTag: encryptedPayload.wrapTag,
          keyVersion: encryptedPayload.keyVersion,
          keyId: encryptedPayload.keyId,
        },
      },
    },
  )

  await new Promise<void>((resolve, reject) => {
    uploadStream.on('error', reject)
    uploadStream.on('finish', () => resolve())
    uploadStream.end(cipherBuffer)
  })

  return uploadStream.id.toString()
}

const deleteGridFsFile = async (gridFsId: string | null | undefined) => {
  if (!gridFsId) {
    return
  }

  const objectId = toObjectId(gridFsId)
  if (!objectId) {
    return
  }

  try {
    await getLegacyBucket().delete(objectId)
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException & { code?: string }
    if (candidate.code !== 'ENOENT' && candidate.message !== 'FileNotFound') {
      console.warn('Failed to delete GridFS file:', candidate)
    }
  }
}

const downloadGridFsFileAsBase64 = async (gridFsId: string) => {
  const objectId = toObjectId(gridFsId)
  if (!objectId) {
    return ''
  }

  const bucket = getLegacyBucket()
  const [gridFsFile] = await bucket.find({ _id: objectId }).limit(1).toArray()
  const encryptionMetadata = (gridFsFile?.metadata as any)?.encryption as
    | Omit<EncryptedEnvelopePayload, 'cipherText'>
    | undefined

  const downloadStream = bucket.openDownloadStream(objectId)
  const chunks: Buffer[] = []

  await new Promise<void>((resolve, reject) => {
    downloadStream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    downloadStream.on('error', reject)
    downloadStream.on('end', () => resolve())
  })

  const rawBytes = Buffer.concat(chunks)
  if (!encryptionMetadata) {
    return rawBytes.toString('base64')
  }

  const decrypted = decryptBufferEnvelope({
    algorithm: encryptionMetadata.algorithm,
    iv: encryptionMetadata.iv,
    authTag: encryptionMetadata.authTag,
    wrappedDek: encryptionMetadata.wrappedDek,
    wrapIv: encryptionMetadata.wrapIv,
    wrapTag: encryptionMetadata.wrapTag,
    keyVersion: encryptionMetadata.keyVersion,
    keyId: encryptionMetadata.keyId,
    cipherText: rawBytes.toString('base64'),
  })

  return decrypted.toString('base64')
}

const getStoredFilePathFromMetadata = (
  metadata: Record<string, unknown> | null | undefined,
): string | null => {
  return typeof metadata?.filePath === 'string' &&
    metadata.filePath.startsWith('/')
    ? metadata.filePath
    : null
}

const deleteStoredFile = async (filePath: string | null) => {
  if (!filePath) {
    return
  }

  const absolutePath = path.resolve(process.cwd(), filePath.slice(1))
  if (!absolutePath.startsWith(uploadRoot)) {
    return
  }

  try {
    const fs = await import('fs/promises')
    await fs.unlink(absolutePath)
  } catch (error) {
    const candidate = error as NodeJS.ErrnoException
    if (candidate.code !== 'ENOENT') {
      console.warn('Failed to delete legacy stored file:', candidate)
    }
  }
}

const serializeVaultItem = async (item: any) => ({
  itemId: item.itemId,
  payload:
    item.encoding === 'gridfs-binary' && typeof item.gridFsId === 'string'
      ? await downloadGridFsFileAsBase64(item.gridFsId)
      : typeof item.payload === 'string'
        ? item.payload
        : '',
  gridFsId: item.gridFsId,
  encoding: item.encoding,
  category: item.category,
  title: item.title,
  metadata: item.metadata,
  updatedAt: item.updatedAt,
})

export const saveLegacyVaultItem = async (input: LegacySaveInput) => {
  const collection = await ensureScopedCollectionIndexes(
    input.username,
    input.category,
  )
  const selector = { vaultId: input.vaultId, itemId: input.itemId }
  const existing = await collection.findOne<{
    metadata?: Record<string, unknown> | null
    gridFsId?: string | null
  }>(selector)

  const binaryPayload = Buffer.isBuffer(input.payload) ? input.payload : null
  const shouldUseGridFs =
    binaryPayload !== null && binaryPayload.length > GRIDFS_THRESHOLD_BYTES
  let newGridFsId: string | null = null

  try {
    const serialized = shouldUseGridFs
      ? {
        payload: '',
        binaryPayload: null,
        gridFsId: await uploadPayloadToGridFs(input, binaryPayload),
        encoding: 'gridfs-binary' as const,
      }
      : {
        ...serializePayload(input.payload),
        gridFsId: null,
        encoding: resolvePayloadEncoding(input.payload),
      }

    newGridFsId = serialized.gridFsId

    const performUpsert = async () => {
      try {
        await collection.updateOne(
          selector,
          {
            $set: {
              vaultId: input.vaultId,
              itemId: input.itemId,
              payload: serialized.payload,
              binaryPayload: serialized.binaryPayload,
              gridFsId: serialized.gridFsId,
              encoding: serialized.encoding,
              category: input.category,
              title: input.title,
              metadata: input.metadata,
              updatedAt: new Date(),
            },
          },
          { upsert: true },
        )
      } catch (err: any) {
        // Handle race condition: if it failed with duplicate key, retry once which should then succeed as an update
        if (err.code === 11000) {
          await collection.updateOne(
            selector,
            {
              $set: {
                payload: serialized.payload,
                binaryPayload: serialized.binaryPayload,
                gridFsId: serialized.gridFsId,
                encoding: serialized.encoding,
                category: input.category,
                title: input.title,
                metadata: input.metadata,
                updatedAt: new Date(),
              },
            },
            { upsert: true }
          )
        } else {
          throw err;
        }
      }
    }

    await performUpsert()
  } catch (error) {
    if (newGridFsId) await deleteGridFsFile(newGridFsId)
    throw error
  }

  await cleanupLegacyStorageArtifacts(existing || {})

  return {
    vaultId: input.vaultId,
    itemId: input.itemId,
    stored: true,
  }
}

export const listLegacyVaultItems = async (vaultId: string, username: string) => {
  try {
    const collection = await getLegacyCollection(username)
    const items = await collection.find({ vaultId }).toArray()

    return Promise.all(items.map((item) => serializeVaultItem(item)))
  } catch (error) {
    logger.error('Failed to list legacy vault items', {
      vaultId,
      error: error instanceof Error ? error.message : String(error)
    })
    return [] // Return empty array instead of 500 error if legacy sync fails
  }
}

export const deleteLegacyVaultItem = async (
  vaultId: string,
  itemId: string,
  username: string,
) => {
  const collection = await getLegacyCollection(username)
  const existing = await collection.findOne<{
    metadata?: Record<string, unknown> | null
    gridFsId?: string | null
  }>({ vaultId, itemId })
  const result = await collection.deleteOne({ vaultId, itemId })
  if (result.deletedCount > 0) {
    await deleteStoredFile(getStoredFilePathFromMetadata(existing?.metadata))
    await deleteGridFsFile(existing?.gridFsId)
  }
  return result.deletedCount > 0
}

export const saveScopedVaultItem = async (input: ScopedSaveInput) => {
  const { userId, itemId, category, folder, payload, title, metadata } = input

  const isBinary = Buffer.isBuffer(payload)
  let encoding = resolvePayloadEncoding(payload)
  let finalPayload = ''
  let modernPayload = null
  let gridFsId: string | null = null

  const isSingleton =
    itemId && ['__settings__', '__profile__', '__keycheck__'].includes(itemId)
  const binaryPayload = isBinary ? (payload as Buffer) : null

  // Use GridFS for large binaries (> 12MB) to avoid BSON 16MB limit
  const shouldUseGridFs =
    !isSingleton &&
    binaryPayload !== null &&
    binaryPayload.length > GRIDFS_THRESHOLD_BYTES

  if (shouldUseGridFs) {
    gridFsId = await uploadPayloadToGridFs(
      {
        vaultId: userId,
        username: input.username,
        itemId,
        payload,
        category,
        title,
        metadata,
      },
      binaryPayload,
    )
    encoding = 'gridfs-binary' as any
    finalPayload = ''
  } else if (isBinary) {
    finalPayload = payload.toString('base64')
    encoding = 'binary-base64'
  } else {
    // V2 Modern uploads send the entire string in the payload
    if (typeof payload === 'string' && payload.startsWith('V2_MODERN:')) {
      modernPayload = payload
      encoding = 'modern'
    } else {
      finalPayload = payload
    }
  }

  const performUpsert = async () => {
    const isPinned = Boolean((metadata as any)?.isPinned)
    const pinnedAtRaw = (metadata as any)?.pinnedAt
    const pinnedAt =
      isPinned && pinnedAtRaw
        ? new Date(pinnedAtRaw as string | number | Date)
        : isPinned
          ? new Date()
          : null

    try {
      const DynamicVaultModel = getVaultItemModel(input.username);
      const existing = await DynamicVaultModel.findOne({ userId, itemId }).lean()

      const result = await DynamicVaultModel.findOneAndUpdate(
        { userId, itemId },
        {
          userId,
          itemId,
          category,
          folder: folder || metadata?.folder || null,
          payload: finalPayload,
          modernPayload,
          gridFsId,
          encoding,
          title,
          metadata: metadata || {},
          isPinned,
          pinnedAt,
          updatedAt: new Date(),
          isDeleted: false,
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )

      // Cleanup old GridFS data if we replaced it
      if (existing && existing.gridFsId && existing.gridFsId !== gridFsId) {
        await deleteGridFsFile(existing.gridFsId)
      }

      return result
    } catch (err: any) {
      if (err.code === 11000) {
        logger.warn(
          `Duplicate key error in scoped upsert for ${itemId}. Retrying.`,
          { userId, itemId },
        )

        const DynamicVaultModel = getVaultItemModel(input.username);

        // For singletons or race conditions, sometimes a delete-then-insert is safer
        if (isSingleton) {
          await DynamicVaultModel.deleteOne({ userId, itemId }).catch((error) => {
            logger.warn('Failed to delete singleton before scoped upsert retry', {
              userId,
              itemId,
              error,
            })
          })
        }

        return await DynamicVaultModel.findOneAndUpdate(
          { userId, itemId },
          {
            category,
            folder: folder || metadata?.folder || null,
            payload: finalPayload,
            modernPayload,
            gridFsId,
            encoding,
            title,
            metadata: metadata || {},
            isPinned,
            pinnedAt,
            updatedAt: new Date(),
            isDeleted: false,
          },
          { upsert: true, returnDocument: 'after' },
        )
      }
      throw err
    }
  }

  const result = await performUpsert()

  return {
    userId,
    itemId,
    stored: true,
    result,
  }
}

export const listScopedVaultItemsByUsername = async (
  userId: string,
  username: string,
) => {
  const DynamicVaultModel = getVaultItemModel(username);
  const items = await DynamicVaultModel.find({ userId, isDeleted: false })
    .sort({ updatedAt: -1 })
    .lean()
    .exec();
  
  // Map to the format expected by the frontend
  return items.map((item) => {
    // Determine payload and encoding
    let payload = item.modernPayload || item.payload || ''
    let encoding = item.encoding || 'utf-8'

    // Important performance optimization:
    // Never inline GridFS binary payloads into the snapshot response because
    // that can make /api/vault/items downloads extremely large and block unlock.
    if (item.encoding === 'gridfs-binary' && item.gridFsId) {
      payload =
        (item.file && typeof item.file.filePath === 'string' && item.file.filePath.trim()) ||
        `gridfs://${item.gridFsId}`
      encoding = 'file-reference'
    } else if (!payload && item.file && item.file.filePath) {
      // If it's a file saved via the dedicated file upload service
      payload = item.file.filePath
      encoding = 'file-reference'
    }

    return {
      itemId: item.itemId,
      payload,
      encoding,
      gridFsId: item.gridFsId,
      category: item.category,
      folder: item.folder ?? null,
      title: item.title,
      metadata: item.metadata,
      updatedAt: item.updatedAt,
      isPinned: item.isPinned ?? false,
      pinnedAt: item.pinnedAt ?? null,
    }
  })
}


export const deleteScopedVaultItemByUsername = async (
  userId: string,
  username: string,
  itemId: string,
) => {
  const DynamicVaultModel = getVaultItemModel(username);
  const result = await DynamicVaultModel.findOneAndUpdate(
    { userId, itemId },
    { isDeleted: true, deletedAt: new Date() },
    { returnDocument: 'after' }
  );
  return !!result;
}

export const rewrapGridFsEnvelopeKeys = async (input?: {
  targetKeyId?: string
  dryRun?: boolean
  limit?: number
}) => {
  const database = await getDatabaseOrThrow()
  const filesCollection = database.collection('vault_item_files.files')
  const cursor = filesCollection.find(
    { 'metadata.encryption.wrappedDek': { $exists: true } },
    { projection: { _id: 1, metadata: 1 }, limit: input?.limit || 5000 },
  )
  let scanned = 0
  let updated = 0
  while (await cursor.hasNext()) {
    const doc = await cursor.next()
    if (!doc) continue
    scanned += 1
    const encryption = (doc as any)?.metadata?.encryption
    if (!encryption) continue
    const next = rewrapEnvelopeDek(
      {
        algorithm: encryption.algorithm,
        iv: encryption.iv,
        authTag: encryption.authTag,
        wrappedDek: encryption.wrappedDek,
        wrapIv: encryption.wrapIv,
        wrapTag: encryption.wrapTag,
        keyVersion: encryption.keyVersion,
        keyId: encryption.keyId,
      },
      input?.targetKeyId,
    )
    if (input?.dryRun) {
      continue
    }
    await filesCollection.updateOne(
      { _id: (doc as any)._id },
      {
        $set: {
          'metadata.encryption.wrappedDek': next.wrappedDek,
          'metadata.encryption.wrapIv': next.wrapIv,
          'metadata.encryption.wrapTag': next.wrapTag,
          'metadata.encryption.keyVersion': next.keyVersion,
          'metadata.encryption.keyId': next.keyId,
        },
      },
    )
    updated += 1
  }
  return {
    scanned,
    updated,
    dryRun: input?.dryRun === true,
    targetKeyId: input?.targetKeyId || null,
  }
}

export const setScopedVaultItemPinByUsername = async (
  userId: string,
  username: string,
  itemId: string,
  isPinned: boolean,
) => {
  const DynamicVaultModel = getVaultItemModel(username)
  const pinnedAt = isPinned ? new Date() : null
  const result = await DynamicVaultModel.findOneAndUpdate(
    { userId, itemId, isDeleted: false },
    { isPinned, pinnedAt, updatedAt: new Date() },
    { returnDocument: 'after' },
  )

  if (!result) {
    throw new AppError(404, 'ITEM_NOT_FOUND', 'Vault item not found.')
  }

  return {
    itemId,
    isPinned: Boolean(result.isPinned),
    pinnedAt: result.pinnedAt ?? null,
    updatedAt: result.updatedAt,
  }
}
