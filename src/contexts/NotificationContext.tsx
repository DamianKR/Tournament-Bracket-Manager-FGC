/**
 * NotificationContext
 *
 * Provides:
 * - notifications[]         All notifications for current user
 * - unreadCount             Number of unread notifications
 * - toasts[]                Active toast messages (auto-dismissed after 10s)
 * - refresh()               Reload notifications from server
 * - markRead(id)            Mark one notification as read
 * - markAllRead()           Mark all as read
 * - deleteNotification(id)  Delete one notification
 * - dismissToast(id)        Remove a toast from screen
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { AppNotification } from '@/models/notification';
import {
  getNotificationsAsync,
  markNotificationReadAsync,
  markAllReadAsync,
  deleteNotificationAsync,
} from '@/services/notifications/notificationService';
import { useAuth } from '@/contexts/AuthContext';

export interface Toast {
  id: string;           // notif id or unique id for grouped
  title: string;
  message: string;
  type: string;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  toasts: Toast[];
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  dismissToast: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const POLL_INTERVAL_MS = 30 * 1000; // poll every 30 seconds
const TOAST_DURATION_MS = 10 * 1000; // 10 seconds

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(false);
  const prevUnreadIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Toast) => {
    setToasts(prev => {
      // Avoid duplicate toasts
      if (prev.some(t => t.id === toast.id)) return prev;
      return [...prev, toast];
    });
    // Auto-dismiss after 10s
    setTimeout(() => dismissToast(toast.id), TOAST_DURATION_MS);
  }, [dismissToast]);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user?.participantId) return;
    setLoading(true);
    try {
      const notifs = await getNotificationsAsync();
      const unread = notifs.filter(n => !n.read);
      const newUnreadIds = new Set(unread.map(n => n.id));

      // On first load: show toast(s) for existing unread
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        if (unread.length === 1) {
          addToast({ id: unread[0].id, title: unread[0].title, message: unread[0].message, type: unread[0].type });
        } else if (unread.length > 1) {
          addToast({
            id: 'login-summary',
            title: 'You have notifications',
            message: `You have ${unread.length} unread notifications. Check the bell icon.`,
            type: 'summary',
          });
        }
        prevUnreadIds.current = newUnreadIds;
      } else {
        // On subsequent polls: only show toasts for brand-new notifications
        const brandNew = unread.filter(n => !prevUnreadIds.current.has(n.id));
        if (brandNew.length === 1) {
          addToast({ id: brandNew[0].id, title: brandNew[0].title, message: brandNew[0].message, type: brandNew[0].type });
        } else if (brandNew.length > 1) {
          addToast({
            id: `new-${Date.now()}`,
            title: 'New notifications',
            message: `You have ${brandNew.length} new notifications.`,
            type: 'summary',
          });
        }
        prevUnreadIds.current = newUnreadIds;
      }

      setNotifications(notifs);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user, addToast]);

  // Load on auth change, poll every 30s
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setToasts([]);
      isFirstLoad.current = true;
      prevUnreadIds.current = new Set();
      return;
    }
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, refresh]);

  const markRead = useCallback(async (id: string) => {
    await markNotificationReadAsync(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    prevUnreadIds.current.delete(id);
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllReadAsync();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    prevUnreadIds.current.clear();
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    await deleteNotificationAsync(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    prevUnreadIds.current.delete(id);
    dismissToast(id);
  }, [dismissToast]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      toasts,
      loading,
      refresh,
      markRead,
      markAllRead,
      deleteNotification,
      dismissToast,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationProvider');
  return ctx;
}
