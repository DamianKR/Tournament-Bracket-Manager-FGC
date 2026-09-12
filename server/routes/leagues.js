/**
 * Leagues routes
 * 
 * GET    /api/leagues              — list all leagues
 * GET    /api/leagues/:id          — get league details
 * POST   /api/leagues              — create new league
 * PUT    /api/leagues/:id          — update league
 * DELETE /api/leagues/:id          — delete league
 * 
 * GET    /api/leagues/:id/matches  — get all matches for a league
 * GET    /api/leagues/:id/standings — get current standings
 * POST   /api/leagues/:id/matches/:matchId/result — report match result
 * POST   /api/leagues/:id/estimate — estimate duration (preview before creation)
 */

import { Router } from 'express';
import { leagues, leagueMatches, participants } from '../db/collections.js';
import { 
  generateRoundRobinPairings, 
  distributeIntoWeeks,
  estimateLeagueDuration 
} from '../utils/leagueScheduler.js';
import { calculateMatchElo, getRankName } from '../utils/eloEngine.js';
import { notifyAdminsOfBanEligibility } from '../services/leagueExpiration.js';
import { scheduleLeagueNotifications } from '../services/notificationScheduler.js';
import { startLeague, scheduleLeagueStart } from '../services/leagueStart.js';
import { requireAuth, requireAdmin, optionalAuth } from '../utils/jwtMiddleware.js';
import { filterByCommunity, isInUserScope, getTargetCommunityId, canAdminGame, participantIdFor } from '../utils/communityScope.js';
import {
  migrateParticipantGames,
  getEffectiveElo,
  setParticipantGameElo,
} from '../utils/participantGames.js';

const router = Router();

// ── Utility functions ─────────────────────────────────────────────────────

function generateId(prefix = 'league') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Valida que el score "N-M" sea consistente con el winnerId:
 * - Formato "N-M" con enteros no-negativos
 * - No puede ser empate
 * - participant1 tiene el primer número, participant2 el segundo;
 *   el mayor debe corresponder al winnerId declarado
 * Devuelve el mensaje de error o null si es válido.
 */
function validateScoreConsistency(match, winnerId, score) {
  if (!score) return null;
  const parts = String(score).split('-').map(s => s.trim());
  if (parts.length !== 2) return `Invalid score format "${score}" (expected "N-M")`;
  const [p1Score, p2Score] = parts.map(Number);
  if (isNaN(p1Score) || isNaN(p2Score) || p1Score < 0 || p2Score < 0 || !Number.isInteger(p1Score) || !Number.isInteger(p2Score)) {
    return `Invalid score "${score}" (expected non-negative integers "N-M")`;
  }
  if (p1Score === p2Score) return `Score cannot be a tie (${score})`;
  const scoreWinnerId = p1Score > p2Score ? match.participant1Id : match.participant2Id;
  if (scoreWinnerId !== winnerId) {
    return `Score inconsistency: score ${score} indicates Player ${p1Score > p2Score ? 1 : 2} won, but the selected winner is Player ${winnerId === match.participant1Id ? 1 : 2}`;
  }
  return null;
}

async function applyLeagueMatchElo(match) {
  const [p1Raw, p2Raw] = await Promise.all([
    participants.findById(match.participant1Id),
    participants.findById(match.participant2Id),
  ]);
  if (!p1Raw || !p2Raw) throw new Error('Participant not found');

  const p1 = migrateParticipantGames(p1Raw);
  const p2 = migrateParticipantGames(p2Raw);

  const gameId = match.gameId || (await leagues.findById(match.leagueId))?.gameId || 'ssbu';
  const p1Elo = getEffectiveElo(p1, gameId);
  const p2Elo = getEffectiveElo(p2, gameId);
  let eloChange1 = 0;
  let eloChange2 = 0;

  if (match.noShowParticipantId) {
    const absentId = match.noShowParticipantId;
    const presentId = absentId === match.participant1Id ? match.participant2Id : match.participant1Id;
    const winnerChar = presentId === match.participant1Id ? 'A' : 'B';
    const result = calculateMatchElo(p1Elo, p2Elo, winnerChar);
    if (absentId === match.participant1Id) {
      eloChange1 = result.playerAChange;
      eloChange2 = 0;
      setParticipantGameElo(p1, gameId, result.playerANewElo, getRankName(result.playerANewElo));
      await participants.upsert(p1);
    } else {
      eloChange1 = 0;
      eloChange2 = result.playerBChange;
      setParticipantGameElo(p2, gameId, result.playerBNewElo, getRankName(result.playerBNewElo));
      await participants.upsert(p2);
    }
    match.status = 'no_show';
  } else {
    const winnerChar = match.winnerId === match.participant1Id ? 'A' : 'B';
    const result = calculateMatchElo(p1Elo, p2Elo, winnerChar);
    eloChange1 = result.playerAChange;
    eloChange2 = result.playerBChange;
    setParticipantGameElo(p1, gameId, result.playerANewElo, getRankName(result.playerANewElo));
    setParticipantGameElo(p2, gameId, result.playerBNewElo, getRankName(result.playerBNewElo));
    await participants.upsert(p1);
    await participants.upsert(p2);
    match.status = 'completed';
  }

  match.gameId = gameId;
  match.participant1EloBefore = p1Elo;
  match.participant2EloBefore = p2Elo;
  match.participant1EloChange = eloChange1;
  match.participant2EloChange = eloChange2;
  match.completedDate = new Date().toISOString();

  console.log(`[applyLeagueMatchElo] Saving match ${match.id} with status=${match.status} gameId=${gameId}`);
  await leagueMatches.upsert(match);
  console.log(`[applyLeagueMatchElo] Match ${match.id} saved successfully`);

  // Verify the match was saved
  const verification = await leagueMatches.findById(match.id);
  if (!verification) {
    console.error(`[applyLeagueMatchElo] CRITICAL: Match ${match.id} not found after upsert!`);
    throw new Error('Match disappeared after save');
  }
  console.log(`[applyLeagueMatchElo] Match ${match.id} verified in DB with status=${verification.status}`);

  return { [match.participant1Id]: eloChange1, [match.participant2Id]: eloChange2 };
}

