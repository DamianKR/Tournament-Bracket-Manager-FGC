/**
 * Ranked Matches routes
 *
 * GET    /api/ranked-matches           — list all ranked matches
 * GET    /api/ranked-matches/:id       — get one match
 * POST   /api/ranked-matches           — create new ranked match
 * DELETE /api/ranked-matches/:id       — delete match
 */

import { Router } from 'express';
import { rankedMatches } from '../db/collections.js';
import { rankedMatchShape, validateRankedMatch } from '../models/rankedMatch.js';
import { requireAuth, requireAdmin, optionalAuth } from '../utils/jwtMiddleware.js';
import { filterByCommunity } from '../utils/communityScope.js';

const router = Router();

// GET /api/ranked-matches?communityId=...
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { communityId } = req.query;
    const data = await rankedMatches.getAll();
    res.json(filterByCommunity(req.user, data, communityId));
  } catch (err) {
    console.error('[RankedMatches] GET / error:', err);
    res.status(500).json({ error: 'Failed to read ranked matches' });
  }
});

// GET /api/ranked-matches/:id
router.get('/:id', async (req, res) => {
  try {
    const match = await rankedMatches.findById(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json(match);
  } catch (err) {
    console.error('[RankedMatches] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to read match' });
  }
});

// POST /api/ranked-matches
router.post('/', requireAuth, async (req, res) => {
  try {
    const { id, matchType, gameId, playerAId, playerBId, winnerId, eloData, communityId } = req.body;

    if (!id || !matchType || !gameId || !playerAId || !playerBId || !winnerId || !eloData) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const match = rankedMatchShape(id, matchType, gameId, playerAId, playerBId, winnerId, eloData, communityId);
    const validation = validateRankedMatch(match);

    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid match', details: validation.errors });
    }

    await rankedMatches.upsert(match);
    res.status(201).json(match);
  } catch (err) {
    console.error('[RankedMatches] POST / error:', err);
    res.status(500).json({ error: 'Failed to create match' });
  }
});

// DELETE /api/ranked-matches/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const deleted = await rankedMatches.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Match not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[RankedMatches] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete match' });
  }
});

export default router;
