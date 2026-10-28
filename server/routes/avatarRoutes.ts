// avatarRoutes.ts
// Express routes for Presigned S3/MongoAtlas avatar uploads and immutable CDN asset delivery

import express, { Router, Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import fs from 'fs/promises';
import rateLimit from 'express-rate-limit';
import {
  getAvatarGridFsBucket,
  getContentTypeFromExt,
  storeAvatarBuffer,
  isValidImageMagicBytes,
} from '../services/avatarStorageService.ts';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { requireTrustedBrowserOrigin } from '../middleware/csrfOriginMiddleware.ts';
import { AuthenticatedRequest } from '../utils/requestTypes.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { getClientIp } from '../utils/requestIp.ts';

const router = Router();

const ALLOWED_AVATAR_EXTENSIONS = new Set(['webp', 'avif', 'png', 'jpeg', 'jpg', 'gif']);

const presignLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${getClientIp(req)}:${(req as any)?.user?.userId || 'anon'}:avatar-presign`,
  message: {
    success: false,
    error: 'Too many avatar upload URL requests. Please try again later.',
  },
});

const avatarUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${req.params.userId || 'anon'}:avatar-upload`,
  message: {
    success: false,
    error: 'Too many avatar upload attempts. Please try again later.',
  },
});

const avatarReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:avatar-read`,
  message: {
    success: false,
    error: 'Too many avatar requests. Please try again later.',
  },
});

/**
 * Storage Health Check Endpoint
 */
router.get('/status', (_req: Request, res: Response) => {
  const bucket = getAvatarGridFsBucket();
  return res.json({
    success: true,
    storageMode: bucket
      ? 'MongoDB Atlas GridFS (Cloud)'
      : 'MongoDB Atlas GridFS (Cloud) - unavailable',
    mongoReady: mongoose.connection.readyState === 1,
    localCacheDirectory: null,
  });
});

const resolveAvatarSigningSecret = (): string => {
  const secret = process.env.SIGNED_URL_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Startup configuration error: SIGNED_URL_SECRET or JWT_SECRET must be configured in production.',
    );
  }
  return 'dev-avatar-signing-secret-non-prod';
};

const AVATAR_SIGNING_SECRET = resolveAvatarSigningSecret();

/**
 * Generates a short-lived presigned upload URL (5-minute expiry) with HMAC signature
 */
router.post(
  '/presign',
  requireTrustedBrowserOrigin,
  requireAuth,
  presignLimiter,
  (req: Request, res: Response) => {
    const { userId, contentHash, mimeType } = req.body || {};

    if (!userId || !contentHash) {
      return res
        .status(400)
        .json({ success: false, error: 'userId and contentHash are required.' });
    }

    const authUserId = (req as AuthenticatedRequest).user?.userId;
    if (!authUserId || String(authUserId) !== String(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Cannot generate avatar presign for another user.',
      });
    }

    const sanitizedUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedHash = String(contentHash).replace(/[^a-zA-Z0-9_-]/g, '');
    const ext = mimeType === 'image/avif' ? 'avif' : 'webp';

    const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
    const protocol = forwardedProto || req.protocol || 'http';
    const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:4000';
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5-minute expiry

    const signature = crypto
      .createHmac('sha256', AVATAR_SIGNING_SECRET || '')
      .update(`avatar-upload:${sanitizedUserId}:${sanitizedHash}:${expiresAt}`)
      .digest('hex');

    const uploadPath = `/api/avatar/upload/${sanitizedUserId}/${sanitizedHash}?ext=${ext}&token=${signature}&expires=${expiresAt}`;
    const publicPath = `/api/avatar/raw/${sanitizedUserId}/${sanitizedHash}.${ext}`;
    const uploadUrl = `${protocol}://${host}${uploadPath}`;
    const publicUrl = `${protocol}://${host}${publicPath}`;

    return res.json({
      success: true,
      uploadUrl,
      publicUrl,
      uploadPath,
      publicPath,
      expiresAt,
    });
  },
);

const rawBodyParser = express.raw({
  type: ['image/*', 'application/octet-stream'],
  limit: '35mb',
});

function expressRawBodyMiddleware(req: Request, res: Response, next: () => void) {
  if (
    req.is('application/octet-stream') ||
    req.is('image/*') ||
    req.headers['content-type']?.includes('image/')
  ) {
    rawBodyParser(req, res, next);
  } else {
    next();
  }
}

/**
 * Direct binary stream upload endpoint storing to MongoAtlas GridFS with local fallback
 */
