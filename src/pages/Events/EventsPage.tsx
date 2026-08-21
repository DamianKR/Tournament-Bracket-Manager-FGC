import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import EventsSidebar from './EventsSidebar';
import TournamentsTab from './Tournaments/TournamentsTab';
import LeaguesTab from './Leagues/LeaguesTab';
import RankedTab from './Ranked/RankedTab';
import HistoryTab from './History/HistoryTab';
import './EventsPage.css';

export type EventTab = 'tournaments' | 'leagues' | 'ranked' | 'history';

function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as EventTab | null;
  const [activeTab, setActiveTab] = useState<EventTab>(tabParam || 'tournaments');

  const handleTabChange = (tab: EventTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="events-page">
      <EventsSidebar activeTab={activeTab} onTabChange={handleTabChange} />
      
      <div className="events-content">
        {activeTab === 'tournaments' && <TournamentsTab />}
        {activeTab === 'leagues' && <LeaguesTab />}
        {activeTab === 'ranked' && <RankedTab />}
        {activeTab === 'history' && <HistoryTab />}
      </div>
    </div>
  );
}

export default EventsPage;
