import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNotificationStore } from '../../src/store/notificationStore';
import apiClient from '../../src/api/apiClient';

vi.mock('../../src/api/apiClient', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

describe('useNotificationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationStore.getState().resetStore();
  });

  it('initializes with default empty state', () => {
    const { notifications, unreadCount, loading } = useNotificationStore.getState();
    expect(notifications).toEqual([]);
    expect(unreadCount).toBe(0);
    expect(loading).toBe(false);
  });

  it('adds and normalizes notifications properly', () => {
    useNotificationStore.getState().addNotification({
      title: 'Security Alert',
      message: 'New login detected',
      type: 'device_login',
    });

    const { notifications, unreadCount } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe('Security Alert');
    expect(notifications[0].isRead).toBe(false);
    expect(notifications[0]._id).toBeDefined();
    expect(unreadCount).toBe(1);
  });

  it('prevents duplicate notifications with identical id', () => {
    useNotificationStore.getState().addNotification({
      _id: 'notif-1',
      title: 'Alert 1',
      message: 'Message 1',
    });

    useNotificationStore.getState().addNotification({
      _id: 'notif-1',
      title: 'Alert 1 Duplicate',
      message: 'Message 1 Duplicate',
    });

    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe('Alert 1');
  });

  it('marks a single notification as read optimistically', async () => {
    useNotificationStore.getState().addNotification({
      _id: 'notif-1',
      title: 'Alert',
      message: 'Msg',
    });

    expect(useNotificationStore.getState().unreadCount).toBe(1);

    await useNotificationStore.getState().markAsRead('notif-1');

    const { notifications, unreadCount } = useNotificationStore.getState();
    expect(notifications[0].isRead).toBe(true);
    expect(unreadCount).toBe(0);
    expect(apiClient.post).toHaveBeenCalledWith('/notifications/read', { id: 'notif-1' });
  });

  it('marks all notifications as read', async () => {
    useNotificationStore.getState().addNotification({ _id: 'n1', title: '1', message: 'm1' });
    useNotificationStore.getState().addNotification({ _id: 'n2', title: '2', message: 'm2' });

    expect(useNotificationStore.getState().unreadCount).toBe(2);

    await useNotificationStore.getState().markAllAsRead();

    const { notifications, unreadCount } = useNotificationStore.getState();
    expect(unreadCount).toBe(0);
    expect(notifications.every((n) => n.isRead)).toBe(true);
    expect(apiClient.post).toHaveBeenCalledWith('/notifications/read', {});
  });

  it('deletes a notification optimistically', async () => {
    useNotificationStore.getState().addNotification({ _id: 'n1', title: '1', message: 'm1' });
    useNotificationStore.getState().addNotification({ _id: 'n2', title: '2', message: 'm2' });

    await useNotificationStore.getState().deleteNotification('n1');

    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]._id).toBe('n2');
  });

  it('clears all notifications and rolls back on failure', async () => {
    useNotificationStore.getState().addNotification({ _id: 'n1', title: '1', message: 'm1' });

    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Network error'));

    await useNotificationStore.getState().clearNotifications();

    const { notifications } = useNotificationStore.getState();
    // Rollback restored previous state
    expect(notifications).toHaveLength(1);
    expect(notifications[0]._id).toBe('n1');
  });

  it('skips fetchNotifications when user is not authenticated', async () => {
    await useNotificationStore.getState().fetchNotifications();
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
