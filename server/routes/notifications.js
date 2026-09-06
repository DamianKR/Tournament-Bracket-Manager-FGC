/**
 * Notifications routes
 *
 * GET    /api/notifications              — list notifications for current user
 * GET    /api/notifications/unread-count — count of unread notifications
 * PUT    /api/notifications/:id/read     — mark one as read
 * PUT    /api/notifications/read-all     — mark all as read
 * DELETE /api/notifications/:id          — delete a notification
 */

import { Router } from 'express';
import { requireAuth } from '../utils/jwtMiddleware.js';
import {
  getNotificationsForRecipient,
  markNotificationRead,
  markAllRead,
  deleteNotification,
} from '../services/notificationService.js';

const router = Router();

// All endpoints require auth
router.use(requireAuth);

/** Todos los participantIds del user: hogar + membresías activas (multi-comunidad). */
function userParticipantIds(user) {
  const ids = new Set();
  if (user.participantId) ids.add(user.participantId);
  for (const pid of Object.values(user.participantByCommunity ?? {})) ids.add(pid);
  return [...ids];
}

// GET /api/notifications
router.get('/', async (req, res) => {
  try {
    const pids = userParticipantIds(req.user);
    if (pids.length === 0) return res.json([]);
    const lists = await Promise.all(pids.map(getNotificationsForRecipient));
    const notifs = lists.flat().sort(
      (a, b) => new Date(b.scheduledAt || b.createdAt) - new Date(a.scheduledAt || a.createdAt)
    );
    res.json(notifs);
  } catch (err) {
    console.error('[Notifications] GET / error:', err);
    res.status(500).json({ error: 'Failed to read notifications' });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res) => {
  try {
    const pids = userParticipantIds(req.user);
    if (pids.length === 0) return res.json({ count: 0 });
    const lists = await Promise.all(pids.map(getNotificationsForRecipient));
    const count = lists.flat().filter(n => !n.read).length;
    res.json({ count });
  } catch (err) {
    console.error('[Notifications] GET /unread-count error:', err);
    res.status(500).json({ error: 'Failed to count notifications' });
  }
});

// PUT /api/notifications/read-all
router.put('/read-all', async (req, res) => {
  try {
    const pids = userParticipantIds(req.user);
    if (pids.length === 0) return res.json({ marked: 0 });
    const counts = await Promise.all(pids.map(markAllRead));
    res.json({ marked: counts.reduce((a, b) => a + b, 0) });
  } catch (err) {
    console.error('[Notifications] PUT /read-all error:', err);
    res.status(500).json({ error: 'Failed to mark all read' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res) => {
  try {
    const pids = new Set(userParticipantIds(req.user));
    const notif = await markNotificationRead(req.params.id);
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    if (!pids.has(notif.recipientId) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not your notification' });
    }
    res.json(notif);
  } catch (err) {
    console.error('[Notifications] PUT /:id/read error:', err);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// DELETE /api/notifications/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteNotification(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Notification not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Notifications] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

export default router;
