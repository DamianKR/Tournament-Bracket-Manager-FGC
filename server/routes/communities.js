/**
 * Communities routes
 *
 * GET    /api/communities      — list all (filtered by visibility + membership)
 * GET    /api/communities/:id  — get one (filtered by visibility + membership)
 * POST   /api/communities      — create a new community (superadmin only)
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { communities } from '../db/collections.js';
import { communityShape, validateCommunity } from '../models/community.js';
import { requireAuth, requireSuperAdmin, optionalAuth } from '../utils/jwtMiddleware.js';
import { isInUserScope } from '../utils/communityScope.js';

const router = Router();

function canViewCommunity(user, community) {
  if (community.isPublic !== false) return true;
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  return isInUserScope(user, community.id);
}

// GET /api/communities
router.get('/', optionalAuth, async (req, res) => {
  try {
    const all = await communities.getAll();
    const visible = all.filter((c) => canViewCommunity(req.user, c));
    res.json(visible);
  } catch (err) {
    console.error('[Communities] GET / error:', err);
    res.status(500).json({ error: 'Failed to read communities' });
  }
});

// GET /api/communities/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const community = await communities.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    if (!canViewCommunity(req.user, community)) {
      return res.status(404).json({ error: 'Community not found' });
    }
    res.json(community);
  } catch (err) {
    console.error('[Communities] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to read community' });
  }
});

// POST /api/communities — superadmin only
router.post('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { id, name, shortName, description, isPublic } = req.body;

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

    const isPublicValue = typeof isPublic === 'boolean' ? isPublic : true;
    const newCommunity = communityShape(finalId, name.trim(), shortName.trim(), req.user.userId, isPublicValue);
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

// PUT /api/communities/:id — superadmin o community_admin de esa comunidad
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, shortName, description, isPublic } = req.body;
    const community = await communities.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    // Superadmin puede editar cualquier comunidad; community_admin solo la suya.
    const canEdit =
      req.user.role === 'superadmin' ||
      (req.user.role === 'community_admin' && community.ownerAdminId === req.user.userId) ||
      (req.user.role === 'community_admin' && isInUserScope(req.user, community.id));

    if (!canEdit) {
      return res.status(403).json({ error: 'Only community owners or superadmin can edit this community' });
    }

    if (typeof name === 'string' && name.trim()) {
      community.name = name.trim();
    }
    if (typeof shortName === 'string' && shortName.trim()) {
      community.shortName = shortName.trim();
    }
    if (typeof description === 'string') {
      community.description = description.trim();
    }
    if (typeof isPublic === 'boolean') {
      community.isPublic = isPublic;
    }
    community.updatedAt = new Date().toISOString();

    const saved = await communities.upsert(community);
    res.json(saved);
  } catch (err) {
    console.error('[Communities] PUT /:id error:', err);
    res.status(500).json({ error: 'Failed to update community' });
  }
});

export default router;
