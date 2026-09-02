/**
 * Local API server for Bracket Tournament Manager
 *
 * Runs alongside the Vite preview server when launched via Abrir_Aplicacion.bat.
 * Persists data to JSON files in /data/:
 *   data/tournaments.json
 *   data/participants.json
 *
 * Port: 3001  (Vite preview runs on 5173)
 *
 * Routes:
 *   /api/health          — status check
 *   /api/tournaments     — CRUD for tournaments
 *   /api/participants    — CRUD for global participants + stats
 */

import express from 'express';
import cors from 'cors';
import tournamentsRouter from './server/routes/tournaments.js';
import participantsRouter from './server/routes/participants.js';
import rankingRouter from './server/routes/ranking.js';
import leaguesRouter from './server/routes/leagues.js';
import duelsRouter from './server/routes/duels.js';
import rankedMatchesRouter from './server/routes/rankedMatches.js';
import authRouter from './server/routes/auth.js';
import notificationsRouter from './server/routes/notifications.js';
import communitiesRouter from './server/routes/communities.js';
import { expireAllOldDuels } from './server/services/duelExpiration.js';
import { expireAllOldLeagueMatches } from './server/services/leagueExpiration.js';
import { reschedulableLeagueNotifications } from './server/services/notificationScheduler.js';

// Render asigna el puerto via PORT; en local usamos 3001
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

// Orígenes permitidos:
// - Local:       localhost:5173 y localhost:5174
// - Producción:  CORS_ORIGINS (coma-separado) configurado en Render
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174'];

const app = express();
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '10mb' }));

// ── Health ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '1.0' });
});

// ── Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/participants', participantsRouter);
app.use('/api/ranking', rankingRouter);
app.use('/api/leagues', leaguesRouter);
app.use('/api/duels', duelsRouter);
app.use('/api/ranked-matches', rankedMatchesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/communities', communitiesRouter);

// GET /api/health — lightweight ping to keep Render free instance awake
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ── 404 fallback ────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Start ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('  Bracket Tournament Manager — Local API');
  console.log(`  http://localhost:${PORT}`);
  console.log('');
  console.log('  Endpoints:');
  console.log(`    GET/POST   /api/tournaments`);
  console.log(`    GET/PUT/DEL /api/tournaments/:id`);
  console.log(`    GET/POST   /api/participants`);
  console.log(`    GET/PUT/DEL /api/participants/:id`);
  console.log(`    POST       /api/participants/:id/stats`);
  console.log(`    GET        /api/participants/:id/tournaments`);
  console.log(`    GET        /api/participants/:id/league-stats`);
  console.log(`    GET        /api/ranking`);
  console.log(`    POST       /api/ranking/match`);
  console.log(`    GET/DEL    /api/ranking/matches`);
  console.log(`    GET/POST   /api/leagues`);
  console.log(`    GET/DEL    /api/leagues/:id`);
  console.log(`    GET        /api/leagues/:id/matches`);
  console.log(`    GET        /api/leagues/:id/standings`);
  console.log(`    POST       /api/leagues/:id/matches/:matchId/result`);
  console.log('');

  // Run duel expiration immediately on startup, then every 5 minutes
  expireAllOldDuels().then((count) => {
    if (count > 0) {
      console.log(`[DuelExpiration] Expired ${count} duels on startup`);
    }
  });

  // Run league match expiration every 12 hours (NOT on startup to avoid
  // accidentally touching match statuses right after a deploy).
  setInterval(() => {
    expireAllOldLeagueMatches().then((count) => {
      if (count > 0) {
        console.log(`[LeagueExpiration] Expired ${count} league matches`);
      }
    });
  }, 12 * 60 * 60 * 1000); // every 12 hours

  // Reschedule any pending league week notifications on startup (setTimeout is in-memory only)
  reschedulableLeagueNotifications().catch(err =>
    console.error('[Notifications] Failed to reschedule league week notifications:', err)
  );

  setInterval(() => {
    expireAllOldDuels().then((count) => {
      if (count > 0) {
        console.log(`[DuelExpiration] Expired ${count} duels`);
      }
    });
  }, 5 * 60 * 1000);
});
