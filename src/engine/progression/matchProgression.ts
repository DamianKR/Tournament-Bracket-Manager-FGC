import { Match, Participant, Bracket, Tournament } from '@/models/types';

/**
 * Record match result and advance participants
 */
export function recordMatchResult(
  tournament: Tournament,
  matchId: string,
  winnerId: string
): Tournament {
  if (!tournament.bracket) {
    throw new Error('Tournament bracket not initialized');
  }

  const match = findMatch(tournament.bracket, matchId);
  if (!match) {
    throw new Error(`Match ${matchId} not found`);
  }

  if (match.status === 'completed') {
    // Allow changing result if next matches haven't been played
    if (!canRevertMatch(tournament.bracket, matchId)) {
      throw new Error('Cannot change result - subsequent matches already played');
    }
  }

  // Validate winner is a participant in this match
  if (match.participant1Id !== winnerId && match.participant2Id !== winnerId) {
    throw new Error('Winner must be a participant in this match');
  }

  // Determine loser
  const loserId = match.participant1Id === winnerId 
    ? match.participant2Id 
    : match.participant1Id;

  // Update match
  match.winnerId = winnerId;
  match.loserId = loserId;
  match.status = 'completed';

  // Update participant loss counts
  const loser = tournament.participants.find((p: Participant) => p.id === loserId);
  if (loser) {
    loser.lossCount++;

    // Check if eliminated
    // Single elimination: 1 loss = eliminated
    // Double elimination: 2 losses = eliminated
    const maxLosses = tournament.mode === 'single_elimination' ? 1 : 2;
    if (loser.lossCount >= maxLosses) {
      loser.eliminated = true;
      loser.finalPosition = undefined;
    }
  }

  // Advance winner
  if (match.nextWinnerMatchId) {
    // Winners from loser bracket go to slot 1
    if (match.bracketType === 'loser') {
      advanceParticipantToSlot(tournament.bracket, match.nextWinnerMatchId, winnerId, 1);
    } else {
      advanceParticipant(tournament.bracket, match.nextWinnerMatchId, winnerId);
    }
  }

  // Advance loser to loser bracket (if applicable)
  if (loserId && match.nextLoserMatchId && loser && !loser.eliminated) {
    // WR1: two adjacent matches share one LR1 match. The odd-numbered WR1 match
    // sends its loser to slot 1, the even-numbered to slot 2. This keeps
    // the two participants who will meet in WR2 in separate slots so they
    // face different opponents in the Loser Bracket.
    // WR2+: Winners-bracket losers always go to slot 2 (the "drop-in" slot)
    // so that the surviving LB player (slot 1) is always from a different group.
    let targetSlot: 1 | 2 = 2;
    if (match.bracketType === 'winner' && match.roundNumber === 1) {
      targetSlot = (match.matchNumber % 2 === 1) ? 1 : 2;
    }
    advanceParticipantToSlot(tournament.bracket, match.nextLoserMatchId, loserId, targetSlot);
  }

  // Check for tournament completion
  checkTournamentCompletion(tournament);

  // Assign partial final positions for eliminated participants
  assignFinalPositions(tournament);

  // Update timestamp
  tournament.updatedAt = new Date().toISOString();

  return tournament;
}

/**
 * Find a match by ID in the bracket
 */
export function findMatch(bracket: Bracket, matchId: string): Match | null {
  // Check winner bracket
  const winnerMatch = bracket.winnerBracket.find((m: Match) => m.id === matchId);
  if (winnerMatch) return winnerMatch;

  // Check loser bracket
  const loserMatch = bracket.loserBracket.find((m: Match) => m.id === matchId);
  if (loserMatch) return loserMatch;

  // Check grand finals
  if (bracket.grandFinal?.id === matchId) return bracket.grandFinal;
  if (bracket.grandFinalReset?.id === matchId) return bracket.grandFinalReset;

  return null;
}

/**
 * Advance a participant to the next match
 */
