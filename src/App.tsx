import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header/Header';
import Dashboard from './pages/Dashboard/Dashboard';
import CreateTournament from './pages/CreateTournament/CreateTournament';
import TournamentView from './pages/Tournament/TournamentView';
import ParticipantsPage from './pages/Participants/ParticipantsPage';
import ParticipantProfile from './pages/Participants/ParticipantProfile';
import RankingPage from './pages/Ranking/RankingPage';
import LeaguesPage from './pages/Leagues/LeaguesPage';
import CreateLeague from './pages/Leagues/CreateLeague';
import LeagueView from './pages/Leagues/LeagueView';

function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/create" element={<CreateTournament />} />
        <Route path="/create/:id" element={<CreateTournament />} />
        <Route path="/tournament/:id" element={<TournamentView />} />
        <Route path="/participants" element={<ParticipantsPage />} />
        <Route path="/participants/:id" element={<ParticipantProfile />} />
        <Route path="/ranking" element={<RankingPage />} />
        <Route path="/leagues" element={<LeaguesPage />} />
        <Route path="/leagues/create" element={<CreateLeague />} />
        <Route path="/leagues/:id" element={<LeagueView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
