import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCollection } from '../db/jsonDb.js';
import { runQuery, validateSpec, QueryError } from '../../shared/query.js';
import { HISTORY_RULES, MAX_WINDOW, historyCounts, queryHistory, toRow, translate } from './historyQuery.js';

// ── deterministic fixture: ties across tables, legacy rows, other communities ──
let seed = 7;
function mulberry32() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rnd = (n) => Math.floor(mulberry32() * n);
const pick = (arr) => arr[rnd(arr.length)];
const P = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const STAMPS = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 0, 1, i)).toISOString());   // few stamps → many ties

const tournament = Array.from({ length: 140 }, (_, i) => {
  const [a, b] = [pick(P), pick(P)];
  return { id: `tm_${i}`, communityId: i % 7 ? 'c1' : 'c2', gameId: pick(['ssbu', 'sf6', undefined]), player1GlobalId: a, player2GlobalId: b, winnerGlobalId: pick([a, b, undefined]), createdAt: pick(STAMPS) };
});
const ranked = Array.from({ length: 120 }, (_, i) => {
  const [a, b] = [pick(P), pick(P)];
  return { id: `m_${i}`, communityId: i % 9 ? 'c1' : 'c2', gameId: pick(['ssbu', 'sf6']), type: pick(['duel', 'matchmaking', 'free', undefined]), playerAId: a, playerBId: b, winnerId: pick([a, b]), createdAt: pick(STAMPS) };
});
const league = Array.from({ length: 90 }, (_, i) => {
  const [a, b] = [pick(P), pick(P)];
  return { id: `lm_${i}`, leagueId: pick(['L1', 'L2', 'L3']), gameId: 'ssbu', status: pick(['completed', 'completed', 'no_show', 'scheduled']), participant1Id: a, participant2Id: b, winnerId: pick([a, b, undefined]), completedDate: pick([...STAMPS, undefined]) };
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'history-'));
const mk = (name, rows) => { const f = path.join(dir, `${name}.json`); fs.writeFileSync(f, JSON.stringify(rows)); return createCollection(f); };
const cols = { tournament: mk('t', tournament), league: mk('l', league), ranked: mk('r', ranked) };
const raw = { tournament, league, ranked };

const eqC1 = { or: [{ field: 'communityId', op: 'null', value: true }, { field: 'communityId', op: 'eq', value: 'c1' }] };
const scope = {
  tournament: [eqC1],
  ranked: [eqC1],
  league: [{ field: 'leagueId', op: 'in', value: ['L1', 'L2'] }, { field: 'status', op: 'in', value: ['completed', 'no_show'] }],
};

// oracle: every visible row, unified, filtered in memory (what the browser does offline)
const allRows = Object.keys(raw).flatMap((kind) => runQuery(raw[kind], { where: scope[kind] }).items.map((r) => toRow(kind, r)));
const oracle = (spec) => runQuery(allRows, { where: spec.where, sort: [{ field: 'date', dir: 'desc' }] });

async function allPages(spec, size) {
  const out = [];
  let page = 1, totalPages = 1, total = 0;
  do {
    const r = await queryHistory({ cols, scope, spec, page, pageSize: size });
    assert.equal(r.page, page);
    out.push(...r.items);
    totalPages = r.totalPages; total = r.total; page++;
  } while (page <= totalPages);
  return { out, total, totalPages };
}

const cond = {
  type: () => pick([
    { field: 'type', op: 'eq', value: pick(['tournament', 'league', 'duel', 'matchmaking', 'free']) },
    { field: 'type', op: 'in', value: ['duel', 'free'] },
    { field: 'type', op: 'in', value: ['tournament', 'matchmaking'] },
    { field: 'type', op: 'nin', value: pick([['duel'], ['duel', 'matchmaking'], ['free'], ['tournament', 'league']]) },
    { field: 'type', op: 'neq', value: pick(['league', 'free']) },
  ]),
  game: () => pick([
    { field: 'gameId', op: 'eq', value: 'ssbu' },
    { or: [{ field: 'gameId', op: 'null', value: true }, { field: 'gameId', op: 'in', value: ['ssbu'] }] },
  ]),
  player: () => { const x = pick(P); return { or: [{ field: 'p1', op: 'eq', value: x }, { field: 'p2', op: 'eq', value: x }] }; },
  win: () => { const x = pick(P); return pick([{ field: 'winnerId', op: 'eq', value: x }, { or: [{ field: 'winnerId', op: 'null', value: true }, { field: 'winnerId', op: 'neq', value: x }] }]); },
};

test('merged pages == filtering every unified row in memory, for 150 random filter combinations', async () => {
  for (let n = 0; n < 150; n++) {
    const where = Object.values(cond).filter(() => rnd(2)).map((f) => f());
    const spec = validateSpec({ where }, HISTORY_RULES);
    const exp = oracle(spec);
    for (const size of [25, 50]) {
      const got = await allPages(spec, size);
      assert.equal(got.total, exp.total, `total for ${JSON.stringify(where)}`);
      assert.deepEqual(got.out.map((r) => r.id), exp.items.map((r) => r.id), `rows for ${JSON.stringify(where)} @${size}`);
    }
  }
});

