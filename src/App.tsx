import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard/Dashboard';
import CreateTournament from './pages/CreateTournament/CreateTournament';
import TournamentView from './pages/Tournament/TournamentView';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/create" element={<CreateTournament />} />
        <Route path="/create/:id" element={<CreateTournament />} />
        <Route path="/tournament/:id" element={<TournamentView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
