import { Tournament, Participant, TournamentMode, TournamentType, TeamSize, SeedingMode, PartialSeedCount } from '@/models/types';
import { generateBracket } from '@/engine/generator/bracketGenerator';
import { assignSeeds, randomizeParticipants } from '@/engine/seeding/seeding';
import { recordMatchResult, revertMatchResult, findMatch } from '@/engine/progression/matchProgression';
import { saveTournament, saveTournamentAsync, loadTournament, deleteTournament, loadTournaments, linkParticipantToTournament } from '@/services/storage/localStorage';
import { findOrCreateParticipant } from '@/services/participants/participantService';
import { getAuthHeader } from '@/services/auth/authService';
import { MIN_PARTICIPANTS } from '@/constants/tournament';
import { SERVER_URL, isServerAvailable, resetServerCache } from '@/services/api/apiClient';

const TM_LS_KEY = 'bracket_tournament_matches';

/**
 * Create a new tournament
 */
export async function createTournament(
  name: string,
  mode: TournamentMode,
  type: TournamentType = 'singles',
  teamSize?: TeamSize,
  seedingMode?: SeedingMode,
  partialSeedCount?: PartialSeedCount,
  givesPoints: boolean = true
): Promise<Tournament> {
  const tournament: Tournament = {
    id: generateId(),
    name,
    mode,
    type,
    status: 'setup',
    gameId: null,
    givesPoints,
    seedingMode: seedingMode || 'none',
    participants: [],
    bracket: null,
    championId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Only add teamSize for team tournaments
  if (type === 'teams' && teamSize) {
    tournament.teamSize = teamSize;
  }

  if (seedingMode === 'partial' && partialSeedCount) {
    tournament.partialSeedCount = partialSeedCount;
  }

  await saveTournamentAsync(tournament);
  return tournament;
}

/**
 * Add a participant to a tournament.
 * Automatically creates (or links) a GlobalParticipant for the given name.
 * Returns the updated tournament synchronously from cache; the global
 * participant upsert happens in the background.
 */
export async function addParticipant(
  tournamentId: string,
  name: string
): Promise<Tournament> {
  const tournament = loadTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'setup') throw new Error('Cannot add participants to a tournament in progress');

  const trimmed = name.trim();

  // Duplicate check within this tournament
  if (tournament.participants.some((p: Participant) => p.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('Participant name already exists in this tournament');
  }

  // Find existing GlobalParticipant or create a new one
  const global = await findOrCreateParticipant(trimmed);

  // Check if this GlobalParticipant is already in the tournament
  if (tournament.participants.some((p: Participant) => p.globalParticipantId === global.id)) {
    throw new Error('Participant name already exists in this tournament');
  }

  const participant: Participant = {
    id: generateId(),
    name: global.name,
    alias: global.alias?.trim() || undefined, // copy gamertag for bracket display
    seed: tournament.participants.length + 1,
    eliminated: false,
    lossCount: 0,
    globalParticipantId: global.id, // Links to GlobalParticipant for singles tournaments
  };

  tournament.participants.push(participant);
  tournament.updatedAt = new Date().toISOString();

  await saveTournamentAsync(tournament);

  // Bidirectional link: GlobalParticipant knows about this tournament
  await linkParticipantToTournament(global.id, tournament.id);

  return tournament;
}

/**
 * Add a team to a tournament.
 * Creates a team participant with multiple members.
 */
export async function addTeam(
  tournamentId: string,
  teamName: string,
  memberNames: string[]
): Promise<Tournament> {
  const tournament = loadTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'setup') throw new Error('Cannot add teams to a tournament in progress');
  if (tournament.type !== 'teams') throw new Error('Can only add teams to team tournaments');

  const trimmedTeamName = teamName.trim();
  
  // Duplicate check
  if (tournament.participants.some((p: Participant) => p.name.toLowerCase() === trimmedTeamName.toLowerCase())) {
    throw new Error('Team name already exists in this tournament');
  }

  // Validate team size
  if (tournament.teamSize && memberNames.length !== tournament.teamSize) {
    throw new Error(`Team must have exactly ${tournament.teamSize} members`);
  }

  // Find or create GlobalParticipants for each member (sequential to avoid
  // concurrent JSON writes)
  const members = [];
  for (const name of memberNames) {
    const global = await findOrCreateParticipant(name.trim());
    members.push({
      globalParticipantId: global.id,
      name: global.name,
      alias: global.alias?.trim() || undefined,
    });
  }

  const participant: Participant = {
    id: generateId(),
    name: trimmedTeamName,
    seed: tournament.participants.length + 1,
    eliminated: false,
    lossCount: 0,
    members,
  };

  tournament.participants.push(participant);
  tournament.updatedAt = new Date().toISOString();

  await saveTournamentAsync(tournament);

  // Link all team members to this tournament
  for (const member of members) {
    if (member.globalParticipantId) {
      await linkParticipantToTournament(member.globalParticipantId, tournament.id);
    }
  }

  return tournament;
}

