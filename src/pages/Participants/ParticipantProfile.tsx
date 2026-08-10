import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GlobalParticipant, ComputedStats } from '@/models/types';
import {
  getParticipant,
  computeStats,
  updateParticipant,
} from '@/services/participants/participantService';
import { initials, avatarColor } from './ParticipantsPage';
import './ParticipantProfile.css';

type Tab = 'overview' | 'results' | 'edit';

const PLACEMENT_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function ParticipantProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [participant, setParticipant] = useState<GlobalParticipant | null>(null);
  const [stats, setStats] = useState<ComputedStats | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [notFound, setNotFound] = useState(false);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editAlias, setEditAlias] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!id) return;
    const p = getParticipant(id);
    if (!p) { setNotFound(true); return; }
    setParticipant(p);
    setStats(computeStats(p));
    setEditName(p.name);
    setEditAlias(p.alias ?? '');
  }, [id]);

  async function handleSave() {
    if (!participant) return;
    setSaving(true); setEditError('');
    try {
      const updated = await updateParticipant(participant.id, { name: editName, alias: editAlias });
      setParticipant(updated);
      setStats(computeStats(updated));
      setTab('overview');
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <div className="profile-page">
        <div className="container">
          <div className="empty-state card">
            <h3>Participant not found</h3>
            <button className="btn-outline mt-2" onClick={() => navigate('/participants')}>
              ← Back to roster
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!participant || !stats) {
    return <div className="profile-page"><div className="container profile-loading">Loading…</div></div>;
  }

  const color = avatarColor(participant.name);
  const bannerGradient = `linear-gradient(135deg, ${color}cc 0%, ${color}44 60%, transparent 100%)`;

  return (
    <div className="profile-page">

      {/* ── Banner + avatar ── */}
      <div className="profile-banner" style={{ background: bannerGradient }}>
        <div className="profile-banner-inner container">
          <button className="profile-back-btn" onClick={() => navigate('/participants')}>
            ← Roster
          </button>
          <div className="profile-identity">
            <div className="profile-avatar" style={{ background: color }}>
              {participant.avatarUrl
                ? <img src={participant.avatarUrl} alt={participant.name} />
                : initials(participant.name)}
            </div>
            <div className="profile-names">
              <h1 className="profile-name">{participant.name}</h1>
              {participant.alias && (
                <span className="profile-alias">{participant.alias}</span>
              )}
              <span className="profile-since">
                Member since {new Date(participant.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="profile-tabs-bar">
        <div className="container profile-tabs">
          {(['overview', 'results', 'edit'] as Tab[]).map((t) => (
            <button key={t} className={`profile-tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}>
              {t === 'overview' ? 'Overview' : t === 'results' ? `Results (${stats.placements.length})` : 'Edit'}
            </button>
          ))}
        </div>
      </div>

      <div className="container profile-content">

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <>
            {/* Big stat cards */}
            <div className="profile-stat-grid">
              <div className="profile-stat-card profile-stat-card--highlight">
                <span className="psc-value">{stats.wins}</span>
                <span className="psc-label">🏆 Tournament Wins</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.tournamentsPlayed}</span>
                <span className="psc-label">Tournaments Played</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.top3}</span>
                <span className="psc-label">Top 3 Finishes</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.winRate > 0 ? `${stats.winRate}%` : '—'}</span>
                <span className="psc-label">Match Win Rate</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.matchWins}</span>
                <span className="psc-label">Match Wins</span>
              </div>
              <div className="profile-stat-card">
                <span className="psc-value">{stats.matchLosses}</span>
                <span className="psc-label">Match Losses</span>
              </div>
            </div>

            {/* Win rate bar */}
            {(stats.matchWins + stats.matchLosses) > 0 && (
              <div className="card profile-winrate-card">
                <div className="profile-winrate-header">
                  <span>Match Record</span>
                  <span>{stats.matchWins}W – {stats.matchLosses}L</span>
                </div>
                <div className="profile-winrate-bar">
                  <div className="profile-winrate-fill" style={{ width: `${stats.winRate}%` }} />
                </div>
              </div>
            )}

            {/* Recent results preview */}
            {stats.placements.length > 0 && (
              <div className="card">
                <div className="profile-section-header">
                  <h3>Recent Results</h3>
                  <button className="btn-link" onClick={() => setTab('results')}>See all →</button>
                </div>
                <div className="profile-results-list">
                  {stats.placements.slice(0, 3).map((pl) => (
                    <div key={pl.tournamentId} className="profile-result-row"
                      onClick={() => navigate(`/tournament/${pl.tournamentId}`)}>
                      <span className="prr-medal">{PLACEMENT_MEDAL[pl.position] ?? '🎮'}</span>
                      <div className="prr-info">
                        <span className="prr-name">{pl.tournamentName}</span>
                        <span className="prr-meta text-secondary text-sm">
                          {pl.totalParticipants} players · {new Date(pl.date).toLocaleDateString()}
                        </span>
                      </div>
                      <span className={`prr-placement ${pl.position === 1 ? 'gold' : pl.position <= 3 ? 'podium' : ''}`}>
                        {ordinal(pl.position)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.placements.length === 0 && (
              <div className="card profile-no-results">
                <p className="text-secondary">No tournament results yet.</p>
                <p className="text-secondary text-sm">Add this player to a tournament to start tracking results.</p>
              </div>
            )}
          </>
        )}

        {/* ── Results tab ── */}
        {tab === 'results' && (
          <div className="card">
            <h3 className="mb-3">Tournament Results</h3>
            {stats.placements.length === 0 ? (
              <p className="text-secondary">No results yet.</p>
            ) : (
              <div className="profile-results-list">
                {stats.placements.map((pl) => (
                  <div key={pl.tournamentId} className="profile-result-row"
                    onClick={() => navigate(`/tournament/${pl.tournamentId}`)}>
                    <span className="prr-medal">{PLACEMENT_MEDAL[pl.position] ?? '🎮'}</span>
                    <div className="prr-info">
                      <span className="prr-name">{pl.tournamentName}</span>
                      <span className="prr-meta text-secondary text-sm">
                        {pl.totalParticipants} players · {new Date(pl.date).toLocaleDateString()}
                      </span>
                    </div>
                    <span className={`prr-placement ${pl.position === 1 ? 'gold' : pl.position <= 3 ? 'podium' : ''}`}>
                      {ordinal(pl.position)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Edit tab ── */}
        {tab === 'edit' && (
          <div className="card profile-edit-form">
            <h3>Edit Profile</h3>
            {editError && <div className="error-message">{editError}</div>}
            <div className="form-group">
              <label>Name *</label>
              <input type="text" value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="Player name" />
            </div>
            <div className="form-group">
              <label>Alias / Gamertag</label>
              <input type="text" value={editAlias}
                onChange={(e) => setEditAlias(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                placeholder="Optional short name" />
            </div>
            <div className="form-actions">
              <button className="btn-outline" onClick={() => setTab('overview')}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ParticipantProfile;
