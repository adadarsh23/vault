import { create } from 'zustand';
import apiClient from '../api/apiClient';
import { getAuthToken } from '../lib/auth-session';

let pendingNotificationFetch: Promise<void> | null = null;
let rateLimitBackoffUntil = 0;
let lastNotificationFetchTime = 0;

export interface Notification {
  _id: string;
  type: 'device_login' | 'sync_conflict' | 'security_alert' | 'vault_backup' | 'system' | string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id?: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearNotifications: () => Promise<void>;
  addNotification: (
    notification: Partial<Notification> & { title: string; message: string },
  ) => void;
  resetStore: () => void;
}

const normalizeNotification = (
  raw: Partial<Notification> & { title: string; message: string },
): Notification => {
  const rawAny = raw as Record<string, unknown>;
  const resolvedId =
    (typeof rawAny._id === 'string' && rawAny._id.trim()) ||
    (typeof rawAny.id === 'string' && rawAny.id.trim()) ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  return {
    _id: resolvedId,
    type: typeof raw.type === 'string' && raw.type.trim() ? raw.type.trim() : 'system',
    title: typeof raw.title === 'string' ? raw.title.trim() : 'Notification',
    message: typeof raw.message === 'string' ? raw.message.trim() : '',
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : undefined,
    isRead: Boolean(raw.isRead),
    createdAt:
      typeof raw.createdAt === 'string' && raw.createdAt.trim()
        ? raw.createdAt
        : new Date().toISOString(),
  };
};

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: () => {
    if (pendingNotificationFetch) return pendingNotificationFetch;

    // Fast-path: do not attempt to fetch notifications if not authenticated
    const token = getAuthToken();
    if (!token) {
      return Promise.resolve();
    }

    const now = Date.now();
    if (now < rateLimitBackoffUntil) {
      return Promise.resolve();
    }
    if (now - lastNotificationFetchTime < 5000) {
      return Promise.resolve();
    }

    pendingNotificationFetch = (async () => {
      set({ loading: true });
      try {
        lastNotificationFetchTime = Date.now();
        const { data } = await apiClient.get<any>('/notifications', { timeout: 15000 });
        if (data && data.success && Array.isArray(data.data)) {
          const notifications = data.data;
          const unreadCount = notifications.filter((n: any) => !n.isRead).length;
          set({ notifications, unreadCount, loading: false });
        } else {
          set({ loading: false });
        }
      } catch (error: any) {
        const status = error?.status ?? error?.response?.status;
        const code = error?.code ?? error?.response?.data?.error?.code;
        const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';

        const isAuthError =
          status === 401 ||
          code === 'AUTH_REQUIRED' ||
          code === 'TOKEN_EXPIRED' ||
          code === 'SESSION_REVOKED';

        const isRateLimited =
          status === 429 ||
          code === 'TOO_MANY_REQUESTS' ||
          code === 'HTTP_429' ||
          message.includes('too many requests') ||
          message.includes('rate limit');

        const isTransient =
          isRateLimited ||
          status === 503 ||
          status === 502 ||
          status === 504 ||
          code === 'HTTP_503' ||
          code === 'HTTP_502' ||
          code === 'HTTP_504' ||
          code === 'NETWORK_ERROR' ||
          code === 'ECONNABORTED' ||
          code === 'SERVER_OVERLOADED' ||
          code === 'DB_UNAVAILABLE' ||
          code === 'SERVICE_UNAVAILABLE' ||
          message.includes('timeout') ||
          message.includes('network') ||
          message.includes('aborted');

        if (isAuthError) {
          // Unauthenticated or expired session, cleanly reset loading without warning
          set({ loading: false });
          return;
        }

        if (isRateLimited) {
          rateLimitBackoffUntil = Date.now() + 30000;
          if (import.meta.env.DEV) {
            console.debug('Notification fetch deferred (rate limit active). Backing off for 30s.');
          }
        } else if (isTransient) {
          // Defer quietly during transient outages / service reconnection without noisy console warnings
          if (import.meta.env.DEV) {
            console.debug(
              'Notification fetch deferred (service temporarily unavailable or network waking up).',
            );
          }
        } else {
          console.error('Failed to fetch notifications:', error);
        }
        set({ loading: false });
      }
    })().finally(() => {
      pendingNotificationFetch = null;
    });

    return pendingNotificationFetch;
  },

  markAsRead: async (id?: string) => {
    // Optimistic update
    const currentList = get().notifications;
    const targetId = typeof id === 'string' && id.trim() ? id.trim() : undefined;
    const updatedList = targetId
      ? currentList.map((n) => (n._id === targetId ? { ...n, isRead: true } : n))
      : currentList.map((n) => ({ ...n, isRead: true }));
    const unreadCount = updatedList.filter((n) => !n.isRead).length;
    set({ notifications: updatedList, unreadCount });

    try {
      await apiClient.post<any>('/notifications/read', targetId ? { id: targetId } : {});
    } catch (error) {
      console.error('Failed to mark notification(s) as read:', error);
    }
  },

  markAllAsRead: async () => {
    await get().markAsRead();
  },

  deleteNotification: async (id: string) => {
    if (!id || typeof id !== 'string') return;
    const targetId = id.trim();
    // Optimistic update
    const currentList = get().notifications;
    const updatedList = currentList.filter((n) => n._id !== targetId);
    const unreadCount = updatedList.filter((n) => !n.isRead).length;
    set({ notifications: updatedList, unreadCount });

    try {
      await apiClient.delete<any>(`/notifications/${targetId}`).catch(() => {
        // Fallback endpoint
        return apiClient.post<any>('/notifications/delete', { id: targetId });
      });
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  },

  clearNotifications: async () => {
    const previousNotifications = get().notifications;
    const previousUnread = get().unreadCount;
    // Optimistic update
    set({ notifications: [], unreadCount: 0 });
    try {
      await apiClient.post<any>('/notifications/clear');
    } catch (error) {
      console.error('Failed to clear notifications:', error);
      // Revert if request failed
      set({ notifications: previousNotifications, unreadCount: previousUnread });
    }
  },

  addNotification: (rawNotif) => {
    if (!rawNotif || typeof rawNotif !== 'object') return;
    const normalized = normalizeNotification(rawNotif);
    const currentList = get().notifications;
    // Avoid duplicate insertions
    if (currentList.some((n) => n._id === normalized._id)) return;
    const notifications = [normalized, ...currentList];
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    set({ notifications, unreadCount });
  },

  resetStore: () => {
    set({ notifications: [], unreadCount: 0, loading: false });
  },
}));
