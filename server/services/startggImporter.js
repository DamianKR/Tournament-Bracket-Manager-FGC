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

const GQL_TIMEOUT_MS = 30000;
const GQL_MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GraphQL call con timeout (30s) y retry con backoff para errores
 * transitorios (429 rate-limit, 5xx, fallos de red/timeout).
 * Los errores 4xx que no son 429 (query inválida, auth, etc.) no se reintentan.
 */
async function gql(query, variables = {}, attempt = 1) {
  if (!ACCESS_TOKEN) throw new Error('STARTGG_ACCESS_TOKEN no configurado');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GQL_TIMEOUT_MS);

  try {
    const res = await fetch(STARTGG_API, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    // Errores transitorios → retry con backoff
    if (res.status === 429 || res.status >= 500) {
      if (attempt < GQL_MAX_ATTEMPTS) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1000 * Math.pow(2, attempt - 1);
        console.warn(`[startgg] API ${res.status}, retry ${attempt}/${GQL_MAX_ATTEMPTS - 1} in ${wait}ms`);
        await sleep(wait);
        return gql(query, variables, attempt + 1);
      }
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`start.gg API error ${res.status}: ${text}`);
    }

    const json = await res.json();
    if (json.errors) {
      throw new Error(`start.gg GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    return json.data;
  } catch (err) {
    // Timeout o error de red → retry
    const retriable = err.name === 'AbortError' || err.cause?.code === 'ECONNRESET' || err instanceof TypeError;
    if (retriable && attempt < GQL_MAX_ATTEMPTS) {
      const wait = 1000 * Math.pow(2, attempt - 1);
      console.warn(`[startgg] Request failed (${err.name}), retry ${attempt}/${GQL_MAX_ATTEMPTS - 1} in ${wait}ms`);
      await sleep(wait);
      return gql(query, variables, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Operation lock ───────────────────────────────────────────────────────
// Una sola operación sensible (import o enrich) a la vez. Evita lost-updates:
// ambas funciones leen el torneo entero, mutan y lo vuelven a escribir — si
// corren en paralelo el último upsert pisa los cambios del otro.

let sggOpInFlight = null;

/**
 * Intenta adquirir el lock de operaciones start.gg.
 * @returns {(() => void) | null} release function, o null si ya hay una op.
 */
export function tryAcquireSggOp(label) {
  if (sggOpInFlight) return null;
  sggOpInFlight = label;
  return () => { sggOpInFlight = null; };
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
    // Short URL form: start.gg/<slug> → single path segment
    if (parts.length === 1) return parts[0];
    // Fallback: last segment that isn't 'event'/details pages
    const evtIdx = parts.indexOf('event');
    if (evtIdx > 0) return parts[evtIdx - 1];
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

// Sets NO completados (pendientes o en juego) — se usa para rechazar la
// importación de torneos que aún están en curso.
const PENDING_SETS_QUERY = `
  query EventPendingSets($eventId: ID!, $page: Int!, $perPage: Int!) {
    event(id: $eventId) {
      sets(page: $page, perPage: $perPage, filters: { hideEmpty: true, state: [1, 2] }) {
        pageInfo { total totalPages }
        nodes {
          id
          state
          round
          fullRoundText
          slots {
            entrant { id }
            prereqType
            prereqId
          }
          phaseGroup {
            phase { id bracketType }
          }
        }
      }
    }
  }
`;

async function fetchPendingSets(eventId) {
  const all = [];
  let page = 1;
  const perPage = 50;
  while (true) {
    const data = await gql(PENDING_SETS_QUERY, { eventId, page, perPage });
    const nodes = data?.event?.sets?.nodes ?? [];
    all.push(...nodes);
    const { totalPages } = data?.event?.sets?.pageInfo ?? {};
    if (!totalPages || page >= totalPages) break;
    page++;
  }
  return all;
}

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

// ── Bracket classification (estructural, sin depender del texto) ─────────

/**
 * Clasifica cada set estructuralmente — NO usa fullRoundText (los TOs pueden
 * renombrar rondas o usar otros idiomas).
 *
 * Reglas (start.gg):
 *   - phase.bracketType === 'ROUND_ROBIN'          → 'round_robin'
 *   - set.round < 0 en una fase DE                 → 'loser'   (losers bracket)
 *   - ronda positiva alimentada por un set loser   → 'grand_final'
 *   - ronda positiva alimentada por el grand_final → 'grand_final_reset'
 *   - resto                                        → 'winner'
 *
 * @param {Array} sggSets - raw sets (ya traídos de start.gg)
 * @returns {Map<string, string>} sggSetId → bracket type
 */
function classifySets(sggSets) {
  const byId = new Map();
  for (const s of sggSets) byId.set(String(s.id), s);

  const typeById = new Map();

  function classify(set) {
    const id = String(set.id);
    if (typeById.has(id)) return typeById.get(id);

    const phaseType = set.phaseGroup?.phase?.bracketType;
    let type;

    if (phaseType === 'ROUND_ROBIN') {
      type = 'round_robin';
    } else {
      // Mirar de qué sets vienen sus slots (prereq analysis)
      const prereqTypes = new Set();
      for (const slot of set.slots ?? []) {
        if (slot?.prereqType !== 'set' || slot?.prereqId == null) continue;
        const pre = byId.get(String(slot.prereqId));
        if (pre) prereqTypes.add(classify(pre));
      }

      if (prereqTypes.has('grand_final') || prereqTypes.has('grand_final_reset')) {
        // Alimentado por el Grand Final → es el reset (prioridad sobre round)
        type = 'grand_final_reset';
      } else if (set.round != null && set.round < 0) {
        type = 'loser';
      } else if (prereqTypes.has('loser')) {
        // Un set de ronda positiva alimentado por losers = Grand Final
        type = 'grand_final';
      } else if (set.round == null && /loser/i.test(set.fullRoundText ?? '')) {
        // Último recurso: sin round ni prereqs útiles, texto como fallback
        type = 'loser';
      } else {
        type = 'winner';
      }
    }

    typeById.set(id, type);
    return type;
  }

  for (const s of sggSets) classify(s);
  return typeById;
}

/**
 * Detecta un Grand Final Reset "muerto": el set existe en start.gg con los dos
 * slots llenos pero nunca se jugó porque el campeón del winners bracket ganó
 * la Grand Final. Lo reconocemos porque:
 *   - está pendiente (no completado)
 *   - sus slots vienen de un set grand_final YA completado
 *   - el ganador de esa GF es el participante del lado winners
 *
 * @param {object} set         - set pendiente de start.gg (con slots+prereqs)
 * @param {Map}    typeById    - sggSetId → bracket type (de classifySets)
 * @param {Map}    setsById    - sggSetId → set completado
 * @returns {boolean}
 */
function isDeadResetSet(set, typeById, setsById) {
  for (const slot of set.slots ?? []) {
    if (slot?.prereqType !== 'set' || slot?.prereqId == null) continue;
    const gf = setsById.get(String(slot.prereqId));
    if (!gf || typeById.get(String(gf.id)) !== 'grand_final') continue;
    if (gf.winnerId == null) continue;

    // Slot del GF alimentado por el winners bracket = lado winners
    for (const gfSlot of gf.slots ?? []) {
      if (gfSlot?.prereqType !== 'set') continue;
      const feeder = setsById.get(String(gfSlot.prereqId));
      if (feeder && typeById.get(String(feeder.id)) === 'winner'
          && String(gfSlot.entrant?.id) === String(gf.winnerId)) {
        return true; // ganó el lado winners → el reset nunca se jugó
      }
    }
  }
  return false;
}

/**
 * Reconstruye nextWinnerMatchId y nextLoserMatchId en los bracket matches
 * usando prereqType/prereqId de los slots + la clasificación estructural.
 *
 * Regla: si el set destino es de losers y el set origen NO → el perdedor del
 * origen cae aquí (nextLoserMatchId). En cualquier otro caso el ganador del
 * origen avanza (nextWinnerMatchId).
 *
 * @param {Array}              matches  - bracket matches (id = 'sgg_s_{setId}')
 * @param {Array}              sets     - raw sets de start.gg
 * @param {Map<string,string>} typeById - clasificación de classifySets
 */
function reconstructBracketLinks(matches, sets, typeById) {
  // Índice: sgg set ID (string) → bracket match
  const matchBySggId = new Map();
  for (const m of matches) {
    const sggId = m.id.replace('sgg_s_', '');
    matchBySggId.set(sggId, m);
  }

  for (const targetSet of sets) {
    const targetId    = String(targetSet.id);
    const targetMatch = matchBySggId.get(targetId);
    const targetIsLoser = typeById.get(targetId) === 'loser';

    for (const slot of targetSet.slots ?? []) {
      if (slot?.prereqType !== 'set' || slot?.prereqId == null) continue;

      const sourceMatch = matchBySggId.get(String(slot.prereqId));
      if (!sourceMatch || !targetMatch) continue;

      const sourceIsLoser = typeById.get(String(slot.prereqId)) === 'loser';

      if (targetIsLoser && !sourceIsLoser) {
        // El perdedor del set origen (winners) cae en este set de losers
        sourceMatch.nextLoserMatchId = targetMatch.id;
      } else if (!sourceMatch.nextWinnerMatchId) {
        // El ganador del origen avanza aquí
        sourceMatch.nextWinnerMatchId = targetMatch.id;
      }
    }
  }
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

  // 2b. Rechazar torneos aún en curso — NO importamos brackets a medio jugar:
  //     - un evento terminado siempre tiene un standing con placement 1
  //     - cualquier set en state=2 (en juego) indica que sigue activo
  //     - un set pendiente (state=1) con slots llenos también indica actividad,
  //       EXCEPTO el "dead reset": el set de Grand Final Reset que start.gg
  //       crea aunque el campeón de winners ganara la GF y el reset no se jugó.
  const typeById = classifySets(sggSets);
  const setsById = new Map(sggSets.map((s) => [String(s.id), s]));

  const hasChampion = sggStandings.some((s) => s.placement === 1);
  if (!hasChampion) {
    throw new Error(
      'Este evento aún está en curso o no tiene standings publicados. ' +
      'Importa el torneo una vez haya finalizado en start.gg.'
    );
  }

  try {
    const pendingSets = await fetchPendingSets(sggEventId);
    const livePending = pendingSets.filter(
      (s) => s.state === 2 || (s.slots?.length >= 2 && s.slots.every((sl) => sl?.entrant))
    );
    const realPending = livePending.filter((s) => !isDeadResetSet(s, typeById, setsById));
    if (realPending.length > 0) {
      throw new Error(
        `Este evento aún está en curso (${realPending.length} sets pendientes/en juego). ` +
        'Importa el torneo una vez haya finalizado en start.gg.'
      );
    }
  } catch (err) {
    // Si la propia comprobación falla por la API, pero el mensaje es nuestro
    // "aún en curso" hay que propagarlo; errores de fetch se ignoran porque
    // el check de campeón ya garantiza el estado.
    if (err.message?.includes('aún está en curso')) throw err;
    console.warn('[startgg] Pending-sets check skipped:', err.message);
  }

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
      // c) Check if stub already exists (from a previous import, same community)
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
      // Create stub GlobalParticipant.
      // El id `gp_sgg_{entrantId}` es el preferido; si YA existe en otra
      // comunidad (mismo entrant importado en dos comunidades) se sufixa con
      // el communityId para no sobreescribir el stub ajeno.
      let stubId = `gp_sgg_${sggEntrantId}`;
      const clash = allLocalParticipants.find((lp) => lp.id === stubId);
      if (clash && clash.communityId !== communityId) {
        stubId = `gp_sgg_${sggEntrantId}_${communityId}`;
      }
      const stub = {
        id:        stubId,
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
      // Check if stub already exists by generated ID (misma comunidad)
      const existingStub = allLocalParticipants.find(
        (lp) => lp.id === stub.id && lp.communityId === communityId
      );
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
        allLocalParticipants.push(stub); // evitar colisiones dentro del mismo import
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

  // 7b. Torneo previo del mismo evento (re-import) — para preservar datos
  //     enriquecidos (personajes/games) y revertir ELO antes de re-aplicarlo.
  const allTournamentsNow = await tournaments.getAll();
  const previousRecord = allTournamentsNow.find(
    (t) => t.importedFrom === 'startgg'
        && String(t.startggEventId) === sggEventId
        && t.communityId === communityId
  );
  const prevBracketById = new Map();
  if (previousRecord?.bracket) {
    for (const m of [
      ...(previousRecord.bracket.winnerBracket ?? []),
      ...(previousRecord.bracket.loserBracket  ?? []),
      ...(previousRecord.bracket.grandFinal      ? [previousRecord.bracket.grandFinal]      : []),
      ...(previousRecord.bracket.grandFinalReset ? [previousRecord.bracket.grandFinalReset] : []),
    ]) {
      prevBracketById.set(m.id, m);
    }
  }
  const prevTmBySggSetId = new Map();
  {
    const allTm = await tournamentMatches.getAll();
    for (const tm of allTm) {
      if (tm.tournamentId !== previousRecord?.id) continue;
      const m = /^tm_sgg_(\d+)/.exec(tm.id);
      if (m) prevTmBySggSetId.set(m[1], tm);
    }
  }

  /**
   * Índice del slot (0/1) del set alimentado por el losers bracket, o -1.
   * Se usa para normalizar la orientación del Grand Final.
   */
  const lbSlotIndexOf = (set) =>
    (set.slots ?? []).findIndex((slot) => {
      if (slot?.prereqType !== 'set' || slot?.prereqId == null) return false;
      const feeder = setsById.get(String(slot.prereqId));
      return feeder && typeById.get(String(feeder.id)) === 'loser';
    });

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

    const bType = typeById.get(String(set.id)) ?? 'winner';

    // Grand Final: el participant2 debe ser el campeón del losers bracket
    // (convención que usa checkTournamentCompletion para crear el reset).
    // Si start.gg lo puso en slot 0, invertimos la orientación del match.
    const flip = bType === 'grand_final' && lbSlotIndexOf(set) === 0;

    // Resolver ganador SIN asumir defaults: si winnerId no coincide con ningún
    // slot (doble DQ, datos raros) dejamos null — nunca inventar un ganador.
    const sggWinnerId = set.winnerId != null ? String(set.winnerId) : null;
    const localWinnerId = sggWinnerId === String(slot1Entrant.id)
      ? e1.tournamentLocalId
      : sggWinnerId === String(slot2Entrant.id)
        ? e2.tournamentLocalId
        : null;
    const localLoserId = localWinnerId === e1.tournamentLocalId
      ? e2.tournamentLocalId
      : localWinnerId === e2.tournamentLocalId
        ? e1.tournamentLocalId
        : null;

    const { score1, score2 } = parseSetScores(
      set.displayScore,
      slot1Entrant.id,
      slot2Entrant.id,
      set.winnerId,
      set.slots
    );

    // start.gg usa valores negativos para el loser bracket (-1, -2…); usamos abs
    const roundNum = Math.abs(set.round ?? 1);
    const matchId  = `sgg_s_${set.id}`;

    const match = {
      id:                matchId,
      roundNumber:       roundNum,
      matchNumber:       set.id,
      roundLabel:        set.fullRoundText ?? undefined,
      bracketType:       bType,
      participant1Id:    flip ? e2.tournamentLocalId : e1.tournamentLocalId,
      participant2Id:    flip ? e1.tournamentLocalId : e2.tournamentLocalId,
      winnerId:          localWinnerId,
      loserId:           localLoserId,
      status:            'completed',
      nextWinnerMatchId: null,
      nextLoserMatchId:  null,
      participant1Score: flip ? score2 : score1,
      participant2Score: flip ? score1 : score2,
      games:             [],
      // phaseGroupId permite filtrar qué matches pertenecen a cada pool DE/SE
      phaseGroupId:      set.phaseGroup?.id ? String(set.phaseGroup.id) : undefined,
      phaseId:           set.phaseGroup?.phase?.id ? String(set.phaseGroup.phase.id) : undefined,
    };

    // Re-import: preservar datos enriquecidos (personajes/games) del torneo
    // previo para que un re-import no borre el trabajo de "Importar personajes".
    // prevMatch ya está en orientación del match; prevTm está en orden de slot
    // (player1 = slots[0]) → si flip hay que invertir sus campos player1/2.
    const prevMatch = prevBracketById.get(matchId);
    const prevTm    = prevTmBySggSetId.get(String(set.id));
    const prevGames = prevMatch?.games?.length ? prevMatch.games
      : prevTm?.games?.length ? prevTm.games
      : null;
    const tmNeedsSwap = !prevMatch?.games?.length && flip;
    if (prevGames) {
      match.games = prevGames.map((g) => ({
        winnerId:         g.winnerId,
        gameNumber:       g.gameNumber,
        player1Character: tmNeedsSwap ? g.player2Character : g.player1Character,
        player2Character: tmNeedsSwap ? g.player1Character : g.player2Character,
        ...(g.player1Color != null || g.player2Color != null ? {
          player1Color: tmNeedsSwap ? g.player2Color : g.player1Color,
          player2Color: tmNeedsSwap ? g.player1Color : g.player2Color,
        } : {}),
      }));
    }
    const prevP1Chars = prevMatch?.participant1Characters?.length
      ? prevMatch.participant1Characters
      : (tmNeedsSwap ? prevTm?.player2Characters : prevTm?.player1Characters);
    const prevP2Chars = prevMatch?.participant2Characters?.length
      ? prevMatch.participant2Characters
      : (tmNeedsSwap ? prevTm?.player1Characters : prevTm?.player2Characters);
    if (prevP1Chars?.length) match.participant1Characters = prevP1Chars;
    if (prevP2Chars?.length) match.participant2Characters = prevP2Chars;

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
  reconstructBracketLinks(allBracketMatches, sggSets, typeById);

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

  // 11. Build tournament record
  // El ID es community-scoped: `sgg_event_{id}` si está libre o es re-import en
  // la misma comunidad; si el evento ya existe en OTRA comunidad se añade el
  // communityId para no robarle el torneo a la otra comunidad.
  const otherCommunityRecord = allTournamentsNow.find(
    (t) => t.importedFrom === 'startgg'
        && String(t.startggEventId) === sggEventId
        && t.communityId !== communityId
  );
  const tournamentId = previousRecord?.id
    ?? (otherCommunityRecord
      ? `sgg_event_${sggEventId}_${communityId}`
      : `sgg_event_${sggEventId}`);

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
    // Re-import sin givesPoints: conservar el estado ELO previo para que el
    // delete-route siga pudiendo revertirlo y no se pierda el flag.
    ...(previousRecord?.eloApplied ? {
      eloApplied:  previousRecord.eloApplied,
      eloUpdates:  previousRecord.eloUpdates,
    } : {}),
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
  // En re-import: revertir el pago previo ANTES de recalcular para no duplicar.
  if (givesPoints) {
    const { applyTournamentElo, revertTournamentElo } = await import('../utils/tournamentElo.js');
    if (previousRecord?.eloApplied) {
      console.log(`[startgg] Re-import: reverting previous ELO payout before re-applying`);
      await revertTournamentElo(previousRecord);
    }
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

    // Winner null-safe: nunca fabricar un ganador cuando start.gg no lo tiene
    const sggWinnerId = set.winnerId != null ? String(set.winnerId) : null;
    const winnerEntry = sggWinnerId === String(slot1Entrant.id) ? e1
      : sggWinnerId === String(slot2Entrant.id) ? e2
      : null;

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
    // El id del tm lleva el mismo sufijo que el tournamentId — los tm son una
    // colección global y el mismo setId colisionaría entre comunidades.
    const tmSuffix = tournamentId === `sgg_event_${sggEventId}` ? '' : `_${communityId}`;
    const tmId = `tm_sgg_${set.id}${tmSuffix}`;
    const tmRecord = {
      id:               tmId,
      startggSetId:     String(set.id),   // lookup estable aunque el id tenga sufijo
      round:            set.round ?? 1,
      roundLabel:       set.fullRoundText ?? null,
      bracketType:      sggPhaseType === 'ROUND_ROBIN'
                          ? 'round_robin'
                          : (typeById.get(String(set.id)) ?? 'winner'),
      poolName:         sggPhaseType === 'ROUND_ROBIN' && set.phaseGroup?.displayIdentifier
                          ? `Pool ${set.phaseGroup.displayIdentifier}`
                          : null,
      phaseGroupId:     set.phaseGroup?.id ? String(set.phaseGroup.id) : null,
      matchNumber:      set.id,
      gameId:           localGameId,
      winnerId:         winnerEntry
                          ? winnerEntry.tournamentLocalId
                          : null,
      winnerGlobalId:   winnerEntry?.globalParticipant.id ?? null,
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
      // Preservar games/chars de un enriquecimiento previo en re-imports
      games:            prevTmBySggSetId.get(String(set.id))?.games?.length
                          ? prevTmBySggSetId.get(String(set.id)).games
                          : [],
      ...(prevTmBySggSetId.get(String(set.id))?.player1Characters?.length ? {
        player1Characters: prevTmBySggSetId.get(String(set.id)).player1Characters,
        player2Characters: prevTmBySggSetId.get(String(set.id))?.player2Characters ?? [],
      } : {}),
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
      // Preferir el campo startggSetId (robusto con ids con sufijo de
      // comunidad); fallback al parseo del id legacy 'tm_sgg_{setId}'.
      const sggId = tm.startggSetId ?? /^tm_sgg_(\d+)/.exec(tm.id)?.[1];
      if (sggId) tmBySetId.set(String(sggId), tm);
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

          // Captura oportunista de color/skin — start.gg puede incluir
          // selections con types adicionales según el juego.
          const colorFor = (localPId) => {
            const entrantId = localPId?.replace('sgg_e_', '');
            const sel = sels.find(
              (s) => ['COSTUME', 'COLOR', 'SKIN', 'VARIANT'].includes(s.selectionType)
                  && String(s.entrant?.id) === entrantId
            );
            const v = sel?.selectionValue;
            const n = v != null ? Number(v) : NaN;
            return Number.isFinite(n) ? n : undefined;
          };

          const c1 = colorFor(localP1Id);
          const c2 = colorFor(localP2Id);
          return {
            winnerId:          g.winnerId ? entrantToLocalId.get(String(g.winnerId)) ?? null : null,
            gameNumber:        g.orderNum ?? null,
            player1Character:  charFor(localP1Id),
            player2Character:  charFor(localP2Id),
            ...(c1 !== undefined ? { player1Color: c1 } : {}),
            ...(c2 !== undefined ? { player2Color: c2 } : {}),
          };
        });

      const sggSetId = String(set.id);

      // Derivar scores contando wins por jugador en el game log.
      // SOLO fiable si TODOS los games reportan ganador — si el TD subió
      // personajes pero no el ganador por game, los counts serían 0-0 y
      // destruirían los scores reales del displayScore.
      const allGamesHaveWinner = gamesData.length > 0 && gamesData.every((g) => g.winnerId != null);
      const p1GameWins = gamesData.filter((g) => g.winnerId && g.winnerId === localP1Id).length;
      const p2GameWins = gamesData.filter((g) => g.winnerId && g.winnerId === localP2Id).length;

      // Actualizar tournament_match
      const tm = tmBySetId.get(sggSetId);
      if (tm) {
        tm.games        = gamesData;
        tm.player1Characters = [...new Set(gamesData.map((g) => g.player1Character).filter(Boolean))];
        tm.player2Characters = [...new Set(gamesData.map((g) => g.player2Character).filter(Boolean))];
        // Solo sobreescribir scores con el conteo de games si es completo
        if (allGamesHaveWinner) {
          tm.player1Score = p1GameWins;
          tm.player2Score = p2GameWins;
        }
        tm.updatedAt    = now;
        await tournamentMatches.upsert(tm);
        setsUpdated++;
      }

      // Actualizar bracket match (fase de eliminación).
      // OJO: el Grand Final puede haberse normalizado en import (participant1
      // puede ser el entrant del slot 2) — detectar orientación y swap si hace
      // falta para que player1Character coincida con participant1Id.
      const bracketMatch = bracketById.get(`sgg_s_${sggSetId}`);
      if (bracketMatch) {
        const flipped = bracketMatch.participant1Id && localP1Id
          && bracketMatch.participant1Id === localP2Id
          && bracketMatch.participant2Id === localP1Id;
        const matchGames = flipped
          ? gamesData.map((g) => ({
              ...g,
              player1Character: g.player2Character,
              player2Character: g.player1Character,
              player1Color:     g.player2Color,
              player2Color:     g.player1Color,
            }))
          : gamesData;
        bracketMatch.games = matchGames;
        bracketMatch.participant1Characters = [...new Set(matchGames.map((g) => g.player1Character).filter(Boolean))];
        bracketMatch.participant2Characters = [...new Set(matchGames.map((g) => g.player2Character).filter(Boolean))];
        if (allGamesHaveWinner) {
          bracketMatch.participant1Score = flipped ? p2GameWins : p1GameWins;
          bracketMatch.participant2Score = flipped ? p1GameWins : p2GameWins;
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
