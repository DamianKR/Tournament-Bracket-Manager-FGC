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

const router = Router();

// ── Routes ────────────────────────────────────────────────────────────────

// GET /api/participants
router.get('/', async (_req, res) => {
  try {
    const data = await participants.getAll();
    res.json(data);
  } catch (err) {
    console.error('[Participants] GET / error:', err);
    res.status(500).json({ error: 'Failed to read participants' });
  }
});

// GET /api/participants/:id
router.get('/:id', async (req, res) => {
  try {
    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });
    res.json(p);
  } catch (err) {
    console.error('[Participants] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to read participant' });
  }
});

// POST /api/participants
// - Array body  → merge sync (preserves ELO fields from JSON if incoming record lacks them)
// - Object body → upsert single participant
router.post('/', async (req, res) => {
  try {
    if (Array.isArray(req.body)) {
      // Load existing records so we can preserve ELO data that the frontend
      // doesn't know about (e.g. updated by the ranking engine after a match).
      const existing = await participants.getAll();
      const existingMap = new Map(existing.map((p) => [p.id, p]));

      const merged = req.body.map((incoming) => {
        const current = existingMap.get(incoming.id);
        if (!current) return incoming; // new record — nothing to preserve

        // ELO fields are only written by the ranking engine (server-side).
        // If the server already has eloPoints, always keep the server value —
        // the frontend bulk-sync never has fresher ELO data because ranking
        // writes bypass localStorage and go straight to the JSON via upsert.
        if (current.eloPoints !== undefined) {
          return {
            ...incoming,
            eloPoints: current.eloPoints,
            eloRank:   current.eloRank,
          };
        }

        // Server has no ELO yet (old record) — take whatever incoming has, or default.
        return {
          ...incoming,
          eloPoints: incoming.eloPoints ?? 1500,
          eloRank:   incoming.eloRank   ?? 'Diamante',
        };
      });

      await participants.replaceAll(merged);
      return res.json({ ok: true, count: merged.length });
    }

    // Single object upsert
    const body = req.body;
    const { valid, errors } = validateParticipant(body);
    if (!valid) return res.status(400).json({ error: 'Invalid participant data', details: errors });

    if (!body.stats) {
      body.stats = { tournamentsPlayed: 0, wins: 0, matchWins: 0, matchLosses: 0 };
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
router.put('/:id', async (req, res) => {
  try {
    const existing = await participants.findById(req.params.id);

    if (!existing) {
      // CREATE: body must contain the full participant object from the frontend
      const body = { ...req.body, id: req.params.id };
      const { valid, errors } = validateParticipant(body);
      if (!valid) return res.status(400).json({ error: 'Invalid data', details: errors });

      // Ensure stats block exists
      if (!body.stats) {
        body.stats = { tournamentsPlayed: 0, wins: 0, matchWins: 0, matchLosses: 0 };
      }
      body.createdAt = body.createdAt ?? new Date().toISOString();
      body.updatedAt = new Date().toISOString();

      await participants.upsert(body);
      return res.status(201).json(body);
    }

    // UPDATE: merge editable fields only
    const { name, alias, avatarUrl, stats } = req.body;

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

    const updated = {
      ...existing,
      name: name?.trim() ?? existing.name,
      alias: alias !== undefined ? alias.trim() : existing.alias,
      avatarUrl: avatarUrl !== undefined ? avatarUrl : existing.avatarUrl,
      // Allow stats to be overwritten if sent (for full sync)
      stats: stats ?? existing.stats,
      updatedAt: new Date().toISOString(),
    };

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
router.delete('/:id', async (req, res) => {
  try {
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
        const baseElo = (await participants.findById(pid))?.eloPoints ?? 1500;
        standings.push({ participantId: pid, currentElo: baseElo + playerEloChange });
      }
      standings.sort((a, b) => b.currentElo - a.currentElo);
      const rank = standings.findIndex((s) => s.participantId === req.params.id) + 1;

      results.push({
        leagueId: league.id,
        leagueName: league.name,
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

    const totalLeagueMatches = results.reduce((sum, r) => sum + r.matchesPlayed, 0);
    const totalLeagueWins = results.reduce((sum, r) => sum + r.wins, 0);
    const totalLeagueLosses = results.reduce((sum, r) => sum + r.losses, 0);
    const leagueWinRate = totalLeagueMatches > 0
      ? Math.round((totalLeagueWins / totalLeagueMatches) * 100)
      : 0;

    res.json({
      leagues: results,
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
