/**
 * Global Participants routes
 *
 * These are participants that exist independently of any tournament.
 * They can be reused across multiple tournaments.
 *
 * GET    /api/participants           — list all
 * GET    /api/participants/:id       — get one
 * POST   /api/participants           — create new participant
 * PUT    /api/participants/:id       — update participant (name, alias, avatarUrl)
 * DELETE /api/participants/:id       — delete participant
 *
 * Stats (updated by the frontend after a tournament completes):
 * POST   /api/participants/:id/stats — merge-update stats
 */

import { Router } from 'express';
import { participants, tournaments, leagues, leagueMatches } from '../db/collections.js';
import { validateParticipant } from '../models/participant.js';
import { requireAuth, requireAdmin, optionalAuth } from '../utils/jwtMiddleware.js';
import { filterByCommunity, isInUserScope, getTargetCommunityId } from '../utils/communityScope.js';
import {
  migrateParticipantGames,
  setParticipantPrimaryGame,
  setParticipantGameMain,
  setParticipantGameList,
  getEffectiveElo,
} from '../utils/participantGames.js';

const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Merge per-game profiles: server ELO is authoritative, main character can come from client. */
function mergeGameProfiles(current = {}, incoming = {}) {
  const merged = { ...current };
  for (const gameId of Object.keys(incoming)) {
    const inc = incoming[gameId];
    if (!merged[gameId]) {
      merged[gameId] = { ...inc };
    } else {
      // Keep server ELO values, allow client to update main character
      merged[gameId] = {
        ...merged[gameId],
        mainCharacterId: inc.mainCharacterId ?? merged[gameId].mainCharacterId,
      };
    }
  }
  return merged;
}

/** Build a games map from the request, preserving any existing server profiles and ELO. */
function resolveGames(existing, incoming) {
  const base = migrateParticipantGames({ ...(existing || {}), games: { ...(existing?.games || {}) } }).games;
  const incomingGames = incoming?.games || {};

  // If the client sent legacy single-game ELO but no games object, migrate it
  if (Object.keys(incomingGames).length === 0 && incoming?.eloPoints !== undefined) {
    const fallbackGameId = incoming?.gameId || 'ssbu';
    if (!base[fallbackGameId] || base[fallbackGameId].eloPoints == null) {
      base[fallbackGameId] = {
        gameId: fallbackGameId,
        mainCharacterId: incoming?.mainCharacterId ?? null,
        eloPoints: incoming.eloPoints ?? null,
        eloRank: incoming?.eloRank ?? 'Sin puntos',
      };
    }
    return base;
  }

  return mergeGameProfiles(base, incomingGames);
}

// ── Routes ────────────────────────────────────────────────────────────────

// GET /api/participants?communityId=...
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { communityId } = req.query;
    const data = await participants.getAll();
    res.json(filterByCommunity(req.user, data, communityId));
  } catch (err) {
    console.error('[Participants] GET / error:', err);
    res.status(500).json({ error: 'Failed to read participants' });
  }
});

// GET /api/participants/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });
    if (!isInUserScope(req.user, p.communityId)) {
      return res.status(403).json({ error: 'Participant is not in your community scope' });
    }
    res.json(p);
  } catch (err) {
    console.error('[Participants] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to read participant' });
  }
});

// POST /api/participants
// - Array body  → merge sync (preserves ELO fields from JSON if incoming record lacks them)
// - Object body → upsert single participant
router.post('/', requireAuth, async (req, res) => {
  try {
    if (Array.isArray(req.body)) {
      // Load existing records so we can preserve ELO data that the frontend
      // doesn't know about (e.g. updated by the ranking engine after a match).
      const existing = await participants.getAll();
      const existingMap = new Map(existing.map((p) => [p.id, p]));

      // Reject bulk sync if it tries to write to a community outside the user's scope
      const invalidCommunity = req.body.some((incoming) => {
        const communityId = getTargetCommunityId(req.user, incoming.communityId);
        return !isInUserScope(req.user, communityId);
      });
      if (invalidCommunity) {
        return res.status(403).json({ error: 'Cannot sync participants outside your community scope' });
      }

      const merged = req.body.map((incoming) => {
        const current = existingMap.get(incoming.id);
        const communityId = getTargetCommunityId(req.user, incoming.communityId);

        // Per-game ELO is written by the ranking engine. Preserve the server
        // profiles and only merge in new game profiles / main characters from the client.
        const games = resolveGames(current, incoming);

        return {
          ...incoming,
          games,
          communityId,
        };
      });

      await participants.replaceAll(merged);
      return res.json({ ok: true, count: merged.length });
    }

    // Single object upsert
    const body = req.body;
    body.communityId = getTargetCommunityId(req.user, body.communityId);
    if (!isInUserScope(req.user, body.communityId)) {
      return res.status(403).json({ error: 'Cannot create participant in this community' });
    }
    const { valid, errors } = validateParticipant(body);
    if (!valid) return res.status(400).json({ error: 'Invalid participant data', details: errors });

    if (!body.stats) {
      body.stats = { tournamentsPlayed: 0, wins: 0, matchWins: 0, matchLosses: 0 };
    }
    body.games = resolveGames(null, body);

    // Apply explicit game list (with per-game main characters) if provided
    if (Array.isArray(body.gameIds) && body.gameIds.length > 0) {
      setParticipantGameList(body, body.gameIds, body.primaryGameId, body.gameMainCharacters || {});
    } else if (body.gameId) {
      setParticipantPrimaryGame(body, body.gameId, body.mainCharacterId);
    }

    body.createdAt = body.createdAt ?? new Date().toISOString();
    body.updatedAt = new Date().toISOString();

    await participants.upsert(body);
    return res.status(201).json(body);
  } catch (err) {
    console.error('[Participants] POST / error:', err);
    res.status(500).json({ error: 'Failed to save participants' });
  }
});

