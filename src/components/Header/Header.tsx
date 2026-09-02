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
  const { currentCommunity } = useCommunity();
  const [menuOpen, setMenuOpen] = useState(false);

  const communityMatch = location.pathname.match(/^\/c\/([^/]+)/);
  const communityId = communityMatch?.[1];

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
          {currentCommunity && (
            <span className="header-community-name">{currentCommunity.name}</span>
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
            {communityId && (
              <>
                <button
                  className={`header-nav-item ${isActive(`/c/${communityId}/events`) ? 'active' : ''}`}
                  onClick={() => handleNav(`/c/${communityId}/events`)}
                >
                  Events
                </button>
                <button
                  className={`header-nav-item ${isActive(`/c/${communityId}/ranking`) ? 'active' : ''}`}
                  onClick={() => handleNav(`/c/${communityId}/ranking`)}
                >
                  Ranking
                </button>
                {/* {isAuthenticated && (
                  <button
                    className={`header-nav-item ${isActive(`/c/${communityId}/notifications`) ? 'active' : ''}`}
                    onClick={() => handleNav(`/c/${communityId}/notifications`)}
                  >
                    Notifications
                  </button>
                )} */}
                {isAdmin && (
                  <button
                    className={`header-nav-item ${isActive(`/c/${communityId}/participants`) ? 'active' : ''}`}
                    onClick={() => handleNav(`/c/${communityId}/participants`)}
                  >
                    Participants
                  </button>
                )}
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
                {isAdmin && <span className="header-role-badge">Admin</span>}
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
