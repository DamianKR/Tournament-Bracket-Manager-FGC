/**
 * League Start Scheduler
 *
 * Schedules automatic league fixture generation using setTimeout with re-chain
 * for long delays (> 24.8 days), similar to notificationScheduler.js.
 *
 * - Registration closes 1 hour before startDate.
 * - 1 hour before startDate, the fixture is generated and the league becomes active.
 */

import { leagues, leagueMatches } from '../db/collections.js';
import {
  generateRoundRobinPairings,
  distributeIntoWeeks,
} from '../utils/leagueScheduler.js';
import { scheduleLeagueNotifications } from './notificationScheduler.js';

const activeTimeouts = new Map();

const HOUR_MS = 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 2147483647;

function generateId(prefix = 'league') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function msUntil(date) {
  return new Date(date) - new Date();
}

/**
 * Generate the schedule for a league, save matches, and activate it.
 * Returns the number of matches created.
 */
export async function startLeague(league) {
  const pairings = generateRoundRobinPairings(league.participantIds, league.roundsPerOpponent);
  const weekDistribution = distributeIntoWeeks(pairings, league.matchesPerPlayerPerPeriod, league.participantIds.length);

  const matchRecords = [];
  const start = new Date(league.startDate);
  const weekStartDates = {};

  for (const { week, rounds } of weekDistribution) {
    const weekStart = new Date(start.getTime() + (week - 1) * league.periodDays * 24 * 60 * 60 * 1000);
    weekStartDates[week] = weekStart.toISOString();

    for (const roundNum of rounds) {
      const roundData = pairings.find(p => p.round === roundNum);
      if (!roundData) continue;

      for (const [p1, p2] of roundData.pairings) {
        matchRecords.push({
          id: generateId('lmatch'),
          leagueId: league.id,
          gameId: league.gameId,
          round: roundNum,
          week,
          participant1Id: p1,
          participant2Id: p2,
          status: 'scheduled',
          scheduledDate: weekStart.toISOString(),
          deadline: new Date(
            weekStart.getTime() + (league.periodDays + league.gracePeriodDays) * 24 * 60 * 60 * 1000
          ).toISOString(),
        });
      }
    }
  }

  league.weekStartDates = weekStartDates;
  league.status = 'active';
  league.currentWeek = 1;
  await leagues.upsert(league);

  for (const match of matchRecords) {
    await leagueMatches.upsert(match);
  }

  await scheduleLeagueNotifications(league);
  return matchRecords.length;
}

/**
 * Schedule a draft league to generate its fixture 1 hour before startDate.
 */
export function scheduleLeagueStart(league) {
  if (league.status !== 'draft') return;

  const key = league.id;
  if (activeTimeouts.has(key)) {
    clearTimeout(activeTimeouts.get(key));
    activeTimeouts.delete(key);
  }

  const closeAt = new Date(new Date(league.startDate).getTime() - HOUR_MS);
  let delay = msUntil(closeAt);

  if (delay <= 0) {
    (async () => {
      const current = await leagues.findById(league.id);
      if (!current || current.status !== 'draft') return;
      if (current.participantIds.length < 2) return;
      await startLeague(current);
    })().catch(err =>
      console.error(`[leagueStart] Failed to immediately start league ${league.id}:`, err)
    );
    return;
  }

  if (delay > MAX_TIMEOUT_MS) {
    const timeout = setTimeout(() => {
      activeTimeouts.delete(key);
      scheduleLeagueStart(league);
    }, MAX_TIMEOUT_MS);
    activeTimeouts.set(key, timeout);
    console.log(`[leagueStart] Scheduled long-delay re-check for draft league "${league.name}"`);
    return;
  }

  const timeout = setTimeout(() => {
    activeTimeouts.delete(key);
    (async () => {
      const current = await leagues.findById(league.id);
      if (!current || current.status !== 'draft') return;
      if (current.participantIds.length < 2) return;
      await startLeague(current);
    })().catch(err =>
      console.error(`[leagueStart] Failed to start league ${league.id}:`, err)
    );
  }, delay);

  activeTimeouts.set(key, timeout);
  console.log(`[leagueStart] Scheduled fixture close for "${league.name}" at ${closeAt.toISOString()}`);
}

/**
 * Reschedule all draft league starts on server startup.
 */
export async function rescheduleAllLeagueStarts() {
  try {
    const all = await leagues.getAll();
    const draft = all.filter(l => l.status === 'draft');

    for (const league of draft) {
      scheduleLeagueStart(league);
    }

    console.log(`[leagueStart] Scheduled fixture close for ${draft.length} draft leagues`);
  } catch (err) {
    console.error('[leagueStart] Failed to reschedule league starts:', err);
  }
}

/**
 * Clear all scheduled league start timeouts.
 */
export function clearScheduledLeagueStarts() {
  for (const timeout of activeTimeouts.values()) {
    clearTimeout(timeout);
  }
  activeTimeouts.clear();
}
