/**
 * start.gg Tournament Importer — Fase 2
 *
 * Importa torneos completos desde start.gg usando el Personal Access Token.
 * Genera registros compatibles con el sistema local (Tournament + participants +
 * tournamentMatches) para que las stats, H2H y el historial funcionen directamente.
 *
 * Flujo:
 *   1. Fetch tournament info + events (para preview)
 *   2. Fetch entrants paginados
 *   3. Fetch sets paginados
 *   4. Fetch standings paginados
 *   5. Mapear entrants → GlobalParticipants (via startggPlayerId)
 *   6. Crear stubs para entrants no vinculados
 *   7. Construir Tournament + bracket + manualStandings
 *   8. Crear tournamentMatches para H2H/stats
 *   9. Persistir todo (idempotente: re-import actualiza sin duplicar)
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tournaments, tournamentMatches, participants, users } from '../db/collections.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = path.join(__dirname, '..', '..', 'data');
const CHAR_MAP_PATH = path.join(DATA_DIR, 'startgg_char_map.json');

const STARTGG_API  = 'https://api.start.gg/gql/alpha';
const ACCESS_TOKEN = process.env.STARTGG_ACCESS_TOKEN;

// ── Character map helpers ────────────────────────────────────────────────

export function loadCharMap() {
  try {
    return JSON.parse(readFileSync(CHAR_MAP_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function saveCharMap(map) {
  writeFileSync(CHAR_MAP_PATH, JSON.stringify(map, null, 2));
}

/** Resuelve un selectionValue de start.gg al ID local de personaje.
 *  @param {string|number} selectionValue  - ID numérico de start.gg
 *  @param {string} localGameId            - ID local del juego (ej: 'ssbu')
 */
export function resolveCharId(selectionValue, localGameId) {
  const map = loadCharMap();
  return map?.[localGameId]?.[String(selectionValue)] ?? null;
}

// ── start.gg videogame ID → local game ID ────────────────────────────────
const GAME_ID_MAP = {
  1386:  'ssbu',    // Super Smash Bros. Ultimate
  33945: 'ggst',    // Guilty Gear: Strive
  43868: 'sf6',     // Street Fighter 6
  49783: 'tekken8', // Tekken 8
  32:    'sg',      // Skullgirls: 2nd Encore
  3200:  'mk11',    // Mortal Kombat 11
  904:   'sc6',     // SOULCALIBUR VI (start.gg no trackea personajes para este juego)
};

// ── GraphQL helper ───────────────────────────────────────────────────────

