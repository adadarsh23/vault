import express from 'express';
import { getTokenFingerprint, verifyAccessToken } from '../utils/auth.ts';
import { mediaService } from '../services/mediaService.ts';
import { storageService } from '../services/storageService.ts';
import { getVaultItemModel } from '../models/vaultItem.ts';
import { getTelemetryModel } from '../models/telemetry.ts';
import { AppError } from '../utils/appError.ts';
import { sendSuccess } from '../responses.ts';
import { logger } from '../utils/logger.ts';
import { getClientIp } from '../utils/requestIp.ts';
import fs from 'fs';
import path from 'path';
import { rateLimit } from 'express-rate-limit';
import {
  decryptBuffer,
  decryptBufferEnvelope,
  EncryptedEnvelopePayload,
  EncryptedPayload,
} from '../utils/crypto.ts';
import mongoose from 'mongoose';
import { anomalyDetectionService } from '../services/anomalyDetectionService.ts';
import { User } from '../models/user.ts';
import { isAllowedCorsOrigin } from '../utils/cors.ts';
import { getTusSessionBuffer } from './tusController.ts';
import { ensureMongoReady } from '../mongo.ts';
import { multiClusterPool } from '../services/multiClusterPool.ts';

const STORAGE_ROOT = path.join(process.cwd(), 'vault-storage');

const toPositiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(raw || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Monitoring rate limit for key server - Optimized for ABR
export const keyRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute sliding window
  max: 150, // Higher burst allowance for ABR key requests
  standardHeaders: true,
  legacyHeaders: false,
  message: 'ABR Key burst detected. Throttling for 1 minute.',
});

// Simple In-Memory Cache for Streaming Keys - Aligned with 2m Token TTL
const keyCache = new Map<string, { key: Buffer; expires: number }>();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const MAX_KEY_CACHE_ENTRIES = Math.max(
  100,
  toPositiveInt(process.env.MEDIA_KEY_CACHE_MAX_ENTRIES, 2000),
);
const CACHE_SWEEP_INTERVAL_MS = Math.max(
  30_000,
  toPositiveInt(process.env.MEDIA_CACHE_SWEEP_INTERVAL_MS, 60_000),
);

const getSingleQueryValue = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;

const getSingleRouteParam = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;

export const findVaultItemFlexible = async (
  DynamicVaultModel: mongoose.Model<any>,
  userId: string,
  itemId: string,
  username?: string,
) => {
  if (!itemId || !userId) return null;

  const isObjectId = mongoose.Types.ObjectId.isValid(itemId);
  const queryConditions: any[] = [
    { itemId },
    { gridFsId: itemId },
    { 'file.filePath': itemId },
    { 'file.filePath': `cloud://${itemId}` },
    { 'file.filePath': `gridfs://${itemId}` },
  ];
  if (isObjectId) {
    queryConditions.push({ _id: new mongoose.Types.ObjectId(itemId) });
  }

  const executeFindOne = async (
    model: mongoose.Model<any>,
    conditions: Record<string, unknown>,
  ) => {
    const query = model.findOne(conditions);
    return typeof query?.exec === 'function' ? query.exec() : query;
  };

  // 1. Strictly enforce userId scoping on primary connection
  let item = await executeFindOne(DynamicVaultModel, {
    userId,
    $or: queryConditions,
  });

  if (item) {
    return item;
  }

  // 2. Search across other cluster nodes in the multi-cluster pool if not found on primary
  try {
    const nodes = multiClusterPool.getHealthyNodes();
    for (const node of nodes) {
      if (node.connection === DynamicVaultModel.db) continue;
      const targetUsername = username || DynamicVaultModel.modelName?.split('.')[0] || 'default';
      const RemoteModel = getVaultItemModel(targetUsername, node.connection);
      const remoteItem = await executeFindOne(RemoteModel, {
        userId,
        $or: queryConditions,
      });
      if (remoteItem) {
        (remoteItem as any)._clusterNode = node;
        (remoteItem as any)._customConnection = node.connection;
        return remoteItem;
      }
    }
  } catch {
    // ignore
  }

  return null;
};

