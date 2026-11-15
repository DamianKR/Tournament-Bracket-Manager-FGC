import { Match, Participant, Bracket, Tournament } from '@/models/types';
import type { MatchGame } from '@/models/rankedMatch';

/**
 * Record match result and advance participants
 */
export function recordMatchResult(
  tournament: Tournament,
  matchId: string,
  winnerId: string,
  participant1Score?: number,
  participant2Score?: number,
  participant1Characters?: string[],
  participant2Characters?: string[],
  games?: MatchGame[]
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

  // Re-reporting a completed match: unwind the previous result first, or the
  // old winner/loser stays placed downstream and losses get double-counted.
  if (match.status === 'completed') {
    const prevWinnerId = match.winnerId;
    const prevLoserId = match.loserId;

    const wasDisqualification = !!match.disqualifiedId;
    if (match.disqualifiedId) {
      unwindDisqualification(tournament, match);
    } else if (prevLoserId) {
      const prevLoser = tournament.participants.find((p: Participant) => p.id === prevLoserId);
      if (prevLoser && prevLoser.lossCount > 0) {
        prevLoser.lossCount--;
        prevLoser.eliminated = false;
        prevLoser.finalPosition = undefined;
      }
    }

    // Reset before pulling downstream so bye checks see this feeder incomplete
    match.winnerId = null;
    match.loserId = null;
    match.status = 'pending';
    delete match.participant1Score;
    delete match.participant2Score;
    delete match.participant1Characters;
    delete match.participant2Characters;
    delete match.games;

    if (match.nextWinnerMatchId && prevWinnerId) {
      removeParticipantFromMatch(tournament.bracket, match.nextWinnerMatchId, prevWinnerId);
    }
    if (match.nextLoserMatchId && prevLoserId) {
      removeParticipantFromMatch(tournament.bracket, match.nextLoserMatchId, prevLoserId);
    }
    if (wasDisqualification) {
      settleBracket(tournament.bracket);
      // The DQ itself may have decided the title: the new result reopens the tournament, as an undo would.
      if (tournament.status === 'completed') {
        tournament.status = 'in_progress';
        tournament.championId = null;
        delete tournament.completedAt;
      }
    }
  }

  // Determine loser
  const loserId = match.participant1Id === winnerId 
    ? match.participant2Id 
    : match.participant1Id;

  // Update match
  match.winnerId = winnerId;
  match.loserId = loserId;
  match.status = 'completed';
  
  // Store detailed match result data
  if (participant1Score !== undefined) match.participant1Score = participant1Score;
  if (participant2Score !== undefined) match.participant2Score = participant2Score;
  if (participant1Characters && participant1Characters.length > 0) match.participant1Characters = participant1Characters;
  if (participant2Characters && participant2Characters.length > 0) match.participant2Characters = participant2Characters;
  if (games && games.length > 0) match.games = games;

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
 * Disqualify a participant in a ready match (both players present, not played yet).
 *
 * - The opponent wins by forfeit and advances like a normal winner.
 * - The DQ'd participant leaves the tournament: they do NOT drop to the loser bracket and
 *   never get a loss counted. Their loser-bracket slot is dead, so it resolves as a BYE.
 * - No scores / characters / games are stored: a DQ is not a played match, so stats,
 *   head-to-head and history must ignore it (see Match.disqualifiedId).
 * - Final position: the one their round gives (assignFinalPositions).
 * - Undo: revertMatchResult restores everything while later matches are unplayed.
 */
export function disqualifyParticipant(
  tournament: Tournament,
  matchId: string,
  disqualifiedId: string
): Tournament {
  if (!tournament.bracket) {
    throw new Error('Tournament bracket not initialized');
  }
  const bracket = tournament.bracket;

  const match = findMatch(bracket, matchId);
  if (!match) {
    throw new Error(`Match ${matchId} not found`);
  }
  if (match.status === 'completed') {
    throw new Error('Match already decided - undo it first');
  }
  if (!match.participant1Id || !match.participant2Id) {
    throw new Error('Both players must be in the match to disqualify one');
  }
  if (match.participant1Id !== disqualifiedId && match.participant2Id !== disqualifiedId) {
    throw new Error('Disqualified player must be in this match');
  }

  const winnerId = match.participant1Id === disqualifiedId ? match.participant2Id : match.participant1Id;

  match.winnerId = winnerId;
  match.loserId = disqualifiedId;
  match.disqualifiedId = disqualifiedId;
  match.status = 'completed';
  delete match.participant1Score;
  delete match.participant2Score;
  delete match.participant1Characters;
  delete match.participant2Characters;
  delete match.games;

  const dq = tournament.participants.find((p: Participant) => p.id === disqualifiedId);
  if (dq) {
    dq.disqualified = true;
    dq.eliminated = true;
    dq.finalPosition = undefined;
  }

  // The opponent advances exactly like a normal winner.
  if (match.nextWinnerMatchId) {
    if (match.bracketType === 'loser') {
      advanceParticipantToSlot(bracket, match.nextWinnerMatchId, winnerId, 1);
    } else {
      advanceParticipant(bracket, match.nextWinnerMatchId, winnerId);
    }
  }

  // The DQ'd player never reaches the loser bracket: that slot is dead, so let the
  // target match resolve as a BYE (or wait for its other feeder) instead of hanging.
  if (match.nextLoserMatchId) {
    const target = findMatch(bracket, match.nextLoserMatchId);
    if (target) checkAndProcessImplicitBye(bracket, target);
  }

  // An empty loser-bracket branch can ghost-out whole chains (up to a grand final with a single
  // finalist). A normal result always drops someone into the loser bracket, so the regular
  // progression never had to propagate that — settle the whole bracket now.
  settleBracket(bracket);

  checkTournamentCompletion(tournament);
  assignFinalPositions(tournament);
  tournament.updatedAt = new Date().toISOString();
  return tournament;
}

/**
 * Bring auto-resolved matches (BYEs / ghosts: completed without a loser) in line with the bracket:
 *   - one that can still receive a player (a feeder is not finished) is reopened;
 *   - a pending one that can never receive another player resolves as a BYE / ghost,
 *     and that resolution cascades to the following matches.
 * Runs to a fixed point. Only used around disqualifications.
 */
function settleBracket(bracket: Bracket): void {
  const everyMatch = (): Match[] => [
    ...bracket.winnerBracket,
    ...bracket.loserBracket,
    ...(bracket.grandFinal ? [bracket.grandFinal] : []),
    ...(bracket.grandFinalReset ? [bracket.grandFinalReset] : []),
  ];
  for (let pass = 0; pass < 200; pass++) {
    let changed = false;
    for (const m of everyMatch()) {
      if (m.status === 'completed' && !m.loserId && checkIfMatchCanReceiveParticipants(bracket, m)) {
        const winner = m.winnerId;
        m.status = 'pending';
        m.winnerId = null;
        if (winner && m.nextWinnerMatchId) removeParticipantFromMatch(bracket, m.nextWinnerMatchId, winner);
        changed = true;
      } else if (m.status === 'pending') {
        checkAndProcessImplicitBye(bracket, m);
        if (m.status !== 'pending') changed = true;
      }
    }
    if (!changed) return;
  }
}

/** Undo what a DQ did to its participant. The loss count was never touched. */
function unwindDisqualification(tournament: Tournament, match: Match): void {
  const dq = tournament.participants.find((p: Participant) => p.id === match.disqualifiedId);
  if (dq) {
    delete dq.disqualified;
    dq.eliminated = false;
    dq.finalPosition = undefined;
  }
  delete match.disqualifiedId;
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
 * Which slot a winner-bracket loser's drop-in targets.
 * WR1: odd matches → slot 1, even → slot 2. WR2+ → always slot 2.
 * (Must mirror the targetSlot logic in recordMatchResult.)
 */
function loserDropInTargetSlot(feeder: Match): 1 | 2 {
  return feeder.bracketType === 'winner' && feeder.roundNumber === 1
    ? (feeder.matchNumber % 2 === 1 ? 1 : 2)
    : 2;
}

/**
 * Can an empty slot still receive a participant?
 * Used by the UI to distinguish "TBD — waiting" from "dead slot".
 *
 * A slot is awaiting a participant when some incomplete feeder could still
 * fill it: winner-feeders (they fill the first free slot) or loser-feeders
 * whose drop-in targets this slot.
 */
export function isSlotAwaitingParticipant(
  bracket: Bracket,
  match: Match,
  slot: 1 | 2
): boolean {
  if (match.status === 'completed') return false;
  const feeders = [...bracket.winnerBracket, ...bracket.loserBracket];
  return feeders.some((m) => {
    if (m.status === 'completed') return false;
    if (m.nextWinnerMatchId === match.id) return true;
    if (m.nextLoserMatchId === match.id && loserDropInTargetSlot(m) === slot) return true;
    return false;
  });
}

/**
 * Check if a match result can be reverted
 */
export function canRevertMatch(bracket: Bracket, matchId: string): boolean {
  const match = findMatch(bracket, matchId);
  if (!match || match.status !== 'completed') return false;

  // Walk downstream through matches that were never actually played —
  // implicit byes and ghost matches are auto-completed by the engine and
  // must NOT block a revert. Only a match with a real reported result
  // (a loser) blocks.
  const queue = [match.nextWinnerMatchId, match.nextLoserMatchId].filter(
    (id): id is string => !!id
  );
  const seen = new Set<string>();
  while (queue.length > 0) {
    const nextId = queue.shift()!;
    if (seen.has(nextId)) continue;
    seen.add(nextId);
    const next = findMatch(bracket, nextId);
    if (!next || next.status !== 'completed') continue;
    if (next.loserId) return false; // really played — unsafe to revert
    // Ghost/bye: transparent — keep walking its outputs
    queue.push(
      ...[next.nextWinnerMatchId, next.nextLoserMatchId].filter(
        (id): id is string => !!id
      )
    );
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

  // Revert participant loss counts (a DQ never added a loss: it restores the participant instead)
  const wasDisqualification = !!match.disqualifiedId;
  if (match.disqualifiedId) {
    unwindDisqualification(tournament, match);
  } else if (match.loserId) {
    const loser = tournament.participants.find((p: Participant) => p.id === match.loserId);
    if (loser && loser.lossCount > 0) {
      loser.lossCount--;
      loser.eliminated = false;
      loser.finalPosition = undefined;
    }
  }

  const winnerId = match.winnerId;
  const loserId = match.loserId;

  // Reset the reverted match FIRST: downstream removals trigger implicit-bye
  // checks, and they must see this feeder as incomplete — otherwise a phantom
  // auto-bye fires mid-revert and advances someone who never played.
  match.winnerId = null;
  match.loserId = null;
  match.status = 'pending';
  delete match.participant1Score;
  delete match.participant2Score;
  delete match.participant1Characters;
  delete match.participant2Characters;
  delete match.games;

  // Remove participants from next matches
  if (match.nextWinnerMatchId && winnerId) {
    removeParticipantFromMatch(tournament.bracket, match.nextWinnerMatchId, winnerId);
  }

  if (match.nextLoserMatchId && loserId) {
    removeParticipantFromMatch(tournament.bracket, match.nextLoserMatchId, loserId);
  }

  // A DQ may have resolved whole dead branches (ghost chains up to the grand final): reopen
  // whatever can receive players again.
  if (wasDisqualification) settleBracket(tournament.bracket);

  // A grand-final revert invalidates a bracket-reset match created from it
  if (tournament.bracket.grandFinalReset && tournament.bracket.grandFinal?.status !== 'completed') {
    tournament.bracket.grandFinalReset = null;
  }

  // Reopening a finished tournament: revert un-decided the champion
  if (tournament.status === 'completed') {
    tournament.status = 'in_progress';
    tournament.championId = null;
    delete tournament.completedAt;
  }

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

  const removed =
    match.participant1Id === participantId ? (match.participant1Id = null, true) :
    match.participant2Id === participantId ? (match.participant2Id = null, true) : false;

  // A really-played match is never touched by a revert — canRevertMatch
  // guarantees it. Bail instead of corrupting a real result.
  const wasReallyPlayed = match.status === 'completed' && !!match.loserId;
  if (wasReallyPlayed) return;

  // Nothing removed from a live match, and nothing to reopen → done.
  if (!removed && match.status !== 'completed') return;

  // Capture who this match pushed downstream BEFORE reopening it — auto-byes
  // and ghosts can have propagated a winner into later matches.
  const pullWinner = match.winnerId && match.nextWinnerMatchId ? match.winnerId : null;
  const pullLoser = match.loserId && match.nextLoserMatchId ? match.loserId : null;

  // Reopen the match (also covers ghosts/byes whose feeder was just reverted
  // and can now receive a real participant). Reset before pulling so that
  // downstream bye checks see this match as incomplete.
  match.status = 'pending';
  match.winnerId = null;
  match.loserId = null;
  delete match.participant1Score;
  delete match.participant2Score;
  delete match.participant1Characters;
  delete match.participant2Characters;
  delete match.games;

  if (pullWinner) removeParticipantFromMatch(bracket, match.nextWinnerMatchId!, pullWinner);
  if (pullLoser) removeParticipantFromMatch(bracket, match.nextLoserMatchId!, pullLoser);

  // If nothing upstream can feed this match anymore, re-resolve it as a bye
  // (re-ghosts correctly or re-advances the remaining participant).
  checkAndProcessImplicitBye(bracket, match);
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

  // A disqualification in the grand final decides the title outright: the other
  // finalist is champion and there is no bracket reset to play.
  if (grandFinal.disqualifiedId && grandFinal.winnerId) {
    tournament.championId = grandFinal.winnerId;
    tournament.status = 'completed';
    assignFinalPositions(tournament);
    return;
  }

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
    loser.finalPosition = lbStartPosition(maxLBRound, m.roundNumber);
  }

  // A DQ in the winners bracket removes the player without a loser-bracket match: they
  // place as if eliminated in the LB round they would have dropped into. (A DQ in the
  // loser bracket or the grand final is already covered by m.loserId above.)
  for (const m of tournament.bracket.winnerBracket) {
    if (m.status !== 'completed' || !m.disqualifiedId || !m.nextLoserMatchId) continue;
    const dq = tournament.participants.find((p: Participant) => p.id === m.disqualifiedId);
    const target = findMatch(tournament.bracket, m.nextLoserMatchId);
    if (dq && dq.disqualified && target) dq.finalPosition = lbStartPosition(maxLBRound, target.roundNumber);
  }
}

/** First position of the group eliminated in a given loser-bracket round (Challonge formula). */
function lbStartPosition(maxLBRound: number, round: number): number {
  const roundsFromEnd = maxLBRound - round;
  let start = 3;
  let groupSize = 1;
  for (let i = 0; i < roundsFromEnd; i++) {
    start += groupSize;
    if (i % 2 === 1) groupSize *= 2;
  }
  return start;
}
