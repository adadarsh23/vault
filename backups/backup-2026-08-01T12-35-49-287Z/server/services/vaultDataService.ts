import { randomUUID } from 'crypto'
import { getActivityLogModel } from '../models/activityLog.ts'
import { getVaultItemModel } from '../models/vaultItem.ts'
import {
  deleteScopedVaultItemByUsername,
  saveScopedVaultItem,
} from './legacyVaultService.ts'
import { encryptText } from '../utils/crypto.ts'
import { AppError } from '../utils/appError.ts'
import { logger } from '../utils/logger.ts'
import { processPhotoUpload } from '../utils/imagePipeline.ts'
import { createNotification } from './notificationService.ts'
import { enqueueUploadSecurityScan } from './uploadSecurityService.ts'
import {
  buildConflictResponse,
  CONFIG,
  ENCRYPTED_CATEGORIES,
  enforceUserStorageQuota,
  encryptOptionalText,
  FILE_CATEGORIES,
  getUserOrThrow,
  isIncomingUpdateAllowed,
  logAndEmit,
  normalizeDate,
  normalizeFileName,
  publicUser,
  retryLoadedUserMutation,
  sanitizeItemId,
  sanitizeOptionalText,
  sanitizeOptionalUrl,
  sanitizeRequiredText,
  touchUser,
  validateVaultCategory,
  type DeleteInput,
  type DeleteVaultItemResult,
  type EncryptedCategory,
  type EncryptedSaveInput,
  type FileCategory,
  type FileSaveInput,
  type SaveEncryptedVaultItemResult,
} from './vaultService.internal.ts'
/**
 * Fetches complete vault snapshot including all data, activity, and login history
 *
 * @param userId - User ID to fetch vault for
 * @returns Vault state with all categories and audit logs
 */
export const getVaultSnapshot = async (userId: string) => {
  const user = await getUserOrThrow(userId)
  const username = user.username;

  const DynamicVaultModel = getVaultItemModel(username);
  const DynamicLogModel = getActivityLogModel(username);

  const items = await DynamicVaultModel.find({ userId, isDeleted: false }).allowDiskUse().lean().exec();
  const logs = await DynamicLogModel.find({ userId }).sort({ createdAt: -1 }).allowDiskUse().limit(100).lean().exec();

  // Group items into categories for the legacy 'vault' object structure
  const vault: any = {
    photos: [], videos: [], audios: [], documents: [], otherFiles: [],
    notes: [], chats: [], todos: [], passwords: [], secretKeys: [], location: [], contact: []
  };

  items.forEach(item => {
    const category = item.category as string;
    if (vault[category]) {
      vault[category].push(item);
    } else if (category === 'photo') vault.photos.push(item);
    else if (category === 'video') vault.videos.push(item);
    else if (category === 'audio') vault.audios.push(item);
    else if (category === 'document') vault.documents.push(item);
    else if (category === 'chat') vault.chats.push(item);
    else if (category === 'todo') vault.todos.push(item);
    else if (category === 'file') vault.otherFiles.push(item);
  });

  return {
    user: publicUser(user),
    vault,
    activityLog: logs,
    loginHistory: user.loginHistory,
  }
}

/**
 * Fetches vault changes since a given timestamp
 * Used for client synchronization with server state
 * Implements "latest-update-wins" conflict resolution strategy
 *
 * @param userId - User ID to fetch changes for
 * @param since - ISO timestamp or undefined for all items
 * @returns Changed items by category with sync metadata
 */
