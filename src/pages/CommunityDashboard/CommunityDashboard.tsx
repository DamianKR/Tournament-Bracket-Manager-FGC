import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useCommunity } from '@/contexts/CommunityContext';
import { getCommunity } from '@/services/communities/communityService';
import type { Community } from '@/models/community';
import './CommunityDashboard.css';

export default function CommunityDashboard() {
  const { communityId } = useParams<{ communityId: string }>();
  const { allCommunities, setCommunityId } = useCommunity();
  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!communityId) return;
    setCommunityId(communityId);

    const fromList = allCommunities.find((c) => c.id === communityId);
    if (fromList) {
      setCommunity(fromList);
      setLoading(false);
    } else if (allCommunities.length > 0) {
      setCommunity(null);
      setLoading(false);
    } else {
      getCommunity(communityId)
        .then((c) => setCommunity(c))
        .catch(() => setCommunity(null))
        .finally(() => setLoading(false));
    }
  }, [communityId, allCommunities, setCommunityId]);

  if (loading) return <div className="community-dashboard">Loading...</div>;
  if (!community) return <div className="community-dashboard not-found">Community not found</div>;

  const displayName = community.name;

  return (
    <div className="community-dashboard">
      <section className="community-hero">
        <div className="container">
          <h1 className="community-title">{displayName}</h1>
          <p className="community-subtitle">Community home</p>
        </div>
      </section>

      <section className="community-section">
        <div className="container">
          <h2 className="community-section-title">Sections</h2>
          <div className="community-cards">
            <Link to="events" className="community-card card">
              <i className="fas fa-trophy" />
              <h3>Torneos</h3>
              <p>Tournaments and brackets.</p>
            </Link>
            <Link to="events?tab=leagues" className="community-card card">
              <i className="fas fa-calendar-alt" />
              <h3>Ligas</h3>
              <p>Weekly round-robin seasons.</p>
            </Link>
            <Link to="events?tab=ranked" className="community-card card">
              <i className="fas fa-khanda" />
              <h3>Duelos</h3>
              <p>Ranked challenges.</p>
            </Link>
            <Link to="ranking" className="community-card card">
              <i className="fas fa-list-ol" />
              <h3>Ranking</h3>
              <p>Community leaderboard.</p>
            </Link>
            <Link to="participants" className="community-card card">
              <i className="fas fa-users" />
              <h3>Participantes</h3>
              <p>Players and profiles.</p>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
