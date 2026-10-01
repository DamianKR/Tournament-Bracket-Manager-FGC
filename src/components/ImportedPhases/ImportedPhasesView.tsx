import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportedPhase, ImportedPhaseGroup, ImportedPoolSet, Participant, Bracket } from '@/models/types';
import type { MatchGame } from '@/models/rankedMatch';
import { getCharacterIconUrl } from '@/utils/characterImage';
import BracketView from '@/components/Bracket/BracketView';
import './ImportedPhasesView.css';

// Shape minimal del tournament match que necesitamos
interface TournamentMatchBrief {
  id: string;
  games?: { player1Character?: string | null; player2Character?: string | null }[];
  participant1Characters?: string[];
  participant2Characters?: string[];
  participant1Id?: string | null;
  participant2Id?: string | null;
  player1Id?: string | null;
  player2Id?: string | null;
  // Campos adicionales presentes en bracket matches (con phaseGroupId para filtrar pools DE)
  winnerId?: string | null;
  participant1Score?: number | null;
  participant2Score?: number | null;
  phaseGroupId?: string;
  roundLabel?: string;
  bracketType?: string;
  round?: number;
}

interface Props {
  phases: ImportedPhase[];
  participants: Participant[];
  /** Tournament matches para obtener character icons (opcional) */
  bracketMatches?: TournamentMatchBrief[];
  gameId?: string | null;
  /** Bracket del torneo — se muestra cuando la fase activa es de eliminación */
  bracket?: Bracket;
  onMatchResult?: (matchId: string, winnerId: string, score1?: number, score2?: number, chars1?: string[], chars2?: string[]) => void;
  onMatchGames?: (matchId: string, winnerId: string, games: MatchGame[]) => void;
  onRevertMatch?: (matchId: string) => void;
  readOnly?: boolean;
}

// ── helpers ──────────────────────────────────────────────────────────────

function resolveName(participantId: string, participants: Participant[]): string {
  const p = participants.find((p) => p.id === participantId);
  return p?.name ?? participantId.replace('sgg_e_', '#');
}

/** Obtiene los chars únicos usados por un participante en un set, desde los bracket matches */
function charsForParticipant(
  matchId: string,
  participantId: string,
  bracketMatches: TournamentMatchBrief[],
): string[] {
  const bm = bracketMatches.find((m) => m.id === matchId);
  if (!bm) return [];

  // Intentar con participant1/2 keys primero, luego player1/2
  const isP1 = bm.participant1Id === participantId || bm.player1Id === participantId;
  const isP2 = bm.participant2Id === participantId || bm.player2Id === participantId;

  if (isP1 && bm.participant1Characters?.length) return bm.participant1Characters;
  if (isP2 && bm.participant2Characters?.length) return bm.participant2Characters;

  // Fallback: derivar de games[]
  if (bm.games?.length) {
    const charKey = isP1 ? 'player1Character' : isP2 ? 'player2Character' : null;
    if (charKey) {
      const chars: string[] = [];
      const seen = new Set<string>();
      for (const g of bm.games) {
        const c = g[charKey as 'player1Character' | 'player2Character'];
        if (c && !seen.has(c)) { seen.add(c); chars.push(c); }
      }
      return chars;
    }
  }
  return [];
}

// ── Character icons strip ─────────────────────────────────────────────────

function CharIcons({ chars, gameId }: { chars: string[]; gameId?: string | null }) {
  if (!chars.length || !gameId) return null;
  return (
    <span className="ip-matrix-chars">
      {chars.slice(0, 2).map((c, i) => (
        <img
          key={i}
          src={getCharacterIconUrl(gameId, c) ?? ''}
          alt={c}
          title={c}
          className="ip-matrix-char-icon"
        />
      ))}
    </span>
  );
}

// ── Round-robin match matrix ──────────────────────────────────────────────

