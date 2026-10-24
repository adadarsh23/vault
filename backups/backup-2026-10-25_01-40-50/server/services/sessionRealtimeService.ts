import type { Response } from 'express';
import { logger } from '../utils/logger.ts';

interface ActiveStreamClient {
  sessionId: string;
  res: Response;
  connectedAt: number;
}

class SessionRealtimeService {
  // Map: userId -> Set of ActiveStreamClient
  private activeStreams = new Map<string, Set<ActiveStreamClient>>();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  private startHeartbeat() {
    // Send lightweight comment keep-alive every 20 seconds to prevent proxy timeouts
    this.heartbeatTimer = setInterval(() => {
      this.broadcastHeartbeat();
    }, 20_000);
    // Unref so it doesn't block process exit during tests/shutdown
    this.heartbeatTimer.unref?.();
  }

  private broadcastHeartbeat() {
    for (const [userId, clients] of this.activeStreams.entries()) {
      for (const client of Array.from(clients)) {
        try {
          if (client.res.writableEnded || client.res.destroyed) {
            clients.delete(client);
            continue;
          }
          client.res.write(': ping\n\n');
        } catch {
          clients.delete(client);
        }
      }
      if (clients.size === 0) {
        this.activeStreams.delete(userId);
      }
    }
  }

  /**
   * Registers an active SSE connection for a user's session
   */
  public registerSessionStream(userId: string, sessionId: string, res: Response): void {
    if (!userId || !sessionId || res.writableEnded) {
      return;
    }

    let clients = this.activeStreams.get(userId);
    if (!clients) {
      clients = new Set<ActiveStreamClient>();
      this.activeStreams.set(userId, clients);
    }

    const client: ActiveStreamClient = {
      sessionId,
      res,
      connectedAt: Date.now(),
    };

    clients.add(client);

    logger.info('[SessionRealtime] Client registered SSE stream', {
      userId,
      sessionId,
      totalActiveStreamsForUser: clients.size,
    });

    // Handle client disconnect / socket close
    const cleanup = () => {
      const userClients = this.activeStreams.get(userId);
      if (userClients) {
        userClients.delete(client);
        if (userClients.size === 0) {
          this.activeStreams.delete(userId);
        }
      }
    };

    res.on('close', cleanup);
    res.on('finish', cleanup);
    res.on('error', cleanup);
  }

  /**
   * Immediately pushes a session_revoked event to matching active SSE streams and closes them
   */
  public notifySessionRevoked(
    userId: string,
    revokedSessionIds: string[],
    reason = 'REVOKED_BY_USER',
  ): number {
    if (!userId || !revokedSessionIds.length) {
      return 0;
    }

    const clients = this.activeStreams.get(userId);
    if (!clients || clients.size === 0) {
      return 0;
    }

    const revokedSet = new Set(revokedSessionIds);
    let notifiedCount = 0;

    for (const client of Array.from(clients)) {
      if (revokedSet.has(client.sessionId)) {
        try {
          if (!client.res.writableEnded && !client.res.destroyed) {
            const payload = JSON.stringify({
              event: 'session_revoked',
              sessionId: client.sessionId,
              reason,
              timestamp: Date.now(),
            });

            client.res.write(`event: session_revoked\ndata: ${payload}\n\n`);
            client.res.end();
            notifiedCount += 1;
          }
        } catch (error) {
          logger.warn('[SessionRealtime] Failed to send revocation event to client', {
            userId,
            sessionId: client.sessionId,
            error,
          });
        } finally {
          clients.delete(client);
        }
      }
    }

    if (clients.size === 0) {
      this.activeStreams.delete(userId);
    }

    logger.info('[SessionRealtime] Dispatched revocation event', {
      userId,
      revokedSessionIds,
      notifiedCount,
      reason,
    });

    return notifiedCount;
  }

  /**
   * Cleanup on server shutdown
   */
  public destroy() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const clients of this.activeStreams.values()) {
      for (const client of clients) {
        try {
          client.res.end();
        } catch {
          /* ignore */
        }
      }
    }
    this.activeStreams.clear();
  }
}

export const sessionRealtimeService = new SessionRealtimeService();
