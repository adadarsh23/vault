import { create } from 'zustand';
import apiClient from '../api/apiClient';

let pendingNotificationFetch: Promise<void> | null = null;

export interface Notification {
  _id: string;
  type: 'device_login' | 'sync_conflict' | 'security_alert' | 'vault_backup' | 'system' | string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  isRead: boolean;
  createdAt: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id?: string) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearNotifications: () => Promise<void>;
  addNotification: (notification: Notification) => void;
  resetStore: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: () => {
    if (pendingNotificationFetch) return pendingNotificationFetch;

    pendingNotificationFetch = (async () => {
      set({ loading: true });
      try {
        const { data } = await apiClient.get<any>('/notifications', { timeout: 15000 });
        if (data && data.success) {
          const notifications = data.data || [];
          const unreadCount = notifications.filter((n: any) => !n.isRead).length;
          set({ notifications, unreadCount, loading: false });
        } else {
          set({ loading: false });
        }
      } catch (error: any) {
        const isTimeoutOrNetwork =
          error?.code === 'NETWORK_ERROR' ||
          error?.code === 'ECONNABORTED' ||
          error?.code === 'HTTP_503' ||
          error?.status === 503 ||
          error?.status === undefined ||
          (typeof error?.message === 'string' &&
            (error.message.toLowerCase().includes('timeout') ||
              error.message.includes('503') ||
              error.message.toLowerCase().includes('network'))) ||
          error?.response?.status === 503 ||
          error?.response?.data?.error?.code === 'SERVER_OVERLOADED';

        if (isTimeoutOrNetwork) {
          console.warn(
            'Notification fetch deferred (service temporarily unavailable or network waking up).',
          );
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

  markAsRead: async (id) => {
    // Optimistic update
    const currentList = get().notifications;
    const updatedList = id
      ? currentList.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      : currentList.map((n) => ({ ...n, isRead: true }));
    const unreadCount = updatedList.filter((n) => !n.isRead).length;
    set({ notifications: updatedList, unreadCount });

    try {
      await apiClient.post<any>('/notifications/read', { id });
    } catch (error) {
      console.error('Failed to mark notification(s) as read:', error);
    }
  },

  deleteNotification: async (id: string) => {
    // Optimistic update
    const currentList = get().notifications;
    const updatedList = currentList.filter((n) => n._id !== id);
    const unreadCount = updatedList.filter((n) => !n.isRead).length;
    set({ notifications: updatedList, unreadCount });

    try {
      await apiClient.delete<any>(`/notifications/${id}`).catch(() => {
        // Fallback endpoint
        return apiClient.post<any>('/notifications/delete', { id });
      });
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  },

  clearNotifications: async () => {
    // Optimistic update
    set({ notifications: [], unreadCount: 0 });
    try {
      await apiClient.post<any>('/notifications/clear');
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  },

  addNotification: (newNotif) => {
    const currentList = get().notifications;
    // Avoid duplicate insertions
    if (currentList.some((n) => n._id === newNotif._id)) return;
    const notifications = [newNotif, ...currentList];
    const unreadCount = notifications.filter((n) => !n.isRead).length;
    set({ notifications, unreadCount });
  },

  resetStore: () => {
    set({ notifications: [], unreadCount: 0, loading: false });
  },
}));
