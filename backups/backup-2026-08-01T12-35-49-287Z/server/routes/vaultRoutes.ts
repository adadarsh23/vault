import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import {
  getScopedVaultItems,
  getLegacyVaultItems,
  removeScopedVaultItem,
  removeLegacyVaultItem,
  toggleScopedVaultItemPin,
  upsertScopedVaultItem,
  upsertLegacyVaultItem,
} from "../controllers/legacyVaultController.ts";
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
} from "../controllers/vaultController.ts";
import { 
  getMediaPlaylist, 
  getMediaSegment,
  accessVaultFile,
  createSignedUrl,
  keyRateLimit,
  logPlaybackEvent,
  getPlaybackInsights
} from "../controllers/mediaController.ts";
import { 
  handleWidevineLicense, 
  handleFairPlayLicense, 
  getCencKey,
  handleLicenseRequest
} from "../controllers/drmController.ts";
import { getFoldersController, createFolderController, deleteFolderController, initializeFoldersController } from "../controllers/folderController.ts";
import { requireAuth, resolveIdentity } from "../middleware/authMiddleware.ts";
import { validateRequest } from "../middleware/expressValidate.ts";
import {
  activityLogBodyValidation,
  activityLogQueryValidation,
  multipartCompleteBodyValidation,
  multipartRouteParamsValidation,
  multipartStartBodyValidation,
  vaultCategoryRouteParamsValidation,
  vaultItemRouteParamsValidation,
  vaultLegacyRouteParamsValidation,
} from "../validators/requestChainValidator.ts";
import { asyncHandler } from "../utils/asyncHandler.ts";
import { uploadVaultFileMiddleware } from "../utils/fileStorage.ts";

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
      return ipKeyGenerator(req.ip || req.socket.remoteAddress || "anonymous");
    },
  })

const signedUrlLimiter = strictUserLimiter(
  60 * 1000,
  Math.max(20, Number(process.env.SIGNED_URL_LIMIT_PER_MIN || 90)),
  'Too many signed URL requests. Please retry shortly.',
)
const multipartStartLimiter = strictUserLimiter(
  10 * 60 * 1000,
  Math.max(3, Number(process.env.MULTIPART_START_LIMIT_PER_10MIN || 20)),
  'Too many upload sessions started. Please retry later.',
)
const multipartPartLimiter = strictUserLimiter(
  60 * 1000,
  Math.max(30, Number(process.env.MULTIPART_PART_LIMIT_PER_MIN || 600)),
  'Upload part rate limit exceeded. Slow down and retry.',
)
const multipartCompleteLimiter = strictUserLimiter(
  10 * 60 * 1000,
  Math.max(3, Number(process.env.MULTIPART_COMPLETE_LIMIT_PER_10MIN || 30)),
  'Too many upload completion requests. Please retry later.',
)
const multipartPartBodyLimitBytes = Math.max(
  5 * 1024 * 1024,
  Number(process.env.MULTIPART_PART_SIZE_BYTES || 8 * 1024 * 1024),
) + 32 * 1024

// Legacy / Migration
vaultRouter.post(
  "/legacy/:vaultId/items/:itemId",
  requireAuth,
  validateRequest(vaultLegacyRouteParamsValidation),
  asyncHandler(upsertLegacyVaultItem),
);
vaultRouter.get(
  "/legacy/:vaultId/items",
  requireAuth,
  validateRequest(vaultLegacyRouteParamsValidation),
  asyncHandler(getLegacyVaultItems),
);
vaultRouter.delete(
  "/legacy/:vaultId/items/:itemId",
  requireAuth,
  validateRequest(vaultLegacyRouteParamsValidation),
  asyncHandler(removeLegacyVaultItem),
);

// Scoped Items (Modern)
vaultRouter.get("/items", requireAuth, asyncHandler(getScopedVaultItems));
vaultRouter.post(
  "/items/:itemId",
  requireAuth,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(upsertScopedVaultItem),
);
vaultRouter.put(
  "/items/:itemId/pin",
  requireAuth,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(toggleScopedVaultItemPin),
);
vaultRouter.delete(
  "/items/:itemId",
  requireAuth,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(removeScopedVaultItem),
);

// High Level Vault Sync
vaultRouter.get("/", requireAuth, asyncHandler(fetchVault));
vaultRouter.get("/sync", requireAuth, asyncHandler(syncVault));

