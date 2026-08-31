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

// GET /api/notifications
router.get('/', async (req, res) => {
  try {
    const participantId = req.user.participantId;
    if (!participantId) return res.json([]);
    const notifs = await getNotificationsForRecipient(participantId);
    res.json(notifs);
  } catch (err) {
    console.error('[Notifications] GET / error:', err);
    res.status(500).json({ error: 'Failed to read notifications' });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res) => {
  try {
    const participantId = req.user.participantId;
    if (!participantId) return res.json({ count: 0 });
    const notifs = await getNotificationsForRecipient(participantId);
    const count = notifs.filter(n => !n.read).length;
    res.json({ count });
  } catch (err) {
    console.error('[Notifications] GET /unread-count error:', err);
    res.status(500).json({ error: 'Failed to count notifications' });
  }
});

// PUT /api/notifications/read-all
router.put('/read-all', async (req, res) => {
  try {
    const participantId = req.user.participantId;
    if (!participantId) return res.json({ marked: 0 });
    const count = await markAllRead(participantId);
    res.json({ marked: count });
  } catch (err) {
    console.error('[Notifications] PUT /read-all error:', err);
    res.status(500).json({ error: 'Failed to mark all read' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res) => {
  try {
    const notif = await markNotificationRead(req.params.id);
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    if (notif.recipientId !== req.user.participantId && req.user.role !== 'admin') {
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
