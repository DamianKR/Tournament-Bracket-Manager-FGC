/**
 * paginate — shared plumbing for paginated list endpoints.
 *
 * Opt-in: a route paginates only when the request carries ?page= or ?pageSize=,
 * so existing array-returning callers keep working untouched.
 *
 *   GET /api/x?communityId=c&page=2&pageSize=50&q={"where":[...],"search":{"text":"ale"},"sort":[...]}
 *   → { items, total, page, pageSize, totalPages }
 *
 * The browser's `q` is validated against per-route whitelists (validateSpec);
 * the route then PREPENDS its own mandatory scope conditions (community,
 * visibility…) so a client can never widen what it is allowed to read.
 */

import { DEFAULT_PAGE_SIZE, QueryError, clampPageSize, runPage, totalPagesFor, validateSpec } from '../../shared/query.js';

export function isPaged(query) {
  return query.page !== undefined || query.pageSize !== undefined;
}

/** Parse + sanitise `?q=` (JSON). Throws QueryError → send with sendQueryError. */
export function parseClientSpec(query, rules) {
  let raw = null;
  if (query.q !== undefined) {
    try {
      raw = JSON.parse(String(query.q));
    } catch {
      throw new QueryError('Invalid q');
    }
  }
  return validateSpec(raw, rules);
}

/** Server-owned conditions always come first and cannot be overridden. */
export function withScope(spec, ...scope) {
  return { ...spec, where: [...scope.flat().filter(Boolean), ...(spec.where ?? [])] };
}

/**
 * Run one page. An out-of-range page is clamped to the last page (e.g. the
 * last item of the last page was deleted while the client was on it).
 */
export async function runPagedQuery(collection, spec, query, { defaultPageSize = DEFAULT_PAGE_SIZE } = {}) {
  const pageSize = clampPageSize(query.pageSize, defaultPageSize);
  let page = Math.max(1, parseInt(query.page, 10) || 1);
  const exec = (p) => collection.query({ ...spec, offset: (p - 1) * pageSize, limit: pageSize });

  let res = await exec(page);
  const totalPages = totalPagesFor(res.total, pageSize);
  if (page > totalPages) {
    page = totalPages;
    res = await exec(page);
  }
  return { items: res.items, total: res.total, page, pageSize, totalPages };
}

/**
 * Page a list the route already computed in memory (leaderboard with derived
 * positions, users filtered by JS visibility rules…). Same response shape and
 * page clamping as runPagedQuery; filter/search/sort come from the validated spec.
 */
export function pageInMemory(rows, spec, query, { defaultPageSize = DEFAULT_PAGE_SIZE } = {}) {
  return runPage(rows, spec, query.page, clampPageSize(query.pageSize, defaultPageSize));
}

/** Respond 400 for QueryError. Returns true when it handled the error. */
export function sendQueryError(res, err) {
  if (!(err instanceof QueryError)) return false;
  res.status(400).json({ error: err.message });
  return true;
}
