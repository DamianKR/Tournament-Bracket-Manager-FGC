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

    const roundsFromEnd = maxLBRound - m.roundNumber;
    let start = 3;
    let groupSize = 1;
    for (let i = 0; i < roundsFromEnd; i++) {
      start += groupSize;
      if (i % 2 === 1) groupSize *= 2;
    }

    loser.finalPosition = start;
  }
}