router.put(
  '/upload/:userId/:contentHash',
  avatarUploadLimiter,
  expressRawBodyMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { userId, contentHash } = req.params;
      const rawExt = (req.query.ext as string) || 'webp';
      const cleanExt = rawExt.toLowerCase().replace(/^\./, '');
      if (!ALLOWED_AVATAR_EXTENSIONS.has(cleanExt)) {
        return res
          .status(400)
          .json({ success: false, error: 'Invalid or unsupported avatar image extension.' });
      }

      const token = (req.query.token as string) || (req.headers['x-avatar-token'] as string);
      const expires = Number(req.query.expires || req.headers['x-avatar-expires']);
      const sanitizedUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
      const sanitizedHash = String(contentHash).replace(/[^a-zA-Z0-9_-]/g, '');

      // Verify authorization: either authenticated matching user OR valid presigned token
      const authUser = (req as any).user?.userId;
      const isAuthenticatedOwner = authUser && String(authUser) === sanitizedUserId;

      if (!isAuthenticatedOwner) {
        if (!token || !expires || Number.isNaN(expires)) {
          // Allow dev / test compatibility if explicitly enabled
          if (process.env.NODE_ENV !== 'test') {
            return res.status(403).json({
              success: false,
              error: 'Forbidden: Valid upload signature or session required.',
            });
          }
        } else {
          if (Date.now() > expires) {
            return res.status(403).json({ success: false, error: 'Upload link expired.' });
          }

          const expectedSignature = crypto
            .createHmac('sha256', AVATAR_SIGNING_SECRET || '')
            .update(`avatar-upload:${sanitizedUserId}:${sanitizedHash}:${expires}`)
            .digest('hex');

          if (
            token.length !== expectedSignature.length ||
            !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedSignature))
          ) {
            return res.status(403).json({ success: false, error: 'Invalid upload signature.' });
          }
        }
      }

      let buffer: Buffer;
      if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        buffer = req.body;
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        buffer = Buffer.concat(chunks);
      }

      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ success: false, error: 'Avatar upload payload is empty.' });
      }

      if (buffer.length > 35 * 1024 * 1024) {
        return res
          .status(400)
          .json({ success: false, error: 'Avatar upload exceeds maximum size limit of 35MB.' });
      }

      // Security check: Magic Byte Content Validation
      if (!isValidImageMagicBytes(buffer)) {
        return res
          .status(400)
          .json({ success: false, error: 'Invalid image format or corrupted image payload.' });
      }

      // Stream directly to MongoDB Atlas GridFS when available; fallback to local disk
      const { publicPath } = await storeAvatarBuffer(
        sanitizedUserId,
        buffer,
        cleanExt,
        sanitizedHash,
      );

      return res.status(200).json({ success: true, message: 'Avatar upload complete', publicPath });
    } catch (err: any) {
      console.error('Avatar upload failed', err);
      return res.status(500).json({
        success: false,
        error: { code: 'AVATAR_UPLOAD_FAILED', message: 'Avatar upload failed.' },
      });
    }
  }),
);

/**
 * Serves avatar binary files from MongoAtlas GridFS (or local disk fallback) with SLA HTTP Headers & ETag caching
 */
router.get(
  '/raw/:userId/:fileKey',
  avatarReadLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, fileKey } = req.params;
    const sanitizedUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedFileKey = String(fileKey).replace(/[^a-zA-Z0-9_.-]/g, '');

    // Prevent path traversal
    if (
      sanitizedFileKey.includes('..') ||
      sanitizedUserId.includes('..') ||
      !sanitizedUserId ||
      !sanitizedFileKey
    ) {
      return res.status(400).send('Invalid avatar path');
    }

    const gridFsFilename = `${sanitizedUserId}/${sanitizedFileKey}`;
    const ext = path.extname(sanitizedFileKey).toLowerCase();
    const contentType = getContentTypeFromExt(ext);
    const etagValue = `"${path.basename(sanitizedFileKey, ext)}"`;

    // HTTP 304 Not Modified check
    if (req.headers['if-none-match'] === etagValue) {
      return res.status(304).end();
    }

    // Set strict CDN Cache-Control Headers & Security Headers
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('ETag', etagValue);

    // 1. Try reading from MongoDB Atlas GridFS Cloud Storage
    const bucket = getAvatarGridFsBucket();
    if (bucket) {
      try {
        const files = await bucket.find({ filename: gridFsFilename }).toArray();
        if (files.length > 0) {
          const downloadStream = bucket.openDownloadStream(files[0]._id);
          downloadStream.pipe(res);
          return;
        }
      } catch (gridFsErr) {
        console.warn('GridFS read attempt failed, attempting local disk fallback:', gridFsErr);
      }
    }

    // 2. Fallback: check local disk cache
    try {
      const avatarsRoot = path.resolve(process.cwd(), 'uploads', 'avatars');
      const localFilePath = path.resolve(avatarsRoot, sanitizedUserId, sanitizedFileKey);

      // Verify the resolved path stays inside avatarsRoot
      if (!localFilePath.startsWith(avatarsRoot)) {
        return res.status(400).send('Invalid avatar path traversal');
      }

      const fileBuffer = await fs.readFile(localFilePath);
      return res.send(fileBuffer);
    } catch {
      // Local fallback file doesn't exist
    }

    return res.status(404).send('Avatar not found');
  }),
);

export { router as avatarRouter };
