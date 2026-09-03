import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import NotificationBell from '@/components/Notifications/NotificationBell';
import './Header.css';

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
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
          <span className="header-logo-text">Bracket Manager</span>
        </div>

        <div className="header-community">
          {currentCommunity ? (
            <button
              className="header-community-name"
              onClick={() => handleNav(`/c/${currentCommunity.id}`)}
              title={`Ir al home de ${currentCommunity.name}`}
            >
              <i className="fas fa-map-marker-alt" />
              <span>{currentCommunity.name}</span>
            </button>
          ) : (
            <button
              className="header-community-name header-community-name--empty"
              onClick={() => handleNav('/communities')}
              title="Elegir una comunidad"
            >
              <i className="fas fa-map-marker-alt" />
              <span>Elegir comunidad</span>
            </button>
          )}
        </div>

        {/* Bell always visible on mobile (outside hamburger) */}
        <div className="header-mobile-actions">
          {isAuthenticated && <NotificationBell />}
          <button
            className="header-mobile-toggle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
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
                  Events
                </button>
                <button
                  className={`header-nav-item ${isActive(`/c/${effectiveCommunityId}/ranking`) ? 'active' : ''}`}
                  onClick={() => handleNav(`/c/${effectiveCommunityId}/ranking`)}
                >
                  Ranking
                </button>
                {isAdmin && (
                  <button
                    className={`header-nav-item ${isActive(`/c/${effectiveCommunityId}/participants`) ? 'active' : ''}`}
                    onClick={() => handleNav(`/c/${effectiveCommunityId}/participants`)}
                  >
                    Participants
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  className={`header-nav-item ${isActive('/communities') ? 'active' : ''}`}
                  onClick={() => handleNav('/communities')}
                >
                  Events
                </button>
                <button
                  className={`header-nav-item ${isActive('/communities') ? 'active' : ''}`}
                  onClick={() => handleNav('/communities')}
                >
                  Ranking
                </button>
              </>
            )}
            <button
              className={`header-nav-item ${isActive('/communities') ? 'active' : ''}`}
              onClick={() => handleNav('/communities')}
            >
              Communities
            </button>
          </nav>

          <div className="header-divider" />

          {/* Bell in desktop nav */}
          {isAuthenticated && (
            <div className="header-bell-desktop">
              <NotificationBell />
            </div>
          )}

          <div className="header-auth">
            {isAuthenticated ? (
              <div className="header-user-pill">
                <span
                  className={`header-username ${user?.participantId ? 'clickable' : ''}`}
                  onClick={() => user?.participantId && handleNav(currentCommunity ? `/c/${currentCommunity.id}/participants/${user.participantId}` : '/communities')}
                  title={user?.participantId ? 'View profile' : user!.username}
                >
                  <i className="fas fa-user-circle" />
                  <span className="header-username-text">{user!.username}</span>
                </span>
                {userCommunity && (
                  <span className="header-community-badge" title={`Member of ${userCommunity.name}`}>
                    {userCommunity.shortName || userCommunity.name}
                  </span>
                )}
                {user?.role === 'superadmin' && <span className="header-role-badge">Superadmin</span>}
                {user?.role === 'community_admin' && <span className="header-role-badge">Owner</span>}
                {user?.role === 'admin' && <span className="header-role-badge">Admin</span>}
                <button className="header-logout-btn" onClick={handleLogout} title="Sign out" aria-label="Sign out">
                  <i className="fas fa-sign-out-alt" />
                </button>
              </div>
            ) : (
              <button
                className="header-login-btn"
                onClick={() => handleNav('/login')}
                title="Sign in"
                aria-label="Sign in"
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
