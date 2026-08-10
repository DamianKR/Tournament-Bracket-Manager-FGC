/**
 * Tournaments routes
 *
 * GET    /api/tournaments           — list all
 * GET    /api/tournaments/:id       — get one
 * POST   /api/tournaments           — replace full array (bulk sync from frontend)
 * PUT    /api/tournaments/:id       — upsert one tournament
 * DELETE /api/tournaments/:id       — delete one tournament
 * DELETE /api/tournaments           — clear all
 */

import { Router } from 'express';
import { tournaments } from '../db/collections.js';
import { validateTournament } from '../models/tournament.js';

const router = Router();

// GET /api/tournaments
router.get('/', async (_req, res) => {
  try {
    const data = await tournaments.getAll();
    res.json(data);
  } catch (err) {
    console.error('[Tournaments] GET / error:', err);
    res.status(500).json({ error: 'Failed to read tournaments' });
  }
});

// GET /api/tournaments/:id
router.get('/:id', async (req, res) => {
  try {
    const tournament = await tournaments.findById(req.params.id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    res.json(tournament);
  } catch (err) {
    console.error('[Tournaments] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to read tournament' });
  }
});

// POST /api/tournaments — replace full array (used by bulk sync)
router.post('/', async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Body must be an array of tournaments' });
    }
    await tournaments.replaceAll(req.body);
    res.json({ ok: true, count: req.body.length });
  } catch (err) {
    console.error('[Tournaments] POST / error:', err);
    res.status(500).json({ error: 'Failed to save tournaments' });
  }
});

// PUT /api/tournaments/:id — upsert one
router.put('/:id', async (req, res) => {
  try {
    const body = req.body;

    if (body.id && body.id !== req.params.id) {
      return res.status(400).json({ error: 'ID in body does not match URL' });
    }

    body.id = req.params.id;

    const { valid, errors } = validateTournament(body);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid tournament data', details: errors });
    }

    const saved = await tournaments.upsert(body);
    res.json(saved);
  } catch (err) {
    console.error('[Tournaments] PUT /:id error:', err);
    res.status(500).json({ error: 'Failed to save tournament' });
  }
});

// DELETE /api/tournaments/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await tournaments.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Tournament not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Tournaments] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete tournament' });
  }
});

// DELETE /api/tournaments — clear all
router.delete('/', async (_req, res) => {
  try {
    await tournaments.clear();
    res.json({ ok: true });
  } catch (err) {
    console.error('[Tournaments] DELETE / error:', err);
    res.status(500).json({ error: 'Failed to clear tournaments' });
  }
});

export default router;
