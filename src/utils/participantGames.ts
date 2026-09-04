import type { GlobalParticipant, ParticipantGameProfile } from '@/models/types';
import { getRankName } from './rank';

export function getPrimaryGameId(p: GlobalParticipant): string | null {
  return p.gameId;
}

export function getPrimaryCharacterId(p: GlobalParticipant): string | null {
  return p.mainCharacterId;
}

export function getGameProfile(
  p: GlobalParticipant,
  gameId?: string | null
): ParticipantGameProfile | null {
  const target = gameId ?? p.gameId;
  if (!target) return null;
  if (p.games?.[target]) return p.games[target];
  // Legacy single-game fallback
  const legacy = p as any;
  if (p.gameId === target && (legacy.eloPoints !== undefined || legacy.eloRank !== undefined)) {
    return {
      gameId: target,
      mainCharacterId: p.mainCharacterId ?? null,
      eloPoints: legacy.eloPoints ?? null,
      eloRank: legacy.eloRank ?? getRankName(legacy.eloPoints),
    };
  }
  return null;
}

export function getParticipantElo(
  p: GlobalParticipant,
  gameId?: string | null
): number | null {
  return getGameProfile(p, gameId)?.eloPoints ?? null;
}

export function getParticipantRank(
  p: GlobalParticipant,
  gameId?: string | null
): string {
  return getGameProfile(p, gameId)?.eloRank ?? 'Sin puntos';
}

export function getEffectiveElo(
  p: GlobalParticipant,
  gameId?: string | null
): number {
  return getParticipantElo(p, gameId) ?? 1500;
}

export function ensureGameProfile(
  p: GlobalParticipant,
  gameId: string
): ParticipantGameProfile {
  if (!p.games) p.games = {};
  if (!p.games[gameId]) {
    p.games[gameId] = {
      gameId,
      mainCharacterId: null,
      eloPoints: null,
      eloRank: 'Sin puntos',
    };
  }
  return p.games[gameId];
}

export function setParticipantGameElo(
  p: GlobalParticipant,
  gameId: string,
  eloPoints: number | null,
  eloRank?: string
): void {
  const profile = ensureGameProfile(p, gameId);
  profile.eloPoints = eloPoints;
  profile.eloRank = eloRank ?? getRankName(eloPoints);
  p.updatedAt = new Date().toISOString();
}

export function setParticipantPrimaryGame(
  p: GlobalParticipant,
  gameId: string | null,
  mainCharacterId?: string | null
): void {
  p.gameId = gameId;
  if (gameId !== undefined) p.mainCharacterId = mainCharacterId ?? null;
  if (gameId && mainCharacterId !== undefined) {
    const profile = ensureGameProfile(p, gameId);
    profile.mainCharacterId = mainCharacterId;
  }
  p.updatedAt = new Date().toISOString();
}

export function setParticipantGameMain(
  p: GlobalParticipant,
  gameId: string,
  mainCharacterId: string | null
): void {
  const profile = ensureGameProfile(p, gameId);
  profile.mainCharacterId = mainCharacterId;
  if (p.gameId === gameId) {
    p.mainCharacterId = mainCharacterId;
  }
  p.updatedAt = new Date().toISOString();
}

/** Remove a game profile from a participant. Preserves top-level gameId if it was primary. */
export function removeParticipantGame(p: GlobalParticipant, gameId: string): void {
  if (p.gameId === gameId) {
    p.gameId = null;
    p.mainCharacterId = null;
  }
  delete p.games[gameId];
  p.updatedAt = new Date().toISOString();
}

/** Set the list of games a participant is enrolled in. Ensures profiles for selected games, removes unselected ones. */
export function setParticipantGameList(
  p: GlobalParticipant,
  gameIds: string[],
  primaryGameId?: string | null,
  gameMainCharacters: Record<string, string | null> = {}
): void {
  const targetGameIds = new Set(gameIds);

  // Remove profiles for deselected games
  for (const gameId of Object.keys(p.games || {})) {
    if (!targetGameIds.has(gameId)) {
      removeParticipantGame(p, gameId);
    }
  }

  // Ensure profiles for selected games and set their main characters
  for (const gameId of gameIds) {
    const profile = ensureGameProfile(p, gameId);
    if (gameMainCharacters[gameId] !== undefined) {
      profile.mainCharacterId = gameMainCharacters[gameId];
    }
  }

  // Update primary game and main character
  if (primaryGameId !== undefined) {
    const safePrimary = (primaryGameId && gameIds.includes(primaryGameId)) ? primaryGameId : gameIds[0];
    if (safePrimary) {
      const primaryMain = gameMainCharacters[safePrimary] !== undefined
        ? gameMainCharacters[safePrimary]
        : (p.games?.[safePrimary]?.mainCharacterId ?? null);
      setParticipantPrimaryGame(p, safePrimary, primaryMain);
    } else {
      setParticipantPrimaryGame(p, null, null);
    }
  } else if (p.gameId && !targetGameIds.has(p.gameId)) {
    // If current primary was removed, pick the first remaining one
    const safePrimary = gameIds[0];
    if (safePrimary) {
      // safePrimary is guaranteed to be a string here
      const primaryMain = p.games?.[safePrimary]?.mainCharacterId ?? null;
      setParticipantPrimaryGame(p, safePrimary, primaryMain);
    } else {
      setParticipantPrimaryGame(p, null, null);
    }
  }

  p.updatedAt = new Date().toISOString();
}

export function migrateParticipantGames(p: GlobalParticipant): GlobalParticipant {
  if (!p.games) p.games = {};

  // Legacy single-game ELO migration
  if (
    (p as any).eloPoints !== undefined ||
    (p as any).eloRank !== undefined
  ) {
    const legacyPoints = (p as any).eloPoints as number | null | undefined;
    const legacyRank = (p as any).eloRank as string | undefined;
    const legacyGameId = p.gameId ?? 'ssbu';

    if (legacyPoints !== undefined || legacyRank !== undefined) {
      const profile = ensureGameProfile(p, legacyGameId);
      if (legacyPoints !== undefined && profile.eloPoints === null) {
        profile.eloPoints = legacyPoints ?? null;
      }
      if (legacyRank !== undefined && profile.eloRank === 'Sin puntos') {
        profile.eloRank = legacyRank ?? getRankName(profile.eloPoints);
      }
      if (profile.eloRank === 'Sin puntos' && profile.eloPoints !== null) {
        profile.eloRank = getRankName(profile.eloPoints);
      }
      if (p.gameId === null && legacyGameId) {
        p.gameId = legacyGameId;
        if ((p as any).mainCharacterId !== undefined) {
          profile.mainCharacterId = (p as any).mainCharacterId ?? null;
        }
      }
    }

    // Clean legacy keys once migrated (optional, keeps data tidy)
    delete (p as any).eloPoints;
    delete (p as any).eloRank;
  }

  // Sync top-level main character into the primary game profile
  if (p.gameId && p.mainCharacterId !== undefined && p.games[p.gameId]) {
    const profile = p.games[p.gameId];
    if (profile.mainCharacterId === null && p.mainCharacterId !== null) {
      profile.mainCharacterId = p.mainCharacterId;
    }
  }

  // Make sure the primary game has a profile
  if (p.gameId) {
    ensureGameProfile(p, p.gameId);
  }

  return p;
}

export function allGameProfiles(
  p: GlobalParticipant
): ParticipantGameProfile[] {
  return Object.values(p.games ?? {});
}
