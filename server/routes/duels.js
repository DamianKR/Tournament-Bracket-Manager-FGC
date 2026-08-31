/**
 * Duels routes
 *
 * GET    /api/duels              — list all challenges
 * GET    /api/duels/active       — list active challenges (pending/accepted)
 * GET    /api/duels/:id          — get one challenge
 * POST   /api/duels              — create new challenge
 * PUT    /api/duels/:id/accept   — accept challenge
 * PUT    /api/duels/:id/decline  — decline challenge
 * PUT    /api/duels/:id/complete — complete challenge (link to match)
 * PUT    /api/duels/:id/expire   — mark challenge as expired
 * DELETE /api/duels/:id          — delete challenge
 *
 * GET    /api/duels/settings     — get duel settings
 * PUT    /api/duels/settings     — update duel settings
 */

import { Router } from 'express';
import { duels, duelSettings, participants } from '../db/collections.js';
import { duelChallengeShape, validateDuelChallenge, duelSettingsShape } from '../models/duel.js';
import { requireAuth, requireAdmin } from '../utils/jwtMiddleware.js';
import { expireDuel, expireAllOldDuels } from '../services/duelExpiration.js';
import { createNotification } from '../services/notificationService.js';

const router = Router();

// Max evidence (base64) size: 6MB string, which is roughly 4.5MB decoded image
const MAX_EVIDENCE_SIZE_BYTES = 6 * 1024 * 1024;

// ── Settings ──────────────────────────────────────────────────────────────