const mimeMap: Record<string, string> = {
  // Photos
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jpe': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.pjpeg': 'image/jpeg',
  '.pjp': 'image/jpeg',
  '.png': 'image/png',
  '.apng': 'image/apng',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.bmp': 'image/bmp',
  '.dib': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.ico': 'image/x-icon',
  '.cur': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.svgz': 'image/svg+xml',
  '.psd': 'image/vnd.adobe.photoshop',
  '.raw': 'image/x-dcraw',
  '.cr2': 'image/x-canon-cr2',
  '.cr3': 'image/x-canon-cr3',
  '.nef': 'image/x-nikon-nef',
  '.nrw': 'image/x-nikon-nrw',
  '.arw': 'image/x-sony-arw',
  '.sr2': 'image/x-sony-sr2',
  '.srf': 'image/x-sony-srf',
  '.raf': 'image/x-fuji-raf',
  '.orf': 'image/x-olympus-orf',
  '.rw2': 'image/x-panasonic-rw2',
  '.pef': 'image/x-pentax-pef',
  '.dng': 'image/x-adobe-dng',
  '.x3f': 'image/x-sigma-x3f',
  '.3fr': 'image/x-hasselblad-3fr',
  '.fff': 'image/x-hasselblad-fff',
  '.iiq': 'image/x-phaseone-iiq',
  '.erf': 'image/x-epson-erf',
  '.kdc': 'image/x-kodak-kdc',
  '.mef': 'image/x-mamiya-mef',
  '.mos': 'image/x-leaf-mos',
  '.mrw': 'image/x-minolta-mrw',
  '.rwl': 'image/x-leica-rwl',
  '.dcr': 'image/x-kodak-dcr',
  '.bay': 'image/x-casio-bay',
  '.gpr': 'image/x-gopro-gpr',
  '.jp2': 'image/jp2',
  '.j2k': 'image/jp2',
  '.jpf': 'image/jp2',
  '.jpm': 'image/jp2',
  '.jxr': 'image/jxr',
  '.hdp': 'image/jxr',
  '.wdp': 'image/jxr',
  '.dds': 'image/vnd-ms.dds',
  '.exr': 'image/x-exr',
  '.hdr': 'image/vnd.radiance',
  '.pic': 'image/x-pict',
  '.pct': 'image/x-pict',
  '.pcx': 'image/x-pcx',
  '.tga': 'image/x-tga',
  '.icns': 'image/x-icns',
  // Videos (Full Suite of 64 Formats)
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.qt': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mka': 'video/x-matroska',
  '.mks': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.divx': 'video/x-msvideo',
  '.xvid': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.asf': 'video/x-ms-asf',
  '.asx': 'video/x-ms-asf',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.mpe': 'video/mpeg',
  '.mpv': 'video/mpeg',
  '.m2v': 'video/mpeg',
  '.m2p': 'video/mpeg',
  '.mts': 'video/mp2t',
  '.m2ts': 'video/mp2t',
  '.ts': 'video/mp2t',
  '.vob': 'video/dvd',
  '.evo': 'video/mp2t',
  '.mod': 'video/mp2t',
  '.tod': 'video/mp2t',
  '.3gp': 'video/3gpp',
  '.3g2': 'video/3gpp2',
  '.f4v': 'video/x-f4v',
  '.f4p': 'video/mp4',
  '.f4a': 'video/mp4',
  '.f4b': 'video/mp4',
  '.flv': 'video/x-flv',
  '.swf': 'application/x-shockwave-flash',
  '.ogv': 'video/ogg',
  '.ogm': 'video/ogg',
  '.rm': 'application/vnd.rn-realmedia',
  '.rmvb': 'application/vnd.rn-realmedia-vbr',
  '.rv': 'video/vnd.rn-realvideo',
  '.dat': 'video/mpeg',
  '.mxf': 'application/mxf',
  '.gxf': 'application/gxf',
  '.lxf': 'video/mp2t',
  '.nut': 'video/x-nut',
  '.dv': 'video/x-dv',
  '.dif': 'video/x-dv',
  '.y4m': 'video/x-yuv4mpeg',
  '.h264': 'video/h264',
  '.264': 'video/h264',
  '.h265': 'video/h265',
  '.265': 'video/h265',
  '.hevc': 'video/h265',
  '.av1': 'video/av1',
  '.vp8': 'video/x-vnd.on2.vp8',
  '.vp9': 'video/x-vnd.on2.vp9',
  '.r3d': 'video/x-r3d',
  '.braw': 'video/x-braw',
  '.cine': 'application/octet-stream',
  '.ari': 'application/octet-stream',
  '.arx': 'application/octet-stream',
  '.mjp2': 'video/mj2',
  '.mj2': 'video/mj2',
  // Audios
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

/**
 * GridFS stores client-encrypted media inside a server-side envelope. Remove
 * only that server envelope here; the browser still performs the final
 * client-side AES/RSA decryption before playback.
 */
const decryptGridFsPayload = (
  rawBuffer: Buffer,
  fileMetadata: Record<string, any> | undefined,
  itemFile?: Record<string, any>,
): Buffer => {
  const envelope = fileMetadata?.encryption;
  if (
    envelope &&
    typeof envelope.wrappedDek === 'string' &&
    typeof envelope.wrapIv === 'string' &&
    typeof envelope.wrapTag === 'string'
  ) {
    return decryptBufferEnvelope({
      algorithm: envelope.algorithm || 'aes-256-gcm',
      iv: envelope.iv,
      authTag: envelope.authTag,
      wrappedDek: envelope.wrappedDek,
      wrapIv: envelope.wrapIv,
      wrapTag: envelope.wrapTag,
      keyVersion: envelope.keyVersion || 'v1',
      keyId: envelope.keyId || 'vault-file-v1',
      cipherText: rawBuffer.toString('base64'),
    } as EncryptedEnvelopePayload);
  }

  try {
    return decryptBuffer(JSON.parse(rawBuffer.toString()) as EncryptedPayload);
  } catch {
    if (itemFile?.encryptionIv && itemFile?.encryptionTag) {
      return decryptBuffer({
        iv: itemFile.encryptionIv,
        tag: itemFile.encryptionTag,
        encryptedData: rawBuffer.toString('hex'),
      });
    }
    return rawBuffer;
  }
};

const SIGNED_URL_WINDOW_MS = 60_000;
const SIGNED_URL_MAX_PER_WINDOW = Math.max(
  10,
  toPositiveInt(process.env.SIGNED_URL_MAX_PER_MINUTE, 600),
);
const signedUrlCounters = new Map<string, { count: number; resetAt: number }>();
const MAX_SIGNED_URL_COUNTER_ENTRIES = Math.max(
  SIGNED_URL_MAX_PER_WINDOW,
  toPositiveInt(process.env.SIGNED_URL_COUNTER_MAX_ENTRIES, 5000),
);
const MAX_MEDIA_RANGE_BYTES = Math.max(
  256 * 1024,
  toPositiveInt(process.env.MEDIA_MAX_RANGE_BYTES, 4 * 1024 * 1024),
);

const trimMapToMaxEntries = <T>(map: Map<string, T>, maxEntries: number): void => {
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (!oldestKey) {
      break;
    }
    map.delete(oldestKey);
  }
};

const purgeExpiredKeyCacheEntries = (now = Date.now()): void => {
  for (const [cacheKey, entry] of keyCache.entries()) {
    if (entry.expires <= now) {
      keyCache.delete(cacheKey);
    }
  }
};

const purgeExpiredSignedUrlCounters = (now = Date.now()): void => {
  for (const [counterKey, counter] of signedUrlCounters.entries()) {
    if (counter.resetAt <= now) {
      signedUrlCounters.delete(counterKey);
    }
  }
};

