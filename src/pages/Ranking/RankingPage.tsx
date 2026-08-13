import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalParticipant } from '@/models/types';
import { getAllParticipantsAsync, getAllParticipants } from '@/services/participants/participantService';
import {
  getLeaderboard,
  recordMatch,
  getAllMatches,
  deleteMatch,
  getRankColor,
  getRankIcon,
  type LeaderboardEntry,
  type MatchResult,
} from '@/services/ranking/rankingService';
import type { MatchRecord } from '@/models/types';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import './RankingPage.css';

type Tab = 'leaderboard' | 'record' | 'history';

function RankingPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('leaderboard');

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [boardError, setBoardError] = useState('');

  // All participants (for selectors)
  const [allParticipants, setAllParticipants] = useState<GlobalParticipant[]>([]);

  // Record match
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const [winnerId, setWinnerId] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState('');
  const [lastResult, setLastResult] = useState<MatchResult | null>(null);

  // History
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Participant name lookup
  const participantMap = new Map(allParticipants.map((p) => [p.id, p]));

  const loadLeaderboard = useCallback(async () => {
    setLoadingBoard(true);
    setBoardError('');
    try {
      const data = await getLeaderboard();
      setLeaderboard(data);
    } catch {
      setBoardError('No se pudo cargar el ranking. ¿Está el servidor corriendo?');
    } finally {
      setLoadingBoard(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await getAllMatches();
      setMatchHistory(data as unknown as MatchRecord[]);
    } catch {
      // silently fail
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    // Load participants for selectors — cached first, then server
    const cached = getAllParticipants();
    if (cached.length) setAllParticipants(cached);
    getAllParticipantsAsync().then((data) => { if (data.length) setAllParticipants(data); });

    loadLeaderboard();
  }, [loadLeaderboard]);

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab, loadHistory]);

  // ── Record match ────────────────────────────────────────────────────────

  async function handleRecord() {
    if (!playerAId || !playerBId) { setRecordError('Selecciona ambos participantes.'); return; }
    if (playerAId === playerBId) { setRecordError('Un participante no puede enfrentarse a sí mismo.'); return; }
    if (!winnerId) { setRecordError('Selecciona quién ganó.'); return; }

    setRecording(true);
    setRecordError('');
    setLastResult(null);
    try {
      const result = await recordMatch(playerAId, playerBId, winnerId);
      setLastResult(result);
      // Refresh leaderboard
      await loadLeaderboard();
      // Reset form
      setPlayerAId('');
      setPlayerBId('');
      setWinnerId('');
    } catch (err: unknown) {
      setRecordError(err instanceof Error ? err.message : 'Error al registrar partida.');
    } finally {
      setRecording(false);
    }
  }

  // ── Delete match ────────────────────────────────────────────────────────

  async function handleDeleteMatch() {
    if (!deleteTarget) return;
    try {
      await deleteMatch(deleteTarget);
      setMatchHistory((prev) => prev.filter((m) => m.id !== deleteTarget));
    } catch {
      // silently fail
    } finally {
      setDeleteTarget(null);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function pName(id: string) {
    return participantMap.get(id)?.name ?? id;
  }

  function deltaLabel(delta: number) {
    if (delta > 0) return <span className="rk-delta positive">+{delta}</span>;
    if (delta < 0) return <span className="rk-delta negative">{delta}</span>;
    return <span className="rk-delta neutral">0</span>;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      <div className="rk-header">
        <div>
          <h1 className="rk-title">Ranking ELO</h1>
          <p className="rk-subtitle">Sistema de puntos competitivo — inicio en 1500 pts</p>
        </div>
        <div className="rk-tabs">
          <button className={`rk-tab ${tab === 'leaderboard' ? 'active' : ''}`} onClick={() => setTab('leaderboard')}>
            🏆 Ranking
          </button>
          <button className={`rk-tab ${tab === 'record' ? 'active' : ''}`} onClick={() => setTab('record')}>
            ⚔️ Registrar Partida
          </button>
          <button className={`rk-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
            📋 Historial
          </button>
        </div>
      </div>

      {/* ── LEADERBOARD TAB ── */}
      {tab === 'leaderboard' && (
        <div className="rk-section">
          {loadingBoard && <p className="rk-loading">Cargando ranking...</p>}
          {boardError && <p className="rk-error">{boardError}</p>}

          {!loadingBoard && !boardError && leaderboard.length === 0 && (
            <div className="rk-empty">
              <span className="rk-empty-icon">🏆</span>
              <p>No hay participantes aún.</p>
              <button className="btn btn-primary" onClick={() => navigate('/participants')}>
                Ir a Participantes
              </button>
            </div>
          )}

          {!loadingBoard && leaderboard.length > 0 && (
            <div className="rk-table-wrapper card">
              <table className="rk-table">
                <thead>
                  <tr>
                    <th className="rk-col-pos">#</th>
                    <th className="rk-col-player">Jugador</th>
                    <th className="rk-col-rank">Rango</th>
                    <th className="rk-col-pts">Puntos</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => (
                    <tr
                      key={entry.id}
                      className={`rk-row ${entry.position <= 5 ? 'legend-row' : ''}`}
                      onClick={() => navigate(`/participants/${entry.id}`)}
                    >
                      <td className="rk-col-pos">
                        <span className={`rk-pos ${entry.position <= 3 ? `top${entry.position}` : ''}`}>
                          {entry.position <= 3 ? ['🥇', '🥈', '🥉'][entry.position - 1] : entry.position}
                        </span>
                      </td>
                      <td className="rk-col-player">
                        <div className="rk-player">
                          {entry.avatarUrl
                            ? <img src={entry.avatarUrl} alt={entry.name} className="rk-avatar" />
                            : <div className="rk-avatar-placeholder">{entry.name[0]?.toUpperCase()}</div>
                          }
                          <div className="rk-player-info">
                            <span className="rk-player-name">{entry.name}</span>
                            {entry.alias && <span className="rk-player-alias">{entry.alias}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="rk-col-rank">
                        <span
                          className="rk-rank-badge"
                          style={{ '--rank-color': getRankColor(entry.displayRank) } as React.CSSProperties}
                        >
                          {getRankIcon(entry.displayRank)} {entry.displayRank}
                        </span>
                      </td>
                      <td className="rk-col-pts">
                        <span className="rk-pts">{entry.eloPoints.toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── RECORD MATCH TAB ── */}
      {tab === 'record' && (
        <div className="rk-section">
          <div className="card rk-record-card">
            <div className="rk-record-header">
              <span className="rk-record-icon">⚔️</span>
              <div>
                <h3>Registrar Partida</h3>
                <p>Selecciona dos jugadores y quién ganó. Los puntos ELO se calculan y actualizan automáticamente.</p>
              </div>
            </div>

            {allParticipants.length < 2 && (
              <div className="rk-warn">
                Necesitas al menos 2 participantes para registrar una partida.{' '}
                <button className="btn-link" onClick={() => navigate('/participants')}>
                  Ir a Participantes →
                </button>
              </div>
            )}

            {allParticipants.length >= 2 && (
              <>
                <div className="rk-matchup">
                  {/* Player A */}
                  <div className="rk-player-slot">
                    <label className="rk-slot-label">Jugador 1</label>
                    <select
                      className="rk-select"
                      value={playerAId}
                      onChange={(e) => { setPlayerAId(e.target.value); setWinnerId(''); setLastResult(null); }}
                    >
                      <option value="">— Selecciona jugador —</option>
                      {allParticipants
                        .filter((p) => p.id !== playerBId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.alias ? ` (${p.alias})` : ''} — {p.eloPoints ?? 1500} pts
                          </option>
                        ))}
                    </select>
                    {playerAId && (
                      <EloPreview
                        participant={participantMap.get(playerAId)!}
                        isWinner={winnerId === playerAId}
                        onSetWinner={() => setWinnerId(playerAId)}
                      />
                    )}
                  </div>

                  <div className="rk-vs">VS</div>

                  {/* Player B */}
                  <div className="rk-player-slot">
                    <label className="rk-slot-label">Jugador 2</label>
                    <select
                      className="rk-select"
                      value={playerBId}
                      onChange={(e) => { setPlayerBId(e.target.value); setWinnerId(''); setLastResult(null); }}
                    >
                      <option value="">— Selecciona jugador —</option>
                      {allParticipants
                        .filter((p) => p.id !== playerAId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.alias ? ` (${p.alias})` : ''} — {p.eloPoints ?? 1500} pts
                          </option>
                        ))}
                    </select>
                    {playerBId && (
                      <EloPreview
                        participant={participantMap.get(playerBId)!}
                        isWinner={winnerId === playerBId}
                        onSetWinner={() => setWinnerId(playerBId)}
                      />
                    )}
                  </div>
                </div>

                {playerAId && playerBId && (
                  <div className="rk-winner-prompt">
                    <p>¿Quién ganó?</p>
                    <div className="rk-winner-btns">
                      <button
                        className={`rk-winner-btn ${winnerId === playerAId ? 'selected' : ''}`}
                        onClick={() => setWinnerId(playerAId)}
                      >
                        🏆 {pName(playerAId)}
                      </button>
                      <button
                        className={`rk-winner-btn ${winnerId === playerBId ? 'selected' : ''}`}
                        onClick={() => setWinnerId(playerBId)}
                      >
                        🏆 {pName(playerBId)}
                      </button>
                    </div>
                  </div>
                )}

                {recordError && <p className="rk-error">{recordError}</p>}

                <div className="rk-record-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleRecord}
                    disabled={recording || !playerAId || !playerBId || !winnerId}
                  >
                    {recording ? 'Calculando...' : 'Confirmar Resultado'}
                  </button>
                </div>

                {/* Result feedback */}
                {lastResult && (
                  <div className="rk-result-box">
                    <h4>¡Resultado registrado!</h4>
                    <div className="rk-result-row">
                      <ResultCard r={lastResult.playerA} isWinner={lastResult.playerA.id === lastResult.match.winnerId} />
                      <span className="rk-result-vs">vs</span>
                      <ResultCard r={lastResult.playerB} isWinner={lastResult.playerB.id === lastResult.match.winnerId} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {tab === 'history' && (
        <div className="rk-section">
          {loadingHistory && <p className="rk-loading">Cargando historial...</p>}

          {!loadingHistory && matchHistory.length === 0 && (
            <div className="rk-empty">
              <span className="rk-empty-icon">📋</span>
              <p>No hay partidas registradas aún.</p>
            </div>
          )}

          {!loadingHistory && matchHistory.length > 0 && (
            <div className="rk-history-list">
              {(matchHistory as unknown as (MatchRecord & {
                playerAPointsBefore: number; playerBPointsBefore: number;
                playerAPointsAfter: number; playerBPointsAfter: number;
                playerADelta: number; playerBDelta: number;
                playerARankBefore: string; playerBRankBefore: string;
                playerARankAfter: string; playerBRankAfter: string;
              })[]).map((m) => (
                <div key={m.id} className="card rk-history-card">
                  <div className="rk-history-top">
                    <span className="rk-history-date">{formatDate(m.createdAt)}</span>
                    <button
                      className="rk-history-delete"
                      title="Eliminar registro (no revierte ELO)"
                      onClick={() => setDeleteTarget(m.id)}
                    >
                      🗑
                    </button>
                  </div>
                  <div className="rk-history-players">
                    <div className={`rk-history-player ${m.winnerId === m.playerAId ? 'winner' : 'loser'}`}>
                      <span className="rk-history-pname">
                        {m.winnerId === m.playerAId ? '🏆 ' : ''}{pName(m.playerAId)}
                      </span>
                      <span className="rk-history-pts">
                        {m.playerAPointsBefore} → {m.playerAPointsAfter} {deltaLabel(m.playerADelta)}
                      </span>
                      <span className="rk-history-rank">
                        {m.playerARankBefore !== m.playerARankAfter
                          ? `${m.playerARankBefore} → ${m.playerARankAfter}`
                          : m.playerARankAfter}
                      </span>
                    </div>
                    <span className="rk-history-vs">vs</span>
                    <div className={`rk-history-player ${m.winnerId === m.playerBId ? 'winner' : 'loser'}`}>
                      <span className="rk-history-pname">
                        {m.winnerId === m.playerBId ? '🏆 ' : ''}{pName(m.playerBId)}
                      </span>
                      <span className="rk-history-pts">
                        {m.playerBPointsBefore} → {m.playerBPointsAfter} {deltaLabel(m.playerBDelta)}
                      </span>
                      <span className="rk-history-rank">
                        {m.playerBRankBefore !== m.playerBRankAfter
                          ? `${m.playerBRankBefore} → ${m.playerBRankAfter}`
                          : m.playerBRankAfter}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete match confirm */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Eliminar registro"
        message="¿Eliminar este registro de partida? Esta acción no revierte los puntos ELO aplicados."
        confirmText="Eliminar"
        onConfirm={() => { void handleDeleteMatch(); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function EloPreview({
  participant,
  isWinner,
  onSetWinner,
}: {
  participant: GlobalParticipant;
  isWinner: boolean;
  onSetWinner: () => void;
}) {
  const pts = participant.eloPoints ?? 1500;
  const rank = participant.eloRank ?? 'Diamante';
  return (
    <div className={`rk-elo-preview ${isWinner ? 'winner-preview' : ''}`} onClick={onSetWinner}>
      <span className="rk-elo-rank-icon">{getRankIcon(rank)}</span>
      <div>
        <span className="rk-elo-rank-name" style={{ color: getRankColor(rank) }}>{rank}</span>
        <span className="rk-elo-pts">{pts.toLocaleString()} pts</span>
      </div>
      {isWinner && <span className="rk-winner-crown">👑 Ganador</span>}
    </div>
  );
}

function ResultCard({
  r,
  isWinner,
}: {
  r: { name: string; pointsBefore: number; pointsAfter: number; delta: number; rankBefore: string; rankAfter: string };
  isWinner: boolean;
}) {
  return (
    <div className={`rk-result-card ${isWinner ? 'winner' : 'loser'}`}>
      <span className="rk-result-name">{isWinner ? '🏆 ' : ''}{r.name}</span>
      <span className="rk-result-pts">
        {r.pointsBefore} → <strong>{r.pointsAfter}</strong>
      </span>
      <span className={`rk-result-delta ${r.delta >= 0 ? 'positive' : 'negative'}`}>
        {r.delta >= 0 ? '+' : ''}{r.delta} pts
      </span>
      {r.rankBefore !== r.rankAfter && (
        <span className="rk-result-rankup">
          {r.rankBefore} → {r.rankAfter}
        </span>
      )}
    </div>
  );
}

export default RankingPage;
