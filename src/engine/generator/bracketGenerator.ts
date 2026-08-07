import { Match, Participant, Bracket } from '@/models/types';
import {
  nextPowerOfTwo,
  calculateWinnerRounds,
  calculateLoserRounds,
  generateMatchId,
} from '@/engine/utils/bracketMath';
import { generateStandardSeeding, applySeedingPattern } from '@/engine/seeding/seeding';

/**
 * Generate a complete double elimination bracket
 */
export function generateDoubleEliminationBracket(
  participants: Participant[]
): Bracket {
  const winnerBracket = generateWinnerBracket(participants);
  const loserBracket = generateLoserBracket(participants.length, winnerBracket);
  const grandFinal = generateGrandFinal(winnerBracket, loserBracket);

  return {
    winnerBracket,
    loserBracket,
    grandFinal,
    grandFinalReset: null, // Created dynamically if needed
  };
}

/**
 * Generate winner bracket matches
 */
function generateWinnerBracket(participants: Participant[]): Match[] {
  const matches: Match[] = [];
  const bracketSize = nextPowerOfTwo(participants.length);
  const rounds = calculateWinnerRounds(participants.length);
  
  // Apply standard seeding
  const seedingPattern = generateStandardSeeding(bracketSize);
  const seededParticipants = applySeedingPattern(participants, seedingPattern);

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
      nextWinnerMatchId: null, // Will be set below
      nextLoserMatchId: null, // Will be set when generating loser bracket
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
        participant1Id: null, // TBD from previous matches
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

  // Link matches (set nextWinnerMatchId)
  linkWinnerBracketMatches(matches, rounds);

  return matches;
}

/**
 * Link winner bracket matches together
 */
function linkWinnerBracketMatches(matches: Match[], totalRounds: number): void {
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
 * Generate loser bracket matches
 */
function generateLoserBracket(
  participantCount: number,
  winnerBracket: Match[]
): Match[] {
  const matches: Match[] = [];
  const loserRounds = calculateLoserRounds(participantCount);
  
  if (loserRounds === 0) return matches;

  // Loser bracket structure is more complex
  // Round 1: Losers from Winner Round 1
  // Round 2: Winners from Loser Round 1 vs Losers from Winner Round 2
  // And so on...

  let matchCounter = 1;
  
  for (let round = 1; round <= loserRounds; round++) {
    // Determine how many matches in this round
    const matchesInRound = calculateLoserRoundMatches(round, participantCount);
    
    for (let i = 0; i < matchesInRound; i++) {
      const match: Match = {
        id: generateMatchId('loser', round, i + 1),
        roundNumber: round,
        matchNumber: i + 1,
        bracketType: 'loser',
        participant1Id: null, // Will be filled from winner bracket losers
        participant2Id: null,
        winnerId: null,
        loserId: null,
        status: 'pending',
        nextWinnerMatchId: null,
        nextLoserMatchId: null, // No loser advancement in loser bracket
      };
      
      matches.push(match);
      matchCounter++;
    }
  }

  // Link loser bracket matches
  linkLoserBracketMatches(matches, loserRounds);
  
  // Link winner bracket to loser bracket
  linkWinnerToLoserBracket(winnerBracket, matches);

  return matches;
}

/**
 * Calculate number of matches in a loser bracket round
 */
function calculateLoserRoundMatches(round: number, participantCount: number): number {
  const bracketSize = nextPowerOfTwo(participantCount);
  const winnerRounds = Math.log2(bracketSize);
  
  // Loser bracket alternates between receiving losers and playing among themselves
  if (round === 1) {
    return bracketSize / 4; // First round gets losers from winner round 1
  }
  
  // Odd rounds: receive new losers from winner bracket
  // Even rounds: winners from previous loser round play each other
  const winnerRoundSource = Math.ceil(round / 2) + 1;
  
  if (winnerRoundSource > winnerRounds) {
    return Math.max(1, bracketSize / Math.pow(2, round + 1));
  }
  
  return Math.max(1, bracketSize / Math.pow(2, Math.ceil(round / 2) + 1));
}

/**
 * Link loser bracket matches together
 */
function linkLoserBracketMatches(matches: Match[], totalRounds: number): void {
  for (let round = 1; round < totalRounds; round++) {
    const currentRoundMatches = matches.filter(m => m.roundNumber === round);
    const nextRoundMatches = matches.filter(m => m.roundNumber === round + 1);
    
    currentRoundMatches.forEach((match, index) => {
      // Loser bracket linking is more complex due to alternating structure
      const nextMatchIndex = Math.floor(index / 2);
      if (nextRoundMatches[nextMatchIndex]) {
        match.nextWinnerMatchId = nextRoundMatches[nextMatchIndex].id;
      }
    });
  }
}

/**
 * Link winner bracket losers to loser bracket
 */
function linkWinnerToLoserBracket(
  winnerMatches: Match[],
  loserMatches: Match[]
): void {
  // First round of winner bracket losers go to first round of loser bracket
  const winnerRound1 = winnerMatches.filter(m => m.roundNumber === 1);
  const loserRound1 = loserMatches.filter(m => m.roundNumber === 1);
  
  winnerRound1.forEach((match, index) => {
    const loserMatchIndex = Math.floor(index / 2);
    if (loserRound1[loserMatchIndex]) {
      match.nextLoserMatchId = loserRound1[loserMatchIndex].id;
    }
  });

  // Subsequent winner rounds feed into loser bracket
  const winnerRounds = Math.max(...winnerMatches.map(m => m.roundNumber));
  
  for (let round = 2; round <= winnerRounds; round++) {
    const winnerRoundMatches = winnerMatches.filter(m => m.roundNumber === round);
    const loserRoundNumber = (round - 1) * 2;
    const loserRoundMatches = loserMatches.filter(m => m.roundNumber === loserRoundNumber);
    
    winnerRoundMatches.forEach((match, index) => {
      if (loserRoundMatches[index]) {
        match.nextLoserMatchId = loserRoundMatches[index].id;
      }
    });
  }
}

/**
 * Generate grand final match
 */
function generateGrandFinal(
  winnerBracket: Match[],
  loserBracket: Match[]
): Match {
  const finalWinnerMatch = winnerBracket[winnerBracket.length - 1];
  const finalLoserMatch = loserBracket[loserBracket.length - 1];

  // Link finals to grand final
  if (finalWinnerMatch) {
    finalWinnerMatch.nextWinnerMatchId = 'grand-final';
  }
  if (finalLoserMatch) {
    finalLoserMatch.nextWinnerMatchId = 'grand-final';
  }

  return {
    id: 'grand-final',
    roundNumber: 1,
    matchNumber: 1,
    bracketType: 'grand_final',
    participant1Id: null, // Winner bracket champion
    participant2Id: null, // Loser bracket champion
    winnerId: null,
    loserId: null,
    status: 'pending',
    nextWinnerMatchId: null,
    nextLoserMatchId: null,
  };
}
