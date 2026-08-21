import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header/Header';
import EventsPage from './pages/Events/EventsPage';
import CreateTournament from './pages/CreateTournament/CreateTournament';
import TournamentView from './pages/Tournament/TournamentView';
import CreateLeague from './pages/Leagues/CreateLeague';
import LeagueView from './pages/Leagues/LeagueView';
import ParticipantsPage from './pages/Participants/ParticipantsPage';
import ParticipantProfile from './pages/Participants/ParticipantProfile';
import RankingPage from './pages/Ranking/RankingPage';

function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        {/* Events - main hub */}
        <Route path="/" element={<Navigate to="/events" replace />} />
        <Route path="/events" element={<EventsPage />} />
        
        {/* Tournaments */}
        <Route path="/events/tournaments/create" element={<CreateTournament />} />
        <Route path="/events/tournaments/create/:id" element={<CreateTournament />} />
        <Route path="/events/tournaments/:id" element={<TournamentView />} />
        
        {/* Leagues */}
        <Route path="/events/leagues/create" element={<CreateLeague />} />
        <Route path="/events/leagues/:id" element={<LeagueView />} />
        
        {/* Participants */}
        <Route path="/participants" element={<ParticipantsPage />} />
        <Route path="/participants/:id" element={<ParticipantProfile />} />
        
        {/* Ranking */}
        <Route path="/ranking" element={<RankingPage />} />
        
        {/* Legacy redirects */}
        <Route path="/create" element={<Navigate to="/events/tournaments/create" replace />} />
        <Route path="/create/:id" element={<Navigate to="/events/tournaments/create/:id" replace />} />
        <Route path="/tournament/:id" element={<Navigate to="/events/tournaments/:id" replace />} />
        <Route path="/leagues" element={<Navigate to="/events?tab=leagues" replace />} />
        <Route path="/leagues/create" element={<Navigate to="/events/leagues/create" replace />} />
        <Route path="/leagues/:id" element={<Navigate to="/events/leagues/:id" replace />} />
        
        {/* 404 */}
        <Route path="*" element={<Navigate to="/events" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