export const getVaultSyncChanges = async (userId: string, since?: string) => {
  const sinceDate = normalizeDate(since)
  const user = await getUserOrThrow(userId)
  const username = user.username

  const DynamicVaultModel = getVaultItemModel(username)
  const items = await DynamicVaultModel.find({
    userId,
    updatedAt: { $gt: sinceDate }
  }).allowDiskUse().lean().exec()

  const vaultChanges: any = {
    photos: [], videos: [], audios: [], documents: [], otherFiles: [],
    notes: [], chats: [], todos: [], passwords: [], secretKeys: [], location: [], contact: []
  }

  items.forEach(item => {
    const category = item.category as string
    if (vaultChanges[category]) {
      vaultChanges[category].push(item)
    } else if (category === 'photo') vaultChanges.photos.push(item)
    else if (category === 'video') vaultChanges.videos.push(item)
    else if (category === 'audio') vaultChanges.audios.push(item)
    else if (category === 'document') vaultChanges.documents.push(item)
    else if (category === 'chat') vaultChanges.chats.push(item)
    else if (category === 'todo') vaultChanges.todos.push(item)
    else if (category === 'file') vaultChanges.otherFiles.push(item)
  })

  return {
    syncAt: new Date(),
    changes: vaultChanges,
    userId: user._id.toString(),
  }
}

/**
 * Uploads file to vault with metadata preservation
 * Files are stored in cloud storage backend with reference in vault
 *
 * @param input - File data, category, and device info
 * @returns Vault item reference with storage path
 * @throws {AppError} If file is empty or category invalid
 */
export const saveFileToVault = async (input: FileSaveInput) => {
  const category = validateVaultCategory(input.category)
  if (!FILE_CATEGORIES.has(category as FileCategory)) {
    throw new AppError(
      400,
      'INVALID_CATEGORY',
      'This endpoint only supports file categories.',
    )
  }

  const updatedAt = normalizeDate(input.clientUpdatedAt)
  const itemId = randomUUID()
  if (!input.file.size || !input.file.buffer?.length) {
    throw new AppError(400, 'EMPTY_FILE', 'Uploaded file is empty.')
  }
  let fileName = normalizeFileName(input.file.originalname)
  let fileBuffer = input.file.buffer
  let fileMimeType = input.file.mimetype

  if (category === 'photo') {
    const processedPhoto = await processPhotoUpload({
      buffer: fileBuffer,
      fileName,
      mimeType: fileMimeType,
      keepMetadata: input.keepMetadata,
    })
    fileBuffer = processedPhoto.buffer
    fileName = normalizeFileName(processedPhoto.fileName)
    fileMimeType = processedPhoto.mimeType
  }

  return retryLoadedUserMutation({
    mutationName: 'saveFileToVault',
    loadUser: () => getUserOrThrow(input.userId),
    operation: async (user) => {
      await enforceUserStorageQuota(input.userId, user.username, fileBuffer.length)
      // Save item to isolated collection
      await saveScopedVaultItem({
        userId: input.userId,
        username: user.username,
        itemId,
        payload: fileBuffer,
        category,
        folder: input.folder || null,
        title: fileName,
        metadata: {
          mimeType: fileMimeType,
          size: fileBuffer.length,
          originalName: fileName,
          storage: 'cloud',
          keepMetadata: input.keepMetadata === true,
          uploadSecurity: {
            scanStatus: 'pending',
            verdict: null,
            reason: null,
            isActive: false,
            queuedAt: new Date().toISOString(),
          },
        },
      })

      enqueueUploadSecurityScan({
        userId: input.userId,
        username: user.username,
        itemId,
        category,
        fileName,
        mimeType: fileMimeType,
        payload: fileBuffer,
      })

      touchUser(user, updatedAt)
        ; (
          user as unknown as { markModified: (path: string) => void }
        ).markModified(`vault.${category}`)
      logAndEmit(user, 'FILE_UPLOAD', category, itemId, {
        ipAddress: input.ipAddress ?? 'unknown',
        deviceId: input.deviceId ?? 'unknown-device',
        fileName,
        size: fileBuffer.length,
      })

      logger.info('File uploaded to vault', {
        userId: input.userId,
        category,
        itemId,
        size: input.file.size,
      })

      return {
        result: {
          itemId,
          category,
          fileName,
          filePath: `cloud://${itemId}`,
          scanStatus: 'pending',
          updatedAt,
        },
      }
    },
  })
}

/**
 * Saves encrypted vault item (notes, passwords, or secret keys)
 * Implements conflict detection based on timestamp comparison
 * Returns conflict response if server has newer version
 *
 * @param input - Encrypted item data and device info
 * @returns Save result or conflict response
 */