async function calculateStandings(leagueId) {
  const league = await leagues.findById(leagueId);
  if (!league) return [];

  const gameId = league.gameId || 'ssbu';
  const leagueMatchList = await leagueMatches.getByField('leagueId', leagueId);

  const standings = new Map();

  // Initialize standings for all participants
  for (const pid of league.participantIds) {
    standings.set(pid, {
      participantId: pid,
      rank: 0,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      noShows: 0,
      currentElo: 0,
      eloChange: 0,
      headToHead: {},
    });
  }

  // Get current ELO for all participants (per game)
  const allParticipants = (await participants.getAll()).map(migrateParticipantGames);
  const participantMap = new Map(allParticipants.map(p => [p.id, p]));

  for (const pid of league.participantIds) {
    const p = participantMap.get(pid);
    if (p) standings.get(pid).currentElo = getEffectiveElo(p, gameId);
  }
  
  // Process completed matches
  for (const match of leagueMatchList) {
    if (match.status !== 'completed' && match.status !== 'no_show') continue;
    
    const s1 = standings.get(match.participant1Id);
    const s2 = standings.get(match.participant2Id);
    
    if (!s1 || !s2) continue;
    
    s1.matchesPlayed++;
    s2.matchesPlayed++;
    
    if (match.status === 'no_show') {
      const absent = match.noShowParticipantId;
      const present = absent === match.participant1Id ? match.participant2Id : match.participant1Id;
      
      standings.get(absent).noShows++;
      standings.get(absent).losses++;
      standings.get(present).wins++;
      
      standings.get(absent).headToHead[present] = 'L';
      standings.get(present).headToHead[absent] = 'W';
    } else {
      const winner = match.winnerId;
      const loser = winner === match.participant1Id ? match.participant2Id : match.participant1Id;
      
      standings.get(winner).wins++;
      standings.get(loser).losses++;
      
      standings.get(winner).headToHead[loser] = 'W';
      standings.get(loser).headToHead[winner] = 'L';
    }
    
    // ELO changes
    if (match.participant1EloChange) {
      s1.eloChange += match.participant1EloChange;
    }
    if (match.participant2EloChange) {
      s2.eloChange += match.participant2EloChange;
    }
  }
  
  // Sort by current ELO (descending)
  const sorted = Array.from(standings.values()).sort((a, b) => b.currentElo - a.currentElo);
  
  // Assign ranks
  sorted.forEach((s, i) => { s.rank = i + 1; });
  
  return sorted;
}

// ── Routes ────────────────────────────────────────────────────────────────

// GET /api/leagues?communityId=...
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { communityId } = req.query;
    const data = await leagues.getAll();
    const filtered = filterByCommunity(req.user, data, communityId);
    res.json(filtered);
  } catch (err) {
    console.error('[Leagues] GET / error:', err);
    res.status(500).json({ error: 'Failed to read leagues' });
  }
});

// GET /api/leagues/matches — get all completed league matches for a community
// IMPORTANTE: registrada ANTES de /:id o Express interpreta 'matches' como league id
router.get('/matches', optionalAuth, async (req, res) => {
  try {
    const { communityId } = req.query;
    if (communityId && !isInUserScope(req.user, communityId)) {
      return res.status(403).json({ error: 'Community is not in your scope' });
    }
    const allMatches = await leagueMatches.getAll();
    let filtered = allMatches.filter(m => m.status === 'completed' || m.status === 'no_show');

    if (communityId) {
      const allLeagues = await leagues.getAll();
      const communityLeagueIds = new Set(
        allLeagues.filter(l => l.communityId === communityId).map(l => l.id)
      );
      filtered = filtered.filter(m => communityLeagueIds.has(m.leagueId));
    } else {
      // Sin communityId: los matches no tienen communityId propio — se resuelve via su liga
      const scopedLeagues = filterByCommunity(req.user, await leagues.getAll());
      const ids = new Set(scopedLeagues.map(l => l.id));
      filtered = filtered.filter(m => ids.has(m.leagueId));
    }

    res.json(filtered);
  } catch (err) {
    console.error('[Leagues] GET /matches error:', err);
    res.status(500).json({ error: 'Failed to read league matches' });
  }
});

