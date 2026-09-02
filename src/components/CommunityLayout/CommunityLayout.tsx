import { useParams, Outlet } from 'react-router-dom';
import { useCommunity } from '@/contexts/CommunityContext';
import { useEffect } from 'react';

export default function CommunityLayout() {
  const { communityId } = useParams();
  const { setCommunityId, allCommunities } = useCommunity();

  useEffect(() => {
    if (communityId) {
      setCommunityId(communityId);
    }
  }, [communityId, allCommunities, setCommunityId]);

  return <Outlet />;
}
