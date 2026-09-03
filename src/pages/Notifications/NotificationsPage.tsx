import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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

export default function NotificationsPage() {
  const { t } = useTranslation();

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return t('notifications.timeAgo.justNow');
    if (m < 60) return t('notifications.timeAgo.minutesAgo', { count: m });
    const h = Math.floor(m / 60);
    if (h < 24) return t('notifications.timeAgo.hoursAgo', { count: h });
    if (h < 48) return t('notifications.timeAgo.yesterday');
    return new Date(dateStr).toLocaleDateString();
  }
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

  const typeLabel = (type: string) => t(`notifications.types.${type}` as any, { defaultValue: type });

  return (
    <div className="page-wrapper">
      <div className="notif-page">
        <div className="notif-page-header">
          <div>
            <h1 className="notif-page-title">
              <i className="fas fa-bell" /> {t('notifications.title')}
            </h1>
            {unreadCount > 0 && (
              <p className="notif-page-subtitle">{t('notifications.unread', { count: unreadCount })}</p>
            )}
          </div>
          {unreadCount > 0 && (
            <button className="btn-outline" onClick={markAllRead}>
              <i className="fas fa-check-double" /> {t('notifications.markAllRead')}
            </button>
          )}
        </div>

        {loading && notifications.length === 0 ? (
          <div className="notif-page-empty card">
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--text-secondary)' }} />
            <p>{t('notifications.loading')}</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="notif-page-empty card">
            <i className="fas fa-bell-slash" />
            <h3>{t('notifications.empty')}</h3>
            <p>{t('notifications.emptyDesc')}</p>
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
                    <span className="notif-page-item-type">{typeLabel(notif.type)}</span>
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
                      title={t('notifications.markAsRead')}
                    >
                      <i className="fas fa-check" />
                    </button>
                  )}
                  <button
                    className="notif-page-delete-btn"
                    onClick={e => { e.stopPropagation(); setConfirmDeleteId(notif.id); }}
                    title={t('notifications.delete')}
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
            <h3>{t('notifications.deleteTitle')}</h3>
            <p>{t('notifications.deleteDesc')}</p>
            <div className="notif-confirm-actions">
              <button className="btn-outline" onClick={() => setConfirmDeleteId(null)}>
                {t('notifications.cancel')}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  deleteNotification(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
              >
                <i className="fas fa-trash" /> {t('notifications.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