// GET /api/leagues/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const league = await leagues.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (!isInUserScope(req.user, league.communityId)) {
      return res.status(403).json({ error: 'League is not in your community scope' });
    }
    res.json(league);
  } catch (err) {
    console.error('[Leagues] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to read league' });
  }
});

// POST /api/leagues/:id/register — self-register for a league
router.post('/:id/register', requireAuth, async (req, res) => {
  try {
    const league = await leagues.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (!isInUserScope(req.user, league.communityId)) {
      return res.status(403).json({ error: 'League is not in your community scope' });
    }
    const HOUR_MS = 60 * 60 * 1000;
    if (new Date().getTime() >= new Date(league.startDate).getTime() - HOUR_MS) {
      return res.status(400).json({ error: 'Registration is closed' });
    }

    const participantId = await participantIdFor(req.user, league.communityId);
    if (!participantId) {
      return res.status(400).json({ error: 'You are not a participant of this community' });
    }
    if (league.participantIds.includes(participantId)) {
      return res.status(400).json({ error: 'Already registered' });
    }

    league.participantIds.push(participantId);
    league.updatedAt = new Date().toISOString();
    await leagues.upsert(league);
    res.json(league);
  } catch (err) {
    console.error('[Leagues] POST /:id/register error:', err);
    res.status(500).json({ error: 'Failed to register for league' });
  }
});

// POST /api/leagues/:id/start — manually/auto-start a draft league at close time
router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const league = await leagues.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (!isInUserScope(req.user, league.communityId)) {
      return res.status(403).json({ error: 'League is not in your community scope' });
    }
    if (league.status !== 'draft') {
      return res.status(400).json({ error: 'League already started' });
    }
    const HOUR_MS = 60 * 60 * 1000;
    if (new Date().getTime() < new Date(league.startDate).getTime() - HOUR_MS) {
      return res.status(400).json({ error: 'Registration is still open' });
    }
    if (league.participantIds.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 participants' });
    }

    const matchesCreated = await startLeague(league);
    res.json({ league, matchesCreated });
  } catch (err) {
    console.error('[Leagues] POST /:id/start error:', err);
    res.status(500).json({ error: 'Failed to start league' });
  }
});

// POST /api/leagues/estimate — preview duration before creating
router.post('/estimate', async (req, res) => {
  try {
    const { participantCount, roundsPerOpponent, matchesPerPlayerPerPeriod, periodDays, startDate } = req.body;
    
    const estimate = estimateLeagueDuration(
      participantCount,
      roundsPerOpponent,
      matchesPerPlayerPerPeriod,
      periodDays,
      startDate || new Date().toISOString()
    );
    
    res.json(estimate);
  } catch (err) {
    console.error('[Leagues] POST /estimate error:', err);
    res.status(500).json({ error: 'Failed to estimate duration' });
  }
});