const parseSingleByteRange = (
  requestedRange: string,
  fileSize: number,
): { start: number; end: number } | null => {
  if (!requestedRange.startsWith('bytes=')) return null;
  const [rawStart, rawEnd] = requestedRange.slice('bytes='.length).split('-');

  let start: number;
  let end: number;

  if (!rawStart && rawEnd) {
    const suffixLength = Number.parseInt(rawEnd, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    const normalizedLength = Math.min(suffixLength, MAX_MEDIA_RANGE_BYTES, fileSize);
    start = Math.max(0, fileSize - normalizedLength);
    end = fileSize - 1;
  } else {
    start = Number.parseInt(rawStart, 10);
    if (!Number.isFinite(start) || start < 0 || start >= fileSize) return null;
    if (!rawEnd) {
      end = Math.min(start + MAX_MEDIA_RANGE_BYTES - 1, fileSize - 1);
    } else {
      const parsedEnd = Number.parseInt(rawEnd, 10);
      if (!Number.isFinite(parsedEnd) || parsedEnd < start) return null;
      end = Math.min(parsedEnd, fileSize - 1);
    }
  }

  if (end - start + 1 > MAX_MEDIA_RANGE_BYTES) {
    end = Math.min(start + MAX_MEDIA_RANGE_BYTES - 1, fileSize - 1);
  }
  if (end < start) return null;
  return { start, end };
};

const upsertKeyCache = (cacheKey: string, key: Buffer): void => {
  const now = Date.now();
  purgeExpiredKeyCacheEntries(now);
  keyCache.set(cacheKey, { key, expires: now + CACHE_TTL });
  trimMapToMaxEntries(keyCache, MAX_KEY_CACHE_ENTRIES);
};

const enforceSignedUrlRateLimit = (userId: string) => {
  const now = Date.now();
  purgeExpiredSignedUrlCounters(now);
  trimMapToMaxEntries(signedUrlCounters, MAX_SIGNED_URL_COUNTER_ENTRIES);

  const current = signedUrlCounters.get(userId);
  if (!current || current.resetAt <= now) {
    signedUrlCounters.set(userId, { count: 1, resetAt: now + SIGNED_URL_WINDOW_MS });
    return;
  }
  if (current.count >= SIGNED_URL_MAX_PER_WINDOW) {
    throw AppError.forbidden(
      'Signed URL rate limit exceeded. Please retry shortly.',
      'SIGNED_URL_RATE_LIMIT',
    );
  }
  current.count += 1;
  signedUrlCounters.set(userId, current);
};

const cacheSweepTimer = setInterval(() => {
  const now = Date.now();
  purgeExpiredKeyCacheEntries(now);
  purgeExpiredSignedUrlCounters(now);
}, CACHE_SWEEP_INTERVAL_MS);
cacheSweepTimer.unref();

const isLikelyBrowserNavigation = (req: express.Request) => {
  const secFetchDest = String(req.get('sec-fetch-dest') || '').toLowerCase();
  const secFetchMode = String(req.get('sec-fetch-mode') || '').toLowerCase();
  return secFetchDest === 'document' || secFetchDest === 'iframe' || secFetchMode === 'navigate';
};

const enforcePlaybackRequestContext = (req: express.Request) => {
  const hasToken = Boolean(
    req.query.token ||
    req.query.sig ||
    req.query.signature ||
    req.query.auth_token ||
    req.headers.authorization ||
    req.get('authorization'),
  );
  if (!hasToken && isLikelyBrowserNavigation(req)) {
    throw AppError.forbidden(
      'Direct navigation to media URLs is not allowed.',
      'DIRECT_MEDIA_NAV_BLOCKED',
    );
  }
};

const normalizeOrigin = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const setMediaCorsHeaders = (req: express.Request, res: express.Response) => {
  const originHeader = req.get('origin');
  const refererHeader = req.get('referer');

  let candidate: string | null = null;
  if (originHeader) {
    candidate = normalizeOrigin(originHeader);
  } else if (refererHeader) {
    candidate = normalizeOrigin(refererHeader);
  }

  if (candidate && isAllowedCorsOrigin(candidate)) {
    res.setHeader('Access-Control-Allow-Origin', candidate);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Range, X-CSRF-Token, X-Device-Hash',
    );
  } else if (originHeader || refererHeader) {
    const rawOrigin = originHeader || refererHeader;
    try {
      const fallbackOrigin = new URL(rawOrigin!).origin;
      if (isAllowedCorsOrigin(fallbackOrigin)) {
        res.setHeader('Access-Control-Allow-Origin', fallbackOrigin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    } catch {}
  } else {
  }
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
};

const enforceTrustedMediaOrigin = (req: express.Request) => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  const origin = normalizeOrigin(req.get('origin'));
  const refererOrigin = normalizeOrigin(req.get('referer'));
  const candidate = origin || refererOrigin;
  if (candidate && !isAllowedCorsOrigin(candidate)) {
    throw AppError.forbidden('Media origin is not allowed.', 'MEDIA_ORIGIN_FORBIDDEN');
  }
};

const ensureUploadIsActive = (item: any) => {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  const scanStatus = item?.metadata?.uploadSecurity?.scanStatus;
  if (
    scanStatus === 'pending' ||
    scanStatus === 'scanning' ||
    scanStatus === 'error' ||
    scanStatus === 'quarantined' ||
    scanStatus === 'infected' ||
    scanStatus === 'blocked'
  ) {
    throw AppError.forbidden(
      'File is quarantined or pending security scan.',
      'FILE_QUARANTINED_OR_PENDING_SCAN',
    );
  }
};

/**
 * Universal Resilient Media Access Validation
 * Resolves user identity ONLY from verified JWT/session or validated cryptographic signed URL token.
 * Never trusts unverified query user IDs.
 */
const validateMediaAccess = async (
  req: express.Request,
  passedUserId: string | undefined,
  itemId: string,
  action: string = 'stream',
) => {
  const q = req.query as any;
  const clientIp = getClientIp(req);

  // 1. Resolve Identity strictly from Authenticated Session or Verified JWT
  let resolvedUserId: string | undefined = (req as any).user?.userId;

  const authHeader = req.get('Authorization')?.split(' ')[1];
  const authToken = getSingleQueryValue(q.auth_token) || authHeader;

  if (authToken && typeof authToken === 'string' && authToken.includes('.')) {
    try {
      const payload = verifyAccessToken(authToken);
      if (payload && payload.sub) {
        resolvedUserId = payload.sub;
        (req as any).user = {
          userId: payload.sub,
          username: payload.username,
          sessionId: payload.sessionId,
        };
      }
    } catch (e) {
      if (authToken.split('.').length === 3) {
        logger.warn('Token identification failed in media access helper:', {
          error: (e as Error).message,
          tokenFingerprint: getTokenFingerprint(authToken),
        });
      }
    }
  }

  // 2. Validate Signed Capability / URL Token if provided or if user is not authenticated via session/JWT
  const signature = getSingleQueryValue(q.token);
  const expiresRaw = getSingleQueryValue(q.expires);

  if (signature && expiresRaw) {
    const expires = Number.parseInt(expiresRaw, 10);
    if (!Number.isSafeInteger(expires) || String(expires) !== expiresRaw) {
      throw AppError.forbidden('Signed media token is invalid.', 'INVALID_SIGNATURE');
    }

    // For signed URL access where no session/JWT was provided, use the token claims target ID
    const candidateUserId =
      resolvedUserId || passedUserId || getSingleQueryValue(q.uid) || getSingleQueryValue(q.userId);
    if (!candidateUserId) {
      logger.warn('Media access denied: Identification missing', {
        itemId,
      });
      throw AppError.unauthorized(
        'User identification required for secure media playback.',
        'AUTH_REQUIRED',
      );
    }

    // If both a verified session and a signed claim target exist, ensure they match
    if (resolvedUserId && candidateUserId !== resolvedUserId) {
      throw AppError.forbidden(
        'Signed media token does not match authenticated user.',
        'USER_MISMATCH',
      );
    }

    const signedSessionId = getSingleQueryValue(q.sid) || 'any';
    const authenticatedSessionId = (req as any).user?.sessionId;
    if (
      authenticatedSessionId &&
      signedSessionId !== 'any' &&
      signedSessionId !== authenticatedSessionId
    ) {
      throw AppError.forbidden(
        'Signed media token is not valid for this session.',
        'SESSION_MISMATCH',
      );
    }

    // Cryptographically verify the signed capability token against the candidate userId
    const isValidSignature = storageService.verifySignedUrl(candidateUserId, itemId, {
      token: signature,
      expires,
      action,
      clientIp,
      sessionId: signedSessionId,
      deviceHash: getSingleQueryValue(q.dev),
      originalIp: getSingleQueryValue(q.ip),
    });

    if (!isValidSignature) {
      throw AppError.forbidden('Signed media token is invalid or expired.', 'INVALID_SIGNATURE');
    }

    // Now and only now is candidateUserId established as verified
    resolvedUserId = candidateUserId;
  } else if (action === 'stream' || !resolvedUserId) {
    throw AppError.forbidden('Media access token or expiration missing.', 'MISSING_SIGNATURE');
  }

  if (!resolvedUserId) {
    logger.warn('Media access denied: Identification missing', {
      itemId,
    });
    throw AppError.unauthorized(
      'User identification required for secure media playback.',
      'AUTH_REQUIRED',
    );
  }

  // Ensure username is attached to req.user for downstream getVaultItemModel(username)
  if (!(req as any).user?.username) {
    try {
      const userDoc = await User.findById(resolvedUserId, { username: 1 }).exec();
      if (userDoc?.username) {
        (req as any).user = {
          ...(req as any).user,
          userId: resolvedUserId,
          username: userDoc.username,
        };
      }
    } catch (err) {
      logger.warn('Failed to resolve username for media access', { userId: resolvedUserId, err });
    }
  }

  // Security Intelligence tracking
  anomalyDetectionService.trackMediaRequest(resolvedUserId, itemId, clientIp);
  anomalyDetectionService.trackIpDrift(resolvedUserId, clientIp);

  return resolvedUserId;
};

export const getMediaPlaylist = async (req: express.Request, res: express.Response) => {
  setMediaCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  const itemId = getSingleRouteParam(req.params.itemId);
  const variant = getSingleRouteParam(req.params.variant);
  if (!itemId) throw AppError.badRequest('itemId is required.', 'ITEM_REQUIRED');
  enforcePlaybackRequestContext(req);
  enforceTrustedMediaOrigin(req);

  // Early CORS/CORP header setting
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  // Resolve and validate identity/access
  const resolvedUserId = await validateMediaAccess(req, undefined, itemId, 'stream');

  const username = (req as any).user?.username;
  if (!username) throw AppError.unauthorized('Username required for isolated vault access');

  const DynamicVaultModel = getVaultItemModel(username);
  let item = await findVaultItemFlexible(DynamicVaultModel, resolvedUserId, itemId, username);

  if (!item || !item.file || !item.file.filePath) throw AppError.notFound('Media item not found');
  ensureUploadIsActive(item);

  // Robust path resolution (Absolute -> Relative fallback)
  let filePath = item.file.filePath;
  if (!fs.existsSync(filePath)) {
    // Try to resolve relative to storage root if absolute path failed (e.g. environment change)
    const fileName = path.basename(filePath);
    const category = item.category || 'other-files';
    const relativePath = path.join(STORAGE_ROOT, resolvedUserId.toString(), category, fileName);

    if (fs.existsSync(relativePath)) {
      filePath = relativePath;
    } else {
      // Try with legacy plural categories if singular failed
      const legacyCategory =
        category === 'photo' ? 'photos' : category === 'video' ? 'videos' : category;
      const legacyPath = path.join(
        STORAGE_ROOT,
        resolvedUserId.toString(),
        legacyCategory,
        fileName,
      );
      if (fs.existsSync(legacyPath)) {
        filePath = legacyPath;
      }
    }
  }

  logger.info('Media playlist request authorized', { userId: resolvedUserId, itemId, variant });

  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  if (!variant) {
    // MongoDB/GridFS cloud items do not have local HLS variant files.
    // Return 404 so the client correctly falls back to direct cloud playback.
    if (typeof item.file.filePath === 'string' && item.file.filePath.startsWith('cloud://')) {
      throw AppError.notFound('HLS is not generated for this cloud media item.', 'HLS_UNAVAILABLE');
    }
    const playlist = await mediaService.generateMasterPlaylist(
      itemId,
      req.originalUrl.split('?')[1],
    );
    res.setHeader('Content-Type', 'application/x-mpegURL');
    return res.send(playlist);
  } else {
    const hlsDir = path.join(path.dirname(item.file.filePath), 'hls', itemId);
    const variantId = variant?.replace('.m3u8', '') || '';
    const playlistPath = path.join(hlsDir, `${variantId}.m3u8`);

    if (!fs.existsSync(playlistPath)) {
      logger.error('Playlist variant not found on disk', { playlistPath, itemId, variant });
      throw AppError.notFound('Playlist variant not found');
    }

    let content = fs.readFileSync(playlistPath, 'utf8');
    const query = req.originalUrl.split('?')[1] || '';

    // Rewrite segment URLs to use our central segment delivery route
    const baseUrl = process.env.PUBLIC_URL || '';
    const segmentPrefix = `${baseUrl}/api/vault/media/segment/${itemId}/`;

    // Replace relative segment names with absolute route URLs
    content = content.replace(/^([^#].+\.ts)$/gm, (match) => {
      const separator = query ? '?' : '';
      return `${segmentPrefix}${match}${separator}${query}`;
    });

    // Handle encryption key URL as well
    content = content.replace(/URI="([^"]*)"/g, (_match, p1) => {
      const separator = p1.includes('?') ? '&' : query ? '?' : '';
      return `URI="${p1}${separator}${query}"`;
    });

    res.setHeader('Content-Type', 'application/x-mpegURL');
    return res.send(content);
  }
};

