import { argon2id } from 'hash-wasm'

const AES_GCM_IV_LENGTH = 12
const ARGON2_MEMORY = 65536
const ARGON2_ITERATIONS = 3
const ARGON2_PARALLELISM = 4
const ARGON2_HASH_LENGTH = 32
const KEY_BYTE_LENGTH = 32
const AES_GCM_AAD = new TextEncoder().encode('vault:e2ee:aes-gcm:v2')

const toArrayBuffer = (value: Uint8Array): ArrayBuffer =>
  new Uint8Array(value).buffer

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

export const uint8ArrayToBase64 = (array: Uint8Array): string => {
  const chunkSize = 0x8000
  let binaryString = ''
  for (let i = 0; i < array.length; i += chunkSize) {
    binaryString += String.fromCharCode(
      ...(array.subarray(i, i + chunkSize) as any),
    )
  }
  return btoa(binaryString)
}

const normalizeBase64Input = (value: string): string => {
  let normalized = value.trim()
  if (!normalized) {
    return ''
  }

  if (normalized.includes('%')) {
    try {
      normalized = decodeURIComponent(normalized)
    } catch {
      // Keep original value when URI decoding fails.
    }
  }

  // Handle data URL payloads and strip whitespace/newlines.
  const dataUrlMatch = normalized.match(/^data:[^,]*;base64,(.*)$/i)
  if (dataUrlMatch) {
    normalized = dataUrlMatch[1]
  }

  normalized = normalized.replace(/\s+/g, '')

  // Accept URL-safe Base64 variants.
  normalized = normalized.replace(/-/g, '+').replace(/_/g, '/')

  const remainder = normalized.length % 4
  if (remainder > 0) {
    normalized += '='.repeat(4 - remainder)
  }

  return normalized
}

export const base64ToUint8Array = (base64: string): Uint8Array => {
  if (!base64) return new Uint8Array(0)
  const normalized = normalizeBase64Input(base64)
  if (!normalized) return new Uint8Array(0)

  const binaryString = atob(normalized)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

const cryptoKeyCache = new Map<string, CryptoKey>()

export const clearCryptoKeyCache = (): void => {
  cryptoKeyCache.clear()
}

const computeKeyHash = async (secretKey: string): Promise<string> => {
  const msgUint8 = new TextEncoder().encode(secretKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

const getOrCreateCryptoKey = async (
  secretKey: string | CryptoKey,
): Promise<CryptoKey | null> => {
  if (secretKey instanceof CryptoKey) {
    return secretKey
  }
  const hash = await computeKeyHash(secretKey)
  const cached = cryptoKeyCache.get(hash)
  if (cached) return cached

  try {
    const keyBuf = base64ToUint8Array(secretKey)
    if (keyBuf.length !== KEY_BYTE_LENGTH) {
      return null
    }

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      toArrayBuffer(keyBuf),
      { name: 'AES-GCM' },
      false, // non-extractable
      ['encrypt', 'decrypt'],
    )

    // Secure zero-out of raw key buffer immediately after import
    keyBuf.fill(0)

    cryptoKeyCache.set(hash, cryptoKey)
    return cryptoKey
  } catch {
    return null
  }
}

export const encryptData = async (
  data: string,
  secretKey: string | CryptoKey,
): Promise<string> => {
  const enc = new TextEncoder()
  const cryptoKey = await getOrCreateCryptoKey(secretKey)
  if (!cryptoKey) {
    throw new Error('Failed to import cryptographic key')
  }

  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH))
  const dataBytes = enc.encode(data)

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(AES_GCM_AAD),
    },
    cryptoKey,
    toArrayBuffer(dataBytes),
  )

  // Secure zero-out of plaintext data buffer
  dataBytes.fill(0)

  const bundle = new Uint8Array(iv.length + ciphertext.byteLength)
  bundle.set(iv)
  bundle.set(new Uint8Array(ciphertext), iv.length)
  return uint8ArrayToBase64(bundle)
}

export const decryptData = async (
  encryptedBundle: string,
  secretKey: string | CryptoKey,
): Promise<string | null> => {
  if (!encryptedBundle || !secretKey) {
    return null
  }

  try {
    const bundle = base64ToUint8Array(encryptedBundle)
    if (bundle.length < AES_GCM_IV_LENGTH + 1) {
      return null
    }

    const iv = bundle.slice(0, AES_GCM_IV_LENGTH)
    const ciphertext = bundle.slice(AES_GCM_IV_LENGTH)

    const cryptoKey = await getOrCreateCryptoKey(secretKey)
    if (!cryptoKey) {
      return null
    }

    const decrypted = await decryptAesGcmWithFallback(
      cryptoKey,
      iv,
      ciphertext,
    )

    const decoded = new TextDecoder().decode(decrypted)

    // Secure zero-out of decrypted plaintext buffer
    new Uint8Array(decrypted).fill(0)

    return decoded
  } catch {
    return null
  }
}

