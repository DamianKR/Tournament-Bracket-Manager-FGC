/**
 * Matchmaking routes — Recurring season model
 *
 * A season is an ongoing schedule. Each season has a periodType (weekly/biweekly)
 * that determines how often new matchmaking assignments are auto-generated.
 *
 * GET    /api/matchmaking/seasons                     — list seasons
 * POST   /api/matchmaking/seasons                     — create season (admin)
 * GET    /api/matchmaking/seasons/:id                 — season + assignments for current period
 * PUT    /api/matchmaking/seasons/:id                 — update season meta (admin)
 * POST   /api/matchmaking/seasons/:id/generate        — generate current period matches (admin)
 * POST   /api/matchmaking/seasons/:id/advance         — force-advance to next period (admin)
 * POST   /api/matchmaking/seasons/:id/close           — close season entirely (admin)
 * DELETE /api/matchmaking/seasons/:id                 — delete draft season (admin)
 *
 * GET    /api/matchmaking/assignments                 — list assignments
 * PUT    /api/matchmaking/assignments/:id/result      — record match result
 * PUT    /api/matchmaking/assignments/:id/forfeit     — forfeit one side (admin)
 * PUT    /api/matchmaking/assignments/:id/cancel      — cancel without penalty (admin)
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { matchmakingSeasons, matchmakingAssignments, participants, rankedMatches } from '../db/collections.js';
import { requireAuth } from '../utils/jwtMiddleware.js';
import { filterByCommunity, isInUserScope, isAdminInCommunity, getTargetCommunityId, participantIdFor } from '../utils/communityScope.js';
import { getEffectiveElo } from '../utils/participantGames.js';
import { createNotification } from '../services/notificationService.js';
import { calculateElo, getRankName } from '../utils/eloEngine.js';

const router = Router();

// ── Model helpers ─────────────────────────────────────────────────────────────

const PERIOD_DAYS = { weekly: 7, biweekly: 14 };

/**
 * Migrate a legacy season (old flat model with startDate/endDate, no currentPeriod)
 * to the new recurring-period model. Returns the season unchanged if already migrated.
 */
function migrateSeason(s) {
  if (s.currentPeriod) return s;
  const periodType = s.periodType === 'biweekly' ? 'biweekly' : 'weekly';
  const startDate = s.startDate ?? s.createdAt ?? new Date().toISOString();
  return {
    ...s,
    periodType,
    gracePeriodDays: s.gracePeriodDays ?? 7,
    currentPeriod: {
      index: 0,
      startDate: s.startDate ?? startDate,
      endDate: s.endDate ?? new Date(new Date(startDate).getTime() + (PERIOD_DAYS[periodType] ?? 7) * 86400000).toISOString(),
      status: s.status === 'active' ? 'active' : 'pending',
    },
  };
}

function periodDates(periodType, index, startDate) {
  const days = PERIOD_DAYS[periodType] ?? 7;
  const start = new Date(startDate);
  const pStart = new Date(start.getTime() + index * days * 86400000);
  const pEnd   = new Date(pStart.getTime() + days * 86400000);
  return { index, startDate: pStart.toISOString(), endDate: pEnd.toISOString() };
}

