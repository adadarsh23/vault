type LogLevel = 'debug' | 'info' | 'warn' | 'error'

type LogMetadata = Record<string, unknown>

type LogPayload = {
  level: LogLevel
  message: string
  metadata?: LogMetadata
}

type LoggerTransport = (payload: LogPayload) => void | Promise<void>

const isProduction =
  typeof import.meta !== 'undefined' && import.meta.env?.PROD === true

const transports = new Set<LoggerTransport>()

const redactKeys = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'set-cookie',
  'secret',
])

const sanitizeMetadata = (value: unknown, depth = 0): unknown => {
  if (depth > 3) {
    return '[MaxDepthExceeded]'
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    }
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeMetadata(entry, depth + 1))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      redactKeys.has(key) ? '[REDACTED]' : sanitizeMetadata(entry, depth + 1),
    ]),
  )
}

const writeToConsole = ({ level, message, metadata }: LogPayload) => {
  const args = metadata ? [message, sanitizeMetadata(metadata)] : [message]
  const sink =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : level === 'info'
          ? console.info
          : console.debug

  sink(...args)
}

const emitLog = (payload: LogPayload) => {
  if (!isProduction || payload.level === 'error' || payload.level === 'warn') {
    writeToConsole(payload)
  }

  for (const transport of transports) {
    try {
      void transport(payload)
    } catch (error) {
      writeToConsole({
        level: 'warn',
        message: 'Logger transport failed',
        metadata: { error, originalPayload: payload },
      })
    }
  }
}

export const logger = {
  debug(message: string, metadata?: LogMetadata) {
    emitLog({ level: 'debug', message, metadata })
  },
  info(message: string, metadata?: LogMetadata) {
    emitLog({ level: 'info', message, metadata })
  },
  warn(message: string, metadata?: LogMetadata) {
    emitLog({ level: 'warn', message, metadata })
  },
  error(message: string, metadata?: LogMetadata) {
    emitLog({ level: 'error', message, metadata })
  },
  addTransport(transport: LoggerTransport) {
    transports.add(transport)
    return () => transports.delete(transport)
  },
}
