import { Tournament, Participant, TournamentMode } from '@/models/types';
import { generateDoubleEliminationBracket } from '@/engine/generator/bracketGenerator';
import { assignSeeds, randomizeParticipants } from '@/engine/seeding/seeding';
import { recordMatchResult, revertMatchResult } from '@/engine/progression/matchProgression';
import { saveTournament, loadTournament, deleteTournament, loadTournaments } from '@/services/storage/localStorage';
import { MIN_PARTICIPANTS } from '@/constants/tournament';

/**
 * Create a new tournament
 */
export function createTournament(name: string, mode: TournamentMode): Tournament {
  const tournament: Tournament = {
    id: generateId(),
    name,
    mode,
    status: 'setup',
    participants: [],
    bracket: null,
    championId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveTournament(tournament);
  return tournament;
}

/**
 * Add a participant to a tournament
 */
export function addParticipant(
  tournamentId: string,
  name: string
): Tournament {
  const tournament = loadTournament(tournamentId);
  if (!tournament) {
    throw new Error('Tournament not found');
  }

  if (tournament.status !== 'setup') {
    throw new Error('Cannot add participants to a tournament in progress');
  }

  // Check for duplicate names
  if (tournament.participants.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    throw new Error('Participant name already exists');
  }

  const participant: Participant = {
    id: generateId(),
    name,
    seed: tournament.participants.length + 1,
    eliminated: false,
    lossCount: 0,
  };

  tournament.participants.push(participant);
  tournament.updatedAt = new Date().toISOString();
  
  saveTournament(tournament);
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
  if (!tournament) {
    throw new Error('Tournament not found');
  }

  if (tournament.status !== 'setup') {
    throw new Error('Cannot remove participants from a tournament in progress');
  }

  tournament.participants = tournament.participants.filter(p => p.id !== participantId);
  
  // Reassign seeds
  tournament.participants = assignSeeds(tournament.participants);
  tournament.updatedAt = new Date().toISOString();
  
  saveTournament(tournament);
  return tournament;
}

/**
 * Update participant name
 */
export function updateParticipantName(
  tournamentId: string,
  participantId: string,
  newName: string
): Tournament {
  const tournament = loadTournament(tournamentId);
  if (!tournament) {
    throw new Error('Tournament not found');
  }

  const participant = tournament.participants.find(p => p.id === participantId);
  if (!participant) {
    throw new Error('Participant not found');
  }

  // Check for duplicate names
  if (tournament.participants.some(
    p => p.id !== participantId && p.name.toLowerCase() === newName.toLowerCase()
  )) {
    throw new Error('Participant name already exists');
  }

  participant.name = newName;
  tournament.updatedAt = new Date().toISOString();
  
  saveTournament(tournament);
  return tournament;
}

/**
 * Randomize participant order
 */
export function shuffleParticipants(tournamentId: string): Tournament {
  const tournament = loadTournament(tournamentId);
  if (!tournament) {
    throw new Error('Tournament not found');
  }

  if (tournament.status !== 'setup') {
    throw new Error('Cannot shuffle participants in a tournament in progress');
  }

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
  if (!tournament) {
    throw new Error('Tournament not found');
  }

  if (tournament.status !== 'setup') {
    throw new Error('Tournament already started');
  }

  if (tournament.participants.length < MIN_PARTICIPANTS) {
    throw new Error(`Minimum ${MIN_PARTICIPANTS} participants required`);
  }

  // Ensure participants have seeds
  tournament.participants = assignSeeds(tournament.participants);

  // Generate bracket based on mode
  if (tournament.mode === 'double_elimination') {
    tournament.bracket = generateDoubleEliminationBracket(tournament.participants);
  } else {
    throw new Error('Single elimination not yet implemented');
  }

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
  if (!tournament) {
    throw new Error('Tournament not found');
  }

  if (tournament.status !== 'in_progress') {
    throw new Error('Tournament is not in progress');
  }

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
  if (!tournament) {
    throw new Error('Tournament not found');
  }

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
