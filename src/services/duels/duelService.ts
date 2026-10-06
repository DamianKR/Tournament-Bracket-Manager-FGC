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
import { lsReadIdMap, lsWriteIdMap, markPendingId, clearPendingId } from '@/services/storage/localStorage';
import { registerOfflineSync } from '@/services/storage/syncRegistry';

const API_BASE = `${SERVER_URL}/api/duels`;
const LS_KEY_CHALLENGES = 'bracket_duel_challenges';
const LS_KEY_SETTINGS_PREFIX = 'bracket_duel_settings_';
const LS_KEY_DUEL_OPS = 'bracket_pending_duel_ops';
const LS_KEY_PENDING_SETTINGS = 'bracket_pending_duel_settings';

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
    return raw
      ? { ...DEFAULT_DUEL_SETTINGS, ...JSON.parse(raw), communityId }
      : { ...DEFAULT_DUEL_SETTINGS, communityId };
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

// ── Pending-ops outbox ────────────────────────────────────────────────────
// Duel lifecycle actions hit dedicated endpoints (/accept, /complete, ...)
// instead of a document PUT, so the outbox stores OPERATIONS, not records.
// On reconnect they are replayed in order and the server re-validates each
// transition (stays authoritative). A 4xx means the op is no longer valid
// (e.g. challenge expired meanwhile) → dropped, server state wins on merge.

type DuelOpAction =
  | 'create'
  | 'accept'
  | 'decline'
  | 'complete'
  | 'expire'
  | 'report-result'
  | 'resolve-conflict';

interface PendingDuelOp {
  challengeId: string;
  action: DuelOpAction;
  payload?: Record<string, unknown>;
  queuedAt: string;
}

function lsReadDuelOps(): PendingDuelOp[] {
  try {
    const raw = localStorage.getItem(LS_KEY_DUEL_OPS);
    return raw ? (JSON.parse(raw) as PendingDuelOp[]) : [];
  } catch {
    return [];
  }
}

function lsWriteDuelOps(ops: PendingDuelOp[]): void {
  try {
    localStorage.setItem(LS_KEY_DUEL_OPS, JSON.stringify(ops));
  } catch (err) {
    console.error('[Duels] pending ops write failed:', err);
  }
}

function enqueueDuelOp(challengeId: string, action: DuelOpAction, payload?: Record<string, unknown>): void {
  const ops = lsReadDuelOps();
  ops.push({ challengeId, action, payload, queuedAt: new Date().toISOString() });
  lsWriteDuelOps(ops);
}

/** Ids of challenges with at least one op still waiting for the server. */
function pendingChallengeIds(): Set<string> {
  return new Set(lsReadDuelOps().map((o) => o.challengeId));
}

/**
 * Executes one queued op against the server.
 *   'ok'      → applied
 *   'reject'  → 4xx, the op is permanently invalid — drop it
 *   'network' → unreachable/5xx — keep it queued for the next sync
 */
async function replayDuelOp(op: PendingDuelOp): Promise<'ok' | 'reject' | 'network'> {
  try {
    let res: Response;
    if (op.action === 'create') {
      res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(op.payload),
      });
    } else {
      const hasBody = op.action === 'complete' || op.action === 'report-result' || op.action === 'resolve-conflict';
      res = await fetch(`${API_BASE}/${encodeURIComponent(op.challengeId)}/${op.action}`, {
        method: 'PUT',
        headers: { ...(hasBody ? { 'Content-Type': 'application/json' } : {}), ...getAuthHeader() },
        ...(hasBody ? { body: JSON.stringify(op.payload ?? {}) } : {}),
      });
    }
    if (res.ok) return 'ok';
    if (res.status >= 400 && res.status < 500) return 'reject';
    return 'network';
  } catch {
    resetServerCache();
    return 'network';
  }
}

/**
 * Replays queued duel ops in order + pending settings writes.
 * Stops at the first network failure (later ops would fail anyway and
 * order matters within a challenge). 4xx ops are dropped — the next
 * merge adopts the server-side state for those challenges.
 */
