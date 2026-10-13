/**
 * Community Service — Frontend
 *
 * Communicates with the Express API for community management.
 */

import type { Community, CommunityFeatures } from '@/models/community';
import { SERVER_URL } from '@/services/api/apiClient';
import { getAuthHeader, getCurrentUserKey } from '@/services/auth/authService';
import { mirrorGet } from '@/services/storage/mirrorStore';
import { readThrough } from '@/services/storage/readThrough';

const API_BASE = `${SERVER_URL}/api/communities`;
const COMMUNITIES_STORE = 'bracket_communities_cache';

/** Last mirrored community list for the current account (null if none yet). */
export function getCachedCommunities(): Community[] | null {
  return mirrorGet<Community[]>(COMMUNITIES_STORE, getCurrentUserKey())?.data ?? null;
}

/**
 * Fetches all communities the current user is allowed to see. The list
 * depends on the account, so the mirror is keyed per user ('anon' = visitor).
 * Offline it serves the last mirror; throws only when there is none.
 */
export async function getAllCommunities(): Promise<Community[]> {
  const r = await readThrough<Community[]>({
    path: '/api/communities',
    store: COMMUNITIES_STORE,
    key: getCurrentUserKey(),
    label: 'getAllCommunities',
    init: { headers: getAuthHeader() },
  });
  if ('data' in r) return r.data;
  throw new Error(`Failed to load communities: ${r.status}`);
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

/** Partial update — feature toggles, enabled games, general fields. */
export async function updateCommunityFields(
  id: string,
  fields: {
    name?: string;
    shortName?: string;
    description?: string;
    isPublic?: boolean;
    features?: CommunityFeatures;
    gameIds?: string[];
  }
): Promise<Community> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to update community: ${res.status}`);
  }
  return res.json() as Promise<Community>;
}
