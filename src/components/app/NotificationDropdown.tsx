import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Laptop,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Check,
  CheckCheck,
  Database,
  Info,
  X,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { useNotificationStore } from '../../store/notificationStore';
import { cn } from '../../lib/utils';
import { logger } from '../../lib/logger';

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'Recently';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Recently';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 45) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}

function getNotificationIcon(type: string) {
  switch (type) {
    case 'device_login':
      return (
        <div className="h-7 w-7 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center shrink-0">
          <Laptop className="h-3.5 w-3.5 text-blue-400" />
        </div>
      );
    case 'sync_conflict':
      return (
        <div className="h-7 w-7 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0">
          <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
        </div>
      );
    case 'security_alert':
      return (
        <div className="h-7 w-7 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center justify-center shrink-0">
          <ShieldAlert className="h-3.5 w-3.5 text-red-400" />
        </div>
      );
    case 'vault_backup':
      return (
        <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0">
          <Database className="h-3.5 w-3.5 text-emerald-400" />
        </div>
      );
    default:
      return (
        <div className="h-7 w-7 rounded-lg bg-purple-500/10 border border-purple-500/25 flex items-center justify-center shrink-0">
          <Info className="h-3.5 w-3.5 text-purple-400" />
        </div>
      );
  }
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ isOpen, onClose }) => {
  const { notifications, unreadCount, markAsRead, deleteNotification, clearNotifications } =
    useNotificationStore();

  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside or Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Delay attaching listener so opening click doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown);
    }, 10);

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleSafeMarkAsRead = useCallback(
    async (id?: string) => {
      try {
        setActionInProgress(id ?? 'all');
        await markAsRead(id);
      } catch (err) {
        logger.warn('Failed to mark notification as read', { error: err });
      } finally {
        setActionInProgress(null);
      }
    },
    [markAsRead],
  );

  const handleSafeDelete = useCallback(
    async (id: string) => {
      try {
        setActionInProgress(id);
        await deleteNotification(id);
      } catch (err) {
        logger.warn('Failed to delete notification', { error: err });
      } finally {
        setActionInProgress(null);
      }
    },
    [deleteNotification],
  );

  const handleSafeClearAll = useCallback(async () => {
    try {
      setActionInProgress('clear-all');
      await clearNotifications();
    } catch (err) {
      logger.warn('Failed to clear notifications', { error: err });
    } finally {
      setActionInProgress(null);
    }
  }, [clearNotifications]);

  const filteredNotifications = useMemo(() => {
    if (!Array.isArray(notifications)) return [];
    return activeTab === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;
  }, [activeTab, notifications]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="notifications-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            ref={dropdownRef}
            key="notifications-dropdown"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-16 left-3 right-3 sm:absolute sm:top-full sm:left-auto sm:right-0 sm:w-96 mt-2.5 z-[100] max-h-[min(80dvh,520px)] flex flex-col rounded-2xl border border-card-border/80 bg-bg/95 backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.6)] overflow-hidden text-text"
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex flex-col bg-card-bg/40 backdrop-blur-md border-b border-card-border/50">
              <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold tracking-wide uppercase text-text/90">
                    Notifications
                  </span>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-extrabold">
                      {unreadCount}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      disabled={actionInProgress === 'all'}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleSafeMarkAsRead();
                      }}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors px-1.5 py-0.5 rounded hover:bg-emerald-500/10 disabled:opacity-50"
                      title="Mark all as read"
                    >
                      {actionInProgress === 'all' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCheck className="h-3 w-3" />
                      )}
                      <span>Mark All</span>
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      disabled={actionInProgress === 'clear-all'}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleSafeClearAll();
                      }}
                      className="text-[10px] text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors px-1.5 py-0.5 rounded hover:bg-red-500/10 disabled:opacity-50"
                      title="Clear all notifications"
                    >
                      {actionInProgress === 'clear-all' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                    }}
                    className="p-1 rounded-lg text-text/50 hover:text-text hover:bg-text/10 transition-colors ml-0.5 cursor-pointer"
                    title="Close notifications"
                    aria-label="Close notifications"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Tab Filter */}
              <div className="flex items-center gap-2 px-4 pb-2 pt-1 text-[11px]">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab('all');
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer',
                    activeTab === 'all'
                      ? 'bg-text/15 text-text font-semibold shadow-sm'
                      : 'text-text/50 hover:text-text hover:bg-text/5',
                  )}
                >
                  All ({notifications.length})
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab('unread');
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5',
                    activeTab === 'unread'
                      ? 'bg-text/15 text-text font-semibold shadow-sm'
                      : 'text-text/50 hover:text-text hover:bg-text/5',
                  )}
                >
                  Unread ({unreadCount})
                </button>
              </div>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto divide-y divide-card-border/30 max-h-[380px] custom-scrollbar">
              {filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-text/40">
                  {activeTab === 'unread' ? (
                    <>
                      <Sparkles className="h-9 w-9 mb-2 opacity-30 text-emerald-400 animate-pulse" />
                      <p className="text-xs font-medium text-text/60">You're all caught up!</p>
                      <p className="text-[11px] text-text/35 mt-0.5">
                        No unread notifications right now.
                      </p>
                    </>
                  ) : (
                    <>
                      <Bell className="h-9 w-9 mb-2 opacity-30 text-text/40" />
                      <p className="text-xs font-medium text-text/60">No notifications yet</p>
                      <p className="text-[11px] text-text/35 mt-0.5">
                        Security alerts & updates will show up here.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                filteredNotifications.map((notification) => (
                  <div
                    key={notification._id}
                    className={cn(
                      'group relative p-3.5 flex gap-3 transition-all cursor-pointer hover:bg-text/[0.04] active:bg-text/[0.07]',
                      !notification.isRead ? 'bg-emerald-500/[0.04]' : '',
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!notification.isRead) {
                        void handleSafeMarkAsRead(notification._id);
                      }
                    }}
                  >
                    {getNotificationIcon(notification.type)}

                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={cn(
                            'text-xs font-semibold truncate',
                            !notification.isRead ? 'text-text' : 'text-text/75',
                          )}
                        >
                          {notification.title}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] text-text/40 font-mono">
                            {formatRelativeTime(notification.createdAt)}
                          </span>
                          {!notification.isRead && (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                          )}
                        </div>
                      </div>

                      <p className="text-[11px] text-text/55 mt-0.5 leading-relaxed line-clamp-2">
                        {notification.message}
                      </p>
                    </div>

                    {/* Quick Item Actions (visible on mobile/tablet, hover-reveal on desktop) */}
                    <div className="flex items-center gap-1 shrink-0 self-center pl-1 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      {!notification.isRead && (
                        <button
                          type="button"
                          disabled={actionInProgress === notification._id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleSafeMarkAsRead(notification._id);
                          }}
                          className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/20 active:bg-emerald-500/30 transition-colors disabled:opacity-40"
                          title="Mark as read"
                          aria-label="Mark notification as read"
                        >
                          {actionInProgress === notification._id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={actionInProgress === notification._id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSafeDelete(notification._id);
                        }}
                        className="p-1.5 rounded-md text-text/40 hover:text-red-400 hover:bg-red-500/20 active:bg-red-500/30 transition-colors disabled:opacity-40"
                        title="Delete notification"
                        aria-label="Delete notification"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
