/**
 * Duel Challenge System Types
 * 
 * Players can challenge each other to ranked duels with restrictions:
 * - Weekly challenge limits
 * - ELO restrictions (can't challenge players too far below)
 * - No repeat challenges in same week
 */

export interface DuelSettings {
  maxChallengesPerWeek: number; // 1-50, configurable
  eloRestriction: number; // Default: 300 (can't challenge 300+ ELO below you)
  challengeExpirationDays: number; // Default: 7 days to accept/complete
  weeklyResetDay: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  weeklyResetHour: number; // 0-23, default 0 (midnight)
  weeklyResetMinute: number; // 0-59, default 0
}

export const DEFAULT_DUEL_SETTINGS: DuelSettings = {
  maxChallengesPerWeek: 10,
  eloRestriction: 300,
  challengeExpirationDays: 7,
  weeklyResetDay: 1, // Monday
  weeklyResetHour: 0, // Midnight
  weeklyResetMinute: 0,
};

export type DuelChallengeStatus = 'pending' | 'accepted' | 'completed' | 'expired' | 'declined';

export interface DuelChallenge {
  id: string;
  challengerId: string;
  challengedId: string;
  
  status: DuelChallengeStatus;
  
  // Result (when completed)
  matchId?: string; // Links to RankedMatch
  
  // Dates
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  completedAt?: string;
  declinedAt?: string;
}

export interface DuelValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

export interface DuelStats {
  challengesThisWeek: number;
  maxChallengesPerWeek: number;
  pendingChallenges: number;
  completedThisWeek: number;
  totalDuels: number;
  duelWins: number;
  duelLosses: number;
  duelWinRate: number;
}
