/**
 * start.gg OAuth & integration routes
 *
 * GET    /api/startgg/auth/url        — genera la URL de autorización OAuth
 * POST   /api/startgg/auth/callback   — intercambia code por token + guarda IDs en el user
 * DELETE /api/startgg/auth/disconnect — desvincula la cuenta de start.gg
 * GET    /api/startgg/me              — devuelve los campos startgg del usuario actual
 */

import { Router } from 'express';
import { requireAuth } from '../utils/jwtMiddleware.js';
import { requireAdmin } from '../utils/jwtMiddleware.js';
import { isAdminInCommunity } from '../utils/communityScope.js';
import { users } from '../db/collections.js';
import {
  previewTournament,
  importEvent,
  normalizeTournamentSlug,
  enrichWithCharacters,
  loadCharMap,
  saveCharMap,
} from '../services/startggImporter.js';

const router = Router();

const CLIENT_ID     = process.env.STARTGG_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.STARTGG_OAUTH_CLIENT_SECRET;
const REDIRECT_URI  = process.env.STARTGG_REDIRECT_URI || 'http://localhost:5173/auth/startgg/callback';
const STARTGG_API   = 'https://api.start.gg/gql/alpha';
const SCOPES        = 'user.identity';

// ── GET /api/startgg/auth/url ─────────────────────────────────────────────
// Devuelve la URL de autorización de start.gg para redirigir al usuario.

router.get('/auth/url', requireAuth, (req, res) => {
  if (!CLIENT_ID) {
    return res.status(500).json({ error: 'start.gg OAuth not configured (missing STARTGG_OAUTH_CLIENT_ID)' });
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     CLIENT_ID,
    scope:         SCOPES,
    redirect_uri:  REDIRECT_URI,
  });

  res.json({ url: `https://start.gg/oauth/authorize?${params.toString()}` });
});

// ── POST /api/startgg/auth/callback ──────────────────────────────────────
// Recibe el code del frontend, lo canjea por un access_token,
// consulta currentUser en start.gg y guarda los IDs en el user local.

router.post('/auth/callback', requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Missing authorization code' });

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'start.gg OAuth not configured' });
  }

  try {
    // 1. Canjear code por access_token
    const tokenRes = await fetch('https://api.start.gg/oauth/access_token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type:    'authorization_code',
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        scope:         SCOPES,
        redirect_uri:  REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error('[startgg] Token exchange failed:', tokenRes.status, detail);
      return res.status(400).json({ error: 'Token exchange failed', detail });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return res.status(400).json({ error: 'No access_token in start.gg response' });
    }

    // 2. Obtener perfil del usuario en start.gg
    const profileRes = await fetch(STARTGG_API, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        query: `{
          currentUser {
            id
            slug
            player {
              id
              gamerTag
            }
          }
        }`,
      }),
    });

    const profileData = await profileRes.json();
    const startggUser = profileData?.data?.currentUser;

    if (!startggUser) {
      console.error('[startgg] Could not fetch currentUser:', JSON.stringify(profileData));
      return res.status(400).json({ error: 'Could not fetch start.gg user profile' });
    }

    // 3. Guardar IDs en el usuario local
    const user = await users.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Local user not found' });

    user.startggUserId   = startggUser.id ?? null;
    user.startggPlayerId = startggUser.player?.id ?? null;
    user.startggSlug     = startggUser.slug ?? null;
    user.startggGamerTag = startggUser.player?.gamerTag ?? null;

    await users.upsert(user);

    res.json({
      startggUserId:   user.startggUserId,
      startggPlayerId: user.startggPlayerId,
      startggSlug:     user.startggSlug,
      startggGamerTag: user.startggGamerTag,
    });
  } catch (err) {
    console.error('[startgg] OAuth callback error:', err);
    res.status(500).json({ error: 'Internal error during start.gg connection' });
  }
});

// ── DELETE /api/startgg/auth/disconnect ──────────────────────────────────
// Elimina el vínculo con start.gg del usuario actual.

router.delete('/auth/disconnect', requireAuth, async (req, res) => {
  const user = await users.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  delete user.startggUserId;
  delete user.startggPlayerId;
  delete user.startggSlug;
  delete user.startggGamerTag;

  await users.upsert(user);
  res.json({ ok: true });
});

// ── GET /api/startgg/me ───────────────────────────────────────────────────
// Devuelve el estado de vinculación start.gg del usuario autenticado.

