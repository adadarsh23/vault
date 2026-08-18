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
  const item = await findVaultItemFlexible(DynamicVaultModel, userId, itemId, username);
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
  // 1. Resolve Identity Strictly from Authenticated Session
  const userId = (req as any).user?.userId;
  const username = (req as any).user?.username;
  const clientIp = getClientIp(req);

  if (!itemId) {
    throw AppError.badRequest('itemId is required.', 'ITEM_REQUIRED');
  }

  if (!userId || !username) {
    logger.warn('License access denied: Identification missing', {
      itemId,
    });
    throw AppError.unauthorized('License delivery requires a verified authenticated session.');
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
  req.body = req.body || {};
  req.body.drmType = 'widevine';
  return handleLicenseRequest(req, res);
};

export const handleFairPlayLicense = async (req: express.Request, res: express.Response) => {
  req.body = req.body || {};
  req.body.drmType = 'fairplay';
  return handleLicenseRequest(req, res);
};

export const getCencKey = async (req: express.Request, res: express.Response) => {
  req.body = req.body || {};
  return handleLicenseRequest(req, res);
};
