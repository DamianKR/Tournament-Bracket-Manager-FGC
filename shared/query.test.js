import test from 'node:test';
import assert from 'node:assert/strict';
import { runQuery, runPage, validateSpec, QueryError, clampPageSize, totalPagesFor, PAGE_SIZES } from './query.js';

const rows = [
  { id: 'a', name: 'Ale', type: 'duel', games: { ssbu: { eloPoints: 1500 } }, createdAt: '2026-01-03' },
  { id: 'b', name: 'bob', type: 'league', games: { ssbu: { eloPoints: 900 } }, createdAt: '2026-01-02' },
  { id: 'c', name: 'Cleo', type: 'duel', games: { ssbu: { eloPoints: null } }, createdAt: '2026-01-04' },
  { id: 'd', name: 'Dan_1', type: null, createdAt: null },
  { id: 'e', name: '100%', type: 'duel', games: { ssbu: { eloPoints: 1500 } }, createdAt: '2026-01-02' },
];
const ids = (r) => r.items.map((x) => x.id).join('');

test('eq / neq / in / nin compare as text and never match null fields', () => {
  assert.equal(ids(runQuery(rows, { where: [{ field: 'type', op: 'eq', value: 'duel' }] })), 'ace');
  assert.equal(ids(runQuery(rows, { where: [{ field: 'type', op: 'neq', value: 'duel' }] })), 'b');
  assert.equal(ids(runQuery(rows, { where: [{ field: 'type', op: 'in', value: ['league', 'x'] }] })), 'b');
  assert.equal(ids(runQuery(rows, { where: [{ field: 'type', op: 'nin', value: ['league'] }] })), 'ace');
  assert.equal(ids(runQuery(rows, { where: [{ field: 'games.ssbu.eloPoints', op: 'eq', value: '1500' }] })), 'ae');
  assert.equal(ids(runQuery(rows, { where: [{ field: 'type', op: 'null', value: true }] })), 'd');
  assert.equal(ids(runQuery(rows, { where: [{ field: 'type', op: 'null', value: false }] })), 'abce');
});

test('or / and groups', () => {
  const spec = { where: [{ or: [{ field: 'name', op: 'eq', value: 'bob' }, { and: [{ field: 'type', op: 'eq', value: 'duel' }, { field: 'name', op: 'eq', value: 'Cleo' }] }] }] };
  assert.equal(ids(runQuery(rows, spec)), 'bc');
});

test('search is a case-insensitive substring over any field; wildcards are literal', () => {
  const f = ['name', 'type'];
  assert.equal(ids(runQuery(rows, { search: { text: 'ALE', fields: f } })), 'a');
  assert.equal(ids(runQuery(rows, { search: { text: 'le', fields: f } })), 'abc');   // b matches via type "league"
  assert.equal(ids(runQuery(rows, { search: { text: 'le', fields: ['name'] } })), 'ac');
  assert.equal(ids(runQuery(rows, { search: { text: '%', fields: f } })), 'e');
  assert.equal(ids(runQuery(rows, { search: { text: '_', fields: f } })), 'd');
  assert.equal(ids(runQuery(rows, { search: { text: '  ', fields: f } })), 'abcde');
  assert.equal(ids(runQuery(rows, { search: { text: 'x', fields: [] } })), '');
});

test('sort: nulls last in both directions, ties by id, numeric type', () => {
  assert.equal(ids(runQuery(rows, { sort: [{ field: 'createdAt', dir: 'desc' }] })), 'cabed');
  assert.equal(ids(runQuery(rows, { sort: [{ field: 'createdAt', dir: 'asc' }] })), 'beacd');
  const elo = runQuery(rows, { sort: [{ field: 'games.ssbu.eloPoints', dir: 'desc', type: 'number' }] });
  assert.equal(ids(elo), 'aebcd');
});

test('total is the count before slicing', () => {
  const r = runQuery(rows, { where: [{ field: 'type', op: 'eq', value: 'duel' }], sort: [{ field: 'id' }], offset: 1, limit: 1 });
  assert.equal(r.total, 3);
  assert.equal(ids(r), 'c');
});

test('runPage clamps page / pageSize and reports totalPages', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ id: String(i).padStart(3, '0') }));
  const p = runPage(many, {}, 99, 25);
  assert.deepEqual([p.page, p.totalPages, p.total, p.items.length], [3, 3, 60, 10]);
  assert.equal(runPage(many, {}, -4, 25).page, 1);
  assert.equal(runPage(many, {}, 1, 33).pageSize, 25);
  assert.equal(runPage(many, {}, 1, 50).items.length, 50);
  assert.equal(runPage([], {}, 5, 25).page, 1);
});

test('page size helpers', () => {
  assert.deepEqual([...PAGE_SIZES], [25, 50, 75, 100]);
  assert.equal(clampPageSize('75'), 75);
  assert.equal(clampPageSize(10), 25);
  assert.equal(clampPageSize(10, 50), 50);
  assert.equal(totalPagesFor(0, 25), 1);
  assert.equal(totalPagesFor(26, 25), 2);
});

test('validateSpec whitelists fields and rejects injection / abuse', () => {
  const rules = { filterFields: ['type', 'games.*.eloPoints'], searchFields: ['name', 'alias'], sortFields: ['createdAt'] };
  const ok = validateSpec({ where: [{ field: 'type', op: 'in', value: ['duel'] }, { field: 'games.ssbu.eloPoints', op: 'null', value: false }], search: { text: ' Ale ', fields: ['name', 'secret'] }, sort: [{ field: 'createdAt', dir: 'desc' }], offset: 99, limit: 9999 }, rules);
  assert.equal(ok.where.length, 2);
  assert.deepEqual(ok.search, { text: 'ale', fields: ['name'] });
  assert.equal(ok.offset, undefined);
  assert.equal(ok.limit, undefined);
  assert.deepEqual(validateSpec({ search: { text: 'x', fields: ['nope'] } }, rules).search.fields, ['name', 'alias']);
  for (const bad of [
    { where: [{ field: 'password', op: 'eq', value: 'x' }] },
    { where: [{ field: 'type->>x', op: 'eq', value: 'x' }] },
    { where: [{ field: 'games.ssbu', op: 'eq', value: 'x' }] },
    { where: [{ field: 'type', op: 'like', value: 'x' }] },
    { where: [{ field: 'type', op: 'eq', value: { a: 1 } }] },
    { where: [{ field: 'type', op: 'eq', value: 'x'.repeat(201) }] },
    { where: [{ or: [{ or: [{ or: [{ or: [{ field: 'type', op: 'eq', value: 1 }] }] }] }] }] },
    { sort: [{ field: 'password' }] },
    { where: 'x' },
  ]) assert.throws(() => validateSpec(bad, rules), QueryError, JSON.stringify(bad));
});
