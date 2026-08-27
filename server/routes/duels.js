/**
 * Duels routes
 *
 * GET    /api/duels              — list all challenges
 * GET    /api/duels/active       — list active challenges (pending/accepted)
 * GET    /api/duels/:id          — get one challenge
 * POST   /api/duels              — create new challenge
 * PUT    /api/duels/:id/accept   — accept challenge
 * PUT    /api/duels/:id/decline  — decline challenge
 * PUT    /api/duels/:id/complete — complete challenge (link to match)
 * DELETE /api/duels/:id          — delete challenge
 *
 * GET    /api/duels/settings     — get duel settings
 * PUT    /api/duels/settings     — update duel settings
 */

import { Router } from 'express';
import { duels, duelSettings } from '../db/collections.js';
import { duelChallengeShape, validateDuelChallenge, duelSettingsShape } from '../models/duel.js';
import { requireAuth, requireAdmin } from '../utils/jwtMiddleware.js';

const router = Router();

// ── Settings ──────────────────────────────────────────────────────────────

// GET /api/duels/settings
router.get('/settings', async (_req, res) => {
  try {
    const all = await duelSettings.getAll();
    const settings = all.find(s => s.id === 'default') || duelSettingsShape();
    res.json(settings);
  } catch (err) {
    console.error('[Duels] GET /settings error:', err);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

// PUT /api/duels/settings
router.put('/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const updated = { id: 'default', ...req.body };
    await duelSettings.upsert(updated);
    res.json(updated);
  } catch (err) {
    console.error('[Duels] PUT /settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ── Challenges ────────────────────────────────────────────────────────────

// GET /api/duels
router.get('/', async (_req, res) => {
  try {
    const data = await duels.getAll();
    res.json(data);
  } catch (err) {
    console.error('[Duels] GET / error:', err);
    res.status(500).json({ error: 'Failed to read challenges' });
  }
});

// GET /api/duels/active
router.get('/active', async (_req, res) => {
  try {
    const all = await duels.getAll();
    const active = all.filter(d => d.status === 'pending' || d.status === 'accepted');
    res.json(active);
  } catch (err) {
    console.error('[Duels] GET /active error:', err);
    res.status(500).json({ error: 'Failed to read active challenges' });
  }
});

// GET /api/duels/:id
router.get('/:id', async (req, res) => {
  try {
    const challenge = await duels.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    res.json(challenge);
  } catch (err) {
    console.error('[Duels] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to read challenge' });
  }
});

// POST /api/duels
router.post('/', requireAuth, async (req, res) => {
  try {
    const { id, challengerId, challengedId, expiresAt } = req.body;
    
    if (!id || !challengerId || !challengedId || !expiresAt) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const challenge = duelChallengeShape(id, challengerId, challengedId, expiresAt);
    const validation = validateDuelChallenge(challenge);
    
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid challenge', details: validation.errors });
    }

    await duels.upsert(challenge);
    res.status(201).json(challenge);
  } catch (err) {
    console.error('[Duels] POST / error:', err);
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

// PUT /api/duels/:id/accept
router.put('/:id/accept', requireAuth, async (req, res) => {
  try {
    const challenge = await duels.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    if (challenge.status !== 'pending') {
      return res.status(400).json({ error: 'Challenge is not pending' });
    }
    if (req.user.role !== 'admin' && req.user.participantId !== challenge.challengedId) {
      return res.status(403).json({ error: 'Only the challenged player or admin can accept' });
    }

    challenge.status = 'accepted';
    challenge.acceptedAt = new Date().toISOString();
    await duels.upsert(challenge);
    res.json(challenge);
  } catch (err) {
    console.error('[Duels] PUT /:id/accept error:', err);
    res.status(500).json({ error: 'Failed to accept challenge' });
  }
});

// PUT /api/duels/:id/decline
router.put('/:id/decline', requireAuth, async (req, res) => {
  try {
    const challenge = await duels.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    if (challenge.status !== 'pending') {
      return res.status(400).json({ error: 'Challenge is not pending' });
    }
    if (req.user.role !== 'admin' && req.user.participantId !== challenge.challengedId) {
      return res.status(403).json({ error: 'Only the challenged player or admin can decline' });
    }

    challenge.status = 'declined';
    challenge.declinedAt = new Date().toISOString();
    await duels.upsert(challenge);
    res.json(challenge);
  } catch (err) {
    console.error('[Duels] PUT /:id/decline error:', err);
    res.status(500).json({ error: 'Failed to decline challenge' });
  }
});

// PUT /api/duels/:id/complete
router.put('/:id/complete', requireAuth, requireAdmin, async (req, res) => {
  try {
    const challenge = await duels.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const { matchId } = req.body;
    if (!matchId) return res.status(400).json({ error: 'Missing matchId' });

    challenge.status = 'completed';
    challenge.matchId = matchId;
    challenge.completedAt = new Date().toISOString();
    await duels.upsert(challenge);
    res.json(challenge);
  } catch (err) {
    console.error('[Duels] PUT /:id/complete error:', err);
    res.status(500).json({ error: 'Failed to complete challenge' });
  }
});

// DELETE /api/duels/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await duels.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Challenge not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Duels] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete challenge' });
  }
});

export default router;