/**
 * Remove a participant from a tournament
 */
export function removeParticipant(
  tournamentId: string,
  participantId: string
): Tournament {
  const tournament = loadTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'setup') throw new Error('Cannot remove participants from a tournament in progress');

  tournament.participants = tournament.participants.filter((p: Participant) => p.id !== participantId);
  tournament.participants = assignSeeds(tournament.participants);
  tournament.updatedAt = new Date().toISOString();

  saveTournament(tournament);
  return tournament;
}

/**
 * Update participant name in tournament (does NOT rename the GlobalParticipant)
 */
export function updateParticipantName(
  tournamentId: string,
  participantId: string,
  newName: string
): Tournament {
  const tournament = loadTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  const participant = tournament.participants.find((p: Participant) => p.id === participantId);
  if (!participant) throw new Error('Participant not found');

  if (tournament.participants.some(
    (p: Participant) => p.id !== participantId && p.name.toLowerCase() === newName.toLowerCase()
  )) {
    throw new Error('Participant name already exists');
  }

  participant.name = newName;
  tournament.updatedAt = new Date().toISOString();

  saveTournament(tournament);
  return tournament;
}

/**
 * Move a participant up or down in the list
 */
export function moveParticipant(
  tournamentId: string,
  participantId: string,
  direction: 'up' | 'down'
): Tournament {
  const tournament = loadTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'setup') throw new Error('Cannot reorder participants in a tournament in progress');

  const index = tournament.participants.findIndex(p => p.id === participantId);
  if (index === -1) throw new Error('Participant not found');

  const newIndex = direction === 'up' ? index - 1 : index + 1;
  if (newIndex < 0 || newIndex >= tournament.participants.length) return tournament;

  const temp = tournament.participants[index];
  tournament.participants[index] = tournament.participants[newIndex];
  tournament.participants[newIndex] = temp;

  tournament.participants = assignSeeds(tournament.participants);
  tournament.updatedAt = new Date().toISOString();

  saveTournament(tournament);
  return tournament;
}

/**
 * Randomize participant order
 */
export function shuffleParticipants(tournamentId: string): Tournament {
  const tournament = loadTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'setup') throw new Error('Cannot shuffle participants in a tournament in progress');

  tournament.participants = randomizeParticipants(tournament.participants);
  tournament.updatedAt = new Date().toISOString();

  saveTournament(tournament);
  return tournament;
}

/**
 * Update tournament participants order (for seeding preview)
 */
export function updateTournamentParticipants(
  tournamentId: string,
  participants: Participant[],
  bracketSeeded = false
): Tournament {
  const tournament = loadTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'setup') throw new Error('Cannot update participants in a tournament in progress');

  tournament.participants = participants;
  tournament.bracketSeeded = bracketSeeded;
  tournament.updatedAt = new Date().toISOString();

  saveTournament(tournament);
  return tournament;
}

/**
 * Start the tournament and generate bracket
 */
export async function startTournament(tournamentId: string): Promise<Tournament> {
  const tournament = loadTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'setup') throw new Error('Tournament already started');
  if (tournament.participants.length < MIN_PARTICIPANTS) {
    throw new Error(`Minimum ${MIN_PARTICIPANTS} participants required`);
  }

  // Only assign seeds if bracket seeding was not already applied
  if (!tournament.bracketSeeded) {
    tournament.participants = assignSeeds(tournament.participants);
  }

  // Generate bracket based on tournament mode
  tournament.bracket = generateBracket(tournament.participants, tournament.mode);

  tournament.status = 'in_progress';
  tournament.updatedAt = new Date().toISOString();

  await saveTournamentAsync(tournament);
  return tournament;
}

/**
 * Record a match result
 */