export async function syncPendingDuels(): Promise<number> {
  const ops = lsReadDuelOps();
  const pendingSettings = lsReadIdMap(LS_KEY_PENDING_SETTINGS);
  if (!ops.length && !Object.keys(pendingSettings).length) return 0;
  if (!(await isServerAvailable())) return 0;

  let synced = 0;
  const remaining: PendingDuelOp[] = [];

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const result = await replayDuelOp(op);
    if (result === 'ok') {
      synced++;
    } else if (result === 'reject') {
      console.warn('[Duels] Pending op rejected by server, dropping:', op.action, op.challengeId);
      if (op.action === 'create') {
        // Server never accepted this challenge — remove the phantom record
        lsWriteChallenges(lsReadChallenges().filter((c) => c.id !== op.challengeId));
      }
    } else {
      // Network failure — keep this and every later op in order
      remaining.push(...ops.slice(i));
      break;
    }
  }
  lsWriteDuelOps(remaining);

  // Pending settings writes (last-write-wins per community)
  for (const communityId of Object.keys(pendingSettings)) {
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(lsReadSettings(communityId)),
      });
      if (res.ok) {
        const m = lsReadIdMap(LS_KEY_PENDING_SETTINGS);
        delete m[communityId];
        lsWriteIdMap(LS_KEY_PENDING_SETTINGS, m);
        synced++;
      }
    } catch (err) {
      console.warn('[Duels] Pending settings sync failed:', err);
      resetServerCache();
      break;
    }
  }

  return synced;
}

registerOfflineSync(syncPendingDuels);

/**
 * Attempts an action op immediately; on network failure it is queued and
 * replayed by syncPendingDuels. A 4xx is NOT queued — the server rejected
 * the transition, so its state wins on the next merge.
 */
