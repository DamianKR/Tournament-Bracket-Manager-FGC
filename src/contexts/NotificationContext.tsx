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
import { useTranslation } from 'react-i18next';
import { AppNotification } from '@/models/notification';
import {
  getNotificationsAsync,
  markNotificationReadAsync,
  markAllReadAsync,
  deleteNotificationAsync,
} from '@/services/notifications/notificationService';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { localizedNotification } from '@/utils/notificationText';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'notification';

export interface Toast {
  id: string;           // notif id or unique id for grouped
  title: string;
  message: string;
  type: string;         // notification type (for icon resolution)
  variant?: ToastVariant; // UI feedback variant (overrides color/icon when set)
  duration?: number;    // ms, default TOAST_DURATION_MS; 0 = persistent
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
  /** Muestra un toast de UI (success/error/warning/info) sin necesitar una AppNotification. */
  showToast: (variant: ToastVariant, message: string, title?: string, duration?: number) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const POLL_INTERVAL_MS = 3 * 60 * 1000; // example poll every 5 minutes for new notifications
const TOAST_DURATION_MS = 10 * 1000; // 10 seconds

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { isAuthenticated, user, consumeLoginNotifications } = useAuth();
  const { allCommunities } = useCommunity();
  const communityName = useCallback(
    (id: string) => allCommunities.find((c) => c.id === id)?.name,
    [allCommunities]
  );
  const notifToast = useCallback(
    (n: AppNotification): Toast => {
      const text = localizedNotification(n, t, communityName);
      return { id: n.id, title: text.title, message: text.message, type: n.type };
    },
    [t, communityName]
  );
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(false);
  const prevUnreadIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Toast) => {
    const duration = toast.duration !== undefined ? toast.duration : TOAST_DURATION_MS;
    setToasts(prev => {
      // Avoid duplicate toasts by id
      if (prev.some(t => t.id === toast.id)) return prev;
      // Cap at 5 simultaneous toasts (drop oldest)
      const capped = prev.length >= 5 ? prev.slice(1) : prev;
      return [...capped, toast];
    });
    if (duration > 0) {
      setTimeout(() => dismissToast(toast.id), duration);
    }
  }, [dismissToast]);

  const showToast = useCallback((variant: ToastVariant, message: string, title?: string, duration?: number) => {
    const id = `ui-toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    addToast({ id, title: title ?? '', message, type: 'ui', variant, duration });
  }, [addToast]);

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
          addToast(notifToast(unread[0]));
        } else if (unread.length > 1) {
          addToast({
            id: 'login-summary',
            title: t('notifications.summaryTitle'),
            message: t('notifications.summaryMessage', { count: unread.length }),
            type: 'summary',
          });
        }
        prevUnreadIds.current = newUnreadIds;
      } else {
        // On subsequent polls: only show toasts for brand-new notifications
        const brandNew = unread.filter(n => !prevUnreadIds.current.has(n.id));
        if (brandNew.length === 1) {
          addToast(notifToast(brandNew[0]));
        } else if (brandNew.length > 1) {
          addToast({
            id: `new-${Date.now()}`,
            title: t('notifications.newTitle'),
            message: t('notifications.newMessage', { count: brandNew.length }),
            type: 'summary',
          });
        }
        prevUnreadIds.current = newUnreadIds;
      }

      setNotifications(notifs);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user, addToast, t, notifToast]);

  // Escuchar el evento global auth:expired disparado cuando un write
  // autenticado recibe 401 (token expirado silenciosamente).
  useEffect(() => {
    function handleAuthExpired() {
      showToast('error',
        t('auth.sessionExpiredMessage', 'Tu sesión expiró. Por favor inicia sesión de nuevo.'),
        t('auth.sessionExpiredTitle', 'Sesión expirada'),
        0 // persistent — el user debe hacer acción
      );
    }
    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, [showToast, t]);

  // Load on auth change, poll every 5 minutes
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

  // Consume login notifications (delivered immediately in the login response)
  useEffect(() => {
    if (!isAuthenticated || !user?.participantId) return;
    const loginNotifs = consumeLoginNotifications();
    if (!loginNotifs || loginNotifs.length === 0) return;

    setNotifications(loginNotifs);
    const unread = loginNotifs.filter(n => !n.read);
    if (unread.length === 1) {
      addToast(notifToast(unread[0]));
    } else if (unread.length > 1) {
      addToast({
        id: 'login-summary',
        title: t('notifications.summaryTitle'),
        message: t('notifications.summaryMessage', { count: unread.length }),
        type: 'summary',
      });
    }
    prevUnreadIds.current = new Set(unread.map(n => n.id));
    isFirstLoad.current = false;
  }, [isAuthenticated, user, consumeLoginNotifications, addToast, t, notifToast]);

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
      showToast,
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

/**
 * Hook de conveniencia para disparar toasts de UI (success/error/warning/info)
 * desde cualquier componente dentro de NotificationProvider.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.success('Guardado');
 *   toast.error('Error al conectar');
 *   toast.warning('Algo no está bien');
 *   toast.info('Información');
 */
export function useToast() {
  const { showToast } = useNotifications();
  return {
    success: (message: string, title?: string) => showToast('success', message, title),
    error:   (message: string, title?: string) => showToast('error',   message, title),
    warning: (message: string, title?: string) => showToast('warning', message, title),
    info:    (message: string, title?: string) => showToast('info',    message, title),
    show:    showToast,
  };
}
