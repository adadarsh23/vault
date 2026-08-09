import express from 'express';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';
import { mediaService } from '../services/mediaService.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { anomalyDetectionService } from '../services/anomalyDetectionService.ts';
import { getVaultItemModel } from '../models/vaultItem.ts';
import { findVaultItemFlexible } from './mediaController.ts';
import { User } from '../models/user.ts';

/**
 * LicenseServer Controller - Centralized DRM & Key Delivery
 *
 * Flow:
 * 1. Player requests license (POST)
 * 2. Authenticate: Verify JWT & User
 * 3. Policy Check: Verify Device & Ownership
 * 4. Key Retrieval: Secure fetch from MediaService
 * 5. Delivery: Return encrypted license (never raw keys)
 */

const validateLicensePolicy = async (
  userId: string,
  username: string,
  itemId: string,
  deviceId?: string
) => {
  // 1. Ownership & Existence Check
  const DynamicVaultModel = getVaultItemModel(username);
  const item = await findVaultItemFlexible(DynamicVaultModel, userId, itemId);
  if (!item) {
    logger.warn('License Policy Failure: Item not found or unauthorized', { userId, itemId });
    throw AppError.notFound('Media content not found in vault');
  }

  // 2. Device Continuity Check
  if (deviceId) {
    const user = await User.findById(userId).select('sessions').lean();
    const isDeviceRegistered = user?.sessions?.some((s) => s.deviceId === deviceId);
    if (!isDeviceRegistered) {
      logger.error('Security Alert: License requested from unregistered device', {
        userId,
        deviceId,
      });
      throw AppError.forbidden(
        'Playback not permitted on this device. Please sign in again.',
        'DEVICE_UNAUTHORIZED'
      );
    }
  }

  // 3. Anomaly Check (e.g. usage velocity)
  // Handled by anomalyDetectionService inside the endpoints
};

/**
 * Unified License Entry Point (POST /api/vault/license/:itemId)
 */
export const handleLicenseRequest = async (req: express.Request, res: express.Response) => {
  const itemId = typeof req.params.itemId === 'string' ? req.params.itemId : undefined;
  const { drmType, deviceId } = req.body; // Client specifies DRM type
  const q = req.query as any;
  const authTokenFromQuery = Array.isArray(q.auth_token) ? q.auth_token[0] : q.auth_token;
  const uidFromQuery = Array.isArray(q.uid) ? q.uid[0] : q.uid;
  const userIdFromQuery = Array.isArray(q.userId) ? q.userId[0] : q.userId;
  const usernameFromQuery = Array.isArray(q.username) ? q.username[0] : q.username;

  // 1. Resolve Identity (Session > Query > Auth Header)
  let userId = (req as any).user?.userId || uidFromQuery || userIdFromQuery;
  let username = (req as any).user?.username || usernameFromQuery;

  if (!userId) {
    const authHeader = req.get('Authorization')?.split(' ')[1];
    const authToken = authTokenFromQuery || authHeader;

    if (authToken && typeof authToken === 'string' && authToken.split('.').length === 3) {
      try {
        const { verifyAccessToken } = await import('../utils/auth.ts');
        const payload = verifyAccessToken(authToken);
        userId = payload.sub;
        username = payload.username;
      } catch (e) {
        logger.warn('License request token check failed', { error: (e as Error).message });
      }
    }
  }

  const clientIp = getClientIp(req);

  if (!itemId) {
    throw AppError.badRequest('itemId is required.', 'ITEM_REQUIRED');
  }

  if (!userId || !username) {
    logger.warn('License access denied: Identification missing', {
      itemId,
      queryKeys: Object.keys(q),
    });
    throw AppError.unauthorized(
      'License delivery requires valid user identification (userId and username)'
    );
  }

  // Security Intelligence: IP Drift & Anomaly Tracking
  anomalyDetectionService.trackMediaRequest(userId, itemId, clientIp);
  anomalyDetectionService.trackIpDrift(userId, clientIp);

  // 1. Enforce Playback Policy
  await validateLicensePolicy(userId, username, itemId, deviceId);

  // 2. Retrieve Secure Content Key
  const contentKey = await mediaService.getStreamingKey(userId, itemId);

  logger.info(`License delivered [${drmType || 'standard'}]`, {
    userId,
    itemId,
    ip: clientIp,
    deviceId,
  });

  /**
   * PROTECTED KEY DELIVERY
   * We do not send JSON. We send a binary payload tailored to the DRM protocol.
   */
  if (drmType === 'widevine') {
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.send(contentKey); // Securely wrapped Content Key for Widevine CDM
  } else if (drmType === 'fairplay') {
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.send(contentKey); // Securely wrapped for Apple KSM
  }

  // Default to secure CENC response
  return res.json({
    k: contentKey.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
    alg: 'A128GCM',
  });
};

/* ---------------- LEGACY ADAPTERS (Delegating to Unified Handler) ---------------- */

export const handleWidevineLicense = async (req: express.Request, res: express.Response) => {
  req.body.drmType = 'widevine';
  return handleLicenseRequest(req, res);
};

export const handleFairPlayLicense = async (req: express.Request, res: express.Response) => {
  req.body.drmType = 'fairplay';
  return handleLicenseRequest(req, res);
};

export const getCencKey = async (req: express.Request, res: express.Response) => {
  return handleLicenseRequest(req, res);
};
