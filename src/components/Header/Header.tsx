import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import './Header.css';

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  function handleLogout() {
    logout();
    setMenuOpen(false);
    navigate('/events');
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

        <button
          className="header-mobile-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
        >
          <i className={`fas fa-${menuOpen ? 'times' : 'bars'}`} />
        </button>

        <div className={`header-right ${menuOpen ? 'open' : ''}`}>
          <nav className="header-nav">
            <button
              className={`header-nav-item ${isActive('/events') ? 'active' : ''}`}
              onClick={() => handleNav('/events')}
            >
              Events
            </button>
            <button
              className={`header-nav-item ${isActive('/ranking') ? 'active' : ''}`}
              onClick={() => handleNav('/ranking')}
            >
              Ranking
            </button>
            {/* Participants solo visible para admin en el header */}
            {isAdmin && (
              <button
                className={`header-nav-item ${isActive('/participants') ? 'active' : ''}`}
                onClick={() => handleNav('/participants')}
              >
                Participants
              </button>
            )}
          </nav>

          <div className="header-divider" />

          <div className="header-auth">
            {isAuthenticated ? (
              <div className="header-user-pill">
                <span
                  className={`header-username ${user?.participantId ? 'clickable' : ''}`}
                  onClick={() => user?.participantId && handleNav(`/participants/${user.participantId}`)}
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
