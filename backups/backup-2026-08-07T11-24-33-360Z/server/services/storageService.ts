import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger.ts';

const SIGNED_URL_SECRET = process.env.SIGNED_URL_SECRET || 'vault-secret-for-signed-urls';
const SIGNED_URL_EXPIRY_MINUTES = 2;
const MAX_SIGNED_URL_EXPIRY_MINUTES = Math.max(
  1,
  Number(process.env.MAX_SIGNED_URL_EXPIRY_MINUTES || 10)
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
    fileName: string,
    options: SignedUrlOptions = {}
  ): string {
    const action = options.action || 'view';
    const actionTtl =
      action === 'stream' ? 2 : action === 'download' ? 3 : SIGNED_URL_EXPIRY_MINUTES;
    const requestedTtl = Number(options.expiresInMinutes || actionTtl);
    const ttl = Math.max(1, Math.min(MAX_SIGNED_URL_EXPIRY_MINUTES, requestedTtl));
    const expiry = Math.floor(Date.now() / 1000) + ttl * 60;
    const ip = options.ipAddress || 'any';
    const sid = options.sessionId || 'any';
    const device = options.deviceHash || 'any';

    // Signature includes device fingerprint and session instead of just IP
    const payload = `${userId}:${itemId}:${action}:${expiry}:${sid}:${device}`;
    const signature = crypto.createHmac('sha256', SIGNED_URL_SECRET).update(payload).digest('hex');

    const resolvePublicBaseUrl = (): string => {
      if (process.env.PUBLIC_URL && process.env.PUBLIC_URL.trim()) {
        return process.env.PUBLIC_URL.trim().replace(/\/+$/, '');
      }
      const port = process.env.PORT || '4000';
      return `http://localhost:${port}`;
    };
    const baseUrl = resolvePublicBaseUrl();
    return `${baseUrl}/api/vault/files/access/${itemId}?token=${signature}&expires=${expiry}&action=${action}&sid=${sid}&dev=${device}&uid=${userId}${options.ipAddress ? `&ip=${ip}` : ''}`;
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
    }
  ): boolean {
    const now = Math.floor(Date.now() / 1000);

    // Check if token has expired (no grace period for security)
    if (now > input.expires) {
      logger.warn('Signed URL expired', { userId, itemId, expires: input.expires, now });
      return false;
    }

    const sid = input.sessionId || 'any';
    const device = input.deviceHash || 'any';

    const payload = `${userId}:${itemId}:${input.action}:${input.expires}:${sid}:${device}`;
    const expectedSignature = crypto
      .createHmac('sha256', SIGNED_URL_SECRET)
      .update(payload)
      .digest('hex');

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

    const isValid = crypto.timingSafeEqual(
      Buffer.from(input.token),
      Buffer.from(expectedSignature)
    );

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
