/**
 * ELO Engine — Bracket Tournament Manager
 *
 * Custom ELO system with rank tiers inspired by SF6 LP.
 *
 * Default starting ELO: 1500
 *
 * Rank thresholds:
 *   0    – 1299  → Plata
 *   1300 – 1399  → Oro
 *   1400 – 1499  → Platino
 *   1500 – 1599  → Diamante
 *   1600 – 1699  → Vanquisher
 *   1700 – 1849  → Master
 *   1850+        → Ultimate
 *   Top 5        → Legend  (positional, not point-based)
 */

// ── Rank Tiers ────────────────────────────────────────────────────────────

/** @type {Array<{name: string, min: number, max: number|null, color: string}>} */
export const RANK_TIERS = [
  { name: 'Bronce',     min: 0,    max: 1199, color: '#8b5a2b' },
  { name: 'Plata',      min: 1200, max: 1299, color: '#94a3b8' },
  { name: 'Oro',        min: 1300, max: 1399, color: '#f59e0b' },
  { name: 'Platino',    min: 1400, max: 1499, color: '#06b6d4' },
  { name: 'Diamante',   min: 1500, max: 1599, color: '#6366f1' },
  { name: 'Vanquisher', min: 1600, max: 1699, color: '#8b5cf6' },
  { name: 'Master',     min: 1700, max: 1849, color: '#ec4899' },
  { name: 'Ultimate',   min: 1850, max: null, color: '#7c2d12' },
  // Legend is positional (top 5) — not point-based; handled at query time
];

/**
 * Returns the rank name for a given ELO score.
 * "Legend" is NOT returned here — assigned at query time by leaderboard position.
 * @param {number} points
 * @returns {string}
 */
export function getRankName(points) {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (points >= RANK_TIERS[i].min) return RANK_TIERS[i].name;
  }
  return 'Plata';
}

/**
 * Returns the color for a rank name.
 * @param {string} rankName
 * @returns {string}
 */
export function getRankColor(rankName) {
  if (rankName === 'Legend') return '#10b981';
  const tier = RANK_TIERS.find((t) => t.name === rankName);
  return tier ? tier.color : '#94a3b8';
}

// ── K-Factor — one per rank ───────────────────────────────────────────────

/**
 * K-factor: one value per rank tier.
 * Higher K at low ranks = faster movement.
 * Lower K at high ranks = more stable top.
 *
 * Bronce     (0–1199)     → 44
 * Plata      (1200–1299)  → 40
 * Oro        (1300–1399)  → 34
 * Platino    (1400–1499)  → 28
 * Diamante   (1500–1599)  → 22
 * Vanquisher (1600–1699)  → 18
 * Master     (1700–1849)  → 14
 * Ultimate   (1850+)      → 10
 *
 * @param {number} points
 * @returns {number}
 */
export function getKFactor(points) {
  if (points < 1200) return 44;  // Bronce
  if (points < 1300) return 40;  // Plata
  if (points < 1400) return 34;  // Oro
  if (points < 1500) return 28;  // Platino
  if (points < 1600) return 22;  // Diamante
  if (points < 1700) return 18;  // Vanquisher
  if (points < 1850) return 14;  // Master
  return 10;                     // Ultimate / Legend
}

// ── Core ELO Formula ─────────────────────────────────────────────────────

/**
 * Expected score for player A against player B.
 * Standard ELO formula.
 * @param {number} rA
 * @param {number} rB
 * @returns {number} 0–1
 */
export function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

/**
 * Calculates new ELO for both players after a match.
 *
 * Delta is SYMMETRIC: what the winner gains, the loser loses exactly.
 * K is the winner's K-factor — lower-ranked winners get a higher K,
 * so upsets reward more and the stronger player risks more.
 *
 * Examples with new K values:
 *   Master (1800) beats Platino (1400):
 *     K=14, Ew≈0.91 → delta = round(14×0.09) = +1 / -1
 *   Platino (1400) beats Master (1800):
 *     K=28, Ew≈0.09 → delta = round(28×0.91) = +25 / -25
 *
 * @param {number} rA
 * @param {number} rB
 * @param {'A'|'B'} winner
 * @returns {{ newRA: number, newRB: number, deltaA: number, deltaB: number }}
 */
