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

const PORT = 3001;

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }));
app.use(express.json({ limit: '10mb' }));

// ── Health ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '1.0' });
});

// ── Routes ──────────────────────────────────────────────────────────────
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/participants', participantsRouter);
app.use('/api/ranking', rankingRouter);

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
  console.log(`    GET        /api/ranking`);
  console.log(`    POST       /api/ranking/match`);
  console.log(`    GET/DEL    /api/ranking/matches`);
  console.log('');
});
