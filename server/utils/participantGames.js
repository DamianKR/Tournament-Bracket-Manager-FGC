import { getRankName } from './eloEngine.js';

export function getPrimaryGameId(p) {
  return p.gameId ?? null;
}

export function getPrimaryCharacterId(p) {
  return p.mainCharacterId ?? null;
}

export function getGameProfile(p, gameId = null) {
  const target = gameId ?? p.gameId;
  if (!target) return null;
  if (p.games?.[target]) return p.games[target];
  // Legacy single-game fallback
  if (p.gameId === target && (p.eloPoints !== undefined || p.eloRank !== undefined)) {
    return {
      gameId: target,
      mainCharacterId: p.mainCharacterId ?? null,
      eloPoints: p.eloPoints ?? null,
      eloRank: p.eloRank ?? getRankName(p.eloPoints),
    };
  }
  return null;
}

export function getParticipantElo(p, gameId = null) {
  return getGameProfile(p, gameId)?.eloPoints ?? null;
}

export function getParticipantRank(p, gameId = null) {
  return getGameProfile(p, gameId)?.eloRank ?? 'Sin puntos';
}

export function getEffectiveElo(p, gameId = null) {
  return getParticipantElo(p, gameId) ?? 1500;
}

export function ensureGameProfile(p, gameId) {
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

export function setParticipantGameElo(p, gameId, eloPoints, eloRank) {
  const profile = ensureGameProfile(p, gameId);
  profile.eloPoints = eloPoints ?? null;
  profile.eloRank = eloRank ?? getRankName(eloPoints);
  p.updatedAt = new Date().toISOString();
}

export function setParticipantPrimaryGame(p, gameId, mainCharacterId) {
  p.gameId = gameId ?? null;
  if (gameId !== undefined) p.mainCharacterId = mainCharacterId ?? null;
  if (gameId && mainCharacterId !== undefined) {
    const profile = ensureGameProfile(p, gameId);
    profile.mainCharacterId = mainCharacterId;
  }
  p.updatedAt = new Date().toISOString();
}

export function setParticipantGameMain(p, gameId, mainCharacterId) {
  const profile = ensureGameProfile(p, gameId);
  profile.mainCharacterId = mainCharacterId;
  if (p.gameId === gameId) {
    p.mainCharacterId = mainCharacterId;
  }
  p.updatedAt = new Date().toISOString();
}

export function removeParticipantGame(p, gameId) {
  if (p.gameId === gameId) {
    p.gameId = null;
    p.mainCharacterId = null;
  }
  delete p.games[gameId];
  p.updatedAt = new Date().toISOString();
}

export function setParticipantGameList(p, gameIds, primaryGameId, gameMainCharacters = {}) {
  const targetGameIds = new Set(gameIds);

  for (const gameId of Object.keys(p.games || {})) {
    if (!targetGameIds.has(gameId)) {
      removeParticipantGame(p, gameId);
    }
  }

  for (const gameId of gameIds) {
    const profile = ensureGameProfile(p, gameId);
    if (gameMainCharacters[gameId] !== undefined) {
      profile.mainCharacterId = gameMainCharacters[gameId];
    }
  }

  if (primaryGameId !== undefined) {
    const safePrimary = gameIds.includes(primaryGameId) ? primaryGameId : (gameIds[0] ?? null);
    const primaryMain = gameMainCharacters[safePrimary] !== undefined
      ? gameMainCharacters[safePrimary]
      : (p.games?.[safePrimary]?.mainCharacterId ?? null);
    setParticipantPrimaryGame(p, safePrimary, primaryMain);
  } else if (p.gameId && !targetGameIds.has(p.gameId)) {
    const safePrimary = gameIds[0] ?? null;
    const primaryMain = p.games?.[safePrimary]?.mainCharacterId ?? null;
    setParticipantPrimaryGame(p, safePrimary, primaryMain);
  }

  p.updatedAt = new Date().toISOString();
  return p;
}

export function migrateParticipantGames(p) {
  if (!p.games) p.games = {};

  // Legacy single-game ELO migration
  if (p.eloPoints !== undefined || p.eloRank !== undefined) {
    const legacyPoints = p.eloPoints;
    const legacyRank = p.eloRank;
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
        if (p.mainCharacterId !== undefined) {
          profile.mainCharacterId = p.mainCharacterId;
        }
      }
    }

    // Clean legacy keys once migrated
    delete p.eloPoints;
    delete p.eloRank;
  }

  // Sync top-level main character into the primary game profile
  if (p.gameId && p.mainCharacterId !== undefined && p.games[p.gameId]) {
    const profile = p.games[p.gameId];
    if (profile.mainCharacterId === null && p.mainCharacterId !== null) {
      profile.mainCharacterId = p.mainCharacterId;
    }
  }

  if (p.gameId) {
    ensureGameProfile(p, p.gameId);
  }

  return p;
}

export function allGameProfiles(p) {
  return Object.values(p.games ?? {});
}
