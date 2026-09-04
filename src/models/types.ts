// Core data models for the tournament system

// Re-export league types
export type { League, LeagueMatch, LeagueStanding, LeagueStats } from './league';

// Re-export ranked match types
export type { RankedMatch, RankedMatchType, RankedMatchResult } from './rankedMatch';

// Re-export duel types
export type { 
  DuelChallenge, 
  DuelChallengeStatus,
  DuelType,
  DuelSettings, 
  DuelValidationResult,
  DuelStats 
} from './duel';
export { DEFAULT_DUEL_SETTINGS } from './duel';

export type TournamentStatus = 'setup' | 'in_progress' | 'completed';
export type TournamentMode = 'single_elimination' | 'double_elimination';
export type TournamentType = 'singles' | 'teams';
export type BracketType = 'winner' | 'loser' | 'grand_final';
export type MatchStatus = 'pending' | 'in_progress' | 'completed';
export type TeamSize = 1 | 2 | 3 | 4 | 5;
export type SeedingMode = 'none' | 'full' | 'partial';
export type PartialSeedCount = 4 | 8 | 16;

// Representa un jugador individual dentro de un equipo
export interface TeamMember {
  globalParticipantId?: string; // Links to a GlobalParticipant if added from the global list
  name: string;
  alias?: string;    // Gamertag shown in bracket instead of full name
}

// Participante puede ser individual (singles) o equipo (teams)
export interface Participant {
  id: string;
  name: string;      // Player name for singles, Team name for teams
  alias?: string;    // Player alias for singles, Team tag for teams
  seed: number;
  eliminated: boolean;
  finalPosition?: number;
  lossCount: number; // Track number of losses (0, 1, or 2 for double elimination)
  
  // For singles tournaments: links to GlobalParticipant
  globalParticipantId?: string;
  
  // For team tournaments: array of team members
  members?: TeamMember[];
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
  mode: TournamentMode;        // single_elimination | double_elimination
  type: TournamentType;         // singles | teams
  status: TournamentStatus;
  gameId?: string | null;
  teamSize?: TeamSize;          // Only for team tournaments: 2, 3, 4, or 5
  seedingMode?: SeedingMode;    // How participants were seeded
  partialSeedCount?: PartialSeedCount; // If seedingMode is 'partial', how many top seeds
  bracketSeeded?: boolean;      // True if applyBracketSeeding was applied (participants in bracket order)
  givesPoints?: boolean;        // Whether this tournament awards ranking/ELO points on completion
  participants: Participant[];
  bracket: Bracket | null;
  championId: string | null;
  communityId: string;          // Community this tournament belongs to
  createdAt: string;
  updatedAt: string;
}

export interface TournamentHistory {
  currentState: Tournament;
  previousState: Tournament | null; // For undo functionality
}

// ── Per-game profile ─────────────────────────────────────────────────────
// A participant can compete in multiple games, each with its own ELO and main.

export interface ParticipantGameProfile {
  gameId: string;
  mainCharacterId: string | null;
  eloPoints: number | null; // null = unranked/no points yet in this game
  eloRank: string;          // Rank name derived from eloPoints in this game
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
  // Primary/default game & character for display (must match an entry in `games`)
  gameId: string | null;    // e.g. 'ssbu' — primary game this player competes in
  mainCharacterId: string | null; // e.g. 'kirby' — main character in primary game
  // Per-game profiles: ELO and main character for every game the player touches
  games: Record<string, ParticipantGameProfile>;
  phoneNumber?: string;           // Optional contact number shown on profile
  communityId: string;            // Community this participant belongs to
  createdAt: string;
  updatedAt: string;
}

// ── ELO / Ranking ──────────────────────────────────────────────────────────

export type EloRankName =
  | 'Sin puntos'
  | 'Bronce'
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
  type: 'duel' | 'matchmaking' | 'free';
  gameId: string;           // Game this match was played in
  playerAPointsBefore: number;
  playerBPointsBefore: number;
  playerAPointsAfter: number;
  playerBPointsAfter: number;
  playerADelta: number;
  playerBDelta: number;
  playerARankBefore: string;
  playerBRankBefore: string;
  playerARankAfter: string;
  playerBRankAfter: string;
  communityId?: string;
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

export interface LeagueResultEntry {
  leagueId: string;
  leagueName: string;
  status: string;
  rank: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  noShows: number;
  eloChange: number;
  gamesPerMatch: number;
  date: string;
}
