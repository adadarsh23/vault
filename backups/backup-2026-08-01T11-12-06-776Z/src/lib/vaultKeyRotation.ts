import {
  base64ToUint8Array,
  uint8ArrayToBase64,
} from './cryptoPrimitives.ts'

interface ReencryptableVaultItem {
  title: string
  content: string | Uint8Array
}

const toArrayBuffer = (value: Uint8Array): ArrayBuffer =>
  new Uint8Array(value).buffer
const AES_GCM_IV_LENGTH = 12
const AES_GCM_TAG_LENGTH = 16
const AES_KEY_LENGTH_BYTES = 32
const ENCRYPTED_BUNDLE_MIN_BYTES = AES_GCM_IV_LENGTH + AES_GCM_TAG_LENGTH
const AES_GCM_AAD = new TextEncoder().encode('vault:e2ee:aes-gcm:v2')

type VaultKeyRotationErrorCode =
  | 'CRYPTO_UNAVAILABLE'
  | 'INVALID_KEY_MATERIAL'
  | 'INVALID_CONTENT'
  | 'INTEGRITY_CHECK_FAILED'

type VaultKeyRotationError = Error & {
  code?: VaultKeyRotationErrorCode
  cause?: unknown
}

const createRotationError = (
  message: string,
  code: VaultKeyRotationErrorCode,
  cause?: unknown,
): VaultKeyRotationError => {
  const error = new Error(message) as VaultKeyRotationError
  error.code = code
  if (cause !== undefined) {
    error.cause = cause
  }
  return error
}

const getItemTitleForMessage = (title: string): string => {
  const trimmed = title.trim()
  return trimmed ? trimmed : 'Untitled item'
}

const decodeBase64Safely = (value: string): Uint8Array | null => {
  try {
    return base64ToUint8Array(value)
  } catch {
    return null
  }
}

const importAesKey = async (
  rawKey: string | CryptoKey,
  usages: KeyUsage[],
): Promise<CryptoKey> => {
  if (rawKey instanceof CryptoKey) {
    return rawKey
  }

  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw createRotationError(
      'Secure cryptography is unavailable in this environment.',
      'CRYPTO_UNAVAILABLE',
    )
  }

  const keyBytes = decodeBase64Safely(rawKey)
  if (!keyBytes || keyBytes.byteLength !== AES_KEY_LENGTH_BYTES) {
    throw createRotationError(
      'Invalid vault key material for key rotation.',
      'INVALID_KEY_MATERIAL',
    )
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    { name: 'AES-GCM' },
    false,
    usages,
  )

  // Zero out raw key bytes after import
  keyBytes.fill(0)

  return cryptoKey
}

const decryptAesGcmWithFallback = async (
  cryptoKey: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<ArrayBuffer> => {
  try {
    return await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(AES_GCM_AAD),
      },
      cryptoKey,
      toArrayBuffer(ciphertext),
    )
  } catch {
    return await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      cryptoKey,
      toArrayBuffer(ciphertext),
    )
  }
}

const looksLikeServerRef = (value: string): boolean =>
  /^(https?:\/\/|blob:|data:|\/?uploads\/|\/?api\/)/i.test(value)

const looksLikeEncryptedBundle = (bytes: Uint8Array): boolean =>
  bytes.length >= ENCRYPTED_BUNDLE_MIN_BYTES

const looksLikeReadableMediaBytes = (bytes: Uint8Array): boolean => {
  if (bytes.length < 4) return false

  // PNG
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return true

  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true

  // GIF
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  )
    return true

  // WebP RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return true

  return false
}

export const reencryptVaultItemContent = async (
  item: ReencryptableVaultItem,
  oldKey: string | CryptoKey,
  newKey: string | CryptoKey,
): Promise<ReencryptableVaultItem['content']> => {
  if (!oldKey || !newKey) {
    throw createRotationError(
      'Old and new vault keys are required for key rotation.',
      'INVALID_KEY_MATERIAL',
    )
  }
  if (oldKey === newKey) {
    return item.content
  }

  const itemTitle = getItemTitleForMessage(item.title)

  if (item.content instanceof Uint8Array) {
    let decrypted: ArrayBuffer
    const oldCryptoKey = await importAesKey(oldKey, ['decrypt'])

    if (looksLikeEncryptedBundle(item.content)) {
      const iv = item.content.slice(0, AES_GCM_IV_LENGTH)
      const data = item.content.slice(AES_GCM_IV_LENGTH)
      try {
        decrypted = await decryptAesGcmWithFallback(oldCryptoKey, iv, data)
      } catch (cause) {
        // Some legacy/broken records contain raw media bytes instead of encrypted payloads.
        if (!looksLikeReadableMediaBytes(item.content)) {
          throw createRotationError(
            `Integrity check failed for "${itemTitle}"`,
            'INTEGRITY_CHECK_FAILED',
            cause,
          )
        }
        decrypted = toArrayBuffer(item.content)
      }
    } else {
      // Short payload cannot be AES-GCM ciphertext; treat as already-plain bytes.
      decrypted = toArrayBuffer(item.content)
    }

    const newCryptoKey = await importAesKey(newKey, ['encrypt'])
    const newIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH))
    const newEncrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(newIv),
        additionalData: toArrayBuffer(AES_GCM_AAD),
      },
      newCryptoKey,
      decrypted,
    )

    const result = new Uint8Array(newIv.length + newEncrypted.byteLength)
    result.set(newIv)
    result.set(new Uint8Array(newEncrypted), newIv.length)
    return result
  }

  if (typeof item.content === 'string') {
    if (looksLikeServerRef(item.content)) {
      // Server/file references are not encrypted payload bytes.
      return item.content
    }

    const encryptedBytes = decodeBase64Safely(item.content)
    if (!encryptedBytes) {
      // Non-base64 textual content should be preserved.
      return item.content
    }
    if (!looksLikeEncryptedBundle(encryptedBytes)) {
      // Non-encrypted textual content should be preserved.
      return item.content
    }
    const iv = encryptedBytes.slice(0, AES_GCM_IV_LENGTH)
    const data = encryptedBytes.slice(AES_GCM_IV_LENGTH)
    const oldCryptoKey = await importAesKey(oldKey, ['decrypt'])

    let decrypted: ArrayBuffer
    try {
      decrypted = await decryptAesGcmWithFallback(oldCryptoKey, iv, data)
    } catch (cause) {
      throw createRotationError(
        `Integrity check failed for "${itemTitle}"`,
        'INTEGRITY_CHECK_FAILED',
        cause,
      )
    }

    const newCryptoKey = await importAesKey(newKey, ['encrypt'])
    const newIv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH))
    const newEncrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(newIv),
        additionalData: toArrayBuffer(AES_GCM_AAD),
      },
      newCryptoKey,
      decrypted,
    )

    const result = new Uint8Array(newIv.length + newEncrypted.byteLength)
    result.set(newIv)
    result.set(new Uint8Array(newEncrypted), newIv.length)
    return uint8ArrayToBase64(result)
  }

  throw createRotationError(
    `Invalid content format for "${itemTitle}"`,
    'INVALID_CONTENT',
  )
}
