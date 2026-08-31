/**
 * Notification Service
 *
 * Open system: createNotification(recipientId, type, title, message, data?)
 * Any event in the server can call this to push a notification to a participant.
 *
 * Notification types:
 *   duel_challenge       — someone challenged you to a duel
 *   duel_expiring        — your accepted duel expires in 3 days
 *   league_week_start    — your league week started, here are your matches
 *   league_match_expiring — a league match expires in 3 days
 *   matchmaking          — (reserved for future matchmaking system)
 */

import { notifications } from '../db/collections.js';

/**
 * Create a notification for a participant.
 * @param {string} recipientId   - GlobalParticipant ID
 * @param {string} type          - Notification type
 * @param {string} title         - Short title
 * @param {string} message       - Full message body
 * @param {Object} [data]        - Extra context (duelId, leagueId, matchId, etc.)
 * @returns {Promise<Object>}
 */
export async function createNotification(recipientId, type, title, message, data = null) {
  const notification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    recipientId,
    type,
    title,
    message,
    read: false,
    createdAt: new Date().toISOString(),
    data,
  };

  await notifications.upsert(notification);
  return notification;
}

/**
 * Get all notifications for a recipient, sorted newest first.
 * @param {string} recipientId
 * @returns {Promise<Object[]>}
 */
export async function getNotificationsForRecipient(recipientId) {
  const all = await notifications.getAll();
  return all
    .filter(n => n.recipientId === recipientId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Mark a notification as read.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function markNotificationRead(id) {
  const notif = await notifications.findById(id);
  if (!notif) return null;
  notif.read = true;
  notif.readAt = new Date().toISOString();
  await notifications.upsert(notif);
  return notif;
}

/**
 * Mark all notifications as read for a recipient.
 * @param {string} recipientId
 * @returns {Promise<number>} count of marked notifications
 */
export async function markAllRead(recipientId) {
  const all = await notifications.getAll();
  const unread = all.filter(n => n.recipientId === recipientId && !n.read);
  for (const notif of unread) {
    notif.read = true;
    notif.readAt = new Date().toISOString();
    await notifications.upsert(notif);
  }
  return unread.length;
}

/**
 * Delete a notification.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteNotification(id) {
  return await notifications.remove(id);
}

/**
 * Check accepted duels expiring in 3 days and create notifications.
 * Called by the server cron.
 * @param {import('../db/collections.js').Collection} duels
 * @param {import('../db/collections.js').Collection} duelSettings
 */
export async function notifyExpiringDuels(duels, duelSettings) {
  const allSettings = await duelSettings.getAll();
  const settings = allSettings.find(s => s.id === 'default') || { challengeExpirationDays: 7 };
  const all = await duels.getAll();
  const now = new Date();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  for (const duel of all) {
    if (duel.status !== 'accepted' || !duel.acceptedAt) continue;

    const acceptedExpiresAt = new Date(duel.acceptedAt);
    acceptedExpiresAt.setDate(acceptedExpiresAt.getDate() + settings.challengeExpirationDays);
    const msRemaining = acceptedExpiresAt - now;

    // Between 3 days and 2.5 days remaining → send warning once
    if (msRemaining > 0 && msRemaining <= threeDaysMs && msRemaining > threeDaysMs - 12 * 60 * 60 * 1000) {
      const alreadyNotified = (await getNotificationsForRecipient(duel.challengerId))
        .some(n => n.type === 'duel_expiring' && n.data?.duelId === duel.id);

      if (!alreadyNotified) {
        await createNotification(
          duel.challengerId,
          'duel_expiring',
          'Duel expiring soon',
          `Your duel is expiring in less than 3 days. Make sure to record and confirm the match results.`,
          { duelId: duel.id, expiresAt: acceptedExpiresAt.toISOString() }
        );
        await createNotification(
          duel.challengedId,
          'duel_expiring',
          'Duel expiring soon',
          `A duel against you is expiring in less than 3 days. Make sure to record and confirm the match results.`,
          { duelId: duel.id, expiresAt: acceptedExpiresAt.toISOString() }
        );
      }
    }
  }
}

/**
 * Check league matches expiring in 3 days and create notifications.
 * @param {import('../db/collections.js').Collection} leagueMatches
 */
export async function notifyExpiringLeagueMatches(leagueMatches) {
  const all = await leagueMatches.getAll();
  const now = new Date();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  for (const match of all) {
    if (match.completed || !match.deadline) continue;

    const deadline = new Date(match.deadline);
    const msRemaining = deadline - now;

    if (msRemaining > 0 && msRemaining <= threeDaysMs && msRemaining > threeDaysMs - 12 * 60 * 60 * 1000) {
      const alreadyNotifiedP1 = (await getNotificationsForRecipient(match.player1Id))
        .some(n => n.type === 'league_match_expiring' && n.data?.matchId === match.id);

      if (!alreadyNotifiedP1) {
        await createNotification(
          match.player1Id,
          'league_match_expiring',
          'League match deadline approaching',
          `Your league match is due in less than 3 days. Make sure to play and confirm the result.`,
          { matchId: match.id, leagueId: match.leagueId, deadline: match.deadline }
        );
        await createNotification(
          match.player2Id,
          'league_match_expiring',
          'League match deadline approaching',
          `Your league match is due in less than 3 days. Make sure to play and confirm the result.`,
          { matchId: match.id, leagueId: match.leagueId, deadline: match.deadline }
        );
      }
    }
  }
}