// PUT /api/participants/:id — upsert (create if not exists, update if exists)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await participants.findById(req.params.id);

    if (existing && !isInUserScope(req.user, existing.communityId)) {
      return res.status(403).json({ error: 'Participant is not in your community scope' });
    }

    if (!existing) {
      // CREATE: body must contain the full participant object from the frontend
      const body = { ...req.body, id: req.params.id };
      if (!body.communityId) body.communityId = getTargetCommunityId(req.user);
      const { valid, errors } = validateParticipant(body);
      if (!valid) return res.status(400).json({ error: 'Invalid data', details: errors });

      // Ensure stats block and per-game profiles exist
      if (!body.stats) {
        body.stats = { tournamentsPlayed: 0, wins: 0, matchWins: 0, matchLosses: 0 };
      }
      body.games = resolveGames(null, body);

      if (Array.isArray(body.gameIds) && body.gameIds.length > 0) {
        setParticipantGameList(body, body.gameIds, body.primaryGameId, body.gameMainCharacters || {});
      } else if (body.gameId) {
        setParticipantPrimaryGame(body, body.gameId, body.mainCharacterId);
      }

      body.createdAt = body.createdAt ?? new Date().toISOString();
      body.updatedAt = new Date().toISOString();

      await participants.upsert(body);
      return res.status(201).json(body);
    }

    // UPDATE: merge editable fields only
    const { name, alias, avatarUrl, stats, gameId, mainCharacterId, gameIds, primaryGameId, gameMainCharacters } = req.body;

    // Check for duplicate name if name is changing
    if (name && name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const all = await participants.getAll();
      const duplicate = all.find(
        (p) => p.id !== req.params.id && p.name.toLowerCase() === name.trim().toLowerCase()
      );
      if (duplicate) {
        return res.status(409).json({ error: 'A participant with that name already exists' });
      }
    }

    const updated = migrateParticipantGames({ ...existing });
    if (name !== undefined) updated.name = name.trim();
    if (alias !== undefined) updated.alias = alias.trim();
    if (avatarUrl !== undefined) updated.avatarUrl = avatarUrl;
    if (stats !== undefined) updated.stats = stats;
    updated.communityId = getTargetCommunityId(req.user, req.body.communityId);
    updated.updatedAt = new Date().toISOString();

    // Update game list and primary game (with per-game main characters)
    if (Array.isArray(gameIds)) {
      setParticipantGameList(updated, gameIds, primaryGameId, gameMainCharacters || {});
    } else if (gameId !== undefined) {
      setParticipantPrimaryGame(updated, gameId, mainCharacterId !== undefined ? mainCharacterId : updated.mainCharacterId);
    } else if (mainCharacterId !== undefined && updated.gameId) {
      setParticipantGameMain(updated, updated.gameId, mainCharacterId);
    }

    // Merge any incoming game profiles (preserving server ELO) only if no explicit game list was sent
    if (!Array.isArray(gameIds)) {
      updated.games = mergeGameProfiles(updated.games, req.body.games || {});
    }

    const { valid, errors } = validateParticipant(updated);
    if (!valid) return res.status(400).json({ error: 'Invalid data', details: errors });

    await participants.upsert(updated);
    res.json(updated);
  } catch (err) {
    console.error('[Participants] PUT /:id error:', err);
    res.status(500).json({ error: 'Failed to update participant' });
  }
});

// DELETE /api/participants/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });
    if (!isInUserScope(req.user, p.communityId)) {
      return res.status(403).json({ error: 'Participant is not in your community scope' });
    }
    const deleted = await participants.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Participant not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Participants] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete participant' });
  }
});

