import { body, param, query } from 'express-validator';
import { maxUploadFileSizeBytes } from '../utils/fileStorage.ts';

const USERNAME_PATTERN = /^[a-z0-9._-]+$/i;
const SAFE_ID_PATTERN = /^[a-zA-Z0-9:_-]+$/;
const SAFE_CATEGORY_PATTERN = /^[a-zA-Z0-9-]+$/;
const DEVICE_ID_PATTERN = /^[a-zA-Z0-9._:-]+$/;
const HASH_HEX_64_PATTERN = /^[a-f0-9]{64}$/i;
const UPLOAD_ID_PATTERN = /^[a-f0-9]{24}$/i;

const MULTIPART_CATEGORIES = ['photo', 'video', 'audio', 'document', 'other-files'] as const;

export const usernameQueryValidation = [
  query('username')
    .exists({ values: 'falsy' })
    .withMessage('Username is required.')
    .bail()
    .isString()
    .withMessage('Username must be a string.')
    .bail()
    .trim()
    .toLowerCase()
    .isLength({ min: 3, max: 64 })
    .withMessage('Username must be between 3 and 64 characters.')
    .bail()
    .matches(USERNAME_PATTERN)
    .withMessage('Username can only include letters, numbers, dots, underscores, and hyphens.'),
];

