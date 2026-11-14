/**
 * shared/query — one query language, three executors.
 *
 * The same declarative spec is run by:
 *   - this module's runQuery()   (JSON adapter, and the browser when offline)
 *   - supabaseDb.query()         (translated to PostgREST filters on the JSONB column)
 * so a filtered / searched / paginated list returns the same rows online and offline.
 *
 * Spec:
 *   {
 *     where:  [ Cond, ... ]                       // AND of conditions
 *     search: { text, fields: ['name','alias'] }  // case-insensitive "contains" on ANY field
 *     sort:   [ { field, dir: 'asc'|'desc', type?: 'text'|'number' } ]
 *     offset, limit
 *   }
 *   Cond = { field, op: 'eq'|'neq'|'in'|'nin'|'null', value }  |  { or: [Cond] }  |  { and: [Cond] }
 *   Field = dot path into the record ('type', 'games.ssbu.eloPoints').
 *
 * Semantics intentionally mirror SQL on `data->>'field'` so both executors agree:
 *   - values compare as text (1651 == '1651');
 *   - eq/neq/in/nin never match a missing/null field (SQL NULL); use op 'null' for that;
 *   - sorting puts null/missing last in both directions, ties broken by id.
 */

export const PAGE_SIZES = [25, 50, 75, 100];
export const DEFAULT_PAGE_SIZE = 25;

export class QueryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QueryError';
  }
}

// letters, digits, _ and - (ids such as community_c84b03a7-e5d2-… are path segments)
const SEGMENT = /^[A-Za-z0-9_-]+$/;

export function parsePath(field) {
  if (typeof field !== 'string' || !field) throw new QueryError('Invalid field');
  const segs = field.split('.');
  for (const s of segs) if (!SEGMENT.test(s)) throw new QueryError(`Invalid field: ${field}`);
  return segs;
}

export function getPath(item, field) {
  let cur = item;
  for (const seg of parsePath(field)) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
}

/** Text form used for comparisons (SQL `->>`): null for missing / null / objects. */
export function scalar(v) {
  if (v === null || v === undefined) return null;
  const t = typeof v;
  return t === 'string' || t === 'number' || t === 'boolean' ? String(v) : null;
}

export function clampPageSize(n, fallback = DEFAULT_PAGE_SIZE) {
  const v = Number(n);
  return PAGE_SIZES.includes(v) ? v : fallback;
}

export function normalizeSearch(search) {
  const text = typeof search?.text === 'string' ? search.text.trim().toLowerCase() : '';
  return text ? { text, fields: Array.isArray(search.fields) ? search.fields : [] } : null;
}

export function matchesCond(item, c) {
  if (c.or) return c.or.some((x) => matchesCond(item, x));
  if (c.and) return c.and.every((x) => matchesCond(item, x));
  const v = scalar(getPath(item, c.field));
  switch (c.op) {
    case 'eq': return v !== null && v === String(c.value);
    case 'neq': return v !== null && v !== String(c.value);
    case 'in': return v !== null && c.value.some((x) => String(x) === v);
    case 'nin': return v !== null && !c.value.some((x) => String(x) === v);
    case 'null': return c.value === false ? v !== null : v === null;
    default: throw new QueryError(`Unknown op: ${c.op}`);
  }
}

export function matchesSearch(item, search) {
  return search.fields.some((f) => scalar(getPath(item, f))?.toLowerCase().includes(search.text));
}