function advanceParticipant(
  bracket: Bracket,
  nextMatchId: string,
  participantId: string
): void {
  const nextMatch = findMatch(bracket, nextMatchId);
  if (!nextMatch) return;

  // Place participant in first available slot
  if (nextMatch.participant1Id === null) {
    nextMatch.participant1Id = participantId;
  } else if (nextMatch.participant2Id === null) {
    nextMatch.participant2Id = participantId;
  }

  // If both participants are present, match is ready
  if (nextMatch.participant1Id && nextMatch.participant2Id) {
    nextMatch.status = 'in_progress';
  } else {
    // Check if this is an implicit BYE (one participant, other will never come)
    // This happens in loser bracket when the opponent slot was always empty
    checkAndProcessImplicitBye(bracket, nextMatch);
  }
}

/**
 * Advance a participant to a specific slot in the next match
 * Used to ensure proper positioning in loser bracket
 */
function advanceParticipantToSlot(
  bracket: Bracket,
  nextMatchId: string,
  participantId: string,
  slot: 1 | 2
): void {
  const nextMatch = findMatch(bracket, nextMatchId);
  if (!nextMatch) return;

  // Place participant in specified slot
  if (slot === 1) {
    if (nextMatch.participant1Id === null) {
      nextMatch.participant1Id = participantId;
    } else {
      // Slot 1 occupied, try slot 2
      if (nextMatch.participant2Id === null) {
        nextMatch.participant2Id = participantId;
      }
    }
  } else {
    if (nextMatch.participant2Id === null) {
      nextMatch.participant2Id = participantId;
    } else {
      // Slot 2 occupied, try slot 1
      if (nextMatch.participant1Id === null) {
        nextMatch.participant1Id = participantId;
      }
    }
  }

  // If both participants are present, match is ready
  if (nextMatch.participant1Id && nextMatch.participant2Id) {
    nextMatch.status = 'in_progress';
  } else {
    checkAndProcessImplicitBye(bracket, nextMatch);
  }
}

/**
 * Check if a match is an implicit BYE and auto-complete it
 * This happens when:
 * 1. One participant is present but the other slot will never be filled
 * 2. Both slots are empty and will never be filled (double BYE)
 */
function checkAndProcessImplicitBye(bracket: Bracket, match: Match): void {
  // Only process if match is pending
  if (match.status !== 'pending') return;
  
  const hasParticipant1 = match.participant1Id !== null;
  const hasParticipant2 = match.participant2Id !== null;
  
  // If both participants are present, match is ready to play
  if (hasParticipant1 && hasParticipant2) {
    return;
  }

  // Check if this match can still receive participants
  const canReceiveMoreParticipants = checkIfMatchCanReceiveParticipants(bracket, match);
  
  if (!canReceiveMoreParticipants) {
    // Case 1: One participant present (single BYE)
    if (hasParticipant1 || hasParticipant2) {
      const winnerId = hasParticipant1 ? match.participant1Id : match.participant2Id;
      
      if (winnerId) {
        match.winnerId = winnerId;
        match.status = 'completed';
        
        // Advance winner to next match
        if (match.nextWinnerMatchId) {
          advanceParticipant(bracket, match.nextWinnerMatchId, winnerId);
        }
      }
    }
    // Case 2: Both slots empty (double BYE)
    else if (!hasParticipant1 && !hasParticipant2) {
      // Mark as completed with no winner (ghost match)
      // This prevents blocking subsequent matches
      match.status = 'completed';
      // No winner to advance, next match will also be checked for BYE
    }
  }
}

/**
 * Check if a match can still receive participants from previous matches
 */
function checkIfMatchCanReceiveParticipants(bracket: Bracket, targetMatch: Match): boolean {
  // Find all matches that could feed into this match
  const allMatches = [
    ...bracket.winnerBracket,
    ...bracket.loserBracket,
  ];
  
  // Check if there are any incomplete matches in previous rounds that feed into this match
  const feedingMatches = allMatches.filter(m => 
    m.nextWinnerMatchId === targetMatch.id || 
    m.nextLoserMatchId === targetMatch.id
  );
  
  // If any feeding match is not completed, we might still receive participants
  const hasIncompleteFeedingMatches = feedingMatches.some(m => m.status !== 'completed');
  
  return hasIncompleteFeedingMatches;
}

