/**
 * Community scope helpers
 *
 * All list routes should filter by an explicit `communityId` query param when
 * the request comes from a community-scoped page. Superadmins can view every
 * community, but they still receive the same filtered dataset as regular users
 * when a community is requested, so the UI never mixes data from two
 * communities.
 */

const DEFAULT_COMMUNITY_ID = 'community_fgc_santa_clara';

export function getTargetCommunityId(user, requestedCommunityId) {
  if (user?.role === 'superadmin') {
    return requestedCommunityId || DEFAULT_COMMUNITY_ID;
  }
  return requestedCommunityId || user?.communityId || DEFAULT_COMMUNITY_ID;
}

export function isInUserScope(user, communityId) {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  return communityId === (user.communityId || DEFAULT_COMMUNITY_ID);
}

export function filterByCommunity(user, items, requestedCommunityId) {
  // Explicit community filter wins for everyone (superadmin included).
  const target = requestedCommunityId || (user?.role === 'superadmin' ? null : user?.communityId) || null;
  if (target) {
    return items.filter(item => !item.communityId || item.communityId === target);
  }

  // No explicit target and no user: keep legacy/default records only.
  if (!user) {
    return items.filter(item => !item.communityId || item.communityId === DEFAULT_COMMUNITY_ID);
  }

  // Superadmin with no target sees all communities (admin panels).
  return items;
}
