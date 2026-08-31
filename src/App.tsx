import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Header from './components/Header/Header';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import AdminRoute from './components/AdminRoute/AdminRoute';
import NotificationToast from './components/Notifications/NotificationToast';
import EventsPage from './pages/Events/EventsPage';
import CreateTournament from './pages/CreateTournament/CreateTournament';
import TournamentView from './pages/Tournament/TournamentView';
import CreateLeague from './pages/Leagues/CreateLeague';
import LeagueView from './pages/Leagues/LeagueView';
import ParticipantsPage from './pages/Participants/ParticipantsPage';
import ParticipantProfile from './pages/Participants/ParticipantProfile';
import RankingPage from './pages/Ranking/RankingPage';
import LoginPage from './pages/Login/LoginPage';
import Dashboard from './pages/Dashboard/Dashboard';
import NotificationsPage from './pages/Notifications/NotificationsPage';

function App() {
  // En GitHub Pages el sitio vive en /Tournament-Bracket-Manager-FGC/.
  // Vite expone la base configurada como BASE_URL; BrowserRouter necesita
  // ese prefijo para resolver rutas correctamente.
  // En local BASE_URL es './' → normalizamos a '/' para que no haya prefijo.
  const rawBase = import.meta.env.BASE_URL as string;
  const basename = rawBase === './' || rawBase === '/' ? '/' : rawBase.replace(/\/$/, '');

  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <NotificationProvider>
          <Header />
          <NotificationToast />
          <Routes>
          {/* Auth */}
          <Route path="/login" element={<LoginPage />} />

          {/* Dashboard - landing page pública */}
          <Route path="/" element={<Dashboard />} />

          {/* Events - main hub (público, las sub-tabs se gestionan internamente) */}
          <Route path="/events" element={<EventsPage />} />

          {/* Tournaments — solo usuarios autenticados pueden crear/editar */}
          <Route path="/events/tournaments/create" element={
            <ProtectedRoute><CreateTournament /></ProtectedRoute>
          } />
          <Route path="/events/tournaments/create/:id" element={
            <ProtectedRoute><CreateTournament /></ProtectedRoute>
          } />
          <Route path="/events/tournaments/:id" element={<TournamentView />} />

          {/* Leagues — solo admin puede crear */}
          <Route path="/events/leagues/create" element={
            <AdminRoute><CreateLeague /></AdminRoute>
          } />
          <Route path="/events/leagues/:id" element={<LeagueView />} />

          {/* Participants — gestión solo para admin; perfiles son públicos */}
          <Route path="/participants" element={
            <AdminRoute><ParticipantsPage /></AdminRoute>
          } />
          <Route path="/participants/:id" element={<ParticipantProfile />} />

          {/* Ranking — público */}
          <Route path="/ranking" element={<RankingPage />} />

          {/* Notifications — solo usuarios autenticados */}
          <Route path="/notifications" element={
            <ProtectedRoute><NotificationsPage /></ProtectedRoute>
          } />

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
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
