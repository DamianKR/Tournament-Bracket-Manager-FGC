/**
 * Notification model
 */

export type NotificationType =
  | 'duel_challenge'
  | 'duel_expiring'
  | 'league_week_start'
  | 'league_match_expiring'
  | 'matchmaking'; // Reserved for future matchmaking system

export interface AppNotification {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  readAt?: string;
  data?: Record<string, unknown> | null;
}