/**
 * Check if a match result can be reverted
 */
export function canRevertMatch(bracket: Bracket, matchId: string): boolean {
  const match = findMatch(bracket, matchId);
  if (!match || match.status !== 'completed') return false;

  // Check if next matches have been played
  if (match.nextWinnerMatchId) {
    const nextMatch = findMatch(bracket, match.nextWinnerMatchId);
    if (nextMatch && nextMatch.status === 'completed') {
      return false;
    }
  }

  if (match.nextLoserMatchId) {
    const nextMatch = findMatch(bracket, match.nextLoserMatchId);
    if (nextMatch && nextMatch.status === 'completed') {
      return false;
    }
  }

  return true;
}

/**
 * Revert a match result
 */
export function revertMatchResult(
  tournament: Tournament,
  matchId: string
): Tournament {
  if (!tournament.bracket) {
    throw new Error('Tournament bracket not initialized');
  }

  const match = findMatch(tournament.bracket, matchId);
  if (!match) {
    throw new Error(`Match ${matchId} not found`);
  }

  if (!canRevertMatch(tournament.bracket, matchId)) {
    throw new Error('Cannot revert - subsequent matches already played');
  }

  // Revert participant loss counts
  if (match.loserId) {
    const loser = tournament.participants.find((p: Participant) => p.id === match.loserId);
    if (loser && loser.lossCount > 0) {
      loser.lossCount--;
      loser.eliminated = false;
      loser.finalPosition = undefined;
    }
  }

  // Remove participants from next matches
  if (match.nextWinnerMatchId && match.winnerId) {
    removeParticipantFromMatch(tournament.bracket, match.nextWinnerMatchId, match.winnerId);
  }

  if (match.nextLoserMatchId && match.loserId) {
    removeParticipantFromMatch(tournament.bracket, match.nextLoserMatchId, match.loserId);
  }

  // Reset match
  match.winnerId = null;
  match.loserId = null;
  match.status = 'pending';

  // Recalculate partial positions after reverting
  assignFinalPositions(tournament);

  tournament.updatedAt = new Date().toISOString();

  return tournament;
}

/**
 * Remove a participant from a match
 */
function removeParticipantFromMatch(
  bracket: Bracket,
  matchId: string,
  participantId: string
): void {
  const match = findMatch(bracket, matchId);
  if (!match) return;

  if (match.participant1Id === participantId) {
    match.participant1Id = null;
  } else if (match.participant2Id === participantId) {
    match.participant2Id = null;
  }

  // Reset match status if needed
  if (!match.participant1Id || !match.participant2Id) {
    match.status = 'pending';
    match.winnerId = null;
    match.loserId = null;
  }
}

/**
 * Check if tournament is complete and determine champion
 */
function checkTournamentCompletion(tournament: Tournament): void {
  if (!tournament.bracket) return;

  // ── Single Elimination: Check if final match is completed ────────────
  if (tournament.mode === 'single_elimination') {
    const wb = tournament.bracket.winnerBracket;
    if (wb.length === 0) return;
    
    // The final match is the last match in the winner bracket
    const finalMatch = wb[wb.length - 1];
    if (finalMatch.status === 'completed' && finalMatch.winnerId) {
      tournament.championId = finalMatch.winnerId;
      tournament.status = 'completed';
      assignFinalPositions(tournament);
    }
    return;
  }

  // ── Double Elimination logic ─────────────────────────────────────────
  const grandFinal      = tournament.bracket.grandFinal;
  const grandFinalReset = tournament.bracket.grandFinalReset;

  // ── Case 1: Reset match just completed → tournament over ────────────
  if (grandFinalReset && grandFinalReset.status === 'completed' && grandFinalReset.winnerId) {
    tournament.championId = grandFinalReset.winnerId;
    tournament.status = 'completed';
    assignFinalPositions(tournament);
    return;
  }

  // ── Grand final must be completed to proceed ─────────────────────────
  if (!grandFinal || grandFinal.status !== 'completed') return;

  // ── Case 2: Grand final completed, LB winner won → create reset ──────
  // participant2 is always the LB champion (set in generateGrandFinal)
  const lbChampionId = grandFinal.participant2Id;
  if (grandFinal.winnerId === lbChampionId && !grandFinalReset) {
    tournament.bracket.grandFinalReset = {
      id: 'grand-final-reset',
      roundNumber: 2,
      matchNumber: 1,
      bracketType: 'grand_final',
      participant1Id: grandFinal.participant1Id,
      participant2Id: grandFinal.participant2Id,
      winnerId: null,
      loserId: null,
      status: 'in_progress',
      nextWinnerMatchId: null,
      nextLoserMatchId: null,
    };
    return;
  }

  // ── Case 3: Grand final completed, WB winner won → tournament over ───
  if (grandFinal.winnerId === grandFinal.participant1Id) {
    tournament.championId = grandFinal.winnerId;
    tournament.status = 'completed';
    assignFinalPositions(tournament);
  }
}

