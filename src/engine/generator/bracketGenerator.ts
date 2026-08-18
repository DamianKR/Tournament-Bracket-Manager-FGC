/**
 * Bracket Generator - Main entry point
 * 
 * This module provides a unified interface for generating tournament brackets
 * for both single and double elimination formats.
 */

import { Bracket, Participant, TournamentMode } from '@/models/types';
import { generateSingleEliminationBracket } from './singleEliminationEngine';
import { generateDoubleEliminationBracket } from './doubleEliminationEngine';

/**
 * Generate a bracket based on tournament mode
 */
export function generateBracket(
  participants: Participant[],
  mode: TournamentMode
): Bracket {
  switch (mode) {
    case 'single_elimination':
      return generateSingleEliminationBracket(participants);
    case 'double_elimination':
      return generateDoubleEliminationBracket(participants);
    default:
      throw new Error(`Unsupported tournament mode: ${mode}`);
  }
}

// Re-export individual engines for direct access if needed
export { generateSingleEliminationBracket } from './singleEliminationEngine';
export { generateDoubleEliminationBracket } from './doubleEliminationEngine';
