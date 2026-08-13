// Core data models for the tournament system

export type TournamentStatus = 'setup' | 'in_progress' | 'completed';
export type TournamentMode = 'single_elimination' | 'double_elimination';
export type BracketType = 'winner' | 'loser' | 'grand_final';
export type MatchStatus = 'pending' | 'in_progress' | 'completed';

export interface Participant {
  id: string;
  name: string;
  alias?: string;    // Gamertag shown in bracket instead of full name
  seed: number;
  eliminated: boolean;
  finalPosition?: number;
  lossCount: number; // Track number of losses (0, 1, or 2 for double elimination)
  globalParticipantId?: string; // Links to a GlobalParticipant if added from the global list
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
// Stats are computed at runtime by reading tournaments — never stored.

export interface GlobalParticipant {
  id: string;
  name: string;
  alias: string;            // Optional gamertag / short name
  avatarUrl: string | null;
  tournamentIds: string[];  // FK references — all tournaments this player joined
  gameId: string | null;    // e.g. 'ssbu' — which game this player competes in
  mainCharacterId: string | null; // e.g. 'kirby' — their main character
  // ELO Ranking
  eloPoints: number;        // Current ELO score (default 1500)
  eloRank: string;          // Rank name derived from eloPoints
  createdAt: string;
  updatedAt: string;
}

// ── ELO / Ranking ──────────────────────────────────────────────────────────

export type EloRankName =
  | 'Plata'
  | 'Oro'
  | 'Platino'
  | 'Diamante'
  | 'Vanquisher'
  | 'Master'
  | 'Ultimate'
  | 'Legend';

export interface RankTier {
  name: EloRankName;
  minPoints: number;
  maxPoints: number | null; // null = no upper limit
  color: string;            // CSS color for UI
}

export interface MatchRecord {
  id: string;
  playerAId: string;
  playerBId: string;
  winnerId: string;
  loserId: string;
  playerAPointsBefore: number;
  playerBPointsBefore: number;
  playerAPointsAfter: number;
  playerBPointsAfter: number;
  playerARankBefore: string;
  playerBRankBefore: string;
  playerARankAfter: string;
  playerBRankAfter: string;
  createdAt: string;
}

// Computed at runtime from tournaments — not persisted
export interface ComputedStats {
  tournamentsPlayed: number;
  wins: number;            // 1st place finishes
  top3: number;            // top 3 finishes
  matchWins: number;
  matchLosses: number;
  winRate: number;         // 0-100
  placements: PlacementEntry[];
}

export interface PlacementEntry {
  tournamentId: string;
  tournamentName: string;
  position: number;        // 1 = champion
  totalParticipants: number;
  date: string;            // tournament updatedAt
}
