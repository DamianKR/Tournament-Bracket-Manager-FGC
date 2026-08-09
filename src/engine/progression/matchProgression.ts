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
    
    // Check if eliminated (2 losses in double elimination)
    if (loser.lossCount >= 2) {
      loser.eliminated = true;
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

  // Update timestamp
  tournament.updatedAt = new Date().toISOString();

  return tournament;
}

/**
 * Find a match by ID in the bracket
 */
function findMatch(bracket: Bracket, matchId: string): Match | null {
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
function canRevertMatch(bracket: Bracket, matchId: string): boolean {
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
 * Assign final positions to all participants.
 *
 * Logic:
 *   1st  — tournament champion
 *   2nd  — grand final runner-up
 *   3rd  — loser of Loser Finals (last loser bracket match before grand final)
 *   4th  — loser of Loser Semifinals
 *   5th–6th  — losers of the round before that (shared position, alphabetical tiebreak)
 *   … and so on, doubling the group size each round going back.
 *
 * Participants are grouped by the loser-bracket round in which they were eliminated.
 * Everyone eliminated in the same LB round shares the same starting position.
 */
function assignFinalPositions(tournament: Tournament): void {
  if (!tournament.bracket) return;

  // 1st place — champion
  const champion = tournament.participants.find(
    (p: Participant) => p.id === tournament.championId
  );
  if (champion) champion.finalPosition = 1;

  // 2nd place — loser of the deciding grand final match
  const decidingFinal =
    tournament.bracket.grandFinalReset ?? tournament.bracket.grandFinal;
  const runnerUpId = decidingFinal?.loserId;
  const runnerUp = tournament.participants.find((p: Participant) => p.id === runnerUpId);
  if (runnerUp) runnerUp.finalPosition = 2;

  // Collect all loser-bracket matches that produced an elimination, grouped by round.
  // The loser of a LB match is eliminated (2 losses total).
  const loserMatches = [...(tournament.bracket.loserBracket ?? [])].sort(
    (a, b) => b.roundNumber - a.roundNumber   // highest round first = earliest to assign
  );

  // Map roundNumber → list of eliminated participantIds
  const eliminatedByLBRound: Map<number, string[]> = new Map();
  for (const m of loserMatches) {
    if (m.status === 'completed' && m.loserId) {
      const loser = tournament.participants.find((p: Participant) => p.id === m.loserId);
      if (loser && loser.eliminated && !loser.finalPosition) {
        const list = eliminatedByLBRound.get(m.roundNumber) ?? [];
        list.push(m.loserId);
        eliminatedByLBRound.set(m.roundNumber, list);
      }
    }
  }

  // Assign positions starting at 3, grouping by LB round (highest round = best placement).
  // Participants eliminated in the same round share the same position range.
  const rounds = [...eliminatedByLBRound.keys()].sort((a, b) => b - a); // desc
  let nextPosition = 3;
  for (const round of rounds) {
    const ids = eliminatedByLBRound.get(round)!;
    for (const pid of ids) {
      const p = tournament.participants.find((par: Participant) => par.id === pid);
      if (p && !p.finalPosition) p.finalPosition = nextPosition;
    }
    nextPosition += ids.length;
  }

  // Fallback: any still-eliminated participant without a position
  const remaining = tournament.participants.filter(
    (p: Participant) => p.eliminated && !p.finalPosition
  );
  remaining.forEach((p: Participant) => {
    p.finalPosition = nextPosition++;
  });
}
