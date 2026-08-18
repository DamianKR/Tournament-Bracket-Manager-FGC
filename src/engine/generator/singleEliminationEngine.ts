import { Match, Participant, Bracket } from '@/models/types';
import {
  nextPowerOfTwo,
  generateMatchId,
} from '@/engine/utils/bracketMath';

/**
 * Generate a complete single elimination bracket
 */
export function generateSingleEliminationBracket(
  participants: Participant[]
): Bracket {
  const winnerBracket = generateSingleEliminationMatches(participants);

  return {
    winnerBracket,
    loserBracket: [],
    grandFinal: null,
    grandFinalReset: null,
  };
}

/**
 * Distribute players across bracket slots preserving order, with BYEs spread.
 */
function distributeByes(
  players: Participant[],
  bracketSize: number
): (Participant | null)[] {
  const numMatches = bracketSize / 2;
  const numByes = bracketSize - players.length;
  const slots: (Participant | null)[] = [];

  let playerIdx = 0;
  let byesLeft = numByes;

  for (let match = 0; match < numMatches; match++) {
    const p1 = playerIdx < players.length ? players[playerIdx++] : null;

    let p2: Participant | null;
    if (match === 0) {
      // First match: always pair two players together
      p2 = playerIdx < players.length ? players[playerIdx++] : null;
    } else if (byesLeft > 0 && playerIdx < players.length) {
      // Has byes remaining: give this player a BYE
      p2 = null;
      byesLeft--;
    } else {
      // No byes left (or no player for p1): pair normally
      p2 = playerIdx < players.length ? players[playerIdx++] : null;
    }

    slots.push(p1, p2);
  }

  return slots;
}

/**
 * Generate single elimination matches
 */
function generateSingleEliminationMatches(participants: Participant[]): Match[] {
  const matches: Match[] = [];
  const bracketSize = nextPowerOfTwo(participants.length);
  const rounds = Math.log2(bracketSize);
  
  // Use participants in the exact order the user arranged them (by seed).
  const sortedParticipants = [...participants].sort((a, b) => a.seed - b.seed);
  const seededParticipants = distributeByes(sortedParticipants, bracketSize);

  // Generate first round matches
  const firstRoundMatches = bracketSize / 2;
  for (let i = 0; i < firstRoundMatches; i++) {
    const p1 = seededParticipants[i * 2];
    const p2 = seededParticipants[i * 2 + 1];
    
    const match: Match = {
      id: generateMatchId('winner', 1, i + 1),
      roundNumber: 1,
      matchNumber: i + 1,
      bracketType: 'winner',
      participant1Id: p1?.id || null,
      participant2Id: p2?.id || null,
      winnerId: null,
      loserId: null,
      status: 'pending',
      nextWinnerMatchId: null,
      nextLoserMatchId: null,
    };

    // Auto-advance if one participant is null (BYE)
    if (!p1 && p2) {
      match.winnerId = p2.id;
      match.status = 'completed';
    } else if (p1 && !p2) {
      match.winnerId = p1.id;
      match.status = 'completed';
    }

    matches.push(match);
  }

  // Generate subsequent rounds
  let previousRoundSize = firstRoundMatches;
  for (let round = 2; round <= rounds; round++) {
    const currentRoundSize = previousRoundSize / 2;
    
    for (let i = 0; i < currentRoundSize; i++) {
      const match: Match = {
        id: generateMatchId('winner', round, i + 1),
        roundNumber: round,
        matchNumber: i + 1,
        bracketType: 'winner',
        participant1Id: null,
        participant2Id: null,
        winnerId: null,
        loserId: null,
        status: 'pending',
        nextWinnerMatchId: null,
        nextLoserMatchId: null,
      };
      
      matches.push(match);
    }
    
    previousRoundSize = currentRoundSize;
  }

  // Link matches
  linkSingleEliminationMatches(matches, rounds);

  // Process BYEs
  processByeMatches(matches);

  return matches;
}

/**
 * Link single elimination matches together
 */
function linkSingleEliminationMatches(matches: Match[], totalRounds: number): void {
  for (let round = 1; round < totalRounds; round++) {
    const currentRoundMatches = matches.filter(m => m.roundNumber === round);
    const nextRoundMatches = matches.filter(m => m.roundNumber === round + 1);
    
    currentRoundMatches.forEach((match, index) => {
      const nextMatchIndex = Math.floor(index / 2);
      match.nextWinnerMatchId = nextRoundMatches[nextMatchIndex]?.id || null;
    });
  }
}

/**
 * Process BYE matches and advance winners automatically
 */
function processByeMatches(matches: Match[]): void {
  let changed = true;
  let iterations = 0;
  const maxIterations = 10;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    matches.forEach((match: Match) => {
      if (match.status !== 'pending') return;

      // Double-BYE: both slots are null
      const isDoubleBye = match.participant1Id === null && match.participant2Id === null;
      if (isDoubleBye) {
        const feeders = matches.filter((m: Match) => m.nextWinnerMatchId === match.id);
        const allFeedersResolved = feeders.length === 0 ||
          feeders.every((m: Match) => m.status === 'completed');
        if (allFeedersResolved) {
          match.status = 'completed';
          changed = true;
        }
        return;
      }

      // Single-BYE: one participant present
      const singleByeWinner = match.participant1Id && !match.participant2Id
        ? match.participant1Id
        : !match.participant1Id && match.participant2Id
          ? match.participant2Id
          : null;

      if (singleByeWinner) {
        const emptySlotFeeders = matches.filter((m: Match) => m.nextWinnerMatchId === match.id);
        const allResolved = emptySlotFeeders.length === 0 ||
          emptySlotFeeders.every((m: Match) => m.status === 'completed');
        if (allResolved) {
          match.winnerId = singleByeWinner;
          match.status = 'completed';
          changed = true;
        }
      }
    });

    // Advance winners from completed BYE matches
    matches.forEach((match: Match) => {
      if (match.status === 'completed' && match.winnerId && match.nextWinnerMatchId) {
        const nextMatch = matches.find((m: Match) => m.id === match.nextWinnerMatchId);
        if (nextMatch) {
          const alreadyPlaced = nextMatch.participant1Id === match.winnerId ||
            nextMatch.participant2Id === match.winnerId;
          if (!alreadyPlaced) {
            if (nextMatch.participant1Id === null) {
              nextMatch.participant1Id = match.winnerId;
              changed = true;
            } else if (nextMatch.participant2Id === null) {
              nextMatch.participant2Id = match.winnerId;
              changed = true;
            }
          }
          if (nextMatch.participant1Id && nextMatch.participant2Id) {
            nextMatch.status = 'in_progress';
          }
        }
      }
    });
  }
}
