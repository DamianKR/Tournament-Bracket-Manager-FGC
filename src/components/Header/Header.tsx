import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import NotificationBell from '@/components/Notifications/NotificationBell';
import './Header.css';

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, isAdmin, isAuthenticated, logout } = useAuth();
  const { currentCommunity, allCommunities } = useCommunity();
  const [menuOpen, setMenuOpen] = useState(false);

  // La comunidad activa para navegación: la que se está viendo en el URL,
  // o la comunidad del usuario logueado, o ninguna.
  const communityMatch = location.pathname.match(/^\/c\/([^/]+)/);
  const urlCommunityId = communityMatch?.[1];
  const effectiveCommunityId = urlCommunityId ?? currentCommunity?.id ?? user?.communityId;

  // Comunidad a la que pertenece el usuario logueado, no la que está viendo.
  const userCommunity = user?.communityId
    ? allCommunities.find((c) => c.id === user.communityId)
    : null;

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  function handleLogout() {
    logout();
    setMenuOpen(false);
    navigate('/communities');
  }

  function handleNav(path: string) {
    setMenuOpen(false);
    navigate(path);
  }

  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="header-logo" onClick={() => { setMenuOpen(false); navigate('/'); }}>
          <span className="header-logo-icon"><i className="fas fa-trophy" aria-hidden="true" /></span>
          <span className="header-logo-text">{t('appName')}</span>
        </div>

        <div className="header-community">
          {currentCommunity ? (
            <button
              className="header-community-name"
              onClick={() => handleNav(`/c/${currentCommunity.id}`)}
              title={`${t('header.communities')}: ${currentCommunity.name}`}
            >
              <i className="fas fa-map-marker-alt" />
              <span>{currentCommunity.name}</span>
            </button>
          ) : (
            <button
              className="header-community-name header-community-name--empty"
              onClick={() => handleNav('/communities')}
              title={t('header.selectCommunity')}
            >
              <i className="fas fa-map-marker-alt" />
              <span>{t('header.selectCommunity')}</span>
            </button>
          )}
        </div>

        {/* Bell always visible on mobile (outside hamburger) */}
        <div className="header-mobile-actions">
          {isAuthenticated && <NotificationBell />}
          <button
            className="header-mobile-toggle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? t('common.closeMenu') : t('common.openMenu')}
            aria-expanded={menuOpen}
          >
            <i className={`fas fa-${menuOpen ? 'times' : 'bars'}`} />
          </button>
        </div>

        <div className={`header-right ${menuOpen ? 'open' : ''}`}>
          <nav className="header-nav">
            {effectiveCommunityId ? (
              <>
                <button
                  className={`header-nav-item ${isActive(`/c/${effectiveCommunityId}/events`) ? 'active' : ''}`}
                  onClick={() => handleNav(`/c/${effectiveCommunityId}/events`)}
                >
                  {t('header.events')}
                </button>
                <button
                  className={`header-nav-item ${isActive(`/c/${effectiveCommunityId}/ranking`) ? 'active' : ''}`}
                  onClick={() => handleNav(`/c/${effectiveCommunityId}/ranking`)}
                >
                  {t('header.ranking')}
                </button>
                {isAdmin && (
                  <button
                    className={`header-nav-item ${isActive(`/c/${effectiveCommunityId}/participants`) ? 'active' : ''}`}
                    onClick={() => handleNav(`/c/${effectiveCommunityId}/participants`)}
                  >
                    {t('header.participants')}
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  className={`header-nav-item ${isActive('/communities') ? 'active' : ''}`}
                  onClick={() => handleNav('/communities')}
                >
                  {t('header.events')}
                </button>
                <button
                  className={`header-nav-item ${isActive('/communities') ? 'active' : ''}`}
                  onClick={() => handleNav('/communities')}
                >
                  {t('header.ranking')}
                </button>
              </>
            )}
            <button
              className={`header-nav-item ${isActive('/communities') ? 'active' : ''}`}
              onClick={() => handleNav('/communities')}
            >
              {t('header.communities')}
            </button>
          </nav>

          <div className="header-divider" />

          {/* Bell in desktop nav */}
          {isAuthenticated && (
            <div className="header-bell-desktop">
              <NotificationBell />
            </div>
          )}

          <div className="header-lang">
            <button
              className={`header-lang-btn ${i18n.language === 'es' ? 'active' : ''}`}
              onClick={() => i18n.changeLanguage('es')}
              aria-label="Español"
              title="Español"
            >
              ES
            </button>
            <button
              className={`header-lang-btn ${i18n.language === 'en' ? 'active' : ''}`}
              onClick={() => i18n.changeLanguage('en')}
              aria-label="English"
              title="English"
            >
              EN
            </button>
          </div>

          <div className="header-auth">
            {isAuthenticated ? (
              <div className="header-user-pill">
                <span
                  className={`header-username ${user?.participantId ? 'clickable' : ''}`}
                  onClick={() => user?.participantId && handleNav(currentCommunity ? `/c/${currentCommunity.id}/participants/${user.participantId}` : '/communities')}
                  title={user?.participantId ? t('common.viewProfile') : user!.username}
                >
                  <i className="fas fa-user-circle" />
                  <span className="header-username-text">{user!.username}</span>
                </span>
                {userCommunity && (
                  <span className="header-community-badge" title={t('common.memberOf', { name: userCommunity.name })}>
                    {userCommunity.shortName || userCommunity.name}
                  </span>
                )}
                {user?.role === 'superadmin' && <span className="header-role-badge">{t('header.roles.superadmin')}</span>}
                {user?.role === 'community_admin' && <span className="header-role-badge">{t('header.roles.community_admin')}</span>}
                {user?.role === 'admin' && <span className="header-role-badge">{t('header.roles.admin')}</span>}
                <button className="header-logout-btn" onClick={handleLogout} title={t('header.logout')} aria-label={t('header.logout')}>
                  <i className="fas fa-sign-out-alt" />
                </button>
              </div>
            ) : (
              <button
                className="header-login-btn"
                onClick={() => handleNav('/login')}
                title={t('header.login')}
                aria-label={t('header.login')}
              >
                <i className="fas fa-sign-in-alt" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