/**
 * Assign final/partial positions to all participants.
 *
 * For single elimination:
 *   - Players eliminated in the same round share the same position
 *   - Position is based on round of elimination (later rounds = better placement)
 *
 * For double elimination:
 *   - Same logic as Challonge / start.gg
 *   - LB round determines placement with Challonge formula
 */
export function assignFinalPositions(tournament: Tournament): void {
  if (!tournament.bracket) return;

  // Reset all positions so the calculation is deterministic every call.
  for (const p of tournament.participants) {
    p.finalPosition = undefined;
  }

  // 1st — champion
  if (tournament.championId) {
    const champ = tournament.participants.find((p: Participant) => p.id === tournament.championId);
    if (champ) champ.finalPosition = 1;
  }

  // ── Single Elimination positioning ───────────────────────────────────
  if (tournament.mode === 'single_elimination') {
    const wb = tournament.bracket.winnerBracket;
    if (wb.length === 0) return;

    // 2nd — loser of the final match
    const finalMatch = wb[wb.length - 1];
    if (finalMatch?.loserId) {
      const runnerUp = tournament.participants.find((p: Participant) => p.id === finalMatch.loserId);
      if (runnerUp) runnerUp.finalPosition = 2;
    }

    // Remaining positions based on round of elimination
    const maxRound = Math.max(...wb.map((m: Match) => m.roundNumber));
    
    for (const m of wb) {
      if (m.status !== 'completed' || !m.loserId) continue;
      const loser = tournament.participants.find((p: Participant) => p.id === m.loserId);
      if (!loser || loser.finalPosition) continue; // Skip if already assigned (e.g., 2nd place)

      // Calculate position based on round of elimination
      // Round 1 losers get worst positions, final loser gets 2nd
      const roundsFromEnd = maxRound - m.roundNumber;
      let position = 2; // Start after champion
      let groupSize = 1;
      
      for (let i = 0; i < roundsFromEnd; i++) {
        position += groupSize;
        groupSize *= 2;
      }

      loser.finalPosition = position;
    }
    return;
  }

  // ── Double Elimination positioning ───────────────────────────────────
  // 2nd — loser of the deciding grand final
  const decidingFinal = tournament.bracket.grandFinalReset ?? tournament.bracket.grandFinal;
  if (decidingFinal?.loserId) {
    const runnerUp = tournament.participants.find((p: Participant) => p.id === decidingFinal.loserId);
    if (runnerUp) runnerUp.finalPosition = 2;
  }

  const lb = tournament.bracket.loserBracket ?? [];
  if (lb.length === 0) return;

  // maxLBRound is fixed from bracket generation — use ALL LB matches, not just completed ones.
  const maxLBRound = Math.max(...lb.map((m: Match) => m.roundNumber));

  for (const m of lb) {
    if (m.status !== 'completed' || !m.loserId) continue;
    const loser = tournament.participants.find((p: Participant) => p.id === m.loserId);
    if (!loser || !loser.eliminated) continue;

    // Compute starting position for this LB round using Challonge formula.
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
