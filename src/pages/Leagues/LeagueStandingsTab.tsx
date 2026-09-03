import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getPath, canAdminCurrentCommunity } = useCommunity();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBanConfirm, setShowBanConfirm] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [processing, setProcessing] = useState(false);

  function getParticipantName(id: string): string {
    const p = participants.get(id);
    return p ? (p.alias?.trim() || p.name) : t('tournament.bracket.unknown');
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
            <i className="fas fa-sync" /> {t('league.standings.regenerateSchedule')}
          </button>
          {selectedIds.size > 0 && (
            <button
              className="btn-danger btn-sm"
              onClick={() => setShowBanConfirm(true)}
              disabled={processing}
            >
              <i className="fas fa-ban" /> {t('league.standings.banSelected', { count: selectedIds.size })}
            </button>
          )}
        </div>
      )}

      <div className="card">
        <div className="standings-header">
          <h3>{t('league.standings.title')}</h3>
          {playoffsEnabled && (
            <span className="playoffs-note"><i className="fas fa-trophy" /> {t('league.standings.playoffsNote')}</span>
          )}
        </div>

        <div className="standings-table-wrapper">
          <table className="standings-table">
            <thead>
              <tr>
                {canAdminCurrentCommunity && <th className="col-select"></th>}
                <th className="col-rank">{t('league.standings.table.rank')}</th>
                <th className="col-player">{t('league.standings.table.player')}</th>
                <th className="col-stat">{t('league.standings.table.mp')}</th>
                <th className="col-stat">{t('league.standings.table.w')}</th>
                <th className="col-stat">{t('league.standings.table.l')}</th>
                <th className="col-stat">{t('league.standings.table.elo')}</th>
                <th className="col-stat">{t('league.standings.table.change')}</th>
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
                          <span className="no-show-badge" title={t('league.standings.noShowsTitle', { count: s.noShows })}>
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
            <p className="text-secondary">{t('league.standings.noMatches')}</p>
          </div>
        )}
      </div>

      {showBanConfirm && (
        <ConfirmModal
          isOpen={showBanConfirm}
          title={t('league.standings.banConfirm.title')}
          message={t('league.standings.banConfirm.message', { count: selectedIds.size })}
          onConfirm={handleBanSelected}
          onCancel={() => setShowBanConfirm(false)}
          confirmText={t('league.standings.banConfirm.confirm')}
        />
      )}

      {showRegenerateConfirm && (
        <ConfirmModal
          isOpen={showRegenerateConfirm}
          title={t('league.standings.regenerateConfirm.title')}
          message={t('league.standings.regenerateConfirm.message')}
          onConfirm={handleRegenerateSchedule}
          onCancel={() => setShowRegenerateConfirm(false)}
          confirmText={t('league.standings.regenerateConfirm.confirm')}
        />
      )}
    </div>
  );
}

export default LeagueStandingsTab;
