/**
 * Tournaments routes
 *
 * GET    /api/tournaments           — list all
 * GET    /api/tournaments/:id       — get one
 * POST   /api/tournaments           — replace full array (bulk sync from frontend)
 * PUT    /api/tournaments/:id       — upsert one tournament
 * DELETE /api/tournaments/:id       — delete one tournament
 * DELETE /api/tournaments           — clear all
 */

import { Router } from 'express';
import { tournaments, tournamentMatches } from '../db/collections.js';
import { validateTournament } from '../models/tournament.js';
import { applyTournamentElo } from '../utils/tournamentElo.js';
import { requireAuth, requireAdmin, requireSuperAdmin, optionalAuth } from '../utils/jwtMiddleware.js';
import { filterByCommunity, getTargetCommunityId, isInUserScope } from '../utils/communityScope.js';

const router = Router();

// GET /api/tournaments?communityId=...
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { communityId } = req.query;
    const data = await tournaments.getAll();
    const filtered = filterByCommunity(req.user, data, communityId);
    res.json(filtered);
  } catch (err) {
    console.error('[Tournaments] GET / error:', err);
    res.status(500).json({ error: 'Failed to read tournaments' });
  }
});

// ── Tournament Match records (for history) — registered BEFORE /:id to avoid capture

// GET /api/tournaments/matches?communityId=...
router.get('/matches', optionalAuth, async (req, res) => {
  try {
    const { communityId } = req.query;
    const all = await tournamentMatches.getAll();
    res.json(filterByCommunity(req.user, all, communityId));
  } catch (err) {
    console.error('[Tournaments] GET /matches error:', err);
    res.status(500).json({ error: 'Failed to read tournament matches' });
  }
});

// GET /api/tournaments/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const tournament = await tournaments.findById(req.params.id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    if (!isInUserScope(req.user, tournament.communityId)) {
      return res.status(403).json({ error: 'Tournament is not in your community scope' });
    }
    res.json(tournament);
  } catch (err) {
    console.error('[Tournaments] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to read tournament' });
  }
});

// POST /api/tournaments — replace full array (used by bulk sync)
// Also detects any tournament that just transitioned to 'completed' and
// applies ELO placement points automatically.
router.post('/', requireAuth, async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Body must be an array of tournaments' });
    }

    const existing = await tournaments.getAll();
    const existingMap = new Map(existing.map((t) => [t.id, t]));

    const updatedBody = [];
    const eloAppliedIds = [];

    for (const t of req.body) {
      const prev = existingMap.get(t.id);
      const targetCommunityId = prev?.communityId || getTargetCommunityId(req.user, t.communityId);
      if (!isInUserScope(req.user, targetCommunityId)) {
        return res.status(403).json({ error: 'Cannot modify a tournament outside your community scope' });
      }
      t.communityId = targetCommunityId;
      const becomesCompleted = t.status === 'completed' && (!prev || prev.status !== 'completed');
      const alreadyApplied   = t.eloApplied || (prev && prev.eloApplied);

      if (becomesCompleted && !alreadyApplied && t.givesPoints !== false) {
        const updates = await applyTournamentElo(t);
        t.eloApplied = true;
        t.eloUpdates = updates;
        eloAppliedIds.push(t.id);
        console.log(`[Tournaments] ELO applied for ${t.id}: ${updates.length} participants`);
      } else if (becomesCompleted && !alreadyApplied) {
        t.eloApplied = true;
        t.eloUpdates = [];
        console.log(`[Tournaments] ELO skipped for ${t.id}: givesPoints=false`);
      }

      updatedBody.push(t);
    }

    await tournaments.replaceAll(updatedBody);

    res.json({
      ok: true,
      count: updatedBody.length,
      eloApplied: eloAppliedIds,
    });
  } catch (err) {
    console.error('[Tournaments] POST / error:', err);
    res.status(500).json({ error: 'Failed to save tournaments' });
  }
});

// PUT /api/tournaments/:id — upsert one
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const body = req.body;

    if (body.id && body.id !== req.params.id) {
      return res.status(400).json({ error: 'ID in body does not match URL' });
    }

    body.id = req.params.id;

    const { valid, errors } = validateTournament(body);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid tournament data', details: errors });
    }

    const existing = await tournaments.findById(req.params.id);

    // Community scope: cannot modify/create a tournament outside your community
    const targetCommunityId = existing?.communityId || getTargetCommunityId(req.user, body.communityId);
    if (!isInUserScope(req.user, targetCommunityId)) {
      return res.status(403).json({ error: 'Tournament is not in your community scope' });
    }
    body.communityId = targetCommunityId;

    // When a tournament transitions to 'completed', award ELO points for placements once.
    const becomesCompleted = body.status === 'completed' && (!existing || existing.status !== 'completed');
    const alreadyApplied   = body.eloApplied || (existing && existing.eloApplied);

    if (becomesCompleted && !alreadyApplied && body.givesPoints !== false) {
      const tournamentToApply = { ...body, status: 'completed' };
      const eloUpdates = await applyTournamentElo(tournamentToApply);
      body.eloApplied = true;
      body.eloUpdates = eloUpdates;
      console.log(`[Tournaments] ELO applied for ${req.params.id}: ${eloUpdates.length} participants`);
    } else if (becomesCompleted && !alreadyApplied) {
      body.eloApplied = true;
      body.eloUpdates = [];
      console.log(`[Tournaments] ELO skipped for ${req.params.id}: givesPoints=false`);
    }

    const saved = await tournaments.upsert(body);
    res.json(saved);
  } catch (err) {
    console.error('[Tournaments] PUT /:id error:', err);
    res.status(500).json({ error: 'Failed to save tournament' });
  }
});

// DELETE /api/tournaments/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const tournament = await tournaments.findById(req.params.id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    if (!isInUserScope(req.user, tournament.communityId)) {
      return res.status(403).json({ error: 'Tournament is not in your community scope' });
    }
    const deleted = await tournaments.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Tournament not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Tournaments] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete tournament' });
  }
});

// DELETE /api/tournaments — clear all (superadmin only)
router.delete('/', requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    await tournaments.clear();
    res.json({ ok: true });
  } catch (err) {
    console.error('[Tournaments] DELETE / error:', err);
    res.status(500).json({ error: 'Failed to clear tournaments' });
  }
});

// GET /api/tournaments/:id/matches
router.get('/:id/matches', async (req, res) => {
  try {
    const all = await tournamentMatches.getAll();
    const filtered = all.filter(m => m.tournamentId === req.params.id);
    res.json(filtered);
  } catch (err) {
    console.error('[Tournaments] GET /:id/matches error:', err);
    res.status(500).json({ error: 'Failed to read tournament matches' });
  }
});

// POST /api/tournaments/:id/matches
router.post('/:id/matches', requireAuth, async (req, res) => {
  try {
    const match = req.body;
    if (!match.tournamentId || !match.player1Id || !match.player2Id || !match.winnerId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    await tournamentMatches.upsert(match);
    res.status(201).json(match);
  } catch (err) {
    console.error('[Tournaments] POST /:id/matches error:', err);
    res.status(500).json({ error: 'Failed to record tournament match' });
  }
});

export default router;
