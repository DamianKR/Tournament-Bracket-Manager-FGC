/**
 * History routes — one paginated feed over tournament, league and ranked matches.
 *
 * GET /api/history?communityId=&page=&pageSize=&q={"where":[...]}   → { items, total, page, pageSize, totalPages }
 * GET /api/history/counts?communityId=                              → { tournament, league, duel, matchmaking, free }
 *
 * `q` filters use the unified vocabulary of utils/historyQuery.js. Community
 * visibility is applied here and cannot be widened by the client.
 */

import { Router } from 'express';
import { tournamentMatches, leagueMatches, rankedMatches, leagues } from '../db/collections.js';
import { optionalAuth } from '../utils/jwtMiddleware.js';
import { filterByCommunity, communityScopeCond } from '../utils/communityScope.js';
import { parseClientSpec, sendQueryError } from '../utils/paginate.js';
import { HISTORY_RULES, historyCounts, queryHistory } from '../utils/historyQuery.js';

const router = Router();
const cols = { tournament: tournamentMatches, league: leagueMatches, ranked: rankedMatches };

/**
 * Tournament / ranked rows are scoped by their own communityId. League matches
 * do not always carry one (older rows), so they are scoped through their league.
 */
async function buildScope(user, communityId) {
  const community = communityScopeCond(user, communityId);
  const allLeagues = await leagues.getAll();
  const visible = communityId ? allLeagues.filter((l) => l.communityId === communityId) : filterByCommunity(user, allLeagues);
  return {
    tournament: community ? [community] : [],
    ranked: community ? [community] : [],
    league: [
      { field: 'leagueId', op: 'in', value: visible.map((l) => l.id) },
      { field: 'status', op: 'in', value: ['completed', 'no_show'] },
    ],
  };
}

router.get('/', optionalAuth, async (req, res) => {
  try {
    const spec = parseClientSpec(req.query, HISTORY_RULES);
    const scope = await buildScope(req.user, req.query.communityId);
    res.json(await queryHistory({ cols, scope, spec, page: req.query.page, pageSize: req.query.pageSize }));
  } catch (err) {
    if (sendQueryError(res, err)) return;
    console.error('[History] GET / error:', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

router.get('/counts', optionalAuth, async (req, res) => {
  try {
    res.json(await historyCounts({ cols, scope: await buildScope(req.user, req.query.communityId) }));
  } catch (err) {
    console.error('[History] GET /counts error:', err);
    res.status(500).json({ error: 'Failed to count history' });
  }
});

export default router;
