const STORAGE_SCOPE = (() => {
  if (typeof window === 'undefined') {
    return 'vault'
  }
  const host = window.location.hostname || 'unknown-host'
  const mode =
    (typeof import.meta !== 'undefined' &&
      (import.meta as any)?.env?.MODE) ||
    'unknown-mode'
  return `vault:${host}:${mode}`
})()

const DEVICE_ID_KEY = `${STORAGE_SCOPE}:device-id`
const TRUSTED_DEVICE_LABELS_KEY = `${STORAGE_SCOPE}:trusted-device-labels`
const REMEMBERED_VAULT_ACCESS_KEY = `${STORAGE_SCOPE}:remembered-access`
const REMEMBERED_VAULT_SECRET_KEY = `${STORAGE_SCOPE}:remembered-access-secret`
const CLOUD_SESSION_HINT_KEY = `${STORAGE_SCOPE}:cloud-session-hint`
const ACCESS_TOKEN_KEY = `${STORAGE_SCOPE}:access-token`
export const AUTH_TOKEN_CLEARED_EVENT = 'vault-auth-token-cleared'

const LEGACY_DEVICE_ID_KEY = 'vault-device-id'
const LEGACY_TRUSTED_DEVICE_LABELS_KEY = 'vault-trusted-device-labels'
const LEGACY_REMEMBERED_VAULT_ACCESS_KEY = 'vault-remembered-access'
const LEGACY_REMEMBERED_VAULT_SECRET_KEY = 'vault-remembered-access-secret'
const LEGACY_CLOUD_SESSION_HINT_KEY = 'vault-cloud-session-hint'
const LEGACY_ACCESS_TOKEN_KEY = 'vault-access-token'

let inMemoryAuthToken: string | null = null

const getSessionStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

const getPersistentStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

const clearRememberedVaultStorage = () => {
  const storage = getPersistentStorage()
  if (!storage) {
    return
  }

  try {
    storage.removeItem(REMEMBERED_VAULT_ACCESS_KEY)
    storage.removeItem(REMEMBERED_VAULT_SECRET_KEY)
    storage.removeItem(LEGACY_REMEMBERED_VAULT_ACCESS_KEY)
    storage.removeItem(LEGACY_REMEMBERED_VAULT_SECRET_KEY)
  } catch {
    // Ignore storage errors for blocked/readonly environments.
  }
}

export const getDeviceId = (): string => {
  const storage = getPersistentStorage() || getSessionStorage()
  if (!storage) {
    return 'server-device'
  }

  let deviceId: string | null = null
  try {
    deviceId = storage.getItem(DEVICE_ID_KEY)
    if (!deviceId) {
      const legacyDeviceId = storage.getItem(LEGACY_DEVICE_ID_KEY)
      if (legacyDeviceId) {
        deviceId = legacyDeviceId
        storage.setItem(DEVICE_ID_KEY, legacyDeviceId)
      }
    }
  } catch {
    return 'server-device'
  }

  if (!deviceId) {
    deviceId = crypto.randomUUID()
    try {
      storage.setItem(DEVICE_ID_KEY, deviceId)
    } catch {
      // Ignore write failures and use in-memory generated id.
    }
  }

  return deviceId
}

export const setAuthToken = (
  token: string,
  _options?: {
    sessionId?: string
    refreshToken?: string
    rememberMe?: boolean
    expiresAt?: Date
    maxAgeSeconds?: number
  },
) => {
  inMemoryAuthToken = token

  const storage = getSessionStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(ACCESS_TOKEN_KEY, token)
  } catch {
    // Ignore write failures.
  }
}

export const getAuthToken = (): string | null => {
  if (inMemoryAuthToken) {
    return inMemoryAuthToken
  }

  const storage = getSessionStorage()
  if (!storage) {
    return null
  }

  try {
    const token = storage.getItem(ACCESS_TOKEN_KEY)
    if (token) {
      inMemoryAuthToken = token
      return token
    }
    const legacyToken = storage.getItem(LEGACY_ACCESS_TOKEN_KEY)
    if (legacyToken) {
      storage.setItem(ACCESS_TOKEN_KEY, legacyToken)
      inMemoryAuthToken = legacyToken
      return legacyToken
    }
  } catch {
    // Ignore read failures.
  }

  return inMemoryAuthToken
}

