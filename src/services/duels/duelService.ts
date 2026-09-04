/**
 * Duel Service — 3-layer persistence (JSON first + localStorage cache)
 *
 * Priority for READS:
 *   1. Local JSON server (http://localhost:3001/api/duels)
 *   2. localStorage cache
 *
 * Priority for WRITES:
 *   1. localStorage (synchronous, instant)
 *   2. Local JSON server (async, fire-and-forget)
 */

import { DuelChallenge, DuelSettings, DuelValidationResult, DuelStats, DEFAULT_DUEL_SETTINGS } from '@/models/duel';
import { getParticipant } from '@/services/participants/participantService';
import { getAllRankedMatchesAsync } from '@/services/rankedMatches/rankedMatchService';
import { SERVER_URL, isServerAvailable, resetServerCache } from '@/services/api/apiClient';
import { getAuthHeader } from '@/services/auth/authService';
import { DEFAULT_COMMUNITY_ID } from '@/constants/community';
import { getEffectiveElo } from '@/utils/participantGames';

const API_BASE = `${SERVER_URL}/api/duels`;
const LS_KEY_CHALLENGES = 'bracket_duel_challenges';
const LS_KEY_SETTINGS_PREFIX = 'bracket_duel_settings_';

// ── localStorage helpers ──────────────────────────────────────────────────

function lsReadChallenges(): DuelChallenge[] {
  try {
    const raw = localStorage.getItem(LS_KEY_CHALLENGES);
    if (!raw) return [];
    const data = JSON.parse(raw) as DuelChallenge[];
    return data.map((c) => ({
      ...c,
      communityId: c.communityId || DEFAULT_COMMUNITY_ID,
    }));
  } catch {
    return [];
  }
}

function lsWriteChallenges(data: DuelChallenge[]): void {
  try {
    localStorage.setItem(LS_KEY_CHALLENGES, JSON.stringify(data));
  } catch (err) {
    console.error('[Duels] localStorage challenges write failed:', err);
  }
}

function settingsKey(communityId: string): string {
  return `${LS_KEY_SETTINGS_PREFIX}${communityId}`;
}

function lsReadSettings(communityId: string = DEFAULT_COMMUNITY_ID): DuelSettings {
  try {
    const raw = localStorage.getItem(settingsKey(communityId));
    return raw ? JSON.parse(raw) : { ...DEFAULT_DUEL_SETTINGS, communityId };
  } catch {
    return { ...DEFAULT_DUEL_SETTINGS, communityId };
  }
}

function lsWriteSettings(communityId: string, data: DuelSettings): void {
  try {
    localStorage.setItem(settingsKey(communityId), JSON.stringify({ ...data, communityId }));
  } catch (err) {
    console.error('[Duels] localStorage settings write failed:', err);
  }
}

// ── Settings ──────────────────────────────────────────────────────────────

/**
 * Get duel settings (sync from localStorage)
 */
export function getDuelSettings(communityId: string = DEFAULT_COMMUNITY_ID): DuelSettings {
  return lsReadSettings(communityId);
}

/**
 * Get duel settings (async from server, fallback to localStorage)
 */
export async function getDuelSettingsAsync(communityId: string = DEFAULT_COMMUNITY_ID): Promise<DuelSettings> {
  if (await isServerAvailable()) {
    try {
      const query = `?communityId=${encodeURIComponent(communityId)}`;
      const res = await fetch(`${API_BASE}/settings${query}`);
      if (res.ok) {
        const data = await res.json();
        lsWriteSettings(communityId, data);
        return data;
      }
    } catch (err) {
      console.warn('[Duels] Server settings read failed:', err);
      resetServerCache();
    }
  }
  return lsReadSettings(communityId);
}

/**
 * Update duel settings (write to localStorage + server)
 */
export async function updateDuelSettings(
  newSettings: Partial<DuelSettings>,
  communityId: string = DEFAULT_COMMUNITY_ID
): Promise<DuelSettings> {
  const current = lsReadSettings(communityId);
  const updated = { ...current, ...newSettings, communityId };

  // Write to localStorage first (instant)
  lsWriteSettings(communityId, updated);

  // Sync to server (fire-and-forget)
  if (await isServerAvailable()) {
    fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(updated),
    }).catch((err) => {
      console.warn('[Duels] Server settings write failed:', err);
      resetServerCache();
    });
  }

  return updated;
}

