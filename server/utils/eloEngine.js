/**
 * ELO Engine — Bracket Tournament Manager
 *
 * Custom ELO system with rank tiers inspired by SF6 LP.
 *
 * Default starting ELO: 1500
 *
 * Rank thresholds:
 *   0    – 1199  → Plata
 *   1200 – 1299  → Oro
 *   1300 – 1399  → Platino
 *   1400 – 1499  → Platino  (extended from original spec: 1400-1499)
 *   Wait — spec:
 *     minimo-1199  → Plata
 *     1200-1299    → Plata
 *     1300-1399    → Oro
 *     1400-1499    → Platino
 *     1500-1599    → Diamante
 *     1600-1699    → Vanquisher
 *     1700-1849    → Master
 *     1850+        → Ultimate
 *     Top 5        → Legend  (assigned by ranking position, not by points)
 */

// ── Rank Tiers ────────────────────────────────────────────────────────────

/** @type {Array<{name: string, min: number, max: number|null, color: string}>} */
export const RANK_TIERS = [
  { name: 'Plata',      min: 0,    max: 1299,  color: '#94a3b8' },
  { name: 'Oro',        min: 1300, max: 1399,  color: '#f59e0b' },
  { name: 'Platino',    min: 1400, max: 1499,  color: '#06b6d4' },
  { name: 'Diamante',   min: 1500, max: 1599,  color: '#6366f1' },
  { name: 'Vanquisher', min: 1600, max: 1699,  color: '#8b5cf6' },
  { name: 'Master',     min: 1700, max: 1849,  color: '#ec4899' },
  { name: 'Ultimate',   min: 1850, max: null,  color: '#f97316' },
  // Legend is positional (top 5) — not point-based; handled at query time
];

/**
 * Returns the rank name for a given ELO score.
 * "Legend" is NOT returned here — it must be assigned at query time
 * based on leaderboard position.
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
  if (rankName === 'Legend') return '#ef4444';
  const tier = RANK_TIERS.find((t) => t.name === rankName);
  return tier ? tier.color : '#94a3b8';
}

// ── K-Factor (dynamic, like SF6) ──────────────────────────────────────────

/**
 * K-factor determines how much a match can move your ELO.
 * Higher K at low ranks = faster progression.
 * Lower K at high ranks = more stable top rankings.
 *
 * @param {number} points
 * @returns {number}
 */
export function getKFactor(points) {
  if (points < 1300) return 40;   // Plata: high volatility, climb fast
  if (points < 1500) return 32;   // Oro / Platino: moderate
  if (points < 1700) return 24;   // Diamante / Vanquisher: standard
  if (points < 1850) return 20;   // Master: controlled
  return 16;                       // Ultimate / Legend: very stable
}

// ── Core ELO Formula ─────────────────────────────────────────────────────

/**
 * Expected score for player A against player B.
 * Standard ELO formula.
 * @param {number} rA - ELO of player A
 * @param {number} rB - ELO of player B
 * @returns {number} 0–1
 */
export function expectedScore(rA, rB) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

/**
 * Calculates new ELO for both players after a match.
 *
 * @param {number} rA   - Current ELO of player A
 * @param {number} rB   - Current ELO of player B
 * @param {'A'|'B'} winner - Who won: 'A' or 'B'
 * @returns {{ newRA: number, newRB: number, deltaA: number, deltaB: number }}
 */
export function calculateElo(rA, rB, winner) {
  const Ea = expectedScore(rA, rB);
  const Eb = 1 - Ea;

  const Sa = winner === 'A' ? 1 : 0;
  const Sb = winner === 'B' ? 1 : 0;

  const kA = getKFactor(rA);
  const kB = getKFactor(rB);

  const deltaA = Math.round(kA * (Sa - Ea));
  const deltaB = Math.round(kB * (Sb - Eb));

  const newRA = Math.max(0, rA + deltaA); // Floor at 0
  const newRB = Math.max(0, rB + deltaB);

  return { newRA, newRB, deltaA, deltaB };
}

/**
 * Annotates a sorted leaderboard array with Legend rank for top 5.
 * Call this after sorting participants by eloPoints descending.
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
