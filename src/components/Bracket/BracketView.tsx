import { Bracket, Participant, Match } from '@/models/types';
import MatchCard from '@/components/Match/MatchCard';
import './BracketView.css';

interface BracketViewProps {
  bracket: Bracket;
  participants: Participant[];
  onMatchResult: (matchId: string, winnerId: string) => void;
  readOnly?: boolean;
}

function BracketView({ bracket, participants, onMatchResult, readOnly = false }: BracketViewProps) {
  const getParticipantName = (id: string | null): string => {
    if (!id) return 'TBD';
    const participant = participants.find(p => p.id === id);
    return participant?.name || 'Unknown';
  };

  const groupMatchesByRound = (matches: Match[]) => {
    const rounds: { [key: number]: Match[] } = {};
    matches.forEach(match => {
      if (!rounds[match.roundNumber]) {
        rounds[match.roundNumber] = [];
      }
      rounds[match.roundNumber].push(match);
    });
    return rounds;
  };

  const winnerRounds = groupMatchesByRound(bracket.winnerBracket);
  const loserRounds = groupMatchesByRound(bracket.loserBracket);

  return (
    <div className="bracket-view">
      {/* Winner Bracket */}
      <div className="bracket-section">
        <h2 className="bracket-title">Winner Bracket</h2>
        <div className="bracket-rounds">
          {Object.entries(winnerRounds).map(([roundNum, matches]) => (
            <div key={`winner-${roundNum}`} className="bracket-round">
              <div className="round-header">Round {roundNum}</div>
              <div className="round-matches">
                {matches.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    participant1Name={getParticipantName(match.participant1Id)}
                    participant2Name={getParticipantName(match.participant2Id)}
                    onSelectWinner={onMatchResult}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Loser Bracket */}
      {bracket.loserBracket.length > 0 && (
        <div className="bracket-section loser-bracket">
          <h2 className="bracket-title">Loser Bracket</h2>
          <div className="bracket-rounds">
            {Object.entries(loserRounds).map(([roundNum, matches]) => (
              <div key={`loser-${roundNum}`} className="bracket-round">
                <div className="round-header">Round {roundNum}</div>
                <div className="round-matches">
                  {matches.map(match => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      participant1Name={getParticipantName(match.participant1Id)}
                      participant2Name={getParticipantName(match.participant2Id)}
                      onSelectWinner={onMatchResult}
                      readOnly={readOnly}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grand Finals */}
      {bracket.grandFinal && (
        <div className="bracket-section grand-final">
          <h2 className="bracket-title">Grand Final</h2>
          <div className="grand-final-matches">
            <MatchCard
              match={bracket.grandFinal}
              participant1Name={getParticipantName(bracket.grandFinal.participant1Id)}
              participant2Name={getParticipantName(bracket.grandFinal.participant2Id)}
              onSelectWinner={onMatchResult}
              readOnly={readOnly}
              isGrandFinal={true}
            />
            
            {bracket.grandFinalReset && (
              <div className="reset-final">
                <div className="reset-label">Bracket Reset</div>
                <MatchCard
                  match={bracket.grandFinalReset}
                  participant1Name={getParticipantName(bracket.grandFinalReset.participant1Id)}
                  participant2Name={getParticipantName(bracket.grandFinalReset.participant2Id)}
                  onSelectWinner={onMatchResult}
                  readOnly={readOnly}
                  isGrandFinal={true}
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
