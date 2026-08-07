import { Tournament } from '@/models/types';
import { STORAGE_KEYS } from '@/constants/tournament';

/**
 * Save all tournaments to localStorage
 */
export function saveTournaments(tournaments: Tournament[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TOURNAMENTS, JSON.stringify(tournaments));
  } catch (error) {
    console.error('Failed to save tournaments:', error);
    throw new Error('Failed to save tournaments to storage');
  }
}

/**
 * Load all tournaments from localStorage
 */
export function loadTournaments(): Tournament[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.TOURNAMENTS);
    if (!data) return [];
    
    return JSON.parse(data) as Tournament[];
  } catch (error) {
    console.error('Failed to load tournaments:', error);
    return [];
  }
}

/**
 * Save a single tournament (update or create)
 */
export function saveTournament(tournament: Tournament): void {
  const tournaments = loadTournaments();
  const index = tournaments.findIndex(t => t.id === tournament.id);
  
  if (index >= 0) {
    tournaments[index] = tournament;
  } else {
    tournaments.push(tournament);
  }
  
  saveTournaments(tournaments);
}

/**
 * Load a single tournament by ID
 */
export function loadTournament(id: string): Tournament | null {
  const tournaments = loadTournaments();
  return tournaments.find(t => t.id === id) || null;
}

/**
 * Delete a tournament by ID
 */
export function deleteTournament(id: string): void {
  const tournaments = loadTournaments();
  const filtered = tournaments.filter(t => t.id !== id);
  saveTournaments(filtered);
}

/**
 * Clear all tournaments
 */
export function clearAllTournaments(): void {
  localStorage.removeItem(STORAGE_KEYS.TOURNAMENTS);
}

/**
 * Get tournament count
 */
export function getTournamentCount(): number {
  return loadTournaments().length;
}

/**
 * Check if a tournament exists
 */
export function tournamentExists(id: string): boolean {
  return loadTournament(id) !== null;
}
