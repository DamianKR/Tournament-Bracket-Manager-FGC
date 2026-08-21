import { EventTab } from './EventsPage';
import './EventsSidebar.css';

interface EventsSidebarProps {
  activeTab: EventTab;
  onTabChange: (tab: EventTab) => void;
}

function EventsSidebar({ activeTab, onTabChange }: EventsSidebarProps) {
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

        <button
          className={`events-sidebar-item ${activeTab === 'ranked' ? 'active' : ''}`}
          onClick={() => onTabChange('ranked')}
        >
          <i className="fas fa-star" />
          <span>Ranked</span>
        </button>

        <button
          className={`events-sidebar-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => onTabChange('history')}
        >
          <i className="fas fa-history" />
          <span>History</span>
        </button>
      </nav>
    </aside>
  );
}

export default EventsSidebar;
