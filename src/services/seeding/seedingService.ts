import { Participant, GlobalParticipant, SeedingMode, PartialSeedCount } from '@/models/types';
import { getAllParticipants } from '@/services/participants/participantService';
import { loadTournaments } from '@/services/storage/localStorage';
import { getEffectiveElo } from '@/utils/participantGames';
import { generateStandardSeeding } from '@/engine/seeding/seeding';

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
 * Rank participants by ELO points (game-specific, falling back to primary) and win rate (tiebreaker)
 */
export function rankParticipants(participants: Participant[], gameId?: string | null): Participant[] {
  const allGlobal = getAllParticipants();

  const ranked = participants.map(p => {
    const global = p.globalParticipantId
      ? allGlobal.find(g => g.id === p.globalParticipantId)
      : null;

    return {
      participant: p,
      elo: global ? getEffectiveElo(global, gameId) : 1500,
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
  partialCount?: PartialSeedCount,
  gameId?: string | null
): Participant[] {
  if (mode === 'none') {
    // Keep current order, just assign sequential seeds
    return participants.map((p, i) => ({ ...p, seed: i + 1 }));
  }

  const ranked = rankParticipants(participants, gameId);

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
 * Aplica el orden estándar de bracket con distribución automática de byes.
 *
 * Algoritmo:
 * 1. Los participantes ya tienen seeds asignados (1, 2, 3... N)
 * 2. Se genera el orden estándar de bracket para el tamaño de bracket (potencia de 2)
 *    usando generateStandardSeeding del engine (matemática pura, sin dependencias de datos)
 * 3. Los participantes se mapean a las posiciones del bracket
 * 4. Los top seeds reciben byes automáticamente (posiciones sin oponente)
 *
 * Ejemplos:
 * - 8 jugadores, bracket 8: [1,8,4,5,2,7,3,6] — sin byes
 * - 11 jugadores, bracket 16: los top 5 seeds obtienen byes
 *
 * @param participants - Participantes con seeds ya asignados
 */
export function applyBracketSeeding(
  participants: Participant[]
): (Participant | null)[] {
  const n = participants.length;
  if (n < 2) return participants;

  // Ordenar por seed
  const sorted = [...participants].sort((a, b) => a.seed - b.seed);

  // Bracket size = siguiente potencia de 2
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));

  // Obtener orden estándar del engine (evita duplicar la lógica matemática)
  const bracketOrder = generateStandardSeeding(bracketSize);

  // Mapear participantes por número de seed (O(1) lookup)
  const participantMap = new Map<number, Participant>();
  sorted.forEach(p => participantMap.set(p.seed, p));

  // Construir slots del bracket
  return bracketOrder.map(seedNum => participantMap.get(seedNum) ?? null);
}