// POST /api/leagues — create new league
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      name,
      gameId,
      participantIds,
      roundsPerOpponent,
      gamesPerMatch,
      matchesPerPlayerPerPeriod,
      periodDays,
      startDate,
      timeZone,
      maxNoShowsBeforeKick,
      gracePeriodDays,
      playoffsEnabled,
      playoffsEloMultiplier,
    } = req.body;
    
    // Validation
    if (!name || !gameId || !participantIds || participantIds.length < 2) {
      return res.status(400).json({ error: 'Invalid league configuration' });
    }
    
    const validGamesPerMatch = [3, 5, 7, 9].includes(gamesPerMatch) ? gamesPerMatch : 3;
    const validRoundsPerOpponent = [1, 2, 3].includes(roundsPerOpponent) ? roundsPerOpponent : 1;
    const communityId = getTargetCommunityId(req.user, req.body.communityId);
    if (!isInUserScope(req.user, communityId)) {
      return res.status(403).json({ error: 'Cannot create league in this community' });
    }
    // game_admin solo puede crear ligas de sus juegos asignados
    if (!canAdminGame(req.user, communityId, gameId)) {
      return res.status(403).json({ error: 'You are not admin of this game' });
    }

    // All selected participants must have this game in their profile and belong to the community
    const participantList = await participants.getAll();
    const ineligible = participantIds.filter((pid) => {
      const p = participantList.find((x) => x.id === pid);
      return !p || (p.communityId && p.communityId !== communityId) || !p.games?.[gameId];
    });
    if (ineligible.length > 0) {
      return res.status(400).json({ error: 'One or more participants are not registered for this game' });
    }

    const isDraft = startDate && new Date(startDate) > new Date();
    const league = {
      id: generateId('league'),
      name,
      gameId,
      participantIds,
      bannedParticipantIds: [],
      roundsPerOpponent: validRoundsPerOpponent,
      gamesPerMatch: validGamesPerMatch,
      matchesPerPlayerPerPeriod: matchesPerPlayerPerPeriod || 2,
      periodDays: periodDays || 7,
      startDate: startDate || new Date().toISOString(),
      timeZone: timeZone || 'America/Havana',
      weekStartDates: {},
      maxNoShowsBeforeKick: maxNoShowsBeforeKick || 3,
      gracePeriodDays: gracePeriodDays ?? 30,
      playoffsEnabled: playoffsEnabled ?? true,
      playoffsEloMultiplier: playoffsEloMultiplier || 1.5,
      communityId,
      status: isDraft ? 'draft' : 'active',
      currentWeek: isDraft ? 0 : 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await leagues.upsert(league);

    let matchesCreated = 0;
    if (isDraft) {
      scheduleLeagueStart(league);
    } else {
      matchesCreated = await startLeague(league);
    }

    res.status(201).json({ league, matchesCreated });
  } catch (err) {
    console.error('[Leagues] POST / error:', err);
    res.status(500).json({ error: 'Failed to create league' });
  }
});

// GET /api/leagues/:id/matches
router.get('/:id/matches', async (req, res) => {
  try {
    const filtered = await leagueMatches.getByField('leagueId', req.params.id);
    res.json(filtered);
  } catch (err) {
    console.error('[Leagues] GET /:id/matches error:', err);
    res.status(500).json({ error: 'Failed to read league matches' });
  }
});

// GET /api/leagues/:id/standings
router.get('/:id/standings', async (req, res) => {
  try {
    const standings = await calculateStandings(req.params.id);
    res.json(standings);
  } catch (err) {
    console.error('[Leagues] GET /:id/standings error:', err);
    res.status(500).json({ error: 'Failed to calculate standings' });
  }
});

