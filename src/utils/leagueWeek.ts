import type { League } from '@/models/league';

export function getEffectiveCurrentWeek(league: League): number {
  const start = new Date(league.startDate);
  const now = new Date();
  const diffDays = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 0;
  return Math.floor(diffDays / league.periodDays) + 1;
}