// ── Challenges ────────────────────────────────────────────────────────────

/**
 * Get all challenges (sync from localStorage)
 */
export function getAllChallenges(): DuelChallenge[] {
  return lsReadChallenges();
}

/**
 * Get all challenges (async from server, fallback to localStorage).
 * Merges the returned community slice into the local cache instead of replacing everything.
 */
export async function getAllChallengesAsync(communityId?: string): Promise<DuelChallenge[]> {
  if (await isServerAvailable()) {
    try {
      const query = communityId ? `?communityId=${encodeURIComponent(communityId)}` : '';
      const res = await fetch(`${API_BASE}${query}`);
      if (res.ok) {
        const data = await res.json();
        const existing = lsReadChallenges();
        const targetCommunity = communityId || DEFAULT_COMMUNITY_ID;
        const others = existing.filter(c => c.communityId && c.communityId !== targetCommunity);
        const merged = [...others, ...data];
        lsWriteChallenges(merged);
        return data;
      }
    } catch (err) {
      console.warn('[Duels] Server challenges read failed:', err);
      resetServerCache();
    }
  }
  if (communityId) {
    return lsReadChallenges().filter(c => c.communityId === communityId);
  }
  return lsReadChallenges();
}

/**
 * Get active challenges (pending/accepted)
 */
export async function getActiveChallenges(communityId?: string): Promise<DuelChallenge[]> {
  const all = await getAllChallengesAsync(communityId);
  return all.filter(c => c.status === 'pending' || c.status === 'accepted');
}

/**
 * Get a single challenge by ID
 */
export async function getDuelChallenge(id: string, communityId?: string): Promise<DuelChallenge | null> {
  const all = await getAllChallengesAsync(communityId);
  return all.find(c => c.id === id) ?? null;
}

/**
 * Get the last weekly reset timestamp based on settings
 */
export function getLastWeeklyReset(settings: DuelSettings): Date {
  const now = new Date();
  const currentDay = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const diff = (currentDay - settings.weeklyResetDay + 7) % 7;
  const lastReset = new Date(now);
  lastReset.setDate(now.getDate() - diff);
  lastReset.setHours(settings.weeklyResetHour, settings.weeklyResetMinute, 0, 0);

  // If the reset for this week hasn't happened yet, go back one more week
  if (lastReset > now) {
    lastReset.setDate(lastReset.getDate() - 7);
  }

  return lastReset;
}

/**
 * Get the next weekly reset timestamp based on settings
 */
export function getNextWeeklyReset(settings: DuelSettings): Date {
  const lastReset = getLastWeeklyReset(settings);
  const nextReset = new Date(lastReset);
  nextReset.setDate(nextReset.getDate() + 7);
  return nextReset;
}

/**
 * Format time remaining until next reset
 */
export function formatTimeUntilReset(nextReset: Date): string {
  const now = new Date();
  const diffMs = nextReset.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffDays > 0) return `${diffDays}d ${diffHours}h ${diffMinutes}m`;
  if (diffHours > 0) return `${diffHours}h ${diffMinutes}m`;
  return `${diffMinutes}m`;
}

/**
 * Get challenges created this week by a player
 */
export async function getChallengesThisWeek(challengerId: string, communityId?: string): Promise<DuelChallenge[]> {
  const settings = await getDuelSettingsAsync(communityId);
  const lastReset = getLastWeeklyReset(settings);

  const all = await getAllChallengesAsync(communityId);
  return all.filter(
    c => c.challengerId === challengerId && new Date(c.createdAt) >= lastReset
  );
}

/**
 * Get duel stats for a player
 */
