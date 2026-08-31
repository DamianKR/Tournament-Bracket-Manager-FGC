/**
 * migrateDuelTypes.js — Adds 'type: normal' to existing duels
 *
 * Run with:
 *   node --env-file=.env.local scripts/migrateDuelTypes.js
 */

import { duels } from '../server/db/collections.js';

async function main() {
  const all = await duels.getAll();
  let migrated = 0;

  for (const duel of all) {
    if (!duel.type) {
      duel.type = 'normal';
      await duels.upsert(duel);
      migrated++;
    }
  }

  console.log(`✅ Migrated ${migrated} duels to have type='normal'`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