export const saveEncryptedVaultItem = async (
  input: EncryptedSaveInput,
): Promise<SaveEncryptedVaultItemResult> => {
  const category = validateVaultCategory(input.category)
  if (!ENCRYPTED_CATEGORIES.has(category as EncryptedCategory)) {
    throw new AppError(
      400,
      'INVALID_CATEGORY',
      'This endpoint only supports encrypted categories.',
    )
  }
  const encryptedCategory = category as EncryptedCategory

  const itemId = sanitizeItemId(input.itemId) || randomUUID()
  const updatedAt = normalizeDate(
    typeof input.payload.clientUpdatedAt === 'string'
      ? input.payload.clientUpdatedAt
      : undefined,
  )
  return retryLoadedUserMutation<SaveEncryptedVaultItemResult>({
    mutationName: 'saveEncryptedVaultItem',
    loadUser: () => getUserOrThrow(input.userId),
    operation: async (user) => {
      const DynamicVaultModel = getVaultItemModel(user.username)
      const existingItem = await DynamicVaultModel.findOne({ userId: input.userId, itemId }).lean()

      // Conflict detection: reject if server has newer version
      if (
        existingItem?.updatedAt instanceof Date &&
        !isIncomingUpdateAllowed(existingItem.updatedAt, updatedAt)
      ) {
        void createNotification(
          input.userId,
          'sync_conflict',
          'Sync Conflict Detected',
          `Conflict detected for item "${existingItem.title || 'Untitled'}" during sync. Server has a newer version.`,
          { itemId, category: input.category }
        ).catch((err) => logger.warn('Failed to create sync conflict notification', { error: err }))

        return {
          result: buildConflictResponse(
            'A newer version already exists on the server.',
            existingItem,
          ),
          skipSave: true,
        }
      }

      let nextRecord: Record<string, unknown>
      let itemTitle = ''
      const isUpdate = Boolean(existingItem)

      // Build record structure based on category
      if (encryptedCategory === 'note') {
        const title = sanitizeRequiredText(
          input.payload.title,
          'title',
          CONFIG.maxTitleLength,
        )
        const content = sanitizeRequiredText(
          input.payload.content,
          'content',
          CONFIG.maxNoteContentLength,
        )
        itemTitle = title
        nextRecord = {
          title,
          content: encryptText(content),
        }
      } else if (encryptedCategory === 'chat') {
        const title = sanitizeRequiredText(
          input.payload.title,
          'title',
          CONFIG.maxTitleLength,
        )
        const content = sanitizeRequiredText(
          input.payload.content,
          'content',
          CONFIG.maxNoteContentLength,
        )
        itemTitle = title
        nextRecord = {
          title,
          content: encryptText(content),
        }
      } else if (encryptedCategory === 'todo') {
        const title = sanitizeRequiredText(
          input.payload.title,
          'title',
          CONFIG.maxTitleLength,
        )
        const content = sanitizeRequiredText(
          input.payload.content,
          'content',
          CONFIG.maxNoteContentLength,
        )
        itemTitle = title
        nextRecord = {
          title,
          content: encryptText(content),
        }
      } else if (encryptedCategory === 'password') {
        const label = sanitizeRequiredText(
          input.payload.label,
          'label',
          CONFIG.maxTitleLength,
        )
        const password = sanitizeRequiredText(
          input.payload.password,
          'password',
          CONFIG.maxTextFieldLength,
        )
        itemTitle = label
        nextRecord = {
          label,
          username: sanitizeOptionalText(
            input.payload.username,
            'username',
            CONFIG.maxTextFieldLength,
          ),
          url: sanitizeOptionalUrl(
            input.payload.url,
          ),
          password: encryptText(password),
          notes: encryptOptionalText(
            sanitizeOptionalText(
              input.payload.notes,
              'notes',
              CONFIG.maxNoteContentLength,
            ),
          ),
        }
      } else if (encryptedCategory === 'secret') {
        const label = sanitizeRequiredText(
          input.payload.label,
          'label',
          CONFIG.maxTitleLength,
        )
        const value = sanitizeRequiredText(
          input.payload.value,
          'value',
          CONFIG.maxTextFieldLength,
        )
        itemTitle = label
        nextRecord = {
          label,
          value: encryptText(value),
          description: sanitizeOptionalText(
            input.payload.description,
            'description',
            CONFIG.maxTextFieldLength,
          ),
        }
      } else if (encryptedCategory === 'location') {
        const title = sanitizeRequiredText(
          input.payload.title,
          'title',
          CONFIG.maxTitleLength,
        )
        const content = sanitizeRequiredText(
          input.payload.content,
          'content',
          CONFIG.maxNoteContentLength,
        )
        itemTitle = title
        nextRecord = {
          title,
          content: encryptText(content),
        }
      } else if (encryptedCategory === 'contact') {
        const title = sanitizeRequiredText(
          input.payload.title,
          'title',
          CONFIG.maxTitleLength,
        )
        const content = sanitizeRequiredText(
          input.payload.content,
          'content',
          CONFIG.maxNoteContentLength,
        )
        itemTitle = title
        nextRecord = {
          title,
          content: encryptText(content),
        }
      } else {
        throw new AppError(
          400,
          'INVALID_CATEGORY',
          'Unsupported encrypted category.',
        )
      }

      // Save item to isolated collection
      await saveScopedVaultItem({
        userId: user._id.toString(),
        username: user.username,
        itemId,
        payload: JSON.stringify(nextRecord),
        category: encryptedCategory,
        title: itemTitle,
        metadata: {
          deviceId: input.deviceId ?? 'unknown-device',
          ipAddress: input.ipAddress ?? 'unknown',
        },
      })

      touchUser(user, updatedAt)
        ; (
          user as unknown as { markModified: (path: string) => void }
        ).markModified(`vault.${category}`)
      logAndEmit(
        user,
        isUpdate ? 'UPDATE_ITEM' : 'CREATE_ITEM',
        encryptedCategory,
        itemId,
        {
          ipAddress: input.ipAddress ?? 'unknown',
          deviceId: input.deviceId ?? 'unknown-device',
        },
      )

      logger.info('Encrypted vault item saved', {
        userId: input.userId,
        category: encryptedCategory,
        itemId,
        isUpdate,
      })

      return {
        result: {
          applied: true,
          conflict: false,
          category: encryptedCategory,
          itemId,
          record: nextRecord,
        },
      }
    },
  })
}