// POST /api/participants/:id/stats — merge-update stats after a tournament
router.post('/:id/stats', async (req, res) => {
  try {
    const existing = await participants.findById(req.params.id);
    // If participant doesn't exist in JSON yet (was only in localStorage), skip silently
    if (!existing) return res.json({ ok: true, skipped: true });

    const { tournamentsPlayed = 0, wins = 0, matchWins = 0, matchLosses = 0 } = req.body;

    const updated = {
      ...existing,
      stats: {
        tournamentsPlayed: (existing.stats?.tournamentsPlayed ?? 0) + tournamentsPlayed,
        wins: (existing.stats?.wins ?? 0) + wins,
        matchWins: (existing.stats?.matchWins ?? 0) + matchWins,
        matchLosses: (existing.stats?.matchLosses ?? 0) + matchLosses,
      },
      updatedAt: new Date().toISOString(),
    };

    await participants.upsert(updated);
    res.json(updated);
  } catch (err) {
    console.error('[Participants] POST /:id/stats error:', err);
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

// GET /api/participants/:id/tournaments — only tournaments this participant joined
router.get('/:id/tournaments', async (req, res) => {
  try {
    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });
    const ids = new Set(p.tournamentIds ?? []);
    const all = await tournaments.getAll();
    const joined = all.filter((t) => ids.has(t.id));
    res.json(joined);
  } catch (err) {
    console.error('[Participants] GET /:id/tournaments error:', err);
    res.status(500).json({ error: 'Failed to read participant tournaments' });
  }
});

// GET /api/participants/:id/league-stats — league results and match record
router.get('/:id/league-stats', async (req, res) => {
  try {
    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });

    const allLeagues = await leagues.getAll();
    const allLeagueMatches = await leagueMatches.getAll();
    const myLeagueIds = new Set();

    const results = [];

    for (const league of allLeagues) {
      if (!league.participantIds?.includes(req.params.id)) continue;
      myLeagueIds.add(league.id);

      const leagueMatchList = allLeagueMatches.filter((m) => m.leagueId === league.id);
      const myMatches = leagueMatchList.filter(
        (m) => m.participant1Id === req.params.id || m.participant2Id === req.params.id
      );

      let wins = 0;
      let losses = 0;
      let noShows = 0;
      let eloChange = 0;

      for (const m of myMatches) {
        if (m.status !== 'completed' && m.status !== 'no_show') continue;

        if (m.status === 'no_show') {
          if (m.noShowParticipantId === req.params.id) {
            losses++;
            noShows++;
            eloChange += (m.participant1Id === req.params.id ? m.participant1EloChange : m.participant2EloChange) ?? 0;
          } else {
            wins++;
          }
        } else {
          if (m.winnerId === req.params.id) {
            wins++;
          } else {
            losses++;
          }
          eloChange += (m.participant1Id === req.params.id ? m.participant1EloChange : m.participant2EloChange) ?? 0;
        }
      }

      // Rank by current ELO within the league (recompute simple standings)
      const standings = [];
      for (const pid of league.participantIds) {
        const playerMatches = leagueMatchList.filter(
          (m) => (m.participant1Id === pid || m.participant2Id === pid) &&
                 (m.status === 'completed' || m.status === 'no_show')
        );
        let playerEloChange = 0;
        for (const m of playerMatches) {
          playerEloChange += (m.participant1Id === pid ? m.participant1EloChange : m.participant2EloChange) ?? 0;
        }
        const otherP = migrateParticipantGames(await participants.findById(pid));
        const baseElo = getEffectiveElo(otherP, league.gameId) ?? 1500;
        standings.push({ participantId: pid, currentElo: baseElo + playerEloChange });
      }
      standings.sort((a, b) => b.currentElo - a.currentElo);
      const rank = standings.findIndex((s) => s.participantId === req.params.id) + 1;

      results.push({
        leagueId: league.id,
        leagueName: league.name,
        status: league.status,
        rank,
        matchesPlayed: wins + losses,
        wins,
        losses,
        noShows,
        eloChange,
        gamesPerMatch: league.gamesPerMatch,
        date: league.updatedAt,
      });
    }

    // Only show results for completed leagues in the profile
    const completedResults = results.filter((r) => r.status === 'completed');

    const totalLeagueMatches = completedResults.reduce((sum, r) => sum + r.matchesPlayed, 0);
    const totalLeagueWins = completedResults.reduce((sum, r) => sum + r.wins, 0);
    const totalLeagueLosses = completedResults.reduce((sum, r) => sum + r.losses, 0);
    const leagueWinRate = totalLeagueMatches > 0
      ? Math.round((totalLeagueWins / totalLeagueMatches) * 100)
      : 0;

    res.json({
      leagues: completedResults,
      totalMatches: totalLeagueMatches,
      totalWins: totalLeagueWins,
      totalLosses: totalLeagueLosses,
      winRate: leagueWinRate,
    });
  } catch (err) {
    console.error('[Participants] GET /:id/league-stats error:', err);
    res.status(500).json({ error: 'Failed to read league stats' });
  }
});

export default router;
