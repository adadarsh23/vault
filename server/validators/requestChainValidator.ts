import { body, param, query } from 'express-validator';
import { maxUploadFileSizeBytes } from '../utils/fileStorage.ts';
import {
  USERNAME_PATTERN,
  SAFE_ID_PATTERN,
  DEVICE_ID_PATTERN,
  HASH_HEX_64_PATTERN,
  hasPrototypePollutionKey,
  hasNoSqlOperatorKey,
} from './commonValidator.ts';

const SAFE_CATEGORY_PATTERN = /^[a-zA-Z0-9-]+$/;
const UPLOAD_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const MIME_TYPE_PATTERN = /^[a-zA-Z0-9.+_-]+\/[a-zA-Z0-9.+_-]+$/;

export const MULTIPART_CATEGORIES = ['photo', 'video', 'audio', 'document', 'other-files'] as const;

export const ALL_VAULT_CATEGORIES = [
  'photo',
  'video',
  'audio',
  'document',
  'other-files',
  'file',
  'other',
  'note',
  'chat',
  'todo',
  'password',
  'secret',
  'contact',
  'location',
  'card',
  'identity',
  'wifi',
  'system',
  'settings',
  'users',
] as const;

/**
 * Validates GET username query parameter.
 */
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
    .withMessage('Username can only include letters, numbers, dots, underscores, and hyphens.')
    .bail()
    .custom((val: string) => !/[\u0000-\u001f\u007f]/.test(val))
    .withMessage('Username contains invalid control characters.'),
];

/**
 * Validates POST session revocation payload.
 */
export const revokeSessionsValidation = [
  body().isObject().withMessage('Request body must be a JSON object.'),
  body().custom((value: unknown) => {
    if (value && typeof value === 'object') {
      if (hasPrototypePollutionKey(value)) {
        throw new Error('Payload contains forbidden prototype pollution keys.');
      }
      if (hasNoSqlOperatorKey(value)) {
        throw new Error('Payload contains forbidden query operator keys.');
      }
      const allowedKeys = new Set(['sessionId', 'deviceId', 'revokeAllOther', 'revokeCurrent']);
      for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
          throw new Error(`Unexpected field '${key}' is not permitted.`);
        }
      }
    }
    return true;
  }),
  body('sessionId')
    .optional()
    .isString()
    .withMessage('sessionId must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 256 })
    .withMessage('sessionId must be between 1 and 256 characters.')
    .bail()
    .matches(SAFE_ID_PATTERN)
    .withMessage('sessionId contains invalid characters.'),
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

/**
 * Validates device session rename payload.
 */
export const deviceSessionRenameValidation = [
  body().isObject().withMessage('Request body must be a JSON object.'),
  body().custom((value: unknown) => {
    if (value && typeof value === 'object') {
      if (hasPrototypePollutionKey(value)) {
        throw new Error('Payload contains forbidden prototype pollution keys.');
      }
      const allowedKeys = new Set(['deviceId', 'deviceName']);
      for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
          throw new Error(`Unexpected field '${key}' is not permitted.`);
        }
      }
    }
    return true;
  }),
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

/**
 * Validates legacy vault route params (:vaultId and optional :itemId).
 */
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

/**
 * Validates vault item route param (:itemId).
 */
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

/**
 * Validates vault category route param (:category).
 */
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

/**
 * Validates multipart route params (:uploadId and optional :partNumber).
 */
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
    .withMessage('partNumber must be an integer between 1 and 2000.'),
];

/**
 * Validates multipart upload initialization body.
 */
