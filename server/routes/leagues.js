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
import { requireAuth, requireAdmin } from '../utils/jwtMiddleware.js';

const router = Router();

// ── Utility functions ─────────────────────────────────────────────────────

function generateId(prefix = 'league') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function calculateStandings(leagueId) {
  const league = await leagues.findById(leagueId);
  if (!league) return [];
  
  const matches = await leagueMatches.getAll();
  const leagueMatchList = matches.filter(m => m.leagueId === leagueId);
  
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
  
  // Get current ELO for all participants
  const allParticipants = await participants.getAll();
  const participantMap = new Map(allParticipants.map(p => [p.id, p]));
  
  for (const pid of league.participantIds) {
    const p = participantMap.get(pid);
    if (p) standings.get(pid).currentElo = p.eloPoints ?? 1500;
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

// GET /api/leagues
router.get('/', async (_req, res) => {
  try {
    const data = await leagues.getAll();
    res.json(data);
  } catch (err) {
    console.error('[Leagues] GET / error:', err);
    res.status(500).json({ error: 'Failed to read leagues' });
  }
});

// GET /api/leagues/:id
router.get('/:id', async (req, res) => {
  try {
    const league = await leagues.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    res.json(league);
  } catch (err) {
    console.error('[Leagues] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to read league' });
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
      maxNoShowsBeforeKick,
      playoffsEnabled,
      playoffsEloMultiplier,
    } = req.body;
    
    // Validation
    if (!name || !gameId || !participantIds || participantIds.length < 2) {
      return res.status(400).json({ error: 'Invalid league configuration' });
    }
    
    const validGamesPerMatch = [3, 5, 7, 9].includes(gamesPerMatch) ? gamesPerMatch : 3;
    const validRoundsPerOpponent = [1, 2, 3].includes(roundsPerOpponent) ? roundsPerOpponent : 1;
    
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
      weekStartDates: {}, // Will be populated below
      maxNoShowsBeforeKick: maxNoShowsBeforeKick || 3,
      gracePeriodDays: 30, // Default: 30 días de gracia
      playoffsEnabled: playoffsEnabled ?? true,
      playoffsEloMultiplier: playoffsEloMultiplier || 1.5,
      status: 'active',
      currentWeek: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await leagues.upsert(league);
    
    // Generate schedule
    const pairings = generateRoundRobinPairings(participantIds, league.roundsPerOpponent);
    const weekDistribution = distributeIntoWeeks(pairings, league.matchesPerPlayerPerPeriod, participantIds.length);
    
    // Create match records and populate weekStartDates
    const matchRecords = [];
    const start = new Date(league.startDate);
    const weekStartDates = {};
    
    for (const { week, rounds } of weekDistribution) {
      const weekStart = new Date(start.getTime() + (week - 1) * league.periodDays * 24 * 60 * 60 * 1000);
      weekStartDates[week] = weekStart.toISOString();
      
      for (const roundNum of rounds) {
        const roundData = pairings.find(p => p.round === roundNum);
        if (!roundData) continue;
        
        for (const [p1, p2] of roundData.pairings) {
          matchRecords.push({
            id: generateId('lmatch'),
            leagueId: league.id,
            round: roundNum,
            week,
            participant1Id: p1,
            participant2Id: p2,
            status: 'scheduled',
            scheduledDate: weekStart.toISOString(),
          });
        }
      }
    }
    
    // Update league with weekStartDates
    league.weekStartDates = weekStartDates;
    await leagues.upsert(league);
    
    // Save all matches
    for (const match of matchRecords) {
      await leagueMatches.upsert(match);
    }
    
    res.status(201).json({ league, matchesCreated: matchRecords.length });
  } catch (err) {
    console.error('[Leagues] POST / error:', err);
    res.status(500).json({ error: 'Failed to create league' });
  }
});

