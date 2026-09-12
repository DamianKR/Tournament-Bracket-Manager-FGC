/**
 * Ranked Match System Types
 * 
 * Handles competitive matches outside of tournaments/leagues:
 * - Duels: Player-initiated challenges with restrictions
 * - Matchmaking: Automated pairing (future)
 */

export type RankedMatchType = 'duel' | 'matchmaking';

export interface MatchGame {
  gameNumber: number;
  winnerId: string;
  player1Character?: string;
  player2Character?: string;
}

export interface RankedMatch {
  id: string;
  type: RankedMatchType;
  gameId: string; // Game this match was played in
  
  // Players
  player1Id: string;
  player2Id: string;
  winnerId: string;
  
  // Score
  score: string; // "2-1", "3-0", etc.
  player1Score?: number; // Individual scores
  player2Score?: number;
  
  // Characters used
  player1Characters?: string[]; // Array of character IDs
  player2Characters?: string[];

  // Game log
  games?: MatchGame[];
  
  // ELO changes
  player1EloBefore: number;
  player2EloBefore: number;
  player1EloAfter: number;
  player2EloAfter: number;
  player1EloChange: number;
  player2EloChange: number;
  
  // Context
  duelChallengeId?: string; // Links to DuelChallenge if type is 'duel'
  communityId?: string;       // Community this ranked match belongs to

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
  gameId: string;
  duelChallengeId?: string;
  notes?: string;
}
