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
import { users } from '../db/collections.js';

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

export default router;
