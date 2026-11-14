/**
 * historyQuery — one paginated history over three tables.
 *
 * Tournament, league and ranked (duel / matchmaking / free) matches live in
 * separate tables, so a page of the merged feed cannot be one SQL query.
 * Instead, for page P of size S each table returns its newest P*S rows (the
 * database filters, sorts and counts), the rows are merged by date and the
 * window [(P-1)*S, P*S) is cut. Totals are the sum of the per-table totals.
 *
 * Clients speak a unified vocabulary (shared/query spec over these fields):
 *   type       'tournament' | 'league' | 'duel' | 'matchmaking' | 'free'
 *   gameId     game id
 *   p1, p2     the two participants (global participant ids)
 *   winnerId   winner's participant id (null when unknown)
 *   date       when it happened (newest first is the only sort)
 * Each source maps those to its own columns; rows come back flattened with the
 * original record under `data`, and the browser stores/filters the very same
 * rows offline, so online and offline results agree.
 */

import { DEFAULT_PAGE_SIZE, QueryError, clampPageSize, compareItems, totalPagesFor } from '../../shared/query.js';

/** Deepest window (page * pageSize) a request may reach. */
export const MAX_WINDOW = 5000;

export const HISTORY_RULES = {
  filterFields: ['type', 'gameId', 'p1', 'p2', 'winnerId'],
  searchFields: [],
  sortFields: ['date'],          // accepted so the browser can reuse one spec offline; the order is always newest first
};

const COLUMNS = {
  tournament: { gameId: 'gameId', p1: 'player1GlobalId', p2: 'player2GlobalId', winnerId: 'winnerGlobalId', date: 'createdAt' },
  league: { gameId: 'gameId', p1: 'participant1Id', p2: 'participant2Id', winnerId: 'winnerId', date: 'completedDate' },
  ranked: { gameId: 'gameId', p1: 'playerAId', p2: 'playerBId', winnerId: 'winnerId', date: 'createdAt' },
};

const KINDS = Object.keys(COLUMNS);
const RANKED_TYPES = ['duel', 'matchmaking', 'free'];

const MAX_EVIDENCE_CHARS = 2048;

/**
 * League reports may carry base64 evidence photos. History never shows them, but the
 * browser keeps every row it receives: drop big photos (a short marker keeps the
 * "has evidence" flag truthy) so a few uploads cannot fill the local storage quota.
 */
function slimLeague(rec) {
  if (!rec.reportedResults?.some((r) => (r.evidence?.length ?? 0) > MAX_EVIDENCE_CHARS)) return rec;
  return {
    ...rec,
    reportedResults: rec.reportedResults.map((r) => ((r.evidence?.length ?? 0) > MAX_EVIDENCE_CHARS ? { ...r, evidence: '…' } : r)),
  };
}

/** Record → the flat row shared by server pages and the browser's offline copy. */
export function toRow(kind, rec) {
  const c = COLUMNS[kind];
  return {
    id: rec.id,
    kind,
    type: kind === 'ranked' ? rec.type ?? 'free' : kind,
    gameId: rec[c.gameId] ?? null,
    p1: rec[c.p1] ?? null,
    p2: rec[c.p2] ?? null,
    winnerId: rec[c.winnerId] ?? null,
    date: rec[c.date] ?? null,
    data: kind === 'league' ? slimLeague(rec) : rec,
  };
}

// ── unified condition → source condition ─────────────────────────────────
// translate() returns true (always satisfied), false (never) or a condition.

const orOf = (parts) => (parts.length === 1 ? parts[0] : { or: parts });

function rankedTypeCond(types) {
  const named = types.filter((t) => t !== 'free');
  const parts = [];
  if (named.length) parts.push({ field: 'type', op: 'in', value: named });
  if (types.includes('free')) parts.push({ field: 'type', op: 'null', value: true }, { field: 'type', op: 'eq', value: 'free' });
  return parts.length ? orOf(parts) : false;
}