export const clearAuthToken = () => {
  inMemoryAuthToken = null

  const storage = getSessionStorage()
  if (storage) {
    try {
      storage.removeItem(ACCESS_TOKEN_KEY)
      storage.removeItem(LEGACY_ACCESS_TOKEN_KEY)
    } catch {
      // Ignore cleanup failures.
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_TOKEN_CLEARED_EVENT))
  }
}

export const restoreAuthSessionFromCookies = (): {
  token: string | null
  sessionId: string | null
  rememberMe: boolean
  hasSessionCookie: boolean
} => {
  const token = getAuthToken()
  return {
    token,
    sessionId: null,
    rememberMe: false,
    hasSessionCookie: Boolean(token),
  }
}

export const clearRememberedVaultAccess = () => {
  clearRememberedVaultStorage()
}

export const saveCloudSessionHint = (username: string) => {
  const storage = getPersistentStorage()
  const normalizedUsername = username.trim().toLowerCase()
  if (!storage || !normalizedUsername) {
    return
  }

  try {
    storage.setItem(
      CLOUD_SESSION_HINT_KEY,
      JSON.stringify({
        username: normalizedUsername,
        updatedAt: Date.now(),
      }),
    )
    storage.removeItem(LEGACY_CLOUD_SESSION_HINT_KEY)
  } catch {
    // Ignore write failures.
  }
}

export const readCloudSessionHint = (): { username: string } | null => {
  const storage = getPersistentStorage()
  if (!storage) {
    return null
  }

  let raw: string | null = null
  try {
    raw = storage.getItem(CLOUD_SESSION_HINT_KEY)
    if (!raw) {
      raw = storage.getItem(LEGACY_CLOUD_SESSION_HINT_KEY)
      if (raw) {
        storage.setItem(CLOUD_SESSION_HINT_KEY, raw)
        storage.removeItem(LEGACY_CLOUD_SESSION_HINT_KEY)
      }
    }
  } catch {
    return null
  }
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as { username?: string }
    const username = parsed?.username?.trim().toLowerCase()
    if (!username) {
      try {
        storage.removeItem(CLOUD_SESSION_HINT_KEY)
      } catch {
        // Ignore cleanup failures.
      }
      return null
    }

    return { username }
  } catch {
    try {
      storage.removeItem(CLOUD_SESSION_HINT_KEY)
    } catch {
      // Ignore cleanup failures.
    }
    return null
  }
}

export const clearCloudSessionHint = () => {
  const storage = getPersistentStorage()
  if (!storage) {
    return
  }
  try {
    storage.removeItem(CLOUD_SESSION_HINT_KEY)
    storage.removeItem(LEGACY_CLOUD_SESSION_HINT_KEY)
  } catch {
    // Ignore cleanup failures.
  }
}

const readTrustedDeviceLabels = (): Record<string, string> => {
  const storage = getPersistentStorage()
  if (!storage) {
    return {}
  }

  try {
    let raw = storage.getItem(TRUSTED_DEVICE_LABELS_KEY)
    if (!raw) {
      raw = storage.getItem(LEGACY_TRUSTED_DEVICE_LABELS_KEY)
      if (raw) {
        storage.setItem(TRUSTED_DEVICE_LABELS_KEY, raw)
        storage.removeItem(LEGACY_TRUSTED_DEVICE_LABELS_KEY)
      }
    }
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, string>)
      : {}
  } catch {
    return {}
  }
}

const writeTrustedDeviceLabels = (labels: Record<string, string>) => {
  const storage = getPersistentStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(TRUSTED_DEVICE_LABELS_KEY, JSON.stringify(labels))
  } catch {
    // Ignore write failures.
  }
}

export const getTrustedDeviceLabel = (deviceId: string): string => {
  const label = readTrustedDeviceLabels()[deviceId]
  return typeof label === 'string' ? label : ''
}

export const getTrustedDeviceLabels = (): Record<string, string> =>
  readTrustedDeviceLabels()

export const setTrustedDeviceLabel = (deviceId: string, label: string) => {
  const normalizedDeviceId = deviceId.trim()
  if (!normalizedDeviceId) {
    return
  }

  const labels = readTrustedDeviceLabels()
  const normalizedLabel = label.trim()

  if (!normalizedLabel) {
    delete labels[normalizedDeviceId]
  } else {
    labels[normalizedDeviceId] = normalizedLabel
  }

  writeTrustedDeviceLabels(labels)
}
