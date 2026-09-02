import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { EventTab } from './EventsPage';
import './EventsSidebar.css';

interface EventsSidebarProps {
  activeTab: EventTab;
  onTabChange: (tab: EventTab) => void;
}

function EventsSidebar({ activeTab, onTabChange }: EventsSidebarProps) {
  const { isAuthenticated } = useAuth();
  const { getPath } = useCommunity();
  const navigate = useNavigate();

  function handleAuthTab(tab: EventTab) {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: getPath(`events?tab=${tab}`) } });
      return;
    }
    onTabChange(tab);
  }

  return (
    <aside className="events-sidebar">
      <div className="events-sidebar-header">
        <i className="fas fa-calendar-alt" />
        <h2>Events</h2>
      </div>

      <nav className="events-sidebar-nav">
        <button
          className={`events-sidebar-item ${activeTab === 'tournaments' ? 'active' : ''}`}
          onClick={() => onTabChange('tournaments')}
        >
          <i className="fas fa-trophy" />
          <span>Tournaments</span>
        </button>

        <button
          className={`events-sidebar-item ${activeTab === 'leagues' ? 'active' : ''}`}
          onClick={() => onTabChange('leagues')}
        >
          <i className="fas fa-shield-alt" />
          <span>Leagues</span>
        </button>

        {/* Ranked e History solo para usuarios autenticados */}
        <button
          className={`events-sidebar-item ${activeTab === 'ranked' ? 'active' : ''} ${!isAuthenticated ? 'locked' : ''}`}
          onClick={() => handleAuthTab('ranked')}
          title={!isAuthenticated ? 'Sign in to access Ranked' : undefined}
        >
          <i className="fas fa-star" />
          <span>Ranked</span>
          {!isAuthenticated && <i className="fas fa-lock events-sidebar-lock" />}
        </button>

        <button
          className={`events-sidebar-item ${activeTab === 'history' ? 'active' : ''} ${!isAuthenticated ? 'locked' : ''}`}
          onClick={() => handleAuthTab('history')}
          title={!isAuthenticated ? 'Sign in to access History' : undefined}
        >
          <i className="fas fa-history" />
          <span>History</span>
          {!isAuthenticated && <i className="fas fa-lock events-sidebar-lock" />}
        </button>
      </nav>
    </aside>
  );
}

export default EventsSidebar;
