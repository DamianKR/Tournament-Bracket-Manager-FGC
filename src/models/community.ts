/**
 * Community model
 *
 * Top-level container for the ecosystem. Every participant, user,
 * tournament, league, duel and ranking belongs to a community.
 */

/** Feature modules a community admin can toggle. Absent/false = check `!== false`. */
export interface CommunityFeatures {
  tournaments?: boolean;
  leagues?: boolean;
  duels?: boolean;
  matchmaking?: boolean;
}

export interface Community {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  ownerAdminId: string;
  isPublic?: boolean;
  /** Feature toggles — ausente = habilitado (back-compat). */
  features?: CommunityFeatures;
  /** Juegos habilitados en la comunidad — vacío/ausente = todos. */
  gameIds?: string[];
  createdAt: string;
  updatedAt: string;
}
