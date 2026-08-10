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
import { participants } from '../db/collections.js';
import { participantShape, validateParticipant } from '../models/participant.js';

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────

function generateId() {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

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

// POST /api/participants — create
router.post('/', async (req, res) => {
  try {
    const { name, alias } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    // Check for duplicate name (case-insensitive)
    const all = await participants.getAll();
    const duplicate = all.find(
      (p) => p.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (duplicate) {
      return res.status(409).json({ error: 'A participant with that name already exists', existing: duplicate });
    }

    const newParticipant = participantShape(generateId(), name.trim(), alias?.trim() ?? '');
    await participants.upsert(newParticipant);
    res.status(201).json(newParticipant);
  } catch (err) {
    console.error('[Participants] POST / error:', err);
    res.status(500).json({ error: 'Failed to create participant' });
  }
});

// PUT /api/participants/:id — update editable fields
router.put('/:id', async (req, res) => {
  try {
    const existing = await participants.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Participant not found' });

    const { name, alias, avatarUrl } = req.body;

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
    if (!existing) return res.status(404).json({ error: 'Participant not found' });

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

export default router;
