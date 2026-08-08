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

  // Process BYEs - advance winners to next matches
  processByeMatches(matches);

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
 * Process BYE matches and advance winners automatically
 */
function processByeMatches(matches: Match[]): void {
  // Advance winners from completed BYE matches
  let changed = true;
  let iterations = 0;
  const maxIterations = 10;
  
  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;
    
    matches.forEach((match: Match) => {
      // If match is completed (BYE) and has a winner, advance them
      if (match.status === 'completed' && match.winnerId && match.nextWinnerMatchId) {
        const nextMatch = matches.find((m: Match) => m.id === match.nextWinnerMatchId);
        if (nextMatch) {
          // Check if winner is already in the next match
          const alreadyPlaced = nextMatch.participant1Id === match.winnerId || 
                               nextMatch.participant2Id === match.winnerId;
          
          if (!alreadyPlaced) {
            // Place winner in next match
            if (nextMatch.participant1Id === null) {
              nextMatch.participant1Id = match.winnerId;
              changed = true;
            } else if (nextMatch.participant2Id === null) {
              nextMatch.participant2Id = match.winnerId;
              changed = true;
            }
          }
          
          // If both participants are present in next match, set it to in_progress
          if (nextMatch.participant1Id && nextMatch.participant2Id) {
            nextMatch.status = 'in_progress';
          }
        }
      }
    });
  }
}

/**
 * Generate loser bracket with correct double elimination structure
 * Pattern: After each Winner round, Loser has 2 rounds (except first)
 * - Odd Loser rounds: Receive losers from Winner
 * - Even Loser rounds: Winners from previous Loser round play each other
 */
function generateLoserBracket(
  participantCount: number,
  winnerBracket: Match[]
): Match[] {
  if (participantCount <= 2) return [];
  
  const matches: Match[] = [];
  const bracketSize = nextPowerOfTwo(participantCount);
  const winnerRounds = Math.log2(bracketSize);
  
  console.log('=== LOSER BRACKET GENERATION ===');
  console.log('Participants:', participantCount);
  console.log('Bracket Size:', bracketSize);
  console.log('Winner Rounds:', winnerRounds);
  
  let loserRound = 1;
  
  // Loser Round 1: Receives losers from Winner Round 1
  const losersFromWR1 = bracketSize / 2; // All matches from Winner R1
  const lr1Matches = losersFromWR1 / 2;
  console.log(`Loser R${loserRound}: ${lr1Matches} matches (${losersFromWR1} losers from Winner R1)`);
  
  for (let i = 0; i < lr1Matches; i++) {
    matches.push({
      id: generateMatchId('loser', loserRound, i + 1),
      roundNumber: loserRound,
      matchNumber: i + 1,
      bracketType: 'loser',
      participant1Id: null,
      participant2Id: null,
      winnerId: null,
      loserId: null,
      status: 'pending',
      nextWinnerMatchId: null,
      nextLoserMatchId: null,
    });
  }
  loserRound++;
  
  // Subsequent rounds follow the pattern
  for (let winnerRound = 2; winnerRound <= winnerRounds; winnerRound++) {
    // Odd Loser Round: Receives losers from Winner + winners from previous Loser
    const losersFromWinner = bracketSize / Math.pow(2, winnerRound);
    const winnersFromPrevLoser = bracketSize / Math.pow(2, winnerRound);
    const totalParticipants = losersFromWinner + winnersFromPrevLoser;
    const oddRoundMatches = totalParticipants / 2;
    
    console.log(`Loser R${loserRound}: ${oddRoundMatches} matches (${losersFromWinner} from Winner R${winnerRound} + ${winnersFromPrevLoser} from Loser R${loserRound-1})`);
    
    for (let i = 0; i < oddRoundMatches; i++) {
      matches.push({
        id: generateMatchId('loser', loserRound, i + 1),
        roundNumber: loserRound,
        matchNumber: i + 1,
        bracketType: 'loser',
        participant1Id: null,
        participant2Id: null,
        winnerId: null,
        loserId: null,
        status: 'pending',
        nextWinnerMatchId: null,
        nextLoserMatchId: null,
      });
    }
    loserRound++;
    
    // Even Loser Round: Only winners from previous Loser round
    if (oddRoundMatches > 1) {
      const evenRoundMatches = oddRoundMatches / 2;
      console.log(`Loser R${loserRound}: ${evenRoundMatches} matches (${oddRoundMatches} winners from Loser R${loserRound-1})`);
      
      for (let i = 0; i < evenRoundMatches; i++) {
        matches.push({
          id: generateMatchId('loser', loserRound, i + 1),
          roundNumber: loserRound,
          matchNumber: i + 1,
          bracketType: 'loser',
          participant1Id: null,
          participant2Id: null,
          winnerId: null,
          loserId: null,
          status: 'pending',
          nextWinnerMatchId: null,
          nextLoserMatchId: null,
        });
      }
      loserRound++;
    }
  }

  console.log('Total Loser Matches:', matches.length);
  console.log('Loser Rounds:', loserRound - 1);

  // Link loser bracket matches
  linkLoserBracketMatchesCorrect(matches);
  
  // Link winner bracket to loser bracket
  linkWinnerToLoserBracketCorrect(winnerBracket, matches);

  return matches;
}

