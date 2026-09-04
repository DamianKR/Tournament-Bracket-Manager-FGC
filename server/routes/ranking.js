/**
 * Ranking routes
 *
 * Order matters in Express — fixed paths BEFORE parameterized paths.
 *
 * GET    /api/ranking?communityId=&gameId=         — Leaderboard per game
 * GET    /api/ranking/matches                       — Full match history
 * POST   /api/ranking/match                         — Record a match result, update ELO
 * POST   /api/ranking/reset/hard                    — Reset per-game ELO, clear history
 * POST   /api/ranking/reset/soft                   — Reset per-game ELO to tier start
 * GET    /api/ranking/matches/:participantId        — Match history for one participant
 * DELETE /api/ranking/matches/:matchId             — Delete a match record
 */

import { Router } from 'express';
import { participants, rankedMatches } from '../db/collections.js';
import { calculateElo, getRankName, applyLegendTier, RANK_TIERS } from '../utils/eloEngine.js';
import {
  migrateParticipantGames,
  getGameProfile,
  getParticipantElo,
  getParticipantRank,
  getEffectiveElo,
  setParticipantGameElo,
} from '../utils/participantGames.js';
import { requireAuth, requireAdmin, optionalAuth } from '../utils/jwtMiddleware.js';
import { filterByCommunity, isInUserScope, getTargetCommunityId } from '../utils/communityScope.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────

function generateId(prefix = 'm') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Migrates and returns a safe participant record with per-game ELO. */
function normalizeParticipant(p) {
  if (!p) return p;
  return migrateParticipantGames({ ...p });
}

// ── GET /api/ranking — Leaderboard ────────────────────────────────────────

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { communityId, gameId } = req.query;
    const targetGameId = gameId || 'ssbu';
    const all = filterByCommunity(
      req.user,
      (await participants.getAll()).map(normalizeParticipant),
      communityId
    );

    // Only show participants who have this game in their profile
    const eligible = all.filter((p) => getGameProfile(p, targetGameId) != null);

    // Sort: players with points in this game first (desc), then unranked
    const withPoints = eligible
      .map((p) => ({ p, pts: getParticipantElo(p, targetGameId) }))
      .filter(({ pts }) => pts != null)
      .sort((a, b) => b.pts - a.pts);

    const unranked = eligible.filter((p) => getParticipantElo(p, targetGameId) == null);

    // Apply Legend tier to top 5 (only point-holders)
    const rankedForLegend = applyLegendTier(
      withPoints.map(({ p, pts }) => ({
        ...p,
        eloPoints: pts,
        eloRank: getParticipantRank(p, targetGameId),
      }))
    );
    const legendMap = new Map(rankedForLegend.map((p) => [p.id, p.displayRank]));

    const sorted = [...withPoints.map(({ p }) => p), ...unranked];

    const leaderboard = sorted.map((p, i) => {
      const pts = getParticipantElo(p, targetGameId);
      const rank = getParticipantRank(p, targetGameId);
      return {
        position: pts != null ? i + 1 : null,
        id: p.id,
        name: p.name,
        alias: p.alias,
        avatarUrl: p.avatarUrl,
        eloPoints: pts,
        eloRank: rank,
        displayRank: pts != null ? (legendMap.get(p.id) ?? rank) : 'Sin puntos',
        gameId: targetGameId,
        mainCharacterId: p.games?.[targetGameId]?.mainCharacterId ?? p.mainCharacterId,
      };
    });

    res.json(leaderboard);
  } catch (err) {
    console.error('[Ranking] GET / error:', err);
    res.status(500).json({ error: 'Failed to load ranking' });
  }
});

// ── GET /api/ranking/matches — Full match history ─────────────────────────

router.get('/matches', optionalAuth, async (req, res) => {
  try {
    const { communityId, gameId } = req.query;
    let all = filterByCommunity(req.user, await rankedMatches.getAll(), communityId);
    if (gameId) {
      all = all.filter((m) => m.gameId === gameId);
    }
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
    const { playerAId, playerBId, winnerId, gameId } = req.body;
    const matchGameId = gameId || 'ssbu';
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

    const pA = normalizeParticipant(rawA);
    const pB = normalizeParticipant(rawB);

    const winner = winnerId === playerAId ? 'A' : 'B';
    const { newRA, newRB, deltaA, deltaB } = calculateElo(
      getEffectiveElo(pA, matchGameId),
      getEffectiveElo(pB, matchGameId),
      winner
    );

    const newRankA = getRankName(newRA);
    const newRankB = getRankName(newRB);

    setParticipantGameElo(pA, matchGameId, newRA, newRankA);
    setParticipantGameElo(pB, matchGameId, newRB, newRankB);

    const matchRecord = {
      id: generateId('m'),
      playerAId,
      playerBId,
      winnerId,
      loserId: winnerId === playerAId ? playerBId : playerAId,
      type: req.body.matchType || 'free',
      gameId: matchGameId,
      playerAPointsBefore: getEffectiveElo(pA, matchGameId),
      playerBPointsBefore: getEffectiveElo(pB, matchGameId),
      playerAPointsAfter: newRA,
      playerBPointsAfter: newRB,
      playerADelta: deltaA,
      playerBDelta: deltaB,
      playerARankBefore: getParticipantRank(pA, matchGameId),
      playerBRankBefore: getParticipantRank(pB, matchGameId),
      playerARankAfter: newRankA,
      playerBRankAfter: newRankB,
      communityId,
      createdAt: new Date().toISOString(),
    };

    // Persist participants sequentially to avoid race conditions
    await participants.upsert(pA);
    await participants.upsert(pB);
    await rankedMatches.upsert(matchRecord);

    res.status(201).json({
      match: matchRecord,
      playerA: {
        id: pA.id,
        name: pA.name,
        pointsBefore: matchRecord.playerAPointsBefore,
        pointsAfter: newRA,
        delta: deltaA,
        rankBefore: matchRecord.playerARankBefore,
        rankAfter: newRankA,
      },
      playerB: {
        id: pB.id,
        name: pB.name,
        pointsBefore: matchRecord.playerBPointsBefore,
        pointsAfter: newRB,
        delta: deltaB,
        rankBefore: matchRecord.playerBRankBefore,
        rankAfter: newRankB,
      },
      updatedParticipantA: pA,
      updatedParticipantB: pB,
    });
  } catch (err) {
    console.error('[Ranking] POST /match error:', err);
    res.status(500).json({ error: 'Failed to record match' });
  }
});

