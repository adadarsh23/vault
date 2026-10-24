import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from './utils/auth.ts';
import { isAllowedCorsOrigin } from './utils/cors.ts';
import { User } from './models/user.ts';

let io: Server | null = null;

const getTokenFromSocket = (socket: Socket): string | null => {
  const authToken = socket.handshake.auth.token;
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken;
  }

  const header = socket.handshake.headers.authorization;
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
};

export const registerSocketHandlers = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedCorsOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('Origin is not allowed by CORS.'));
      },
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    try {
      const token = getTokenFromSocket(socket);
      if (!token) {
        return next(new Error('Missing socket token.'));
      }

      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub).select('sessions').lean().exec();
      const activeSession = user?.sessions?.find(
        (session) =>
          session.sessionId === payload.sessionId &&
          !session.revokedAt &&
          session.expiresAt instanceof Date &&
          session.expiresAt.getTime() > Date.now(),
      );

      if (!activeSession) {
        return next(new Error('Session revoked.'));
      }

      socket.data.userId = payload.sub;
      socket.data.username = payload.username;
      socket.data.sessionId = payload.sessionId;
      return next();
    } catch (error) {
      return next(new Error(error instanceof Error ? error.message : 'Unauthorized socket.'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    if (socket.data.sessionId) {
      socket.join(`session:${socket.data.sessionId}`);
    }
    socket.emit('vault:connected', {
      userId: socket.data.userId,
      connectedAt: new Date().toISOString(),
    });
  });

  return io;
};

export const emitVaultEvent = (userId: string, event: string, payload: unknown): void => {
  io?.to(`user:${userId}`).emit(event, payload);
};

export const revokeSocketSessions = (
  userId: string,
  sessionIds: string[],
  reason = 'REVOKED_BY_USER',
): void => {
  if (!io || !sessionIds.length) return;

  for (const sessionId of sessionIds) {
    const sessionRoom = `session:${sessionId}`;
    io.to(sessionRoom).emit('vault:session_revoked', {
      sessionId,
      reason,
      timestamp: Date.now(),
    });
  }

  // Disconnect all sockets belonging to the revoked sessions
  const revokedSet = new Set(sessionIds);
  const sockets = io.sockets?.sockets;
  if (sockets) {
    for (const socket of sockets.values()) {
      if (
        socket.data.userId === userId &&
        socket.data.sessionId &&
        revokedSet.has(socket.data.sessionId)
      ) {
        socket.disconnect(true);
      }
    }
  }
};
