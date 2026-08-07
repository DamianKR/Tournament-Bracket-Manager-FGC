import { Participant } from '@/models/types';

/**
 * Assign seeds to participants in order
 */
export function assignSeeds(participants: Participant[]): Participant[] {
  return participants.map((p, index) => ({
    ...p,
    seed: index + 1,
  }));
}

/**
 * Randomize participant order
 */
export function randomizeParticipants(participants: Participant[]): Participant[] {
  const shuffled = [...participants];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return assignSeeds(shuffled);
}

/**
 * Standard tournament seeding (1 vs last, 2 vs second-to-last, etc.)
 * This creates a balanced bracket where top seeds meet later
 */
export function generateStandardSeeding(count: number): number[] {
  const seeds: number[] = [];
  const rounds = Math.ceil(Math.log2(count));
  const bracketSize = Math.pow(2, rounds);

  // Generate standard seeding pattern
  function generateRound(currentSeeds: number[]): number[] {
    const newSeeds: number[] = [];
    const max = currentSeeds.length * 2;
    
    for (const seed of currentSeeds) {
      newSeeds.push(seed);
      newSeeds.push(max + 1 - seed);
    }
    
    return newSeeds;
  }

  let currentSeeds = [1];
  for (let i = 0; i < rounds; i++) {
    currentSeeds = generateRound(currentSeeds);
  }

  return currentSeeds.slice(0, bracketSize);
}

/**
 * Apply seeding pattern to participants
 */
export function applySeedingPattern(
  participants: Participant[],
  pattern: number[]
): (Participant | null)[] {
  const seeded: (Participant | null)[] = [];
  
  for (const seed of pattern) {
    const participant = participants.find(p => p.seed === seed);
    seeded.push(participant || null); // null represents a BYE
  }
  
  return seeded;
}
