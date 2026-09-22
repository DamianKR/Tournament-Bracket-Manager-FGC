import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import EventsSidebar from './EventsSidebar';
import TournamentsTab from './Tournaments/TournamentsTab';
import LeaguesTab from './Leagues/LeaguesTab';
import RankedTab from './Ranked/RankedTab';
import HistoryTab from './History/HistoryTab';
import Loading from '@/components/Loading/Loading';
import './EventsPage.css';

export type EventTab = 'tournaments' | 'leagues' | 'ranked' | 'history';

// Tabs que requieren autenticación
const AUTH_TABS: EventTab[] = ['ranked', 'history'];

function EventsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { currentCommunity, isFeatureEnabled } = useCommunity();

  // Tab → feature flag de comunidad (history siempre disponible)
  function tabEnabled(tab: EventTab): boolean {
    if (tab === 'tournaments') return isFeatureEnabled('tournaments');
    if (tab === 'leagues') return isFeatureEnabled('leagues');
    if (tab === 'ranked') return isFeatureEnabled('duels') || isFeatureEnabled('matchmaking');
    return true;
  }

  function firstEnabled(): EventTab {
    return (['tournaments', 'leagues', 'ranked', 'history'] as EventTab[]).find(tabEnabled) ?? 'history';
  }

  function resolveTab(param: string | null): EventTab {
    const t = param as EventTab | null;
    // Si la tab requiere auth y el user no está autenticado → fallback
    if (t && AUTH_TABS.includes(t) && !isAuthenticated) return firstEnabled();
    if (t && !tabEnabled(t)) return firstEnabled();
    return t || firstEnabled();
  }

  const [activeTab, setActiveTab] = useState<EventTab>(() =>
    resolveTab(searchParams.get('tab'))
  );

  // Si el usuario cierra sesión estando en una tab protegida, o la comunidad
  // deshabilita la tab activa → saltar a la primera habilitada
  useEffect(() => {
    if ((AUTH_TABS.includes(activeTab) && !isAuthenticated) || !tabEnabled(activeTab)) {
      const next = firstEnabled();
      setActiveTab(next);
      setSearchParams({ tab: next });
    }
  }, [isAuthenticated, activeTab, setSearchParams, currentCommunity]);

  const handleTabChange = (tab: EventTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  if (!currentCommunity) {
    return (
      <div className="events-page">
        <div className="events-content">
          <Loading message={t('events.loadingCommunity')} />
        </div>
      </div>
    );
  }

  return (
    <div className="events-page">
      <EventsSidebar activeTab={activeTab} onTabChange={handleTabChange} />

      <div className="events-content">
        {activeTab === 'tournaments' && tabEnabled('tournaments') && <TournamentsTab />}
        {activeTab === 'leagues' && tabEnabled('leagues') && <LeaguesTab />}
        {activeTab === 'ranked' && isAuthenticated && tabEnabled('ranked') && <RankedTab />}
        {activeTab === 'history' && isAuthenticated && <HistoryTab />}
      </div>
    </div>
  );
}

export default EventsPage;
