// Tournament-related constants

export const MIN_PARTICIPANTS = 4;
export const MAX_PARTICIPANTS = 256; // Reasonable limit

export const STORAGE_KEYS = {
  TOURNAMENTS: 'bracket_tournaments',
  ACTIVE_TOURNAMENT: 'bracket_active_tournament',
} as const;

export const TOURNAMENT_MODES = {
  SINGLE_ELIMINATION: 'single_elimination',
  DOUBLE_ELIMINATION: 'double_elimination',
} as const;

export const BRACKET_TYPES = {
  WINNER: 'winner',
  LOSER: 'loser',
  GRAND_FINAL: 'grand_final',
} as const;

export const MATCH_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;

export const TOURNAMENT_STATUS = {
  SETUP: 'setup',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;
