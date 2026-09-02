import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCommunity } from '@/contexts/CommunityContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { AppNotification } from '@/models/notification';
import './NotificationsPage.css';

const TYPE_ICONS: Record<string, string> = {
  duel_challenge: 'fa-khanda',
  duel_expiring: 'fa-hourglass-half',
  league_week_start: 'fa-calendar-week',
  league_match_expiring: 'fa-clock',
  matchmaking: 'fa-random',
};

const TYPE_LABELS: Record<string, string> = {
  duel_challenge: 'Duel Challenge',
  duel_expiring: 'Duel Expiring',
  league_week_start: 'League Week',
  league_match_expiring: 'League Match',
  matchmaking: 'Matchmaking',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  if (h < 48) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString();
}

export default function NotificationsPage() {
  const { notifications, unreadCount, markRead, markAllRead, deleteNotification, loading } = useNotifications();
  const navigate = useNavigate();
  const { getPath } = useCommunity();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function handleClick(notif: AppNotification) {
    if (!notif.read) await markRead(notif.id);
    if (notif.type === 'duel_challenge' || notif.type === 'duel_expiring') {
      navigate(getPath('events?tab=ranked'));
    } else if (notif.type === 'league_week_start' || notif.type === 'league_match_expiring') {
      if (notif.data?.leagueId) navigate(getPath(`events/leagues/${notif.data.leagueId}`));
      else navigate(getPath('events?tab=leagues'));
    }
  }

  return (
    <div className="page-wrapper">
      <div className="notif-page">
        <div className="notif-page-header">
          <div>
            <h1 className="notif-page-title">
              <i className="fas fa-bell" /> Notifications
            </h1>
            {unreadCount > 0 && (
              <p className="notif-page-subtitle">{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button className="btn-outline" onClick={markAllRead}>
              <i className="fas fa-check-double" /> Mark all as read
            </button>
          )}
        </div>

        {loading && notifications.length === 0 ? (
          <div className="notif-page-empty card">
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--text-secondary)' }} />
            <p>Loading...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="notif-page-empty card">
            <i className="fas fa-bell-slash" />
            <h3>No notifications</h3>
            <p>You're all caught up!</p>
          </div>
        ) : (
          <div className="notif-page-list">
            {notifications.map(notif => (
              <div
                key={notif.id}
                className={`notif-page-item card ${notif.read ? 'read' : 'unread'}`}
                onClick={() => handleClick(notif)}
              >
                <div className="notif-page-item-icon">
                  <i className={`fas ${TYPE_ICONS[notif.type] ?? 'fa-bell'}`} />
                </div>
                <div className="notif-page-item-body">
                  <div className="notif-page-item-meta">
                    <span className="notif-page-item-type">{TYPE_LABELS[notif.type] ?? notif.type}</span>
                    <span className="notif-page-item-time">{timeAgo(notif.createdAt)}</span>
                  </div>
                  <div className="notif-page-item-title">{notif.title}</div>
                  <div className="notif-page-item-message">{notif.message}</div>
                </div>
                <div className="notif-page-item-actions">
                  {!notif.read && (
                    <button
                      className="notif-page-read-btn"
                      onClick={e => { e.stopPropagation(); markRead(notif.id); }}
                      title="Mark as read"
                    >
                      <i className="fas fa-check" />
                    </button>
                  )}
                  <button
                    className="notif-page-delete-btn"
                    onClick={e => { e.stopPropagation(); setConfirmDeleteId(notif.id); }}
                    title="Delete"
                  >
                    <i className="fas fa-trash" />
                  </button>
                </div>
                {!notif.read && <div className="notif-page-unread-bar" />}
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDeleteId && (
        <div className="notif-confirm-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="notif-confirm-dialog card" onClick={e => e.stopPropagation()}>
            <div className="notif-confirm-icon">
              <i className="fas fa-trash" />
            </div>
            <h3>Delete notification?</h3>
            <p>This action cannot be undone.</p>
            <div className="notif-confirm-actions">
              <button className="btn-outline" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  deleteNotification(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
              >
                <i className="fas fa-trash" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
