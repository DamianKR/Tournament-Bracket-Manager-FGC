import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Participant, GlobalParticipant, Bracket } from '@/models/types';
import { loadGlobalParticipants } from '@/services/storage/localStorage';
import { getCharacterIconUrl } from '@/utils/characterImage';
import './Top8Podium.css';

interface Top8PodiumProps {
  participants: Participant[];
  tournamentName: string;
  gameId?: string;
  bracket?: Bracket | null;
}

function getGlobal(p: Participant, globals: Map<string, GlobalParticipant>, names: Map<string, GlobalParticipant>): GlobalParticipant | null {
  if (p.globalParticipantId) return globals.get(p.globalParticipantId) ?? null;
  return names.get(p.name.toLowerCase()) ?? null;
}

function getMostUsedCharacters(participantId: string, bracket: Bracket | null | undefined): string[] {
  if (!bracket) return [];

  const counts = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let order = 0;

  const allMatches = [
    ...bracket.winnerBracket,
    ...bracket.loserBracket,
    ...(bracket.grandFinal ? [bracket.grandFinal] : []),
    ...(bracket.grandFinalReset ? [bracket.grandFinalReset] : []),
  ];

  for (const match of allMatches) {
    if (match.status !== 'completed') continue;

    // Characters from per-game log
    if (match.games) {
      if (match.participant1Id === participantId) {
        for (const g of match.games) {
          if (g.player1Character) {
            counts.set(g.player1Character, (counts.get(g.player1Character) ?? 0) + 1);
            if (!firstSeen.has(g.player1Character)) firstSeen.set(g.player1Character, order++);
          }
        }
      }
      if (match.participant2Id === participantId) {
        for (const g of match.games) {
          if (g.player2Character) {
            counts.set(g.player2Character, (counts.get(g.player2Character) ?? 0) + 1);
            if (!firstSeen.has(g.player2Character)) firstSeen.set(g.player2Character, order++);
          }
        }
      }
      continue;
    }

    // Fallback to match-level characters
    if (match.participant1Id === participantId && match.participant1Characters) {
      for (const charId of match.participant1Characters) {
        counts.set(charId, (counts.get(charId) ?? 0) + 1);
        if (!firstSeen.has(charId)) firstSeen.set(charId, order++);
      }
    }
    if (match.participant2Id === participantId && match.participant2Characters) {
      for (const charId of match.participant2Characters) {
        counts.set(charId, (counts.get(charId) ?? 0) + 1);
        if (!firstSeen.has(charId)) firstSeen.set(charId, order++);
      }
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return (firstSeen.get(a[0]) ?? 0) - (firstSeen.get(b[0]) ?? 0);
    })
    .slice(0, 4)
    .map(([charId]) => charId);
}

function getDisplayName(p: Participant, globals: Map<string, GlobalParticipant>, names: Map<string, GlobalParticipant>): string {
  const g = getGlobal(p, globals, names);
  if (g) return g.alias?.trim() || g.name;
  return p.alias?.trim() || p.name;
}

function Avatar({ global, gameId, fallbackIcon, large = false }: { global: GlobalParticipant | null; gameId?: string; fallbackIcon: string; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  // Priorizar gameId del torneo/evento sobre el gameId default del participante
  const effectiveGameId = gameId ?? global?.gameId;
  // Si hay gameId del torneo, buscar el personaje de ese juego en el perfil del participante
  const characterId = (gameId && global?.games?.[gameId]?.mainCharacterId) || global?.mainCharacterId || null;
  const imgUrl = getCharacterIconUrl(effectiveGameId, characterId);
  const icon = <i className={`fas ${fallbackIcon}`} />;
  return (
    <div className={`top8-avatar ${large ? 'champion-avatar' : ''}`}>
      {!broken && imgUrl
        ? <img src={imgUrl} alt={characterId ?? 'avatar'} onError={() => setBroken(true)} />
        : icon}
    </div>
  );
}

function TournamentCharacters({ p, gameId, bracket }: { p: Participant; gameId?: string; bracket?: Bracket | null }) {
  const characterIds = p.characters ?? getMostUsedCharacters(p.id, bracket);
  if (characterIds.length === 0 || !gameId) return null;
  return (
    <div className="top8-characters">
      {characterIds.slice(0, 4).map((charId) => {
        const imgUrl = getCharacterIconUrl(gameId, charId);
        if (!imgUrl) return null;
        return (
          <img
            key={charId}
            src={imgUrl}
            alt={charId}
            className="top8-char-icon"
            title={charId}
          />
        );
      })}
    </div>
  );
}

function Top8Podium({ participants, tournamentName, gameId, bracket }: Top8PodiumProps) {
  const { t } = useTranslation();
  const { globals, names } = useMemo(() => {
    const globals = new Map<string, GlobalParticipant>();
    const names = new Map<string, GlobalParticipant>();
    loadGlobalParticipants().forEach(g => {
      globals.set(g.id, g);
      names.set(g.name.toLowerCase(), g);
    });
    return { globals, names };
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
          <i className="fas fa-trophy" /> {t('tournament.top8Podium.title')}
        </h2>
        <span className="top8-event">{tournamentName}</span>
      </div>

      <div className="top8-body">
        {/* Champion — featured */}
        {champion && (
          <div className="top8-champion">
            <div className="top8-card champion-card">
              <div className="top8-rank-badge rank-1">1</div>
              <Avatar global={getGlobal(champion.p, globals, names)} gameId={gameId} fallbackIcon="fa-crown" large={true} />
              <div className="top8-player-name">{getDisplayName(champion.p, globals, names)}</div>
              <TournamentCharacters p={champion.p} gameId={gameId} bracket={bracket} />
            </div>
          </div>
        )}

        {/* 2nd–8th */}
        <div className="top8-grid">
          <div className="top8-row">
            {row1.map(({ pos, p }) => (
              <div key={p.id} className={`top8-card rank-${pos}-card`}>
                <div className={`top8-rank-badge rank-${pos}`}>{pos}</div>
                <Avatar global={getGlobal(p, globals, names)} gameId={gameId} fallbackIcon="fa-gamepad" />
                <div className="top8-player-name">{getDisplayName(p, globals, names)}</div>
                <TournamentCharacters p={p} gameId={gameId} bracket={bracket} />
              </div>
            ))}
          </div>
          {row2.length > 0 && (
            <div className="top8-row">
              {row2.map(({ pos, p }) => (
                <div key={p.id} className={`top8-card rank-${pos}-card`}>
                  <div className={`top8-rank-badge rank-${pos}`}>{pos}</div>
                  <Avatar global={getGlobal(p, globals, names)} gameId={gameId} fallbackIcon="fa-gamepad" />
                  <div className="top8-player-name">{getDisplayName(p, globals, names)}</div>
                  <TournamentCharacters p={p} gameId={gameId} bracket={bracket} />
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
