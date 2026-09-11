/**
 * Global Participant Service
 *
 * Stats are computed at runtime from the tournament data — never stored.
 * The GlobalParticipant only stores an FK list (tournamentIds[]) pointing
 * to the tournaments it participated in. This means stats are always accurate
 * even if tournament results are edited after the fact.
 */

import { GlobalParticipant, Tournament, ComputedStats, PlacementEntry, LeagueResultEntry, LeagueMatch } from '@/models/types';
import {
  loadGlobalParticipants,
  loadGlobalParticipantsAsync,
  saveGlobalParticipant,
  deleteGlobalParticipant,
  findGlobalParticipantByName,
  searchGlobalParticipants,
  loadTournaments,
  saveTournaments,
} from '@/services/storage/localStorage';
import { SERVER_URL } from '@/services/api/apiClient';
import { getAuthHeader } from '@/services/auth/authService';
import { setParticipantGameList, setParticipantPrimaryGame } from '@/utils/participantGames';

// ── ID generator ─────────────────────────────────────────────────────────

function generateId(): string {
  return `gp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── CRUD ─────────────────────────────────────────────────────────────────

export function getAllParticipants(communityId?: string): GlobalParticipant[] {
  return loadGlobalParticipants(communityId);
}

export async function getAllParticipantsAsync(communityId?: string): Promise<GlobalParticipant[]> {
  return loadGlobalParticipantsAsync(communityId);
}

export function getParticipant(id: string, communityId?: string): GlobalParticipant | null {
  const all = loadGlobalParticipants(communityId);
  return all.find((p) => p.id === id) ?? null;
}

const DEFAULT_COMMUNITY_ID = 'community_fgc_santa_clara';

export async function createParticipant(
  name: string,
  alias = '',
  gameIds: string[] = [],
  primaryGameId: string | null = null,
  gameMainCharacters: Record<string, string | null> = {},
  communityId: string = DEFAULT_COMMUNITY_ID
): Promise<GlobalParticipant> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Participant name is required');
  if (findGlobalParticipantByName(trimmedName, communityId)) {
    throw new Error(`A participant named "${trimmedName}" already exists`);
  }

  const participant: GlobalParticipant = {
    id: generateId(),
    name: trimmedName,
    alias: alias.trim(),
    avatarUrl: null,
    tournamentIds: [],
    gameId: null,
    mainCharacterId: null,
    games: {},
    communityId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  setParticipantGameList(participant, gameIds, primaryGameId, gameMainCharacters);

  await saveGlobalParticipant(participant);
  return participant;
}

export async function findOrCreateParticipant(
  name: string,
  communityId: string = DEFAULT_COMMUNITY_ID
): Promise<GlobalParticipant> {
  const existing = findGlobalParticipantByName(name, communityId);
  if (existing) return existing;
  return createParticipant(name, '', [], null, {}, communityId);
}

export async function updateParticipant(
  id: string,
  updates: {
    name?: string;
    alias?: string;
    avatarUrl?: string | null;
    /** @deprecated use primaryGameId instead */
    gameId?: string | null;
    /** @deprecated use gameMainCharacters instead */
    mainCharacterId?: string | null;
    primaryGameId?: string | null;
    gameIds?: string[];
    gameMainCharacters?: Record<string, string | null>;
    phoneNumber?: string | null;
    communityId?: string;
  }
): Promise<GlobalParticipant> {
  const all = loadGlobalParticipants();
  const participant = all.find((p) => p.id === id);
  if (!participant) throw new Error('Participant not found');

  if (updates.name) {
    const trimmed = updates.name.trim();
    const participantCommunity = updates.communityId ?? participant.communityId;
    const conflict = all.find(
      (p) => p.id !== id && p.communityId === participantCommunity && p.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (conflict) throw new Error(`A participant named "${trimmed}" already exists`);
    participant.name = trimmed;
  }
  if (updates.alias !== undefined) participant.alias = updates.alias.trim();
  if (updates.avatarUrl !== undefined) participant.avatarUrl = updates.avatarUrl;
  if (updates.phoneNumber !== undefined) participant.phoneNumber = updates.phoneNumber?.trim() || undefined;

  if (updates.gameIds !== undefined) {
    const primaryGameId = updates.primaryGameId !== undefined
      ? updates.primaryGameId
      : (updates.gameId !== undefined ? updates.gameId : participant.gameId);
    setParticipantGameList(participant, updates.gameIds, primaryGameId, updates.gameMainCharacters ?? {});
  } else if (updates.gameId !== undefined || updates.mainCharacterId !== undefined) {
    const gameId = updates.gameId !== undefined ? updates.gameId : participant.gameId;
    const mainCharacterId = updates.mainCharacterId !== undefined ? updates.mainCharacterId : participant.mainCharacterId;
    setParticipantPrimaryGame(participant, gameId, mainCharacterId);
  }

  participant.updatedAt = new Date().toISOString();

  await saveGlobalParticipant(participant);

  // Sync name/alias changes back to every tournament that references this player
  if (updates.name !== undefined || updates.alias !== undefined) {
    const tAlias = participant.alias?.trim() || undefined;
    let changed = false;
    const allTournaments = loadTournaments().map((t) => {
      const tps = t.participants;
      if (!tps.some((tp) => tp.globalParticipantId === participant.id)) return t;
      const updatedParticipants = tps.map((tp) => {
        if (tp.globalParticipantId !== participant.id) return tp;
        if (tp.name === participant.name && tp.alias === tAlias) return tp;
        return { ...tp, name: participant.name, alias: tAlias };
      });
      if (updatedParticipants.some((tp, i) => tp !== tps[i])) {
        changed = true;
        return { ...t, participants: updatedParticipants };
      }
      return t;
    });
    if (changed) saveTournaments(allTournaments);
  }

  return participant;
}

export async function removeParticipant(id: string): Promise<void> {
  return deleteGlobalParticipant(id);
}

// ── Search ───────────────────────────────────────────────────────────────

export function searchParticipants(query: string): GlobalParticipant[] {
  return searchGlobalParticipants(query);
}

// ── Stats — computed at runtime from tournaments ──────────────────────────
//
// Instead of storing pre-computed stats, we look up all tournaments
// that include this participant and derive everything from them.
// This means stats are always consistent with tournament results.

export function computeStats(participant: GlobalParticipant, tournaments?: Tournament[]): ComputedStats {
  const allTournaments = tournaments ?? loadTournaments();

  // Only tournaments that reference this participant
  // Guard against old records that don't have tournamentIds yet
  const ids = participant.tournamentIds ?? [];
  const joined = allTournaments.filter((t) => ids.includes(t.id));

  const placements: PlacementEntry[] = [];
  let wins = 0;
  let top3 = 0;
  let matchWins = 0;
  let matchLosses = 0;

  for (const t of joined) {
    // Find this participant's entry in the tournament (singles or team member)
    const tp = t.participants.find((p) =>
      p.globalParticipantId === participant.id ||
      (p.members && p.members.some((m: any) => m.globalParticipantId === participant.id))
    );
    if (!tp) continue;

    // Placement from finalPosition (set by the engine when eliminated/wins)
    if (tp.finalPosition !== undefined) {
      const entry: PlacementEntry = {
        tournamentId: t.id,
        tournamentName: t.name,
        position: tp.finalPosition,
        totalParticipants: t.participants.length,
        date: t.updatedAt,
      };
      placements.push(entry);
      if (tp.finalPosition === 1) wins++;
      if (tp.finalPosition <= 3) top3++;
    }

    // Match W/L from the bracket (team wins/losses are counted for each member)
    if (t.bracket) {
      const allMatches = [
        ...t.bracket.winnerBracket,
        ...t.bracket.loserBracket,
        ...(t.bracket.grandFinal ? [t.bracket.grandFinal] : []),
        ...(t.bracket.grandFinalReset ? [t.bracket.grandFinalReset] : []),
      ].filter((m) => m.status === 'completed');

      for (const m of allMatches) {
        if (m.winnerId === tp.id) matchWins++;
        if (m.loserId === tp.id) matchLosses++;
      }
    }
  }

  // Sort placements newest first
  placements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalMatches = matchWins + matchLosses;
  const winRate = totalMatches > 0 ? Math.round((matchWins / totalMatches) * 100) : 0;

  return {
    tournamentsPlayed: joined.length,
    wins,
    top3,
    matchWins,
    matchLosses,
    winRate,
    placements,
  };
}

/**
 * Compute stats for all participants in one pass (used in the participants list).
 */
export function computeAllStats(
  participants: GlobalParticipant[]
): Map<string, ComputedStats> {
  const allTournaments = loadTournaments();
  const result = new Map<string, ComputedStats>();

  for (const p of participants) {
    const pIds = p.tournamentIds ?? [];
    const joined = allTournaments.filter((t) => pIds.includes(t.id));
    let wins = 0, top3 = 0, matchWins = 0, matchLosses = 0;
    const placements: PlacementEntry[] = [];

    for (const t of joined) {
      const tp = t.participants.find((tp2) =>
        tp2.globalParticipantId === p.id ||
        (tp2.members && tp2.members.some((m: any) => m.globalParticipantId === p.id))
      );
      if (!tp) continue;

      if (tp.finalPosition !== undefined) {
        placements.push({
          tournamentId: t.id,
          tournamentName: t.name,
          position: tp.finalPosition,
          totalParticipants: t.participants.length,
          date: t.updatedAt,
        });
        if (tp.finalPosition === 1) wins++;
        if (tp.finalPosition <= 3) top3++;
      }

      if (t.bracket) {
        const allMatches = [
          ...t.bracket.winnerBracket,
          ...t.bracket.loserBracket,
          ...(t.bracket.grandFinal ? [t.bracket.grandFinal] : []),
          ...(t.bracket.grandFinalReset ? [t.bracket.grandFinalReset] : []),
        ].filter((m) => m.status === 'completed');

        for (const m of allMatches) {
          if (m.winnerId === tp.id) matchWins++;
          if (m.loserId === tp.id) matchLosses++;
        }
      }
    }

    placements.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const totalMatches = matchWins + matchLosses;

    result.set(p.id, {
      tournamentsPlayed: joined.length,
      wins,
      top3,
      matchWins,
      matchLosses,
      winRate: totalMatches > 0 ? Math.round((matchWins / totalMatches) * 100) : 0,
      placements,
    });
  }

  return result;
}

// ── League stats ─────────────────────────────────────────────────────────

export interface LeagueStatsSummary {
  leagues: LeagueResultEntry[];
  totalMatches: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
}

export async function getParticipantLeagueStats(participantId: string): Promise<LeagueStatsSummary> {
  try {
    const res = await fetch(`${SERVER_URL}/api/participants/${participantId}/league-stats`);
    if (!res.ok) throw new Error('Failed to fetch league stats');
    return await res.json();
  } catch (err) {
    console.error('[ParticipantService] getParticipantLeagueStats error:', err);
    return { leagues: [], totalMatches: 0, totalWins: 0, totalLosses: 0, winRate: 0 };
  }
}

export async function getParticipantLeagueMatches(participantId: string): Promise<LeagueMatch[]> {
  try {
    const res = await fetch(`${SERVER_URL}/api/participants/${participantId}/league-matches`);
    if (!res.ok) throw new Error('Failed to fetch league matches');
    return await res.json();
  } catch (err) {
    console.error('[ParticipantService] getParticipantLeagueMatches error:', err);
    return [];
  }
}

// ── Multi-community membership ───────────────────────────────────────────

export interface MembershipRequest {
  id: string;
  /** User que entrará a la comunidad (al aceptar se le crea un participant nuevo allí). */
  userId: string;
  /** Participant desde el que se originó (perfil visible del user). */
  sourceParticipantId: string;
  communityId: string;
  direction: 'request' | 'invite';
  status: 'pending' | 'accepted' | 'declined';
  requestedBy: string;
  /** Nombre e identidad del solicitante en el momento de la petición. */
  applicantName: string;
  applicantAlias: string | null;
  reason: string | null;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface JoinRequestInput {
  name?: string;
  alias?: string;
  reason?: string;
}

/** El user autenticado pide entrar a una comunidad pública. */
export async function requestJoinCommunity(participantId: string, communityId: string, input?: JoinRequestInput): Promise<MembershipRequest> {
  const res = await fetch(`${SERVER_URL}/api/participants/${participantId}/join-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ communityId, ...input }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create join request');
  return data;
}

