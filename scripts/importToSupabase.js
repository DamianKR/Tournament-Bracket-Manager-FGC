/**
 * importToSupabase.js — Migración inicial de JSON → Supabase
 *
 * Importa todos los archivos JSON locales a las tablas de Supabase.
 * Usa upsert para que sea idempotente (puedes ejecutarlo varias veces).
 *
 * Uso:
 *   1. Crea un archivo .env.local con SUPABASE_URL y SUPABASE_SERVICE_KEY
 *   2. Ejecuta:  node --env-file=.env.local scripts/importToSupabase.js
 *
 * Requiere:
 *   - Las tablas ya creadas en Supabase (ejecuta scripts/supabase_schema.sql primero)
 *   - @supabase/supabase-js instalado (npm install @supabase/supabase-js)
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

// ── Validar variables de entorno ─────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltan variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_KEY');
  console.error('   Ejecuta: node --env-file=.env.local scripts/importToSupabase.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Mapeo archivo JSON → tabla Supabase ────────────────────────────────────

const COLLECTIONS = [
  { file: 'tournaments.json',        table: 'tournaments' },
  { file: 'participants.json',       table: 'participants' },
  { file: 'leagues.json',            table: 'leagues' },
  { file: 'tournament_matches.json', table: 'tournament_matches' },
  { file: 'league_matches.json',     table: 'league_matches' },
  { file: 'ranked_matches.json',     table: 'ranked_matches' },
  { file: 'duels.json',              table: 'duels' },
  { file: 'duel_settings.json',      table: 'duel_settings' },
  { file: 'users.json',              table: 'users' },
];

// ── Funciones de migración ────────────────────────────────────────────────

async function readJson(fileName) {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, fileName), 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function migrateCollection({ file, table }) {
  const records = await readJson(file);

  if (!records || records.length === 0) {
    console.log(`  ⏭  ${table}: vacío, omitido`);
    return { table, count: 0, skipped: true };
  }

  // Construir filas con el formato { id, data }
  const rows = records.map((r) => ({
    id: r.id ?? String(Math.random()),   // fallback por si algún objeto no tiene id
    data: r,
  }));

  // Upsert en lotes de 500 para no exceder límites de Supabase
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      throw new Error(`[${table}] Error en upsert: ${error.message}`);
    }
    inserted += batch.length;
  }

  console.log(`  ✅ ${table}: ${inserted} registros importados`);
  return { table, count: inserted, skipped: false };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('  Bracket Project — Migración JSON → Supabase');
  console.log(`  URL: ${SUPABASE_URL}`);
  console.log('');

  // Verificar conexión con un health check básico
  const { error: pingError } = await supabase.from('participants').select('id').limit(1);
  if (pingError && pingError.code !== 'PGRST116') {
    console.error('❌ No se pudo conectar a Supabase:', pingError.message);
    console.error('   Verifica SUPABASE_URL y SUPABASE_SERVICE_KEY');
    console.error('   Asegúrate de haber ejecutado scripts/supabase_schema.sql primero');
    process.exit(1);
  }

  console.log('  Importando colecciones...');
  console.log('');

  const results = [];
  for (const col of COLLECTIONS) {
    try {
      const result = await migrateCollection(col);
      results.push(result);
    } catch (err) {
      console.error(`  ❌ ${col.table}: ${err.message}`);
      results.push({ table: col.table, error: err.message });
    }
  }

  console.log('');
  console.log('  ══════════════════════════════════════════');
  const ok = results.filter((r) => !r.error && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const errors = results.filter((r) => r.error).length;
  console.log(`  Completado: ${ok} OK, ${skipped} omitidos, ${errors} errores`);

  if (errors > 0) {
    console.log('  ⚠️  Revisa los errores arriba antes de activar el modo Supabase');
    process.exit(1);
  } else {
    console.log('');
    console.log('  ✅ Migración exitosa. Próximos pasos:');
    console.log('  1. Configura STORAGE_BACKEND=supabase en las variables de Render');
    console.log('  2. Configura SUPABASE_URL y SUPABASE_SERVICE_KEY en Render también');
    console.log('  3. Haz deploy del servidor en Render');
    console.log('');
  }
}

main();