export const getMediaKey = async (req: express.Request, res: express.Response) => {
  setMediaCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  const itemId = getSingleRouteParam(req.params.itemId);
  if (!itemId) throw AppError.badRequest('itemId is required.', 'ITEM_REQUIRED');

  const resolvedUserId = await validateMediaAccess(req, undefined, itemId, 'stream');

  const sessionId = (req as any).user?.sessionId || getSingleQueryValue(req.query.sid) || 'any';
  const cacheKey = `${resolvedUserId}:${itemId}:${sessionId}`;

  const cached = keyCache.get(cacheKey);
  if (cached) {
    if (Date.now() < cached.expires) {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.send(cached.key);
    }
    keyCache.delete(cacheKey);
  }

  const key = await mediaService.getStreamingKey(resolvedUserId, itemId);
  upsertKeyCache(cacheKey, key);

  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', 'application/octet-stream');
  return res.send(key);
};

export const getMediaSegment = async (req: express.Request, res: express.Response) => {
  setMediaCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  const itemId = getSingleRouteParam(req.params.itemId);
  const segment = getSingleRouteParam(req.params.segment);
  if (!itemId || !segment)
    throw AppError.badRequest('itemId and segment are required.', 'ITEM_REQUIRED');
  if (!/^[a-zA-Z0-9._-]+\.ts$/i.test(segment)) {
    throw AppError.badRequest('Invalid media segment identifier.', 'INVALID_MEDIA_SEGMENT');
  }
  enforcePlaybackRequestContext(req);
  enforceTrustedMediaOrigin(req);

  const resolvedUserId = await validateMediaAccess(req, undefined, itemId, 'stream');

  const username = (req as any).user?.username;
  if (!username) throw AppError.unauthorized('Username required for isolated vault access');

  const DynamicVaultModel = getVaultItemModel(username);
  let item = await findVaultItemFlexible(DynamicVaultModel, resolvedUserId, itemId, username);

  if (!item || !item.file || !item.file.filePath) throw AppError.notFound('Media item not found');
  ensureUploadIsActive(item);

  // Robust path resolution
  let filePath = item.file.filePath;
  if (!fs.existsSync(filePath)) {
    const fileName = path.basename(filePath);
    const category = item.category || 'other-files';
    const relativePath = path.join(STORAGE_ROOT, resolvedUserId.toString(), category, fileName);
    if (fs.existsSync(relativePath)) filePath = relativePath;
    else {
      const legacyCategory =
        category === 'photo' ? 'photos' : category === 'video' ? 'videos' : category;
      const legacyPath = path.join(
        STORAGE_ROOT,
        resolvedUserId.toString(),
        legacyCategory,
        fileName,
      );
      if (fs.existsSync(legacyPath)) filePath = legacyPath;
    }
  }

  const hlsDir = path.join(path.dirname(filePath), 'hls', itemId);
  const segmentPath = path.join(hlsDir, segment);

  if (!fs.existsSync(segmentPath)) {
    throw AppError.notFound('Segment not found');
  }

  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'video/MP2T');

  const stream = fs.createReadStream(segmentPath);
  stream.on('error', (err) => {
    logger.warn('Media segment stream error', { segmentPath, err });
    if (!res.headersSent) {
      res.status(500).end();
    }
  });
  return stream.pipe(res);
};

