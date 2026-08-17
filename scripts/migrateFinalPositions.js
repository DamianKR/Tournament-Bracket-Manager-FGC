import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { assignFinalPositions } from '../server/utils/assignFinalPositions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.resolve(__dirname, '../data/tournaments.json');

async function main() {
  const raw = await fs.readFile(dataPath, 'utf8');
  const tournaments = JSON.parse(raw);

  let changed = 0;
  for (const tournament of tournaments) {
    if (!tournament.bracket) continue;
    if (tournament.status !== 'in_progress' && tournament.status !== 'completed') continue;
    assignFinalPositions(tournament);
    changed++;
  }

  await fs.writeFile(dataPath, JSON.stringify(tournaments, null, 2), 'utf8');
  console.log(`Migrated ${changed} tournament(s).`);
}

main().catch(err => { console.error(err); process.exit(1); });