// Folders
vaultRouter.get("/folders", requireAuth, asyncHandler(getFoldersController));
vaultRouter.post("/folders", requireAuth, asyncHandler(createFolderController));
vaultRouter.delete("/folders", requireAuth, asyncHandler(deleteFolderController));
vaultRouter.post("/folders/init", requireAuth, asyncHandler(initializeFoldersController));

// Activity Audit
vaultRouter.get(
  "/activity",
  requireAuth,
  validateRequest(activityLogQueryValidation),
  asyncHandler(getUserActivityLogsController),
);
vaultRouter.post(
  "/activity",
  requireAuth,
  validateRequest(activityLogBodyValidation),
  asyncHandler(saveUserActivityLog),
);

// Production Media & File Access (Note: Handled by Signed URL Tokens or Internal Session Check)
// These routes do NOT use global requireAuth because browsers don't send Authorization headers for img/video tags.
vaultRouter.get(
  "/files/signed-url/:itemId",
  requireAuth,
  signedUrlLimiter,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(createSignedUrl),
);
vaultRouter.get(
  "/files/access/:itemId",
  resolveIdentity,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(accessVaultFile),
);
vaultRouter.get(
  "/media/:itemId/hls",
  resolveIdentity,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(getMediaPlaylist),
);
vaultRouter.get(
  "/media/:itemId/hls/:variant/playlist.m3u8",
  resolveIdentity,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(getMediaPlaylist),
);
vaultRouter.get(
  "/media/segment/:itemId/:segment",
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(getMediaSegment),
);
vaultRouter.post(
  "/license/:itemId",
  resolveIdentity,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(handleLicenseRequest),
); // NEW Secure License Server
vaultRouter.get(
  "/media/key/:itemId",
  keyRateLimit,
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(handleLicenseRequest),
); // Deprecated - mapped to License Server
vaultRouter.post("/media/events", requireAuth, asyncHandler(logPlaybackEvent));
vaultRouter.get("/media/insights", requireAuth, asyncHandler(getPlaybackInsights));
vaultRouter.post(
  "/media/drm/widevine/:itemId",
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(handleWidevineLicense),
);
vaultRouter.post(
  "/media/drm/fairplay/:itemId",
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(handleFairPlayLicense),
);
vaultRouter.get(
  "/media/drm/cenc/:itemId/:kid",
  validateRequest(vaultItemRouteParamsValidation),
  asyncHandler(getCencKey),
);

// Category Upserts
vaultRouter.post(
  "/files/multipart/start",
  requireAuth,
  multipartStartLimiter,
  validateRequest(multipartStartBodyValidation),
  asyncHandler(startMultipartUpload),
);
vaultRouter.put(
  "/files/multipart/:uploadId/part/:partNumber",
  requireAuth,
  multipartPartLimiter,
  validateRequest(multipartRouteParamsValidation),
  express.raw({ type: 'application/octet-stream', limit: multipartPartBodyLimitBytes }),
  asyncHandler(uploadMultipartPart),
);
vaultRouter.post(
  "/files/multipart/:uploadId/complete",
  requireAuth,
  multipartCompleteLimiter,
  validateRequest([...multipartRouteParamsValidation, ...multipartCompleteBodyValidation]),
  asyncHandler(completeMultipartUpload),
);
vaultRouter.post(
  "/files/:category",
  requireAuth,
  validateRequest(vaultCategoryRouteParamsValidation),
  uploadVaultFileMiddleware,
  asyncHandler(uploadVaultFile),
);
vaultRouter.post(
  "/:category",
  requireAuth,
  validateRequest(vaultCategoryRouteParamsValidation),
  asyncHandler(upsertVaultEntry),
);
vaultRouter.put(
  "/:category/:itemId",
  requireAuth,
  validateRequest([
    ...vaultCategoryRouteParamsValidation,
    ...vaultItemRouteParamsValidation,
  ]),
  asyncHandler(upsertVaultEntry),
);
vaultRouter.delete(
  "/:category/:itemId",
  requireAuth,
  validateRequest([
    ...vaultCategoryRouteParamsValidation,
    ...vaultItemRouteParamsValidation,
  ]),
  asyncHandler(deleteVaultEntry),
);

export const registerVaultRoutes = (app: express.Express): void => {
  app.use("/api/vault", vaultRouter);
};
