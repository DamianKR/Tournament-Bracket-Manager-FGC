/**
 * League Scheduler - Round-Robin Calendar Generator
 * 
 * Generates a balanced round-robin schedule using the circle method.
 * Distributes matches evenly across weeks based on matchesPerPlayerPerPeriod.
 */

/**
 * Generate round-robin pairings using circle method
 * @param {string[]} participantIds - Array of participant IDs
 * @param {number} rounds - How many times each pair plays (1, 2, or 3)
 * @returns {Array<{round: number, pairings: Array<[string, string]>}>}
 */
export function generateRoundRobinPairings(participantIds, rounds = 1) {
  const n = participantIds.length;
  if (n < 2) return [];
  
  // For odd number of participants, add a "BYE"
  const players = [...participantIds];
  const hasBye = n % 2 === 1;
  if (hasBye) players.push(null);
  
  const totalPlayers = players.length;
  const matchesPerRound = totalPlayers / 2;
  const totalRounds = totalPlayers - 1;
  
  const allPairings = [];
  
  for (let r = 0; r < rounds; r++) {
    for (let round = 0; round < totalRounds; round++) {
      const pairings = [];
      
      for (let match = 0; match < matchesPerRound; match++) {
        let home, away;
        
        if (match === 0) {
          // First player stays fixed
          home = players[0];
          away = players[totalPlayers - 1 - round];
        } else {
          const idx1 = match;
          const idx2 = totalPlayers - 1 - match;
          
          home = players[(idx1 - round + totalPlayers - 1) % (totalPlayers - 1) + 1];
          away = players[(idx2 - round + totalPlayers - 1) % (totalPlayers - 1) + 1];
        }
        
        // Skip BYE matches
        if (home !== null && away !== null) {
          pairings.push([home, away]);
        }
      }
      
      allPairings.push({
        round: r * totalRounds + round + 1,
        pairings,
      });
    }
  }
  
  return allPairings;
}

/**
 * Distribute rounds into weeks based on matches per player per period
 * @param {Array} roundPairings - Output from generateRoundRobinPairings
 * @param {number} matchesPerPlayerPerPeriod - Max matches per player per week
 * @param {number} participantCount - Total number of participants
 * @returns {Array<{week: number, rounds: number[]}>}
 */
export function distributeIntoWeeks(roundPairings, matchesPerPlayerPerPeriod, participantCount) {
  const weeks = [];
  let currentWeek = 1;
  let currentWeekRounds = [];
  const playerMatchCount = new Map();
  
  for (const { round, pairings } of roundPairings) {
    // Check if adding this round would exceed any player's limit
    const tempCounts = new Map(playerMatchCount);
    let canAdd = true;
    
    for (const [p1, p2] of pairings) {
      tempCounts.set(p1, (tempCounts.get(p1) || 0) + 1);
      tempCounts.set(p2, (tempCounts.get(p2) || 0) + 1);
      
      if (tempCounts.get(p1) > matchesPerPlayerPerPeriod || 
          tempCounts.get(p2) > matchesPerPlayerPerPeriod) {
        canAdd = false;
        break;
      }
    }
    
    if (canAdd) {
      // Add to current week
      currentWeekRounds.push(round);
      for (const [p1, p2] of pairings) {
        playerMatchCount.set(p1, (playerMatchCount.get(p1) || 0) + 1);
        playerMatchCount.set(p2, (playerMatchCount.get(p2) || 0) + 1);
      }
    } else {
      // Start new week
      if (currentWeekRounds.length > 0) {
        weeks.push({ week: currentWeek, rounds: currentWeekRounds });
        currentWeek++;
      }
      currentWeekRounds = [round];
      playerMatchCount.clear();
      for (const [p1, p2] of pairings) {
        playerMatchCount.set(p1, 1);
        playerMatchCount.set(p2, 1);
      }
    }
  }
  
  // Add last week
  if (currentWeekRounds.length > 0) {
    weeks.push({ week: currentWeek, rounds: currentWeekRounds });
  }
  
  return weeks;
}

/**
 * Calculate estimated league duration
 * @param {number} participantCount
 * @param {number} roundsPerOpponent
 * @param {number} matchesPerPlayerPerPeriod
 * @param {number} periodDays - 7 or 14
 * @returns {{weeks: number, days: number, endDate: string}}
 */
export function estimateLeagueDuration(participantCount, roundsPerOpponent, matchesPerPlayerPerPeriod, periodDays, startDate) {
  const n = participantCount;
  const totalMatches = (n * (n - 1) / 2) * roundsPerOpponent;
  const matchesPerPlayer = (n - 1) * roundsPerOpponent;
  
  // Estimate weeks needed
  const periodsNeeded = Math.ceil(matchesPerPlayer / matchesPerPlayerPerPeriod);
  const daysNeeded = periodsNeeded * periodDays;
  const weeksNeeded = Math.ceil(daysNeeded / 7);
  
  // Calculate end date
  const start = new Date(startDate);
  const end = new Date(start.getTime() + daysNeeded * 24 * 60 * 60 * 1000);
  
  return {
    weeks: weeksNeeded,
    days: daysNeeded,
    endDate: end.toISOString().split('T')[0],
    totalMatches,
    matchesPerPlayer,
  };
}