router.get('/me', requireAuth, async (req, res) => {
  const user = await users.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    linked: !!user.startggUserId,
    startggUserId:   user.startggUserId   ?? null,
    startggPlayerId: user.startggPlayerId ?? null,
    startggSlug:     user.startggSlug     ?? null,
    startggGamerTag: user.startggGamerTag ?? null,
  });
});

// ── POST /api/startgg/import/preview ─────────────────────────────────────
// Preview de un torneo: devuelve metadata + lista de eventos para elegir.
// Requiere ser admin de la comunidad.

router.post('/import/preview', requireAuth, requireAdmin, async (req, res) => {
  const { slug } = req.body;
  if (!slug) return res.status(400).json({ error: 'Falta el slug del torneo' });

  try {
    const data = await previewTournament(slug);
    res.json({
      id:           data.id,
      name:         data.name,
      slug:         data.slug,
      startAt:      data.startAt,
      endAt:        data.endAt,
      numAttendees: data.numAttendees,
      normalizedSlug: normalizeTournamentSlug(slug),
      events: (data.events ?? []).map((e) => ({
        id:          e.id,
        name:        e.name,
        type:        e.type,
        numEntrants: e.numEntrants,
        videogame:   e.videogame,
      })),
    });
  } catch (err) {
    console.error('[startgg] Preview error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/startgg/import/event ───────────────────────────────────────
// Importa un evento concreto al sistema local.
// Requiere ser admin de la comunidad destino.

router.post('/import/event', requireAuth, requireAdmin, async (req, res) => {
  const { slug, eventId, communityId } = req.body;
  if (!slug || !eventId || !communityId) {
    return res.status(400).json({ error: 'Faltan campos: slug, eventId, communityId' });
  }

  // Verificar que el user es admin de la communidad destino
  const isAdmin = req.user.role === 'superadmin' || isAdminInCommunity(req.user, communityId);
  if (!isAdmin) {
    return res.status(403).json({ error: 'No tienes permisos sobre esta comunidad' });
  }

  try {
    const summary = await importEvent(slug, eventId, communityId);
    res.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[startgg] Import error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET  /api/startgg/char-map ────────────────────────────────────────────
// Devuelve el mapeo completo startgg charId → localCharId
router.get('/char-map', requireAuth, requireAdmin, (req, res) => {
  try {
    const map = loadCharMap();
    // Quitar el campo _comment antes de enviar
    const { _comment: _c, ...clean } = map;
    res.json(clean);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT  /api/startgg/char-map ────────────────────────────────────────────
// Guarda el mapeo completo
router.put('/char-map', requireAuth, requireAdmin, (req, res) => {
  try {
    const incoming = req.body;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'Body inválido' });
    }
    const current = loadCharMap();
    // Mergear (no reemplazar) para preservar el _comment
    const merged = { ...current, ...incoming };
    saveCharMap(merged);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/startgg/import/characters ───────────────────────────────────
// Enriquece un torneo ya importado con datos de personajes.
router.post('/import/characters', requireAuth, requireAdmin, async (req, res) => {
  const { tournamentId, eventId, gameId, communityId } = req.body;
  if (!tournamentId || !eventId || !gameId || !communityId) {
    return res.status(400).json({ error: 'Faltan campos: tournamentId, eventId, gameId, communityId' });
  }
  const isAdmin = req.user.role === 'superadmin' || isAdminInCommunity(req.user, communityId);
  if (!isAdmin) return res.status(403).json({ error: 'Sin permisos' });

  try {
    const summary = await enrichWithCharacters(tournamentId, eventId, gameId);
    res.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[startgg] Char enrichment error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/startgg/imported?communityId=... ─────────────────────────────
// Lista los torneos ya importados desde start.gg en una comunidad.

router.get('/imported', requireAuth, async (req, res) => {
  const { communityId } = req.query;
  if (!communityId) return res.status(400).json({ error: 'Falta communityId' });

  try {
    const { tournaments } = await import('../db/collections.js');
    const all = await tournaments.getAll();
    const imported = all.filter(
      (t) => t.importedFrom === 'startgg' && t.communityId === communityId
    ).map((t) => ({
      id:              t.id,
      name:            t.name,
      startggSlug:     t.startggSlug,
      startggEventId:  t.startggEventId,
      importedAt:      t.importedAt,
      entrants:        t.totalParticipants,
      gameId:          t.gameId,
      status:          t.status,
      completedAt:     t.completedAt,
    }));
    res.json(imported);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