async function gql(query, variables = {}) {
  if (!ACCESS_TOKEN) throw new Error('STARTGG_ACCESS_TOKEN no configurado');

  const res = await fetch(STARTGG_API, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`start.gg API error ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`start.gg GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// ── Slug normalizer ──────────────────────────────────────────────────────

/**
 * Extrae el slug de un URL de start.gg o lo devuelve tal cual si ya es slug.
 * Ejemplos:
 *   https://www.start.gg/tournament/apex-2024/event/ssbu  → 'apex-2024'
 *   apex-2024  → 'apex-2024'
 */
export function normalizeTournamentSlug(input) {
  try {
    const url = new URL(input);
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('tournament');
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
  } catch {
    // Not a URL — return as-is, stripped of whitespace
  }
  return input.trim().replace(/^\/+|\/+$/g, '');
}

// ── Preview: tournament info + events ───────────────────────────────────

const PREVIEW_QUERY = `
  query TournamentPreview($slug: String!) {
    tournament(slug: $slug) {
      id
      name
      slug
      startAt
      endAt
      numAttendees
      events {
        id
        name
        type
        numEntrants
        videogame { id name }
      }
    }
  }
`;

export async function previewTournament(slug) {
  const normalSlug = normalizeTournamentSlug(slug);
  const data = await gql(PREVIEW_QUERY, { slug: normalSlug });
  if (!data.tournament) throw new Error(`Torneo no encontrado: ${normalSlug}`);
  return data.tournament;
}

// ── Fetch helpers (paginados) ────────────────────────────────────────────

const ENTRANTS_QUERY = `
  query EventEntrants($eventId: ID!, $page: Int!, $perPage: Int!) {
    event(id: $eventId) {
      id
      entrants(query: { page: $page, perPage: $perPage }) {
        pageInfo { total totalPages }
        nodes {
          id
          name
          participants {
            player { id gamerTag }
          }
        }
      }
    }
  }
`;

async function fetchAllEntrants(eventId) {
  const all = [];
  let page = 1;
  const perPage = 50;
  while (true) {
    const data = await gql(ENTRANTS_QUERY, { eventId, page, perPage });
    const nodes = data?.event?.entrants?.nodes ?? [];
    all.push(...nodes);
    const { totalPages } = data?.event?.entrants?.pageInfo ?? {};
    if (!totalPages || page >= totalPages) break;
    page++;
  }
  return all;
}

// Fase 4: incluye phaseGroup + prereq para reconstruir pools y bracket.
// Sin games/selections — complejidad controlada con perPage=20.
const SETS_QUERY = `
  query EventSets($eventId: ID!, $page: Int!, $perPage: Int!) {
    event(id: $eventId) {
      sets(page: $page, perPage: $perPage, filters: { hideEmpty: true, state: [3] }) {
        pageInfo { total totalPages }
        nodes {
          id
          displayScore
          winnerId
          fullRoundText
          round
          startedAt
          completedAt
          phaseGroup {
            id
            displayIdentifier
            phase { id name bracketType }
          }
          slots {
            entrant { id name }
            prereqType
            prereqId
            standing {
              stats { score { value } }
            }
          }
        }
      }
    }
  }
`;

async function fetchAllSets(eventId) {
  const all = [];
  let page = 1;
  const perPage = 20; // Fase 4: bajado a 20 para acomodar los campos extra de phaseGroup+prereq
  while (true) {
    const data = await gql(SETS_QUERY, { eventId, page, perPage });
    const nodes = data?.event?.sets?.nodes ?? [];
    all.push(...nodes);
    const { totalPages } = data?.event?.sets?.pageInfo ?? {};
    if (!totalPages || page >= totalPages) break;
    page++;
  }
  return all;
}

const STANDINGS_QUERY = `
  query EventStandings($eventId: ID!, $page: Int!, $perPage: Int!) {
    event(id: $eventId) {
      standings(query: { page: $page, perPage: $perPage }) {
        pageInfo { total totalPages }
        nodes {
          placement
          entrant { id name }
        }
      }
    }
  }
`;

async function fetchAllStandings(eventId) {
  const all = [];
  let page = 1;
  const perPage = 50;
  while (true) {
    const data = await gql(STANDINGS_QUERY, { eventId, page, perPage });
    const nodes = data?.event?.standings?.nodes ?? [];
    all.push(...nodes);
    const { totalPages } = data?.event?.standings?.pageInfo ?? {};
    if (!totalPages || page >= totalPages) break;
    page++;
  }
  return all;
}

const EVENT_META_QUERY = `
  query EventMeta($eventId: ID!) {
    event(id: $eventId) {
      id
      name
      type
      numEntrants
      startAt
      videogame { id name }
      tournament {
        id
        name
        slug
        endAt
      }
    }
  }
`;

// ── Game profile helper ──────────────────────────────────────────────────

/**
 * Crea un perfil de juego vacío (sin ELO, sin disponibilidad activa) para un
 * GlobalParticipant importado como stub desde start.gg.
 * La disponibilidad parte en false — el admin/jugador la activa manualmente.
 */
function buildGameProfile(gameId) {
  return {
    gameId,
    mainCharacterId:      null,
    eloPoints:            null,
    eloRank:              'Sin puntos',
    available:            false,
    leagueAvailable:      false,
    tournamentAvailable:  false,
  };
}

// ── Fase 4: phase/pool building ──────────────────────────────────────────

/**
 * Construye el array `importedPhases` a partir de todos los sets ya procesados.
 * Agrupa por phase → phaseGroup y calcula standings para grupos round-robin.
 *
 * @param {Array} sets             - Todos los sets devueltos por start.gg
 * @param {Map}   entrantToLocalId - sgg entrant ID (string) → local participant ID ('sgg_e_...')
 */
function buildImportedPhases(sets, entrantToLocalId) {
  // Índices intermedios: phaseId → phase meta
  const phaseMap  = new Map(); // phaseId → { id, name, bracketType, groups: Map }
  const groupMeta = new Map(); // groupId → { id, name, bracketType }

  for (const set of sets) {
    const pg    = set.phaseGroup;
    const phase = pg?.phase;
    if (!phase) continue;

    if (!phaseMap.has(phase.id)) {
      phaseMap.set(phase.id, { id: String(phase.id), name: phase.name, bracketType: phase.bracketType, groups: new Map() });
    }
    const phaseEntry = phaseMap.get(phase.id);

    const groupId = String(pg.id);
    const groupName = pg.displayIdentifier
      ? (phase.bracketType === 'ROUND_ROBIN' ? `Pool ${pg.displayIdentifier}` : pg.displayIdentifier)
      : String(pg.id);

    if (!phaseEntry.groups.has(groupId)) {
      phaseEntry.groups.set(groupId, { id: groupId, name: groupName, bracketType: phase.bracketType, sets: [] });
      groupMeta.set(groupId, { id: groupId, name: groupName, bracketType: phase.bracketType });
    }
    phaseEntry.groups.get(groupId).sets.push(set);
  }

  // Construir resultado final con standings calculados
  const importedPhases = [];
  for (const phase of phaseMap.values()) {
    const groups = [];
    for (const group of phase.groups.values()) {
      const standings = group.bracketType === 'ROUND_ROBIN'
        ? computeRRStandings(group.sets, entrantToLocalId)
        : [];

      // Construir sets para TODOS los tipos de grupo (RR + DE/SE).
      // Para RR: formato plano sin round info.
      // Para DE/SE: incluir roundLabel y round para mostrar brackets por pool.
      const poolSets = group.sets
        .map((set) => {
          const s0 = set.slots?.[0];
          const s1 = set.slots?.[1];
          if (!s0?.entrant || !s1?.entrant) return null;

          const id0 = entrantToLocalId.get(String(s0.entrant.id)) ?? null;
          const id1 = entrantToLocalId.get(String(s1.entrant.id)) ?? null;
          if (!id0 || !id1) return null;

          const winnerSggId = set.winnerId ? String(set.winnerId) : null;
          const winnerId = winnerSggId === String(s0.entrant.id) ? id0
            : winnerSggId === String(s1.entrant.id) ? id1
            : null;

          // Usar score directo del slot cuando está disponible
          const slot0Score = s0.standing?.stats?.score?.value;
          const slot1Score = s1.standing?.stats?.score?.value;

          let player1Score = (slot0Score != null && slot0Score >= 0) ? slot0Score : null;
          let player2Score = (slot1Score != null && slot1Score >= 0) ? slot1Score : null;
          if (player1Score == null || player2Score == null) {
            const parsed = parseSetScores(
              set.displayScore, s0.entrant.id, s1.entrant.id, set.winnerId, set.slots
            );
            if (player1Score == null) player1Score = parsed.score1;
            if (player2Score == null) player2Score = parsed.score2;
          }

          const entry = {
            id:           `sgg_s_${set.id}`,
            player1Id:    id0,
            player2Id:    id1,
            winnerId,
            player1Score,
            player2Score,
          };

          // Para grupos DE/SE: añadir round info para que el frontend pueda
          // reconstruir el bracket por pool (Winners R1, Losers R2, etc.)
          if (group.bracketType !== 'ROUND_ROBIN') {
            entry.roundLabel = set.fullRoundText ?? undefined;
            entry.round      = set.round ?? undefined;
          }

          return entry;
        })
        .filter(Boolean);

      groups.push({
        id: group.id, name: group.name, bracketType: group.bracketType,
        standings,
        sets: poolSets,
      });
    }
    // Ordenar grupos por nombre numérico
    groups.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    importedPhases.push({ id: phase.id, name: phase.name, bracketType: phase.bracketType, groups });
  }

  // Orden de fases:
  // 1. RR antes que DE/SE (pools round-robin siempre son la primera fase)
  // 2. Dentro del mismo tipo: más grupos primero (Pools > Top32 > Top8)
  // 3. Desempate por phase ID numérico ascendente (fases más tempranas primero)
  importedPhases.sort((a, b) => {
    const typeOrder = { ROUND_ROBIN: 0, SINGLE_ELIMINATION: 1, DOUBLE_ELIMINATION: 2 };
    const typeDiff = (typeOrder[a.bracketType] ?? 3) - (typeOrder[b.bracketType] ?? 3);
    if (typeDiff !== 0) return typeDiff;
    const groupDiff = b.groups.length - a.groups.length; // más grupos primero
    if (groupDiff !== 0) return groupDiff;
    return Number(a.id) - Number(b.id); // phase ID ascendente
  });

  return importedPhases;
}

/**
 * Calcula standings de un pool round-robin a partir de sus sets.
 * Retorna array ordenado por placement (wins desc, losses asc).
 * Incluye gameWins/gameLosses usando slot scores directos cuando estén disponibles.
 */
function computeRRStandings(groupSets, entrantToLocalId) {
  const record = new Map(); // localId → { wins, losses, gameWins, gameLosses }

  for (const set of groupSets) {
    const s0 = set.slots?.[0];
    const s1 = set.slots?.[1];
    if (!s0?.entrant || !s1?.entrant) continue;

    const id0 = entrantToLocalId.get(String(s0.entrant.id));
    const id1 = entrantToLocalId.get(String(s1.entrant.id));
    if (!id0 || !id1) continue;

    if (!record.has(id0)) record.set(id0, { wins: 0, losses: 0, gameWins: 0, gameLosses: 0 });
    if (!record.has(id1)) record.set(id1, { wins: 0, losses: 0, gameWins: 0, gameLosses: 0 });

    const winnerSggId = set.winnerId ? String(set.winnerId) : null;
    const slot0Id = String(s0.entrant.id);
    const slot1Id = String(s1.entrant.id);

    // Scores de juegos (preferir slot score directo sobre regex de displayScore)
    const s0GameScore = s0.standing?.stats?.score?.value;
    const s1GameScore = s1.standing?.stats?.score?.value;
    const g0 = (s0GameScore != null && s0GameScore >= 0) ? s0GameScore : null;
    const g1 = (s1GameScore != null && s1GameScore >= 0) ? s1GameScore : null;

    if (winnerSggId === slot0Id) {
      record.get(id0).wins++;
      record.get(id1).losses++;
    } else if (winnerSggId === slot1Id) {
      record.get(id1).wins++;
      record.get(id0).losses++;
    }

    if (g0 != null) { record.get(id0).gameWins   += g0; record.get(id0).gameLosses += (g1 ?? 0); }
    if (g1 != null) { record.get(id1).gameWins   += g1; record.get(id1).gameLosses += (g0 ?? 0); }
  }

  // Construir standings ordenados
  const standings = [];
  for (const [participantId, rec] of record) {
    standings.push({
      participantId,
      wins:        rec.wins,
      losses:      rec.losses,
      gameWins:    rec.gameWins,
      gameLosses:  rec.gameLosses,
      placement:   0,
    });
  }
  standings.sort((a, b) => b.wins - a.wins || a.losses - b.losses);
  standings.forEach((s, i) => { s.placement = i + 1; });
  return standings;
}

/**
 * Reconstruye nextWinnerMatchId y nextLoserMatchId en los bracket matches
 * usando los datos de prereqType/prereqId de los slots.
 *
 * @param {Array} matches - Array de bracket match objects (con id = 'sgg_s_{setId}')
 * @param {Array} sets    - Raw sets from start.gg (con phaseGroup.phase.bracketType)
 */
function reconstructBracketLinks(matches, sets) {
  // Índice: sgg set ID (string) → bracket match
  const matchBySggId = new Map();
  for (const m of matches) {
    const sggId = m.id.replace('sgg_s_', '');
    matchBySggId.set(sggId, m);
  }

  // Para cada set, mirar los slots de OTROS sets que tienen prereqId = este set
  // y construir nextWinnerMatchId / nextLoserMatchId
  for (const targetSet of sets) {
    const targetId   = String(targetSet.id);
    const targetMatch = matchBySggId.get(targetId);
    const isLoser    = targetSet.fullRoundText?.includes('Losers') ||
                       targetSet.phaseGroup?.phase?.bracketType === 'SINGLE_ELIMINATION' && false;

    for (let slotIdx = 0; slotIdx < (targetSet.slots?.length ?? 0); slotIdx++) {
      const slot = targetSet.slots[slotIdx];
      if (slot?.prereqType !== 'set') continue;

      const prereqSggId = String(slot.prereqId);
      const sourceMatch  = matchBySggId.get(prereqSggId);
      if (!sourceMatch || !targetMatch) continue;

      const sourceSetData = sets.find((s) => String(s.id) === prereqSggId);
      const sourceIsLoser = sourceSetData?.fullRoundText?.includes('Losers');

      // Si el set objetivo está en losers y el set origen en winners → loser va aquí
      if (isLoser && !sourceIsLoser) {
        sourceMatch.nextLoserMatchId = targetMatch.id;
      } else {
        // Winner de origen va al set objetivo
        if (!sourceMatch.nextWinnerMatchId) {
          sourceMatch.nextWinnerMatchId = targetMatch.id;
        }
      }
    }
  }
}

// ── Bracket type detection ───────────────────────────────────────────────

function bracketTypeFromText(fullRoundText) {
  if (!fullRoundText) return 'winner';
  const t = fullRoundText.toLowerCase();
  if (t.includes('grand final') || t.includes('true final')) {
    return t.includes('reset') ? 'grand_final_reset' : 'grand_final';
  }
  if (t.includes('losers') || t.includes('loser')) return 'loser';
  return 'winner';
}

// ── Score parsing ────────────────────────────────────────────────────────
// displayScore format examples:
//   "KruX 3 - 1 Player2"
//   "3 - 1"
//   "DQ"
//   null

/**
 * Extrae scores de los slots del set como fallback cuando displayScore no parsea.
 * slots[0] contiene el entrant correspondiente a entrant1Id (por convención del importer).
 */
function slotScores(slots, entrant1Id) {
  if (!slots || slots.length < 2) return { score1: null, score2: null };
  const s0 = slots[0];
  const s1 = slots[1];
  const v0 = s0?.standing?.stats?.score?.value;
  const v1 = s1?.standing?.stats?.score?.value;
  if (v0 == null || v0 < 0 || v1 == null || v1 < 0) return { score1: null, score2: null };
  // Verificar que slots[0] corresponde a entrant1 (siempre cierto en este importer, pero por seguridad)
  const e0IsEntrant1 = !entrant1Id || String(s0?.entrant?.id) === String(entrant1Id);
  return e0IsEntrant1
    ? { score1: v0, score2: v1 }
    : { score1: v1, score2: v0 };
}

function parseSetScores(displayScore, entrant1Id, entrant2Id, winnerId, slots) {
  if (!displayScore || displayScore === 'DQ' || displayScore === 'W/O') {
    // Intentar con slot standings como fallback
    return slotScores(slots, entrant1Id);
  }

  // "Name X - Y Name" or "X - Y"
  const pattern = /(\d+)\s*-\s*(\d+)/;
  const match = displayScore.match(pattern);
  if (!match) return slotScores(slots, entrant1Id);

  const [, a, b] = match;
  const scoreA = parseInt(a), scoreB = parseInt(b);

  if (!entrant1Id || !entrant2Id || !winnerId) {
    return { score1: scoreA, score2: scoreB };
  }

  // Normalizar a string para evitar errores de tipo (start.gg devuelve números,
  // pero pueden llegar como Int o String según el campo)
  const winnerStr  = String(winnerId);
  const entrant1Str = String(entrant1Id);

  // start.gg pone al ganador primero en displayScore cuando los scores difieren
  if (scoreA !== scoreB) {
    if (winnerStr === entrant1Str) {
      return { score1: scoreA, score2: scoreB };
    } else {
      return { score1: scoreB, score2: scoreA };
    }
  }
  return { score1: scoreA, score2: scoreB };
}

// ── Main importer ────────────────────────────────────────────────────────

/**
 * Importa un evento de start.gg completo a la base de datos local.
 *
 * @param {string} slug         - Tournament slug (or full URL)
 * @param {string|number} eventId - start.gg event ID to import
 * @param {string} communityId  - Local community ID
 * @param {boolean} givesPoints - Whether to award ELO/ranking points on import (default false)
 * @param {number} pointsDepth  - How deep placement payouts go: 8 | 16 | 32 (default 8)
 * @returns {object} Import summary
 */
export async function importEvent(slug, eventId, communityId, givesPoints = false, pointsDepth = 8) {
  const normalSlug = normalizeTournamentSlug(slug);
  const sggEventId = String(eventId);

  // 1. Fetch event metadata
  const metaData = await gql(EVENT_META_QUERY, { eventId: sggEventId });
  if (!metaData.event) throw new Error(`Evento no encontrado: ${sggEventId}`);
  const eventMeta = metaData.event;

  const localGameId = GAME_ID_MAP[eventMeta.videogame?.id] ?? null;
  const now = new Date().toISOString();
  const tournamentDate = eventMeta.tournament?.endAt
    ? new Date(eventMeta.tournament.endAt * 1000).toISOString()
    : eventMeta.startAt
      ? new Date(eventMeta.startAt * 1000).toISOString()
      : now;

  // 2. Fetch all data in parallel (paginated)
  console.log(`[startgg] Fetching entrants, sets, standings for event ${sggEventId}...`);
  const [sggEntrants, sggSets, sggStandings] = await Promise.all([
    fetchAllEntrants(sggEventId),
    fetchAllSets(sggEventId),
    fetchAllStandings(sggEventId),
  ]);

  console.log(`[startgg] ${sggEntrants.length} entrants, ${sggSets.length} sets, ${sggStandings.length} standings`);

  // 3. Load local participants + users to match by startggPlayerId
  const [allLocalParticipants, allUsers] = await Promise.all([
    participants.getAll(),
    users.getAll(),
  ]);

  // Map: sggPlayerId → participant (from participants that have startggPlayerId in this community)
  const byStartggPlayerId = new Map();
  for (const lp of allLocalParticipants) {
    if (lp.communityId === communityId && lp.startggPlayerId) {
      byStartggPlayerId.set(String(lp.startggPlayerId), lp);
    }
  }

  // Map: sggPlayerId → user (from users that have linked their start.gg account)
  const userBySggPlayerId = new Map();
  for (const u of allUsers) {
    if (u.startggPlayerId) {
      userBySggPlayerId.set(String(u.startggPlayerId), u);
    }
  }

  /**
   * Returns the participantId a user has in a community (root or membership).
   */
  function getParticipantForCommunity(user, cid) {
    if (user.communityId === cid && user.participantId) return user.participantId;
    const m = (user.memberships ?? []).find(
      (mem) => mem.communityId === cid && mem.isActive !== false
    );
    return m?.participantId ?? null;
  }

  // 4. Map / create GlobalParticipants for each start.gg entrant
  // entrantMap: sggEntrantId → { localParticipant, tournamentLocalId, name }
  const entrantMap = new Map();
  const stubsCreated = [];
  const linkedCount  = { count: 0 };

  for (const entrant of sggEntrants) {
    const sggEntrantId = String(entrant.id);
    const player = entrant.participants?.[0]?.player;
    const sggPlayerId = player ? String(player.id) : null;
    const name = player?.gamerTag ?? entrant.name ?? `Player_${sggEntrantId}`;

    // Tournament-local participant ID (stable within this import)
    const localTpId = `sgg_e_${sggEntrantId}`;

    // Resolution order:
    //   a) Participant in this community that already has this startggPlayerId
    //   b) Linked user whose startggPlayerId matches → use/create their participant
    //   c) Stub from a previous import (same entrantId or same generated stub ID)
    //   d) Create new stub
    let globalParticipant = sggPlayerId ? byStartggPlayerId.get(sggPlayerId) : null;

    if (!globalParticipant && sggPlayerId) {
      // b) Check if a user has this startggPlayerId linked
      const linkedUser = userBySggPlayerId.get(sggPlayerId);
      if (linkedUser) {
        const existingPid = getParticipantForCommunity(linkedUser, communityId);
        if (existingPid) {
          // Use the user's real participant — ensure startggPlayerId + entrantId are set
          const existingP = allLocalParticipants.find((lp) => lp.id === existingPid);
          if (existingP) {
            let dirty = false;
            if (!existingP.startggPlayerId) {
              existingP.startggPlayerId = Number(sggPlayerId);
              dirty = true;
            }
            if (!existingP.startggEntrantIds?.includes(sggEntrantId)) {
              existingP.startggEntrantIds = [
                ...new Set([...(existingP.startggEntrantIds ?? []), sggEntrantId]),
              ];
              dirty = true;
            }
            // Ensure game profile exists
            if (localGameId && !existingP.games?.[localGameId]) {
              existingP.games = { ...(existingP.games ?? {}), [localGameId]: buildGameProfile(localGameId) };
              dirty = true;
            }
            if (dirty) {
              existingP.updatedAt = now;
              await participants.upsert(existingP);
              // Keep maps up to date for subsequent entrants
              byStartggPlayerId.set(sggPlayerId, existingP);
              allLocalParticipants.push(existingP); // avoid double-create
            }
            globalParticipant = existingP;
            console.log(`[startgg] Matched entrant ${name} to linked user ${linkedUser.username}'s participant ${existingPid}`);
          }
        } else {
          // User is linked but has no participant in this community yet.
          // Create a real (non-stub) participant and add the membership to the user.
          const newPart = {
            id:              `gp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name,
            alias:           name,
            avatarUrl:       null,
            tournamentIds:   [],
            gameId:          localGameId,
            mainCharacterId: null,
            games:           localGameId ? { [localGameId]: buildGameProfile(localGameId) } : {},
            communityId,
            startggPlayerId:   Number(sggPlayerId),
            startggEntrantIds: [sggEntrantId],
            isStartggStub:     false,
            createdAt:         now,
            updatedAt:         now,
          };
          await participants.upsert(newPart);
          // Add membership to the user for this community
          if (!Array.isArray(linkedUser.memberships)) linkedUser.memberships = [];
          if (!linkedUser.memberships.find((m) => m.communityId === communityId)) {
            linkedUser.memberships.push({
              participantId: newPart.id,
              communityId,
              isActive:      true,
              role:          'user',
              gameAdminFor:  [],
            });
            await users.upsert(linkedUser);
          }
          byStartggPlayerId.set(sggPlayerId, newPart);
          allLocalParticipants.push(newPart);
          globalParticipant = newPart;
          console.log(`[startgg] Created real participant ${newPart.id} for linked user ${linkedUser.username} in community ${communityId}`);
        }
      }
    }

    if (!globalParticipant) {
      // c) Check if stub already exists (from a previous import)
      const existing = allLocalParticipants.find(
        (lp) => lp.communityId === communityId && lp.startggEntrantIds?.includes(sggEntrantId)
      );
      if (existing) {
        globalParticipant = existing;
      }
    }

    if (globalParticipant) {
      linkedCount.count++;
    } else {
      // Create stub GlobalParticipant
      const stub = {
        id:        `gp_sgg_${sggEntrantId}`,
        name,
        alias:     name,
        avatarUrl: null,
        tournamentIds: [],
        gameId:    localGameId,
        mainCharacterId: null,
        games: localGameId ? { [localGameId]: buildGameProfile(localGameId) } : {},
        communityId,
        startggPlayerId:   sggPlayerId ? Number(sggPlayerId) : null,
        startggEntrantIds: [sggEntrantId],
        isStartggStub:     true,
        createdAt: now,
        updatedAt: now,
      };
      // Check if stub already exists by generated ID
      const existingStub = allLocalParticipants.find((lp) => lp.id === stub.id);
      if (existingStub) {
        // Merge entrant IDs in case they changed
        existingStub.startggEntrantIds = [
          ...new Set([...(existingStub.startggEntrantIds ?? []), sggEntrantId]),
        ];
        // Ensure the game profile exists
        if (localGameId && !existingStub.games?.[localGameId]) {
          existingStub.games = {
            ...(existingStub.games ?? {}),
            [localGameId]: buildGameProfile(localGameId),
          };
        }
        await participants.upsert(existingStub);
        globalParticipant = existingStub;
      } else {
        await participants.upsert(stub);
        globalParticipant = stub;
        stubsCreated.push(stub.id);
      }
    }

    entrantMap.set(sggEntrantId, {
      globalParticipant,
      tournamentLocalId: localTpId,
      name,
      sggEntrantId,
    });
  }

  // 5. Build standings map: sggEntrantId → placement
  const placementMap = new Map();
  for (const s of sggStandings) {
    placementMap.set(String(s.entrant.id), s.placement);
  }

  // 6. Build tournament Participant array (local)
  let seed = 1;
  const localTournamentParticipants = [];
  for (const entrant of sggEntrants) {
    const sggEntrantId = String(entrant.id);
    const entry = entrantMap.get(sggEntrantId);
    if (!entry) continue;
    const placement = placementMap.get(sggEntrantId) ?? null;
    localTournamentParticipants.push({
      id:                  entry.tournamentLocalId,
      name:                entry.name,
      alias:               entry.name,
      seed:                seed++,
      eliminated:          true,
      finalPosition:       placement,
      lossCount:           placement === 1 ? 0 : 1,
      globalParticipantId: entry.globalParticipant.id,
    });
  }

  // 7. Champion
  const championEntry = sggStandings.find((s) => s.placement === 1);
  const championSggId = championEntry ? String(championEntry.entrant.id) : null;
  const championLocalId = championSggId ? entrantMap.get(championSggId)?.tournamentLocalId ?? null : null;

  // 8. Build bracket from sets (solo fases de eliminación, no round-robin)
  const winnerBracket  = [];
  const loserBracket   = [];
  let   grandFinalMatch      = null;
  let   grandFinalResetMatch = null;

  for (const set of sggSets) {
    if (!set.slots || set.slots.length < 2) continue;

    // Los sets de pools round-robin NO van al bracket de eliminación
    const phaseType = set.phaseGroup?.phase?.bracketType;
    if (phaseType === 'ROUND_ROBIN') continue;

    const slot1Entrant = set.slots[0]?.entrant;
    const slot2Entrant = set.slots[1]?.entrant;
    if (!slot1Entrant || !slot2Entrant) continue;

    const e1 = entrantMap.get(String(slot1Entrant.id));
    const e2 = entrantMap.get(String(slot2Entrant.id));
    if (!e1 || !e2) continue;

    const sggWinnerId = String(set.winnerId);
    const localWinnerId = sggWinnerId === String(slot1Entrant.id)
      ? e1.tournamentLocalId
      : e2.tournamentLocalId;
    const localLoserId = localWinnerId === e1.tournamentLocalId
      ? e2.tournamentLocalId
      : e1.tournamentLocalId;

    const { score1, score2 } = parseSetScores(
      set.displayScore,
      slot1Entrant.id,
      slot2Entrant.id,
      set.winnerId,
      set.slots
    );

    const bType = bracketTypeFromText(set.fullRoundText);
    // start.gg usa valores negativos para el loser bracket (-1, -2…); usamos abs
    const roundNum = Math.abs(set.round ?? 1);
    const matchId  = `sgg_s_${set.id}`;

    const match = {
      id:                matchId,
      roundNumber:       roundNum,
      matchNumber:       set.id,
      roundLabel:        set.fullRoundText ?? undefined,
      bracketType:       bType,
      participant1Id:    e1.tournamentLocalId,
      participant2Id:    e2.tournamentLocalId,
      winnerId:          localWinnerId,
      loserId:           localLoserId,
      status:            'completed',
      nextWinnerMatchId: null,
      nextLoserMatchId:  null,
      participant1Score: score1,
      participant2Score: score2,
      games:             [],
      // phaseGroupId permite filtrar qué matches pertenecen a cada pool DE/SE
      phaseGroupId:      set.phaseGroup?.id ? String(set.phaseGroup.id) : undefined,
      phaseId:           set.phaseGroup?.phase?.id ? String(set.phaseGroup.phase.id) : undefined,
    };

    if (bType === 'grand_final_reset') {
      grandFinalResetMatch = match;
    } else if (bType === 'grand_final') {
      grandFinalMatch = match;
    } else if (bType === 'loser') {
      loserBracket.push(match);
    } else {
      winnerBracket.push(match);
    }
  }

  // 9. Reconstruct bracket navigation links (nextWinnerMatchId / nextLoserMatchId)
  const allBracketMatches = [
    ...winnerBracket,
    ...loserBracket,
    ...(grandFinalMatch ? [grandFinalMatch] : []),
    ...(grandFinalResetMatch ? [grandFinalResetMatch] : []),
  ];
  reconstructBracketLinks(allBracketMatches, sggSets);

  // 9b. Build importedPhases (pool standings + phase structure)
  //     Usamos sólo los sets de fases NO-bracket para los pools
  const entrantToLocalMap = new Map([...entrantMap.entries()].map(([k, v]) => [k, v.tournamentLocalId]));
  const importedPhases = buildImportedPhases(sggSets, entrantToLocalMap);

  // 9c. Determine tournament mode from bracket shape
  const mode = loserBracket.length > 0 ? 'manual_double' : 'manual_single';

  // 10. manualStandings
  const manualStandings = sggStandings.map((s) => {
    const entry = entrantMap.get(String(s.entrant.id));
    return {
      id:        entry?.tournamentLocalId ?? `sgg_e_${s.entrant.id}`,
      name:      entry?.name ?? s.entrant.name,
      placement: s.placement,
    };
  });

  // 11. Build tournament record (idempotente por startggEventId)
  const tournamentId = `sgg_event_${sggEventId}`;
  const tournamentRecord = {
    id:          tournamentId,
    name:        `${eventMeta.tournament?.name ?? normalSlug} — ${eventMeta.name}`,
    mode,
    type:        'singles',
    status:      'completed',
    gameId:      localGameId,
    participants: localTournamentParticipants,
    bracket: {
      winnerBracket,
      loserBracket,
      grandFinal:      grandFinalMatch,
      grandFinalReset: grandFinalResetMatch,
    },
    championId:     championLocalId,
    communityId,
    createdAt:      tournamentDate,
    updatedAt:      now,
    startedAt:      tournamentDate,
    completedAt:    tournamentDate,
    givesPoints:    givesPoints ?? false,
    pointsDepth:    [8, 16, 32].includes(Number(pointsDepth)) ? Number(pointsDepth) : 8,
    seedingMode:    'none',  // los seeds de start.gg no se mapean al sistema local
    manualStandings,
    totalParticipants: sggEntrants.length,
    // start.gg metadata
    startggTournamentId: eventMeta.tournament?.id ?? null,
    startggEventId:      Number(sggEventId),
    startggSlug:         eventMeta.tournament?.slug ?? normalSlug,
    importedFrom:        'startgg',
    importedAt:          now,
    importedPhases,
  };

  await tournaments.upsert(tournamentRecord);

  // 12. Update GlobalParticipant.tournamentIds (must run BEFORE applyTournamentElo
  // so that applyTournamentElo fetches the final participant objects, not stale copies)
  for (const entry of entrantMap.values()) {
    const gp = entry.globalParticipant;
    if (!gp.tournamentIds.includes(tournamentId)) {
      gp.tournamentIds = [...(gp.tournamentIds ?? []), tournamentId];
      gp.updatedAt = now;
      await participants.upsert(gp);
    }
  }

  // 11b. Apply ELO if requested (tournament is already 'completed')
  if (givesPoints) {
    const { applyTournamentElo } = await import('../utils/tournamentElo.js');
    const eloUpdates = await applyTournamentElo(tournamentRecord);
    tournamentRecord.eloApplied = true;
    tournamentRecord.eloUpdates = eloUpdates;
    // Persist the eloApplied flag on the tournament record
    await tournaments.upsert(tournamentRecord);
    console.log(`[startgg] ELO applied for imported tournament ${tournamentId}: ${eloUpdates.length} participants`);
  }

  // 13. Build tournamentMatches (for H2H and stats) — one record per set
  for (const set of sggSets) {
    if (!set.slots || set.slots.length < 2) continue;

    const slot1Entrant = set.slots[0]?.entrant;
    const slot2Entrant = set.slots[1]?.entrant;
    if (!slot1Entrant || !slot2Entrant) continue;

    const e1 = entrantMap.get(String(slot1Entrant.id));
    const e2 = entrantMap.get(String(slot2Entrant.id));
    if (!e1 || !e2) continue;

    const sggWinnerId = String(set.winnerId);
    const winnerEntry = sggWinnerId === String(slot1Entrant.id) ? e1 : e2;

    const { score1, score2 } = parseSetScores(
      set.displayScore,
      slot1Entrant.id,
      slot2Entrant.id,
      set.winnerId,
      set.slots
    );

    const setDate = set.completedAt
      ? new Date(set.completedAt * 1000).toISOString()
      : set.startedAt
        ? new Date(set.startedAt * 1000).toISOString()
        : tournamentDate;

    const sggPhaseType = set.phaseGroup?.phase?.bracketType; // ROUND_ROBIN | SINGLE_ELIMINATION | DOUBLE_ELIMINATION
    const tmRecord = {
      id:               `tm_sgg_${set.id}`,
      round:            set.round ?? 1,
      roundLabel:       set.fullRoundText ?? null,
      bracketType:      sggPhaseType === 'ROUND_ROBIN'
                          ? 'round_robin'
                          : bracketTypeFromText(set.fullRoundText),
      poolName:         sggPhaseType === 'ROUND_ROBIN' && set.phaseGroup?.displayIdentifier
                          ? `Pool ${set.phaseGroup.displayIdentifier}`
                          : null,
      phaseGroupId:     set.phaseGroup?.id ? String(set.phaseGroup.id) : null,
      matchNumber:      set.id,
      gameId:           localGameId,
      winnerId:         e1.tournamentLocalId === winnerEntry.tournamentLocalId
                          ? e1.tournamentLocalId
                          : e2.tournamentLocalId,
      winnerGlobalId:   winnerEntry.globalParticipant.id,
      player1Id:        e1.tournamentLocalId,
      player2Id:        e2.tournamentLocalId,
      player1Name:      e1.name,
      player2Name:      e2.name,
      player1GlobalId:  e1.globalParticipant.id,
      player2GlobalId:  e2.globalParticipant.id,
      player1Score:     score1,
      player2Score:     score2,
      tournamentId,
      tournamentName:   tournamentRecord.name,
      communityId,
      games:            [],
      createdAt:        setDate,
      updatedAt:        now,
    };

    await tournamentMatches.upsert(tmRecord);
  }

  const summary = {
    tournamentId,
    tournamentName: tournamentRecord.name,
    entrants:       sggEntrants.length,
    sets:           sggSets.length,
    standings:      sggStandings.length,
    linked:         linkedCount.count,
    stubs:          stubsCreated.length,
    localGameId,
    mode,
  };

  console.log(`[startgg] Import complete:`, summary);
  return summary;
}

// ── Fase 3: Character enrichment ─────────────────────────────────────────

// Query independiente para character selections — baja complejidad con perPage pequeño
const GAMES_QUERY = `
  query EventGames($eventId: ID!, $page: Int!, $perPage: Int!) {
    event(id: $eventId) {
      sets(page: $page, perPage: $perPage, filters: { hideEmpty: true, state: [3] }) {
        pageInfo { total totalPages }
        nodes {
          id
          slots {
            entrant { id }
          }
          games {
            id
            winnerId
            orderNum
            selections {
              entrant { id }
              selectionValue
              selectionType
            }
          }
        }
      }
    }
  }
`;

/**
 * Enriquece un torneo ya importado con datos de personajes por set.
 * Hace una segunda pasada sobre los sets con perPage reducido para no exceder
 * el límite de complejidad de start.gg.
 *
 * @param {string} localTournamentId  - ID local del torneo (ej: 'sgg_event_12345')
 * @param {string|number} sggEventId  - ID del evento en start.gg
 * @param {string} localGameId        - ID local del juego (ej: 'ssbu')
 * @returns {object} Resumen del enriquecimiento
 */
export async function enrichWithCharacters(localTournamentId, sggEventId, localGameId) {
  const charMap = loadCharMap();
  const gameMap = charMap?.[localGameId] ?? {};
  const now = new Date().toISOString();

  // Cargar tournament para obtener el bracket
  const allTournaments = await tournaments.getAll();
  const tournament = allTournaments.find((t) => t.id === localTournamentId);
  if (!tournament) throw new Error(`Torneo no encontrado: ${localTournamentId}`);

  // Índice bracket: matchId → match object (incluye grandFinalReset)
  const bracketById = new Map();
  for (const m of [
    ...(tournament.bracket?.winnerBracket    ?? []),
    ...(tournament.bracket?.loserBracket     ?? []),
    ...(tournament.bracket?.grandFinal       ? [tournament.bracket.grandFinal]      : []),
    ...(tournament.bracket?.grandFinalReset  ? [tournament.bracket.grandFinalReset] : []),
  ]) {
    bracketById.set(m.id, m);
  }

  // Cargar tournament_matches de este torneo
  const tmAll = await tournamentMatches.getAll();
  const tmBySetId = new Map();
  for (const tm of tmAll) {
    if (tm.tournamentId === localTournamentId) {
      // El id es 'tm_sgg_{setId}'
      const sggId = tm.id.replace('tm_sgg_', '');
      tmBySetId.set(sggId, tm);
    }
  }

  // Índice entrant → local tournament participant ID
  const entrantToLocalId = new Map();
  for (const p of tournament.participants ?? []) {
    // tournamentLocalId es 'sgg_e_{entrantId}'
    const entrantId = p.id.replace('sgg_e_', '');
    entrantToLocalId.set(entrantId, p.id);
  }

  let setsUpdated = 0;

  // Paginar con perPage=10 para mantener complejidad baja
  let page = 1;
  const perPage = 10;
  while (true) {
    const data = await gql(GAMES_QUERY, { eventId: String(sggEventId), page, perPage });
    const nodes = data?.event?.sets?.nodes ?? [];

    for (const set of nodes) {
      if (!set.games || set.games.length === 0) continue;

      const slot1EntrantId = String(set.slots?.[0]?.entrant?.id ?? '');
      const slot2EntrantId = String(set.slots?.[1]?.entrant?.id ?? '');

      const localP1Id = entrantToLocalId.get(slot1EntrantId) ?? null;
      const localP2Id = entrantToLocalId.get(slot2EntrantId) ?? null;

      // Construir array de games con personajes
      const gamesData = set.games
        .sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0))
        .map((g) => {
          const sels = Array.isArray(g.selections) ? g.selections : [];

          const charFor = (localPId) => {
            const entrantId = localPId?.replace('sgg_e_', '');
            const sel = sels.find(
              (s) => s.selectionType === 'CHARACTER' && String(s.entrant?.id) === entrantId
            );
            const rawVal = sel?.selectionValue;
            return rawVal != null ? (gameMap[String(rawVal)] ?? null) : null;
          };

          return {
            winnerId:          g.winnerId ? entrantToLocalId.get(String(g.winnerId)) ?? null : null,
            gameNumber:        g.orderNum ?? null,
            player1Character:  charFor(localP1Id),
            player2Character:  charFor(localP2Id),
          };
        });

      const sggSetId = String(set.id);

      // Derivar scores contando wins por jugador en el game log
      const p1GameWins = gamesData.filter((g) => g.winnerId && g.winnerId === localP1Id).length;
      const p2GameWins = gamesData.filter((g) => g.winnerId && g.winnerId === localP2Id).length;

      // Actualizar tournament_match
      const tm = tmBySetId.get(sggSetId);
      if (tm) {
        tm.games        = gamesData;
        tm.player1Characters = [...new Set(gamesData.map((g) => g.player1Character).filter(Boolean))];
        tm.player2Characters = [...new Set(gamesData.map((g) => g.player2Character).filter(Boolean))];
        // Sobreescribir scores con el conteo real de game wins si hay games
        if (gamesData.length > 0) {
          tm.player1Score = p1GameWins;
          tm.player2Score = p2GameWins;
        }
        tm.updatedAt    = now;
        await tournamentMatches.upsert(tm);
        setsUpdated++;
      }

      // Actualizar bracket match (fase de eliminación)
      const bracketMatch = bracketById.get(`sgg_s_${sggSetId}`);
      if (bracketMatch) {
        bracketMatch.games = gamesData;
        bracketMatch.participant1Characters = [...new Set(gamesData.map((g) => g.player1Character).filter(Boolean))];
        bracketMatch.participant2Characters = [...new Set(gamesData.map((g) => g.player2Character).filter(Boolean))];
        if (gamesData.length > 0) {
          bracketMatch.participant1Score = p1GameWins;
          bracketMatch.participant2Score = p2GameWins;
        }
      }

      // Actualizar pool set en importedPhases (si es un set de pool round-robin)
      const p1Chars = [...new Set(gamesData.map((g) => g.player1Character).filter(Boolean))];
      const p2Chars = [...new Set(gamesData.map((g) => g.player2Character).filter(Boolean))];
      for (const phase of tournament.importedPhases ?? []) {
        for (const group of phase.groups ?? []) {
          if (!group.sets) continue;
          const poolSet = group.sets.find((s) => s.id === `sgg_s_${sggSetId}`);
          if (poolSet) {
            poolSet.player1Characters = p1Chars;
            poolSet.player2Characters = p2Chars;
          }
        }
      }
    }

    const { totalPages } = data?.event?.sets?.pageInfo ?? {};
    if (!totalPages || page >= totalPages) break;
    page++;
  }

  // Guardar tournament actualizado (bracket con personajes)
  tournament.updatedAt = now;
  await tournaments.upsert(tournament);

  const summary = { localTournamentId, setsUpdated, localGameId };
  console.log(`[startgg] Character enrichment complete:`, summary);
  return summary;
}