// POST /api/leagues/:id/matches/:matchId/result — report match result
router.post('/:id/matches/:matchId/result', requireAuth, async (req, res) => {
  try {
    const { winnerId, score, isNoShow, noShowParticipantId, games } = req.body;
    
    const match = await leagueMatches.findById(req.params.matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (match.leagueId !== req.params.id) return res.status(400).json({ error: 'Match does not belong to this league' });
    if (match.status !== 'scheduled') return res.status(400).json({ error: 'Match already completed' });
    
    const league = await leagues.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    if (!isInUserScope(req.user, league.communityId)) {
      return res.status(403).json({ error: 'League is not in your community scope' });
    }

    const userPid = participantIdFor(req.user, league.communityId);
    const isParticipant = userPid &&
      (match.participant1Id === userPid || match.participant2Id === userPid);
    const isAdmin = canAdminGame(req.user, league.communityId, league.gameId);
    if (!isParticipant && !isAdmin) {
      return res.status(403).json({ error: 'Only participants or admins of this game can report results' });
    }

    // Apply per-game ELO through the shared helper
    if (isNoShow) {
      match.noShowParticipantId = noShowParticipantId;
      match.winnerId = noShowParticipantId === match.participant1Id ? match.participant2Id : match.participant1Id;
    } else {
      const scoreError = validateScoreConsistency(match, winnerId, score);
      if (scoreError) return res.status(400).json({ error: scoreError });
      match.winnerId = winnerId;
      match.score = score;
      if (games) match.games = games;
    }

    const eloChanges = await applyLeagueMatchElo(match);
    
    // Check for no-show kick
    if (isNoShow) {
      const leagueMatchesForNoShow2 = await leagueMatches.getByField('leagueId', league.id);
      const playerMatches = leagueMatchesForNoShow2.filter(m => 
        m.noShowParticipantId === noShowParticipantId
      );
      
      if (playerMatches.length >= league.maxNoShowsBeforeKick) {
        // TODO: Kick player from league (cancel future matches)
        console.warn(`[Leagues] Player ${noShowParticipantId} has ${playerMatches.length} no-shows, should be kicked`);
      }
    }
    
    res.json({ match, eloChanges });
  } catch (err) {
    console.error('[Leagues] POST /:id/matches/:matchId/result error:', err);
    res.status(500).json({ error: 'Failed to report match result' });
  }
});

// POST /api/leagues/:id/expire-matches — mark expired matches as pending_review
router.post('/:id/expire-matches', requireAuth, requireAdmin, async (req, res) => {
  try {
    const league = await leagues.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (!isInUserScope(req.user, league.communityId)) {
      return res.status(403).json({ error: 'League is not in your community scope' });
    }

    const leagueMatchList = await leagueMatches.getByField('leagueId', league.id);
    
    const now = new Date();
    let expiredCount = 0;

    for (const match of leagueMatchList) {
      if (match.status !== 'scheduled') continue;

      const weekStart = new Date(league.weekStartDates[match.week]);
      const gracePeriodEnd = new Date(weekStart.getTime() + (league.periodDays + league.gracePeriodDays) * 24 * 60 * 60 * 1000);

      if (now > gracePeriodEnd) {
        match.status = 'pending_review';
        match.deadline = gracePeriodEnd.toISOString();
        await leagueMatches.upsert(match);
        expiredCount++;
      }
    }

    res.json({ expiredCount });
  } catch (err) {
    console.error('[Leagues] POST /:id/expire-matches error:', err);
    res.status(500).json({ error: 'Failed to expire matches' });
  }
});

// POST /api/leagues/:id/matches/:matchId/mark-no-show — manually mark as no-show from pending_review
router.post('/:id/matches/:matchId/mark-no-show', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { noShowParticipantId } = req.body;
    
    const match = await leagueMatches.findById(req.params.matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (match.leagueId !== req.params.id) return res.status(400).json({ error: 'Match does not belong to this league' });
    if (match.status !== 'pending_review') return res.status(400).json({ error: 'Match is not pending review' });

    const league = await leagues.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (!canAdminGame(req.user, league.communityId, league.gameId)) {
      return res.status(403).json({ error: 'You are not admin of this game' });
    }

    const absentId = noShowParticipantId;
    const presentId = absentId === match.participant1Id ? match.participant2Id : match.participant1Id;
    match.noShowParticipantId = absentId;
    match.winnerId = presentId;

    const eloChanges = await applyLeagueMatchElo(match);

    // Check for no-show kick eligibility
    const leagueMatchesForNoShow = await leagueMatches.getByField('leagueId', league.id);
    const playerMatches = leagueMatchesForNoShow.filter(m =>
      m.leagueId === league.id &&
      m.noShowParticipantId === noShowParticipantId
    );

    const isEligibleForBan = playerMatches.length >= league.maxNoShowsBeforeKick;
    if (isEligibleForBan) {
      notifyAdminsOfBanEligibility(league.id, noShowParticipantId, playerMatches.length).catch(err =>
        console.error('[Leagues] Admin ban eligibility notification failed:', err)
      );
    }
    const absentPlayer = await participants.findById(noShowParticipantId);

    res.json({
      match,
      eloChanges,
      banEligible: isEligibleForBan ? {
        participantId: noShowParticipantId,
        name: absentPlayer?.name || 'Unknown',
        alias: absentPlayer?.alias,
        noShowCount: playerMatches.length,
        maxNoShows: league.maxNoShowsBeforeKick,
      } : null,
    });
  } catch (err) {
    console.error('[Leagues] POST /:id/matches/:matchId/mark-no-show error:', err);
    res.status(500).json({ error: 'Failed to mark no-show' });
  }
});

// POST /api/leagues/:id/matches/:matchId/cancel — cancel match without penalty
router.post('/:id/matches/:matchId/cancel', requireAuth, requireAdmin, async (req, res) => {
  try {
    const match = await leagueMatches.findById(req.params.matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (match.leagueId !== req.params.id) return res.status(400).json({ error: 'Match does not belong to this league' });
    if (match.status !== 'pending_review') return res.status(400).json({ error: 'Match is not pending review' });

    const leagueForCancel = await leagues.findById(req.params.id);
    if (leagueForCancel && !canAdminGame(req.user, leagueForCancel.communityId, leagueForCancel.gameId)) {
      return res.status(403).json({ error: 'You are not admin of this game' });
    }

    // Simply mark as completed with no winner/loser and no ELO change
    match.status = 'completed';
    match.score = 'Cancelled';
    match.completedDate = new Date().toISOString();
    await leagueMatches.upsert(match);

    res.json({ match });
  } catch (err) {
    console.error('[Leagues] POST /:id/matches/:matchId/cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel match' });
  }
});

