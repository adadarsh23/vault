import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.ts';
import { requireAuth } from '../middleware/authMiddleware.ts';

const router = express.Router();
const LOG_FILE = path.resolve(process.cwd(), 'logs/server.jsonl');

function readLastLines(filePath: string, maxLines: number): string[] {
  if (!fs.existsSync(filePath)) return [];
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  const bufferSize = 4096;
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
 * @desc Get system logs with pagination
 * @access Private
 */
router.get('/logs', requireAuth, (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const cursorStr = req.query.cursor as string | undefined;
    const offset = cursorStr ? parseInt(cursorStr) : 0;

    // Read last (offset + limit + 1) lines from the file to check if hasMore
    const maxToRead = offset + limit + 1;
    const rawLines = readLastLines(LOG_FILE, maxToRead);

    const parsedLogs: any[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      try {
        const parsed = JSON.parse(rawLines[i]);
        parsed.id = parsed.id || `${parsed.timestamp}-${parsed.message}-${offset + i}`;
        parsedLogs.push(parsed);
      } catch {
        // Skip invalid lines
      }
    }

    const pageLogs = parsedLogs.slice(offset, offset + limit);
    const hasMore = parsedLogs.length > offset + limit;
    const nextCursor = hasMore ? String(offset + limit) : null;

    res.json({
      success: true,
      logs: pageLogs,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    console.error('Error fetching system logs:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve logs' });
  }
});

/**
 * @route POST /api/system/logs/clear
 * @desc Clear logs
 * @access Private
 */
router.post('/logs/clear', requireAuth, (_req, res) => {
  try {
    logger.clearLogs();
    res.json({ success: true, message: 'Logs cleared successfully' });
  } catch (error) {
    console.error('Error clearing system logs:', error);
    res.status(500).json({ success: false, message: 'Failed to clear logs' });
  }
});

export { router as systemRouter };
