import { useNotifications } from '@/contexts/NotificationContext';
import './NotificationToast.css';

const TYPE_ICONS: Record<string, string> = {
  duel_challenge: 'fa-khanda',
  duel_expiring: 'fa-hourglass-half',
  league_week_start: 'fa-calendar-week',
  league_match_expiring: 'fa-clock',
  matchmaking: 'fa-random',
  summary: 'fa-bell',
};

const TYPE_COLORS: Record<string, string> = {
  duel_challenge: '#7c3aed',
  duel_expiring: '#f59e0b',
  league_week_start: '#22c55e',
  league_match_expiring: '#f59e0b',
  matchmaking: '#06b6d4',
  summary: '#7c3aed',
};

export default function NotificationToast() {
  const { toasts, dismissToast } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="toast-card"
          style={{ '--toast-color': TYPE_COLORS[toast.type] ?? '#7c3aed' } as React.CSSProperties}
        >
          <div className="toast-icon">
            <i className={`fas ${TYPE_ICONS[toast.type] ?? 'fa-bell'}`} />
          </div>
          <div className="toast-body">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-message">{toast.message}</div>
          </div>
          <button
            className="toast-close"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
          >
            <i className="fas fa-times" />
          </button>
          <div className="toast-progress" />
        </div>
      ))}
    </div>
  );
}
