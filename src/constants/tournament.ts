// Tournament-related constants

export const MIN_PARTICIPANTS = 4;
export const MAX_PARTICIPANTS = 256; // Reasonable limit

export const STORAGE_KEYS = {
  TOURNAMENTS: 'bracket_tournaments',
  ACTIVE_TOURNAMENT: 'bracket_active_tournament',
  PARTICIPANTS: 'bracket_global_participants',
  // Outbox: ids with local changes not yet confirmed by the server, and
  // tombstones for records deleted locally while offline.
  PENDING_TOURNAMENTS: 'bracket_pending_tournaments',
  DELETED_TOURNAMENTS: 'bracket_deleted_tournaments',
  PENDING_PARTICIPANTS: 'bracket_pending_participants',
  DELETED_PARTICIPANTS: 'bracket_deleted_participants',
  // Sync baselines (server updatedAt as last confirmed) and detected
  // conflicts waiting for the user to choose local-vs-server.
  SYNCED_TOURNAMENTS: 'bracket_synced_tournaments',
  SYNCED_PARTICIPANTS: 'bracket_synced_participants',
  SYNC_CONFLICTS: 'bracket_sync_conflicts',
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
