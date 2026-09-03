import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCommunity } from '@/contexts/CommunityContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { AppNotification } from '@/models/notification';
import './NotificationBell.css';


const TYPE_ICONS: Record<string, string> = {
  duel_challenge: 'fa-khanda',
  duel_expiring: 'fa-hourglass-half',
  league_week_start: 'fa-calendar-week',
  league_match_expiring: 'fa-clock',
  matchmaking: 'fa-random',
  summary: 'fa-bell',
};

export default function NotificationBell() {
  const { t } = useTranslation();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return t('notifications.timeAgo.justNow');
    if (m < 60) return t('notifications.timeAgo.minutesAgo', { count: m });
    const h = Math.floor(m / 60);
    if (h < 24) return t('notifications.timeAgo.hoursAgo', { count: h });
    const d = Math.floor(h / 24);
    return t('notifications.timeAgo.daysAgo', { count: d });
  }
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { getPath } = useCommunity();

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleOpen() {
    setOpen(prev => !prev);
  }

  async function handleNotifClick(notif: AppNotification) {
    if (!notif.read) await markRead(notif.id);
    setOpen(false);
    // Navigate based on type
    if (notif.type === 'duel_challenge' || notif.type === 'duel_expiring') {
      navigate(getPath('events?tab=ranked'));
    } else if (notif.type === 'league_week_start' || notif.type === 'league_match_expiring') {
      if (notif.data?.leagueId) navigate(getPath(`events/leagues/${notif.data.leagueId}`));
      else navigate(getPath('events?tab=leagues'));
    }
  }

  // Dropdown shows only UNREAD notifications (max 10), sorted newest first
  const unreadNotifications = notifications
    .filter(n => !n.read)
    .slice(0, 10);

  return (
    <div className="notif-bell-wrapper" ref={dropdownRef}>
      <button
        className={`notif-bell-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={handleOpen}
        aria-label={t('notifications.title') + (unreadCount > 0 ? ` (${t('notifications.unread', { count: unreadCount })})` : '')}
        title={t('notifications.title')}
      >
        <i className="fas fa-bell" />
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span className="notif-dropdown-title">
              <i className="fas fa-bell" /> {t('notifications.title')}
              {unreadCount > 0 && <span className="notif-count-label">{unreadCount} {t('notifications.new')}</span>}
            </span>
            <div className="notif-dropdown-actions">
              <button
                className={`notif-mark-all-btn ${unreadCount === 0 ? 'disabled' : ''}`}
                onClick={() => { if (unreadCount > 0) markAllRead(); }}
                title={unreadCount > 0 ? t('notifications.markAllRead') : t('notifications.allCaughtUp')}
                disabled={unreadCount === 0}
              >
                <i className="fas fa-check-double" /> {t('notifications.markAllRead')}
              </button>
              <button
                className="notif-view-all-btn"
                onClick={() => { setOpen(false); navigate(getPath('notifications')); }}
              >
                {t('notifications.viewAll')}
              </button>
              <i
                className="fas fa-times notif-dropdown-close"
                onClick={() => setOpen(false)}
                title={t('notifications.close')}
                role="button"
                aria-label={t('notifications.close')}
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(false); }}
              />
            </div>
          </div>

          <div className="notif-dropdown-list">
            {unreadNotifications.length === 0 ? (
              <div className="notif-empty">
                <i className="fas fa-check-circle" />
                <p>{t('notifications.noNew')}</p>
              </div>
            ) : (
              unreadNotifications.map(notif => (
                <div
                  key={notif.id}
                  className="notif-item unread"
                  onClick={() => handleNotifClick(notif)}
                >
                  <div className="notif-item-icon">
                    <i className={`fas ${TYPE_ICONS[notif.type] ?? 'fa-bell'}`} />
                  </div>
                  <div className="notif-item-body">
                    <div className="notif-item-title">{notif.title}</div>
                    <div className="notif-item-message">{notif.message}</div>
                    <div className="notif-item-time">{timeAgo(notif.createdAt)}</div>
                  </div>
                  <div className="notif-unread-dot" />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