export async function setMatchWinner(
  tournamentId: string,
  matchId: string,
  winnerId: string
): Promise<Tournament> {
  const tournament = loadTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'in_progress') throw new Error('Tournament is not in progress');

  const updatedTournament = recordMatchResult(tournament, matchId, winnerId);

  // Save tournament match record for history (singles only, no ELO)
  // type is undefined for old tournaments — treat anything that is not 'teams' as singles.
  if (updatedTournament.type !== 'teams' && updatedTournament.bracket) {
    const match = findMatch(updatedTournament.bracket, matchId);
    if (match && match.participant1Id && match.participant2Id) {
      const p1 = updatedTournament.participants.find(p => p.id === match.participant1Id);
      const p2 = updatedTournament.participants.find(p => p.id === match.participant2Id);
      
      const matchRecord = {
        id: `tm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        tournamentId,
        tournamentName: updatedTournament.name,
        player1Id: match.participant1Id,
        player2Id: match.participant2Id,
        player1GlobalId: p1?.globalParticipantId ?? null,
        player2GlobalId: p2?.globalParticipantId ?? null,
        player1Name: p1?.name ?? 'Unknown',
        player2Name: p2?.name ?? 'Unknown',
        winnerId,
        winnerGlobalId: winnerId === match.participant1Id ? (p1?.globalParticipantId ?? null) : (p2?.globalParticipantId ?? null),
        round: match.roundNumber,
        matchNumber: match.matchNumber,
        createdAt: new Date().toISOString(),
      };

      // Update localStorage cache
      const lsKey = 'bracket_tournament_matches';
      try {
        const raw = localStorage.getItem(lsKey);
        const all: any[] = raw ? JSON.parse(raw) : [];
        all.push(matchRecord);
        localStorage.setItem(lsKey, JSON.stringify(all));
      } catch (err) {
        console.warn('[Tournament] Failed to cache match:', err);
      }

      // Sync to server
      try {
        const res = await fetch(`${SERVER_URL}/api/tournaments/${tournamentId}/matches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify(matchRecord),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          console.warn('[Tournament] Failed to sync match to server:', res.status, body);
        }
      } catch (err) {
        console.warn('[Tournament] Failed to sync match to server:', err);
      }
    }
  }

  await saveTournamentAsync(updatedTournament);
  return updatedTournament;
}

/**
 * Revert a match result
 */
export async function undoMatchResult(
  tournamentId: string,
  matchId: string
): Promise<Tournament> {
  const tournament = loadTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  const updatedTournament = revertMatchResult(tournament, matchId);
  await saveTournamentAsync(updatedTournament);
  return updatedTournament;
}

/**
 * Get all tournaments
 */
export function getAllTournaments(): Tournament[] {
  return loadTournaments();
}

/**
 * Get a single tournament
 */
export function getTournament(id: string): Tournament | null {
  return loadTournament(id);
}

/**
 * Delete a tournament
 */
export function removeTournament(id: string): void {
  deleteTournament(id);
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ── Tournament Match Records (for History) ────────────────────────────────

export interface TournamentMatchRecord {
  id: string;
  tournamentId: string;
  tournamentName: string;
  player1Id: string;
  player2Id: string;
  player1GlobalId: string | null;
  player2GlobalId: string | null;
  player1Name: string;
  player2Name: string;
  winnerId: string;
  winnerGlobalId: string | null;
  round: number;
  matchNumber: number;
  createdAt: string;
}

export function getAllTournamentMatches(): TournamentMatchRecord[] {
  try {
    const raw = localStorage.getItem(TM_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function getAllTournamentMatchesAsync(): Promise<TournamentMatchRecord[]> {
  if (await isServerAvailable()) {
    try {
      const res = await fetch(`${SERVER_URL}/api/tournaments/matches`);
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0 || getAllTournamentMatches().length === 0) {
          localStorage.setItem(TM_LS_KEY, JSON.stringify(data));
        }
        return data.length > 0 ? data : getAllTournamentMatches();
      }
    } catch (err) {
      console.warn('[TournamentMatches] Server read failed:', err);
      resetServerCache();
    }
  }
  return getAllTournamentMatches();
}

export function getTournamentMatchesForTournament(tournamentId: string): TournamentMatchRecord[] {
  return getAllTournamentMatches().filter(m => m.tournamentId === tournamentId);
}

export function getTournamentMatchesForPlayer(playerId: string): TournamentMatchRecord[] {
  return getAllTournamentMatches().filter(m =>
    m.player1GlobalId === playerId || m.player2GlobalId === playerId
  );
}
