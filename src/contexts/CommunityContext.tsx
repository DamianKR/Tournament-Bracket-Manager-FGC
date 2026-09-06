/**
 * CommunityContext
 *
 * Provides the current community and the full list of communities.
 * - On mount, loads all communities.
 * - Defaults to the logged-in user's communityId.
 * - Superadmins can switch the active community via setCommunityId.
 */

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { Community } from '@/models/community';
import { DEFAULT_COMMUNITY_ID } from '@/constants/community';
import { useAuth } from '@/contexts/AuthContext';
import { getAllCommunities } from '@/services/communities/communityService';

interface CommunityContextValue {
  currentCommunity: Community | null;
  allCommunities: Community[];
  setCommunityId: (id: string) => void;
  refresh: () => Promise<void>;
  getPath: (path: string) => string;
  /**
   * true if the logged-in user belongs to the community currently being viewed,
   * OR if the user is a superadmin (global access).
   * Use this to gate any write/action UI (buttons, forms, etc.).
   */
  isInMyCommunity: boolean;
  /**
   * participantId del user EN la comunidad activa (multi-comunidad: cada
   * comunidad tiene un participant distinto). null si no es miembro.
   */
  myParticipantId: string | null;
  /**
   * true if the user is an admin-level role AND is in their own community.
   * Shorthand for: isAdmin && isInMyCommunity.
   */
  canAdminCurrentCommunity: boolean;
  /**
   * true if the user can administrate a specific game in the current community.
   * - superadmin/community_admin → siempre.
   * - admin sin gameAdminFor → todos los juegos.
   * - admin con gameAdminFor → solo los juegos listados.
   */
  canAdminGame: (gameId: string | null | undefined) => boolean;
}

const CommunityContext = createContext<CommunityContextValue | null>(null);

const ALL_ADMIN_ROLES = ['superadmin', 'community_admin', 'admin'] as const;

export function CommunityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [allCommunities, setAllCommunities] = useState<Community[]>([]);
  const [currentCommunity, setCurrentCommunity] = useState<Community | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getAllCommunities();
      setAllCommunities(data);

      const defaultId = user?.communityId || DEFAULT_COMMUNITY_ID;
      const match = data.find((c) => c.id === defaultId) || data[0] || null;
      setCurrentCommunity(match);
    } catch (err) {
      console.error('[CommunityContext] Failed to load communities:', err);
      setAllCommunities([]);
      setCurrentCommunity(null);
    }
  }, [user]);

  const setCommunityId = useCallback((id: string) => {
    const match = allCommunities.find((c) => c.id === id);
    if (match) {
      setCurrentCommunity(match);
    }
  }, [allCommunities]);

  const getPath = useCallback((path: string) => {
    if (!currentCommunity) return '/communities';
    return `/c/${currentCommunity.id}/${path.replace(/^\/+/, '')}`;
  }, [currentCommunity]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A user "owns" the current community if they are superadmin OR their communityId matches
  // OR the community is in their membership list (multi-community).
  const isInMyCommunity =
    user?.role === 'superadmin' ||
    (user != null && (
      user.communityId === currentCommunity?.id ||
      (user.communityIds?.includes(currentCommunity?.id ?? '') ?? false)
    ));

  const canAdminCurrentCommunity =
    isInMyCommunity &&
    user != null &&
    (ALL_ADMIN_ROLES as readonly string[]).includes(user.role);

  const canAdminGame = useCallback((gameId: string | null | undefined): boolean => {
    if (!canAdminCurrentCommunity || !user) return false;
    if (user.role === 'superadmin' || user.role === 'community_admin') return true;
    if (user.role === 'admin') {
      if (!user.gameAdminFor || user.gameAdminFor.length === 0) return true;
      return gameId != null && user.gameAdminFor.includes(gameId);
    }
    return false;
  }, [canAdminCurrentCommunity, user]);

  // Participant del user en la comunidad activa: hogar o membresía.
  const myParticipantId = currentCommunity
    ? (user?.participantByCommunity?.[currentCommunity.id] ??
       (user?.communityId === currentCommunity.id ? user.participantId : null))
    : (user?.participantId ?? null);

  const value: CommunityContextValue = {
    currentCommunity,
    allCommunities,
    setCommunityId,
    refresh,
    getPath,
    isInMyCommunity,
    myParticipantId,
    canAdminCurrentCommunity,
    canAdminGame,
  };

  return (
    <CommunityContext.Provider value={value}>
      {children}
    </CommunityContext.Provider>
  );
}

/** Hook para acceder al contexto de comunidad. */
export function useCommunity(): CommunityContextValue {
  const ctx = useContext(CommunityContext);
  if (!ctx) throw new Error('useCommunity must be used within CommunityProvider');
  return ctx;
}
