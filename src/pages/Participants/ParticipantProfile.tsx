import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GlobalParticipant, ComputedStats, LeagueResultEntry } from '@/models/types';
import {
  getParticipant,
  computeStats,
  updateParticipant,
  getParticipantLeagueStats,
  type LeagueStatsSummary,
} from '@/services/participants/participantService';
import { loadTournamentsForParticipantAsync } from '@/services/storage/localStorage';
import { initials, avatarColor } from './ParticipantsPage';
import CharacterSelect from '@/components/CharacterSelect/CharacterSelect';
import { getCharacter, getGame } from '@/data/games';
import { getCharacterImageUrl } from '@/utils/characterImage';
import { getLeaderboard, getRankColor, getRankIcon, type LeaderboardEntry } from '@/services/ranking/rankingService';
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
  const [leagueStats, setLeagueStats] = useState<LeagueStatsSummary | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [resultsSubTab, setResultsSubTab] = useState<'tournaments' | 'leagues'>('tournaments');
  const [notFound, setNotFound] = useState(false);
  const [rankEntry, setRankEntry] = useState<LeaderboardEntry | null>(null);

  const completedLeagues = leagueStats?.leagues.filter((l) => l.status === 'completed') ?? [];
  const leagueFirstPlaces = completedLeagues.filter((l) => l.rank === 1).length;
  const leagueTop5 = completedLeagues.filter((l) => l.rank <= 5).length;
  const leaguesWithMatches = leagueStats?.leagues.filter((l) => l.matchesPlayed > 0).length ?? 0;

  // Edit state
  const [editName, setEditName] = useState('');
  const [editAlias, setEditAlias] = useState('');
  const [editGameId, setEditGameId] = useState<string | null>(null);
  const [editCharacterId, setEditCharacterId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [tournaments, ls] = await Promise.all([
          loadTournamentsForParticipantAsync(id),
          getParticipantLeagueStats(id),
        ]);
        const p = getParticipant(id);
        if (!p) { setNotFound(true); return; }
        setParticipant(p);
        setStats(computeStats(p, tournaments));
        setLeagueStats(ls);
        setEditName(p.name);
        setEditAlias(p.alias ?? '');
        setEditGameId(p.gameId ?? null);
        setEditCharacterId(p.mainCharacterId ?? null);
      } catch {
        const p = getParticipant(id);
        if (!p) { setNotFound(true); return; }
        setParticipant(p);
        setStats(computeStats(p));
        setLeagueStats({ leagues: [], totalMatches: 0, totalWins: 0, totalLosses: 0, winRate: 0 });
      }

      // Load ELO ranking entry (fire-and-forget — graceful if server is down)
      getLeaderboard().then((board) => {
        const entry = board.find((e) => e.id === id) ?? null;
        setRankEntry(entry);
      }).catch(() => {});
    })();
  }, [id]);

  async function handleSave() {
    if (!participant) return;
    setSaving(true); setEditError('');
    try {
      const updated = await updateParticipant(participant.id, {
        name: editName,
        alias: editAlias,
        gameId: editGameId,
        mainCharacterId: editCharacterId,
      });
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
  const bannerBg = `radial-gradient(ellipse at 15% 0%, color-mix(in srgb, ${color} 38%, transparent) 0%, transparent 55%),
                    linear-gradient(135deg, var(--primary-void) 0%, var(--primary-night) 45%, var(--primary-void) 100%)`;
  const characterImg = getCharacterImageUrl(participant.gameId, participant.mainCharacterId);

  return (
    <div className="profile-page">

      {/* ── Banner + avatar ── */}
      <div className="profile-banner" style={{ background: bannerBg, '--avatar-color': color } as React.CSSProperties}>
        <div className="profile-banner-inner container">
          <button className="profile-back-btn" onClick={() => navigate('/participants')}>
            ← Roster
          </button>
          <div className="profile-banner-body">
            <div className="profile-identity">
              <div
                className="profile-avatar"
                style={{ background: color, '--avatar-color': color } as React.CSSProperties}
              >
                {participant.avatarUrl
                  ? <img src={participant.avatarUrl} alt={participant.name} />
                  : initials(participant.name)}
              </div>
              <div className="profile-names">
                <h1 className="profile-name">{participant.name}</h1>
                {participant.alias && (
                  <span className="profile-alias">{participant.alias}</span>
                )}
                {participant.gameId && participant.mainCharacterId && (
                  <span className="profile-character">
                    <span className="profile-character-game">
                      {getGame(participant.gameId)?.shortName}
                    </span>
                    <span className="profile-character-name">
                      {getCharacter(participant.gameId, participant.mainCharacterId)?.name}
                    </span>
                  </span>
                )}
                <span className="profile-since">
                  Member since {new Date(participant.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>

            {/* ELO Rank widget — right side of banner */}
            {(() => {
              const pts   = rankEntry?.eloPoints ?? participant.eloPoints ?? 1500;
              const rank  = rankEntry?.displayRank ?? participant.eloRank ?? 'Diamante';
              const pos   = rankEntry?.position;
              const col   = getRankColor(rank);
              const icon  = getRankIcon(rank);
              return (
                <div
                  className="profile-elo-widget"
                  style={{ '--elo-color': col } as React.CSSProperties}
                  onClick={() => navigate('/ranking')}
                  title="View full ranking"
                >
                  {/* Glow layer */}
                  <div className="pew-glow" />

                  {/* Top: label */}
                  <div className="pew-label">ELO RANKING</div>

                  {/* Center: icon + rank name */}
                  <div className="pew-center">
                    <span className={`pew-icon ${rank === 'Legend' ? 'pew-icon--legend' : ''}`}>
                      <i className={rank === 'Legend' ? 'fas fa-dragon' : icon} />
                    </span>
                    <span className="pew-rank">{rank}</span>
                  </div>

                  {/* Divider */}
                  <div className="pew-divider" />

                  {/* Bottom row: pts left, position right */}
                  <div className="pew-bottom">
                    <div className="pew-pts-block">
                      <span className="pew-pts-value">{pts.toLocaleString()}</span>
                      <span className="pew-pts-label">points</span>
                    </div>
                    {pos !== undefined && (
                      <div className="pew-pos-block">
                        <span className="pew-pos-value">#{pos}</span>
                        <span className="pew-pos-label">ranking</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>{/* profile-banner-body */}
        </div>
        {characterImg && (
          <div className="profile-character-render" aria-hidden="true">
            <img
              src={characterImg}
              alt={getCharacter(participant.gameId ?? '', participant.mainCharacterId ?? '')?.name ?? 'main'}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="profile-tabs-bar">
        <div className="container profile-tabs">
          {(['overview', 'results', 'edit'] as Tab[]).map((t) => (
            <button key={t} className={`profile-tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}>
              {t === 'overview' ? 'Overview' : t === 'results' ? `Results (${stats.placements.length + (leagueStats?.leagues.length ?? 0)})` : 'Edit'}
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
                <span className="psc-label"><i className="fas fa-trophy" /> Tournament Wins</span>
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

            {/* Tournament Match Record */}
            {(stats.matchWins + stats.matchLosses) > 0 && (
              <div className="card profile-winrate-card">
                <div className="profile-winrate-header">
                  <span><i className="fas fa-trophy" /> Tournament Match Record</span>
                  <span>{stats.matchWins}W – {stats.matchLosses}L</span>
                </div>
                <div className="profile-winrate-bar">
                  <div className="profile-winrate-fill" style={{ width: `${stats.winRate}%` }} />
                </div>
              </div>
            )}

            {/* League Stats */}
            {leagueStats && (
              <div className="profile-stat-grid">
                <div className="profile-stat-card profile-stat-card--highlight">
                  <span className="psc-value">{leagueFirstPlaces}</span>
                  <span className="psc-label"><i className="fas fa-trophy" /> League Wins</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leaguesWithMatches}</span>
                  <span className="psc-label">Leagues Played</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leagueTop5}</span>
                  <span className="psc-label">Top 5 in Leagues</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leagueStats.winRate > 0 ? `${leagueStats.winRate}%` : '—'}</span>
                  <span className="psc-label">League Match Win Rate</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leagueStats.totalWins}</span>
                  <span className="psc-label">League Match Wins</span>
                </div>
                <div className="profile-stat-card">
                  <span className="psc-value">{leagueStats.totalLosses}</span>
                  <span className="psc-label">League Match Losses</span>
                </div>
              </div>
            )}

            {/* League Match Record */}
            {leagueStats && (
              <div className="card profile-winrate-card profile-winrate-card--league">
                <div className="profile-winrate-header">
                  <span><i className="fas fa-trophy" /> League Match Record</span>
                  <span>{leagueStats.totalWins}W – {leagueStats.totalLosses}L</span>
                </div>
                <div className="profile-winrate-bar">
                  <div className="profile-winrate-fill" style={{ width: `${leagueStats.winRate}%` }} />
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Results tab ── */}
        {tab === 'results' && (
          <div className="card results-tab">
            <div className="results-subtabs">
              <button
                className={`results-subtab ${resultsSubTab === 'tournaments' ? 'active' : ''}`}
                onClick={() => setResultsSubTab('tournaments')}
              >
                <i className="fas fa-trophy" /> Tournaments ({stats.placements.length})
              </button>
              <button
                className={`results-subtab ${resultsSubTab === 'leagues' ? 'active' : ''}`}
                onClick={() => setResultsSubTab('leagues')}
              >
                <i className="fas fa-trophy" /> Leagues ({leagueStats?.leagues.length ?? 0})
              </button>
            </div>

            {resultsSubTab === 'tournaments' && (
              <>
                <h3 className="mb-3">Tournament Results</h3>
                {stats.placements.length === 0 ? (
                  <p className="text-secondary">No tournament results yet.</p>
                ) : (
                  <div className="profile-results-list">
                    {stats.placements.map((pl) => (
                      <div key={pl.tournamentId} className="profile-result-row"
                        onClick={() => navigate(`/tournament/${pl.tournamentId}`)}>
                        <span className="prr-medal">{PLACEMENT_MEDAL[pl.position] ?? <i className="fas fa-gamepad" />}</span>
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
              </>
            )}

            {resultsSubTab === 'leagues' && (
              <>
                <h3 className="mb-3">League Results</h3>
                {(leagueStats?.leagues.length ?? 0) === 0 ? (
                  <p className="text-secondary">No league results yet.</p>
                ) : (
                  <div className="profile-results-list">
                    {leagueStats!.leagues.map((pl: LeagueResultEntry) => (
                      <div key={pl.leagueId} className="profile-result-row"
                        onClick={() => navigate(`/leagues/${pl.leagueId}`)}>
                        <span className={`prr-medal prr-rank rank-${pl.rank}`}>
                          {pl.rank <= 3 ? PLACEMENT_MEDAL[pl.rank] : pl.rank}
                        </span>
                        <div className="prr-info">
                          <span className="prr-name">{pl.leagueName}</span>
                          <span className="prr-meta text-secondary text-sm">
                            {pl.wins}W – {pl.losses}L · {pl.matchesPlayed} matches · ELO {pl.eloChange >= 0 ? '+' : ''}{pl.eloChange}
                          </span>
                        </div>
                        <span className={`prr-placement ${pl.rank === 1 ? 'gold' : pl.rank <= 3 ? 'podium' : ''}`}>
                          {ordinal(pl.rank)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Edit tab ── */}
        {tab === 'edit' && (
          <div className="card profile-edit-form">
            <h3>Edit Profile</h3>
            {editError && <div className="error-message">{editError}</div>}
            <div className="profile-edit-grid">
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
            </div>
            <CharacterSelect
              gameId={editGameId}
              characterId={editCharacterId}
              onGameChange={setEditGameId}
              onCharacterChange={setEditCharacterId}
            />
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