export const accessVaultFile = async (req: express.Request, res: express.Response) => {
  setMediaCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  const itemId = getSingleRouteParam(req.params.itemId);
  if (!itemId) throw AppError.badRequest('itemId is required.', 'ITEM_REQUIRED');
  enforcePlaybackRequestContext(req);
  enforceTrustedMediaOrigin(req);

  if (!(await ensureMongoReady())) {
    throw new AppError(
      503,
      'DB_UNAVAILABLE',
      'Cloud media storage is temporarily unavailable. Please retry playback.',
    );
  }

  const requestedAction = getSingleQueryValue(req.query.action) || 'view';
  const resolvedUserId = await validateMediaAccess(req, undefined, itemId, requestedAction);

  const username = (req as any).user?.username;
  if (!username) throw AppError.unauthorized('Username required for isolated vault access');

  const DynamicVaultModel = getVaultItemModel(username);
  let item = await findVaultItemFlexible(DynamicVaultModel, resolvedUserId, itemId, username);

  const isObjectId = mongoose.Types.ObjectId.isValid(itemId);

  if (!item && isObjectId && mongoose.connection && mongoose.connection.db) {
    try {
      const targetDb = (item as any)?._customConnection?.db || mongoose.connection.db;
      const bucket = new mongoose.mongo.GridFSBucket(targetDb, {
        bucketName: 'vault_item_files',
      });
      const objectId = new mongoose.Types.ObjectId(itemId);
      const files = await bucket
        .find({ _id: objectId, 'metadata.userId': resolvedUserId })
        .toArray();
      if (files && files.length > 0) {
        const gridFile = files[0];
        const fileMetadata = gridFile.metadata || {};
        const metadataItemId =
          typeof fileMetadata.itemId === 'string' ? fileMetadata.itemId : undefined;
        if (!metadataItemId) {
          throw AppError.notFound('File not found');
        }

        const ownershipQuery = DynamicVaultModel.findOne({
          userId: resolvedUserId,
          $or: [{ itemId: metadataItemId }, { gridFsId: itemId }],
        });
        const owningItem =
          typeof ownershipQuery?.exec === 'function' ? await ownershipQuery.exec() : ownershipQuery;
        if (!owningItem) {
          throw AppError.notFound('File not found');
        }

        const fileName = fileMetadata.fileName || fileMetadata.originalName || 'file';
        const ext = path.extname(fileName).toLowerCase();
        const mimeType = fileMetadata.mimeType || mimeMap[ext] || 'application/octet-stream';
        const isStreamableMedia = mimeType.startsWith('video/') || mimeType.startsWith('audio/');
        const requestedRange = req.headers.range;

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

        const chunks: Buffer[] = [];
        const downloadStream = bucket.openDownloadStream(objectId);
        const gridBuffer: Buffer = await new Promise((resolve, reject) => {
          downloadStream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          downloadStream.on('error', reject);
          downloadStream.on('end', () => resolve(Buffer.concat(chunks)));
        });

        const decrypted = decryptGridFsPayload(gridBuffer, fileMetadata);

        const size = decrypted.length;
        if (isStreamableMedia && requestedRange) {
          const parsedRange = parseSingleByteRange(requestedRange, size);
          if (!parsedRange) {
            res.setHeader('Content-Range', `bytes */${size}`);
            return res.status(416).end();
          }
          const chunk = decrypted.subarray(parsedRange.start, parsedRange.end + 1);
          res.status(206);
          res.setHeader('Content-Range', `bytes ${parsedRange.start}-${parsedRange.end}/${size}`);
          res.setHeader('Content-Length', String(chunk.length));
          return res.send(chunk);
        }

        res.status(200);
        res.setHeader('Content-Length', size.toString());
        return res.send(decrypted);
      }
    } catch (directGridErr) {
      logger.warn('Direct GridFS fallback lookup error', { itemId, directGridErr });
    }
  }

  if (!item) {
    logger.warn('Media file access failed: Item missing', {
      itemId,
      userId: resolvedUserId,
      username,
    });
    throw AppError.notFound('File not found');
  }
  ensureUploadIsActive(item);

  const fileName = item.file?.fileName || item.title || 'file';
  const ext = path.extname(fileName).toLowerCase();
  const mimeType =
    item.file?.mimeType ||
    (item.metadata as any)?.mimeType ||
    mimeMap[ext] ||
    'application/octet-stream';
  const isStreamableMedia = mimeType.startsWith('video/') || mimeType.startsWith('audio/');
  const requestedRange = req.headers.range;

  if (requestedAction === 'download') {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
  }

  // 1. Try reading from MongoDB Atlas GridFS Cloud Storage
  const gridFsId =
    item.gridFsId ||
    (item.file?.filePath?.startsWith('cloud://')
      ? item.file.filePath.replace('cloud://', '')
      : item.file?.filePath?.startsWith('gridfs://')
        ? item.file.filePath.replace('gridfs://', '')
        : null);

  const targetDb = (item as any)?._customConnection?.db || mongoose.connection.db;
  if (gridFsId && targetDb) {
    try {
      const bucket = new mongoose.mongo.GridFSBucket(targetDb, {
        bucketName: 'vault_item_files',
      });
      const objectId = new mongoose.Types.ObjectId(gridFsId);
      const files = await bucket.find({ _id: objectId }).toArray();

      if (files && files.length > 0) {
        const gridFile = files[0];
        const fileSize = gridFile.length;
        const fileMetadata = gridFile.metadata || {};
        const isServerEncrypted = Boolean(item?.file?.encryptionIv || fileMetadata?.encryption);

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', mimeType);

        if (!isServerEncrypted && isStreamableMedia) {
          if (requestedRange) {
            const parsedRange = parseSingleByteRange(requestedRange, fileSize);
            if (!parsedRange) {
              res.setHeader('Content-Range', `bytes */${fileSize}`);
              return res.status(416).end();
            }
            const chunkSize = parsedRange.end - parsedRange.start + 1;
            res.status(206);
            res.setHeader(
              'Content-Range',
              `bytes ${parsedRange.start}-${parsedRange.end}/${fileSize}`,
            );
            res.setHeader('Content-Length', chunkSize.toString());
            const downloadStream = bucket.openDownloadStream(objectId, {
              start: parsedRange.start,
              end: parsedRange.end + 1,
            });
            downloadStream.on('error', (err) => {
              logger.warn('GridFS range stream error', { objectId, err });
              if (!res.headersSent) res.status(500).end();
            });
            return downloadStream.pipe(res);
          }

          res.status(200);
          res.setHeader('Content-Length', fileSize.toString());
          const downloadStream = bucket.openDownloadStream(objectId);
          downloadStream.on('error', (err) => {
            logger.warn('GridFS full stream error', { objectId, err });
            if (!res.headersSent) res.status(500).end();
          });
          return downloadStream.pipe(res);
        } else {
          const chunks: Buffer[] = [];
          const downloadStream = bucket.openDownloadStream(objectId);
          const gridBuffer: Buffer = await new Promise((resolve, reject) => {
            downloadStream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            downloadStream.on('error', reject);
            downloadStream.on('end', () => resolve(Buffer.concat(chunks)));
          });

          let decrypted: Buffer;
          try {
            decrypted = decryptGridFsPayload(gridBuffer, fileMetadata, item.file);
          } catch (decryptionError) {
            logger.error('Failed to decrypt GridFS media envelope', {
              itemId: item._id,
              error: decryptionError,
            });
            throw new AppError(500, 'DECRYPTION_FAILED', 'Failed to decrypt media payload.');
          }

          const size = decrypted.length;
          if (isStreamableMedia && requestedRange) {
            const parsedRange = parseSingleByteRange(requestedRange, size);
            if (!parsedRange) {
              res.setHeader('Content-Range', `bytes */${size}`);
              return res.status(416).end();
            }
            const chunk = decrypted.subarray(parsedRange.start, parsedRange.end + 1);
            res.status(206);
            res.setHeader('Content-Range', `bytes ${parsedRange.start}-${parsedRange.end}/${size}`);
            res.setHeader('Content-Length', String(chunk.length));
            return res.send(chunk);
          }

          res.status(200);
          res.setHeader('Content-Length', size.toString());
          return res.send(decrypted);
        }
      }
    } catch (gridFsError) {
      logger.warn('GridFS read attempt error, attempting payload/disk fallback', {
        itemId,
        gridFsError: gridFsError instanceof Error ? gridFsError.message : String(gridFsError),
      });
    }
  }

  // 2. Try reading from MongoDB Atlas Document Payload (Base64 / Binary)
  if (item.payload || item.modernPayload) {
    let rawBuffer: Buffer | null = null;
    const rawPayload = item.payload || item.modernPayload || '';
    if (Buffer.isBuffer(rawPayload)) {
      rawBuffer = rawPayload;
    } else if (typeof rawPayload === 'string' && rawPayload.length > 0) {
      if (item.encoding === 'base64' || item.encoding === 'binary-base64') {
        try {
          rawBuffer = Buffer.from(rawPayload, 'base64');
        } catch {
          rawBuffer = Buffer.from(rawPayload);
        }
      } else if (item.encoding === 'utf-8' || (item.encoding as string) === 'modern') {
        rawBuffer = Buffer.from(rawPayload, 'utf8');
      } else {
        try {
          rawBuffer = Buffer.from(rawPayload, 'base64');
        } catch {
          rawBuffer = Buffer.from(rawPayload);
        }
      }
    }

    if (rawBuffer && rawBuffer.length > 0) {
      let decrypted: Buffer;
      try {
        const payloadObj: EncryptedPayload = JSON.parse(rawBuffer.toString());
        decrypted = decryptBuffer(payloadObj);
      } catch {
        if (item.file?.encryptionIv && item.file?.encryptionTag) {
          try {
            decrypted = decryptBuffer({
              iv: item.file.encryptionIv,
              tag: item.file.encryptionTag,
              encryptedData: rawBuffer.toString('hex'),
            });
          } catch {
            decrypted = rawBuffer;
          }
        } else {
          decrypted = rawBuffer;
        }
      }

      const size = decrypted.length;
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', mimeType);

      if (isStreamableMedia && requestedRange) {
        const parsedRange = parseSingleByteRange(requestedRange, size);
        if (!parsedRange) {
          res.setHeader('Content-Range', `bytes */${size}`);
          return res.status(416).end();
        }
        const chunk = decrypted.subarray(parsedRange.start, parsedRange.end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${parsedRange.start}-${parsedRange.end}/${size}`);
        res.setHeader('Content-Length', String(chunk.length));
        return res.send(chunk);
      }

      res.status(200);
      res.setHeader('Content-Length', size.toString());
      return res.send(decrypted);
    }
  }

  // 3. Fallback: Local Disk Storage (Legacy local files)
  let filePath = item.file?.filePath;
  if (filePath && !filePath.startsWith('cloud://')) {
    let resolvedFilePath = filePath;
    if (!fs.existsSync(resolvedFilePath)) {
      const fn = path.basename(filePath);
      const cat = item.category || 'other-files';
      const relPath = path.join(STORAGE_ROOT, resolvedUserId.toString(), cat, fn);
      if (fs.existsSync(relPath)) resolvedFilePath = relPath;
      else {
        const legacyCat = cat === 'photo' ? 'photos' : cat === 'video' ? 'videos' : cat;
        const legacyPath = path.join(STORAGE_ROOT, resolvedUserId.toString(), legacyCat, fn);
        if (fs.existsSync(legacyPath)) resolvedFilePath = legacyPath;
        else resolvedFilePath = '';
      }
    }

    if (resolvedFilePath && fs.existsSync(resolvedFilePath)) {
      const fileEncryptedAtRest =
        Boolean(item?.file?.encryptionIv) ||
        Boolean(item?.file?.encryptionTag) ||
        resolvedFilePath.toLowerCase().endsWith('.enc');

      if (isStreamableMedia && !fileEncryptedAtRest) {
        const stats = await fs.promises.stat(resolvedFilePath);
        const fileSize = stats.size;
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', mimeType);

        if (requestedRange) {
          const parsedRange = parseSingleByteRange(requestedRange, fileSize);
          if (!parsedRange) {
            res.setHeader('Content-Range', `bytes */${fileSize}`);
            return res.status(416).end();
          }
          const chunkSize = parsedRange.end - parsedRange.start + 1;
          res.status(206);
          res.setHeader(
            'Content-Range',
            `bytes ${parsedRange.start}-${parsedRange.end}/${fileSize}`,
          );
          res.setHeader('Content-Length', chunkSize.toString());
          const rangeStream = fs.createReadStream(resolvedFilePath, {
            start: parsedRange.start,
            end: parsedRange.end,
          });
          rangeStream.on('error', (err) => {
            logger.warn('Disk range stream error', { resolvedFilePath, err });
            if (!res.headersSent) res.status(500).end();
          });
          return rangeStream.pipe(res);
        }

        res.status(200);
        res.setHeader('Content-Length', fileSize.toString());
        const fullStream = fs.createReadStream(resolvedFilePath);
        fullStream.on('error', (err) => {
          logger.warn('Disk full stream error', { resolvedFilePath, err });
          if (!res.headersSent) res.status(500).end();
        });
        return fullStream.pipe(res);
      }

      const encryptedContent = await fs.promises.readFile(resolvedFilePath);
      let decrypted: Buffer;

      try {
        const payloadObj: EncryptedPayload = JSON.parse(encryptedContent.toString());
        decrypted = decryptBuffer(payloadObj);
      } catch {
        decrypted = encryptedContent;
      }

      if (isStreamableMedia && requestedRange) {
        const fileSize = decrypted.length;
        const parsedRange = parseSingleByteRange(requestedRange, fileSize);
        if (!parsedRange) {
          res.setHeader('Content-Range', `bytes */${fileSize}`);
          return res.status(416).end();
        }
        const chunk = decrypted.subarray(parsedRange.start, parsedRange.end + 1);

        res.status(206);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Range', `bytes ${parsedRange.start}-${parsedRange.end}/${fileSize}`);
        res.setHeader('Content-Length', String(chunk.length));
        return res.send(chunk);
      }

      res.setHeader('Content-Type', mimeType);
      if (isStreamableMedia) {
        res.setHeader('Accept-Ranges', 'bytes');
      }
      return res.send(decrypted);
    }
  }

  // 4. Fallback: TUS Upload Session Chunks
  const tusUploadId = (item.metadata as any)?.tusUploadId;
  if (tusUploadId) {
    const tusBuffer = await getTusSessionBuffer(tusUploadId, resolvedUserId);
    if (tusBuffer && tusBuffer.length > 0) {
      const size = tusBuffer.length;
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', mimeType);

      if (isStreamableMedia && requestedRange) {
        const parsedRange = parseSingleByteRange(requestedRange, size);
        if (!parsedRange) {
          res.setHeader('Content-Range', `bytes */${size}`);
          return res.status(416).end();
        }
        const chunk = tusBuffer.subarray(parsedRange.start, parsedRange.end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${parsedRange.start}-${parsedRange.end}/${size}`);
        res.setHeader('Content-Length', String(chunk.length));
        return res.send(chunk);
      }

      res.status(200);
      res.setHeader('Content-Length', size.toString());
      return res.send(tusBuffer);
    }
  }

  throw AppError.notFound('Media file content not found in MongoDB Atlas cloud or storage');
};

