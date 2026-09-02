/**
 * Notification Scheduler
 *
 * Schedules future notifications using setTimeout.
 * When a league week starts, notifications are created at that moment.
 *
 * Why not cron?
 *   - We don't want constant server load checking nothing.
 *   - Events (league week start, match deadline, duel expiry) are known at creation time.
 *   - We compute the exact date and schedule a one-shot timeout.
 *
 * Strategy:
 *   - At any time, only the next unnotified week of each league is scheduled.
 *   - When that week fires, the scheduler chains to the following week.
 *   - On server restart, reschedulableLeagueNotifications() re-queues the next
 *     unnotified week per league (and fires any weeks that already started).
 */

import { createNotification } from './notificationService.js';
import { leagues, leagueMatches, participants } from '../db/collections.js';

const activeTimeouts = new Map();

const MINUTE_MS = 60 * 1000;
const MAX_TIMEOUT_MS = 2147483647; // setTimeout max (~24.8 days)

/**
 * Calculate when a notification should fire (with a small lead time).
 * By default fire 1 minute before the actual start so the user gets it exactly at the hour.
 */
function notificationTimeFor(date) {
  return new Date(date.getTime() - MINUTE_MS);
}

function msUntil(date) {
  const now = new Date();
  const d = new Date(date);
  return d - now;
}

/**
 * Create notifications for all participants of a league week.
 */
async function fireLeagueWeekNotifications(league, week) {
  try {
    const reloaded = await leagues.findById(league.id);
    if (!reloaded || reloaded.status !== 'active') return;
    if (reloaded.notifiedWeeks?.includes(week)) return; // already fired

    const allParticipants = await participants.getAll();
    const participantMap = new Map(allParticipants.map(p => [p.id, p]));
    const allMatches = await leagueMatches.getAll();
    const weekMatches = allMatches.filter(m => m.leagueId === league.id && m.week === week);

    const opponents = {};
    for (const match of weekMatches) {
      if (!opponents[match.participant1Id]) opponents[match.participant1Id] = new Set();
      if (!opponents[match.participant2Id]) opponents[match.participant2Id] = new Set();
      opponents[match.participant1Id].add(match.participant2Id);
      opponents[match.participant2Id].add(match.participant1Id);
    }

    for (const participantId of reloaded.participantIds) {
      const opponentIds = [...(opponents[participantId] || [])];
      const opponentNames = opponentIds.map(id => {
        const p = participantMap.get(id);
        return p ? (p.alias?.trim() || p.name) : 'Unknown';
      });

      if (opponentIds.length > 0) {
        await createNotification(
          participantId,
          'league_week_start',
          `League Week ${week} started`,
          `Week ${week} of ${reloaded.name} has started. Your opponent${opponentNames.length !== 1 ? 's' : ''} this week: ${opponentNames.join(', ')}.`,
          { leagueId: reloaded.id, week, opponentIds }
        );
      }
    }

    // Mark week as notified
    if (!reloaded.notifiedWeeks) reloaded.notifiedWeeks = [];
    if (!reloaded.notifiedWeeks.includes(week)) {
      reloaded.notifiedWeeks.push(week);
      reloaded.notifiedWeeks = [...new Set(reloaded.notifiedWeeks)].sort((a, b) => a - b);
      reloaded.updatedAt = new Date().toISOString();
      await leagues.upsert(reloaded);
    }

    console.log(`[notificationScheduler] Created week ${week} notifications for league "${reloaded.name}"`);

    // Chain to the next unnotified week
    await scheduleLeagueNotifications(reloaded).catch(err =>
      console.error(`[notificationScheduler] Failed to schedule next week for league ${reloaded.id}:`, err)
    );
  } catch (err) {
    console.error(`[notificationScheduler] Failed to create week ${week} notifications for league ${league.id}:`, err);
  }
}

/**
 * Schedule a single league week notification.
 */
export function scheduleLeagueWeekNotification(league, week, weekStartDate) {
  const key = `${league.id}:${week}`;
  if (activeTimeouts.has(key)) return;

  const fireAt = notificationTimeFor(new Date(weekStartDate));
  let delay = msUntil(fireAt);

  if (delay <= 0) {
    // Already started, fire immediately
    fireLeagueWeekNotifications(league, week);
    return;
  }

  if (delay > MAX_TIMEOUT_MS) {
    // setTimeout cannot handle delays > ~24.8 days.
    // Schedule a wake-up at the max delay and re-check then.
    const timeout = setTimeout(() => {
      activeTimeouts.delete(key);
      scheduleLeagueWeekNotification(league, week, weekStartDate);
    }, MAX_TIMEOUT_MS);

    activeTimeouts.set(key, timeout);
    console.log(`[notificationScheduler] Scheduled week ${week} notification for league "${league.name}" (long delay, re-check at ${new Date(Date.now() + MAX_TIMEOUT_MS).toISOString()})`);
    return;
  }

  const timeout = setTimeout(() => {
    activeTimeouts.delete(key);
    fireLeagueWeekNotifications(league, week);
  }, delay);

  activeTimeouts.set(key, timeout);
  console.log(`[notificationScheduler] Scheduled week ${week} notification for league "${league.name}" at ${fireAt.toISOString()}`);
}

/**
 * Schedule the next pending week notification for a league.
 * Call this when a league is created or regenerated.
 */
export async function scheduleLeagueNotifications(league) {
  if (league.status !== 'active') return;

  const weeks = Object.keys(league.weekStartDates || {}).map(Number).sort((a, b) => a - b);
  const now = new Date();

  for (const week of weeks) {
    if (league.notifiedWeeks?.includes(week)) continue;

    const weekStart = new Date(league.weekStartDates[week]);
    const fireAt = notificationTimeFor(weekStart);

    if (fireAt <= now) {
      // Week already started (or about to). Fire and let it chain to the next.
      await fireLeagueWeekNotifications(league, week);
    } else {
      // Future week — schedule a timeout and stop; the chain will handle the rest later.
      scheduleLeagueWeekNotification(league, week, league.weekStartDates[week]);
    }
    return; // only handle the next actionable week; chain covers the rest
  }
}

/**
 * Reschedule the next pending league week notification on server startup.
 * Also fires any weeks that started while the server was asleep/off.
 */
export async function reschedulableLeagueNotifications() {
  try {
    const all = await leagues.getAll();
    const active = all.filter(l => l.status === 'active');

    for (const league of active) {
      await scheduleLeagueNotifications(league);
    }

    console.log(`[notificationScheduler] Rescheduled/caught up notifications for ${active.length} active leagues`);
  } catch (err) {
    console.error('[notificationScheduler] Failed to reschedule league notifications:', err);
  }
}

/**
 * Clear all scheduled timeouts (useful for tests or graceful shutdown).
 */
export function clearScheduledNotifications() {
  for (const timeout of activeTimeouts.values()) {
    clearTimeout(timeout);
  }
  activeTimeouts.clear();
}