function sortValue(item, s) {
  const raw = getPath(item, s.field);
  if (raw === null || raw === undefined) return null;
  if (s.type === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return scalar(raw);
}

function cmpValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export function compareItems(a, b, sort = []) {
  for (const s of sort) {
    const va = sortValue(a, s);
    const vb = sortValue(b, s);
    if (va === null && vb === null) continue;
    if (va === null) return 1;           // null/missing last in both directions
    if (vb === null) return -1;
    const c = cmpValues(va, vb);
    if (c !== 0) return s.dir === 'desc' ? -c : c;
  }
  return String(a.id ?? '') < String(b.id ?? '') ? -1 : String(a.id ?? '') > String(b.id ?? '') ? 1 : 0;
}

/** Filter + search + sort + slice an in-memory array. Returns { items, total } (total before slicing). */
export function runQuery(items, spec = {}) {
  let out = items;
  const where = spec.where ?? [];
  if (where.length) out = out.filter((i) => where.every((c) => matchesCond(i, c)));
  const search = normalizeSearch(spec.search);
  if (search) out = out.filter((i) => matchesSearch(i, search));
  const total = out.length;
  out = [...out].sort((a, b) => compareItems(a, b, spec.sort));
  const offset = spec.offset ?? 0;
  if (offset || spec.limit != null) out = out.slice(offset, spec.limit == null ? undefined : offset + spec.limit);
  return { items: out, total };
}

export function totalPagesFor(total, pageSize) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Run one page of a spec over an array, clamping `page` into range. */
export function runPage(items, spec, page, pageSize) {
  const size = clampPageSize(pageSize);
  const probe = runQuery(items, { ...spec, offset: 0, limit: 0 });
  const totalPages = totalPagesFor(probe.total, size);
  const safePage = Math.min(Math.max(1, Math.floor(Number(page)) || 1), totalPages);
  const res = runQuery(items, { ...spec, offset: (safePage - 1) * size, limit: size });
  return { items: res.items, total: res.total, page: safePage, pageSize: size, totalPages };
}

// ── Validation of client-supplied specs (routes) ─────────────────────────

const MAX_LEAVES = 30;
const MAX_DEPTH = 3;
const MAX_LIST = 100;
const MAX_TEXT = 200;

function fieldAllowed(field, allowed) {
  const segs = parsePath(field);
  return allowed.some((pattern) => {
    const p = pattern.split('.');
    return p.length === segs.length && p.every((s, i) => s === '*' || s === segs[i]);
  });
}

function cleanValue(v) {
  if (typeof v === 'string') {
    if (v.length > MAX_TEXT) throw new QueryError('Value too long');
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  throw new QueryError('Invalid value');
}

/**
 * Sanitise a spec coming from the browser. Only whitelisted fields are accepted:
 *   rules = { filterFields: [...], searchFields: [...], sortFields: [...] }  ('*' = any one segment)
 * Throws QueryError (route → 400). Never trusts `offset`/`limit` (routes set them).
 */
export function validateSpec(raw, rules) {
  const spec = { where: [], search: null, sort: [] };
  if (raw === null || raw === undefined) return spec;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new QueryError('Invalid query');
  let leaves = 0;

  const cond = (c, depth) => {
    if (!c || typeof c !== 'object') throw new QueryError('Invalid condition');
    if (depth > MAX_DEPTH) throw new QueryError('Condition too deep');
    for (const key of ['or', 'and']) {
      if (c[key] !== undefined) {
        if (!Array.isArray(c[key]) || !c[key].length || c[key].length > MAX_LIST) throw new QueryError('Invalid condition group');
        return { [key]: c[key].map((x) => cond(x, depth + 1)) };
      }
    }
    if (++leaves > MAX_LEAVES) throw new QueryError('Too many conditions');
    if (!fieldAllowed(c.field, rules.filterFields ?? [])) throw new QueryError(`Filter not allowed: ${c.field}`);
    if (c.op === 'null') return { field: c.field, op: 'null', value: c.value === false ? false : true };
    if (c.op === 'eq' || c.op === 'neq') return { field: c.field, op: c.op, value: cleanValue(c.value) };
    if (c.op === 'in' || c.op === 'nin') {
      if (!Array.isArray(c.value) || c.value.length > MAX_LIST) throw new QueryError('Invalid list');
      return { field: c.field, op: c.op, value: c.value.map(cleanValue) };
    }
    throw new QueryError(`Unknown op: ${c.op}`);
  };

  if (raw.where !== undefined) {
    if (!Array.isArray(raw.where)) throw new QueryError('Invalid where');
    spec.where = raw.where.map((c) => cond(c, 1));
  }

  const searchFields = rules.searchFields ?? [];
  const search = normalizeSearch(raw.search);
  if (search) {
    if (search.text.length > MAX_TEXT) throw new QueryError('Search too long');
    const asked = search.fields.filter((f) => searchFields.includes(f));
    spec.search = { text: search.text, fields: asked.length ? asked : searchFields };
  }

  if (raw.sort !== undefined) {
    if (!Array.isArray(raw.sort) || raw.sort.length > 3) throw new QueryError('Invalid sort');
    spec.sort = raw.sort.map((s) => {
      if (!s || !fieldAllowed(s.field, rules.sortFields ?? [])) throw new QueryError(`Sort not allowed: ${s?.field}`);
      return { field: s.field, dir: s.dir === 'desc' ? 'desc' : 'asc', type: s.type === 'number' ? 'number' : 'text' };
    });
  }
  return spec;
}
