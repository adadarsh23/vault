import compression from 'compression'
import type { Request, Response } from 'express'
import { constants as zlibConstants } from 'zlib'

const shouldCompress = (req: Request, res: Response): boolean => {
  if (req.headers['x-no-compression']) {
    return false
  }

  const contentEncoding = res.getHeader('Content-Encoding')

  if (typeof contentEncoding === 'string' && contentEncoding !== 'identity') {
    return false
  }

  if (Array.isArray(contentEncoding) && contentEncoding.length > 0) {
    return false
  }

  return compression.filter(req, res)
}

export const deepCompressionOptions: Parameters<typeof compression>[0] = {
  level: 6,
  memLevel: 8,
  threshold: 1024,
  brotli: {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
    },
  },
  filter: shouldCompress,
}
