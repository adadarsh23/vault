import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.ts';
import { requireAuth } from '../middleware/authMiddleware.ts';
import { getUserActivityLogs, deleteUserActivityLogs } from '../services/activityLogService.ts';

const router = express.Router();
const LOG_FILE = path.resolve(process.cwd(), 'logs/server.jsonl');

// Per-user clear log timestamps to ensure user independence when clearing logs
const userClearedTimestamps = new Map<string, number>();

function readLastLines(filePath: string, maxLines: number): string[] {
  if (!fs.existsSync(filePath)) return [];
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  const bufferSize = 8192;
  const buffer = Buffer.alloc(bufferSize);
  let lineCount = 0;
  let filePosition = stat.size;
  let leftover = '';
  const lines: string[] = [];

  try {
    while (filePosition > 0 && lineCount < maxLines) {
      const readSize = Math.min(bufferSize, filePosition);
      filePosition -= readSize;
      fs.readSync(fd, buffer, 0, readSize, filePosition);
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
  } catch (error) {
    console.error('Error reading log file backward:', error);
  } finally {
    fs.closeSync(fd);
  }
  return lines;
}

/**
 * @route GET /api/system/logs
 * @desc Get system & activity logs strictly isolated for the authenticated user
 * @access Private
 */
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const username = (req as any).user?.username || 'user';
    const limit = parseInt(req.query.limit as string) || 50;
    const cursorStr = req.query.cursor as string | undefined;
    const offset = cursorStr ? parseInt(cursorStr) : 0;

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
    const rawLines = readLastLines(LOG_FILE, maxToRead);

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
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
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
  } catch (error) {
    console.error('Error fetching system logs:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve user logs' });
  }
});

/**
 * @route POST /api/system/logs/clear
 * @desc Clear logs strictly for the requesting user
 * @access Private
 */
router.post('/logs/clear', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).user?.userId;
    const username = (req as any).user?.username || 'user';

    if (userId) {
      userClearedTimestamps.set(userId, Date.now());
      await deleteUserActivityLogs(userId, username).catch((err) => {
        logger.warn('[SystemRoutes] Could not delete activity logs:', err);
      });
    }

    res.json({ success: true, message: 'Your system logs cleared successfully' });
  } catch (error) {
    console.error('Error clearing system logs:', error);
    res.status(500).json({ success: false, message: 'Failed to clear user logs' });
  }
});

export { router as systemRouter };
