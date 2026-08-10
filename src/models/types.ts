// Core data models for the tournament system

export type TournamentStatus = 'setup' | 'in_progress' | 'completed';
export type TournamentMode = 'single_elimination' | 'double_elimination';
export type BracketType = 'winner' | 'loser' | 'grand_final';
export type MatchStatus = 'pending' | 'in_progress' | 'completed';

export interface Participant {
  id: string;
  name: string;
  seed: number;
  eliminated: boolean;
  finalPosition?: number;
  lossCount: number; // Track number of losses (0, 1, or 2 for double elimination)
}

export interface Match {
  id: string;
  roundNumber: number;
  matchNumber: number;
  bracketType: BracketType;
  participant1Id: string | null; // null means BYE or TBD
  participant2Id: string | null;
  winnerId: string | null;
  loserId: string | null;
  status: MatchStatus;
  nextWinnerMatchId: string | null; // Where winner advances
  nextLoserMatchId: string | null; // Where loser goes (only in winner bracket)
}

export interface Bracket {
  winnerBracket: Match[];
  loserBracket: Match[];
  grandFinal: Match | null;
  grandFinalReset: Match | null; // If loser bracket winner wins first grand final
}

export interface Tournament {
  id: string;
  name: string;
  mode: TournamentMode;
  status: TournamentStatus;
  participants: Participant[];
  bracket: Bracket | null;
  championId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TournamentHistory {
  currentState: Tournament;
  previousState: Tournament | null; // For undo functionality
}

// ── Global Participant ─────────────────────────────────────────────────
// A participant that exists independently of any tournament.
// Can be reused across multiple tournaments.

export interface GlobalParticipantStats {
  tournamentsPlayed: number;
  wins: number;        // Tournament wins (1st place)
  matchWins: number;
  matchLosses: number;
}

export interface GlobalParticipant {
  id: string;
  name: string;
  alias: string;       // Optional gamertag / short name
  avatarUrl: string | null;
  stats: GlobalParticipantStats;
  createdAt: string;
  updatedAt: string;
}
