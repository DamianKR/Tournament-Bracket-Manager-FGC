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
}

const CommunityContext = createContext<CommunityContextValue | null>(null);

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

  const value: CommunityContextValue = {
    currentCommunity,
    allCommunities,
    setCommunityId,
    refresh,
    getPath,
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