export async function getDuelStats(participantId: string, communityId?: string): Promise<DuelStats> {
  const challengesThisWeek = (await getChallengesThisWeek(participantId, communityId)).length;
  const settings = await getDuelSettingsAsync(communityId);

  const all = await getAllChallengesAsync(communityId);
  const pending = all.filter(
    c => (c.challengerId === participantId || c.challengedId === participantId) &&
         c.status === 'pending'
  ).length;

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const completedThisWeek = all.filter(
    c => (c.challengerId === participantId || c.challengedId === participantId) &&
         c.status === 'completed' &&
         c.completedAt && new Date(c.completedAt) > weekAgo
  ).length;

  // All-time duel record
  const participantDuels = all.filter(
    c => (c.challengerId === participantId || c.challengedId === participantId) &&
         c.status === 'completed'
  );

  // Load ranked matches to determine duel winners
  const rankedMatches = await getAllRankedMatchesAsync(communityId);
  const matchMap = new Map(rankedMatches.map(m => [m.id, m]));

  let duelWins = 0;
  let duelLosses = 0;

  for (const duel of participantDuels) {
    const match = duel.matchId ? matchMap.get(duel.matchId) : null;
    if (match && match.winnerId) {
      if (match.winnerId === participantId) {
        duelWins++;
      } else {
        duelLosses++;
      }
    }
  }

  const totalDuels = duelWins + duelLosses;
  const duelWinRate = totalDuels > 0 ? Math.round((duelWins / totalDuels) * 100) : 0;

  return {
    challengesThisWeek,
    maxChallengesPerWeek: settings.maxChallengesPerWeek,
    pendingChallenges: pending,
    completedThisWeek,
    totalDuels,
    duelWins,
    duelLosses,
    duelWinRate,
  };
}

/**
 * Validate if a player can challenge another
 */
