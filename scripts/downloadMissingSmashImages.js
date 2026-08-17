/**
 * Download missing Smash Ultimate DLC character renders from the official site.
 * Run with: node scripts/downloadMissingSmashImages.js
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../public/images/characters/ssbu');

const missing = [
  { id: 'byleth',    file: 'byleth.png' },
  { id: 'hero',      file: 'hero.png' },
  { id: 'joker',     file: 'joker.png' },
  { id: 'kazuya',    file: 'kazuya.png' },
  { id: 'minmin',    file: 'min_min.png' },
  { id: 'pythra',    file: 'pyra_mythra.png' },
  { id: 'sephiroth', file: 'sephiroth.png' },
  { id: 'sora',      file: 'sora.png' },
  { id: 'steve',     file: 'steve.png' },
  { id: 'terry',     file: 'terry.png' },
];

fs.mkdirSync(outDir, { recursive: true });

for (const { id, file } of missing) {
  const url = `https://www.smashbros.com/assets_v2/img/fighter/${id}/main.png`;
  const out = path.join(outDir, file);

  https.get(url, res => {
    if (res.statusCode !== 200) {
      console.log(`[FAIL ${res.statusCode}] ${id}: ${url}`);
      return;
    }
    const stream = fs.createWriteStream(out);
    res.pipe(stream);
    stream.on('finish', () => console.log(`[OK] ${id}`));
  }).on('error', e => {
    console.log(`[ERR] ${id}: ${e.message}`);
  });
}
