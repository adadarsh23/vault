import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import {
  getScopedVaultItems,
  getLegacyVaultItems,
  removeScopedVaultItem,
  removeLegacyVaultItem,
  toggleScopedVaultItemPin,
  upsertScopedVaultItem,
  upsertLegacyVaultItem,
} from '../controllers/legacyVaultController.ts';
import {
  deleteVaultEntry,
  fetchVault,
  completeMultipartUpload,
  startMultipartUpload,
  syncVault,
  uploadVaultFile,
  uploadMultipartPart,
  upsertVaultEntry,
  saveUserActivityLog,
  getUserActivityLogsController,
} from '../controllers/vaultController.ts';
import {
  getMediaPlaylist,
  getMediaSegment,
  accessVaultFile,
  createSignedUrl,
  keyRateLimit,
  logPlaybackEvent,
  getPlaybackInsights,
} from '../controllers/mediaController.ts';
import {
  handleWidevineLicense,
  handleFairPlayLicense,
  getCencKey,
  handleLicenseRequest,
} from '../controllers/drmController.ts';
import {
  getFoldersController,
  createFolderController,
  deleteFolderController,
  initializeFoldersController,
} from '../controllers/folderController.ts';
import {
  createTusUploadController,
  getTusOffsetController,
  uploadTusChunkController,
} from '../controllers/tusController.ts';
import { requireAuth, resolveIdentity } from '../middleware/authMiddleware.ts';
import { requireTrustedBrowserOrigin } from '../middleware/csrfOriginMiddleware.ts';
import { validateRequest } from '../middleware/expressValidate.ts';
import {
  activityLogBodyValidation,
  activityLogQueryValidation,
  multipartCompleteBodyValidation,
  multipartRouteParamsValidation,
  multipartStartBodyValidation,
  vaultCategoryRouteParamsValidation,
  vaultItemRouteParamsValidation,
  vaultLegacyRouteParamsValidation,
} from '../validators/requestChainValidator.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { uploadVaultFileMiddleware } from '../utils/fileStorage.ts';

export const vaultRouter = express.Router();

const strictUserLimiter = (windowMs: number, max: number, message: string) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
    keyGenerator: (req) => {
      const userId = (req as any)?.user?.userId;
      if (userId) return String(userId);
      return ipKeyGenerator(req.ip || req.socket.remoteAddress || 'anonymous');
    },
  });

const signedUrlLimiter = strictUserLimiter(
  60 * 1000,
  Math.max(20, Number(process.env.SIGNED_URL_LIMIT_PER_MIN || 600)),
  'Too many signed URL requests. Please retry shortly.',
);
const multipartStartLimiter = strictUserLimiter(
  10 * 60 * 1000,
  Math.max(3, Number(process.env.MULTIPART_START_LIMIT_PER_10MIN || 20)),
  'Too many upload sessions started. Please retry later.',
);
const multipartPartLimiter = strictUserLimiter(
  60 * 1000,
  Math.max(30, Number(process.env.MULTIPART_PART_LIMIT_PER_MIN || 600)),
  'Upload part rate limit exceeded. Slow down and retry.',
);
const multipartCompleteLimiter = strictUserLimiter(
  10 * 60 * 1000,
  Math.max(3, Number(process.env.MULTIPART_COMPLETE_LIMIT_PER_10MIN || 30)),
  'Too many upload completion requests. Please retry later.',
);
const vaultUploadLimiter = strictUserLimiter(
  60 * 1000,
  Math.max(30, Number(process.env.VAULT_UPLOAD_LIMIT_PER_MIN || 60)),
  'Upload rate limit exceeded. Please wait a moment.',
);
const vaultItemWriteLimiter = strictUserLimiter(
  60 * 1000,
  Math.max(60, Number(process.env.VAULT_ITEM_WRITE_LIMIT_PER_MIN || 120)),
  'Vault item modification rate limit exceeded. Please retry shortly.',
);
const folderLimiter = strictUserLimiter(
  60 * 1000,
  Math.max(30, Number(process.env.VAULT_FOLDER_LIMIT_PER_MIN || 60)),
  'Folder operation rate limit exceeded. Please wait a moment.',
);
const activityLimiter = strictUserLimiter(
  60 * 1000,
  Math.max(60, Number(process.env.VAULT_ACTIVITY_LIMIT_PER_MIN || 120)),
  'Activity rate limit exceeded.',
);
const multipartPartBodyLimitBytes =
  Math.max(5 * 1024 * 1024, Number(process.env.MULTIPART_PART_SIZE_BYTES || 8 * 1024 * 1024)) +
  32 * 1024;

