import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import './Header.css';

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, isAuthenticated, logout } = useAuth();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  function handleLogout() {
    logout();
    navigate('/events');
  }

  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="header-logo" onClick={() => navigate('/')}>
          <span className="header-logo-icon"><i className="fas fa-trophy" aria-hidden="true" /></span>
          <span className="header-logo-text">Bracket Manager</span>
        </div>

        <div className="header-right">
          <nav className="header-nav">
            <button
              className={`header-nav-item ${isActive('/events') ? 'active' : ''}`}
              onClick={() => navigate('/events')}
            >
              Events
            </button>
            <button
              className={`header-nav-item ${isActive('/ranking') ? 'active' : ''}`}
              onClick={() => navigate('/ranking')}
            >
              Ranking
            </button>
            {/* Participants solo visible para admin en el header */}
            {isAdmin && (
              <button
                className={`header-nav-item ${isActive('/participants') ? 'active' : ''}`}
                onClick={() => navigate('/participants')}
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
                  onClick={() => user?.participantId && navigate(`/participants/${user.participantId}`)}
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
                onClick={() => navigate('/login')}
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