function seasonShape(id, communityId, body) {
  const { gameId, name, periodType = 'weekly', matchesPerPlayer = 2,
          gracePeriodDays = 7, startDate, totalPeriods, endDate } = body;
  const period = periodDates(periodType, 0, startDate);
  return {
    id,
    communityId,
    gameId,
    name,
    periodType,           // 'weekly' | 'biweekly'
    matchesPerPlayer,     // 1–10
    gracePeriodDays,      // extra days after period end before forfeit
    startDate,            // season start ISO
    totalPeriods: totalPeriods ?? null,  // null = open-ended
    endDate: endDate ?? null,            // null = open-ended
    status: 'draft',      // draft | active | closed
    currentPeriod: { ...period, status: 'pending' }, // pending until generate
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function assignmentShape(seasonId, communityId, gameId, periodIndex, player1Id, player2Id) {
  return {
    id: randomUUID(),
    seasonId,
    communityId,
    gameId,
    periodIndex,          // which period this assignment belongs to
    player1Id,
    player2Id,
    status: 'pending',    // pending | completed | forfeit_p1 | forfeit_p2 | cancelled
    rankedMatchId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Pairing algorithm ─────────────────────────────────────────────────────────

function runPairing(players, matchesPerPlayer, recentPairings) {
  if (players.length < 2) return [];

  const elos = players.map((p) => p.elo);
  const eloRange = (Math.max(...elos) - Math.min(...elos)) || 1;

  const pairKey = (a, b) => [a, b].sort().join(':');
  const pairRecency = new Map();
  for (const { p1, p2, periodsAgo } of recentPairings) {
    const k = pairKey(p1, p2);
    if ((pairRecency.get(k) ?? Infinity) > periodsAgo) pairRecency.set(k, periodsAgo);
  }

  const historyPenalty = (a, b) => {
    const ago = pairRecency.get(pairKey(a, b));
    if (ago == null) return 0;
    if (ago === 1) return 1.0;
    if (ago === 2) return 0.5;
    return 0;
  };

  const remaining = new Map(players.map((p) => [p.id, matchesPerPlayer]));
  const used = new Set();
  const assignments = [];

  for (let round = 0; round < matchesPerPlayer; round++) {
    const pool = players.filter((p) => (remaining.get(p.id) ?? 0) > 0);
    const paired = new Set();
    const sorted = [...pool].sort((a, b) => {
      const optA = pool.filter((x) => x.id !== a.id && !paired.has(x.id) && !used.has(pairKey(a.id, x.id))).length;
      const optB = pool.filter((x) => x.id !== b.id && !paired.has(x.id) && !used.has(pairKey(b.id, x.id))).length;
      return optA - optB;
    });

    for (const player of sorted) {
      if (paired.has(player.id)) continue;
      const candidates = pool.filter(
        (c) => c.id !== player.id && !paired.has(c.id) && !used.has(pairKey(player.id, c.id))
      );
      if (!candidates.length) continue;

      const best = candidates
        .map((c) => ({
          c,
          cost: (Math.abs(player.elo - c.elo) / eloRange) * 0.55
              + historyPenalty(player.id, c.id) * 0.40
              + Math.random() * 0.05,
        }))
        .sort((a, b) => a.cost - b.cost)[0].c;

      assignments.push({ player1Id: player.id, player2Id: best.id });
      used.add(pairKey(player.id, best.id));
      paired.add(player.id);
      paired.add(best.id);
      remaining.set(player.id, remaining.get(player.id) - 1);
      remaining.set(best.id, remaining.get(best.id) - 1);
    }
  }

  return assignments;
}

// ── Auto-advance helper ────────────────────────────────────────────────────────
// Called lazily on every read of an active season. If current period end + grace
// has passed, close the period (auto-forfeit pending) and generate the next one.

async function maybeAdvancePeriod(season) {
  if (season.status !== 'active') return season;
  if (!season.currentPeriod) return season;

  const periodEnd = new Date(season.currentPeriod.endDate);
  const graceEnd  = new Date(periodEnd.getTime() + season.gracePeriodDays * 86400000);
  const now       = new Date();

  if (now <= graceEnd) return season; // still within period or grace

  // ── Close current period: auto-forfeit pending assignments ──
  const allA = await matchmakingAssignments.getAll();
  const currentPeriodAssignments = allA.filter(
    (a) => a.seasonId === season.id && a.periodIndex === season.currentPeriod.index
  );

  const allP = await participants.getAll();
  let participantsChanged = false;
  const pMap = new Map(allP.map((p) => [p.id, p]));

  for (const a of currentPeriodAssignments) {
    if (a.status !== 'pending') continue;
    // Both players no-show: mark as cancelled, no ELO change
    a.status = 'cancelled';
    a.cancelReason = 'period_expired';
    a.updatedAt = new Date().toISOString();
  }

  await matchmakingAssignments.replaceAll(allA);
  if (participantsChanged) await participants.replaceAll(allP);

  // ── Check if season should auto-close ──
  const nextIndex = season.currentPeriod.index + 1;

  // By totalPeriods
  if (season.totalPeriods != null && nextIndex >= season.totalPeriods) {
    season.status = 'closed';
    season.updatedAt = new Date().toISOString();
    await matchmakingSeasons.upsert(season);
    return season;
  }

  // By endDate
  if (season.endDate != null && now > new Date(season.endDate)) {
    season.status = 'closed';
    season.updatedAt = new Date().toISOString();
    await matchmakingSeasons.upsert(season);
    return season;
  }

  // ── Advance to next period ──
  const nextPeriod = periodDates(season.periodType, nextIndex, season.startDate);

  season.currentPeriod = { ...nextPeriod, status: 'pending' };
  season.updatedAt = new Date().toISOString();
  await matchmakingSeasons.upsert(season);

  // Auto-generate matches for the new period
  await generatePeriodMatches(season);

  return season;
}

// ── Core generation logic (shared between generate + auto-advance) ─────────────

async function generatePeriodMatches(season) {
  const allParticipants = await participants.getAll();
  const pool = allParticipants.filter(
    (p) =>
      p.communityId === season.communityId &&
      p.games?.[season.gameId] &&
      p.games[season.gameId].available !== false
  );

  if (pool.length < 2) {
    // Not enough players — mark period as skipped
    season.currentPeriod.status = 'skipped';
    await matchmakingSeasons.upsert(season);
    return { assignments: [], totalPlayers: pool.length };
  }

  const players = pool.map((p) => ({
    id: p.id,
    name: p.alias || p.name,
    elo: getEffectiveElo(p, season.gameId),
  }));

  // Recent pairings: last 2 periods of this same season
  const allAssignments = await matchmakingAssignments.getAll();
  const recentPairings = [];
  for (let offset = 1; offset <= 2; offset++) {
    const idx = season.currentPeriod.index - offset;
    if (idx < 0) break;
    allAssignments
      .filter((a) => a.seasonId === season.id && a.periodIndex === idx)
      .forEach((a) => recentPairings.push({ p1: a.player1Id, p2: a.player2Id, periodsAgo: offset }));
  }

  // Remove stale assignments for this season+period (regeneration case)
  const remaining = allAssignments.filter(
    (a) => !(a.seasonId === season.id && a.periodIndex === season.currentPeriod.index)
  );

  const pairs = runPairing(players, season.matchesPerPlayer, recentPairings);
  const newAssignments = pairs.map(({ player1Id, player2Id }) =>
    assignmentShape(season.id, season.communityId, season.gameId, season.currentPeriod.index, player1Id, player2Id)
  );

  await matchmakingAssignments.replaceAll([...remaining, ...newAssignments]);

  season.currentPeriod.status = 'active';
  season.status = 'active';
  season.updatedAt = new Date().toISOString();
  await matchmakingSeasons.upsert(season);

  // Notify players
  for (const a of newAssignments) {
    const p1 = pool.find((p) => p.id === a.player1Id);
    const p2 = pool.find((p) => p.id === a.player2Id);
    if (!p1 || !p2) continue;
    const endLabel = new Date(season.currentPeriod.endDate).toLocaleDateString();
    createNotification(a.player1Id, 'matchmaking',
      `Matchmaking — ${season.name} (Período ${season.currentPeriod.index + 1})`,
      `Tu rival es ${p2.alias || p2.name}. Juega antes del ${endLabel}.`,
      { seasonId: season.id, assignmentId: a.id });
    createNotification(a.player2Id, 'matchmaking',
      `Matchmaking — ${season.name} (Período ${season.currentPeriod.index + 1})`,
      `Tu rival es ${p1.alias || p1.name}. Juega antes del ${endLabel}.`,
      { seasonId: season.id, assignmentId: a.id });
  }

  return { assignments: newAssignments, totalPlayers: pool.length };
}

// ── Season routes ─────────────────────────────────────────────────────────────

// GET /api/matchmaking/seasons?communityId=...
router.get('/seasons', requireAuth, async (req, res) => {
  try {
    const { communityId } = req.query;
    const all = await matchmakingSeasons.getAll();
    // Migrate legacy seasons then run auto-advance on active ones
    const migrated = all.map(migrateSeason);
    const checked = await Promise.all(
      migrated.map((s) => (s.status === 'active' ? maybeAdvancePeriod(s) : s))
    );
    res.json(filterByCommunity(req.user, checked, communityId));
  } catch (err) {
    console.error('[Matchmaking] GET /seasons:', err);
    res.status(500).json({ error: 'Failed to load seasons' });
  }
});

// POST /api/matchmaking/seasons
router.post('/seasons', requireAuth, async (req, res) => {
  try {
    const communityId = getTargetCommunityId(req.user, req.body.communityId);
    if (!isAdminInCommunity(req.user, communityId)) {
      return res.status(403).json({ error: 'Admin required' });
    }
    const { gameId, name, startDate } = req.body;
    if (!gameId || !name || !startDate) {
      return res.status(400).json({ error: 'Missing required fields: gameId, name, startDate' });
    }
    const periodType = req.body.periodType === 'biweekly' ? 'biweekly' : 'weekly';
    const matchesPerPlayer = Math.max(1, Math.min(10, parseInt(req.body.matchesPerPlayer) || 2));
    const gracePeriodDays  = Math.max(0, Math.min(30, parseInt(req.body.gracePeriodDays) || 7));
    const totalPeriods     = req.body.totalPeriods ? Math.max(1, parseInt(req.body.totalPeriods)) : null;
    const endDate          = req.body.endDate ?? null;
    const season = seasonShape(randomUUID(), communityId, {
      ...req.body, periodType, matchesPerPlayer, gracePeriodDays, totalPeriods, endDate,
    });
    await matchmakingSeasons.upsert(season);
    res.status(201).json(season);
  } catch (err) {
    console.error('[Matchmaking] POST /seasons:', err);
    res.status(500).json({ error: 'Failed to create season' });
  }
});

// GET /api/matchmaking/seasons/:id
router.get('/seasons/:id', requireAuth, async (req, res) => {
  try {
    let season = await matchmakingSeasons.findById(req.params.id);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    if (!isInUserScope(req.user, season.communityId)) return res.status(403).json({ error: 'Forbidden' });

    season = migrateSeason(season);
    // Auto-advance if the current period has expired past grace
    if (season.status === 'active') season = await maybeAdvancePeriod(season);

    const allA = await matchmakingAssignments.getAll();
    const periodIndex = season.currentPeriod?.index ?? 0;
    const assignments = allA.filter(
      (a) => a.seasonId === season.id && a.periodIndex === periodIndex
    );
    const allAssignments = allA.filter((a) => a.seasonId === season.id);

    res.json({ ...season, assignments, allAssignments });
  } catch (err) {
    console.error('[Matchmaking] GET /seasons/:id:', err);
    res.status(500).json({ error: 'Failed to load season' });
  }
});

// PUT /api/matchmaking/seasons/:id
router.put('/seasons/:id', requireAuth, async (req, res) => {
  try {
    const season = await matchmakingSeasons.findById(req.params.id);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    if (!isAdminInCommunity(req.user, season.communityId)) return res.status(403).json({ error: 'Admin required' });
    if (season.status === 'closed') return res.status(400).json({ error: 'Cannot edit a closed season' });

    const { name, matchesPerPlayer, gracePeriodDays } = req.body;
    if (name !== undefined) season.name = name;
    if (matchesPerPlayer !== undefined) season.matchesPerPlayer = Math.max(1, Math.min(10, parseInt(matchesPerPlayer)));
    if (gracePeriodDays !== undefined) season.gracePeriodDays = Math.max(0, Math.min(30, parseInt(gracePeriodDays)));
    season.updatedAt = new Date().toISOString();
    await matchmakingSeasons.upsert(season);
    res.json(season);
  } catch (err) {
    console.error('[Matchmaking] PUT /seasons/:id:', err);
    res.status(500).json({ error: 'Failed to update season' });
  }
});

// DELETE /api/matchmaking/seasons/:id
router.delete('/seasons/:id', requireAuth, async (req, res) => {
  try {
    const season = await matchmakingSeasons.findById(req.params.id);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    if (!isAdminInCommunity(req.user, season.communityId)) return res.status(403).json({ error: 'Admin required' });
    if (season.status !== 'draft') return res.status(400).json({ error: 'Only draft seasons can be deleted' });
    const all = await matchmakingSeasons.getAll();
    await matchmakingSeasons.replaceAll(all.filter((s) => s.id !== season.id));
    res.json({ ok: true });
  } catch (err) {
    console.error('[Matchmaking] DELETE /seasons/:id:', err);
    res.status(500).json({ error: 'Failed to delete season' });
  }
});

// POST /api/matchmaking/seasons/:id/generate
router.post('/seasons/:id/generate', requireAuth, async (req, res) => {
  try {
    const season = await matchmakingSeasons.findById(req.params.id);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    if (!isAdminInCommunity(req.user, season.communityId)) return res.status(403).json({ error: 'Admin required' });
    if (season.status === 'closed') return res.status(400).json({ error: 'Season is closed' });

    const result = await generatePeriodMatches(season);
    res.json({ season, ...result });
  } catch (err) {
    console.error('[Matchmaking] POST /seasons/:id/generate:', err);
    res.status(500).json({ error: 'Failed to generate matchmaking' });
  }
});

// POST /api/matchmaking/seasons/:id/advance  — force next period
router.post('/seasons/:id/advance', requireAuth, async (req, res) => {
  try {
    const season = await matchmakingSeasons.findById(req.params.id);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    if (!isAdminInCommunity(req.user, season.communityId)) return res.status(403).json({ error: 'Admin required' });
    if (season.status !== 'active') return res.status(400).json({ error: 'Season is not active' });

    // Close current period pending as cancelled
    const allA = await matchmakingAssignments.getAll();
    const currentAssignments = allA.filter(
      (a) => a.seasonId === season.id && a.periodIndex === season.currentPeriod.index
    );
    for (const a of currentAssignments) {
      if (a.status === 'pending') {
        a.status = 'cancelled';
        a.cancelReason = 'admin_advanced';
        a.updatedAt = new Date().toISOString();
      }
    }
    await matchmakingAssignments.replaceAll(allA);

    const nextIndex = season.currentPeriod.index + 1;
    season.currentPeriod = { ...periodDates(season.periodType, nextIndex, season.startDate), status: 'pending' };
    season.updatedAt = new Date().toISOString();
    await matchmakingSeasons.upsert(season);

    const result = await generatePeriodMatches(season);
    res.json({ season, ...result });
  } catch (err) {
    console.error('[Matchmaking] POST /seasons/:id/advance:', err);
    res.status(500).json({ error: 'Failed to advance period' });
  }
});

// POST /api/matchmaking/seasons/:id/close
router.post('/seasons/:id/close', requireAuth, async (req, res) => {
  try {
    const season = await matchmakingSeasons.findById(req.params.id);
    if (!season) return res.status(404).json({ error: 'Season not found' });
    if (!isAdminInCommunity(req.user, season.communityId)) return res.status(403).json({ error: 'Admin required' });
    if (season.status !== 'active') return res.status(400).json({ error: 'Season is not active' });

    const allA = await matchmakingAssignments.getAll();
    const periodIdx = season.currentPeriod?.index ?? 0;
    let closed = 0;
    for (const a of allA) {
      if (a.seasonId === season.id && a.periodIndex === periodIdx && a.status === 'pending') {
        a.status = 'cancelled';
        a.cancelReason = 'season_closed';
        a.updatedAt = new Date().toISOString();
        closed++;
      }
    }
    await matchmakingAssignments.replaceAll(allA);
    season.status = 'closed';
    season.updatedAt = new Date().toISOString();
    await matchmakingSeasons.upsert(season);
    res.json({ ok: true, closedAssignments: closed });
  } catch (err) {
    console.error('[Matchmaking] POST /seasons/:id/close:', err);
    res.status(500).json({ error: 'Failed to close season' });
  }
});

// ── Assignment routes ─────────────────────────────────────────────────────────

// GET /api/matchmaking/assignments
router.get('/assignments', requireAuth, async (req, res) => {
  try {
    const { communityId, seasonId, participantId } = req.query;
    let data = await matchmakingAssignments.getAll();
    data = filterByCommunity(req.user, data, communityId);
    if (seasonId) data = data.filter((a) => a.seasonId === seasonId);
    if (participantId) data = data.filter((a) => a.player1Id === participantId || a.player2Id === participantId);
    res.json(data);
  } catch (err) {
    console.error('[Matchmaking] GET /assignments:', err);
    res.status(500).json({ error: 'Failed to load assignments' });
  }
});

// PUT /api/matchmaking/assignments/:id/result
router.put('/assignments/:id/result', requireAuth, async (req, res) => {
  try {
    const assignment = await matchmakingAssignments.findById(req.params.id);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
    if (!isInUserScope(req.user, assignment.communityId)) return res.status(403).json({ error: 'Forbidden' });
    if (assignment.status !== 'pending') return res.status(400).json({ error: 'Assignment is not pending' });

    const myId = participantIdFor(req.user, assignment.communityId);
    const isParticipant = myId === assignment.player1Id || myId === assignment.player2Id;
    if (!isParticipant && !isAdminInCommunity(req.user, assignment.communityId)) {
      return res.status(403).json({ error: 'Not a participant in this assignment' });
    }

    const { winnerId, games } = req.body;
    if (!winnerId || (winnerId !== assignment.player1Id && winnerId !== assignment.player2Id)) {
      return res.status(400).json({ error: 'Invalid winnerId' });
    }

    const allP = await participants.getAll();
    const p1 = allP.find((p) => p.id === assignment.player1Id);
    const p2 = allP.find((p) => p.id === assignment.player2Id);
    if (!p1 || !p2) return res.status(404).json({ error: 'Participant not found' });

    const winner = winnerId === assignment.player1Id ? p1 : p2;
    const loser  = winnerId === assignment.player1Id ? p2 : p1;
    const { newRA: newWElo, newRB: newLElo } = calculateElo(
      getEffectiveElo(winner, assignment.gameId),
      getEffectiveElo(loser, assignment.gameId),
      'A'
    );

    const updW = { ...winner, games: { ...winner.games } };
    updW.games[assignment.gameId] = { ...(winner.games?.[assignment.gameId] ?? {}), gameId: assignment.gameId, eloPoints: newWElo, eloRank: getRankName(newWElo) };
    const updL = { ...loser, games: { ...loser.games } };
    updL.games[assignment.gameId] = { ...(loser.games?.[assignment.gameId] ?? {}), gameId: assignment.gameId, eloPoints: newLElo, eloRank: getRankName(newLElo) };

    await participants.replaceAll(allP.map((p) => {
      if (p.id === updW.id) return updW;
      if (p.id === updL.id) return updL;
      return p;
    }));

    const match = {
      id: randomUUID(),
      communityId: assignment.communityId,
      gameId: assignment.gameId,
      playerAId: assignment.player1Id,
      playerBId: assignment.player2Id,
      winnerId,
      games: games ?? [],
      type: 'matchmaking',
      seasonId: assignment.seasonId,
      periodIndex: assignment.periodIndex,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const allMatches = await rankedMatches.getAll();
    await rankedMatches.replaceAll([...allMatches, match]);

    assignment.status = 'completed';
    assignment.winnerId = winnerId;
    assignment.rankedMatchId = match.id;
    assignment.updatedAt = new Date().toISOString();
    const allA = await matchmakingAssignments.getAll();
    await matchmakingAssignments.replaceAll(allA.map((a) => (a.id === assignment.id ? assignment : a)));

    res.json({ assignment, match, updatedWinner: updW, updatedLoser: updL });
  } catch (err) {
    console.error('[Matchmaking] PUT /assignments/:id/result:', err);
    res.status(500).json({ error: 'Failed to record result' });
  }
});

// PUT /api/matchmaking/assignments/:id/forfeit
router.put('/assignments/:id/forfeit', requireAuth, async (req, res) => {
  try {
    const assignment = await matchmakingAssignments.findById(req.params.id);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
    if (!isAdminInCommunity(req.user, assignment.communityId)) return res.status(403).json({ error: 'Admin required' });
    if (assignment.status !== 'pending') return res.status(400).json({ error: 'Assignment is not pending' });

    const { forfeitPlayerId, note } = req.body;
    if (forfeitPlayerId !== assignment.player1Id && forfeitPlayerId !== assignment.player2Id) {
      return res.status(400).json({ error: 'forfeitPlayerId must be one of the two players' });
    }

    const winnerId = forfeitPlayerId === assignment.player1Id ? assignment.player2Id : assignment.player1Id;
    const allP = await participants.getAll();
    const w = allP.find((p) => p.id === winnerId);
    const l = allP.find((p) => p.id === forfeitPlayerId);
    if (w && l) {
      const { newRA: nW, newRB: nL } = calculateElo(
        getEffectiveElo(w, assignment.gameId),
        getEffectiveElo(l, assignment.gameId),
        'A'
      );
      const updW = { ...w, games: { ...w.games } };
      updW.games[assignment.gameId] = { ...(w.games?.[assignment.gameId] ?? {}), gameId: assignment.gameId, eloPoints: nW, eloRank: getRankName(nW) };
      const updL = { ...l, games: { ...l.games } };
      updL.games[assignment.gameId] = { ...(l.games?.[assignment.gameId] ?? {}), gameId: assignment.gameId, eloPoints: nL, eloRank: getRankName(nL) };
      await participants.replaceAll(allP.map((p) => {
        if (p.id === updW.id) return updW;
        if (p.id === updL.id) return updL;
        return p;
      }));
    }

    assignment.status = forfeitPlayerId === assignment.player1Id ? 'forfeit_p1' : 'forfeit_p2';
    assignment.winnerId = winnerId;
    assignment.forfeitNote = note ?? null;
    assignment.updatedAt = new Date().toISOString();
    const allA = await matchmakingAssignments.getAll();
    await matchmakingAssignments.replaceAll(allA.map((a) => (a.id === assignment.id ? assignment : a)));

    res.json({ assignment });
  } catch (err) {
    console.error('[Matchmaking] PUT /assignments/:id/forfeit:', err);
    res.status(500).json({ error: 'Failed to apply forfeit' });
  }
});

// PUT /api/matchmaking/assignments/:id/cancel
router.put('/assignments/:id/cancel', requireAuth, async (req, res) => {
  try {
    const assignment = await matchmakingAssignments.findById(req.params.id);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
    if (!isAdminInCommunity(req.user, assignment.communityId)) return res.status(403).json({ error: 'Admin required' });
    if (assignment.status !== 'pending') return res.status(400).json({ error: 'Assignment is not pending' });

    assignment.status = 'cancelled';
    assignment.cancelReason = req.body.reason ?? 'admin_cancelled';
    assignment.updatedAt = new Date().toISOString();
    const allA = await matchmakingAssignments.getAll();
    await matchmakingAssignments.replaceAll(allA.map((a) => (a.id === assignment.id ? assignment : a)));

    res.json({ assignment });
  } catch (err) {
    console.error('[Matchmaking] PUT /assignments/:id/cancel:', err);
    res.status(500).json({ error: 'Failed to cancel assignment' });
  }
});

// POST /api/matchmaking/reset-availability
router.post('/reset-availability', requireAuth, async (req, res) => {
  try {
    const { gameId } = req.body;
    const communityId = getTargetCommunityId(req.user, req.body.communityId);
    if (!isAdminInCommunity(req.user, communityId)) return res.status(403).json({ error: 'Admin required' });
    if (!gameId) return res.status(400).json({ error: 'gameId required' });

    const allP = await participants.getAll();
    let count = 0;
    const updated = allP.map((p) => {
      if (p.communityId !== communityId || !p.games?.[gameId]) return p;
      if (p.games[gameId].available === false) return p;
      const upd = { ...p, games: { ...p.games } };
      upd.games[gameId] = { ...p.games[gameId], available: false };
      count++;
      return upd;
    });
    await participants.replaceAll(updated);
    res.json({ ok: true, updated: count });
  } catch (err) {
    console.error('[Matchmaking] POST /reset-availability:', err);
    res.status(500).json({ error: 'Failed to reset availability' });
  }
});

export default router;
