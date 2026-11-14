/**
 * legacyCaches.ts — Local copies replaced by the paginated mirrors.
 *
 * Nothing writes these keys any more (ranked history and the all-league-matches
 * list now live in bracket_history_rows / bracket_history_pages), so drop what
 * earlier versions left in the browser instead of letting it eat the quota.
 */

const LEGACY_KEYS = ['bracket_history_cache', 'bracket_all_league_matches_cache'];

export function purgeLegacyCaches(): void {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
  } catch {
    // storage unavailable — nothing to clean
  }
}
