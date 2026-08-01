import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import type { Server as HttpServer } from 'http'
import compression from 'compression'
import fs from 'fs'
import path from 'path'
import { createServer as createViteServer, type ViteDevServer } from 'vite'
import { logger } from './utils/logger.ts'
import { deepCompressionOptions } from './utils/compression.ts'

const ONE_YEAR_IN_SECONDS = 31536000
const ONE_HOUR_IN_SECONDS = 3600
const COMPRESSIBLE_STATIC_FILE_PATTERN =
  /\.(js|mjs|cjs|css|html|svg|json|txt|xml|map|wasm|webmanifest)$/i
const PRECOMPRESSED_SUFFIX_PATTERN = /\.(br|gz)$/i
const STATIC_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

type PrecompressedVariant = {
  encoding: 'br' | 'gzip'
  extension: '.br' | '.gz'
}

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
}

const shouldDisableCache = (requestPath: string): boolean => {
  return (
    requestPath === '/@vite/client' ||
    requestPath === '/@react-refresh' ||
    requestPath.startsWith('/src/')
  )
}

const setSecurityHeaders = (res: Response): void => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

const resolveStaticContentType = (requestPath: string): string | undefined => {
  const normalizedPath = requestPath
    .replace(PRECOMPRESSED_SUFFIX_PATTERN, '')
    .toLowerCase()
  const extension = path.extname(normalizedPath)
  return STATIC_CONTENT_TYPE_BY_EXTENSION[extension]
}

const setStaticAssetHeaders = (res: Response, filePath: string): void => {
  setSecurityHeaders(res)

  const normalizedPath = filePath.replace(/\\/g, '/')
  const uncompressedPath = normalizedPath.replace(PRECOMPRESSED_SUFFIX_PATTERN, '')
  const contentType = resolveStaticContentType(uncompressedPath)

  if (contentType) {
    res.setHeader('Content-Type', contentType)
  }

  // Prevent unwanted download behavior for script modules.
  if (
    uncompressedPath.endsWith('.js') ||
    uncompressedPath.endsWith('.mjs') ||
    uncompressedPath.endsWith('.cjs')
  ) {
    res.removeHeader('Content-Disposition')
  }

  // Immutable hashed assets
  if (uncompressedPath.includes('/assets/')) {
    res.setHeader(
      'Cache-Control',
      `public, max-age=${ONE_YEAR_IN_SECONDS}, immutable`,
    )
    return
  }

  // Service worker registration file
  if (uncompressedPath.endsWith('/sw-register.js')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    return
  }

  // Service worker itself must always revalidate
  if (uncompressedPath.endsWith('/sw.js')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    return
  }

  // HTML should never be cached
  if (uncompressedPath.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    return
  }

  // Default cache policy
  res.setHeader('Cache-Control', `public, max-age=${ONE_HOUR_IN_SECONDS}`)
}

const resolvePreferredPrecompressedVariants = (
  acceptEncodingHeader: string | string[] | undefined,
): PrecompressedVariant[] => {
  if (!acceptEncodingHeader) {
    return []
  }

  const normalized = (
    Array.isArray(acceptEncodingHeader)
      ? acceptEncodingHeader.join(',')
      : acceptEncodingHeader
  ).toLowerCase()
  const variants: PrecompressedVariant[] = []

  if (normalized.includes('br')) {
    variants.push({
      encoding: 'br',
      extension: '.br',
    })
  }

  if (normalized.includes('gzip')) {
    variants.push({
      encoding: 'gzip',
      extension: '.gz',
    })
  }

  return variants
}

const appendExtensionToUrlPath = (requestUrl: string, extension: string): string => {
  const querySeparatorIndex = requestUrl.indexOf('?')

  if (querySeparatorIndex < 0) {
    return `${requestUrl}${extension}`
  }

  return `${requestUrl.slice(0, querySeparatorIndex)}${extension}${requestUrl.slice(querySeparatorIndex)}`
}

const setupDevelopmentMiddleware = async (
  app: Express,
  httpServer: HttpServer,
): Promise<void> => {
  let vite: ViteDevServer

  try {
    vite = await createViteServer({
      appType: 'spa',
      server: {
        middlewareMode: true,

        headers: NO_CACHE_HEADERS,

        hmr: {
          server: httpServer,
        },

        watch: {
          ignored: [
            '**/.git/**',
            '**/backups/**',
            '**/build/**',
            '**/dist/**',
            '**/*.zip',
            '**/stats.html',
          ],
        },
      },
    })
  } catch (error) {
    logger.error('Failed to initialize Vite development server', {
      error,
    })

    throw error
  }

  // Prevent browser cache issues during development
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (shouldDisableCache(req.path)) {
      delete req.headers['if-none-match']
      delete req.headers['if-modified-since']

      Object.entries(NO_CACHE_HEADERS).forEach(([key, value]) => {
        res.setHeader(key, value)
      })
    }

    next()
  })

  app.use(vite.middlewares)

  logger.info('Vite development middleware initialized successfully')
}

const setupProductionMiddleware = (app: Express): void => {
  const buildRoot = path.resolve(process.cwd(), 'build')
  const indexHtmlPath = path.join(buildRoot, 'index.html')

  // Ensure build exists
  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error(`Frontend build not found at: ${indexHtmlPath}`)
  }

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next()
    }

    if (typeof req.headers.range === 'string') {
      return next()
    }

    const requestPath = req.path
    if (!COMPRESSIBLE_STATIC_FILE_PATTERN.test(requestPath)) {
      return next()
    }

    if (PRECOMPRESSED_SUFFIX_PATTERN.test(requestPath)) {
      return next()
    }

    const preferredVariants = resolvePreferredPrecompressedVariants(
      req.headers['accept-encoding'],
    )

    if (preferredVariants.length === 0) {
      return next()
    }

    const relativePath = requestPath.replace(/^\/+/, '')
    for (const variant of preferredVariants) {
      const precompressedPath = path.join(
        buildRoot,
        `${relativePath}${variant.extension}`,
      )
      if (!fs.existsSync(precompressedPath)) {
        continue
      }

      res.setHeader('Content-Encoding', variant.encoding)
      res.setHeader('Vary', 'Accept-Encoding')

      if (!res.getHeader('Content-Type')) {
        const contentType = resolveStaticContentType(requestPath)
        if (contentType) {
          res.setHeader('Content-Type', contentType)
        }
      }

      req.url = appendExtensionToUrlPath(req.url, variant.extension)
      return next()
    }

    return next()
  })

  // Compression should come before static serving
  app.use(compression(deepCompressionOptions))

  // Serve static files
  app.use(
    express.static(buildRoot, {
      index: false,
      etag: true,
      fallthrough: true,

      setHeaders: (res, filePath) => {
        setStaticAssetHeaders(res, filePath)
      },
    }),
  )

  // SPA fallback
  app.get(/.*/, (req: Request, res: Response, next: NextFunction) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
      return next()
    }

    setSecurityHeaders(res)

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')

    res.sendFile(indexHtmlPath, (error) => {
      if (error) {
        logger.error('Failed to serve index.html', {
          error,
          path: req.path,
        })

        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Internal Server Error',
          })
        }
      }
    })
  })

  logger.info('Production frontend middleware initialized successfully')
}

export const setupFrontendMiddleware = async (
  app: Express,
  httpServer: HttpServer,
): Promise<void> => {
  const isProduction = process.env.NODE_ENV === 'production'

  if (!isProduction) {
    await setupDevelopmentMiddleware(app, httpServer)
    return
  }

  setupProductionMiddleware(app)
}
