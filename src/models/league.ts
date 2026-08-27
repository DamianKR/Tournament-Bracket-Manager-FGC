/**
 * League System Types
 * 
 * Leagues use the existing ranking engine for ELO calculations.
 * Each league match is processed through POST /api/ranking/match.
 */

export interface League {
  id: string;
  name: string;
  gameId: string;
  
  // Participantes
  participantIds: string[]; // GlobalParticipant IDs
  bannedParticipantIds: string[]; // Jugadores baneados por no-shows
  
  // Formato
  roundsPerOpponent: 1 | 2 | 3;
  gamesPerMatch: 3 | 5 | 7 | 9;
  
  // Calendario
  matchesPerPlayerPerPeriod: number;
  periodDays: 7 | 14;
  startDate: string;
  weekStartDates: Record<number, string>; // { 1: "2026-09-01", 2: "2026-09-08", ... }
  
  // No-shows y tiempo de gracia
  maxNoShowsBeforeKick: number;
  gracePeriodDays: number; // Default: 30 días antes de marcar como pending_review
  
  // Playoffs
  playoffsEnabled: boolean;
  playoffsEloMultiplier: number;
  
  // Estado
  status: 'draft' | 'active' | 'completed';
  currentWeek: number;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
}

export interface LeagueMatch {
  id: string;
  leagueId: string;
  
  // Jornada
  round: number;
  week: number;
  
  // Participantes
  participant1Id: string;
  participant2Id: string;
  
  // Estado
  status: 'scheduled' | 'completed' | 'no_show' | 'pending_review';
  
  // Resultado
  winnerId?: string;
  score?: string; // "2-1", "2-0", etc.
  noShowParticipantId?: string;
  
  // ELO changes (copiados del ranking engine después de procesar)
  participant1EloChange?: number;
  participant2EloChange?: number;
  
  // Fechas
  scheduledDate?: string;
  completedDate?: string;
}

export interface LeagueStanding {
  participantId: string;
  rank: number;
  
  matchesPlayed: number;
  wins: number;
  losses: number;
  noShows: number;
  
  currentElo: number;
  eloChange: number; // Cambio total desde el inicio de la liga
  
  // Para desempate
  headToHead: Record<string, 'W' | 'L'>; // vs otros participantes
}

export interface LeagueStats {
  totalMatches: number;
  completedMatches: number;
  pendingMatches: number;
  noShowMatches: number;
  
  estimatedWeeks: number;
  estimatedEndDate: string;
}