export async function validateDuelChallenge(
  challengerId: string,
  challengedId: string,
  gameId: string,
  type: 'normal' | 'mandatory' = 'normal',
  communityId: string = DEFAULT_COMMUNITY_ID
): Promise<DuelValidationResult> {
  // 1. Can't challenge yourself
  if (challengerId === challengedId) {
    return { valid: false, error: 'Cannot challenge yourself' };
  }

  const settings = await getDuelSettingsAsync(communityId);
  const challenger = getParticipant(challengerId, communityId);
  const challenged = getParticipant(challengedId, communityId);

  if (!challenger || !challenged) {
    return { valid: false, error: 'One or both participants not found' };
  }

  // 2. Check weekly limit (includes both normal and mandatory)
  const challengesThisWeek = await getChallengesThisWeek(challengerId, communityId);
  if (challengesThisWeek.length >= settings.maxChallengesPerWeek) {
    return {
      valid: false,
      error: `You have reached your weekly limit of ${settings.maxChallengesPerWeek} challenges`,
    };
  }

  // 2b. If mandatory: check if enabled and weekly limit
  if (type === 'mandatory') {
    if (settings.mandatoryDuelsEnabled === false) {
      return { valid: false, error: 'Mandatory duels are currently disabled' };
    }

    const mandatoryPerWeek = typeof settings.mandatoryDuelsPerWeek === 'number'
      ? Math.max(0, Math.floor(settings.mandatoryDuelsPerWeek))
      : 1;
    const mandatoryThisWeek = challengesThisWeek.filter(c => c.type === 'mandatory');
    if (mandatoryThisWeek.length >= mandatoryPerWeek) {
      return {
        valid: false,
        error: `You can only send ${mandatoryPerWeek} mandatory challenge${mandatoryPerWeek !== 1 ? 's' : ''} per week`,
      };
    }

    // 2c. Check monthly limit per opponent (no repeat same opponent with mandatory in same month)
    const all = await getAllChallengesAsync(communityId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const mandatoryToSameOpponentThisMonth = all.filter(
      c =>
        c.type === 'mandatory' &&
        c.challengerId === challengerId &&
        c.challengedId === challengedId &&
        new Date(c.createdAt) >= monthStart
    );

    if (mandatoryToSameOpponentThisMonth.length > 0) {
      return {
        valid: false,
        error: 'You cannot challenge the same opponent with a mandatory duel twice in the same month',
      };
    }
  }

  // 3. Check ELO restriction (can't challenge someone too far below) for the selected game
  const challengerElo = getEffectiveElo(challenger, gameId);
  const challengedElo = getEffectiveElo(challenged, gameId);
  const eloDiff = challengerElo - challengedElo;

  if (eloDiff > settings.eloRestriction) {
    return {
      valid: false,
      error: `Cannot challenge a player more than ${settings.eloRestriction} ELO points below you`,
    };
  }

  // 4. Check if already challenged this week
  const lastReset = getLastWeeklyReset(settings);

  const all = await getAllChallengesAsync(communityId);
  const alreadyChallenged = all.some(
    c =>
      c.challengerId === challengerId &&
      c.challengedId === challengedId &&
      new Date(c.createdAt) >= lastReset &&
      c.status !== 'declined' &&
      c.status !== 'expired'
  );

  if (alreadyChallenged) {
    return {
      valid: false,
      error: 'You have already challenged this player this week',
    };
  }

  // 5. Check for pending duplicate
  const pendingDuplicate = all.some(
    c =>
      c.challengerId === challengerId &&
      c.challengedId === challengedId &&
      c.status === 'pending'
  );

  if (pendingDuplicate) {
    return {
      valid: false,
      error: 'You already have a pending challenge with this player',
    };
  }

  // All checks passed
  const warnings: string[] = [];
  if (eloDiff < -settings.eloRestriction) {
    warnings.push(`This player is ${Math.abs(eloDiff)} ELO points above you`);
  }

  return { valid: true, warnings };
}


/**
 * Create a new duel challenge
 */
export async function createDuelChallenge(
  challengerId: string,
  challengedId: string,
  gameId: string,
  type: 'normal' | 'mandatory' = 'normal',
  communityId: string = DEFAULT_COMMUNITY_ID
): Promise<DuelChallenge | null> {
  // Validate first
  const validation = await validateDuelChallenge(challengerId, challengedId, gameId, type, communityId);
  if (!validation.valid) {
    throw new Error(validation.error || 'Challenge validation failed');
  }

  const settings = await getDuelSettingsAsync(communityId);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + settings.challengeExpirationDays);

  const challenge: DuelChallenge = {
    id: `duel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    challengerId,
    challengedId,
    communityId,
    gameId,
    type,
    status: type === 'mandatory' ? 'accepted' : 'pending', // Mandatory challenges skip pending
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
    ...(type === 'mandatory' && { acceptedAt: new Date().toISOString() }),
  };

  // Add to localStorage cache
  const all = lsReadChallenges();
  all.push(challenge);
  lsWriteChallenges(all);

  // Sync to server
  if (await isServerAvailable()) {
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(challenge),
      });
      if (!res.ok) throw new Error('Server rejected challenge');
    } catch (err) {
      console.warn('[Duels] Server challenge create failed:', err);
      resetServerCache();
    }
  }

  return challenge;
}

/**
 * Accept a duel challenge
 */
export async function acceptDuelChallenge(challengeId: string): Promise<DuelChallenge | null> {
  const all = lsReadChallenges();
  const challenge = all.find(c => c.id === challengeId);
  if (!challenge || challenge.status !== 'pending') return null;

  challenge.status = 'accepted';
  challenge.acceptedAt = new Date().toISOString();
  
  // Update localStorage
  lsWriteChallenges(all);

  // Sync to server
  if (await isServerAvailable()) {
    fetch(`${API_BASE}/${challengeId}/accept`, {
      method: 'PUT',
      headers: getAuthHeader(),
    }).catch((err) => {
      console.warn('[Duels] Server accept failed:', err);
      resetServerCache();
    });
  }

  return challenge;
}

/**
 * Decline a duel challenge
 */
export async function declineDuelChallenge(challengeId: string): Promise<DuelChallenge | null> {
  const all = lsReadChallenges();
  const challenge = all.find(c => c.id === challengeId);
  if (!challenge || challenge.status !== 'pending') return null;

  challenge.status = 'declined';
  challenge.declinedAt = new Date().toISOString();
  
  // Update localStorage
  lsWriteChallenges(all);

  // Sync to server
  if (await isServerAvailable()) {
    fetch(`${API_BASE}/${challengeId}/decline`, {
      method: 'PUT',
      headers: getAuthHeader(),
    }).catch((err) => {
      console.warn('[Duels] Server decline failed:', err);
      resetServerCache();
    });
  }

  return challenge;
}

/**
 * Complete a duel challenge (called after match is recorded)
 */
export async function completeDuelChallenge(challengeId: string, matchId: string): Promise<DuelChallenge | null> {
  const all = lsReadChallenges();
  const challenge = all.find(c => c.id === challengeId);
  if (!challenge) return null;

  challenge.status = 'completed';
  challenge.matchId = matchId;
  challenge.completedAt = new Date().toISOString();
  
  // Update localStorage
  lsWriteChallenges(all);

  // Sync to server
  if (await isServerAvailable()) {
    fetch(`${API_BASE}/${challengeId}/complete`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ matchId }),
    }).catch((err) => {
      console.warn('[Duels] Server complete failed:', err);
      resetServerCache();
    });
  }

  return challenge;
}

/**
 * Check and expire old challenges.
 * Pending challenges expire after challengeExpirationDays from creation.
 * Accepted challenges expire after challengeExpirationDays from acceptance.
 */
export async function expireOldChallenges(communityId?: string): Promise<void> {
  const targetCommunity = communityId || DEFAULT_COMMUNITY_ID;
  const settings = await getDuelSettingsAsync(targetCommunity);
  const all = lsReadChallenges().filter(c => !communityId || c.communityId === targetCommunity);
  const now = new Date();
  const expiredIds: string[] = [];

  all.forEach(challenge => {
    if (challenge.status === 'pending' && new Date(challenge.expiresAt) < now) {
      challenge.status = 'expired';
      expiredIds.push(challenge.id);
    }

    if (challenge.status === 'accepted' && challenge.acceptedAt) {
      const acceptedExpiresAt = new Date(challenge.acceptedAt);
      acceptedExpiresAt.setDate(acceptedExpiresAt.getDate() + settings.challengeExpirationDays);
      if (acceptedExpiresAt < now) {
        challenge.status = 'expired';
        expiredIds.push(challenge.id);
      }
    }
  });

  if (expiredIds.length > 0) {
    lsWriteChallenges(all);

    if (await isServerAvailable()) {
      await Promise.all(expiredIds.map(async (id) => {
        try {
          const res = await fetch(`${API_BASE}/${id}/expire`, {
            method: 'PUT',
            headers: getAuthHeader(),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[Duels] Server expire for ${id} failed:`, res.status, body);
          }
        } catch (err) {
          console.warn(`[Duels] Network expire for ${id} failed:`, err);
        }
      }));

      // Reload from server after expiring to get updated ELO penalties
      try {
        const query = `?communityId=${encodeURIComponent(targetCommunity)}`;
        const res = await fetch(`${API_BASE}${query}`);
        if (res.ok) {
          const serverData = await res.json();
          const existing = lsReadChallenges();
          const others = existing.filter(c => c.communityId !== targetCommunity);
          lsWriteChallenges([...others, ...serverData]);
        }
      } catch (err) {
        console.warn('[Duels] Failed to reload after expiration:', err);
      }
    }
  }
}