function PoolMatchMatrix({
  group,
  participants,
  bracketMatches,
  gameId,
}: {
  group: ImportedPhaseGroup;
  participants: Participant[];
  bracketMatches: TournamentMatchBrief[];
  gameId?: string | null;
}) {
  const { t } = useTranslation();
  const sets = group.sets ?? [];
  if (sets.length === 0) return null;

  // Orden de jugadores: el mismo que standings (placement asc)
  const playerIds = group.standings.map((s) => s.participantId);

  // Lookup bidireccional: `${rowId}__${colId}` → datos del set desde la perspectiva del rowId
  type CellData = {
    matchId: string;
    winnerId: string | null;
    myScore: number | null;
    opScore: number | null;
    myChars: string[];
    opChars: string[];
  };
  const lookup = new Map<string, CellData>();

  for (const s of sets) {
    // Preferir los chars almacenados directamente en el pool set (tras enrichment).
    // Fallback a bracketMatches por si el set está en el bracket de eliminación.
    const p1Chars = s.player1Characters?.length
      ? s.player1Characters
      : charsForParticipant(s.id, s.player1Id, bracketMatches);
    const p2Chars = s.player2Characters?.length
      ? s.player2Characters
      : charsForParticipant(s.id, s.player2Id, bracketMatches);

    lookup.set(`${s.player1Id}__${s.player2Id}`, {
      matchId: s.id,
      winnerId: s.winnerId,
      myScore: s.player1Score,
      opScore: s.player2Score,
      myChars: p1Chars,
      opChars: p2Chars,
    });
    lookup.set(`${s.player2Id}__${s.player1Id}`, {
      matchId: s.id,
      winnerId: s.winnerId,
      myScore: s.player2Score,
      opScore: s.player1Score,
      myChars: p2Chars,
      opChars: p1Chars,
    });
  }

  return (
    <div className="ip-matrix-wrapper">
      <div className="ip-matrix-scroll">
        <table className="ip-matrix-table">
          <thead>
            <tr>
              <th className="ip-matrix-label-cell" />
              {playerIds.map((colId, ci) => {
                const standing = group.standings.find((s) => s.participantId === colId);
                return (
                  <th key={colId} className="ip-matrix-col-header">
                    <span className="ip-matrix-seed">{standing?.placement ?? ci + 1}</span>{' '}
                    <span className="ip-matrix-name">{resolveName(colId, participants)}</span>
                  </th>
                );
              })}
              <th className="ip-matrix-col-header ip-matrix-record-col">
                {t('importedPhases.setRecord')}
              </th>
            </tr>
          </thead>
          <tbody>
            {playerIds.map((rowId, ri) => {
              const standing = group.standings.find((s) => s.participantId === rowId);
              const hasGameRecord = standing?.gameWins != null;
              return (
                <tr key={rowId}>
                  {/* Row label: seed + name */}
                  <td className="ip-matrix-row-label">
                    <span className="ip-matrix-seed">
                      {standing ? (
                        <>
                          {standing.placement <= 2 && (
                            <i className="fas fa-circle-arrow-up ip-advance-icon" />
                          )}
                          {standing.placement}
                        </>
                      ) : ri + 1}
                    </span>
                    <span className="ip-matrix-name">{resolveName(rowId, participants)}</span>
                  </td>

                  {/* Cells */}
                  {playerIds.map((colId) => {
                    if (rowId === colId) {
                      return <td key={colId} className="ip-matrix-cell ip-matrix-self" />;
                    }
                    const entry = lookup.get(`${rowId}__${colId}`);
                    if (!entry) {
                      return <td key={colId} className="ip-matrix-cell ip-matrix-empty">—</td>;
                    }
                    const won = entry.winnerId === rowId;
                    const hasScores = entry.myScore != null && entry.opScore != null;
                    return (
                      <td
                        key={colId}
                        className={`ip-matrix-cell ${won ? 'ip-matrix-win' : 'ip-matrix-loss'}`}
                      >
                        <span className="ip-matrix-cell-content">
                          <CharIcons chars={entry.myChars} gameId={gameId} />
                          <span className="ip-matrix-score">
                            {hasScores
                              ? `${entry.myScore} - ${entry.opScore}`
                              : won ? 'W' : 'L'}
                          </span>
                          <CharIcons chars={entry.opChars} gameId={gameId} />
                        </span>
                      </td>
                    );
                  })}

                  {/* W-L record (set + games) */}
                  <td className="ip-matrix-cell ip-matrix-record">
                    {standing ? (
                      <span className="ip-matrix-record-content">
                        <span className="ip-record-sets">
                          <span className="ip-record-w">{standing.wins}</span>
                          {' - '}
                          <span className="ip-record-l">{standing.losses}</span>
                        </span>
                        {hasGameRecord && (
                          <span className="ip-record-games">
                            <span className="ip-record-w">{standing.gameWins}</span>
                            {' - '}
                            <span className="ip-record-l">{standing.gameLosses}</span>
                          </span>
                        )}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Standing table for a round-robin group ────────────────────────────────

function PoolStandingsTable({
  group,
  participants,
}: {
  group: ImportedPhaseGroup;
  participants: Participant[];
}) {
  const { t } = useTranslation();
  if (group.standings.length === 0) return null;
  return (
    <table className="ip-standings-table">
      <thead>
        <tr>
          <th className="ip-col-rank">#</th>
          <th className="ip-col-name">{t('importedPhases.player')}</th>
          <th className="ip-col-w">{t('importedPhases.wins')}</th>
          <th className="ip-col-l">{t('importedPhases.losses')}</th>
          <th className="ip-col-adv" />
        </tr>
      </thead>
      <tbody>
        {group.standings.map((s) => (
          <tr key={s.participantId} className={s.placement <= 2 ? 'ip-advance' : ''}>
            <td className="ip-col-rank">
              <span className={`ip-rank-badge ${s.placement <= 2 ? 'ip-rank-adv' : ''}`}>
                {s.placement}
              </span>
            </td>
            <td className="ip-col-name">
              <span className="ip-player-name">{resolveName(s.participantId, participants)}</span>
            </td>
            <td className="ip-col-w">
              <span className="ip-stat-pill ip-pill-win">{s.wins}</span>
            </td>
            <td className="ip-col-l">
              <span className="ip-stat-pill ip-pill-loss">{s.losses}</span>
            </td>
            <td className="ip-col-adv">
              {s.placement <= 2 && (
                <span className="ip-adv-tag">
                  <i className="fas fa-circle-arrow-up" />
                  {t('importedPhases.advances')}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Pool selector + detail ────────────────────────────────────────────────

function RoundRobinPhase({
  phase,
  participants,
  bracketMatches,
  gameId,
}: {
  phase: ImportedPhase;
  participants: Participant[];
  bracketMatches: TournamentMatchBrief[];
  gameId?: string | null;
}) {
  const { t } = useTranslation();
  const [activeGroupId, setActiveGroupId] = useState(phase.groups[0]?.id ?? '');
  const selected = phase.groups.find((g) => g.id === activeGroupId) ?? phase.groups[0];

  if (!selected) return null;

  const hasMultiplePools = phase.groups.length > 1;
  const hasMatches = (selected.sets?.length ?? 0) > 0;

  return (
    <div className="ip-rr-phase">
      <p className="ip-phase-desc">
        <i className="fas fa-circle-info" />
        {t('importedPhases.rrDesc', { count: phase.groups.length })}
      </p>

      {/* Pool selector dropdown */}
      {hasMultiplePools && (
        <div className="ip-pool-dropdown-row">
          <label className="ip-pool-dropdown-label">{phase.name}</label>
          <div className="ip-pool-dropdown-wrap">
            <select
              className="ip-pool-dropdown"
              value={activeGroupId}
              onChange={(e) => setActiveGroupId(e.target.value)}
            >
              {phase.groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <i className="fas fa-chevron-down ip-pool-dropdown-icon" />
          </div>
        </div>
      )}

      {/* Selected pool detail */}
      <div className="ip-pool-detail card">
        <div className="ip-group-header">
          <span className="ip-group-name">
            <i className="fas fa-table-cells" />
            {selected.name}
          </span>
          <span className="ip-bracket-badge rr">Round Robin</span>
        </div>

        {/* Match matrix */}
        {hasMatches ? (
          <PoolMatchMatrix
            group={selected}
            participants={participants}
            bracketMatches={bracketMatches}
            gameId={gameId}
          />
        ) : (
          <p className="ip-matrix-empty-msg">
            <i className="fas fa-circle-info" /> {t('importedPhases.reimportForMatches')}
          </p>
        )}

        {/* Standings */}
        {selected.standings.length > 0 && (
          <div className="ip-pool-standings-section">
            <h4 className="ip-section-title">
              <i className="fas fa-list-ol" /> {t('importedPhases.standings')}
            </h4>
            <PoolStandingsTable group={selected} participants={participants} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Phase bracket filter ─────────────────────────────────────────────────

/**
 * Filtra el bracket completo del torneo para mostrar solo los matches
 * que pertenecen al phaseGroup indicado (Top 8, Top 32, etc.)
 *
 * Requiere que los matches tengan `phaseGroupId` (tras re-importar con la versión actual).
 * Si no hay datos de phaseGroupId o el grupo no tiene matches, retorna null
 * para que el componente haga fallback al bracket completo.
 */
function buildPhaseBracket(fullBracket: Bracket, groupId: string): Bracket | null {
  const allMatches = [
    ...fullBracket.winnerBracket,
    ...fullBracket.loserBracket,
    ...(fullBracket.grandFinal ? [fullBracket.grandFinal] : []),
    ...(fullBracket.grandFinalReset ? [fullBracket.grandFinalReset] : []),
  ];

  // Si ningún match tiene phaseGroupId, el torneo no se ha re-importado → fallback
  if (!allMatches.some((m) => m.phaseGroupId)) return null;

  const filtered: Bracket = {
    winnerBracket:   fullBracket.winnerBracket.filter((m) => m.phaseGroupId === groupId),
    loserBracket:    fullBracket.loserBracket.filter((m) => m.phaseGroupId === groupId),
    grandFinal:      fullBracket.grandFinal?.phaseGroupId === groupId ? fullBracket.grandFinal : null,
    grandFinalReset: fullBracket.grandFinalReset?.phaseGroupId === groupId ? fullBracket.grandFinalReset : null,
  };

  const total = filtered.winnerBracket.length + filtered.loserBracket.length +
                (filtered.grandFinal ? 1 : 0);
  return total > 0 ? filtered : null;
}

// ── DE / SE pool phase (multi-group Double/Single Elimination) ────────────

/**
 * Muestra una fase de Double (o Single) Elimination con múltiples grupos (pools).
 * Selector de pool → BracketView filtrado por phaseGroupId.
 * Fallback a lista plana de rondas si el torneo aún no tiene phaseGroupId (importación antigua).
 */
function DEPoolPhase({
  phase,
  participants,
  bracketMatches,
  gameId,
  bracket,
  onMatchResult,
  onMatchGames,
  onRevertMatch,
  readOnly = true,
}: {
  phase: ImportedPhase;
  participants: Participant[];
  bracketMatches: TournamentMatchBrief[];
  gameId?: string | null;
  bracket?: Bracket;
  onMatchResult?: (matchId: string, winnerId: string, score1?: number, score2?: number, chars1?: string[], chars2?: string[]) => void;
  onMatchGames?: (matchId: string, winnerId: string, games: import('@/models/rankedMatch').MatchGame[]) => void;
  onRevertMatch?: (matchId: string) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [activeGroupId, setActiveGroupId] = useState(phase.groups[0]?.id ?? '');
  const selected = phase.groups.find((g) => g.id === activeGroupId) ?? phase.groups[0];

  if (!selected) return null;

  const hasMultiplePools = phase.groups.length > 1;

  const poolLabel = (g: ImportedPhaseGroup) =>
    g.name.match(/^\d+$/) ? `Pool ${g.name}` : g.name;

  // Intentar filtrar el bracket al pool seleccionado (requiere re-importación con phaseGroupId)
  const filteredBracket = bracket ? buildPhaseBracket(bracket, selected.id) : null;

  // Fallback legacy: mostrar lista plana de rondas usando sets del grupo importado
  const renderFallbackList = () => {
    const groupSets = selected.sets ?? [];

    type DisplayMatch = {
      id: string;
      player1Id: string | null;
      player2Id: string | null;
      winnerId: string | null;
      score1: number | null;
      score2: number | null;
      round: number;
      roundLabel: string;
    };

    const displayMatches: DisplayMatch[] = groupSets.map((m) => ({
      id:         m.id,
      player1Id:  (m as ImportedPoolSet).player1Id ?? null,
      player2Id:  (m as ImportedPoolSet).player2Id ?? null,
      winnerId:   (m as ImportedPoolSet).winnerId ?? null,
      score1:     (m as ImportedPoolSet).player1Score ?? null,
      score2:     (m as ImportedPoolSet).player2Score ?? null,
      round:      (m as ImportedPoolSet).round ?? 0,
      roundLabel: (m as ImportedPoolSet).roundLabel ?? '',
    }));

    displayMatches.sort((a, b) => {
      const aWin = a.round >= 0;
      const bWin = b.round >= 0;
      if (aWin !== bWin) return aWin ? -1 : 1;
      return aWin ? a.round - b.round : Math.abs(a.round) - Math.abs(b.round);
    });

    const rounds: { label: string; matches: DisplayMatch[] }[] = [];
    for (const m of displayMatches) {
      const label = m.roundLabel ||
        (m.round > 0 ? `Winners Round ${m.round}` : m.round < 0 ? `Losers Round ${Math.abs(m.round)}` : 'Round');
      const found = rounds.find((r) => r.label === label);
      if (found) found.matches.push(m);
      else rounds.push({ label, matches: [m] });
    }

    if (rounds.length === 0) {
      return (
        <p className="ip-matrix-empty-msg">
          <i className="fas fa-circle-info" /> {t('importedPhases.reimportForMatches')}
        </p>
      );
    }

    return (
      <div className="ip-de-rounds">
        {rounds.map(({ label, matches }) => (
          <div key={label} className="ip-de-round-group">
            <div className="ip-de-round-title">{label}</div>
            <div className="ip-de-matches">
              {matches.map((m) => {
                const p1Won = m.winnerId != null && m.winnerId === m.player1Id;
                const p2Won = m.winnerId != null && m.winnerId === m.player2Id;
                const p1Name = resolveName(m.player1Id ?? '', participants);
                const p2Name = resolveName(m.player2Id ?? '', participants);
                const p1Chars = m.player1Id
                  ? charsForParticipant(m.id, m.player1Id, bracketMatches)
                  : [];
                const p2Chars = m.player2Id
                  ? charsForParticipant(m.id, m.player2Id, bracketMatches)
                  : [];
                return (
                  <div key={m.id} className="ip-de-match-card">
                    <div className={`ip-de-match-row ${p1Won ? 'ip-de-winner' : p2Won ? 'ip-de-loser' : ''}`}>
                      <CharIcons chars={p1Chars} gameId={gameId} />
                      <span className="ip-de-match-name">{p1Name}</span>
                      {m.score1 != null && <span className="ip-de-match-score">{m.score1}</span>}
                      {p1Won && <i className="fas fa-trophy ip-de-win-icon" />}
                    </div>
                    <div className={`ip-de-match-row ${p2Won ? 'ip-de-winner' : p1Won ? 'ip-de-loser' : ''}`}>
                      <CharIcons chars={p2Chars} gameId={gameId} />
                      <span className="ip-de-match-name">{p2Name}</span>
                      {m.score2 != null && <span className="ip-de-match-score">{m.score2}</span>}
                      {p2Won && <i className="fas fa-trophy ip-de-win-icon" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="ip-de-phase">
      <p className="ip-phase-desc">
        <i className="fas fa-circle-info" />
        {hasMultiplePools
          ? t('importedPhases.dePoolsDesc', { count: phase.groups.length })
          : t('importedPhases.dePhaseDesc')}
      </p>

      {/* Pool selector */}
      {hasMultiplePools && (
        <div className="ip-pool-dropdown-row">
          <label className="ip-pool-dropdown-label">{phase.name}</label>
          <div className="ip-pool-dropdown-wrap">
            <select
              className="ip-pool-dropdown"
              value={activeGroupId}
              onChange={(e) => setActiveGroupId(e.target.value)}
            >
              {phase.groups.map((g) => (
                <option key={g.id} value={g.id}>{poolLabel(g)}</option>
              ))}
            </select>
            <i className="fas fa-chevron-down ip-pool-dropdown-icon" />
          </div>
        </div>
      )}

      {/* Bracket del pool seleccionado */}
      {filteredBracket ? (
        // ✅ Datos re-importados con phaseGroupId → BracketView real
        <BracketView
          bracket={filteredBracket}
          participants={participants}
          gameId={gameId ?? undefined}
          onMatchResult={onMatchResult}
          onMatchGames={onMatchGames}
          onRevertMatch={onRevertMatch}
          readOnly={readOnly}
        />
      ) : (
        // ⚠️ Datos antiguos sin phaseGroupId → fallback lista de rondas
        <div className="ip-pool-detail card">
          <div className="ip-group-header">
            <span className="ip-group-name">
              <i className="fas fa-sitemap" />
              {poolLabel(selected)}
            </span>
            <span className="ip-bracket-badge de">Double Elimination</span>
          </div>
          {renderFallbackList()}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function ImportedPhasesView({
  phases,
  participants,
  bracketMatches = [],
  gameId,
  bracket,
  onMatchResult,
  onMatchGames,
  onRevertMatch,
  readOnly = true,
}: Props) {
  const { t } = useTranslation();
  const [activePhase, setActivePhase] = useState(phases[0]?.id ?? '');

  if (phases.length === 0) {
    return (
      <div className="ip-empty">
        <i className="fas fa-circle-info" />
        <p>{t('importedPhases.noPhases')}</p>
      </div>
    );
  }

  const current = phases.find((p) => p.id === activePhase) ?? phases[0];

  return (
    <div className="ip-container">
      {/* Phase tabs — sólo si hay más de una fase */}
      {phases.length > 1 && (
        <div className="ip-phase-tabs">
          {phases.map((ph) => (
            <button
              key={ph.id}
              className={`ip-phase-tab ${ph.id === activePhase ? 'active' : ''}`}
              onClick={() => setActivePhase(ph.id)}
            >
              <i
                className={`fas ${
                  ph.bracketType === 'ROUND_ROBIN' ? 'fa-table-cells' : 'fa-sitemap'
                }`}
              />
              {ph.name}
            </button>
          ))}
        </div>
      )}

      {current && (
        <div className="ip-phase-content">
          {current.bracketType === 'ROUND_ROBIN' ? (
            // Fase round-robin — matriz de resultados por pool
            <RoundRobinPhase
              phase={current}
              participants={participants}
              bracketMatches={bracketMatches}
              gameId={gameId}
            />
          ) : current.groups.length > 1 ? (
            // Fase DE/SE con múltiples grupos (pools DE) — selector de pool + BracketView filtrado
            <DEPoolPhase
              phase={current}
              participants={participants}
              bracketMatches={bracketMatches}
              gameId={gameId}
              bracket={bracket}
              onMatchResult={onMatchResult}
              onMatchGames={onMatchGames}
              onRevertMatch={onRevertMatch}
              readOnly={readOnly}
            />
          ) : bracket ? (
            // Fase DE/SE con un solo grupo (Top 8, Top 32, bracket único).
            // Intentar filtrar al grupo de esta fase; si no hay phaseGroupId (torneo viejo)
            // se muestra el bracket completo como fallback.
            (() => {
              const groupId = current.groups[0]?.id;
              const phaseBracket = groupId ? buildPhaseBracket(bracket, groupId) : null;
              return (
                <BracketView
                  bracket={phaseBracket ?? bracket}
                  participants={participants}
                  gameId={gameId ?? undefined}
                  onMatchResult={onMatchResult}
                  onMatchGames={onMatchGames}
                  onRevertMatch={onRevertMatch}
                  readOnly={readOnly}
                />
              );
            })()
          ) : (
            <div className="ip-bracket-notice card">
              <i className="fas fa-sitemap ip-bracket-icon" />
              <div>
                <strong>{current.name}</strong>
                <p className="text-secondary">{t('importedPhases.bracketPhaseDesc')}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
