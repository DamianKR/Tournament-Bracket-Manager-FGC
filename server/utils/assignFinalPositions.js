/**
 * Assign final/partial positions to all participants.
 * Mirrors src/engine/progression/matchProgression.ts — keep in sync.
 *
 * Same Challonge/start.gg double-elimination placement logic.
 */
export function assignFinalPositions(tournament) {
  if (!tournament?.bracket) return;

  // Reset all positions.
  for (const p of tournament.participants) {
    delete p.finalPosition;
  }

  // 1st — champion
  if (tournament.championId) {
    const champ = tournament.participants.find(p => p.id === tournament.championId);
    if (champ) champ.finalPosition = 1;
  }

  // 2nd — loser of the deciding grand final
  const decidingFinal = tournament.bracket.grandFinalReset ?? tournament.bracket.grandFinal;
  if (decidingFinal?.loserId) {
    const runnerUp = tournament.participants.find(p => p.id === decidingFinal.loserId);
    if (runnerUp) runnerUp.finalPosition = 2;
  }

  const lb = tournament.bracket.loserBracket ?? [];
  if (lb.length === 0) return;

  const maxLBRound = Math.max(...lb.map(m => m.roundNumber));

  for (const m of lb) {
    if (m.status !== 'completed' || !m.loserId) continue;
    const loser = tournament.participants.find(p => p.id === m.loserId);
    if (!loser || !loser.eliminated) continue;

    loser.finalPosition = lbStartPosition(maxLBRound, m.roundNumber);
  }

  // A DQ in the winners bracket places like an elimination in the LB round the player would
  // have dropped into (a DQ in the loser bracket / grand final is covered by m.loserId above).
  const allMatches = [...tournament.bracket.winnerBracket, ...lb];
  for (const m of tournament.bracket.winnerBracket) {
    if (m.status !== 'completed' || !m.disqualifiedId || !m.nextLoserMatchId) continue;
    const dq = tournament.participants.find(p => p.id === m.disqualifiedId);
    const target = allMatches.find(x => x.id === m.nextLoserMatchId);
    if (dq && dq.disqualified && target) dq.finalPosition = lbStartPosition(maxLBRound, target.roundNumber);
  }
}

/** First position of the group eliminated in a given loser-bracket round (Challonge formula). */
function lbStartPosition(maxLBRound, round) {
  const roundsFromEnd = maxLBRound - round;
  let start = 3;
  let groupSize = 1;
  for (let i = 0; i < roundsFromEnd; i++) {
    start += groupSize;
    if (i % 2 === 1) groupSize *= 2;
  }
  return start;
}