/** Info mínima de la cuenta vinculada a un participant (para saber si es invitable). */
export async function getParticipantAccountSummary(participantId: string): Promise<{ hasAccount: boolean; communityIds: string[] }> {
  const res = await fetch(`${SERVER_URL}/api/participants/${participantId}/account-summary`, {
    headers: getAuthHeader(),
  });
  if (!res.ok) return { hasAccount: false, communityIds: [] };
  return res.json();
}

/** superadmin / community_admin invita a un participant a su comunidad. */
export async function inviteToCommunity(participantId: string, communityId: string): Promise<MembershipRequest> {
  const res = await fetch(`${SERVER_URL}/api/participants/${participantId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ communityId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create invite');
  return data;
}

/** Solicitudes pendientes visibles para el user (admins ven requests; users ven sus invites). */
export async function getMembershipRequests(communityId?: string): Promise<MembershipRequest[]> {
  const query = communityId ? `?communityId=${encodeURIComponent(communityId)}` : '';
  const res = await fetch(`${SERVER_URL}/api/participants/membership-requests${query}`, {
    headers: getAuthHeader(),
  });
  if (!res.ok) return [];
  return res.json();
}

/** Resuelve una solicitud/invitación. */
export async function resolveMembershipRequest(requestId: string, action: 'accept' | 'decline'): Promise<MembershipRequest> {
  const res = await fetch(`${SERVER_URL}/api/participants/membership-requests/${requestId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ action }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to resolve request');
  return data.request;
}

/** Salir de una comunidad (self) o expulsar (admin de esa comunidad). */
export async function leaveCommunity(participantId: string, communityId: string): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/participants/${participantId}/communities/${communityId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to leave community');
  }
}