/**
 * Deletes vault item with soft-delete semantics
 * Item remains in database marked as deleted for sync purposes
 * Implements conflict detection for concurrent deletes
 *
 * @param input - Item to delete (category + itemId) and device info
 * @returns Delete result or conflict response
 * @throws {AppError} If item not found
 */
export const deleteVaultItemByCategory = async (
  input: DeleteInput,
): Promise<DeleteVaultItemResult> => {
  const category = validateVaultCategory(input.category)
  const itemId = sanitizeItemId(input.itemId)
  if (!itemId) {
    throw new AppError(400, 'INVALID_ITEM_ID', 'Item identifier is invalid.')
  }
  const updatedAt = normalizeDate(input.clientUpdatedAt)
  return retryLoadedUserMutation<DeleteVaultItemResult>({
    mutationName: 'deleteVaultItemByCategory',
    loadUser: () => getUserOrThrow(input.userId),
    operation: async (user) => {
      // Mark item as deleted in isolated collection
      await deleteScopedVaultItemByUsername(
        user._id.toString(),
        user.username,
        itemId,
      )

      touchUser(user, updatedAt)

      logAndEmit(user, 'DELETE_ITEM', category, itemId, {
        ipAddress: input.ipAddress ?? 'unknown',
        deviceId: input.deviceId ?? 'unknown-device',
      })

      logger.info('Vault item deleted', {
        userId: input.userId,
        category,
        itemId,
      })

      return {
        result: {
          applied: true,
          conflict: false,
          category,
          itemId,
          deletedAt: updatedAt,
        },
      }
    },
  })
}
