import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import EventsSidebar from './EventsSidebar';
import TournamentsTab from './Tournaments/TournamentsTab';
import LeaguesTab from './Leagues/LeaguesTab';
import RankedTab from './Ranked/RankedTab';
import HistoryTab from './History/HistoryTab';
import './EventsPage.css';

export type EventTab = 'tournaments' | 'leagues' | 'ranked' | 'history';

// Tabs que requieren autenticación
const AUTH_TABS: EventTab[] = ['ranked', 'history'];

function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { currentCommunity } = useCommunity();

  function resolveTab(param: string | null): EventTab {
    const t = param as EventTab | null;
    // Si la tab requiere auth y el user no está autenticado → fallback a tournaments
    if (t && AUTH_TABS.includes(t) && !isAuthenticated) return 'tournaments';
    return t || 'tournaments';
  }

  const [activeTab, setActiveTab] = useState<EventTab>(() =>
    resolveTab(searchParams.get('tab'))
  );

  // Si el usuario cierra sesión estando en una tab protegida → volver a tournaments
  useEffect(() => {
    if (AUTH_TABS.includes(activeTab) && !isAuthenticated) {
      setActiveTab('tournaments');
      setSearchParams({ tab: 'tournaments' });
    }
  }, [isAuthenticated, activeTab, setSearchParams]);

  const handleTabChange = (tab: EventTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  if (!currentCommunity) {
    return (
      <div className="events-page">
        <div className="events-content">
          <p className="text-secondary">Loading community...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="events-page">
      <EventsSidebar activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="events-content">
        {activeTab === 'tournaments' && <TournamentsTab />}
        {activeTab === 'leagues' && <LeaguesTab />}
        {activeTab === 'ranked' && isAuthenticated && <RankedTab />}
        {activeTab === 'history' && isAuthenticated && <HistoryTab />}
      </div>
    </div>
  );
}

export default EventsPage;