export const revokeSessionsValidation = [
  body().isObject().withMessage('Request body must be a JSON object.'),
  body('sessionId')
    .optional()
    .isString()
    .withMessage('sessionId must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 256 })
    .withMessage('sessionId must be between 1 and 256 characters.'),
  body('deviceId')
    .optional()
    .isString()
    .withMessage('deviceId must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 128 })
    .withMessage('deviceId must be between 1 and 128 characters.')
    .bail()
    .matches(DEVICE_ID_PATTERN)
    .withMessage('deviceId format is invalid.'),
  body('revokeAllOther')
    .optional()
    .isBoolean()
    .withMessage('revokeAllOther must be a boolean value.')
    .toBoolean(),
  body('revokeCurrent')
    .optional()
    .isBoolean()
    .withMessage('revokeCurrent must be a boolean value.')
    .toBoolean(),
  body().custom((value: unknown) => {
    const payload = value as {
      sessionId?: unknown;
      deviceId?: unknown;
      revokeAllOther?: unknown;
      revokeCurrent?: unknown;
    };
    const hasSessionId =
      typeof payload.sessionId === 'string' && payload.sessionId.trim().length > 0;
    const hasDeviceId = typeof payload.deviceId === 'string' && payload.deviceId.trim().length > 0;
    const revokeAllOther = payload.revokeAllOther === true;
    const revokeCurrent = payload.revokeCurrent === true;

    if (!hasSessionId && !hasDeviceId && !revokeAllOther) {
      throw new Error('Provide sessionId, deviceId, or revokeAllOther=true.');
    }

    if (revokeCurrent && !revokeAllOther) {
      throw new Error('revokeCurrent=true must be paired with revokeAllOther=true.');
    }

    return true;
  }),
];

export const deviceSessionRenameValidation = [
  body().isObject().withMessage('Request body must be a JSON object.'),
  body('deviceId')
    .exists({ values: 'falsy' })
    .withMessage('deviceId is required.')
    .bail()
    .isString()
    .withMessage('deviceId must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 128 })
    .withMessage('deviceId must be between 1 and 128 characters.')
    .bail()
    .matches(DEVICE_ID_PATTERN)
    .withMessage('deviceId format is invalid.'),
  body('deviceName')
    .exists({ values: 'falsy' })
    .withMessage('deviceName is required.')
    .bail()
    .isString()
    .withMessage('deviceName must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 120 })
    .withMessage('deviceName must be between 1 and 120 characters.')
    .custom((value: string) => !/[\u0000-\u001f\u007f]/.test(value))
    .withMessage('deviceName contains invalid control characters.'),
];

export const vaultLegacyRouteParamsValidation = [
  param('vaultId')
    .isString()
    .withMessage('vaultId is required.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 256 })
    .withMessage('vaultId must be between 1 and 256 characters.')
    .bail()
    .matches(SAFE_ID_PATTERN)
    .withMessage('vaultId contains unsupported characters.'),
  param('itemId')
    .optional()
    .isString()
    .withMessage('itemId must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 256 })
    .withMessage('itemId must be between 1 and 256 characters.')
    .bail()
    .matches(SAFE_ID_PATTERN)
    .withMessage('itemId contains unsupported characters.'),
];

export const vaultItemRouteParamsValidation = [
  param('itemId')
    .isString()
    .withMessage('itemId is required.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 256 })
    .withMessage('itemId must be between 1 and 256 characters.')
    .bail()
    .matches(SAFE_ID_PATTERN)
    .withMessage('itemId contains unsupported characters.'),
];

export const vaultCategoryRouteParamsValidation = [
  param('category')
    .isString()
    .withMessage('category is required.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 64 })
    .withMessage('category must be between 1 and 64 characters.')
    .bail()
    .matches(SAFE_CATEGORY_PATTERN)
    .withMessage('category contains unsupported characters.'),
];

export const multipartRouteParamsValidation = [
  param('uploadId')
    .isString()
    .withMessage('uploadId is required.')
    .bail()
    .trim()
    .matches(UPLOAD_ID_PATTERN)
    .withMessage('uploadId format is invalid.'),
  param('partNumber')
    .optional()
    .isInt({ min: 1, max: 2000 })
    .withMessage('partNumber must be an integer between 1 and 2000.')
    .toInt(),
];

export const multipartStartBodyValidation = [
  body().isObject().withMessage('Request body must be a JSON object.'),
  body('category')
    .isString()
    .withMessage('category is required.')
    .bail()
    .trim()
    .isIn(MULTIPART_CATEGORIES as unknown as string[])
    .withMessage('Unsupported multipart category.'),
  body('fileName')
    .isString()
    .withMessage('fileName is required.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 512 })
    .withMessage('fileName must be between 1 and 512 characters.'),
  body('mimeType')
    .isString()
    .withMessage('mimeType is required.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('mimeType must be between 1 and 255 characters.'),
  body('fileSize')
    .isInt({ min: 1, max: maxUploadFileSizeBytes })
    .withMessage(`fileSize must be between 1 and ${maxUploadFileSizeBytes}.`)
    .toInt(),
  body('folder')
    .optional()
    .isString()
    .withMessage('folder must be a string.')
    .bail()
    .trim()
    .isLength({ max: 256 })
    .withMessage('folder must be 256 characters or fewer.'),
  body('resumeUploadId')
    .optional()
    .isString()
    .withMessage('resumeUploadId must be a string.')
    .bail()
    .trim()
    .matches(UPLOAD_ID_PATTERN)
    .withMessage('resumeUploadId format is invalid.'),
  body('keepMetadata')
    .optional()
    .isBoolean()
    .withMessage('keepMetadata must be a boolean.')
    .toBoolean(),
];

export const multipartCompleteBodyValidation = [
  body().isObject().withMessage('Request body must be a JSON object.'),
  body('fileSha256')
    .optional()
    .isString()
    .withMessage('fileSha256 must be a string.')
    .bail()
    .trim()
    .matches(HASH_HEX_64_PATTERN)
    .withMessage('fileSha256 must be a 64-character hex hash.'),
  body('deviceId')
    .optional()
    .isString()
    .withMessage('deviceId must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 128 })
    .withMessage('deviceId must be between 1 and 128 characters.')
    .bail()
    .matches(DEVICE_ID_PATTERN)
    .withMessage('deviceId format is invalid.'),
  body('clientUpdatedAt')
    .optional()
    .isString()
    .withMessage('clientUpdatedAt must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 128 })
    .withMessage('clientUpdatedAt is invalid.'),
];

export const activityLogQueryValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('limit must be an integer between 1 and 1000.')
    .toInt(),
  query('skip')
    .optional()
    .isInt({ min: 0, max: 1000000 })
    .withMessage('skip must be an integer between 0 and 1000000.')
    .toInt(),
];

export const activityLogBodyValidation = [
  body().isObject().withMessage('Request body must be a JSON object.'),
  body('action')
    .optional()
    .isString()
    .withMessage('action must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 64 })
    .withMessage('action must be between 1 and 64 characters.'),
  body('category')
    .optional()
    .isString()
    .withMessage('category must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 64 })
    .withMessage('category must be between 1 and 64 characters.'),
  body('itemId')
    .optional({ values: 'null' })
    .isString()
    .withMessage('itemId must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 256 })
    .withMessage('itemId must be between 1 and 256 characters.'),
  body('status')
    .optional()
    .isString()
    .withMessage('status must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 32 })
    .withMessage('status must be between 1 and 32 characters.'),
  body('errorCode')
    .optional()
    .isString()
    .withMessage('errorCode must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 128 })
    .withMessage('errorCode must be between 1 and 128 characters.'),
  body('errorMessage')
    .optional()
    .isString()
    .withMessage('errorMessage must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 2048 })
    .withMessage('errorMessage must be between 1 and 2048 characters.'),
  body('deviceId')
    .optional()
    .isString()
    .withMessage('deviceId must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 128 })
    .withMessage('deviceId must be between 1 and 128 characters.')
    .bail()
    .matches(DEVICE_ID_PATTERN)
    .withMessage('deviceId format is invalid.'),
  body('details').optional().isObject().withMessage('details must be an object.'),
];
