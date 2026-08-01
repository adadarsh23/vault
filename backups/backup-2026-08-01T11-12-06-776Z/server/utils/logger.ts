import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogMeta = Record<string, unknown>

interface LogPayload {
  level: LogLevel
  message: string
  timestamp: string
  pid: number
  hostname: string
  environment: string
  meta?: unknown
}

const LOG_DIRECTORY = path.resolve(process.cwd(), 'logs')
const LOG_FILE = path.join(LOG_DIRECTORY, 'server.jsonl')

const MAX_RECENT_LOGS = 100
const MAX_DEPTH = 5
const MAX_ARRAY_LENGTH = 50

const recentLogs: LogPayload[] = []

const REDACTED_TEXT = '[REDACTED]'
const MAX_DEPTH_TEXT = '[MaxDepthExceeded]'
const CIRCULAR_REFERENCE_TEXT = '[CircularReference]'
const URL_LIKE_KEYS = new Set([
  'path',
  'url',
  'originalurl',
  'referer',
  'referrer',
  'location',
])
const SENSITIVE_QUERY_PARAM_PATTERN =
  /([?&](?:auth_token|access_token|refresh_token|token|signature|sig|api_key|apikey)=)[^&#]*/gi

const redactKeys = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'refreshtokenhash',
  'authorization',
  'cookie',
  'set-cookie',
  'secret',
  'privatekey',
  'apikey',
  'clientsecret',
  'signature',
  'ciphertext',
  'authtag',
  'iv',
])

// Ensure log directory exists once during startup
fs.mkdirSync(LOG_DIRECTORY, {
  recursive: true,
})

// Non-blocking write stream
let logStream = fs.createWriteStream(LOG_FILE, {
  flags: 'a',
  encoding: 'utf8',
})

logStream.on('error', (error) => {
  console.error('Logger stream error:', error)
})

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return Object.prototype.toString.call(value) === '[object Object]'
}

const normalizeKey = (key: string): string => {
  return key.toLowerCase()
}

const sanitizeUrlForLogs = (value: string): string => {
  return value.replace(SENSITIVE_QUERY_PARAM_PATTERN, '$1[REDACTED]')
}

const serializeValue = (
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
  keyHint?: string,
): unknown => {
  // Prevent deep recursion
  if (depth > MAX_DEPTH) {
    return MAX_DEPTH_TEXT
  }

  // Handle primitive values
  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (typeof value === 'string') {
    if (keyHint && URL_LIKE_KEYS.has(normalizeKey(keyHint))) {
      return sanitizeUrlForLogs(value)
    }
    return value
  }

  // Handle bigint
  if (typeof value === 'bigint') {
    return value.toString()
  }

  // Handle functions
  if (typeof value === 'function') {
    return `[Function: ${value.name || 'anonymous'}]`
  }

  // Handle Error objects
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }

  // Handle Date
  if (value instanceof Date) {
    return value.toISOString()
  }

  // Handle Buffer
  if (Buffer.isBuffer(value)) {
    return `[Buffer: ${value.length} bytes]`
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((entry) => serializeValue(entry, depth + 1, seen, keyHint))
  }

  // Handle objects
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return CIRCULAR_REFERENCE_TEXT
    }

    seen.add(value)

    if (!isPlainObject(value)) {
      return String(value)
    }

    const serializedObject: Record<string, unknown> = {}

    for (const [key, entry] of Object.entries(value)) {
      const normalizedKey = normalizeKey(key)

      serializedObject[key] = redactKeys.has(normalizedKey)
        ? REDACTED_TEXT
        : serializeValue(entry, depth + 1, seen, key)
    }

    return serializedObject
  }

  return String(value)
}

const pushRecentLog = (payload: LogPayload): void => {
  recentLogs.push(payload)

  if (recentLogs.length > MAX_RECENT_LOGS) {
    recentLogs.shift()
  }
}

const createPayload = (
  level: LogLevel,
  message: string,
  meta?: unknown,
  extraMeta?: LogMeta,
): LogPayload => {
  const mergedMeta: LogMeta = {}

  if (meta instanceof Error) {
    mergedMeta.error = {
      name: meta.name,
      message: meta.message,
      stack: meta.stack,
    }
  } else if (isPlainObject(meta)) {
    Object.assign(mergedMeta, meta)
  } else if (meta !== undefined) {
    mergedMeta.value = meta
  }

  if (isPlainObject(extraMeta)) {
    Object.assign(mergedMeta, extraMeta)
  }

  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    pid: process.pid,
    hostname: os.hostname(),
    environment: process.env.NODE_ENV || 'development',
    ...(Object.keys(mergedMeta).length > 0
      ? {
          meta: serializeValue(mergedMeta),
        }
      : {}),
  }
}

const writeLog = (
  level: LogLevel,
  message: string,
  meta?: unknown,
  extraMeta?: LogMeta,
): void => {
  try {
    const payload = createPayload(level, message, meta, extraMeta)

    pushRecentLog(payload)

    const line = `${JSON.stringify(payload)}\n`

    // Non-blocking async write
    logStream.write(line)

    // Console output in development
    if (process.env.NODE_ENV !== 'production') {
      const consoleMethod =
        level === 'error'
          ? console.error
          : level === 'warn'
            ? console.warn
            : console.log

      consoleMethod(
        `[${payload.timestamp}] ${level.toUpperCase()} ${message}`,
        payload.meta || '',
      )
    }
  } catch (error) {
    console.error('Logger failure:', error)
  }
}

export const logger = {
  debug: (message: string, meta?: unknown, extraMeta?: LogMeta): void => {
    writeLog('debug', message, meta, extraMeta)
  },

  info: (message: string, meta?: unknown, extraMeta?: LogMeta): void => {
    writeLog('info', message, meta, extraMeta)
  },

  warn: (message: string, meta?: unknown, extraMeta?: LogMeta): void => {
    writeLog('warn', message, meta, extraMeta)
  },

  error: (message: string, meta?: unknown, extraMeta?: LogMeta): void => {
    writeLog('error', message, meta, extraMeta)
  },

  getRecentLogs(): LogPayload[] {
    return [...recentLogs]
  },

  clearLogs(): void {
    recentLogs.length = 0
    try {
      logStream.end()
      fs.writeFileSync(LOG_FILE, '', { flag: 'w' })
      logStream = fs.createWriteStream(LOG_FILE, {
        flags: 'a',
        encoding: 'utf8',
      })
      logStream.on('error', (error) => {
        console.error('Logger stream error:', error)
      })
    } catch (error) {
      console.error('Failed to clear log file:', error)
    }
  },

  close(): void {
    logStream.end()
  },
}

// Graceful shutdown handling
process.on('beforeExit', () => {
  logger.close()
})

process.on('SIGINT', () => {
  logger.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  logger.close()
  process.exit(0)
})
