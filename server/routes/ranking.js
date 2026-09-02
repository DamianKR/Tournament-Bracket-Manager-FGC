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
import { participants, rankedMatches } from '../db/collections.js';
import { calculateElo, getRankName, applyLegendTier, RANK_TIERS } from '../utils/eloEngine.js';
import { requireAuth, requireAdmin, optionalAuth } from '../utils/jwtMiddleware.js';
import { filterByCommunity, isInUserScope, getTargetCommunityId } from '../utils/communityScope.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────

function generateId(prefix = 'm') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Ensures a participant has ELO rank set. Unranked players keep null points. */
function ensureElo(p) {
  return {
    ...p,
    eloRank: p.eloRank ?? getRankName(p.eloPoints),
  };
}

// ── GET /api/ranking — Leaderboard ────────────────────────────────────────

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { communityId } = req.query;
    const all = filterByCommunity(req.user, (await participants.getAll()).map(ensureElo), communityId);

    // Sort: players with points first (desc), then unranked players
    const withPoints = all.filter((p) => p.eloPoints != null)
      .sort((a, b) => b.eloPoints - a.eloPoints);
    const unranked = all.filter((p) => p.eloPoints == null);
    const sorted = [...withPoints, ...unranked];

    // Apply Legend tier to top 5 (only point-holders)
    const rankedForLegend = applyLegendTier(withPoints);
    const legendMap = new Map(rankedForLegend.map((p) => [p.id, p.displayRank]));

    const leaderboard = sorted.map((p, i) => ({
      position:        p.eloPoints != null ? i + 1 : null,
      id:              p.id,
      name:            p.name,
      alias:           p.alias,
      avatarUrl:       p.avatarUrl,
      eloPoints:       p.eloPoints,
      eloRank:         p.eloRank,
      displayRank:     p.eloPoints != null ? (legendMap.get(p.id) ?? p.eloRank) : 'Sin puntos',
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

router.get('/matches', optionalAuth, async (req, res) => {
  try {
    const { communityId } = req.query;
    const all = filterByCommunity(req.user, await rankedMatches.getAll(), communityId);
    const sorted = [...all].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(sorted);
  } catch (err) {
    console.error('[Ranking] GET /matches error:', err);
    res.status(500).json({ error: 'Failed to load matches' });
  }
});

// ── POST /api/ranking/match — Record result & update ELO ─────────────────

router.post('/match', requireAuth, async (req, res) => {
  try {
    const { playerAId, playerBId, winnerId } = req.body;
    const communityId = getTargetCommunityId(req.user, req.body.communityId);
    if (!isInUserScope(req.user, communityId)) {
      return res.status(403).json({ error: 'Cannot record match in this community' });
    }

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

    // Both participants must belong to the target community
    if (
      (rawA.communityId && rawA.communityId !== communityId) ||
      (rawB.communityId && rawB.communityId !== communityId)
    ) {
      return res.status(403).json({ error: 'Both participants must belong to the target community' });
    }

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
      type: req.body.matchType || 'free',
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
      communityId,
      createdAt: new Date().toISOString(),
    };

    // A player only gets points after their first match; before that they were null.
    // Persist real points; both players now have an ELO score.
    const updatedA = { ...pA, eloPoints: newRA, eloRank: newRankA, updatedAt: new Date().toISOString() };
    const updatedB = { ...pB, eloPoints: newRB, eloRank: newRankB, updatedAt: new Date().toISOString() };

    // IMPORTANT: upsert(A) and upsert(B) must be sequential — both read+write
    // the same JSON file, so running them in parallel causes a race condition
    // where the second write overwrites the first (loser stays at old ELO).
    // rankedMatches.upsert is safe in parallel because it uses a different file.
    await participants.upsert(updatedA);
    await participants.upsert(updatedB);
    await rankedMatches.upsert(matchRecord);

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

router.post('/reset/hard', requireAuth, requireAdmin, async (req, res) => {
  try {
    const communityId = getTargetCommunityId(req.user, req.body.communityId);
    if (!isInUserScope(req.user, communityId)) {
      return res.status(403).json({ error: 'Cannot reset ranking for this community' });
    }
    const all = await participants.getAll();
    const resetPoints = 1500;
    const resetRank   = getRankName(resetPoints);

    const updated = all.map((p) => ({
      ...p,
      eloPoints: p.communityId === communityId ? resetPoints : p.eloPoints,
      eloRank:   p.communityId === communityId ? resetRank : p.eloRank,
      updatedAt: p.communityId === communityId ? new Date().toISOString() : p.updatedAt,
    }));

    await participants.replaceAll(updated);

    // Only clear ranked matches for this community
    const allMatches = await rankedMatches.getAll();
    const kept = allMatches.filter(m => m.communityId !== communityId);
    await rankedMatches.replaceAll(kept);

    res.json({
      ok: true,
      affectedParticipants: updated.filter(p => p.communityId === communityId).length,
      updatedParticipants: updated.filter(p => p.communityId === communityId),
      message: 'Hard reset: community players returned to 1500 pts. Community match history cleared.',
    });
  } catch (err) {
    console.error('[Ranking] POST /reset/hard error:', err);
    res.status(500).json({ error: 'Failed to perform hard reset' });
  }
});

// ── POST /api/ranking/reset/soft ──────────────────────────────────────────
// Must be registered BEFORE /matches/:participantId to avoid wildcard capture.

router.post('/reset/soft', requireAuth, requireAdmin, async (req, res) => {
  try {
    const communityId = getTargetCommunityId(req.user, req.body.communityId);
    if (!isInUserScope(req.user, communityId)) {
      return res.status(403).json({ error: 'Cannot reset ranking for this community' });
    }
    const all = await participants.getAll();

    const updated = all.map((p) => {
      if (p.communityId !== communityId) return p;
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
      affectedParticipants: updated.filter(p => p.communityId === communityId).length,
      updatedParticipants: updated.filter(p => p.communityId === communityId),
      message: 'Soft reset: community players returned to start of their current tier.',
    });
  } catch (err) {
    console.error('[Ranking] POST /reset/soft error:', err);
    res.status(500).json({ error: 'Failed to perform soft reset' });
  }
});

// ── GET /api/ranking/matches/:participantId — wildcard, must be AFTER fixed paths ──

router.get('/matches/:participantId', optionalAuth, async (req, res) => {
  try {
    const { participantId } = req.params;
    const { communityId } = req.query;
    const all = filterByCommunity(req.user, await rankedMatches.getAll(), communityId);
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

router.delete('/matches/:matchId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const match = await rankedMatches.findById(req.params.matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (!isInUserScope(req.user, match.communityId)) {
      return res.status(403).json({ error: 'Match is not in your community scope' });
    }
    const deleted = await rankedMatches.remove(req.params.matchId);
    if (!deleted) return res.status(404).json({ error: 'Match not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Ranking] DELETE /matches/:id error:', err);
    res.status(500).json({ error: 'Failed to delete match' });
  }
});

export default router;