// Prevent browser/proxy caching of private encrypted vault items and sync data
vaultRouter.use((req, res, next) => {
  if (!req.path.includes('/media/segment/') && !req.path.includes('/files/access/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Legacy / Migration
vaultRouter.post(
  '/legacy/:vaultId/items/:itemId',
  requireTrustedBrowserOrigin,
  requireAuth,
  vaultItemWriteLimiter,
  validateRequest(vaultLegacyRouteParamsValidation),
  asyncHandler(upsertLegacyVaultItem),
);
vaultRouter.get(
  '/legacy/:vaultId/items',
  requireAuth,
  validateRequest(vaultLegacyRouteParamsValidation),
  asyncHandler(getLegacyVaultItems),
);
vaultRouter.delete(
  '/legacy/:vaultId/items/:itemId',
  requireTrustedBrowserOrigin,
  requireAuth,
  vaultItemWriteLimiter,
  validateRequest(vaultLegacyRouteParamsValidation),
  asyncHandler(removeLegacyVaultItem),
);

// Scoped Items (Modern)
vaultRouter.get('/items', requireAuth, asyncHandler(getScopedVaultItems));
vaultRouter.post(
  '/items/:itemId',
  requireTrustedBrowserOrigin,
  requireAuth,
  vaultItemWriteLimiter,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(upsertScopedVaultItem),
);
vaultRouter.put(
  '/items/:itemId/pin',
  requireTrustedBrowserOrigin,
  requireAuth,
  vaultItemWriteLimiter,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(toggleScopedVaultItemPin),
);
vaultRouter.delete(
  '/items/:itemId',
  requireTrustedBrowserOrigin,
  requireAuth,
  vaultItemWriteLimiter,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(removeScopedVaultItem),
);

// High Level Vault Sync
vaultRouter.get('/', requireAuth, asyncHandler(fetchVault));
vaultRouter.get('/sync', requireAuth, asyncHandler(syncVault));

// Folders
vaultRouter.get('/folders', requireAuth, asyncHandler(getFoldersController));
vaultRouter.post(
  '/folders',
  requireTrustedBrowserOrigin,
  requireAuth,
  folderLimiter,
  asyncHandler(createFolderController),
);
vaultRouter.delete(
  '/folders',
  requireTrustedBrowserOrigin,
  requireAuth,
  folderLimiter,
  asyncHandler(deleteFolderController),
);
vaultRouter.post(
  '/folders/init',
  requireTrustedBrowserOrigin,
  requireAuth,
  folderLimiter,
  asyncHandler(initializeFoldersController),
);

// Activity Audit
vaultRouter.get(
  '/activity',
  requireAuth,
  validateRequest(activityLogQueryValidation),
  asyncHandler(getUserActivityLogsController),
);
vaultRouter.post(
  '/activity',
  requireTrustedBrowserOrigin,
  requireAuth,
  activityLimiter,
  validateRequest(activityLogBodyValidation),
  asyncHandler(saveUserActivityLog),
);

// Production Media & File Access (Note: Handled by Signed URL Tokens or Internal Session Check)
// These routes do NOT use global requireAuth because browsers don't send Authorization headers for img/video tags.
vaultRouter.get(
  '/files/signed-url/:itemId',
  requireAuth,
  signedUrlLimiter,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(createSignedUrl),
);
vaultRouter.get(
  '/files/access/:itemId',
  resolveIdentity,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(accessVaultFile),
);
vaultRouter.get(
  '/media/:itemId/hls',
  resolveIdentity,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(getMediaPlaylist),
);
vaultRouter.get(
  '/media/:itemId/hls/:variant/playlist.m3u8',
  resolveIdentity,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(getMediaPlaylist),
);
vaultRouter.get(
  '/media/segment/:itemId/:segment',
  resolveIdentity,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(getMediaSegment),
);
vaultRouter.post(
  '/license/:itemId',
  requireAuth,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(handleLicenseRequest),
); // NEW Secure License Server
vaultRouter.get(
  '/media/key/:itemId',
  requireAuth,
  keyRateLimit,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(handleLicenseRequest),
); // Deprecated - mapped to License Server
vaultRouter.post('/media/events', requireAuth, asyncHandler(logPlaybackEvent));
vaultRouter.get('/media/insights', requireAuth, asyncHandler(getPlaybackInsights));
vaultRouter.post(
  '/media/drm/widevine/:itemId',
  requireAuth,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(handleWidevineLicense),
);
vaultRouter.post(
  '/media/drm/fairplay/:itemId',
  requireAuth,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(handleFairPlayLicense),
);
vaultRouter.get(
  '/media/drm/cenc/:itemId/:kid',
  requireAuth,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(getCencKey),
);

// Category Upserts
vaultRouter.post(
  '/files/multipart/start',
  requireTrustedBrowserOrigin,
  requireAuth,
  multipartStartLimiter,
  validateRequest(multipartStartBodyValidation),
  asyncHandler(startMultipartUpload),
);
vaultRouter.put(
  '/files/multipart/:uploadId/part/:partNumber',
  requireTrustedBrowserOrigin,
  requireAuth,
  multipartPartLimiter,
  validateRequest(multipartRouteParamsValidation),
  express.raw({ type: 'application/octet-stream', limit: multipartPartBodyLimitBytes }),
  asyncHandler(uploadMultipartPart),
);
vaultRouter.post(
  '/files/multipart/:uploadId/complete',
  requireTrustedBrowserOrigin,
  requireAuth,
  multipartCompleteLimiter,
  validateRequest([...multipartRouteParamsValidation, ...multipartCompleteBodyValidation]),
  asyncHandler(completeMultipartUpload),
);

// TUS Protocol Endpoints
vaultRouter.post(
  '/files/tus',
  requireTrustedBrowserOrigin,
  requireAuth,
  vaultUploadLimiter,
  asyncHandler(createTusUploadController),
);
vaultRouter.head('/files/tus/:uploadId', requireAuth, asyncHandler(getTusOffsetController));
vaultRouter.patch(
  '/files/tus/:uploadId',
  requireTrustedBrowserOrigin,
  requireAuth,
  vaultUploadLimiter,
  asyncHandler(uploadTusChunkController),
);

vaultRouter.post(
  '/files/:category',
  requireTrustedBrowserOrigin,
  requireAuth,
  vaultUploadLimiter,
  validateRequest(vaultCategoryRouteParamsValidation),
  uploadVaultFileMiddleware,
  asyncHandler(uploadVaultFile),
);
vaultRouter.post(
  '/:category',
  requireTrustedBrowserOrigin,
  requireAuth,
  vaultItemWriteLimiter,
  validateRequest(vaultCategoryRouteParamsValidation),
  asyncHandler(upsertVaultEntry),
);
vaultRouter.put(
  '/:category/:itemId',
  requireTrustedBrowserOrigin,
  requireAuth,
  vaultItemWriteLimiter,
  validateRequest([...vaultCategoryRouteParamsValidation, ...vaultItemRouteParamsValidation]),
  asyncHandler(upsertVaultEntry),
);
vaultRouter.delete(
  '/:category/:itemId',
  requireTrustedBrowserOrigin,
  requireAuth,
  vaultItemWriteLimiter,
  validateRequest([...vaultCategoryRouteParamsValidation, ...vaultItemRouteParamsValidation]),
  asyncHandler(deleteVaultEntry),
);

export const registerVaultRoutes = (app: express.Express): void => {
  app.use('/api/vault', vaultRouter);
};