/**
 * Link loser bracket matches correctly
 * Pattern depends on round parity (odd/even)
 */
function linkLoserBracketMatchesCorrect(matches: Match[]): void {
  if (matches.length === 0) return;
  
  console.log('=== LINKING LOSER BRACKET ===');
  
  const maxRound = Math.max(...matches.map((m: Match) => m.roundNumber));
  
  for (let round = 1; round < maxRound; round++) {
    const currentRoundMatches = matches.filter((m: Match) => m.roundNumber === round);
    const nextRoundMatches = matches.filter((m: Match) => m.roundNumber === round + 1);
    
    if (nextRoundMatches.length === 0) continue;
    
    console.log(`Loser R${round} (${currentRoundMatches.length} matches) → Loser R${round + 1} (${nextRoundMatches.length} matches)`);
    
    // Determine pattern based on round numbers
    // Odd rounds (1, 3, 5...) go to even rounds (2, 4, 6...)
    // Pattern: 1:1 mapping when same count, 2:1 when consolidating
    if (currentRoundMatches.length === nextRoundMatches.length) {
      // 1:1 mapping (e.g., L R1 → L R2, both have 2 matches)
      currentRoundMatches.forEach((match: Match, index: number) => {
        if (nextRoundMatches[index]) {
          match.nextWinnerMatchId = nextRoundMatches[index].id;
          console.log(`  L R${round} M${index + 1} → L R${round + 1} M${index + 1}`);
        }
      });
    } else {
      // 2:1 mapping (consolidation, e.g., L R2 → L R3)
      currentRoundMatches.forEach((match: Match, index: number) => {
        const nextMatchIndex = Math.floor(index / 2);
        if (nextRoundMatches[nextMatchIndex]) {
          match.nextWinnerMatchId = nextRoundMatches[nextMatchIndex].id;
          console.log(`  L R${round} M${index + 1} → L R${round + 1} M${nextMatchIndex + 1}`);
        }
      });
    }
  }
}

/**
 * Link winner bracket to loser bracket correctly
 * Winner R1 → Loser R1
 * Winner R2 → Loser R2 (odd round that receives losers)
 * Winner R3 → Loser R4 (odd round that receives losers)
 * Pattern: Winner Rn → Loser R(2n-2) for n >= 2
 */
function linkWinnerToLoserBracketCorrect(
  winnerMatches: Match[],
  loserMatches: Match[]
): void {
  if (loserMatches.length === 0) return;
  
  console.log('=== LINKING WINNER TO LOSER ===');
  
  // Group loser matches by round
  const loserByRound: { [round: number]: Match[] } = {};
  loserMatches.forEach((m: Match) => {
    if (!loserByRound[m.roundNumber]) {
      loserByRound[m.roundNumber] = [];
    }
    loserByRound[m.roundNumber].push(m);
  });
  
  console.log('Loser rounds:', Object.keys(loserByRound).map(Number));
  
  // Winner Round 1 → Loser Round 1
  const winnerRound1 = winnerMatches.filter((m: Match) => m.roundNumber === 1);
  console.log(`Winner R1 (${winnerRound1.length} matches) → Loser R1 (${loserByRound[1]?.length || 0} matches)`);
  
  if (loserByRound[1]) {
    winnerRound1.forEach((match: Match, index: number) => {
      const loserMatchIndex = Math.floor(index / 2);
      if (loserByRound[1][loserMatchIndex]) {
        match.nextLoserMatchId = loserByRound[1][loserMatchIndex].id;
        console.log(`  W R1 M${index + 1} → L R1 M${loserMatchIndex + 1}`);
      }
    });
  }
  
  // Winner Round n → Loser Round (2n-2) for n >= 2
  const maxWinnerRound = Math.max(...winnerMatches.map((m: Match) => m.roundNumber));
  for (let winnerRound = 2; winnerRound <= maxWinnerRound; winnerRound++) {
    const loserRoundTarget = (winnerRound - 1) * 2;
    
    const winnerRoundMatches = winnerMatches.filter((m: Match) => m.roundNumber === winnerRound);
    console.log(`Winner R${winnerRound} (${winnerRoundMatches.length} matches) → Loser R${loserRoundTarget} (${loserByRound[loserRoundTarget]?.length || 0} matches)`);
    
    if (!loserByRound[loserRoundTarget]) {
      console.log(`  WARNING: Loser R${loserRoundTarget} doesn't exist!`);
      continue;
    }
    
    // Each winner match sends loser to corresponding loser match
    winnerRoundMatches.forEach((match: Match, index: number) => {
      if (loserByRound[loserRoundTarget][index]) {
        match.nextLoserMatchId = loserByRound[loserRoundTarget][index].id;
        console.log(`  W R${winnerRound} M${index + 1} → L R${loserRoundTarget} M${index + 1}`);
      } else {
        console.log(`  WARNING: W R${winnerRound} M${index + 1} has no target in L R${loserRoundTarget}`);
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