// ── POST /api/ranking/reset/hard ──────────────────────────────────────────

router.post('/reset/hard', requireAuth, requireAdmin, async (req, res) => {
  try {
    const communityId = getTargetCommunityId(req.user, req.body.communityId);
    const gameId = req.body.gameId || null;
    if (!isInUserScope(req.user, communityId)) {
      return res.status(403).json({ error: 'Cannot reset ranking for this community' });
    }

    const all = (await participants.getAll()).map(normalizeParticipant);
    const resetPoints = 1500;
    const resetRank = getRankName(resetPoints);

    const updated = all.map((p) => {
      if (p.communityId !== communityId) return p;
      if (gameId) {
        setParticipantGameElo(p, gameId, resetPoints, resetRank);
      } else {
        // Reset all per-game ELOs
        for (const g of Object.keys(p.games || {})) {
          setParticipantGameElo(p, g, resetPoints, resetRank);
        }
      }
      p.updatedAt = new Date().toISOString();
      return p;
    });

    await participants.replaceAll(updated);

    // Only clear ranked matches for this community (and game if specified)
    const allMatches = await rankedMatches.getAll();
    const kept = allMatches.filter((m) => {
      if (m.communityId !== communityId) return true;
      if (gameId && m.gameId !== gameId) return true;
      return false;
    });
    await rankedMatches.replaceAll(kept);

    res.json({
      ok: true,
      affectedParticipants: updated.filter((p) => p.communityId === communityId).length,
      updatedParticipants: updated.filter((p) => p.communityId === communityId),
      message: `Hard reset: community players returned to ${resetPoints} pts${gameId ? ` for ${gameId}` : ''}.`,
    });
  } catch (err) {
    console.error('[Ranking] POST /reset/hard error:', err);
    res.status(500).json({ error: 'Failed to perform hard reset' });
  }
});

// ── POST /api/ranking/reset/soft ──────────────────────────────────────────

router.post('/reset/soft', requireAuth, requireAdmin, async (req, res) => {
  try {
    const communityId = getTargetCommunityId(req.user, req.body.communityId);
    const gameId = req.body.gameId || null;
    if (!isInUserScope(req.user, communityId)) {
      return res.status(403).json({ error: 'Cannot reset ranking for this community' });
    }

    const all = (await participants.getAll()).map(normalizeParticipant);

    const updated = all.map((p) => {
      if (p.communityId !== communityId) return p;
      const targetGames = gameId ? [gameId] : Object.keys(p.games || {});
      for (const g of targetGames) {
        const pts = getParticipantElo(p, g) ?? 1500;
        const tier = [...RANK_TIERS].reverse().find((t) => pts >= t.min) ?? RANK_TIERS[0];
        setParticipantGameElo(p, g, tier.min, getRankName(tier.min));
      }
      p.updatedAt = new Date().toISOString();
      return p;
    });

    await participants.replaceAll(updated);

    res.json({
      ok: true,
      affectedParticipants: updated.filter((p) => p.communityId === communityId).length,
      updatedParticipants: updated.filter((p) => p.communityId === communityId),
      message: `Soft reset: community players returned to start of their current tier${gameId ? ` for ${gameId}` : ''}.`,
    });
  } catch (err) {
    console.error('[Ranking] POST /reset/soft error:', err);
    res.status(500).json({ error: 'Failed to perform soft reset' });
  }
});

// ── GET /api/ranking/matches/:participantId ──────────────────────────────

router.get('/matches/:participantId', optionalAuth, async (req, res) => {
  try {
    const { participantId } = req.params;
    const { communityId, gameId } = req.query;
    let all = filterByCommunity(req.user, await rankedMatches.getAll(), communityId);
    all = all.filter((m) => m.playerAId === participantId || m.playerBId === participantId);
    if (gameId) {
      all = all.filter((m) => m.gameId === gameId);
    }
    const sorted = all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(sorted);
  } catch (err) {
    console.error('[Ranking] GET /matches/:id error:', err);
    res.status(500).json({ error: 'Failed to load matches for participant' });
  }
});

// ── DELETE /api/ranking/matches/:matchId ───────────────────────────────────

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
