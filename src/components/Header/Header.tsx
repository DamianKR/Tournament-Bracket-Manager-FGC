import { useLocation, useNavigate } from 'react-router-dom';
import './Header.css';

function Header() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="header-logo" onClick={() => navigate('/')}>
          <span className="header-logo-icon">🏆</span>
          <span className="header-logo-text">Bracket Manager</span>
        </div>

        <nav className="header-nav">
          <button
            className={`header-nav-item ${isActive('/') && !isActive('/participants') ? 'active' : ''}`}
            onClick={() => navigate('/')}
          >
            Tournaments
          </button>
          <button
            className={`header-nav-item ${isActive('/participants') ? 'active' : ''}`}
            onClick={() => navigate('/participants')}
          >
            Participants
          </button>
          <button
            className={`header-nav-item ${isActive('/ranking') ? 'active' : ''}`}
            onClick={() => navigate('/ranking')}
          >
            Ranking
          </button>
        </nav>
      </div>
    </header>
  );
}

export default Header;