export const multipartStartBodyValidation = [
  body().isObject().withMessage('Request body must be a JSON object.'),
  body().custom((value: unknown) => {
    if (value && typeof value === 'object') {
      if (hasPrototypePollutionKey(value)) {
        throw new Error('Payload contains forbidden prototype pollution keys.');
      }
      const allowed = new Set([
        'category',
        'fileName',
        'mimeType',
        'fileSize',
        'folder',
        'resumeUploadId',
        'keepMetadata',
      ]);
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          throw new Error(`Unexpected field '${key}' is not permitted.`);
        }
      }
    }
    return true;
  }),
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
    .withMessage('fileName must be between 1 and 512 characters.')
    .bail()
    .custom((val: string) => !/[\u0000-\u001f\u007f]/.test(val) && !val.includes('..'))
    .withMessage('fileName contains invalid characters or path traversal sequences.'),
  body('mimeType')
    .isString()
    .withMessage('mimeType is required.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('mimeType must be between 1 and 255 characters.')
    .bail()
    .matches(MIME_TYPE_PATTERN)
    .withMessage('mimeType format is invalid.'),
  body('fileSize')
    .isInt({ min: 1, max: maxUploadFileSizeBytes })
    .withMessage(`fileSize must be between 1 and ${maxUploadFileSizeBytes}.`)
    .toInt(),
  body('folder')
    .optional({ values: 'null' })
    .isString()
    .withMessage('folder must be a string.')
    .bail()
    .trim()
    .isLength({ max: 256 })
    .withMessage('folder must be 256 characters or fewer.')
    .bail()
    .custom((val: string) => !/[\u0000-\u001f\u007f]/.test(val) && !val.includes('..'))
    .withMessage('folder contains invalid characters or path traversal sequences.'),
  body('resumeUploadId')
    .optional({ values: 'null' })
    .isString()
    .withMessage('resumeUploadId must be a string.')
    .bail()
    .trim()
    .matches(UPLOAD_ID_PATTERN)
    .withMessage('resumeUploadId format is invalid.'),
  body('keepMetadata')
    .optional({ values: 'null' })
    .isBoolean()
    .withMessage('keepMetadata must be a boolean.')
    .toBoolean(),
];

/**
 * Validates multipart upload completion body.
 */
export const multipartCompleteBodyValidation = [
  body().isObject().withMessage('Request body must be a JSON object.'),
  body().custom((value: unknown) => {
    if (value && typeof value === 'object') {
      if (hasPrototypePollutionKey(value)) {
        throw new Error('Payload contains forbidden prototype pollution keys.');
      }
      const allowed = new Set(['fileSha256', 'deviceId', 'clientUpdatedAt', 'metadata']);
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          throw new Error(`Unexpected field '${key}' is not permitted.`);
        }
      }
    }
    return true;
  }),
  body('fileSha256')
    .optional({ values: 'null' })
    .isString()
    .withMessage('fileSha256 must be a string.')
    .bail()
    .trim()
    .matches(HASH_HEX_64_PATTERN)
    .withMessage('fileSha256 must be a 64-character hex hash.'),
  body('deviceId')
    .optional({ values: 'null' })
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
    .optional({ values: 'null' })
    .isString()
    .withMessage('clientUpdatedAt must be a string.')
    .bail()
    .trim()
    .isLength({ min: 1, max: 128 })
    .withMessage('clientUpdatedAt is invalid.'),
  body('metadata')
    .optional({ values: 'null' })
    .custom((val: unknown) => {
      if (val === null || val === undefined) return true;
      if (typeof val !== 'object' || Array.isArray(val)) {
        throw new Error('metadata must be a JSON object.');
      }
      if (hasPrototypePollutionKey(val)) {
        throw new Error('metadata contains forbidden prototype pollution keys.');
      }
      if (hasNoSqlOperatorKey(val)) {
        throw new Error('metadata contains forbidden query operator keys.');
      }
      const serialized = JSON.stringify(val);
      if (serialized.length > 65536) {
        throw new Error('metadata exceeds maximum size limit of 64KB.');
      }
      return true;
    }),
];

/**
 * Validates activity log pagination query.
 */
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

/**
 * Validates user activity log submission body.
 */
export const activityLogBodyValidation = [
  body().isObject().withMessage('Request body must be a JSON object.'),
  body().custom((value: unknown) => {
    if (value && typeof value === 'object') {
      if (hasPrototypePollutionKey(value)) {
        throw new Error('Payload contains forbidden prototype pollution keys.');
      }
      const allowed = new Set([
        'action',
        'category',
        'itemId',
        'status',
        'errorCode',
        'errorMessage',
        'deviceId',
        'details',
      ]);
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          throw new Error(`Unexpected field '${key}' is not permitted.`);
        }
      }
    }
    return true;
  }),
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
    .withMessage('itemId must be between 1 and 256 characters.')
    .bail()
    .matches(SAFE_ID_PATTERN)
    .withMessage('itemId contains unsupported characters.'),
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
  body('details')
    .optional()
    .custom((val: unknown) => {
      if (val === null || val === undefined) return true;
      if (typeof val !== 'object' || Array.isArray(val)) {
        throw new Error('details must be a JSON object.');
      }
      if (hasPrototypePollutionKey(val)) {
        throw new Error('details contains forbidden prototype pollution keys.');
      }
      if (hasNoSqlOperatorKey(val)) {
        throw new Error('details contains forbidden query operator keys.');
      }
      const serialized = JSON.stringify(val);
      if (serialized.length > 10240) {
        throw new Error('details exceeds maximum size limit of 10KB.');
      }
      return true;
    }),
];
