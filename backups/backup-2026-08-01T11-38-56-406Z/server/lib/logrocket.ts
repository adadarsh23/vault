import type express from 'express'
import LogRocket from 'logrocket'
import { logger } from '../utils/logger.ts'

const appId = process.env.LOGROCKET_APP_ID?.trim()
const isProd = process.env.NODE_ENV === 'production'
const isEnabled = Boolean(appId) && isProd

let initialized = false
let processHandlersRegistered = false

const MONITORING_KEY = Symbol.for('vault.logrocket.monitoring.registered')

export const initLogRocketServer = () => {
  if (!isEnabled || initialized) {
    return false
  }

  try {
    LogRocket.init(appId as string)
    initialized = true
    logger.info('[LOGROCKET] Server monitoring enabled.')
    return true
  } catch (error) {
    logger.warn('[LOGROCKET] Server monitoring init failed.', { error })
    return false
  }
}

export const captureServerException = (error: unknown, context?: Record<string, unknown>) => {
  if (!isEnabled || !initialized) {
    return
  }

  try {
    const normalizedError = error instanceof Error ? error : new Error(String(error))
    const tags: Record<string, string | number | boolean> = {}
    if (context) {
      for (const [key, value] of Object.entries(context)) {
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          tags[key] = value
        }
      }
    }
    LogRocket.captureException(normalizedError, { tags })
  } catch (captureError) {
    logger.warn('[LOGROCKET] Failed to capture server exception.', {
      captureError,
    })
  }
}

export const registerLogRocketProcessHandlers = () => {
  if (!isEnabled || !initialized || processHandlersRegistered) {
    return
  }

  processHandlersRegistered = true
  process.on('unhandledRejection', (reason) => {
    captureServerException(reason, { source: 'unhandledRejection' })
  })
  process.on('uncaughtExceptionMonitor', (error) => {
    captureServerException(error, { source: 'uncaughtExceptionMonitor' })
  })
}

export const logRocketRequestLogger = (): express.RequestHandler => {
  return (req, res, next) => {
    const startedAt = Date.now()
    res.on('finish', () => {
      logger.info('[API REQUEST]', {
        requestId: (req as express.Request & { requestId?: string }).requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      })
    })
    next()
  }
}

export const logRocketErrorMiddleware = (): express.ErrorRequestHandler => {
  return (error, req, _res, next) => {
    captureServerException(error, {
      path: req.originalUrl,
      method: req.method,
      requestId: (req as express.Request & { requestId?: string }).requestId,
    })
    next(error)
  }
}

export const registerLogRocketMiddleware = (app: express.Express) => {
  const scopedApp = app as express.Express & {
    [MONITORING_KEY]?: boolean
  }
  if (scopedApp[MONITORING_KEY]) {
    return
  }

  scopedApp[MONITORING_KEY] = true
  app.use(logRocketRequestLogger())
}
