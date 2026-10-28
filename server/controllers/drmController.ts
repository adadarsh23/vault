import express from 'express';
import mongoose from 'mongoose';
import { AppError } from '../utils/appError.ts';
import { logger } from '../utils/logger.ts';
import { mediaService } from '../services/mediaService.ts';
import { getClientIp } from '../utils/requestIp.ts';
import { anomalyDetectionService } from '../services/anomalyDetectionService.ts';
import { getVaultItemModel } from '../models/vaultItem.ts';
import { findVaultItemFlexible } from './mediaController.ts';
import { User } from '../models/user.ts';

const SAFE_ID_PATTERN = /^[a-zA-Z0-9:_-]+$/;

const assertSafeId = (id: string, paramName: string) => {
  if (!id || id.length > 256 || !SAFE_ID_PATTERN.test(id)) {
    throw AppError.badRequest(`Invalid format for ${paramName}.`, 'INVALID_IDENTIFIER');
  }
};

/**
 * Validates DRM playback license policies:
 * 1. Vault media ownership and existence.
 * 2. Device continuity / registered session verification.
 */
const validateLicensePolicy = async (
  userId: string,
  username: string,
  itemId: string,
  deviceId?: string,
) => {
  // 1. Ownership & Existence Check
  const DynamicVaultModel = getVaultItemModel(username);
  const item = await findVaultItemFlexible(DynamicVaultModel, userId, itemId, username);
  if (!item) {
    logger.warn('License Policy Failure: Item not found or unauthorized', { userId, itemId });
    throw AppError.notFound('Media content not found in vault');
  }

  // 2. Device Continuity Check
  if (deviceId && typeof deviceId === 'string' && deviceId.trim()) {
    const cleanDeviceId = deviceId.trim();
    if (mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId).select('sessions.deviceId').lean();
      const isDeviceRegistered = user?.sessions?.some((s) => s.deviceId === cleanDeviceId);
      if (!isDeviceRegistered) {
        logger.error('Security Alert: License requested from unregistered device', {
          userId,
          deviceId: cleanDeviceId,
        });
        throw AppError.forbidden(
          'Playback not permitted on this device. Please sign in again.',
          'DEVICE_UNAUTHORIZED',
        );
      }
    }
  }
};

/**
 * Internal license delivery worker
 */
const deliverLicense = async (
  req: express.Request,
  res: express.Response,
  drmTypeOverride?: string,
) => {
  const rawItemId = typeof req.params.itemId === 'string' ? req.params.itemId.trim() : undefined;
  if (!rawItemId) {
    throw AppError.badRequest('itemId is required.', 'ITEM_REQUIRED');
  }
  assertSafeId(rawItemId, 'itemId');

  const body = req.body || {};
  const query = req.query || {};
  const drmType = drmTypeOverride || (typeof body.drmType === 'string' ? body.drmType : undefined);
  const deviceId =
    typeof body.deviceId === 'string'
      ? body.deviceId.trim()
      : typeof query.deviceId === 'string'
        ? query.deviceId.trim()
        : undefined;

  // 1. Resolve Identity Strictly from Authenticated Session
  const userId = (req as any).user?.userId;
  const username = (req as any).user?.username;
  const clientIp = getClientIp(req);

  if (!userId || !username) {
    logger.warn('License access denied: Identification missing', { itemId: rawItemId });
    throw AppError.unauthorized('License delivery requires a verified authenticated session.');
  }

  // Security Intelligence: IP Drift & Anomaly Tracking
  anomalyDetectionService.trackMediaRequest(userId, rawItemId, clientIp);
  anomalyDetectionService.trackIpDrift(userId, clientIp);

  // 2. Enforce Playback Policy
  await validateLicensePolicy(userId, username, rawItemId, deviceId);

  // 3. Retrieve Secure Content Key
  const contentKey = await mediaService.getStreamingKey(userId, rawItemId);

  logger.info(`License delivered [${drmType || 'standard'}]`, {
    userId,
    itemId: rawItemId,
    ip: clientIp,
    deviceId,
  });

  // Never cache encryption license payloads
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  /**
   * PROTECTED KEY DELIVERY
   */
  if (drmType === 'widevine' || drmType === 'fairplay') {
    res.setHeader('Content-Type', 'application/octet-stream');
    return res.send(contentKey);
  }

  // Default to secure CENC response
  return res.json({
    k: contentKey.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
    alg: 'A128GCM',
  });
};

/**
 * Unified License Entry Point (POST /api/vault/license/:itemId)
 */
export const handleLicenseRequest = async (req: express.Request, res: express.Response) => {
  return deliverLicense(req, res);
};

/* ---------------- LEGACY ADAPTERS (Delegating to Unified Handler) ---------------- */

export const handleWidevineLicense = async (req: express.Request, res: express.Response) => {
  return deliverLicense(req, res, 'widevine');
};

export const handleFairPlayLicense = async (req: express.Request, res: express.Response) => {
  return deliverLicense(req, res, 'fairplay');
};

export const getCencKey = async (req: express.Request, res: express.Response) => {
  return deliverLicense(req, res, 'cenc');
};
