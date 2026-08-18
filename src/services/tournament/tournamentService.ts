import { Tournament, Participant, TournamentMode, TournamentType, TeamSize } from '@/models/types';
import { generateBracket } from '@/engine/generator/bracketGenerator';
import { assignSeeds, randomizeParticipants } from '@/engine/seeding/seeding';
import { recordMatchResult, revertMatchResult } from '@/engine/progression/matchProgression';
import { saveTournament, loadTournament, deleteTournament, loadTournaments, linkParticipantToTournament } from '@/services/storage/localStorage';
import { findOrCreateParticipant } from '@/services/participants/participantService';
import { MIN_PARTICIPANTS } from '@/constants/tournament';

/**
 * Create a new tournament
 */
export function createTournament(
  name: string, 
  mode: TournamentMode, 
  type: TournamentType = 'singles',
  teamSize?: TeamSize
): Tournament {
  const tournament: Tournament = {
    id: generateId(),
    name,
    mode,
    type,
    status: 'setup',
    gameId: null,
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

  saveTournament(tournament);
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

  saveTournament(tournament);

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

  saveTournament(tournament);

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
 * Start the tournament and generate bracket
 */
export function startTournament(tournamentId: string): Tournament {
  const tournament = loadTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'setup') throw new Error('Tournament already started');
  if (tournament.participants.length < MIN_PARTICIPANTS) {
    throw new Error(`Minimum ${MIN_PARTICIPANTS} participants required`);
  }

  tournament.participants = assignSeeds(tournament.participants);

  // Generate bracket based on tournament mode
  tournament.bracket = generateBracket(tournament.participants, tournament.mode);

  tournament.status = 'in_progress';
  tournament.updatedAt = new Date().toISOString();

  saveTournament(tournament);
  return tournament;
}

/**
 * Record a match result
 */
export function setMatchWinner(
  tournamentId: string,
  matchId: string,
  winnerId: string
): Tournament {
  const tournament = loadTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');
  if (tournament.status !== 'in_progress') throw new Error('Tournament is not in progress');

  const updatedTournament = recordMatchResult(tournament, matchId, winnerId);
  saveTournament(updatedTournament);
  return updatedTournament;
}

/**
 * Revert a match result
 */
export function undoMatchResult(
  tournamentId: string,
  matchId: string
): Tournament {
  const tournament = loadTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  const updatedTournament = revertMatchResult(tournament, matchId);
  saveTournament(updatedTournament);
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
