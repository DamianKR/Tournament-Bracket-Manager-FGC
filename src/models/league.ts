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
  communityId: string; // Community this league belongs to
  
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
  timeZone: string; // Timezone for all league dates, e.g. "America/Havana"
  
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
  status: 'scheduled' | 'reported' | 'completed' | 'no_show' | 'pending_review';
  
  // Reportes (consenso: cada jugador reporta, necesitan coincidir o interviene admin)
  reportedResults?: LeagueMatchReport[];

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
  deadline?: string; // End of grace period, used for expirations and notifications
}

export interface LeagueMatchReport {
  participantId: string;
  winnerId: string;
  score: string;
  isNoShow: boolean;
  noShowParticipantId?: string;
  evidence?: string;
  reportedAt: string;
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
