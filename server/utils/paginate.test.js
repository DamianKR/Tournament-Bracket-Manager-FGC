import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCollection } from '../db/jsonDb.js';
import { isPaged, pageInMemory, parseClientSpec, runPagedQuery, sendQueryError, withScope } from './paginate.js';
import { QueryError } from '../../shared/query.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paginate-'));
const file = path.join(dir, 'items.json');
const rows = Array.from({ length: 130 }, (_, i) => ({
  id: `r${String(i).padStart(3, '0')}`,
  communityId: i % 10 === 0 ? 'other' : 'c1',
  type: i % 2 ? 'duel' : 'league',
  name: i % 3 ? `Player ${i}` : `Ale ${i}`,
  createdAt: new Date(2026, 0, 1 + i).toISOString(),
}));
fs.writeFileSync(file, JSON.stringify(rows));
const col = createCollection(file);
const rules = { filterFields: ['type', 'communityId'], searchFields: ['name'], sortFields: ['createdAt'] };
const q = (o) => ({ ...o, q: o.q && JSON.stringify(o.q) });

test('opt-in detection', () => {
  assert.equal(isPaged({}), false);
  assert.equal(isPaged({ page: '2' }), true);
  assert.equal(isPaged({ pageSize: '50' }), true);
});

test('pages through a scoped, sorted list; scope cannot be widened by the client', async () => {
  const scope = { field: 'communityId', op: 'eq', value: 'c1' };
  const query = q({ page: '1', pageSize: '50', q: { where: [{ field: 'communityId', op: 'eq', value: 'other' }], sort: [{ field: 'createdAt', dir: 'desc' }] } });
  const spec = withScope(parseClientSpec(query, rules), scope);
  const p1 = await runPagedQuery(col, spec, query);
  assert.equal(p1.total, 0, 'scope AND client filter on another community = nothing');

  const q2 = q({ page: '1', pageSize: '50', q: { sort: [{ field: 'createdAt', dir: 'desc' }] } });
  const s2 = withScope(parseClientSpec(q2, rules), scope);
  const a = await runPagedQuery(col, s2, q2);
  assert.deepEqual([a.total, a.page, a.pageSize, a.totalPages, a.items.length], [117, 1, 50, 3, 50]);
  assert.equal(a.items[0].id, 'r129');
  const c = await runPagedQuery(col, s2, { ...q2, page: '3' });
  assert.equal(c.items.length, 17);
  assert.ok(c.items.every((r) => r.communityId === 'c1'));
});

test('filter + search shrink total (UI hides pagination at <= 25)', async () => {
  const query = q({ page: '1', pageSize: '25', q: { where: [{ field: 'type', op: 'eq', value: 'duel' }], search: { text: 'ALE', fields: ['name'] } } });
  const res = await runPagedQuery(col, withScope(parseClientSpec(query, rules)), query);
  const expected = rows.filter((r) => r.type === 'duel' && r.name.toLowerCase().includes('ale')).length;
  assert.equal(res.total, expected);
  assert.ok(res.total <= 25);
});

test('out-of-range page is clamped to the last page', async () => {
  const query = q({ page: '99', pageSize: '25' });
  const res = await runPagedQuery(col, parseClientSpec(query, rules), query);
  assert.deepEqual([res.page, res.totalPages, res.items.length], [6, 6, 5]);
  const zero = await runPagedQuery(col, parseClientSpec(q({ q: { where: [{ field: 'type', op: 'eq', value: 'nope' }] } }), rules), q({ page: '4' }));
  assert.deepEqual([zero.page, zero.totalPages, zero.total, zero.items.length], [1, 1, 0, 0]);
});

test('page size is clamped to the allowed levels; default is configurable', async () => {
  const bad = await runPagedQuery(col, {}, { page: '1', pageSize: '33' });
  assert.equal(bad.pageSize, 25);
  const dflt = await runPagedQuery(col, {}, { page: '1' }, { defaultPageSize: 50 });
  assert.equal(dflt.pageSize, 50);
  assert.equal((await runPagedQuery(col, {}, { page: '1', pageSize: '100' })).items.length, 100);
});

test('invalid client spec → QueryError → 400', () => {
  assert.throws(() => parseClientSpec({ q: '{nope' }, rules), QueryError);
  assert.throws(() => parseClientSpec(q({ q: { where: [{ field: 'secret', op: 'eq', value: 1 }] } }), rules), QueryError);
  let sent;
  const res = { status: (c) => ({ json: (b) => { sent = [c, b]; } }) };
  assert.equal(sendQueryError(res, new QueryError('bad')), true);
  assert.deepEqual(sent, [400, { error: 'bad' }]);
  assert.equal(sendQueryError(res, new Error('db down')), false);
});

test('pageInMemory: derived lists (leaderboard) — default size, search, null-last sort, clamp', () => {
  const board = Array.from({ length: 130 }, (_, i) => ({
    id: `p${i}`, name: i % 10 === 0 ? `Ale ${i}` : `Player ${String(i).padStart(3, '0')}`, alias: i % 2 ? 'x' : null,
    position: i < 100 ? i + 1 : null,           // 30 unranked
  }));
  const sort = [{ field: 'position', dir: 'asc', type: 'number' }, { field: 'name', dir: 'asc' }];
  const first = pageInMemory(board, { sort }, {}, { defaultPageSize: 50 });
  assert.deepEqual([first.page, first.pageSize, first.totalPages, first.total, first.items.length], [1, 50, 3, 130, 50]);
  assert.deepEqual(first.items.slice(0, 2).map((r) => r.position), [1, 2]);
  const last = pageInMemory(board, { sort }, { page: '3', pageSize: '50' });
  assert.equal(last.items.length, 30);
  assert.ok(last.items.slice(-30).every((r) => r.position === null) || last.items.some((r) => r.position === null), 'unranked rows sort last');
  assert.deepEqual(last.items.filter((r) => r.position === null).map((r) => r.name), [...last.items.filter((r) => r.position === null).map((r) => r.name)].sort());
  const found = pageInMemory(board, { sort, search: { text: 'ALE', fields: ['name', 'alias'] } }, { page: '1', pageSize: '25' });
  assert.equal(found.total, board.filter((r) => r.name.toLowerCase().includes('ale')).length);
  assert.equal(pageInMemory(board, { sort }, { page: '99', pageSize: '100' }).page, 2);
  assert.equal(pageInMemory([], {}, { page: '4' }).page, 1);
});

test('users rules: community filter is a path under communities.*, nothing else is open', () => {
  const rules = { filterFields: ['role', 'communities.*'], searchFields: ['username'], sortFields: ['username'] };
  const ok = parseClientSpec({ q: JSON.stringify({ where: [{ or: [{ field: 'role', op: 'null', value: true }, { field: 'role', op: 'neq', value: 'superadmin' }] }, { field: 'communities.community_fgc_santa_clara', op: 'eq', value: true }], search: { text: 'Ale' } }) }, rules);
  assert.equal(ok.where.length, 2);
  assert.deepEqual(ok.search, { text: 'ale', fields: ['username'] });
  assert.doesNotThrow(() => parseClientSpec({ q: JSON.stringify({ where: [{ field: 'communities.community_c84b03a7-e5d2-4c0e-9a42-4229a4c1a1e8', op: 'eq', value: true }] }) }, rules));
  for (const field of ['communities', 'passwordHash', 'communities.a.b', 'memberships.0.role', 'communities.a b', 'communities.a>b']) {
    assert.throws(() => parseClientSpec({ q: JSON.stringify({ where: [{ field, op: 'eq', value: true }] }) }, rules), QueryError, field);
  }
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
