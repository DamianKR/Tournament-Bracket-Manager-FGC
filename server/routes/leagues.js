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
router.post('/', async (req, res) => {
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
    
    const league = {
      id: generateId('league'),
      name,
      gameId,
      participantIds,
      roundsPerOpponent: roundsPerOpponent || 1,
      gamesPerMatch: gamesPerMatch || 3,
      matchesPerPlayerPerPeriod: matchesPerPlayerPerPeriod || 2,
      periodDays: periodDays || 7,
      startDate: startDate || new Date().toISOString(),
      maxNoShowsBeforeKick: maxNoShowsBeforeKick || 3,
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
    
    // Create match records
    const matchRecords = [];
    const start = new Date(league.startDate);
    
    for (const { week, rounds } of weekDistribution) {
      for (const roundNum of rounds) {
        const roundData = pairings.find(p => p.round === roundNum);
        if (!roundData) continue;
        
        for (const [p1, p2] of roundData.pairings) {
          const scheduledDate = new Date(start.getTime() + (week - 1) * league.periodDays * 24 * 60 * 60 * 1000);
          
          matchRecords.push({
            id: generateId('lmatch'),
            leagueId: league.id,
            round: roundNum,
            week,
            participant1Id: p1,
            participant2Id: p2,
            status: 'scheduled',
            scheduledDate: scheduledDate.toISOString(),
          });
        }
      }
    }
    
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
router.post('/:id/matches/:matchId/result', async (req, res) => {
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

// DELETE /api/leagues/:id
router.delete('/:id', async (req, res) => {
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
