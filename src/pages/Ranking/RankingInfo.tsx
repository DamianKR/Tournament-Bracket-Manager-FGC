import { getRankColor, getRankIcon } from '@/services/ranking/rankingService';
import './RankingInfo.css';

const RANK_TIERS = [
  { name: 'Bronce',     min: 0,    max: 1199, kFactor: 44, color: '#8b5a2b' },
  { name: 'Plata',      min: 1200, max: 1299, kFactor: 40, color: '#94a3b8' },
  { name: 'Oro',        min: 1300, max: 1399, kFactor: 34, color: '#f59e0b' },
  { name: 'Platino',    min: 1400, max: 1499, kFactor: 28, color: '#06b6d4' },
  { name: 'Diamante',   min: 1500, max: 1599, kFactor: 22, color: '#6366f1' },
  { name: 'Vanquisher', min: 1600, max: 1699, kFactor: 18, color: '#8b5cf6' },
  { name: 'Master',     min: 1700, max: 1849, kFactor: 14, color: '#ec4899' },
  { name: 'Ultimate',   min: 1850, max: null, kFactor: 10, color: '#7c2d12' },
];

function getKFactor(points: number) {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (points >= RANK_TIERS[i].min) return RANK_TIERS[i].kFactor;
  }
  return 40;
}

function expectedScore(rA: number, rB: number) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

function calculateElo(rA: number, rB: number, winner: 'A' | 'B') {
  const rWinner = winner === 'A' ? rA : rB;
  const rLoser  = winner === 'A' ? rB : rA;
  const Ew = expectedScore(rWinner, rLoser);
  const K  = getKFactor(rWinner);
  const delta = Math.round(K * (1 - Ew));
  const deltaA = winner === 'A' ? +delta : -delta;
  const deltaB = winner === 'B' ? +delta : -delta;
  return {
    newA: Math.max(0, rA + deltaA),
    newB: Math.max(0, rB + deltaB),
    deltaA,
    deltaB,
  };
}

interface Example {
  title: string;
  p1Name: string;
  p1Pts: number;
  p2Name: string;
  p2Pts: number;
  winner: 'A' | 'B';
}

const EXAMPLES: Example[] = [
  { title: 'Master vs Platino — upset', p1Name: 'Platino', p1Pts: 1400, p2Name: 'Master', p2Pts: 1800, winner: 'A' },
  { title: 'Master vs Platino — favorite wins', p1Name: 'Master', p1Pts: 1800, p2Name: 'Platino', p2Pts: 1400, winner: 'A' },
  { title: 'Same rank duel', p1Name: 'Diamante A', p1Pts: 1550, p2Name: 'Diamante B', p2Pts: 1550, winner: 'A' },
];

function ExampleCard({ ex }: { ex: Example }) {
  const res = calculateElo(ex.p1Pts, ex.p2Pts, ex.winner);
  const winnerName = ex.winner === 'A' ? ex.p1Name : ex.p2Name;

  return (
    <div className="info-example card">
      <div className="info-example-title">{ex.title}</div>
      <div className="info-example-matchup">
        <div className="info-example-player">
          <span className="info-example-pts">{ex.p1Pts} pts</span>
          <span className="info-example-name">{ex.p1Name}</span>
        </div>
        <span className="info-example-vs">VS</span>
        <div className="info-example-player">
          <span className="info-example-pts">{ex.p2Pts} pts</span>
          <span className="info-example-name">{ex.p2Name}</span>
        </div>
      </div>
      <div className="info-example-result">
        <span className="info-example-winner"><i className="fas fa-crown" /> {winnerName} gana</span>
        <span className="info-example-delta">
          {ex.p1Name}: <span className={res.deltaA >= 0 ? 'positive' : 'negative'}>{res.deltaA >= 0 ? '+' : ''}{res.deltaA}</span>
          {' · '}
          {ex.p2Name}: <span className={res.deltaB >= 0 ? 'positive' : 'negative'}>{res.deltaB >= 0 ? '+' : ''}{res.deltaB}</span>
        </span>
      </div>
    </div>
  );
}

function RankingInfo() {
  return (
    <div className="rk-info-section card">
      <h2 className="rk-info-title"><i className="fas fa-info-circle" /> How ELO & Ranks Work</h2>

      <div className="rk-info-block">
        <h3>Starting point</h3>
        <p>
          Every player begins at <strong>1500 points</strong> in the <span className="rank-diamante">Diamante</span> rank.
          After each ranked match the winner gains points and the loser loses the exact same amount.
          There are no draws — every match has a winner.
        </p>
      </div>

      <div className="rk-info-block">
        <h3>K-Factor</h3>
        <p>
          The K-Factor decides how many points move after a match. It is based on the <strong>winner's</strong> current rank,
          not a fixed league-wide number. Lower-rated players have a higher K, so upsets reward more points
          and top-tier wins move very little.
        </p>
      </div>

      <div className="rk-info-table-wrap">
        <table className="rk-info-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Icon</th>
              <th>Points</th>
              <th>K-Factor</th>
            </tr>
          </thead>
          <tbody>
            {RANK_TIERS.map((tier) => (
              <tr key={tier.name}>
                <td>
                  <span className="rk-info-rank" style={{ color: getRankColor(tier.name) }}>
                    {tier.name}
                  </span>
                </td>
                <td className="rk-info-icon">
                  <i className={getRankIcon(tier.name)} style={{ color: getRankColor(tier.name) }} />
                </td>
                <td>{tier.min} – {tier.max ?? '∞'}</td>
                <td>{tier.kFactor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rk-info-block">
        <h3>Legend tier</h3>
        <p>
          The top 5 players on the leaderboard receive the <span className="rank-legend">Legend</span> rank,
          no matter how many points they have. Once a player drops out of the top 5 they return to their
          point-based rank.
        </p>
      </div>

      <div className="rk-info-block">
        <h3>Examples</h3>
        <p className="rk-info-subtitle">
          These examples show the same ELO engine used by “Registrar partida” and league matches.
        </p>
      </div>

      <div className="rk-info-examples">
        {EXAMPLES.map((ex) => (
          <ExampleCard key={ex.title} ex={ex} />
        ))}
      </div>
    </div>
  );
}

export default RankingInfo;