test('no filter: every visible row exactly once, newest first; scope hides other communities / leagues / unfinished', async () => {
  const spec = validateSpec({}, HISTORY_RULES);
  const { out, total } = await allPages(spec, 25);
  assert.equal(total, allRows.length);
  assert.equal(new Set(out.map((r) => r.id)).size, out.length);
  assert.ok(out.every((r) => r.kind !== 'league' || ['completed', 'no_show'].includes(r.data.status)));
  assert.ok(out.every((r) => r.kind !== 'league' || ['L1', 'L2'].includes(r.data.leagueId)));
  assert.ok(out.every((r) => r.kind === 'league' || r.data.communityId === 'c1'));
  const dates = out.map((r) => r.date).filter(Boolean);
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.equal(out.at(-1).date === null || out.at(-1).date <= dates[0], true, 'rows without a date sort last');
});

test('legacy ranked rows without a type count as "free"; league/tournament types are literal', async () => {
  const free = await allPages(validateSpec({ where: [{ field: 'type', op: 'eq', value: 'free' }] }, HISTORY_RULES), 100);
  assert.ok(free.out.length > 0, `got ${free.out.length} rows`);
  assert.deepEqual([...new Set(free.out.map((r) => `${r.kind}/${r.type}`))], ['ranked/free']);
  assert.ok(free.out.some((r) => r.data.type === undefined), 'untyped legacy rows are included');
  const league = await allPages(validateSpec({ where: [{ field: 'type', op: 'eq', value: 'league' }] }, HISTORY_RULES), 100);
  assert.ok(league.out.every((r) => r.kind === 'league'));
  const none = await queryHistory({ cols, scope, spec: validateSpec({ where: [{ field: 'type', op: 'in', value: ['bogus'] }] }, HISTORY_RULES), page: 1, pageSize: 25 });
  assert.deepEqual([none.total, none.items.length, none.page, none.totalPages], [0, 0, 1, 1]);
});

test('out-of-range page clamps to the last page; absurdly deep windows are rejected', async () => {
  const spec = validateSpec({}, HISTORY_RULES);
  const last = await queryHistory({ cols, scope, spec, page: 99, pageSize: 25 });
  assert.equal(last.page, last.totalPages);
  assert.ok(last.items.length > 0);
  const deep = await queryHistory({ cols, scope, spec, page: Math.ceil(MAX_WINDOW / 25) + 50, pageSize: 25 });
  assert.equal(deep.page, deep.totalPages, 'a page far beyond the end is clamped, not rejected');

  // a window that genuinely does not fit (10k rows, page 300) is refused
  const big = { query: async ({ limit }) => ({ items: [], total: limit === 0 || limit > 0 ? 10000 : 0 }) };
  const bigCols = { tournament: big, league: { query: async () => ({ items: [], total: 0 }) }, ranked: { query: async () => ({ items: [], total: 0 }) } };
  await assert.rejects(queryHistory({ cols: bigCols, scope: {}, spec, page: 300, pageSize: 25 }), QueryError);
});

test('translate: constants fold (type is a literal on tournament / league sources)', () => {
  assert.equal(translate({ field: 'type', op: 'eq', value: 'league' }, 'tournament'), false);
  assert.equal(translate({ field: 'type', op: 'eq', value: 'league' }, 'league'), true);
  assert.equal(translate({ and: [] }, 'league'), true);
  assert.equal(translate({ or: [{ field: 'type', op: 'eq', value: 'tournament' }, { field: 'gameId', op: 'eq', value: 'x' }] }, 'tournament'), true);
  assert.deepEqual(translate({ field: 'p1', op: 'eq', value: 'a' }, 'league'), { field: 'participant1Id', op: 'eq', value: 'a' });
  assert.throws(() => translate({ field: 'date', op: 'eq', value: 'x' }, 'league'), QueryError);
});

test('counts per type under the visibility scope', async () => {
  const c = await historyCounts({ cols, scope });
  const by = (t) => allRows.filter((r) => r.type === t).length;
  assert.deepEqual(c, { tournament: by('tournament'), league: by('league'), duel: by('duel'), matchmaking: by('matchmaking'), free: by('free') });
});

test('the client cannot filter on fields outside the unified vocabulary', () => {
  assert.throws(() => validateSpec({ where: [{ field: 'tournamentName', op: 'eq', value: 'x' }] }, HISTORY_RULES), QueryError);
  assert.throws(() => validateSpec({ sort: [{ field: 'id' }] }, HISTORY_RULES), QueryError);
  assert.doesNotThrow(() => validateSpec({ sort: [{ field: 'date', dir: 'desc' }] }, HISTORY_RULES));
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
