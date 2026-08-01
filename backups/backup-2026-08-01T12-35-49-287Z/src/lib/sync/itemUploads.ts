import { VaultItem } from '../storage'
import { handleError } from '../error-handler'
import { encryptData } from '../cryptoPrimitives'
import { API_BASE_URL, getAuthHeaders, runInSyncWriteQueue, uploadWithRetry } from './core'
import { uploadBinaryInChunks } from './chunkUpload'
import { toCloudCategory } from './itemCodec'

/**
 * End-to-End Encrypts and sends to MongoDB via API.
 */
export const uploadItemToCloud = async (
  item: VaultItem,
  masterKey: string | CryptoKey,
  onProgress?: (progress: number) => void,
) => {
  const syncContext = `Cloud Sync (${item.type || 'item'})`

  try {
    await runInSyncWriteQueue(async () => {
      const category = toCloudCategory(item.type || 'file')

      let finalPayload: any
      let contentType = 'application/json'

      const fullMetadata = {
        ...(item.metadata || {}),
        id: item.id,
        folder: item.folder ?? null,
        username: item.username ?? null,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        deletedAt: item.deletedAt ?? null,
        isPinned: Boolean(item.isPinned),
        pinnedAt: item.pinnedAt ?? null,
        browser:
          typeof navigator !== 'undefined'
            ? navigator.userAgent
            : 'Unknown Browser',
        source: item.source || 'cloud',
      }

      if (item.content instanceof Uint8Array) {
        finalPayload = item.content
        contentType = 'application/octet-stream'
      } else {
        const metadataOnly = { ...item, content: '__ENC__' }
        const encryptedMetadata = await encryptData(
          JSON.stringify(metadataOnly),
          masterKey,
        )

        finalPayload = JSON.stringify({
          payload: `V2_MODERN:${encryptedMetadata}|${item.content}`,
          category,
        })
      }

      const encryptedTitle = await encryptData(item.title || '', masterKey)
      const encryptedMetadataHeader = await encryptData(
        JSON.stringify(fullMetadata),
        masterKey,
      )

      const uploadHeaders: Record<string, string> = {
        ...getAuthHeaders(),
        'Content-Type': contentType,
        'X-Vault-Category': category,
        'X-Vault-Title': `V2_ENC:${encryptedTitle}`,
        'X-Vault-Metadata': `V2_ENC:${encryptedMetadataHeader}`,
      }
      // Binary uploads cannot send folder in JSON body; server cannot read encrypted metadata headers.
      if (item.folder && String(item.folder).trim()) {
        uploadHeaders['X-Vault-Folder'] = encodeURIComponent(
          String(item.folder),
        )
      }

      if (finalPayload instanceof Uint8Array) {
        await uploadBinaryInChunks(
          `${API_BASE_URL}/api/vault/items/${item.id}`,
          'POST',
          uploadHeaders,
          finalPayload,
          syncContext,
          onProgress,
          { uploadKey: `${item.id}:${finalPayload.byteLength}` },
        )
      } else {
        await uploadWithRetry(
          `${API_BASE_URL}/api/vault/items/${item.id}`,
          {
            method: 'POST',
            headers: uploadHeaders,
            body: finalPayload,
          },
          syncContext,
          onProgress,
        )
      }
    })
  } catch (error) {
    handleError(error, syncContext)
    throw error
  }
}
