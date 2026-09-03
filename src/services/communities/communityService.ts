/**
 * Community Service — Frontend
 *
 * Communicates with the Express API for community management.
 */

import type { Community } from '@/models/community';
import { SERVER_URL } from '@/services/api/apiClient';
import { getAuthHeader } from '@/services/auth/authService';

const API_BASE = `${SERVER_URL}/api/communities`;

/** Fetches all communities the current user is allowed to see. */
export async function getAllCommunities(): Promise<Community[]> {
  const res = await fetch(API_BASE, { headers: getAuthHeader() });
  if (!res.ok) throw new Error(`Failed to load communities: ${res.status}`);
  return res.json() as Promise<Community[]>;
}

/** Fetches a single community by id. */
export async function getCommunity(id: string): Promise<Community> {
  const res = await fetch(`${API_BASE}/${id}`, { headers: getAuthHeader() });
  if (!res.ok) throw new Error(`Failed to load community: ${res.status}`);
  return res.json() as Promise<Community>;
}

/** Creates a new community. Requires superadmin. */
export async function createCommunity(
  name: string,
  shortName: string,
  description?: string,
  isPublic = true
): Promise<Community> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ name, shortName, description, isPublic }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to create community: ${res.status}`);
  }
  return res.json() as Promise<Community>;
}

/** Updates an existing community. Requires superadmin or community owner. */
export async function updateCommunity(
  id: string,
  name: string,
  shortName: string,
  description?: string,
  isPublic?: boolean
): Promise<Community> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ name, shortName, description, isPublic }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to update community: ${res.status}`);
  }
  return res.json() as Promise<Community>;
}
