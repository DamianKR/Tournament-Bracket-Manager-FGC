import { useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Bracket, Participant, Match } from '@/models/types';
import MatchCard from '@/components/Match/MatchCard';
import { canRevertMatch } from '@/engine/progression/matchProgression';
import { loadGlobalParticipants } from '@/services/storage/localStorage';
import './BracketView.css';

interface BracketViewProps {
  bracket: Bracket;
  participants: Participant[];
  onMatchResult?: (matchId: string, winnerId: string) => void;
  onRevertMatch?: (matchId: string) => void;
  readOnly?: boolean;
}

function BracketView({ bracket, participants, onMatchResult, onRevertMatch, readOnly = false }: BracketViewProps) {
  const { t } = useTranslation();

  // Refs to sync horizontal scroll between header row and matches
  const winnerHeaderRef = useRef<HTMLDivElement>(null);
  const winnerScrollRef = useRef<HTMLDivElement>(null);
  const loserHeaderRef  = useRef<HTMLDivElement>(null);
  const loserScrollRef  = useRef<HTMLDivElement>(null);

  const syncScroll = (
    source: React.RefObject<HTMLDivElement | null>,
    target: React.RefObject<HTMLDivElement | null>
  ) => {
    if (source.current && target.current) {
      target.current.scrollLeft = source.current.scrollLeft;
    }
  };

  // Resolve names from the global roster live — never use the tournament snapshot
  const globalParticipants = useMemo(() => loadGlobalParticipants(), []);
  const globalMap = useMemo(() => {
    const map = new Map<string, typeof globalParticipants[0]>();
    globalParticipants.forEach((p) => map.set(p.id, p));
    return map;
  }, [globalParticipants]);

  const getParticipantName = (id: string | null): string => {
    if (!id) return t('tournament.bracket.tbd');
    const participant = participants.find((p) => p.id === id);
    if (!participant) return t('tournament.bracket.unknown');
    if (participant.globalParticipantId) {
      const global = globalMap.get(participant.globalParticipantId);
      if (global) {
        return global.alias?.trim() || global.name;
      }
    }
    // Fallback to the tournament snapshot
    return participant.alias?.trim() || participant.name;
  };

  const getWinnerRoundName = (roundNum: number, totalRounds: number): string => {
    const fromEnd = totalRounds - roundNum;
    if (fromEnd === 0) return t('tournament.bracket.winnerFinals');
    if (fromEnd === 1) return t('tournament.bracket.winnerSemifinals');
    if (fromEnd === 2) return t('tournament.bracket.winnerQuarterfinals');
    return t('tournament.bracket.round', { number: roundNum });
  };

  const getLoserRoundName = (roundNum: number, totalRounds: number): string => {
    const fromEnd = totalRounds - roundNum;
    if (fromEnd === 0) return t('tournament.bracket.loserFinals');
    if (fromEnd === 1) return t('tournament.bracket.loserSemifinals');
    return t('tournament.bracket.loserRound', { number: roundNum });
  };

  const groupMatchesByRound = (matches: Match[]) => {
    const rounds: { [key: number]: Match[] } = {};
    matches.forEach(match => {
      if (!rounds[match.roundNumber]) rounds[match.roundNumber] = [];
      rounds[match.roundNumber].push(match);
    });
    return rounds;
  };

  const winnerRounds = groupMatchesByRound(bracket.winnerBracket);
  const loserRounds  = groupMatchesByRound(bracket.loserBracket);
  const totalWinnerRounds = Object.keys(winnerRounds).length;
  const totalLoserRounds  = Object.keys(loserRounds).length;

  const renderSection = (
    roundsMap: { [key: number]: Match[] },
    getRoundName: (n: number, total: number) => string,
    totalRounds: number,
    keyPrefix: string,
    headerRef: React.RefObject<HTMLDivElement | null>,
    scrollRef: React.RefObject<HTMLDivElement | null>
  ) => {
    const entries = Object.entries(roundsMap);
    return (
      <>
        {/* Sticky round-name row — outside scroll container so position:sticky works */}
        <div
          className="round-headers-row"
          ref={headerRef}
          onScroll={() => syncScroll(headerRef, scrollRef)}
        >
          {entries.map(([roundNum]) => (
            <div key={`${keyPrefix}-hdr-${roundNum}`} className="round-header-cell">
              {getRoundName(Number(roundNum), totalRounds)}
            </div>
          ))}
        </div>

        {/* Horizontally scrollable match columns */}
        <div
          className="bracket-scroll-container"
          ref={scrollRef}
          onScroll={() => syncScroll(scrollRef, headerRef)}
        >
          <div className="bracket-rounds">
            {entries.map(([roundNum, matches]) => (
              <div key={`${keyPrefix}-${roundNum}`} className="bracket-round">
                <div className="round-matches">
                  {matches.map(match => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      participant1Name={getParticipantName(match.participant1Id)}
                      participant2Name={getParticipantName(match.participant2Id)}
                      onSelectWinner={onMatchResult}
                      onRevertMatch={onRevertMatch}
                      readOnly={readOnly}
                      reversible={onRevertMatch ? canRevertMatch(bracket, match.id) : false}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="bracket-view">
      {/* Winner Bracket */}
      <div className="bracket-section">
        <h2 className="bracket-title">{t('tournament.bracket.winnerBracket')}</h2>
        {renderSection(winnerRounds, getWinnerRoundName, totalWinnerRounds, 'winner', winnerHeaderRef, winnerScrollRef)}
      </div>

      {/* Loser Bracket */}
      {bracket.loserBracket.length > 0 && (
        <div className="bracket-section loser-bracket">
          <h2 className="bracket-title">{t('tournament.bracket.loserBracket')}</h2>
          {renderSection(loserRounds, getLoserRoundName, totalLoserRounds, 'loser', loserHeaderRef, loserScrollRef)}
        </div>
      )}

      {/* Grand Final */}
      {bracket.grandFinal && (
        <div className="bracket-section grand-final">
          <h2 className="bracket-title">{t('tournament.bracket.grandFinal')}</h2>
          <div className="grand-final-matches">
            <MatchCard
              match={bracket.grandFinal}
              participant1Name={getParticipantName(bracket.grandFinal.participant1Id)}
              participant2Name={getParticipantName(bracket.grandFinal.participant2Id)}
              onSelectWinner={onMatchResult}
              onRevertMatch={onRevertMatch}
              readOnly={readOnly}
              isGrandFinal={true}
              reversible={onRevertMatch ? canRevertMatch(bracket, bracket.grandFinal.id) : false}
            />
            {bracket.grandFinalReset && (
              <div className="reset-final">
                <div className="reset-label">{t('tournament.bracket.bracketReset')}</div>
                <MatchCard
                  match={bracket.grandFinalReset}
                  participant1Name={getParticipantName(bracket.grandFinalReset.participant1Id)}
                  participant2Name={getParticipantName(bracket.grandFinalReset.participant2Id)}
                  onSelectWinner={onMatchResult}
                  onRevertMatch={onRevertMatch}
                  readOnly={readOnly}
                  isGrandFinal={true}
                  reversible={onRevertMatch ? canRevertMatch(bracket, bracket.grandFinalReset.id) : false}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BracketView;
