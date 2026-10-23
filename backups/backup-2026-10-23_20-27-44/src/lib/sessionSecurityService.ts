import { resolveApiBaseUrl } from './apiBaseUrl';
import {
  clearAuthToken,
  clearCloudSessionHint,
  clearRememberedVaultAccess,
  getAuthToken,
} from './auth-session';
import { logger } from './logger';

export const SESSION_REVOKED_EVENT = 'vault-session-revoked';
const BROADCAST_CHANNEL_NAME = 'vault_session_security';
const STORAGE_REVOKED_KEY = 'vault_session_revoked_at';
const HEARTBEAT_INTERVAL_MS = 15_000;

export interface SessionRevocationDetail {
  reason: string;
  sessionId?: string;
  timestamp: number;
}

let activeEventSource: EventSource | null = null;
let broadcastChannel: BroadcastChannel | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let isWatcherActive = false;
let isTerminating = false;

/**
 * Triggers complete instant lockdown across the client
 */
export const triggerSessionTermination = (
  reason = 'REVOKED_BY_SERVER',
  detail?: Partial<SessionRevocationDetail>,
) => {
  if (isTerminating) return;
  isTerminating = true;

  logger.warn('[SessionSecurity] Triggering session termination lockdown', { reason, detail });

  // 1. Broadcast to other tabs on the same browser
  try {
    if (broadcastChannel) {
      broadcastChannel.postMessage({ type: 'SESSION_REVOKED', reason, timestamp: Date.now() });
    }
  } catch {
    /* ignore */
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_REVOKED_KEY, String(Date.now()));
    }
  } catch {
    /* ignore */
  }

  // 2. Clear all authentication credentials
  clearAuthToken();
  clearCloudSessionHint();
  clearRememberedVaultAccess();

  // 3. Stop watcher connections
  stopSessionSecurityWatcher();

  // 4. Dispatch global window event for store and UI components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<SessionRevocationDetail>(SESSION_REVOKED_EVENT, {
        detail: {
          reason,
          sessionId: detail?.sessionId,
          timestamp: detail?.timestamp || Date.now(),
        },
      }),
    );
  }

  // Allow re-entry after full cleanup
  setTimeout(() => {
    isTerminating = false;
  }, 1000);
};

let lastCheckTime = 0;
let inFlightCheck: Promise<boolean> | null = null;

/**
 * Fast check against /api/auth/session-check to verify if session is still active
 */
export const checkSessionValidity = async (): Promise<boolean> => {
  const token = getAuthToken();
  if (!token) {
    return false;
  }

  const now = Date.now();
  if (inFlightCheck) {
    return inFlightCheck;
  }
  if (now - lastCheckTime < 3000) {
    return true;
  }

  lastCheckTime = now;
  inFlightCheck = (async () => {
    try {
      const baseUrl = resolveApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/auth/session-check`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        credentials: 'include',
      });

      if (response.status === 401 || response.status === 403) {
        const data = await response.json().catch(() => ({}));
        logger.warn('[SessionSecurity] Session validity check failed with unauthenticated status', {
          status: response.status,
          code: data?.error?.code,
        });
        triggerSessionTermination('REVOKED_BY_SERVER', {
          reason: data?.error?.code || 'SESSION_REVOKED',
        });
        return false;
      }

      return response.ok;
    } catch {
      // Non-blocking for offline/network blips
      return true;
    } finally {
      inFlightCheck = null;
    }
  })();

  return inFlightCheck;
};

/**
 * Handles incoming visibility / tab focus change
 */
const handleVisibilityOrFocusChange = () => {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    void checkSessionValidity();
  }
};

/**
 * Starts the real-time session security watcher (SSE + Heartbeat + Cross-Tab)
 */
export const startSessionSecurityWatcher = (token?: string | null) => {
  const authToken = token || getAuthToken();
  if (!authToken) {
    return;
  }
  if (isWatcherActive) {
    stopSessionSecurityWatcher();
  }

  isWatcherActive = true;
  isTerminating = false;

  const baseUrl = resolveApiBaseUrl();
  const streamUrl = `${baseUrl}/api/auth/stream/session?auth_token=${encodeURIComponent(authToken)}`;

  // 1. Establish SSE real-time connection
  try {
    if (typeof EventSource !== 'undefined') {
      activeEventSource = new EventSource(streamUrl, { withCredentials: true });

      activeEventSource.addEventListener('session_revoked', (event: MessageEvent) => {
        logger.warn(
          '[SessionSecurity] Received instant real-time session_revoked event from server',
          {
            data: String(event.data),
          },
        );
        let parsedData: any = {};
        try {
          parsedData = JSON.parse(event.data);
        } catch {
          /* ignore */
        }
        triggerSessionTermination('REVOKED_BY_ANOTHER_DEVICE', {
          sessionId: parsedData?.sessionId,
          reason: parsedData?.reason || 'REVOKED_BY_USER',
          timestamp: parsedData?.timestamp || Date.now(),
        });
      });

      activeEventSource.onerror = () => {
        // SSE handles reconnection automatically. If unauthenticated, server returns 401.
        // We do a quick session check to confirm if it failed due to revocation.
        void checkSessionValidity();
      };
    }
  } catch (err) {
    logger.warn('[SessionSecurity] Failed to initialize SSE stream', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Cross-Tab Sync via BroadcastChannel
  try {
    if (typeof BroadcastChannel !== 'undefined' && !broadcastChannel) {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === 'SESSION_REVOKED') {
          logger.warn('[SessionSecurity] Received revocation signal from peer tab', {
            data: event.data,
          });
          triggerSessionTermination('REVOKED_BY_ANOTHER_TAB', {
            reason: event.data?.reason,
            timestamp: event.data?.timestamp,
          });
        }
      };
    }
  } catch {
    /* BroadcastChannel not supported */
  }

  // 3. Cross-Tab Sync via LocalStorage Event
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
    window.addEventListener('focus', handleVisibilityOrFocusChange);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityOrFocusChange);
  }

  // 4. Periodic Heartbeat Polling (15s)
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      void checkSessionValidity();
    }, HEARTBEAT_INTERVAL_MS);
  }
};

const handleStorageEvent = (event: StorageEvent) => {
  if (event.key === STORAGE_REVOKED_KEY && event.newValue) {
    triggerSessionTermination('REVOKED_BY_STORAGE_SYNC');
  }
};

/**
 * Stops all real-time session watchers and cleans up listeners
 */
export const stopSessionSecurityWatcher = () => {
  isWatcherActive = false;
  isTerminating = false;

  if (activeEventSource) {
    try {
      activeEventSource.close();
    } catch {
      /* ignore */
    }
    activeEventSource = null;
  }

  if (broadcastChannel) {
    try {
      broadcastChannel.close();
    } catch {
      /* ignore */
    }
    broadcastChannel = null;
  }

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  if (typeof window !== 'undefined') {
    window.removeEventListener('storage', handleStorageEvent);
    window.removeEventListener('focus', handleVisibilityOrFocusChange);
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityOrFocusChange);
  }
};