export const deriveKey = async (
  password: string,
  salt = 'vault-v1-stable-salt-32bytes',
): Promise<string> => {
  if (!password) throw new Error('Password required for key derivation')

  if (typeof Worker === 'undefined') {
    const saltBuf = new TextEncoder().encode(salt.padEnd(32, '0').slice(0, 32))
    const hash = await argon2id({
      password,
      salt: saltBuf,
      iterations: ARGON2_ITERATIONS,
      memorySize: ARGON2_MEMORY,
      parallelism: ARGON2_PARALLELISM,
      hashLength: ARGON2_HASH_LENGTH,
      outputType: 'binary',
    })
    const base64 = uint8ArrayToBase64(hash)
    hash.fill(0)
    saltBuf.fill(0)
    return base64
  }

  const worker = new Worker(
    new URL('../workers/derive-key.worker.ts', import.meta.url),
    { type: 'module' },
  )

  return new Promise<string>((resolve, reject) => {
    worker.onmessage = (event) => {
      const data = event.data as
        | { ok: true; hashBase64: string }
        | { ok: false; error: string }

      if (data.ok) {
        resolve(data.hashBase64)
      } else {
        reject(new Error(data.error))
      }
      worker.terminate()
    }

    worker.onerror = (event) => {
      reject(new Error(event.message || 'Key derivation worker failed'))
      worker.terminate()
    }

    worker.postMessage({
      password,
      salt,
      iterations: ARGON2_ITERATIONS,
      memorySize: ARGON2_MEMORY,
      parallelism: ARGON2_PARALLELISM,
      hashLength: ARGON2_HASH_LENGTH,
    })
  })
}

export const encryptFile = async (
  file: File,
  secretKey: string | CryptoKey,
): Promise<Uint8Array> => {
  const arrayBuffer = await file.arrayBuffer()
  const data = new Uint8Array(arrayBuffer)

  const cryptoKey = await getOrCreateCryptoKey(secretKey)
  if (!cryptoKey) {
    throw new Error('Failed to import cryptographic key')
  }
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH))
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(AES_GCM_AAD),
    },
    cryptoKey,
    toArrayBuffer(data),
  )

  // Secure zero-out of raw file bytes buffer
  data.fill(0)

  const bundle = new Uint8Array(iv.length + ciphertext.byteLength)
  bundle.set(iv)
  bundle.set(new Uint8Array(ciphertext), iv.length)
  return bundle
}

export const encryptFileInWorker = async (
  file: File,
  secretKey: string | CryptoKey,
): Promise<Uint8Array> => {
  if (typeof Worker === 'undefined') {
    return encryptFile(file, secretKey)
  }

  const fileBuffer = await file.arrayBuffer()
  const worker = new Worker(
    new URL('../workers/encrypt-file.worker.ts', import.meta.url),
    { type: 'module' },
  )

  try {
    const encrypted = await new Promise<Uint8Array>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent) => {
        const data = event.data as
          | { ok: true; encryptedBuffer: ArrayBuffer }
          | { ok: false; error?: string }
        if (data?.ok) {
          resolve(new Uint8Array(data.encryptedBuffer))
        } else {
          reject(new Error(data?.error || 'Worker encryption failed'))
        }
      }
      worker.onerror = (event) => {
        reject(new Error(event.message || 'Worker encryption failed'))
      }
      worker.postMessage({ fileBuffer, secretKey }, [fileBuffer])
    })
    return encrypted
  } finally {
    worker.terminate()
  }
}

/**
 * Splits a base64 key into two XOR shares (Share A and Share B)
 */
export const splitKey = (keyBase64: string): { shareA: string; shareB: string } => {
  const keyBytes = base64ToUint8Array(keyBase64)
  const shareBBytes = new Uint8Array(keyBytes.length)
  crypto.getRandomValues(shareBBytes)
  
  const shareABytes = new Uint8Array(keyBytes.length)
  for (let i = 0; i < keyBytes.length; i++) {
    shareABytes[i] = keyBytes[i] ^ shareBBytes[i]
  }
  
  const shareA = uint8ArrayToBase64(shareABytes)
  const shareB = uint8ArrayToBase64(shareBBytes)

  // Securely wipe memory buffers
  keyBytes.fill(0)
  shareABytes.fill(0)
  shareBBytes.fill(0)
  
  return {
    shareA,
    shareB,
  }
}

/**
 * Reconstructs the original key from two XOR shares (Share A and Share B)
 */
export const reconstructKey = (shareABase64: string, shareBBase64: string): string => {
  const aBytes = base64ToUint8Array(shareABase64)
  const bBytes = base64ToUint8Array(shareBBase64)
  const resultBytes = new Uint8Array(aBytes.length)
  
  for (let i = 0; i < aBytes.length; i++) {
    resultBytes[i] = aBytes[i] ^ bBytes[i]
  }
  
  const result = uint8ArrayToBase64(resultBytes)

  // Securely wipe memory buffers
  aBytes.fill(0)
  bBytes.fill(0)
  resultBytes.fill(0)
  
  return result
}

