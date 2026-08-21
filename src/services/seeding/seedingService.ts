import { Participant, GlobalParticipant, SeedingMode, PartialSeedCount } from '@/models/types';
import { getAllParticipants } from '@/services/participants/participantService';
import { loadTournaments } from '@/services/storage/localStorage';

/**
 * Calculate win rate for a global participant across all tournaments
 */
function calculateWinRate(participant: GlobalParticipant): number {
  const tournaments = loadTournaments().filter(t => 
    participant.tournamentIds.includes(t.id) && t.status === 'completed'
  );

  if (tournaments.length === 0) return 0;

  let totalMatches = 0;
  let wins = 0;

  for (const tournament of tournaments) {
    const tp = tournament.participants.find(p => p.globalParticipantId === participant.id);
    if (!tp) continue;

    // Estimate matches from final position in single/double elimination
    // This is approximate; ideally we'd track match history
    const participantCount = tournament.participants.length;
    if (tp.finalPosition === 1) {
      // Champion played log2(n) matches in single elim, more in double
      const rounds = Math.ceil(Math.log2(participantCount));
      totalMatches += rounds;
      wins += rounds;
    } else if (tp.finalPosition && tp.finalPosition <= participantCount) {
      // Rough estimate: higher placement = more wins
      const rounds = Math.ceil(Math.log2(participantCount));
      const estimatedWins = Math.max(0, rounds - Math.ceil(Math.log2(tp.finalPosition)));
      wins += estimatedWins;
      totalMatches += estimatedWins + 1; // +1 for the loss
    }
  }

  return totalMatches > 0 ? wins / totalMatches : 0;
}

/**
 * Rank participants by ELO points (primary) and win rate (tiebreaker)
 */
export function rankParticipants(participants: Participant[]): Participant[] {
  const allGlobal = getAllParticipants();
  
  const ranked = participants.map(p => {
    const global = p.globalParticipantId 
      ? allGlobal.find(g => g.id === p.globalParticipantId)
      : null;
    
    return {
      participant: p,
      elo: global?.eloPoints ?? 1500,
      winRate: global ? calculateWinRate(global) : 0,
      name: p.name.toLowerCase(),
    };
  });

  ranked.sort((a, b) => {
    // Primary: ELO descending
    if (a.elo !== b.elo) return b.elo - a.elo;
    // Tiebreaker 1: Win rate descending
    if (a.winRate !== b.winRate) return b.winRate - a.winRate;
    // Tiebreaker 2: Alphabetical
    return a.name.localeCompare(b.name);
  });

  return ranked.map(r => r.participant);
}

/**
 * Apply seeding to participants based on mode
 */
export function applySeed(
  participants: Participant[],
  mode: SeedingMode,
  partialCount?: PartialSeedCount
): Participant[] {
  if (mode === 'none') {
    // Keep current order, just assign sequential seeds
    return participants.map((p, i) => ({ ...p, seed: i + 1 }));
  }

  const ranked = rankParticipants(participants);

  if (mode === 'full') {
    // All participants ranked
    return ranked.map((p, i) => ({ ...p, seed: i + 1 }));
  }

  if (mode === 'partial' && partialCount) {
    // Top N seeded, rest randomized
    const topSeeds = ranked.slice(0, partialCount);
    const rest = ranked.slice(partialCount);
    
    // Shuffle the rest
    const shuffled = [...rest];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Assign seeds: top seeds get 1-N, rest get sequential after
    const result: Participant[] = [];
    topSeeds.forEach((p, i) => result.push({ ...p, seed: i + 1 }));
    shuffled.forEach((p, i) => result.push({ ...p, seed: partialCount + i + 1 }));
    
    return result;
  }

  // Fallback: no seeding
  return participants.map((p, i) => ({ ...p, seed: i + 1 }));
}

/**
 * Standard bracket seeding algorithm (recursive interleaving).
 * Generates the classic tournament bracket order: [1,8,5,4,3,6,7,2] for 8 players.
 */
function generateStandardBracketOrder(bracketSize: number): number[] {
  if (bracketSize === 1) return [1];
  if (bracketSize === 2) return [1, 2];

  const half = bracketSize / 2;
  const prevOrder = generateStandardBracketOrder(half);

  const result: number[] = [];
  for (const seed of prevOrder) {
    result.push(seed);
    result.push(bracketSize + 1 - seed);
  }

  return result;
}

/**
 * Apply standard bracket seeding with automatic bye distribution.
 * 
 * Algorithm:
 * 1. Participants already have seeds assigned (1, 2, 3... N)
 * 2. Generate standard bracket order for bracket size (power of 2)
 * 3. Map participants to bracket positions
 * 4. Top seeds automatically receive byes (positions where opponent doesn't exist)
 * 
 * Examples:
 * - 8 players, bracket 8: [1,8,5,4,3,6,7,2] - no byes
 * - 11 players, bracket 16: top 5 seeds get byes
 * - 7 players, top 4 seeded: seeds 1-4 placed strategically, 5-7 fill remaining
 * 
 * @param participants - Participants with seeds already assigned
 * @param topSeedCount - For partial seeding: how many top seeds to place strategically
 */
export function applyBracketSeeding(
  participants: Participant[]
): (Participant | null)[] {
  const n = participants.length;
  if (n < 2) return participants;

  // Sort by seed
  const sorted = [...participants].sort((a, b) => a.seed - b.seed);
  
  // Bracket size is next power of 2
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
  
  // Generate standard bracket order
  const bracketOrder = generateStandardBracketOrder(bracketSize);
  
  // Map participants by seed number
  const participantMap = new Map<number, Participant>();
  sorted.forEach(p => participantMap.set(p.seed, p));
  
  // Build bracket slots by mapping bracket order to participants
  const slots: (Participant | null)[] = [];
  
  for (const seedNum of bracketOrder) {
    const participant = participantMap.get(seedNum);
    slots.push(participant || null);
  }
  
  return slots;
}
