import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger.ts';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { requireTrustedBrowserOrigin } from '../middleware/csrfOriginMiddleware.ts';
import { getUserActivityLogs, deleteUserActivityLogs } from '../services/activityLogService.ts';
import { asyncHandler } from '../utils/asyncHandler.ts';
import { getClientIp } from '../utils/requestIp.ts';

const router = express.Router();
const LOG_FILE = path.resolve(process.cwd(), 'logs/server.jsonl');

const systemLogsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${getClientIp(req)}:${(req as any)?.user?.userId || 'anon'}:system-logs`,
  message: {
    success: false,
    message: 'Too many log requests. Please slow down.',
    error: { code: 'TOO_MANY_LOG_REQUESTS' },
  },
});

// Prevent browser/proxy caching of system and activity logs
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

router.use(requireAuth);
router.use(systemLogsLimiter);

// Per-user clear log timestamps to ensure user independence when clearing logs
const userClearedTimestamps = new Map<string, number>();

async function readLastLines(filePath: string, maxLines: number): Promise<string[]> {
  let fileHandle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    const stat = await fs.stat(filePath);
    fileHandle = await fs.open(filePath, 'r');
    const fileSize = stat.size;
    const bufferSize = 8192;
    const buffer = Buffer.alloc(bufferSize);
    let lineCount = 0;
    let filePosition = fileSize;
    let leftover = '';
    const lines: string[] = [];

    while (filePosition > 0 && lineCount < maxLines) {
      const readSize = Math.min(bufferSize, filePosition);
      filePosition -= readSize;
      await fileHandle.read(buffer, 0, readSize, filePosition);
      const chunk = buffer.toString('utf8', 0, readSize) + leftover;
      const chunkLines = chunk.split('\n');
      leftover = chunkLines.shift() || '';

      for (let i = chunkLines.length - 1; i >= 0; i--) {
        if (chunkLines[i].trim()) {
          lines.push(chunkLines[i]);
          lineCount++;
          if (lineCount >= maxLines) break;
        }
      }
    }
    if (leftover.trim() && lineCount < maxLines) {
      lines.push(leftover);
    }
    return lines;
  } catch (error) {
    console.error('Error reading log file backward:', error);
    return [];
  } finally {
    await fileHandle?.close();
  }
}

/**
 * @route GET /api/system/logs
 * @desc Get system & activity logs strictly isolated for the authenticated user
 * @access Private
 */
router.get(
  '/logs',
  asyncHandler(async (req, res) => {
    const userId = (req as any).user?.userId;
    const username = (req as any).user?.username || 'user';
    const rawLimit = Number.parseInt(req.query.limit as string, 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;
    const cursorStr = req.query.cursor as string | undefined;
    const rawOffset = cursorStr ? Number.parseInt(cursorStr, 10) : 0;
    const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    const clearedAt = userClearedTimestamps.get(userId) || 0;

    // 1. Fetch user-specific encrypted activity logs
    let mappedActivityLogs: any[] = [];
    try {
      const activityLogs = await getUserActivityLogs(userId, username, 200, 0);
      mappedActivityLogs = activityLogs
        .filter((a) => new Date(a.timestamp).getTime() > clearedAt)
        .map((a) => ({
          id: `act-${a._id}`,
          level: (a.status === 'FAILURE' ? 'warn' : 'info') as 'info' | 'warn' | 'error',
          message: `[User Activity] ${a.action} - ${a.category}`,
          timestamp: new Date(a.timestamp).toISOString(),
          meta: {
            device: a.device,
            ipAddress: a.ipAddress,
            status: a.status,
            ...(a.details || {}),
          },
        }));
    } catch (actErr) {
      logger.warn('[SystemRoutes] Could not fetch user activity logs:', actErr);
    }

    // 2. Read system server log file and filter strictly for this user
    const maxToRead = Math.max(offset + limit + 200, 500);
    const rawLines = await readLastLines(LOG_FILE, maxToRead);

    const parsedSystemLogs: any[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      try {
        const parsed = JSON.parse(rawLines[i]);
        const logTime = new Date(parsed.timestamp).getTime();

        // Skip logs prior to user clearing their logs
        if (logTime <= clearedAt) continue;

        const metaUser = parsed.meta?.userId || parsed.meta?.user || parsed.meta?.username;

        // Strict User Isolation: Exclude logs that do not belong to this user
        if (
          !metaUser ||
          (String(metaUser) !== String(userId) && String(metaUser) !== String(username))
        ) {
          continue;
        }

        parsed.id = parsed.id || `sys-${parsed.timestamp}-${i}`;
        parsedSystemLogs.push(parsed);
      } catch {
        // Skip malformed log lines
      }
    }

    // 3. Merge logs, deduplicate, sort descending (newest first)
    const combinedMap = new Map<string, any>();
    [...mappedActivityLogs, ...parsedSystemLogs].forEach((item) => {
      combinedMap.set(item.id, item);
    });

    const allUserLogs = Array.from(combinedMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const pageLogs = allUserLogs.slice(offset, offset + limit);
    const hasMore = allUserLogs.length > offset + limit;
    const nextCursor = hasMore ? String(offset + limit) : null;

    res.json({
      success: true,
      logs: pageLogs,
      hasMore,
      nextCursor,
    });
  }),
);

/**
 * @route POST /api/system/logs/clear
 * @desc Clear logs strictly for the requesting user
 * @access Private
 */
router.post(
  '/logs/clear',
  requireTrustedBrowserOrigin,
  asyncHandler(async (req, res) => {
    const userId = (req as any).user?.userId;
    const username = (req as any).user?.username || 'user';

    if (userId) {
      userClearedTimestamps.set(userId, Date.now());
      await deleteUserActivityLogs(userId, username).catch((err) => {
        logger.warn('[SystemRoutes] Could not delete activity logs:', err);
      });
    }

    res.json({ success: true, message: 'Your system logs cleared successfully' });
  }),
);

export { router as systemRouter };
