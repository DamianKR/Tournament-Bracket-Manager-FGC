import test from 'node:test';
import assert from 'node:assert/strict';
import { communityScopeCond, filterByCommunity } from './communityScope.js';
import { runQuery } from '../../shared/query.js';

const items = [
  { id: 'a', communityId: 'c1' },
  { id: 'b', communityId: 'c2' },
  { id: 'c' },
  { id: 'd', communityId: null },
  { id: 'e', communityId: 'community_fgc_santa_clara' },
];

const users = {
  anonymous: undefined,
  superadmin: { role: 'superadmin' },
  'home c1': { communityId: 'c1' },
  'home none': {},
  'admin c2': { role: null, communityId: 'c2', memberships: [{ communityId: 'c2', role: 'community_admin' }] },
};

test('communityScopeCond selects exactly what filterByCommunity keeps', () => {
  for (const [name, user] of Object.entries(users)) {
    for (const requested of [undefined, '', 'c1', 'c2', 'zzz', 'community_fgc_santa_clara']) {
      const cond = communityScopeCond(user, requested);
      const got = runQuery(items, { where: cond ? [cond] : [], sort: [{ field: 'id' }] }).items.map((i) => i.id);
      const want = filterByCommunity(user, items, requested).map((i) => i.id).sort();
      assert.deepEqual(got, want, `${name} / requested=${JSON.stringify(requested)}`);
    }
  }
});
