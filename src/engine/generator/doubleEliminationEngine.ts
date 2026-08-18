import { Match, Participant, Bracket } from '@/models/types';
import {
  nextPowerOfTwo,
  calculateWinnerRounds,
  generateMatchId,
} from '@/engine/utils/bracketMath';
// seeding.ts exports kept for external use; not needed here after switching to manual order

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
 * Distribute players across bracket slots preserving order, with BYEs spread.
 *
 * Strategy: fill matches one by one. The first match always gets 2 players
 * (they face each other). Each subsequent match gets 1 player + 1 BYE until
 * byes run out, then pairs remaining players.
 *
 * Examples (brackets of 8):
 *   5 players → [P1,P2, P3,null, P4,null, P5,null]
 *     M1: P1vP2  M2: P3vBYE  M3: P4vBYE  M4: P5vBYE
 *
 *   6 players → [P1,P2, P3,null, P4,null, P5,P6]
 *     M1: P1vP2  M2: P3vBYE  M3: P4vBYE  M4: P5vP6
 *
 *   7 players → [P1,P2, P3,null, P4,P5, P6,P7]
 *     M1: P1vP2  M2: P3vBYE  M3: P4vP5  M4: P6vP7
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
 * Generate winner bracket matches
 */
function generateWinnerBracket(participants: Participant[]): Match[] {
  const matches: Match[] = [];
  const bracketSize = nextPowerOfTwo(participants.length);
  const rounds = calculateWinnerRounds(participants.length);
  
  // Use participants in the exact order the user arranged them (by seed).
  // BYEs are distributed evenly so players get spread across the bracket
  // instead of being clumped at the top with all BYEs at the bottom.
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
  let changed = true;
  let iterations = 0;
  const maxIterations = 10;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    matches.forEach((match: Match) => {
      if (match.status !== 'pending') return;

      // Double-BYE in winner bracket: both slots are null and no pending feeder
      // can ever fill them → mark completed with no winner (ghost match)
      const isDoubleBye = match.participant1Id === null && match.participant2Id === null;
      if (isDoubleBye) {
        const feeders = matches.filter((m: Match) => m.nextWinnerMatchId === match.id);
        const allFeedersResolved = feeders.length === 0 ||
          feeders.every((m: Match) => m.status === 'completed');
        if (allFeedersResolved) {
          match.status = 'completed';
          // No winnerId — this slot is empty throughout the bracket
          changed = true;
        }
        return;
      }

      // Single-BYE: one participant present, no pending feeder for the empty slot
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

    // Advance winners from completed BYE matches with a winner
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

  // Process ghost matches (TBD vs TBD) that will never have participants
  processGhostMatches(matches, winnerBracket);

  return matches;
}

/**
 * Process ghost matches in loser bracket
 * Ghost matches are matches where both participants will never arrive (both are BYEs)
 */
function processGhostMatches(loserMatches: Match[], winnerMatches: Match[]): void {
  console.log('=== PROCESSING GHOST MATCHES ===');
  
  // For each loser match, check if both feeding winner matches are BYEs
  loserMatches.forEach((loserMatch: Match) => {
    if (loserMatch.status !== 'pending') return;
    
    // Find winner matches that feed into this loser match
    const feedingWinnerMatches = winnerMatches.filter((m: Match) => 
      m.nextLoserMatchId === loserMatch.id
    );
    
    // If all feeding winner matches are BYEs, this is a ghost match
    if (feedingWinnerMatches.length > 0) {
      const allAreByes = feedingWinnerMatches.every((m: Match) => 
        m.status === 'completed' && m.winnerId !== null
      );
      
      if (allAreByes) {
        // Also check if there are any loser matches feeding into this
        const feedingLoserMatches = loserMatches.filter((m: Match) => 
          m.nextWinnerMatchId === loserMatch.id
        );
        
        // If no loser matches feed into this, or they're all completed with no winners
        const noLoserFeeders = feedingLoserMatches.length === 0;
        const allLoserFeedersEmpty = feedingLoserMatches.every((m: Match) => 
          m.status === 'completed' && !m.winnerId
        );
        
        if (noLoserFeeders || allLoserFeedersEmpty) {
          console.log(`  Ghost match detected: ${loserMatch.id} (both participants are BYEs)`);
          loserMatch.status = 'completed';
          // No winner, no participants
        }
      }
    }
  });
  
  // Iteratively process ghost matches that are now unblocked
  let changed = true;
  let iterations = 0;
  const maxIterations = 10;
  
  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;
    
    loserMatches.forEach((loserMatch: Match) => {
      if (loserMatch.status !== 'pending') return;
      if (loserMatch.participant1Id !== null || loserMatch.participant2Id !== null) return;
      
      // Find all matches that feed into this one
      const feedingMatches = [
        ...winnerMatches.filter((m: Match) => m.nextLoserMatchId === loserMatch.id),
        ...loserMatches.filter((m: Match) => m.nextWinnerMatchId === loserMatch.id)
      ];
      
      if (feedingMatches.length === 0) return;
      
      // If all feeding matches are completed and still no participants, it's a ghost
      const allCompleted = feedingMatches.every((m: Match) => m.status === 'completed');
      
      if (allCompleted) {
        console.log(`  Ghost match detected (iteration ${iterations}): ${loserMatch.id}`);
        loserMatch.status = 'completed';
        changed = true;
      }
    });
  }
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
 * Link winner bracket to loser bracket correctly using the standard
 * double-elimination drop mapping that prevents early rematches.
 *
 * Rules (same as Challonge / smash.gg standard):
 *   WR1 → LR1 : pair-wise (M1+M2 → LR1 M1, M3+M4 → LR1 M2, …)
 *                slot 1 for even-indexed WR1 match, slot 2 for odd-indexed
 *   WR2 → LR2 : REVERSED positions to prevent rematches with LR1 survivors
 *                (W R2 M1 → LR2 last, W R2 Mlast → LR2 M1), slot 2
 *   WR3 → LR4 : direct positions, slot 2
 *   WRn → LR(2n-2) for n ≥ 2 : direct positions (reversal in R2 already
 *                provides the cross-bracket separation), slot 2
 */
function linkWinnerToLoserBracketCorrect(
  winnerMatches: Match[],
  loserMatches: Match[]
): void {
  if (loserMatches.length === 0) return;

  console.log('=== LINKING WINNER TO LOSER ===');

  // Group loser matches by round (sorted by matchNumber for determinism)
  const loserByRound: { [round: number]: Match[] } = {};
  loserMatches.forEach((m: Match) => {
    if (!loserByRound[m.roundNumber]) loserByRound[m.roundNumber] = [];
    loserByRound[m.roundNumber].push(m);
  });
  Object.values(loserByRound).forEach(arr =>
    arr.sort((a: Match, b: Match) => a.matchNumber - b.matchNumber)
  );

  console.log('Loser rounds:', Object.keys(loserByRound).map(Number));

  // ── Winner Round 1 → Loser Round 1 ──────────────────────────────────────
  // Every pair of WR1 matches (M1+M2, M3+M4 …) feeds one LR1 match.
  // The lower-indexed match loser goes to slot 1, the higher to slot 2
  // so the two people who will meet in WR2 are in DIFFERENT slots of LR1.
  const winnerRound1 = winnerMatches
    .filter((m: Match) => m.roundNumber === 1)
    .sort((a: Match, b: Match) => a.matchNumber - b.matchNumber);

  console.log(
    `Winner R1 (${winnerRound1.length} matches) → Loser R1 (${loserByRound[1]?.length || 0} matches)`
  );

  if (loserByRound[1]) {
    winnerRound1.forEach((match: Match, index: number) => {
      const lrIndex = Math.floor(index / 2);
      const lrMatch = loserByRound[1][lrIndex];
      if (lrMatch) {
        match.nextLoserMatchId = lrMatch.id;
        // Slot: first of the pair → slot 1, second → slot 2
        const slot = (index % 2 === 0) ? 1 : 2;
        console.log(`  W R1 M${index + 1} → L R1 M${lrIndex + 1} slot ${slot}`);
      }
    });
  }

  // ── Winner Round n → Loser Round (2n-2) for n ≥ 2 ─────────────────────
  const maxWinnerRound = Math.max(...winnerMatches.map((m: Match) => m.roundNumber));

  for (let winnerRound = 2; winnerRound <= maxWinnerRound; winnerRound++) {
    const loserRoundTarget = (winnerRound - 1) * 2;

    const wbMatches = winnerMatches
      .filter((m: Match) => m.roundNumber === winnerRound)
      .sort((a: Match, b: Match) => a.matchNumber - b.matchNumber);

    const lbTargets = loserByRound[loserRoundTarget];

    console.log(
      `Winner R${winnerRound} (${wbMatches.length} matches) → Loser R${loserRoundTarget} (${lbTargets?.length || 0} matches)`
    );

    if (!lbTargets) {
      console.log(`  WARNING: Loser R${loserRoundTarget} doesn't exist!`);
      continue;
    }

    wbMatches.forEach((match: Match, index: number) => {
      // For WR2, REVERSE the mapping: top WB matches drop to bottom LB slots
      // and vice-versa, ensuring they face survivors from the opposite LR1 group.
      // For WR3+, use direct mapping (the WR2 reversal already establishes the
      // correct cross-bracket separation; further reversals would undo it).
      const lbIndex = (winnerRound === 2)
        ? (lbTargets.length - 1 - index)
        : index;

      const lbMatch = lbTargets[lbIndex];
      if (lbMatch) {
        match.nextLoserMatchId = lbMatch.id;
        console.log(`  W R${winnerRound} M${index + 1} → L R${loserRoundTarget} M${lbIndex + 1} slot 2`);
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
