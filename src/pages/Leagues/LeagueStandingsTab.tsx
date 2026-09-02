import { useState } from 'react';
import { LeagueStanding, GlobalParticipant } from '@/models/types';
import { useNavigate } from 'react-router-dom';
import { useCommunity } from '@/contexts/CommunityContext';

import { banParticipants, regenerateSchedule } from '@/services/leagues/leagueService';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import './LeagueStandingsTab.css';

interface LeagueStandingsTabProps {
  leagueId: string;
  standings: LeagueStanding[];
  participants: Map<string, GlobalParticipant>;
  playoffsEnabled: boolean;
  onRefresh: () => void;
}

function LeagueStandingsTab({ leagueId, standings, participants, playoffsEnabled, onRefresh }: LeagueStandingsTabProps) {
  const navigate = useNavigate();
  const { getPath, canAdminCurrentCommunity } = useCommunity();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBanConfirm, setShowBanConfirm] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [processing, setProcessing] = useState(false);

  function getParticipantName(id: string): string {
    const p = participants.get(id);
    return p ? (p.alias?.trim() || p.name) : 'Unknown';
  }

  function formatEloChange(change: number): string {
    if (change === 0) return '±0';
    return change > 0 ? `+${change}` : `${change}`;
  }

  function toggleSelection(id: string) {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  }

  async function handleBanSelected() {
    if (selectedIds.size === 0) return;
    setProcessing(true);
    try {
      const result = await banParticipants(leagueId, Array.from(selectedIds));
      if (result) {
        setSelectedIds(new Set());
        setShowBanConfirm(false);
        onRefresh();
      }
    } finally {
      setProcessing(false);
    }
  }

  async function handleRegenerateSchedule() {
    setProcessing(true);
    try {
      const result = await regenerateSchedule(leagueId);
      if (result) {
        setShowRegenerateConfirm(false);
        onRefresh();
      }
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="standings-tab">
      {canAdminCurrentCommunity && (
        <div className="admin-actions-bar">
          <button
            className="btn-outline btn-sm"
            onClick={() => setShowRegenerateConfirm(true)}
            disabled={processing}
          >
            <i className="fas fa-sync" /> Regenerate Schedule
          </button>
          {selectedIds.size > 0 && (
            <button
              className="btn-danger btn-sm"
              onClick={() => setShowBanConfirm(true)}
              disabled={processing}
            >
              <i className="fas fa-ban" /> Ban {selectedIds.size} Player{selectedIds.size > 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      <div className="card">
        <div className="standings-header">
          <h3>Standings</h3>
          {playoffsEnabled && (
            <span className="playoffs-note"><i className="fas fa-trophy" /> Top 8 qualify for playoffs</span>
          )}
        </div>

        <div className="standings-table-wrapper">
          <table className="standings-table">
            <thead>
              <tr>
                {canAdminCurrentCommunity && <th className="col-select"></th>}
                <th className="col-rank">#</th>
                <th className="col-player">Player</th>
                <th className="col-stat">MP</th>
                <th className="col-stat">W</th>
                <th className="col-stat">L</th>
                <th className="col-stat">ELO</th>
                <th className="col-stat">Change</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => {
                const isPlayoffQualified = playoffsEnabled && s.rank <= 8;
                const isSelected = selectedIds.has(s.participantId);
                return (
                  <tr
                    key={s.participantId}
                    className={`standing-row ${isPlayoffQualified ? 'playoff-qualified' : ''} ${isSelected ? 'selected' : ''}`}
                  >
                    {canAdminCurrentCommunity && (
                      <td className="col-select" onClick={(e) => { e.stopPropagation(); toggleSelection(s.participantId); }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(s.participantId)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                    )}
                    <td className="col-rank" onClick={() => navigate(getPath(`participants/${s.participantId}`))}>
                      <span className={`rank-badge rank-${s.rank}`}>
                        {s.rank === 1 && '🥇'}
                        {s.rank === 2 && '🥈'}
                        {s.rank === 3 && '🥉'}
                        {s.rank > 3 && s.rank}
                      </span>
                    </td>
                    <td className="col-player" onClick={() => navigate(getPath(`participants/${s.participantId}`))}>
                      <div className="player-cell">
                        <span className="player-name">{getParticipantName(s.participantId)}</span>
                        {s.noShows > 0 && (
                          <span className="no-show-badge" title={`${s.noShows} no-shows`}>
                            <i className="fas fa-exclamation-triangle" /> {s.noShows}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="col-stat" onClick={() => navigate(getPath(`participants/${s.participantId}`))}>{s.matchesPlayed}</td>
                    <td className="col-stat text-success" onClick={() => navigate(getPath(`participants/${s.participantId}`))}>{s.wins}</td>
                    <td className="col-stat text-danger" onClick={() => navigate(getPath(`participants/${s.participantId}`))}>{s.losses}</td>
                    <td className="col-stat font-bold" onClick={() => navigate(getPath(`participants/${s.participantId}`))}>{s.currentElo}</td>
                    <td className={`col-stat ${s.eloChange >= 0 ? 'text-success' : 'text-danger'}`} onClick={() => navigate(getPath(`participants/${s.participantId}`))}>
                      {formatEloChange(s.eloChange)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {standings.length === 0 && (
          <div className="empty-standings">
            <p className="text-secondary">No matches played yet.</p>
          </div>
        )}
      </div>

      {showBanConfirm && (
        <ConfirmModal
          isOpen={showBanConfirm}
          title="Ban Players"
          message={`Are you sure you want to ban ${selectedIds.size} player(s)? This will remove them from the league and regenerate all future matches.`}
          onConfirm={handleBanSelected}
          onCancel={() => setShowBanConfirm(false)}
          confirmText="Ban Players"
        />
      )}

      {showRegenerateConfirm && (
        <ConfirmModal
          isOpen={showRegenerateConfirm}
          title="Regenerate Schedule"
          message="This will delete all scheduled, reported, and pending_review matches and regenerate them using the corrected algorithm. Completed and no_show matches will be preserved. Continue?"
          onConfirm={handleRegenerateSchedule}
          onCancel={() => setShowRegenerateConfirm(false)}
          confirmText="Regenerate"
        />
      )}
    </div>
  );
}

export default LeagueStandingsTab;