async function pushDuelOp(
  challengeId: string,
  action: DuelOpAction,
  payload?: Record<string, unknown>
): Promise<void> {
  if (!(await isServerAvailable())) {
    enqueueDuelOp(challengeId, action, payload);
    return;
  }
  const result = await replayDuelOp({ challengeId, action, payload, queuedAt: '' });
  if (result === 'network') enqueueDuelOp(challengeId, action, payload);
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
  const pendingSettings = lsReadIdMap(LS_KEY_PENDING_SETTINGS);
  const hasPendingSettings = !!pendingSettings[communityId];
  if (await isServerAvailable()) {
    try {
      const query = `?communityId=${encodeURIComponent(communityId)}`;
      const res = await fetch(`${API_BASE}/settings${query}`);
      if (res.ok) {
        const data = { ...DEFAULT_DUEL_SETTINGS, ...(await res.json()), communityId };
        // A pending local write beats the server copy — keep ours and
        // schedule the re-push instead of adopting the stale server data.
        if (!hasPendingSettings) {
          lsWriteSettings(communityId, data);
          return data;
        }
        syncPendingDuels().catch(() => {});
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

  // Mark pending so a failed/offline push is retried on next sync instead
  // of silently reverting to the server's old settings on the next read.
  markPendingId(LS_KEY_PENDING_SETTINGS, communityId);

  if (await isServerAvailable()) {
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(updated),
      });
      if (res.ok) {
        clearPendingId(LS_KEY_PENDING_SETTINGS, communityId);
      } else {
        console.warn('[Duels] Server settings write failed:', res.status);
      }
    } catch (err) {
      console.warn('[Duels] Server settings write failed:', err);
      resetServerCache();
    }
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
        const data = (await res.json()) as DuelChallenge[];
        const existing = lsReadChallenges();
        const targetCommunity = communityId || DEFAULT_COMMUNITY_ID;
        const pendingIds = pendingChallengeIds();
        const localById = new Map(existing.map((c) => [c.id, c]));
        const serverIds = new Set(data.map((c) => c.id));

        // Challenges with queued ops keep the local version — the local
        // status already reflects the action waiting to be replayed.
        const mergedSlice = data.map((sc) =>
          pendingIds.has(sc.id) ? localById.get(sc.id) ?? sc : sc
        );

        // Offline-created challenges (pending 'create' op) aren't on the
        // server yet — keep them visible instead of letting them vanish.
        for (const lc of existing) {
          const inScope = communityId
            ? (lc.communityId || DEFAULT_COMMUNITY_ID) === targetCommunity
            : true;
          if (inScope && !serverIds.has(lc.id) && pendingIds.has(lc.id)) {
            mergedSlice.push(lc);
          }
        }

        // Preserve the cache slice of other communities untouched.
        const others = communityId
          ? existing.filter((c) => (c.communityId || DEFAULT_COMMUNITY_ID) !== targetCommunity)
          : [];
        lsWriteChallenges([...others, ...mergedSlice]);

        // Background: flush queued ops so offline actions reach the server.
        if (pendingIds.size) syncPendingDuels().catch(() => {});

        return mergedSlice;
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

  // 1b. Availability — inactive players cannot challenge or be challenged
  if (!challenger.games?.[gameId]) {
    return { valid: false, error: 'The challenger is not registered for this game' };
  }
  if (!challenged.games?.[gameId]) {
    return { valid: false, error: `${challenged.alias || challenged.name} is not registered for this game` };
  }
  if (challenger.games[gameId].available === false) {
    return { valid: false, error: 'You are inactive for ranked activity in this game. Enable availability in your profile.' };
  }
  if (challenged.games[gameId].available === false) {
    return { valid: false, error: `${challenged.alias || challenged.name} is inactive for ranked activity in this game.` };
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


// In-flight create requests keyed by challenge identity. A double click (or
// double tap) on a slow connection must not produce two identical challenges.
const _createInFlight = new Map<string, Promise<DuelChallenge | null>>();

/**
 * Create a new duel challenge
 */
export function createDuelChallenge(
  challengerId: string,
  challengedId: string,
  gameId: string,
  type: 'normal' | 'mandatory' = 'normal',
  communityId: string = DEFAULT_COMMUNITY_ID
): Promise<DuelChallenge | null> {
  const key = `${communityId}|${challengerId}|${challengedId}|${gameId}|${type}`;
  const inFlight = _createInFlight.get(key);
  if (inFlight) return inFlight;
  const p = doCreateDuelChallenge(challengerId, challengedId, gameId, type, communityId)
    .finally(() => { _createInFlight.delete(key); });
  _createInFlight.set(key, p);
  return p;
}

async function doCreateDuelChallenge(
  challengerId: string,
  challengedId: string,
  gameId: string,
  type: 'normal' | 'mandatory',
  communityId: string
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

  // Sync to server FIRST — the server is authoritative for validation
  // (availability, ELO restriction, admin scope). A server REJECTION throws
  // and the challenge is not cached. A network failure / offline mode
  // caches the challenge and queues a 'create' op for replay — the server
  // re-runs the same validation when it lands.
  if (await isServerAvailable()) {
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(challenge),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server rejected challenge (${res.status})`);
      }
    } catch (err) {
      if (err instanceof TypeError) {
        // fetch network error — treat like offline instead of losing it
        resetServerCache();
        enqueueDuelOp(challenge.id, 'create', challenge as unknown as Record<string, unknown>);
      } else {
        throw err;
      }
    }
  } else {
    enqueueDuelOp(challenge.id, 'create', challenge as unknown as Record<string, unknown>);
  }

  // Cache locally — either confirmed by server or pending the queued op
  const all = lsReadChallenges();
  all.push(challenge);
  lsWriteChallenges(all);

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

  // Sync to server — queued for replay if offline/unreachable
  await pushDuelOp(challengeId, 'accept');

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

  // Sync to server — queued for replay if offline/unreachable
  await pushDuelOp(challengeId, 'decline');

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

  // Sync to server — queued for replay if offline/unreachable
  await pushDuelOp(challengeId, 'complete', { matchId });

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
  // Iterate the FULL cache — writing back a community-filtered list would
  // wipe every other community's challenges from localStorage.
  const all = lsReadChallenges();
  const now = new Date();
  const expiredIds: string[] = [];

  all.forEach(challenge => {
    if (communityId && (challenge.communityId || DEFAULT_COMMUNITY_ID) !== targetCommunity) return;
    if (challenge.status === 'pending' && new Date(challenge.expiresAt) < now) {
      challenge.status = 'expired';
      expiredIds.push(challenge.id);
    }

    if (challenge.status === 'accepted' && challenge.acceptedAt) {
      // Mandatory duels are auto-accepted at creation, so they skip the
      // pending window a normal duel has. Grant it as grace: expiry =
      // challenge deadline (expiresAt) + play/report window.
      const acceptedExpiresAt = new Date(
        challenge.type === 'mandatory' && challenge.expiresAt
          ? challenge.expiresAt
          : challenge.acceptedAt
      );
      acceptedExpiresAt.setDate(acceptedExpiresAt.getDate() + settings.challengeExpirationDays);
      if (acceptedExpiresAt < now) {
        challenge.status = 'expired';
        expiredIds.push(challenge.id);
      }
    }
  });

  if (expiredIds.length > 0) {
    lsWriteChallenges(all);

    // Queue an expire op per challenge — replays on reconnect if offline
    for (const id of expiredIds) {
      await pushDuelOp(id, 'expire');
    }

    if (await isServerAvailable()) {
      // Reload from server after expiring to get updated ELO penalties.
      // Keep challenges with pending ops on their local version.
      try {
        const query = `?communityId=${encodeURIComponent(targetCommunity)}`;
        const res = await fetch(`${API_BASE}${query}`);
        if (res.ok) {
          const serverData = (await res.json()) as DuelChallenge[];
          const pendingIds = pendingChallengeIds();
          const existing = lsReadChallenges();
          const localById = new Map(existing.map((c) => [c.id, c]));
          const mergedSlice = serverData.map((sc) =>
            pendingIds.has(sc.id) ? localById.get(sc.id) ?? sc : sc
          );
          const others = existing.filter(
            (c) => (c.communityId || DEFAULT_COMMUNITY_ID) !== targetCommunity
          );
          lsWriteChallenges([...others, ...mergedSlice]);
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
      // TypeError = network died — fall through to the offline queue;
      // real HTTP/validation errors still propagate to the caller.
      if (!(err instanceof TypeError)) {
        console.error('[Duels] Report result failed:', err);
        throw err;
      }
      resetServerCache();
    }
  }

  // Offline: mark the report locally and queue the op. The server runs
  // the real consensus logic on replay; _pendingReport is a local-only
  // flag so the UI knows this challenge has a report in flight.
  const all = lsReadChallenges();
  const index = all.findIndex(c => c.id === challengeId);
  if (index < 0) return null;
  all[index] = {
    ...all[index],
    _pendingReport: { winnerId, reportedAt: new Date().toISOString() },
  } as DuelChallenge;
  lsWriteChallenges(all);
  enqueueDuelOp(challengeId, 'report-result', { winnerId, ...(evidence && { evidence }) });
  return all[index];
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
      if (!(err instanceof TypeError)) {
        console.error('[Duels] Resolve conflict failed:', err);
        throw err;
      }
      resetServerCache();
    }
  }

  // Offline: mirror the server's resolution locally (both results set to
  // the admin's pick + completed) and queue the op for replay.
  const all = lsReadChallenges();
  const index = all.findIndex(c => c.id === challengeId);
  if (index < 0) return null;
  const resolvedResult = { winnerId, reportedAt: new Date().toISOString(), evidence: null };
  all[index] = {
    ...all[index],
    challengerResult: resolvedResult,
    challengedResult: resolvedResult,
    status: 'completed',
    completedAt: resolvedResult.reportedAt,
  };
  lsWriteChallenges(all);
  enqueueDuelOp(challengeId, 'resolve-conflict', { winnerId });
  return all[index];
}