// POST /api/leagues/:id/ban-participants — ban players and regenerate schedule
router.post('/:id/ban-participants', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { participantIds } = req.body; // Array of participant IDs to ban
    
    const league = await leagues.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (!canAdminGame(req.user, league.communityId, league.gameId)) {
      return res.status(403).json({ error: 'You are not admin of this game' });
    }

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return res.status(400).json({ error: 'No participants to ban' });
    }

    // Add to banned list
    const newBanned = [...new Set([...league.bannedParticipantIds, ...participantIds])];
    league.bannedParticipantIds = newBanned;

    // Get active participants (not banned)
    const activeParticipants = league.participantIds.filter(pid => !newBanned.includes(pid));

    if (activeParticipants.length < 2) {
      return res.status(400).json({ error: 'Cannot ban: league needs at least 2 active participants' });
    }

    // Get all matches for this league
    const leagueMatchList = await leagueMatches.getByField('leagueId', league.id);

    // Separate completed/no_show matches from scheduled/pending_review
    const completedMatches = leagueMatchList.filter(m => 
      m.status === 'completed' || m.status === 'no_show'
    );
    const futureMatches = leagueMatchList.filter(m => 
      m.status === 'scheduled' || m.status === 'pending_review'
    );

    // Delete all future matches (we'll regenerate)
    for (const match of futureMatches) {
      await leagueMatches.remove(match.id);
    }

    // Regenerate schedule with active participants only
    const pairings = generateRoundRobinPairings(activeParticipants, league.roundsPerOpponent);
    const weekDistribution = distributeIntoWeeks(pairings, league.matchesPerPlayerPerPeriod, activeParticipants.length);

    // Recalculate week start dates
    const start = new Date(league.startDate);
    const weekStartDates = {};
    const newMatches = [];

    for (const { week, rounds } of weekDistribution) {
      const weekStart = new Date(start.getTime() + (week - 1) * league.periodDays * 24 * 60 * 60 * 1000);
      weekStartDates[week] = weekStart.toISOString();

      for (const roundNum of rounds) {
        const roundData = pairings.find(p => p.round === roundNum);
        if (!roundData) continue;

        for (const [p1, p2] of roundData.pairings) {
          const deadline = new Date(weekStart.getTime() + (league.periodDays + (league.gracePeriodDays || 30)) * 24 * 60 * 60 * 1000);
          newMatches.push({
            id: generateId('lmatch'),
            leagueId: league.id,
            gameId: league.gameId,
            round: roundNum,
            week,
            participant1Id: p1,
            participant2Id: p2,
            status: 'scheduled',
            scheduledDate: weekStart.toISOString(),
            deadline: deadline.toISOString(),
          });
        }
      }
    }

    // Save new matches
    for (const match of newMatches) {
      await leagueMatches.upsert(match);
    }

    // Update league
    league.weekStartDates = weekStartDates;
    league.updatedAt = new Date().toISOString();
    await leagues.upsert(league);

    // Re-schedule notifications for the new schedule
    scheduleLeagueNotifications(league);

    res.json({
      bannedCount: participantIds.length,
      activeParticipants: activeParticipants.length,
      newMatchesCreated: newMatches.length,
      completedMatchesPreserved: completedMatches.length,
    });
  } catch (err) {
    console.error('[Leagues] POST /:id/ban-participants error:', err);
    res.status(500).json({ error: 'Failed to ban participants' });
  }
});

// GET /api/leagues/:id/eligible-for-ban — get participants eligible for ban
router.get('/:id/eligible-for-ban', requireAuth, async (req, res) => {
  try {
    const league = await leagues.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (!canAdminGame(req.user, league.communityId, league.gameId)) {
      return res.status(403).json({ error: 'You are not admin of this game' });
    }

    const leagueMatchList = await leagueMatches.getByField('leagueId', league.id);

    const noShowCounts = {};

    for (const match of leagueMatchList) {
      if (match.status === 'no_show' && match.noShowParticipantId) {
        noShowCounts[match.noShowParticipantId] = (noShowCounts[match.noShowParticipantId] || 0) + 1;
      }
    }

    const eligible = [];
    for (const [pid, count] of Object.entries(noShowCounts)) {
      if (count >= league.maxNoShowsBeforeKick && !league.bannedParticipantIds.includes(pid)) {
        const p = await participants.findById(pid);
        eligible.push({
          participantId: pid,
          name: p?.name || 'Unknown',
          alias: p?.alias,
          noShowCount: count,
        });
      }
    }

    res.json({ eligible, maxNoShows: league.maxNoShowsBeforeKick });
  } catch (err) {
    console.error('[Leagues] GET /:id/eligible-for-ban error:', err);
    res.status(500).json({ error: 'Failed to get eligible participants' });
  }
});

// DELETE /api/leagues/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const league = await leagues.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (!isInUserScope(req.user, league.communityId)) {
      return res.status(403).json({ error: 'League is not in your community scope' });
    }
    if (!canAdminGame(req.user, league.communityId, league.gameId)) {
      return res.status(403).json({ error: 'You are not admin of this game' });
    }
    const deleted = await leagues.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'League not found' });
    
    // Delete all associated matches
    const toDelete = await leagueMatches.getByField('leagueId', req.params.id);
    for (const match of toDelete) {
      await leagueMatches.remove(match.id);
    }
    
    res.json({ ok: true, matchesDeleted: toDelete.length });
  } catch (err) {
    console.error('[Leagues] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete league' });
  }
});

