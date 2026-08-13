/**
 * collections — Singleton instances of each database collection.
 *
 * Import from here throughout the server so all routes share the same file paths.
 *
 * Data files live in the project root /data/ folder:
 *   data/tournaments.json
 *   data/participants.json
 *   data/matches.json       — ELO match history
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { createCollection } from './jsonDb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

export const tournaments  = createCollection(path.join(DATA_DIR, 'tournaments.json'));
export const participants = createCollection(path.join(DATA_DIR, 'participants.json'));
export const matches      = createCollection(path.join(DATA_DIR, 'matches.json'));