export const createSignedUrl = async (req: express.Request, res: express.Response) => {
  const itemId = getSingleRouteParam(req.params.itemId);
  const userId = (req as any).user?.userId;
  const actionRaw = getSingleQueryValue(req.query.action) || 'view';

  if (!userId) throw AppError.unauthorized('Authentication required');
  if (!itemId) throw AppError.badRequest('itemId is required.', 'ITEM_REQUIRED');
  if (!['view', 'download', 'stream'].includes(actionRaw)) {
    throw AppError.badRequest('Invalid signed URL action.', 'INVALID_SIGNED_URL_ACTION');
  }
  enforceSignedUrlRateLimit(userId);

  const fileName = getSingleQueryValue(req.query.fileName) || itemId;
  const username = (req as any).user?.username;
  if (!username) throw AppError.unauthorized('Username required for isolated vault access');
  const DynamicVaultModel = getVaultItemModel(username);
  const item = await findVaultItemFlexible(DynamicVaultModel, userId, itemId, username);
  if (!item) throw AppError.notFound('File not found');
  ensureUploadIsActive(item);
  const url = storageService.generateSignedUrl(userId, itemId, fileName, {
    action: actionRaw as 'view' | 'download' | 'stream',
    sessionId: (req as any).user?.sessionId,
    deviceHash: getSingleQueryValue(req.query.dev) || req.get('x-device-hash') || 'direct',
  });

  return sendSuccess(res, { url }, 'Signed URL generated successfully');
};

