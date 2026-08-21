/**
 * Ranked Match System Types
 * 
 * Handles competitive matches outside of tournaments/leagues:
 * - Duels: Player-initiated challenges with restrictions
 * - Matchmaking: Automated pairing (future)
 */

export type RankedMatchType = 'duel' | 'matchmaking';

export interface RankedMatch {
  id: string;
  type: RankedMatchType;
  
  // Players
  player1Id: string;
  player2Id: string;
  winnerId: string;
  
  // Score
  score: string; // "2-1", "3-0", etc.
  
  // ELO changes
  player1EloBefore: number;
  player2EloBefore: number;
  player1EloAfter: number;
  player2EloAfter: number;
  player1EloChange: number;
  player2EloChange: number;
  
  // Context
  duelChallengeId?: string; // Links to DuelChallenge if type is 'duel'
  
  // Metadata
  date: string;
  notes?: string;
  recordedBy?: string; // Admin/TO who recorded the match
}

export interface RankedMatchResult {
  player1Id: string;
  player2Id: string;
  winnerId: string;
  score: string;
  type: RankedMatchType;
  duelChallengeId?: string;
  notes?: string;
}
