/**
 * collections — Singleton instances of each database collection.
 *
 * Import from here throughout the server so all routes share the same file paths.
 *
 * Data files live in the project root /data/ folder:
 *   data/tournaments.json
 *   data/participants.json
 *   data/leagues.json
 *   
 *   Matches (separated by type):
 *   data/tournament_matches.json  — Tournament ELO matches
 *   data/league_matches.json      — League matches
 *   data/ranked_matches.json      — Ranked duels/matchmaking
 *   
 *   Duels:
 *   data/duels.json              — Duel challenges
 *   data/duel_settings.json      — Duel configuration
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createCollection } from './jsonDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

export const tournaments        = createCollection(path.join(DATA_DIR, 'tournaments.json'));
export const participants       = createCollection(path.join(DATA_DIR, 'participants.json'));
export const leagues            = createCollection(path.join(DATA_DIR, 'leagues.json'));

// Matches separated by type
export const tournamentMatches  = createCollection(path.join(DATA_DIR, 'tournament_matches.json'));
export const leagueMatches      = createCollection(path.join(DATA_DIR, 'league_matches.json'));
export const rankedMatches      = createCollection(path.join(DATA_DIR, 'ranked_matches.json'));

// Duels
export const duels              = createCollection(path.join(DATA_DIR, 'duels.json'));
export const duelSettings       = createCollection(path.join(DATA_DIR, 'duel_settings.json'));

// Legacy - kept for backward compatibility, will be migrated
export const matches            = createCollection(path.join(DATA_DIR, 'matches.json'));
