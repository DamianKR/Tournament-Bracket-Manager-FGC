import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications, type Toast, type ToastVariant } from '@/contexts/NotificationContext';
import './NotificationToast.css';

// ── Icons ─────────────────────────────────────────────────────────────────

const NOTIF_ICONS: Record<string, string> = {
  duel_challenge: 'fa-khanda',
  duel_expiring: 'fa-hourglass-half',
  league_week_start: 'fa-calendar-week',
  league_match_expiring: 'fa-clock',
  matchmaking: 'fa-random',
  membership_request: 'fa-user-plus',
  membership_invite: 'fa-envelope',
  membership_accepted: 'fa-check-circle',
  summary: 'fa-bell',
};

const VARIANT_ICONS: Record<ToastVariant, string> = {
  success:      'fa-check-circle',
  error:        'fa-exclamation-circle',
  warning:      'fa-exclamation-triangle',
  info:         'fa-info-circle',
  notification: 'fa-bell',
};

const VARIANT_COLORS: Record<ToastVariant, string> = {
  success:      '#22c55e',
  error:        '#ef4444',
  warning:      '#f59e0b',
  info:         '#3b82f6',
  notification: '#7c3aed',
};

const NOTIF_COLORS: Record<string, string> = {
  duel_challenge: '#7c3aed',
  duel_expiring: '#f59e0b',
  league_week_start: '#22c55e',
  league_match_expiring: '#f59e0b',
  matchmaking: '#06b6d4',
  membership_request: '#10b981',
  membership_invite: '#3b82f6',
  membership_accepted: '#22c55e',
  summary: '#7c3aed',
};

function resolveColor(toast: Toast): string {
  if (toast.variant && toast.variant !== 'notification') return VARIANT_COLORS[toast.variant];
  return NOTIF_COLORS[toast.type] ?? '#7c3aed';
}

function resolveIcon(toast: Toast): string {
  if (toast.variant && toast.variant !== 'notification') return VARIANT_ICONS[toast.variant];
  return NOTIF_ICONS[toast.type] ?? 'fa-bell';
}

// ── Single toast card with exit animation ──────────────────────────────────

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const { t } = useTranslation();
  const [exiting, setExiting] = useState(false);

  function dismiss() {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 280);
  }

  const color = resolveColor(toast);
  const icon = resolveIcon(toast);
  const duration = toast.duration !== undefined ? toast.duration : 10000;

  return (
    <div
      className={`toast-card ${exiting ? 'toast-exit' : ''}`}
      style={{ '--toast-color': color, '--toast-duration': `${duration}ms` } as React.CSSProperties}
      role="alert"
      aria-live="assertive"
    >
      <div className="toast-icon">
        <i className={`fas ${icon}`} />
      </div>
      <div className="toast-body">
        {toast.title && <div className="toast-title">{toast.title}</div>}
        <div className="toast-message">{toast.message}</div>
      </div>
      <button
        className="toast-close"
        onClick={dismiss}
        aria-label={t('notifications.dismiss', 'Cerrar')}
      >
        <i className="fas fa-times" />
      </button>
      {duration > 0 && <div className="toast-progress" />}
    </div>
  );
}

// ── Container ──────────────────────────────────────────────────────────────

export default function NotificationToast() {
  const { toasts, dismissToast } = useNotifications();
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map(toast => (
        <ToastCard key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