function typeCond(c, kind) {
  const values = c.op === 'in' || c.op === 'nin' ? c.value.map(String) : [String(c.value)];
  if (kind !== 'ranked') {
    const hit = values.includes(kind);
    if (c.op === 'eq' || c.op === 'in') return hit;
    if (c.op === 'neq' || c.op === 'nin') return !hit;
    return c.value === false;          // op 'null': a type is never null
  }
  if (c.op === 'eq' || c.op === 'in') return rankedTypeCond(values.filter((v) => RANKED_TYPES.includes(v)));
  if (c.op === 'neq' || c.op === 'nin') return rankedTypeCond(RANKED_TYPES.filter((t) => !values.includes(t)));
  return c.value === false;
}

export function translate(c, kind) {
  if (c.or || c.and) {
    const isOr = !!c.or;
    const parts = (c.or ?? c.and).map((x) => translate(x, kind));
    const absorb = isOr ? true : false;       // one such part decides the whole group
    if (parts.some((p) => p === absorb)) return absorb;
    const rest = parts.filter((p) => p !== !absorb);
    if (!rest.length) return !absorb;
    return rest.length === 1 ? rest[0] : { [isOr ? 'or' : 'and']: rest };
  }
  if (c.field === 'type') return typeCond(c, kind);
  const column = COLUMNS[kind][c.field];
  if (!column || c.field === 'date') throw new QueryError(`Unknown field: ${c.field}`);
  return { ...c, field: column };
}

// ── paging ───────────────────────────────────────────────────────────────

/**
 * @param cols   { tournament, league, ranked } collections (jsonDb / supabaseDb)
 * @param scope  { tournament: Cond[], league: Cond[], ranked: Cond[] } — mandatory visibility
 * @param spec   validated unified spec (where only)
 */
export async function queryHistory({ cols, scope, spec, page, pageSize }) {
  const size = clampPageSize(pageSize, DEFAULT_PAGE_SIZE);
  const wanted = Math.max(1, parseInt(page, 10) || 1);

  const plans = [];
  for (const kind of KINDS) {
    const t = translate({ and: spec.where ?? [] }, kind);
    if (t === false) continue;
    plans.push({ kind, where: [...(scope[kind] ?? []), ...(t === true ? [] : [t])] });
  }

  async function fetchWindow(p) {
    const limit = p * size;
    if (limit > MAX_WINDOW) throw new QueryError('Page too deep');
    const results = await Promise.all(
      plans.map((pl) => cols[pl.kind].query({ where: pl.where, sort: [{ field: COLUMNS[pl.kind].date, dir: 'desc' }], offset: 0, limit }))
    );
    return results;
  }

  let current = wanted;
  if (current * size > MAX_WINDOW) {
    // Far past the end (stale page after deletions, hand-typed number): clamp using counts alone.
    const counted = await Promise.all(plans.map((pl) => cols[pl.kind].query({ where: pl.where, limit: 0 })));
    current = Math.min(current, totalPagesFor(counted.reduce((n, r) => n + r.total, 0), size));
  }
  let results = await fetchWindow(current);
  let total = results.reduce((n, r) => n + r.total, 0);
  const totalPages = totalPagesFor(total, size);
  if (current > totalPages) {
    current = totalPages;
    results = await fetchWindow(current);
  }

  const rows = results
    .flatMap((r, i) => r.items.map((rec) => toRow(plans[i].kind, rec)))
    .sort((a, b) => compareItems(a, b, [{ field: 'date', dir: 'desc' }]));
  return {
    items: rows.slice((current - 1) * size, current * size),
    total,
    page: current,
    pageSize: size,
    totalPages,
  };
}

/** Totals per type under the visibility scope alone (filter-chip counters). */
export async function historyCounts({ cols, scope }) {
  const count = async (kind, extra = []) => (await cols[kind].query({ where: [...(scope[kind] ?? []), ...extra], limit: 0 })).total;
  const rankedType = (t) => [translate({ field: 'type', op: 'eq', value: t }, 'ranked')];
  const [tournament, league, duel, matchmaking, free] = await Promise.all([
    count('tournament'),
    count('league'),
    count('ranked', rankedType('duel')),
    count('ranked', rankedType('matchmaking')),
    count('ranked', rankedType('free')),
  ]);
  return { tournament, league, duel, matchmaking, free };
}