export const logPlaybackEvent = async (req: express.Request, res: express.Response) => {
  const { itemId, event, metadata } = req.body;
  const userId = (req as any).user?.userId;

  if (!userId) throw AppError.unauthorized('Authentication required');

  const username = (req as any).user?.username;
  if (!username) throw AppError.unauthorized('Username required for isolated telemetry');

  try {
    const DynamicTelemetryModel = getTelemetryModel(username);
    await DynamicTelemetryModel.create({
      userId,
      itemId,
      event,
      metadata,
      userAgent: req.get('user-agent'),
      ip: getClientIp(req),
    });
  } catch (error) {
    // Playback telemetry is non-critical. Atlas interruptions must never
    // terminate the request or interfere with the media element.
    logger.warn('Playback telemetry was not recorded', {
      itemId,
      event,
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(202).json({
      success: true,
      data: { accepted: false },
      message: 'Playback telemetry deferred',
    });
  }

  return sendSuccess(res, null, 'Telemetry recorded');
};

export const getPlaybackInsights = async (req: express.Request, res: express.Response) => {
  const userId = (req as any).user?.userId;
  if (!userId) throw AppError.unauthorized('Authentication required');

  const username = (req as any).user?.username;
  if (!username) throw AppError.unauthorized('Username required for isolated telemetry');

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw AppError.badRequest('Invalid user ID');
  }

  const DynamicTelemetryModel = getTelemetryModel(username);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const bufferStats = await DynamicTelemetryModel.aggregate([
    { $match: { userId: userObjectId, event: 'buffering' } },
    { $group: { _id: '$itemId', count: { $sum: 1 } } },
  ]);

  const resolutionStats = await DynamicTelemetryModel.aggregate([
    { $match: { userId: userObjectId, event: 'resolution_change' } },
    { $group: { _id: '$metadata.resolution', count: { $sum: 1 } } },
  ]);

  const errorStats = await DynamicTelemetryModel.aggregate([
    { $match: { userId: userObjectId, event: 'error' } },
    {
      $group: {
        _id: '$userAgent',
        errors: { $sum: 1 },
        details: { $push: '$metadata.details' },
      },
    },
    { $limit: 10 },
  ]);

  return sendSuccess(
    res,
    {
      bufferStats,
      resolutionStats,
      errorStats,
    },
    'Playback insights aggregated successfully',
  );
};