export function calculateElo(rA, rB, winner) {
  const rWinner = winner === 'A' ? rA : rB;
  const rLoser  = winner === 'A' ? rB : rA;

  const Ew    = expectedScore(rWinner, rLoser);
  const K     = getKFactor(rWinner);
  const delta = Math.round(K * (1 - Ew));

  const deltaA = winner === 'A' ? +delta : -delta;
  const deltaB = winner === 'B' ? +delta : -delta;

  return {
    newRA: Math.max(0, rA + deltaA),
    newRB: Math.max(0, rB + deltaB),
    deltaA,
    deltaB,
  };
}

// ── Tournament placement points ───────────────────────────────────────────

/**
 * Multipliers by placement — only top 8 receive points.
 * Formula: points = round(K × multiplier)
 *
 * 1st  × 3.0  — champion
 * 2nd  × 2.0  — finalist
 * 3rd  × 1.5  — 3rd place
 * 4th  × 1.0  — 4th place (equivalent to one normal match win)
 * 5-6  × 0.6  — top 6
 * 7-8  × 0.3  — top 8 (symbolic)
 */
const PLACEMENT_MULTIPLIERS = [
  { positions: [1],       multiplier: 3.0 },
  { positions: [2],       multiplier: 2.0 },
  { positions: [3],       multiplier: 1.5 },
  { positions: [4],       multiplier: 1.0 },
  { positions: [5, 6],    multiplier: 0.6 },
  { positions: [7, 8],    multiplier: 0.3 },
];

/**
 * Returns the ELO points earned for a tournament placement.
 * Returns 0 for positions outside top 8.
 *
 * @param {number} position    - Final placement (1 = winner)
 * @param {number} eloPoints   - Player's current ELO (determines their K)
 * @returns {number}           - Points to add (always >= 0)
 */
export function getTournamentPoints(position, eloPoints) {
  const entry = PLACEMENT_MULTIPLIERS.find((e) => e.positions.includes(position));
  if (!entry) return 0;
  const K = getKFactor(eloPoints);
  return Math.round(K * entry.multiplier);
}

// ── Legend tier ───────────────────────────────────────────────────────────

/**
 * Annotates a sorted leaderboard array with Legend display rank for top 5.
 * Call this AFTER sorting participants by eloPoints descending.
 *
 * @param {Array<{eloPoints: number, eloRank: string}>} sorted
 * @returns {Array<{eloPoints: number, eloRank: string, displayRank: string}>}
 */
export function applyLegendTier(sorted) {
  return sorted.map((p, i) => ({
    ...p,
    displayRank: i < 5 ? 'Legend' : p.eloRank,
  }));
}

// ── Match Recording (for leagues and ranking) ─────────────────────────────

/**
 * Records a match result and updates both participants' ELO.
 * This is used by both /api/ranking/match and league match reporting.
 * 
 * @param {string} playerAId
 * @param {string} playerBId
 * @param {string} winnerId
 * @param {string} gameId - Optional game context
 * @returns {Promise<{winnerChange: number, loserChange: number, winnerNewElo: number, loserNewElo: number}>}
 */
export async function recordMatch(playerAId, playerBId, winnerId, gameId = null) {
  // This function is meant to be called from routes that have access to collections
  // So we'll just return the calculation, and let the route handle persistence
  throw new Error('recordMatch should be called from a route with access to participants collection');
}

/**
 * Calculate ELO changes for a match (without persisting).
 * Used by league routes to get ELO deltas.
 * 
 * @param {number} playerAElo
 * @param {number} playerBElo
 * @param {string} winnerId - 'A' or 'B'
 * @returns {{winnerChange: number, loserChange: number, winnerNewElo: number, loserNewElo: number, playerAChange: number, playerBChange: number}}
 */
export function calculateMatchElo(playerAElo, playerBElo, winnerId) {
  const winner = winnerId === 'A' ? 'A' : 'B';
  const { newRA, newRB, deltaA, deltaB } = calculateElo(playerAElo, playerBElo, winner);
  
  return {
    winnerChange: winner === 'A' ? deltaA : deltaB,
    loserChange: winner === 'A' ? deltaB : deltaA,
    winnerNewElo: winner === 'A' ? newRA : newRB,
    loserNewElo: winner === 'A' ? newRB : newRA,
    playerAChange: deltaA,
    playerBChange: deltaB,
    playerANewElo: newRA,
    playerBNewElo: newRB,
  };
}
