import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { EventTab } from './EventsPage';
import './EventsSidebar.css';

interface EventsSidebarProps {
  activeTab: EventTab;
  onTabChange: (tab: EventTab) => void;
}

function EventsSidebar({ activeTab, onTabChange }: EventsSidebarProps) {
  const { t } = useTranslation();
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
        <h2>{t('events.title')}</h2>
      </div>

      <nav className="events-sidebar-nav">
        <button
          className={`events-sidebar-item ${activeTab === 'tournaments' ? 'active' : ''}`}
          onClick={() => onTabChange('tournaments')}
        >
          <i className="fas fa-trophy" />
          <span>{t('events.tabs.tournaments')}</span>
        </button>

        <button
          className={`events-sidebar-item ${activeTab === 'leagues' ? 'active' : ''}`}
          onClick={() => onTabChange('leagues')}
        >
          <i className="fas fa-shield-alt" />
          <span>{t('events.tabs.leagues')}</span>
        </button>

        {/* Ranked e History solo para usuarios autenticados */}
        <button
          className={`events-sidebar-item ${activeTab === 'ranked' ? 'active' : ''} ${!isAuthenticated ? 'locked' : ''}`}
          onClick={() => handleAuthTab('ranked')}
          title={!isAuthenticated ? t('events.signInToAccess', { tab: t('events.tabs.ranked') }) : undefined}
        >
          <i className="fas fa-star" />
          <span>{t('events.tabs.ranked')}</span>
          {!isAuthenticated && <i className="fas fa-lock events-sidebar-lock" />}
        </button>

        <button
          className={`events-sidebar-item ${activeTab === 'history' ? 'active' : ''} ${!isAuthenticated ? 'locked' : ''}`}
          onClick={() => handleAuthTab('history')}
          title={!isAuthenticated ? t('events.signInToAccess', { tab: t('events.tabs.history') }) : undefined}
        >
          <i className="fas fa-history" />
          <span>{t('events.tabs.history')}</span>
          {!isAuthenticated && <i className="fas fa-lock events-sidebar-lock" />}
        </button>
      </nav>
    </aside>
  );
}

export default EventsSidebar;
