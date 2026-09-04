/**
 * collections — Instancias singleton de cada colección de la base de datos.
 *
 * Importa desde aquí en todas las rutas para que compartan el mismo adapter.
 *
 * Modo dual:
 *   STORAGE_BACKEND=json      → usa archivos JSON locales (desarrollo)
 *   STORAGE_BACKEND=supabase  → usa Supabase Postgres (producción)
 *
 * Archivos de datos (solo en modo json):
 *   data/tournaments.json
 *   data/participants.json
 *   data/leagues.json
 *
 *   Partidos separados por tipo:
 *   data/tournament_matches.json  — ELO de torneos
 *   data/league_matches.json      — Partidos de liga
 *   data/ranked_matches.json      — Duelos clasificatorios
 *
 *   Duelos:
 *   data/duels.json              — Retos de duel
 *   data/duel_settings.json      — Configuración de duels
 *
 *   Usuarios:
 *   data/users.json
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createCollection } from './jsonDb.js';
import { createSupabaseCollection } from './supabaseDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

const useSupabase = process.env.STORAGE_BACKEND === 'supabase';

if (useSupabase) {
  console.log('[collections] Modo: Supabase Postgres');
} else {
  console.log('[collections] Modo: JSON local (archivos en /data/)');
}

/**
 * Crea una colección con el adapter correcto según el entorno.
 * @param {string} jsonFile    - Nombre del archivo JSON (sin path)
 * @param {string} supabaseTable - Nombre de la tabla en Supabase
 */
function col(jsonFile, supabaseTable) {
  if (useSupabase) {
    return createSupabaseCollection(supabaseTable);
  }
  return createCollection(path.join(DATA_DIR, jsonFile));
}

export const communities        = col('communities.json',        'communities');
export const tournaments        = col('tournaments.json',        'tournaments');
export const participants       = col('participants.json',       'participants');
export const leagues            = col('leagues.json',            'leagues');

// Partidos separados por tipo
export const tournamentMatches  = col('tournament_matches.json', 'tournament_matches');
export const leagueMatches      = col('league_matches.json',     'league_matches');
export const rankedMatches      = col('ranked_matches.json',     'ranked_matches');

// Duelos
export const duels              = col('duels.json',              'duels');
export const duelSettings       = col('duel_settings.json',      'duel_settings');

// Auth
export const users              = col('users.json',              'users');

// Notificaciones
export const notifications      = col('notifications.json',      'notifications');

// Migraciones
export const migrations         = col('migrations.json',         'migrations');

// Legacy — compatibilidad hacia atrás
export const matches            = col('matches.json',            'matches');
