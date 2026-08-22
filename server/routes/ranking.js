/**
 * Ranking routes
 *
 * Order matters in Express — fixed paths BEFORE parameterized paths.
 *
 * GET    /api/ranking                         — Leaderboard
 * GET    /api/ranking/matches                 — Full match history
 * POST   /api/ranking/match                   — Record a match result, update ELO
 * POST   /api/ranking/reset/hard              — Reset ALL participants to 1500, clear history
 * POST   /api/ranking/reset/soft              — Reset each participant to start of their tier
 * GET    /api/ranking/matches/:participantId  — Match history for one participant (wildcard last)
 * DELETE /api/ranking/matches/:matchId        — Delete a match record (no ELO revert)
 */

import { Router } from 'express';
import { participants, tournamentMatches } from '../db/collections.js';
import { calculateElo, getRankName, applyLegendTier, RANK_TIERS } from '../utils/eloEngine.js';

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
      position:        i + 1,
      id:              p.id,
      name:            p.name,
      alias:           p.alias,
      avatarUrl:       p.avatarUrl,
      eloPoints:       p.eloPoints,
      eloRank:         p.eloRank,
      displayRank:     p.displayRank,
      gameId:          p.gameId,
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
    const all = await tournamentMatches.getAll();
    const sorted = [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(sorted);
  } catch (err) {
    console.error('[Ranking] GET /matches error:', err);
    res.status(500).json({ error: 'Failed to load matches' });
  }
});

// ── POST /api/ranking/match — Record result & update ELO ─────────────────

router.post('/match', async (req, res) => {
  try {
    const { playerAId, playerBId, winnerId } = req.body;

    if (!playerAId || !playerBId || !winnerId) {
      return res.status(400).json({ error: 'playerAId, playerBId and winnerId are required' });
    }
    if (playerAId === playerBId) {
      return res.status(400).json({ error: 'A player cannot face themselves' });
    }
    if (winnerId !== playerAId && winnerId !== playerBId) {
      return res.status(400).json({ error: 'winnerId must be either playerAId or playerBId' });
    }

    const [rawA, rawB] = await Promise.all([
      participants.findById(playerAId),
      participants.findById(playerBId),
    ]);

    if (!rawA) return res.status(404).json({ error: `Participant not found: ${playerAId}` });
    if (!rawB) return res.status(404).json({ error: `Participant not found: ${playerBId}` });

    const pA = ensureElo(rawA);
    const pB = ensureElo(rawB);

    const winner = winnerId === playerAId ? 'A' : 'B';
    const { newRA, newRB, deltaA, deltaB } = calculateElo(pA.eloPoints, pB.eloPoints, winner);

    const newRankA = getRankName(newRA);
    const newRankB = getRankName(newRB);

    const matchRecord = {
      id: generateId('m'),
      playerAId,
      playerBId,
      winnerId,
      loserId: winnerId === playerAId ? playerBId : playerAId,
      playerAPointsBefore: pA.eloPoints,
      playerBPointsBefore: pB.eloPoints,
      playerAPointsAfter:  newRA,
      playerBPointsAfter:  newRB,
      playerADelta:        deltaA,
      playerBDelta:        deltaB,
      playerARankBefore:   pA.eloRank,
      playerBRankBefore:   pB.eloRank,
      playerARankAfter:    newRankA,
      playerBRankAfter:    newRankB,
      createdAt: new Date().toISOString(),
    };

    const updatedA = { ...pA, eloPoints: newRA, eloRank: newRankA, updatedAt: new Date().toISOString() };
    const updatedB = { ...pB, eloPoints: newRB, eloRank: newRankB, updatedAt: new Date().toISOString() };

    // IMPORTANT: upsert(A) and upsert(B) must be sequential — both read+write
    // the same JSON file, so running them in parallel causes a race condition
    // where the second write overwrites the first (loser stays at old ELO).
    // tournamentMatches.upsert is safe in parallel because it uses a different file.
    await participants.upsert(updatedA);
    await participants.upsert(updatedB);
    await tournamentMatches.upsert(matchRecord);

    // Return full updated participant objects so the frontend can sync localStorage
    res.status(201).json({
      match:      matchRecord,
      playerA:    { id: pA.id, name: pA.name, pointsBefore: pA.eloPoints, pointsAfter: newRA, delta: deltaA, rankBefore: pA.eloRank, rankAfter: newRankA },
      playerB:    { id: pB.id, name: pB.name, pointsBefore: pB.eloPoints, pointsAfter: newRB, delta: deltaB, rankBefore: pB.eloRank, rankAfter: newRankB },
      updatedParticipantA: updatedA,
      updatedParticipantB: updatedB,
    });
  } catch (err) {
    console.error('[Ranking] POST /match error:', err);
    res.status(500).json({ error: 'Failed to record match' });
  }
});

// ── POST /api/ranking/reset/hard ──────────────────────────────────────────
// Must be registered BEFORE /matches/:participantId to avoid wildcard capture.

router.post('/reset/hard', async (req, res) => {
  try {
    const all = await participants.getAll();
    const resetPoints = 1500;
    const resetRank   = getRankName(resetPoints);

    const updated = all.map((p) => ({
      ...p,
      eloPoints: resetPoints,
      eloRank:   resetRank,
      updatedAt: new Date().toISOString(),
    }));

    await participants.replaceAll(updated);
    await tournamentMatches.clear();

    res.json({
      ok: true,
      affectedParticipants: updated.length,
      updatedParticipants: updated,
      message: 'Hard reset: all players returned to 1500 pts. Match history cleared.',
    });
  } catch (err) {
    console.error('[Ranking] POST /reset/hard error:', err);
    res.status(500).json({ error: 'Failed to perform hard reset' });
  }
});

// ── POST /api/ranking/reset/soft ──────────────────────────────────────────
// Must be registered BEFORE /matches/:participantId to avoid wildcard capture.

router.post('/reset/soft', async (req, res) => {
  try {
    const all = await participants.getAll();

    const updated = all.map((p) => {
      const pts  = p.eloPoints ?? 1500;
      const tier = [...RANK_TIERS].reverse().find((t) => pts >= t.min) ?? RANK_TIERS[0];
      return {
        ...p,
        eloPoints: tier.min,
        eloRank:   tier.name,
        updatedAt: new Date().toISOString(),
      };
    });

    await participants.replaceAll(updated);

    res.json({
      ok: true,
      affectedParticipants: updated.length,
      updatedParticipants: updated,
      message: 'Soft reset: all players returned to start of their current tier.',
    });
  } catch (err) {
    console.error('[Ranking] POST /reset/soft error:', err);
    res.status(500).json({ error: 'Failed to perform soft reset' });
  }
});

// ── GET /api/ranking/matches/:participantId — wildcard, must be AFTER fixed paths ──

router.get('/matches/:participantId', async (req, res) => {
  try {
    const { participantId } = req.params;
    const all = await tournamentMatches.getAll();
    const filtered = all
      .filter((m) => m.playerAId === participantId || m.playerBId === participantId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(filtered);
  } catch (err) {
    console.error('[Ranking] GET /matches/:id error:', err);
    res.status(500).json({ error: 'Failed to load matches for participant' });
  }
});

// ── DELETE /api/ranking/matches/:matchId — wildcard, must be AFTER fixed paths ──

router.delete('/matches/:matchId', async (req, res) => {
  try {
    const deleted = await tournamentMatches.remove(req.params.matchId);
    if (!deleted) return res.status(404).json({ error: 'Match not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Ranking] DELETE /matches/:id error:', err);
    res.status(500).json({ error: 'Failed to delete match' });
  }
});

export default router;
