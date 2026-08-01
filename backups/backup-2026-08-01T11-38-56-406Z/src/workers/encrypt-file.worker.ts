const AES_GCM_IV_LENGTH = 12
const KEY_BYTE_LENGTH = 32
const AES_GCM_AAD = new TextEncoder().encode('vault:e2ee:aes-gcm:v2')
const MAX_SECRET_KEY_BASE64_LENGTH = 1024

type EncryptFileWorkerRequest = {
  fileBuffer: ArrayBuffer
  secretKey: string | CryptoKey
  requestId?: string
}

type EncryptFileWorkerResponseSuccess = {
  ok: true
  encryptedBuffer: ArrayBuffer
  requestId?: string
}

type EncryptFileWorkerErrorCode =
  | 'INVALID_PAYLOAD'
  | 'INVALID_SECRET_KEY'
  | 'UNSUPPORTED_CRYPTO'
  | 'ENCRYPTION_FAILED'

type EncryptFileWorkerResponseFailure = {
  ok: false
  error: string
  code: EncryptFileWorkerErrorCode
  requestId?: string
}

type EncryptFileWorkerResponse =
  | EncryptFileWorkerResponseSuccess
  | EncryptFileWorkerResponseFailure

class WorkerProtocolError extends Error {
  readonly code: EncryptFileWorkerErrorCode

  constructor(code: EncryptFileWorkerErrorCode, message: string) {
    super(message)
    this.name = 'WorkerProtocolError'
    this.code = code
  }
}

type WorkerMessageScope = {
  onmessage: ((event: MessageEvent<unknown>) => void | Promise<void>) | null
  postMessage: (message: unknown, transfer?: Transferable[]) => void
}

const workerScope = self as unknown as WorkerMessageScope

const isLikelyBase64 = (value: string): boolean =>
  /^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 !== 1

const base64ToUint8Array = (base64: string): Uint8Array => {
  const normalized = base64.trim()
  if (!normalized || normalized.length > MAX_SECRET_KEY_BASE64_LENGTH) {
    throw new WorkerProtocolError(
      'INVALID_SECRET_KEY',
      'Secret key format is invalid.',
    )
  }
  if (!isLikelyBase64(normalized)) {
    throw new WorkerProtocolError(
      'INVALID_SECRET_KEY',
      'Secret key must be valid base64.',
    )
  }

  let binaryString: string
  try {
    binaryString = atob(normalized)
  } catch {
    throw new WorkerProtocolError(
      'INVALID_SECRET_KEY',
      'Secret key is not decodable base64.',
    )
  }

  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

const parseRequest = (data: unknown): EncryptFileWorkerRequest => {
  if (!data || typeof data !== 'object') {
    throw new WorkerProtocolError(
      'INVALID_PAYLOAD',
      'Worker payload must be an object.',
    )
  }

  const candidate = data as Partial<EncryptFileWorkerRequest>
  if (!(candidate.fileBuffer instanceof ArrayBuffer)) {
    throw new WorkerProtocolError(
      'INVALID_PAYLOAD',
      'fileBuffer must be an ArrayBuffer.',
    )
  }
  if (typeof candidate.secretKey !== 'string' && !(candidate.secretKey instanceof CryptoKey)) {
    throw new WorkerProtocolError(
      'INVALID_PAYLOAD',
      'secretKey must be a string or a CryptoKey.',
    )
  }
  if (
    candidate.requestId !== undefined &&
    typeof candidate.requestId !== 'string'
  ) {
    throw new WorkerProtocolError(
      'INVALID_PAYLOAD',
      'requestId must be a string when provided.',
    )
  }

  return {
    fileBuffer: candidate.fileBuffer,
    secretKey: candidate.secretKey,
    requestId: candidate.requestId,
  }
}

const postFailure = (
  requestId: string | undefined,
  code: EncryptFileWorkerErrorCode,
  error: string,
) => {
  const payload: EncryptFileWorkerResponseFailure = {
    ok: false,
    error,
    code,
    requestId,
  }
  workerScope.postMessage(payload)
}

const toFailure = (
  error: unknown,
): { code: EncryptFileWorkerErrorCode; message: string } => {
  if (error instanceof WorkerProtocolError) {
    return { code: error.code, message: error.message }
  }

  if (error instanceof Error) {
    return { code: 'ENCRYPTION_FAILED', message: error.message }
  }

  return { code: 'ENCRYPTION_FAILED', message: 'File encryption failed.' }
}

workerScope.onmessage = async (event: MessageEvent<unknown>) => {
  let requestId: string | undefined
  try {
    const request = parseRequest(event.data)
    requestId = request.requestId
    if (!crypto?.subtle?.encrypt || !crypto?.subtle?.importKey) {
      throw new WorkerProtocolError(
        'UNSUPPORTED_CRYPTO',
        'WebCrypto AES-GCM APIs are unavailable in this environment.',
      )
    }

    const { fileBuffer, secretKey } = request
    const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH))
    const ivForCrypto = Uint8Array.from(iv)
    const aadForCrypto = Uint8Array.from(AES_GCM_AAD)

    let cryptoKey: CryptoKey
    if (secretKey instanceof CryptoKey) {
      cryptoKey = secretKey
    } else {
      const keyBuf = base64ToUint8Array(secretKey)
      if (keyBuf.length !== KEY_BYTE_LENGTH) {
        throw new WorkerProtocolError(
          'INVALID_SECRET_KEY',
          `Invalid key length: expected ${KEY_BYTE_LENGTH} bytes.`,
        )
      }

      const keyMaterial = Uint8Array.from(keyBuf)
      cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyMaterial,
        { name: 'AES-GCM' },
        false,
        ['encrypt'],
      )

      // Secure zero-out of key material
      keyBuf.fill(0)
      keyMaterial.fill(0)
    }

    const ciphertext = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: ivForCrypto,
        additionalData: aadForCrypto,
      },
      cryptoKey,
      fileBuffer,
    )

    const encrypted = new Uint8Array(iv.length + ciphertext.byteLength)
    encrypted.set(iv)
    encrypted.set(new Uint8Array(ciphertext), iv.length)

    const payload: EncryptFileWorkerResponseSuccess = {
      ok: true,
      encryptedBuffer: encrypted.buffer,
      requestId,
    }
    workerScope.postMessage(
      payload as EncryptFileWorkerResponse,
      [encrypted.buffer],
    )
  } catch (error) {
    const failure = toFailure(error)
    postFailure(requestId, failure.code, failure.message)
  }
}
