/**
 * Communities routes
 *
 * GET    /api/communities      — list all (public)
 * GET    /api/communities/:id  — get one (public)
 * POST   /api/communities      — create a new community (superadmin only)
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { communities } from '../db/collections.js';
import { communityShape, validateCommunity } from '../models/community.js';
import { requireAuth, requireSuperAdmin } from '../utils/jwtMiddleware.js';

const router = Router();

// GET /api/communities
router.get('/', async (_req, res) => {
  try {
    const all = await communities.getAll();
    res.json(all);
  } catch (err) {
    console.error('[Communities] GET / error:', err);
    res.status(500).json({ error: 'Failed to read communities' });
  }
});

// GET /api/communities/:id
router.get('/:id', async (req, res) => {
  try {
    const community = await communities.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    res.json(community);
  } catch (err) {
    console.error('[Communities] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to read community' });
  }
});

// POST /api/communities — superadmin only
router.post('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id, name, shortName, description } = req.body;

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Missing name' });
    }
    if (typeof shortName !== 'string' || !shortName.trim()) {
      return res.status(400).json({ error: 'Missing shortName' });
    }

    const finalId = id || `community_${randomUUID()}`;
    const existing = await communities.findById(finalId);
    if (existing) {
      return res.status(409).json({ error: 'Community id already exists' });
    }

    // The user who creates the community becomes its owner (superadmin now; any authenticated user in the future).
    const newCommunity = communityShape(finalId, name.trim(), shortName.trim(), req.user.userId);
    newCommunity.description = typeof description === 'string' ? description.trim() : '';
    newCommunity.updatedAt = new Date().toISOString();

    const { valid, errors } = validateCommunity(newCommunity);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid community data', details: errors });
    }

    const saved = await communities.upsert(newCommunity);
    res.status(201).json(saved);
  } catch (err) {
    console.error('[Communities] POST / error:', err);
    res.status(500).json({ error: 'Failed to create community' });
  }
});

export default router;
