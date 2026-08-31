/**
 * Notification Service (frontend)
 *
 * Reads and manages notifications from the server.
 */

import { AppNotification } from '@/models/notification';
import { SERVER_URL, isServerAvailable } from '@/services/api/apiClient';
import { getAuthHeader } from '@/services/auth/authService';

const API_BASE = `${SERVER_URL}/api/notifications`;

/**
 * Get all notifications for the current user.
 */
export async function getNotificationsAsync(): Promise<AppNotification[]> {
  if (!(await isServerAvailable())) return [];
  try {
    const res = await fetch(API_BASE, { headers: getAuthHeader() });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * Get unread notification count.
 */
export async function getUnreadCountAsync(): Promise<number> {
  if (!(await isServerAvailable())) return 0;
  try {
    const res = await fetch(`${API_BASE}/unread-count`, { headers: getAuthHeader() });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationReadAsync(id: string): Promise<void> {
  if (!(await isServerAvailable())) return;
  try {
    await fetch(`${API_BASE}/${id}/read`, {
      method: 'PUT',
      headers: getAuthHeader(),
    });
  } catch {
    // ignore
  }
}

/**
 * Mark all notifications as read.
 */
export async function markAllReadAsync(): Promise<void> {
  if (!(await isServerAvailable())) return;
  try {
    await fetch(`${API_BASE}/read-all`, {
      method: 'PUT',
      headers: getAuthHeader(),
    });
  } catch {
    // ignore
  }
}

/**
 * Delete a notification.
 */
export async function deleteNotificationAsync(id: string): Promise<void> {
  if (!(await isServerAvailable())) return;
  try {
    await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
  } catch {
    // ignore
  }
}
