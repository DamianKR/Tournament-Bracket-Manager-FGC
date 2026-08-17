import { useMemo, useState } from 'react';
import { Participant, GlobalParticipant } from '@/models/types';
import { loadGlobalParticipants } from '@/services/storage/localStorage';
import { getCharacterImageUrl } from '@/utils/characterImage';
import './Top8Podium.css';

interface Top8PodiumProps {
  participants: Participant[];
  tournamentName: string;
}

function getGlobal(p: Participant, globals: Map<string, GlobalParticipant>): GlobalParticipant | null {
  if (!p.globalParticipantId) return null;
  return globals.get(p.globalParticipantId) ?? null;
}

function getDisplayName(p: Participant, globals: Map<string, GlobalParticipant>): string {
  const g = getGlobal(p, globals);
  if (g) return g.alias?.trim() || g.name;
  return p.alias?.trim() || p.name;
}

function Avatar({ global, fallbackIcon, large = false }: { global: GlobalParticipant | null; fallbackIcon: string; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  const imgUrl = global ? getCharacterImageUrl(global.gameId, global.mainCharacterId) : null;
  const icon = <i className={`fas ${fallbackIcon}`} />;
  return (
    <div className={`top8-avatar ${large ? 'champion-avatar' : ''}`}>
      {!broken && imgUrl
        ? <img src={imgUrl} alt={global?.mainCharacterId ?? 'avatar'} onError={() => setBroken(true)} />
        : icon}
    </div>
  );
}

function Top8Podium({ participants, tournamentName }: Top8PodiumProps) {
  const globals = useMemo(() => {
    const map = new Map<string, GlobalParticipant>();
    loadGlobalParticipants().forEach(g => map.set(g.id, g));
    return map;
  }, []);

  // Positions 1–8 grouped by their finalPosition value (ties share same slot).
  const grouped = useMemo(() => {
    const map = new Map<number, Participant[]>();
    for (const p of participants) {
      if (p.finalPosition && p.finalPosition <= 8) {
        const list = map.get(p.finalPosition) ?? [];
        list.push(p);
        map.set(p.finalPosition, list);
      }
    }
    return map;
  }, [participants]);

  const top8Slots = [1, 2, 3, 4, 5, 7].flatMap(pos => {
    const group = grouped.get(pos) ?? [];
    return group.map(p => ({ pos, p }));
  }).slice(0, 8);

  if (top8Slots.length < 3) return null;

  const champion = top8Slots.find(s => s.pos === 1);
  const rest = top8Slots.filter(s => s.pos !== 1);
  const row1 = rest.slice(0, 3); // 2nd, 3rd, 4th
  const row2 = rest.slice(3, 7); // 5th-8th

  return (
    <div className="top8-podium">
      <div className="top8-header">
        <h2 className="top8-title">
          <i className="fas fa-trophy" /> Top 8
        </h2>
        <span className="top8-event">{tournamentName}</span>
      </div>

      <div className="top8-body">
        {/* Champion — featured */}
        {champion && (
          <div className="top8-champion">
            <div className="top8-card champion-card">
              <div className="top8-rank-badge rank-1">1</div>
              <Avatar global={getGlobal(champion.p, globals)} fallbackIcon="fa-crown" large={true} />
              <div className="top8-player-name">{getDisplayName(champion.p, globals)}</div>
            </div>
          </div>
        )}

        {/* 2nd–8th */}
        <div className="top8-grid">
          <div className="top8-row">
            {row1.map(({ pos, p }) => (
              <div key={p.id} className={`top8-card rank-${pos}-card`}>
                <div className={`top8-rank-badge rank-${pos}`}>{pos}</div>
                <Avatar global={getGlobal(p, globals)} fallbackIcon="fa-gamepad" />
                <div className="top8-player-name">{getDisplayName(p, globals)}</div>
              </div>
            ))}
          </div>
          {row2.length > 0 && (
            <div className="top8-row">
              {row2.map(({ pos, p }) => (
                <div key={p.id} className={`top8-card rank-${pos}-card`}>
                  <div className={`top8-rank-badge rank-${pos}`}>{pos}</div>
                  <Avatar global={getGlobal(p, globals)} fallbackIcon="fa-gamepad" />
                  <div className="top8-player-name">{getDisplayName(p, globals)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Top8Podium;