// GET /api/duels/settings
router.get('/settings', async (_req, res) => {
  try {
    const all = await duelSettings.getAll();
    const settings = all.find(s => s.id === 'default') || duelSettingsShape();
    res.json(settings);
  } catch (err) {
    console.error('[Duels] GET /settings error:', err);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

// PUT /api/duels/settings
router.put('/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const updated = { id: 'default', ...req.body };
    await duelSettings.upsert(updated);
    res.json(updated);
  } catch (err) {
    console.error('[Duels] PUT /settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ── Challenges ────────────────────────────────────────────────────────────

// GET /api/duels
router.get('/', async (_req, res) => {
  try {
    const data = await duels.getAll();
    res.json(data);
  } catch (err) {
    console.error('[Duels] GET / error:', err);
    res.status(500).json({ error: 'Failed to read challenges' });
  }
});

// GET /api/duels/active
router.get('/active', async (_req, res) => {
  try {
    const all = await duels.getAll();
    const active = all.filter(d => d.status === 'pending' || d.status === 'accepted');
    res.json(active);
  } catch (err) {
    console.error('[Duels] GET /active error:', err);
    res.status(500).json({ error: 'Failed to read active challenges' });
  }
});

// GET /api/duels/:id
router.get('/:id', async (req, res) => {
  try {
    const challenge = await duels.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    res.json(challenge);
  } catch (err) {
    console.error('[Duels] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to read challenge' });
  }
});

// POST /api/duels
router.post('/', requireAuth, async (req, res) => {
  try {
    const { id, challengerId, challengedId, expiresAt, type = 'normal' } = req.body;
    
    if (!id || !challengerId || !challengedId || !expiresAt) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (type !== 'normal' && type !== 'mandatory') {
      return res.status(400).json({ error: 'Invalid duel type' });
    }

    // Non-admin users can only challenge as themselves
    if (req.user.role !== 'admin' && req.user.participantId !== challengerId) {
      return res.status(403).json({ error: 'You can only create challenges as yourself' });
    }

    // Manual expiration trigger (also used by server cron)
    // Validate mandatory duel limits
    if (type === 'mandatory') {
      const all = await duels.getAll();
      const settings = await duelSettings.getAll();
      const config = settings.find(s => s.id === 'default') || duelSettingsShape();

      if (config.mandatoryDuelsEnabled === false) {
        return res.status(400).json({ error: 'Mandatory duels are currently disabled' });
      }
      const now = new Date();
      
      // Calculate weekly reset
      const weeklyResetDay = config.weeklyResetDay ?? 1; // Monday
      const weeklyResetHour = config.weeklyResetHour ?? 0;
      const weeklyResetMinute = config.weeklyResetMinute ?? 0;
      
      const lastReset = new Date(now);
      lastReset.setHours(weeklyResetHour, weeklyResetMinute, 0, 0);
      const daysSinceReset = (now.getDay() - weeklyResetDay + 7) % 7;
      lastReset.setDate(lastReset.getDate() - daysSinceReset);
      if (now < lastReset) {
        lastReset.setDate(lastReset.getDate() - 7);
      }

      // Check weekly mandatory limit
      const mandatoryPerWeek = typeof config.mandatoryDuelsPerWeek === 'number'
        ? Math.max(0, Math.floor(config.mandatoryDuelsPerWeek))
        : 1;
      const mandatoryThisWeek = all.filter(
        c =>
          c.type === 'mandatory' &&
          c.challengerId === challengerId &&
          new Date(c.createdAt) >= lastReset
      );

      if (mandatoryThisWeek.length >= mandatoryPerWeek) {
        return res.status(400).json({
          error: `You can only send ${mandatoryPerWeek} mandatory challenge${mandatoryPerWeek !== 1 ? 's' : ''} per week`
        });
      }

      // Check monthly limit per opponent
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const mandatoryToSameOpponentThisMonth = all.filter(
        c =>
          c.type === 'mandatory' &&
          c.challengerId === challengerId &&
          c.challengedId === challengedId &&
          new Date(c.createdAt) >= monthStart
      );

      if (mandatoryToSameOpponentThisMonth.length > 0) {
        return res.status(400).json({ error: 'You cannot challenge the same opponent with a mandatory duel twice in the same month' });
      }
    }

    const challenge = duelChallengeShape(id, challengerId, challengedId, expiresAt, type);
    const validation = validateDuelChallenge(challenge);
    
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid challenge', details: validation.errors });
    }

    await duels.upsert(challenge);

    // Notify the challenged player
    const challengerParticipant = await participants.findById(challengerId);
    const challengerName = challengerParticipant?.alias || challengerParticipant?.name || 'Someone';
    const notifMsg = type === 'mandatory'
      ? `${challengerName} has sent you a MANDATORY duel challenge. You cannot decline it — it goes straight to Record Match.`
      : `${challengerName} has challenged you to a duel. Accept or decline in the Events section.`;

    createNotification(
      challengedId,
      'duel_challenge',
      type === 'mandatory' ? 'Mandatory Duel Challenge!' : 'New Duel Challenge!',
      notifMsg,
      { duelId: challenge.id, challengerId, type }
    ).catch(err => console.warn('[Duels] Failed to create challenge notification:', err));

    res.status(201).json(challenge);
  } catch (err) {
    console.error('[Duels] POST / error:', err);
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

// PUT /api/duels/:id/accept
router.put('/:id/accept', requireAuth, async (req, res) => {
  try {
    const challenge = await duels.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    if (challenge.status !== 'pending') {
      return res.status(400).json({ error: 'Challenge is not pending' });
    }
    if (req.user.role !== 'admin' && req.user.participantId !== challenge.challengedId) {
      return res.status(403).json({ error: 'Only the challenged player or admin can accept' });
    }

    challenge.status = 'accepted';
    challenge.acceptedAt = new Date().toISOString();
    await duels.upsert(challenge);
    res.json(challenge);
  } catch (err) {
    console.error('[Duels] PUT /:id/accept error:', err);
    res.status(500).json({ error: 'Failed to accept challenge' });
  }
});

// PUT /api/duels/:id/decline
router.put('/:id/decline', requireAuth, async (req, res) => {
  try {
    const challenge = await duels.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    if (challenge.status !== 'pending') {
      return res.status(400).json({ error: 'Challenge is not pending' });
    }
    if (req.user.role !== 'admin' && req.user.participantId !== challenge.challengedId) {
      return res.status(403).json({ error: 'Only the challenged player or admin can decline' });
    }

    challenge.status = 'declined';
    challenge.declinedAt = new Date().toISOString();
    await duels.upsert(challenge);
    res.json(challenge);
  } catch (err) {
    console.error('[Duels] PUT /:id/decline error:', err);
    res.status(500).json({ error: 'Failed to decline challenge' });
  }
});

// PUT /api/duels/:id/complete
// Allows admin or either participant to link a match to the challenge
router.put('/:id/complete', requireAuth, async (req, res) => {
  try {
    const challenge = await duels.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const { matchId } = req.body;
    if (!matchId) return res.status(400).json({ error: 'Missing matchId' });

    // Authorize: admin or either participant
    const isAdmin = req.user.role === 'admin';
    const isParticipant = req.user.participantId === challenge.challengerId ||
                          req.user.participantId === challenge.challengedId;
    if (!isAdmin && !isParticipant) {
      return res.status(403).json({ error: 'Only the duel participants or admin can complete' });
    }

    challenge.status = 'completed';
    challenge.matchId = matchId;
    challenge.completedAt = new Date().toISOString();
    await duels.upsert(challenge);
    res.json(challenge);
  } catch (err) {
    console.error('[Duels] PUT /:id/complete error:', err);
    res.status(500).json({ error: 'Failed to complete challenge' });
  }
});

// PUT /api/duels/:id/expire
// Marks a challenge as expired (pending or accepted)
// Applies ELO penalties if the challenge was accepted and someone didn't confirm
router.put('/:id/expire', requireAuth, async (req, res) => {
  try {
    const challenge = await expireDuel(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    res.json(challenge);
  } catch (err) {
    console.error('[Duels] PUT /:id/expire error:', err);
    res.status(500).json({ error: 'Failed to expire challenge' });
  }
});

// DELETE /api/duels/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await duels.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Challenge not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Duels] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete challenge' });
  }
});

// PUT /api/duels/:id/report-result
// Allows a participant to report their version of the match result
router.put('/:id/report-result', requireAuth, async (req, res) => {
  try {
    const challenge = await duels.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    
    if (challenge.status !== 'accepted') {
      return res.status(400).json({ error: 'Challenge must be accepted before reporting results' });
    }

    // Check if user is one of the participants
    const isChallenger = req.user.participantId === challenge.challengerId;
    const isChallenged = req.user.participantId === challenge.challengedId;
    
    if (!isChallenger && !isChallenged && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only participants can report results' });
    }

    const { winnerId, evidence } = req.body;
    if (!winnerId) return res.status(400).json({ error: 'Missing winnerId' });

    // Validate winnerId is one of the participants
    if (winnerId !== challenge.challengerId && winnerId !== challenge.challengedId) {
      return res.status(400).json({ error: 'Winner must be one of the participants' });
    }

    // Validate evidence size if provided
    if (evidence && typeof evidence === 'string' && evidence.length > MAX_EVIDENCE_SIZE_BYTES) {
      return res.status(413).json({ error: `Evidence image too large. Maximum is ${MAX_EVIDENCE_SIZE_BYTES / 1024 / 1024}MB after encoding.` });
    }

    const result = {
      winnerId,
      reportedAt: new Date().toISOString(),
      evidence: evidence || null,
    };

    // Admin can confirm directly without consensus
    if (req.user.role === 'admin') {
      challenge.challengerResult = { ...result, evidence: null };
      challenge.challengedResult = { ...result, evidence: null };
      challenge.status = 'completed';
      challenge.completedAt = new Date().toISOString();
    } else {
      // Store result based on who is reporting
      if (isChallenger) {
        challenge.challengerResult = result;
      } else if (isChallenged) {
        challenge.challengedResult = result;
      }

      // Check if both participants have reported
      if (challenge.challengerResult && challenge.challengedResult) {
        if (challenge.challengerResult.winnerId === challenge.challengedResult.winnerId) {
          // Results match - auto-confirm (will be handled by frontend to create match)
          challenge.status = 'completed';
          challenge.completedAt = new Date().toISOString();
          // Clear evidence since results match
          if (challenge.challengerResult.evidence) challenge.challengerResult.evidence = null;
          if (challenge.challengedResult.evidence) challenge.challengedResult.evidence = null;
        } else {
          // Results don't match - needs admin review
          challenge.status = 'pending_review';
        }
      }
    }

    await duels.upsert(challenge);
    res.json(challenge);
  } catch (err) {
    console.error('[Duels] PUT /:id/report-result error:', err);
    res.status(500).json({ error: 'Failed to report result' });
  }
});

// PUT /api/duels/:id/resolve-conflict
// Admin-only endpoint to resolve conflicting results
router.put('/:id/resolve-conflict', requireAuth, requireAdmin, async (req, res) => {
  try {
    const challenge = await duels.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    
    if (challenge.status !== 'pending_review') {
      return res.status(400).json({ error: 'Challenge is not pending review' });
    }

    const { winnerId } = req.body;
    if (!winnerId) return res.status(400).json({ error: 'Missing winnerId' });

    // Validate winnerId is one of the participants
    if (winnerId !== challenge.challengerId && winnerId !== challenge.challengedId) {
      return res.status(400).json({ error: 'Winner must be one of the participants' });
    }

    // Admin has resolved - update both results to match admin decision
    const resolvedResult = {
      winnerId,
      reportedAt: new Date().toISOString(),
      evidence: null,
    };

    challenge.challengerResult = resolvedResult;
    challenge.challengedResult = resolvedResult;
    challenge.status = 'completed';
    challenge.completedAt = new Date().toISOString();

    await duels.upsert(challenge);
    res.json(challenge);
  } catch (err) {
    console.error('[Duels] PUT /:id/resolve-conflict error:', err);
    res.status(500).json({ error: 'Failed to resolve conflict' });
  }
});

export default router;
