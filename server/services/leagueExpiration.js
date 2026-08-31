import { leagues, leagueMatches, users, participants } from '../db/collections.js';
import { createNotification } from './notificationService.js';

/**
 * Auto-expire league matches that have passed their grace period.
 * Runs twice a day from server.js.
 */
export async function expireAllOldLeagueMatches() {
  let allLeagues = [];
  let allMatches = [];

  try {
    allLeagues = await leagues.getAll();
    allMatches = await leagueMatches.getAll();
  } catch (err) {
    console.error('[LeagueExpiration] Failed to load data:', err.message);
    return 0;
  }

  const now = new Date();
  let expiredCount = 0;

  for (const league of allLeagues) {
    if (league.status !== 'active') continue;

    const leagueMatchList = allMatches.filter(m => m.leagueId === league.id && m.status === 'scheduled');

    for (const match of leagueMatchList) {
      const weekStart = new Date(league.weekStartDates[match.week]);
      const graceEnd = new Date(
        weekStart.getTime() + (league.periodDays + league.gracePeriodDays) * 24 * 60 * 60 * 1000
      );

      if (now > graceEnd) {
        match.status = 'pending_review';
        match.deadline = graceEnd.toISOString();
        await leagueMatches.upsert(match);
        expiredCount++;
      }
    }
  }

  if (expiredCount > 0) {
    console.log(`[LeagueExpiration] Expired ${expiredCount} league matches`);
  }

  return expiredCount;
}

/**
 * Notify admins when a participant becomes eligible for ban in a league.
 * Called after a no-show is marked manually.
 */
export async function notifyAdminsOfBanEligibility(leagueId, participantId, noShowCount) {
  let league;
  let participant;
  let allUsers = [];

  try {
    league = await leagues.findById(leagueId);
    participant = await participants.findById(participantId);
    allUsers = await users.getAll();
  } catch (err) {
    console.error('[LeagueExpiration] Failed to load data for admin notification:', err.message);
    return;
  }

  const adminParticipants = allUsers
    .filter(u => u.role === 'admin' && u.participantId)
    .map(u => u.participantId);

  if (adminParticipants.length === 0) return;

  const name = participant?.alias?.trim() || participant?.name || 'Unknown';
  const message = `${name} has ${noShowCount} no-shows in ${league?.name || 'a league'} and is eligible for ban. Review and ban manually.`;

  for (const adminId of [...new Set(adminParticipants)]) {
    await createNotification(
      adminId,
      'league_ban_eligible',
      'Player eligible for ban',
      message,
      { leagueId, participantId, noShowCount }
    );
  }
}