// POST /api/leagues/:id/matches/:matchId/report — participant reports their version of the result
router.post('/:id/matches/:matchId/report', requireAuth, async (req, res) => {
  try {
    const { winnerId, score, isNoShow, noShowParticipantId, evidence, games } = req.body;

    // Re-fetch match to avoid race conditions
    const match = await leagueMatches.findById(req.params.matchId);
    if (!match) {
      console.error(`[Leagues] Match not found: ${req.params.matchId}`);
      return res.status(404).json({ error: 'Match not found' });
    }
    if (match.leagueId !== req.params.id) return res.status(400).json({ error: 'Match does not belong to this league' });
    if (match.status !== 'scheduled' && match.status !== 'reported') {
      console.log(`[Leagues] Match ${req.params.matchId} status is ${match.status}, cannot report`);
      return res.status(400).json({ error: 'Match already completed or in review' });
    }

    const league = await leagues.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    if (winnerId !== match.participant1Id && winnerId !== match.participant2Id) {
      return res.status(400).json({ error: 'Winner must be one of the participants' });
    }

    if (isNoShow && noShowParticipantId !== match.participant1Id && noShowParticipantId !== match.participant2Id) {
      return res.status(400).json({ error: 'No-show player must be one of the participants' });
    }

    if (!isNoShow) {
      const scoreError = validateScoreConsistency(match, winnerId, score);
      if (scoreError) return res.status(400).json({ error: scoreError });
    }

    const reporterId = participantIdFor(req.user, league.communityId);
    const isParticipant = reporterId === match.participant1Id || reporterId === match.participant2Id;
    const isAdminRole = canAdminGame(req.user, league.communityId, league.gameId);
    if (!isParticipant && !isAdminRole) {
      return res.status(403).json({ error: 'Only participants or admins of this game can report results' });
    }

    if (!match.reportedResults) match.reportedResults = [];
    const existing = match.reportedResults.findIndex(r => r.participantId === reporterId);
    const report = {
      participantId: reporterId,
      winnerId,
      score,
      isNoShow: !!isNoShow,
      noShowParticipantId: isNoShow ? noShowParticipantId : undefined,
      evidence: evidence || undefined,
      games: games || undefined,
      reportedAt: new Date().toISOString(),
    };
    if (existing >= 0) match.reportedResults[existing] = report;
    else match.reportedResults.push(report);

    if (isAdminRole) {
      match.winnerId = winnerId;
      match.score = score;
      match.noShowParticipantId = isNoShow ? noShowParticipantId : undefined;
      if (games) match.games = games;
      const eloChanges = await applyLeagueMatchElo(match);
      return res.json({ match, eloChanges });
    }

    const otherReport = match.reportedResults.find(r => r.participantId !== reporterId);
    if (otherReport) {
      console.log(`[Leagues] Match ${req.params.matchId}: Both players reported. Checking consensus...`);
      if (otherReport.winnerId === winnerId && otherReport.isNoShow === !!isNoShow) {
        console.log(`[Leagues] Match ${req.params.matchId}: Consensus reached, applying ELO...`);
        match.winnerId = winnerId;
        match.score = score;
        match.noShowParticipantId = isNoShow ? noShowParticipantId : undefined;
        if (games) match.games = games;
        try {
          const eloChanges = await applyLeagueMatchElo(match);
          console.log(`[Leagues] Match ${req.params.matchId}: ELO applied successfully, status=${match.status}`);
          return res.json({ match, eloChanges });
        } catch (eloErr) {
          console.error(`[Leagues] Match ${req.params.matchId}: ELO application failed:`, eloErr);
          throw eloErr;
        }
      }

      // Results differ: admin must resolve
      console.log(`[Leagues] Match ${req.params.matchId}: Results differ, moving to pending_review`);
      match.status = 'pending_review';
      await leagueMatches.upsert(match);
      return res.json({ match, eloChanges: null });
    }

    console.log(`[Leagues] Match ${req.params.matchId}: First report, marking as 'reported'`);
    match.status = 'reported';
    await leagueMatches.upsert(match);
    res.json({ match, eloChanges: null });
  } catch (err) {
    console.error('[Leagues] POST /:id/matches/:matchId/report error:', err);
    res.status(500).json({ error: 'Failed to report match result' });
  }
});

