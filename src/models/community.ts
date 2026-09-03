/**
 * Community model
 *
 * Top-level container for the ecosystem. Every participant, user,
 * tournament, league, duel and ranking belongs to a community.
 */

export interface Community {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  ownerAdminId: string;
  isPublic?: boolean;
  createdAt: string;
  updatedAt: string;
}
