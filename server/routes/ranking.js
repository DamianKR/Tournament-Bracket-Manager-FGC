/**
 * Ranking routes
 *
 * GET  /api/ranking         — Leaderboard (all participants sorted by ELO, with Legend tier)
 * GET  /api/ranking/matches — Full match history
 * GET  /api/ranking/matches/:participantId — Match history for one participant
 * POST /api/ranking/match   — Record a match result, update ELO for both players
 * DELETE /api/ranking/matches/:matchId — Delete a match record (does NOT revert ELO)
 */

import { Router } from 'express';
import { participants, matches } from '../db/collections.js';
import { calculateElo, getRankName, applyLegendTier } from '../utils/eloEngine.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────

function generateId(prefix = 'm') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Ensures a participant has ELO fields (migration for old records). */
function ensureElo(p) {
  return {
    ...p,
    eloPoints: p.eloPoints ?? 1500,
    eloRank:   p.eloRank   ?? getRankName(p.eloPoints ?? 1500),
  };
}

// ── GET /api/ranking — Leaderboard ────────────────────────────────────────

router.get('/', async (_req, res) => {
  try {
    const all = (await participants.getAll()).map(ensureElo);

    // Sort by ELO descending
    const sorted = [...all].sort((a, b) => b.eloPoints - a.eloPoints);

    // Apply Legend tier to top 5
    const leaderboard = applyLegendTier(sorted).map((p, i) => ({
      position:    i + 1,
      id:          p.id,
      name:        p.name,
      alias:       p.alias,
      avatarUrl:   p.avatarUrl,
      eloPoints:   p.eloPoints,
      eloRank:     p.eloRank,
      displayRank: p.displayRank,
      gameId:      p.gameId,
      mainCharacterId: p.mainCharacterId,
    }));

    res.json(leaderboard);
  } catch (err) {
    console.error('[Ranking] GET / error:', err);
    res.status(500).json({ error: 'Failed to load ranking' });
  }
});

// ── GET /api/ranking/matches — Full match history ─────────────────────────

router.get('/matches', async (_req, res) => {
  try {
    const all = await matches.getAll();
    // Sort newest first
    const sorted = [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(sorted);
  } catch (err) {
    console.error('[Ranking] GET /matches error:', err);
    res.status(500).json({ error: 'Failed to load matches' });
  }
});

// ── GET /api/ranking/matches/:participantId — Matches for one player ───────

router.get('/matches/:participantId', async (req, res) => {
  try {
    const { participantId } = req.params;
    const all = await matches.getAll();
    const filtered = all
      .filter((m) => m.playerAId === participantId || m.playerBId === participantId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(filtered);
  } catch (err) {
    console.error('[Ranking] GET /matches/:id error:', err);
    res.status(500).json({ error: 'Failed to load matches for participant' });
  }
});

// ── POST /api/ranking/match — Record result & update ELO ─────────────────
//
// Body: { playerAId: string, playerBId: string, winnerId: string }
// winnerId must be either playerAId or playerBId.

router.post('/match', async (req, res) => {
  try {
    const { playerAId, playerBId, winnerId } = req.body;

    // Validate input
    if (!playerAId || !playerBId || !winnerId) {
      return res.status(400).json({ error: 'playerAId, playerBId and winnerId are required' });
    }
    if (playerAId === playerBId) {
      return res.status(400).json({ error: 'A player cannot face themselves' });
    }
    if (winnerId !== playerAId && winnerId !== playerBId) {
      return res.status(400).json({ error: 'winnerId must be either playerAId or playerBId' });
    }

    // Load both participants
    const [rawA, rawB] = await Promise.all([
      participants.findById(playerAId),
      participants.findById(playerBId),
    ]);

    if (!rawA) return res.status(404).json({ error: `Participant not found: ${playerAId}` });
    if (!rawB) return res.status(404).json({ error: `Participant not found: ${playerBId}` });

    const pA = ensureElo(rawA);
    const pB = ensureElo(rawB);

    // Calculate ELO
    const winner = winnerId === playerAId ? 'A' : 'B';
    const { newRA, newRB, deltaA, deltaB } = calculateElo(pA.eloPoints, pB.eloPoints, winner);

    const newRankA = getRankName(newRA);
    const newRankB = getRankName(newRB);

    // Build match record
    const matchRecord = {
      id: generateId('m'),
      playerAId,
      playerBId,
      winnerId,
      loserId: winnerId === playerAId ? playerBId : playerAId,
      playerAPointsBefore: pA.eloPoints,
      playerBPointsBefore: pB.eloPoints,
      playerAPointsAfter: newRA,
      playerBPointsAfter: newRB,
      playerADelta: deltaA,
      playerBDelta: deltaB,
      playerARankBefore: pA.eloRank,
      playerBRankBefore: pB.eloRank,
      playerARankAfter: newRankA,
      playerBRankAfter: newRankB,
      createdAt: new Date().toISOString(),
    };

    // Update participants
    const updatedA = {
      ...pA,
      eloPoints: newRA,
      eloRank: newRankA,
      updatedAt: new Date().toISOString(),
    };
    const updatedB = {
      ...pB,
      eloPoints: newRB,
      eloRank: newRankB,
      updatedAt: new Date().toISOString(),
    };

    // Persist everything
    await Promise.all([
      participants.upsert(updatedA),
      participants.upsert(updatedB),
      matches.upsert(matchRecord),
    ]);

    res.status(201).json({
      match: matchRecord,
      playerA: { id: pA.id, name: pA.name, pointsBefore: pA.eloPoints, pointsAfter: newRA, delta: deltaA, rankBefore: pA.eloRank, rankAfter: newRankA },
      playerB: { id: pB.id, name: pB.name, pointsBefore: pB.eloPoints, pointsAfter: newRB, delta: deltaB, rankBefore: pB.eloRank, rankAfter: newRankB },
    });
  } catch (err) {
    console.error('[Ranking] POST /match error:', err);
    res.status(500).json({ error: 'Failed to record match' });
  }
});

// ── DELETE /api/ranking/matches/:matchId ──────────────────────────────────

router.delete('/matches/:matchId', async (req, res) => {
  try {
    const deleted = await matches.remove(req.params.matchId);
    if (!deleted) return res.status(404).json({ error: 'Match not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Ranking] DELETE /matches/:id error:', err);
    res.status(500).json({ error: 'Failed to delete match' });
  }
});

export default router;