// GET /api/leagues/:id/matches
router.get('/:id/matches', async (req, res) => {
  try {
    const all = await leagueMatches.getAll();
    const filtered = all.filter(m => m.leagueId === req.params.id);
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
    const { winnerId, score, isNoShow, noShowParticipantId } = req.body;
    
    const match = await leagueMatches.findById(req.params.matchId);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    if (match.leagueId !== req.params.id) return res.status(400).json({ error: 'Match does not belong to this league' });
    if (match.status !== 'scheduled') return res.status(400).json({ error: 'Match already completed' });
    
    const league = await leagues.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    
    // Get both participants
    const [p1, p2] = await Promise.all([
      participants.findById(match.participant1Id),
      participants.findById(match.participant2Id),
    ]);
    
    if (!p1 || !p2) {
      return res.status(404).json({ error: 'Participant not found' });
    }
    
    const p1Elo = p1.eloPoints ?? 1500;
    const p2Elo = p2.eloPoints ?? 1500;
    
    let eloChange1 = 0;
    let eloChange2 = 0;
    
    if (isNoShow) {
      // No-show: absent player loses ELO as if they lost, present player gets nothing
      const absentId = noShowParticipantId;
      const presentId = absentId === match.participant1Id ? match.participant2Id : match.participant1Id;
      
      // Calculate ELO as if present player won
      const winnerChar = presentId === match.participant1Id ? 'A' : 'B';
      const result = calculateMatchElo(p1Elo, p2Elo, winnerChar);
      
      if (absentId === match.participant1Id) {
        eloChange1 = result.playerAChange;
        eloChange2 = 0; // Present player gets no ELO
        
        // Update absent player's ELO
        const newElo1 = result.playerANewElo;
        const newRank1 = getRankName(newElo1);
        await participants.upsert({
          ...p1,
          eloPoints: newElo1,
          eloRank: newRank1,
          updatedAt: new Date().toISOString(),
        });
      } else {
        eloChange1 = 0;
        eloChange2 = result.playerBChange;
        
        // Update absent player's ELO
        const newElo2 = result.playerBNewElo;
        const newRank2 = getRankName(newElo2);
        await participants.upsert({
          ...p2,
          eloPoints: newElo2,
          eloRank: newRank2,
          updatedAt: new Date().toISOString(),
        });
      }
      
      match.status = 'no_show';
      match.noShowParticipantId = absentId;
      match.winnerId = presentId;
    } else {
      // Normal match: calculate ELO and update both players
      const winnerChar = winnerId === match.participant1Id ? 'A' : 'B';
      const result = calculateMatchElo(p1Elo, p2Elo, winnerChar);
      
      eloChange1 = result.playerAChange;
      eloChange2 = result.playerBChange;
      
      // Update both participants
      const newElo1 = result.playerANewElo;
      const newElo2 = result.playerBNewElo;
      const newRank1 = getRankName(newElo1);
      const newRank2 = getRankName(newElo2);
      
      await participants.upsert({
        ...p1,
        eloPoints: newElo1,
        eloRank: newRank1,
        updatedAt: new Date().toISOString(),
      });
      
      await participants.upsert({
        ...p2,
        eloPoints: newElo2,
        eloRank: newRank2,
        updatedAt: new Date().toISOString(),
      });
      
      match.status = 'completed';
      match.winnerId = winnerId;
      match.score = score;
    }
    
    match.participant1EloChange = eloChange1;
    match.participant2EloChange = eloChange2;
    match.completedDate = new Date().toISOString();
    
    await leagueMatches.upsert(match);
    
    // Check for no-show kick
    if (isNoShow) {
      const allMatches = await leagueMatches.getAll();
      const playerMatches = allMatches.filter(m => 
        m.leagueId === league.id && 
        m.noShowParticipantId === noShowParticipantId
      );
      
      if (playerMatches.length >= league.maxNoShowsBeforeKick) {
        // TODO: Kick player from league (cancel future matches)
        console.warn(`[Leagues] Player ${noShowParticipantId} has ${playerMatches.length} no-shows, should be kicked`);
      }
    }
    
    res.json({ match, eloChanges: { [match.participant1Id]: eloChange1, [match.participant2Id]: eloChange2 } });
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

    const allMatches = await leagueMatches.getAll();
    const leagueMatchList = allMatches.filter(m => m.leagueId === league.id);
    
    const now = new Date();
    let expiredCount = 0;

    for (const match of leagueMatchList) {
      if (match.status !== 'scheduled') continue;

      const weekStart = new Date(league.weekStartDates[match.week]);
      const gracePeriodEnd = new Date(weekStart.getTime() + (league.periodDays + league.gracePeriodDays) * 24 * 60 * 60 * 1000);

      if (now > gracePeriodEnd) {
        match.status = 'pending_review';
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

    // Get participants
    const p1 = await participants.findById(match.participant1Id);
    const p2 = await participants.findById(match.participant2Id);
    if (!p1 || !p2) return res.status(404).json({ error: 'Participant not found' });

    const absentId = noShowParticipantId;
    const presentId = absentId === match.participant1Id ? match.participant2Id : match.participant1Id;

    // Calculate ELO as if present player won
    const p1Elo = p1.eloPoints ?? 1500;
    const p2Elo = p2.eloPoints ?? 1500;
    const winnerChar = presentId === match.participant1Id ? 'A' : 'B';
    const result = calculateMatchElo(p1Elo, p2Elo, winnerChar);

    let eloChange1 = 0;
    let eloChange2 = 0;

    if (absentId === match.participant1Id) {
      eloChange1 = result.newEloA - p1Elo;
      await participants.upsert({
        ...p1,
        eloPoints: result.newEloA,
        eloRank: getRankFromElo(result.newEloA),
        updatedAt: new Date().toISOString(),
      });
    } else {
      eloChange2 = result.newEloB - p2Elo;
      await participants.upsert({
        ...p2,
        eloPoints: result.newEloB,
        eloRank: getRankFromElo(result.newEloB),
        updatedAt: new Date().toISOString(),
      });
    }

    match.status = 'no_show';
    match.noShowParticipantId = absentId;
    match.winnerId = presentId;
    match.participant1EloChange = eloChange1;
    match.participant2EloChange = eloChange2;
    match.completedDate = new Date().toISOString();

    await leagueMatches.upsert(match);

    // Check for no-show kick eligibility
    const allMatches = await leagueMatches.getAll();
    const playerMatches = allMatches.filter(m =>
      m.leagueId === league.id &&
      m.noShowParticipantId === noShowParticipantId
    );

    const isEligibleForBan = playerMatches.length >= league.maxNoShowsBeforeKick;
    const absentPlayer = await participants.findById(noShowParticipantId);

    res.json({
      match,
      eloChanges: { [match.participant1Id]: eloChange1, [match.participant2Id]: eloChange2 },
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

    // Get all matches
    const allMatches = await leagueMatches.getAll();
    const leagueMatchList = allMatches.filter(m => m.leagueId === league.id);

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
          newMatches.push({
            id: generateId('lmatch'),
            leagueId: league.id,
            round: roundNum,
            week,
            participant1Id: p1,
            participant2Id: p2,
            status: 'scheduled',
            scheduledDate: weekStart.toISOString(),
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
router.get('/:id/eligible-for-ban', async (req, res) => {
  try {
    const league = await leagues.findById(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const allMatches = await leagueMatches.getAll();
    const leagueMatchList = allMatches.filter(m => m.leagueId === league.id);

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
    const deleted = await leagues.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'League not found' });
    
    // Delete all associated matches
    const all = await leagueMatches.getAll();
    const toDelete = all.filter(m => m.leagueId === req.params.id);
    for (const match of toDelete) {
      await leagueMatches.remove(match.id);
    }
    
    res.json({ ok: true, matchesDeleted: toDelete.length });
  } catch (err) {
    console.error('[Leagues] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete league' });
  }
});

export default router;
