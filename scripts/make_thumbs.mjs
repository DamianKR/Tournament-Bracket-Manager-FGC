// Generates WebP thumbnails for all character renders under
// public/images/characters/{game}/thumbs/{name}.webp
// Run once:  node scripts/make_thumbs.mjs
// Re-run anytime new renders are added.
import sharp from 'sharp';
import { readdirSync, mkdirSync } from 'fs';
import { join } from 'path';

const ROOT = 'public/images/characters';
const THUMB_SIZE = 160; // px, fit inside — renders are portrait-ish
const QUALITY = 78;

let total = 0;
for (const game of readdirSync(ROOT)) {
  const gameDir = join(ROOT, game);
  const files = readdirSync(gameDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  if (files.length === 0) continue;
  const outDir = join(gameDir, 'thumbs');
  mkdirSync(outDir, { recursive: true });
  for (const file of files) {
    const out = join(outDir, file.replace(/\.(png|jpe?g|webp)$/i, '.webp'));
    await sharp(join(gameDir, file))
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(out);
    total++;
  }
  console.log(`${game}: ${files.length} thumbs`);
}
console.log(`Done — ${total} thumbnails`);
