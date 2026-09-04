import type { RankTier } from '@/models/types';

export const RANK_TIERS: RankTier[] = [
  { name: 'Bronce', minPoints: 0, maxPoints: 1199, color: '#8b5a2b' },
  { name: 'Plata', minPoints: 1200, maxPoints: 1299, color: '#94a3b8' },
  { name: 'Oro', minPoints: 1300, maxPoints: 1399, color: '#f59e0b' },
  { name: 'Platino', minPoints: 1400, maxPoints: 1499, color: '#06b6d4' },
  { name: 'Diamante', minPoints: 1500, maxPoints: 1599, color: '#2563eb' },
  { name: 'Vanquisher', minPoints: 1600, maxPoints: 1699, color: '#a855f7' },
  { name: 'Master', minPoints: 1700, maxPoints: 1849, color: '#ec4899' },
  { name: 'Ultimate', minPoints: 1850, maxPoints: null, color: '#971c0e' },
  // Legend is positional (top 5) — handled at query time
];

export function getRankName(points: number | null | undefined): string {
  if (points == null) return 'Sin puntos';
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (points >= RANK_TIERS[i].minPoints) return RANK_TIERS[i].name;
  }
  return 'Plata';
}

export function getRankColor(rankName: string): string {
  if (rankName === 'Legend') return '#10b981';
  const tier = RANK_TIERS.find((t) => t.name === rankName);
  return tier ? tier.color : '#94a3b8';
}

export function getRankIcon(rankName: string): string {
  const icons: Record<string, string> = {
    Bronce: 'fas fa-medal',
    Plata: 'fas fa-medal',
    Oro: 'fas fa-medal',
    Platino: 'fas fa-gem',
    Diamante: 'fas fa-gem',
    Vanquisher: 'fas fa-shield-alt',
    Master: 'fas fa-crown',
    Ultimate: 'fas fa-fire',
    Legend: 'fas fa-dragon',
  };
  return icons[rankName] ?? 'fas fa-gamepad';
}
