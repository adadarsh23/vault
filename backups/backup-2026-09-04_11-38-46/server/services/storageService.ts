import crypto from 'crypto';
import { logger } from '../utils/logger.ts';

const resolveSignedUrlSecret = (): string => {
  const secret = process.env.SIGNED_URL_SECRET?.trim();
  if (
    secret &&
    secret !== 'vault-secret-for-signed-urls' &&
    secret !== 'replace-with-a-long-random-signed-url-secret-min-32-chars'
  ) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SIGNED_URL_SECRET environment variable must be configured in production.');
  }
  return secret || 'vault-secret-for-signed-urls';
};

const SIGNED_URL_EXPIRY_MINUTES = Math.max(15, Number(process.env.SIGNED_URL_EXPIRY_MINUTES || 60));
const MAX_SIGNED_URL_EXPIRY_MINUTES = Math.max(
  60,
  Number(process.env.MAX_SIGNED_URL_EXPIRY_MINUTES || 1440),
);

export interface SignedUrlOptions {
  expiresInMinutes?: number;
  action?: 'view' | 'download' | 'stream';
  ipAddress?: string;
  sessionId?: string;
  deviceHash?: string;
}

/**
 * Service to manage file storage and secure access
 */
export const storageService = {
  /**
   * Generates a signed URL for a vault item
   * In a real production setup with S3, this would call s3.getSignedUrl()
   * Here we generate a local signed URL that our server will verify
   */
  generateSignedUrl(
    userId: string,
    itemId: string,
    _fileName: string,
    options: SignedUrlOptions = {},
  ): string {
    const action = options.action || 'view';
    const actionTtl =
      action === 'stream' ? 120 : action === 'download' ? 30 : SIGNED_URL_EXPIRY_MINUTES;
    const requestedTtl = Number(options.expiresInMinutes || actionTtl);
    const ttl = Math.max(1, Math.min(MAX_SIGNED_URL_EXPIRY_MINUTES, requestedTtl));
    const expiry = Math.floor(Date.now() / 1000) + ttl * 60;
    const ip = options.ipAddress || 'any';
    const sid = options.sessionId || 'any';
    const device = options.deviceHash || 'direct';

    // Signature includes device fingerprint and session instead of just IP
    const payload = `${userId}:${itemId}:${action}:${expiry}:${sid}:${device}`;
    const secret = resolveSignedUrlSecret();
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    const resolvePublicBaseUrl = (): string => {
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction && process.env.PUBLIC_URL && process.env.PUBLIC_URL.trim()) {
        return process.env.PUBLIC_URL.trim().replace(/\/+$/, '');
      }
      const port = process.env.PORT || '4000';
      return `http://localhost:${port}`;
    };
    const baseUrl = resolvePublicBaseUrl();
    return `${baseUrl}/api/vault/files/access/${itemId}?token=${signature}&expires=${expiry}&action=${action}&sid=${sid}&dev=${encodeURIComponent(device)}&uid=${encodeURIComponent(userId)}${options.ipAddress ? `&ip=${encodeURIComponent(ip)}` : ''}`;
  },

  /**
   * Verifies a signed URL token with SOFT IP binding (allows drift)
   */
  verifySignedUrl(
    userId: string,
    itemId: string,
    input: {
      token: string;
      expires: number;
      action: string;
      clientIp: string;
      sessionId?: string;
      deviceHash?: string;
      originalIp?: string;
    },
  ): boolean {
    const now = Math.floor(Date.now() / 1000);

    // Check if token has expired (no grace period for security)
    if (now > input.expires) {
      logger.warn('Signed URL expired', { userId, itemId, expires: input.expires, now });
      return false;
    }

    const sid = input.sessionId || 'any';
    const device = input.deviceHash || 'direct';

    const secret = resolveSignedUrlSecret();
    const payload = `${userId}:${itemId}:${input.action}:${input.expires}:${sid}:${device}`;
    const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    // Also support fallback for legacy 'any' tokens
    const legacyPayload = `${userId}:${itemId}:${input.action}:${input.expires}:${sid}:any`;
    const legacySignature = crypto.createHmac('sha256', secret).update(legacyPayload).digest('hex');

    // Check length first before using timingSafeEqual to avoid buffer length mismatch errors
    if (input.token.length !== expectedSignature.length) {
      logger.error('Signed URL signature length mismatch', {
        userId,
        itemId,
        tokenLength: input.token.length,
        expectedLength: expectedSignature.length,
      });
      return false;
    }

    let isValid = false;
    if (input.token.length === expectedSignature.length) {
      isValid = crypto.timingSafeEqual(Buffer.from(input.token), Buffer.from(expectedSignature));
    }
    if (!isValid && input.token.length === legacySignature.length) {
      isValid = crypto.timingSafeEqual(Buffer.from(input.token), Buffer.from(legacySignature));
    }

    if (isValid) {
      // SOFT IP BINDING: Check for IP drift but don't block
      if (input.originalIp && input.originalIp !== 'any' && input.originalIp !== input.clientIp) {
        logger.info('Soft IP Drift Detected', {
          userId,
          itemId,
          originalIp: input.originalIp,
          currentIp: input.clientIp,
        });
      }
    } else {
      logger.error('Signed URL signature mismatch (Binding failure)', {
        userId,
        itemId,
        sid,
        device,
      });
    }

    return isValid;
  },
};