// POST /api/leagues/:id/matches/:matchId/resolve — admin resolves a dispute
router.post('/:id/matches/:matchId/resolve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { winnerId, score, isNoShow, noShowParticipantId, games } = req.body;

    const match = await leagueMatches.findById(req.params.matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (match.leagueId !== req.params.id) return res.status(400).json({ error: 'Match does not belong to this league' });
    if (match.status !== 'pending_review' && match.status !== 'reported') {
      return res.status(400).json({ error: 'Match cannot be resolved' });
    }

    if (winnerId !== match.participant1Id && winnerId !== match.participant2Id) {
      return res.status(400).json({ error: 'Winner must be one of the participants' });
    }

    const leagueForResolve = await leagues.findById(req.params.id);
    if (leagueForResolve && !canAdminGame(req.user, leagueForResolve.communityId, leagueForResolve.gameId)) {
      return res.status(403).json({ error: 'You are not admin of this game' });
    }

    // Validate BEFORE mutating the match
    if (!isNoShow) {
      const scoreError = validateScoreConsistency(match, winnerId, score);
      if (scoreError) return res.status(400).json({ error: scoreError });
    }

    match.winnerId = winnerId;
    match.score = score;
    match.noShowParticipantId = isNoShow ? noShowParticipantId : undefined;
    if (games) match.games = games;

    const eloChanges = await applyLeagueMatchElo(match);
    res.json({ match, eloChanges });
  } catch (err) {
    console.error('[Leagues] POST /:id/matches/:matchId/resolve error:', err);
    res.status(500).json({ error: 'Failed to resolve match dispute' });
  }
});

// GET /api/leagues/:id/matches/:matchId/debug — debug match state (admin only)
router.get('/:id/matches/:matchId/debug', requireAuth, requireAdmin, async (req, res) => {
  try {
    const match = await leagueMatches.findById(req.params.matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    
    const leagueMatchList = await leagueMatches.getByField('leagueId', req.params.id);
    const weekMatches = leagueMatchList.filter(m => m.week === match.week);
    
    res.json({
      match,
      exists: !!match,
      totalLeagueMatches: leagueMatchList.length,
      weekMatches: weekMatches.length,
      weekMatchIds: weekMatches.map(m => m.id),
    });
  } catch (err) {
    console.error('[Leagues] GET /:id/matches/:matchId/debug error:', err);
    res.status(500).json({ error: 'Failed to debug match' });
  }
});

// POST /api/leagues/:id/regenerate-schedule — regenerate remaining matches (admin only)
router.post('/:id/regenerate-schedule', requireAuth, requireAdmin, async (req, res) => {
  try {
    const league = await leagues.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (!canAdminGame(req.user, league.communityId, league.gameId)) {
      return res.status(403).json({ error: 'You are not admin of this game' });
    }

    // Get active participants (not banned)
    const activeParticipants = league.participantIds.filter(pid => !league.bannedParticipantIds.includes(pid));

    if (activeParticipants.length < 2) {
      return res.status(400).json({ error: 'League needs at least 2 active participants' });
    }

    // Get all matches for this league
    const leagueMatchList = await leagueMatches.getByField('leagueId', league.id);

    // Separate completed/no_show matches from scheduled/pending_review
    const completedMatches = leagueMatchList.filter(m => 
      m.status === 'completed' || m.status === 'no_show'
    );
    const futureMatches = leagueMatchList.filter(m => 
      m.status === 'scheduled' || m.status === 'pending_review' || m.status === 'reported'
    );

    // Delete all future matches (we'll regenerate)
    for (const match of futureMatches) {
      await leagueMatches.remove(match.id);
    }

    // Regenerate schedule with active participants
    const pairings = generateRoundRobinPairings(activeParticipants, league.roundsPerOpponent);
    const weekDistribution = distributeIntoWeeks(pairings, league.matchesPerPlayerPerPeriod, activeParticipants.length);

    // Recalculate week start dates
    const start = new Date(league.startDate);
    const weekStartDates = {};
    const newMatches = [];

    for (const { week, rounds } of weekDistribution) {
      const weekStart = new Date(start.getTime() + (week - 1) * league.periodDays * 24 * 60 * 60 * 1000);
      weekStartDates[week] = weekStart.toISOString();

      for (const roundNum of rounds) {
        const roundData = pairings.find(p => p.round === roundNum);
        if (!roundData) continue;

        for (const [p1, p2] of roundData.pairings) {
          const deadline = new Date(weekStart.getTime() + (league.periodDays + (league.gracePeriodDays || 30)) * 24 * 60 * 60 * 1000);
          newMatches.push({
            id: generateId('lmatch'),
            leagueId: league.id,
            gameId: league.gameId,
            round: roundNum,
            week,
            participant1Id: p1,
            participant2Id: p2,
            status: 'scheduled',
            scheduledDate: weekStart.toISOString(),
            deadline: deadline.toISOString(),
          });
        }
      }
    }

    // Save new matches
    for (const match of newMatches) {
      await leagueMatches.upsert(match);
    }

    // Update league
    league.weekStartDates = weekStartDates;
    league.updatedAt = new Date().toISOString();
    await leagues.upsert(league);

    // Re-schedule notifications for the new schedule
    scheduleLeagueNotifications(league);

    res.json({
      activeParticipants: activeParticipants.length,
      newMatchesCreated: newMatches.length,
      completedMatchesPreserved: completedMatches.length,
      deletedMatches: futureMatches.length,
    });
  } catch (err) {
    console.error('[Leagues] POST /:id/regenerate-schedule error:', err);
    res.status(500).json({ error: 'Failed to regenerate schedule' });
  }
});

export default router;