/**
 * Report match result for a challenge (participant submits their version)
 */
export async function reportDuelResult(
  challengeId: string,
  winnerId: string,
  evidence?: string
): Promise<DuelChallenge | null> {
  if (await isServerAvailable()) {
    try {
      const res = await fetch(`${API_BASE}/${challengeId}/report-result`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ winnerId, evidence }),
      });
      if (res.ok) {
        const updated = await res.json();
        // Update localStorage cache
        const all = lsReadChallenges();
        const index = all.findIndex(c => c.id === challengeId);
        if (index >= 0) {
          all[index] = updated;
          lsWriteChallenges(all);
        }
        return updated;
      }
      const error = await res.json();
      throw new Error(error.error || 'Failed to report result');
    } catch (err) {
      console.error('[Duels] Report result failed:', err);
      throw err;
    }
  }
  return null;
}

/**
 * Resolve conflicting results (admin only)
 */
export async function resolveConflict(
  challengeId: string,
  winnerId: string
): Promise<DuelChallenge | null> {
  if (await isServerAvailable()) {
    try {
      const res = await fetch(`${API_BASE}/${challengeId}/resolve-conflict`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ winnerId }),
      });
      if (res.ok) {
        const updated = await res.json();
        // Update localStorage cache
        const all = lsReadChallenges();
        const index = all.findIndex(c => c.id === challengeId);
        if (index >= 0) {
          all[index] = updated;
          lsWriteChallenges(all);
        }
        return updated;
      }
      const error = await res.json();
      throw new Error(error.error || 'Failed to resolve conflict');
    } catch (err) {
      console.error('[Duels] Resolve conflict failed:', err);
      throw err;
    }
  }
  return null;
}
