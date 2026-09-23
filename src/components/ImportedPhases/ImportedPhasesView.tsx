import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportedPhase, ImportedPhaseGroup, Participant } from '@/models/types';
import './ImportedPhasesView.css';

interface Props {
  phases: ImportedPhase[];
  participants: Participant[];
}

// ── helpers ──────────────────────────────────────────────────────────────

function resolveName(participantId: string, participants: Participant[]): string {
  return participants.find((p) => p.id === participantId)?.name ?? participantId;
}

// ── Standing table for a round-robin group ────────────────────────────────

function PoolStandingsTable({ group, participants }: { group: ImportedPhaseGroup; participants: Participant[] }) {
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
        </tr>
      </thead>
      <tbody>
        {group.standings.map((s) => (
          <tr key={s.participantId} className={s.placement <= 2 ? 'ip-advance' : ''}>
            <td className="ip-col-rank">
              {s.placement <= 2 && <i className="fas fa-circle-arrow-up ip-advance-icon" />}
              {s.placement}
            </td>
            <td className="ip-col-name">{resolveName(s.participantId, participants)}</td>
            <td className="ip-col-w">{s.wins}</td>
            <td className="ip-col-l">{s.losses}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Single phase group card ───────────────────────────────────────────────

function PhaseGroupCard({ group, participants }: { group: ImportedPhaseGroup; participants: Participant[] }) {
  const isRR = group.bracketType === 'ROUND_ROBIN';
  return (
    <div className="ip-group-card card">
      <div className="ip-group-header">
        <span className="ip-group-name">
          <i className={`fas ${isRR ? 'fa-table-cells' : 'fa-sitemap'}`} />
          {group.name}
        </span>
        <span className={`ip-bracket-badge ${isRR ? 'rr' : 'elim'}`}>
          {isRR ? 'Round Robin' : group.bracketType.replace('_', ' ')}
        </span>
      </div>
      {isRR && group.standings.length > 0 && (
        <PoolStandingsTable group={group} participants={participants} />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function ImportedPhasesView({ phases, participants }: Props) {
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
      {/* Phase tabs */}
      {phases.length > 1 && (
        <div className="ip-phase-tabs">
          {phases.map((ph) => (
            <button
              key={ph.id}
              className={`ip-phase-tab ${ph.id === activePhase ? 'active' : ''}`}
              onClick={() => setActivePhase(ph.id)}
            >
              <i className={`fas ${ph.bracketType === 'ROUND_ROBIN' ? 'fa-table-cells' : 'fa-sitemap'}`} />
              {ph.name}
            </button>
          ))}
        </div>
      )}

      {current && (
        <div className="ip-phase-content">
          {current.bracketType === 'ROUND_ROBIN' ? (
            <>
              <p className="ip-phase-desc">
                <i className="fas fa-circle-info" />
                {t('importedPhases.rrDesc', { count: current.groups.length })}
              </p>
              <div className="ip-groups-grid">
                {current.groups.map((g) => (
                  <PhaseGroupCard key={g.id} group={g} participants={participants} />
                ))}
              </div>
            </>
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
