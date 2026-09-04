import { useTranslation } from 'react-i18next';
import { getRankColor, getRankIcon } from '@/services/ranking/rankingService';
import './RankingInfo.css';

const RANK_TIERS = [
  { name: 'Bronce',     min: 0,    max: 1199, kFactor: 44, color: '#8b5a2b' },
  { name: 'Plata',      min: 1200, max: 1299, kFactor: 40, color: '#94a3b8' },
  { name: 'Oro',        min: 1300, max: 1399, kFactor: 34, color: '#f59e0b' },
  { name: 'Platino',    min: 1400, max: 1499, kFactor: 28, color: '#06b6d4' },
  { name: 'Diamante',   min: 1500, max: 1599, kFactor: 22, color: '#2563eb' },
  { name: 'Vanquisher', min: 1600, max: 1699, kFactor: 18, color: '#a855f7' },
  { name: 'Master',     min: 1700, max: 1849, kFactor: 14, color: '#ec4899' },
  { name: 'Ultimate',   min: 1850, max: null, kFactor: 10, color: '#971c0e' },
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
  key: string;
  p1Rank: string;
  p1Suffix?: string;
  p1Pts: number;
  p2Rank: string;
  p2Suffix?: string;
  p2Pts: number;
  winner: 'A' | 'B';
}

const EXAMPLES: Example[] = [
  { key: 'upset', p1Rank: 'Platino', p1Pts: 1400, p2Rank: 'Master', p2Pts: 1800, winner: 'A' },
  { key: 'favorite', p1Rank: 'Master', p1Pts: 1800, p2Rank: 'Platino', p2Pts: 1400, winner: 'A' },
  { key: 'sameRank', p1Rank: 'Diamante', p1Suffix: 'A', p1Pts: 1550, p2Rank: 'Diamante', p2Suffix: 'B', p2Pts: 1550, winner: 'A' },
];

function formatRankName(rank: string, suffix: string | undefined, t: (key: string) => string) {
  return t(`rankingInfo.tierNames.${rank}`) + (suffix ? ` ${suffix}` : '');
}

function ExampleCard({ ex }: { ex: Example }) {
  const { t } = useTranslation();
  const res = calculateElo(ex.p1Pts, ex.p2Pts, ex.winner);
  const p1Name = formatRankName(ex.p1Rank, ex.p1Suffix, t);
  const p2Name = formatRankName(ex.p2Rank, ex.p2Suffix, t);
  const winnerName = ex.winner === 'A' ? p1Name : p2Name;

  return (
    <div className="info-example card">
      <div className="info-example-title">{t(`rankingInfo.exampleLabels.${ex.key}`)}</div>
      <div className="info-example-matchup">
        <div className="info-example-player">
          <span className="info-example-pts">{ex.p1Pts} {t('rankingInfo.pts')}</span>
          <span className="info-example-name">{p1Name}</span>
        </div>
        <span className="info-example-vs">{t('rankingInfo.vs')}</span>
        <div className="info-example-player">
          <span className="info-example-pts">{ex.p2Pts} {t('rankingInfo.pts')}</span>
          <span className="info-example-name">{p2Name}</span>
        </div>
      </div>
      <div className="info-example-result">
        <span className="info-example-winner"><i className="fas fa-crown" /> {t('rankingInfo.winner', { name: winnerName })}</span>
        <span className="info-example-delta">
          {p1Name}: <span className={res.deltaA >= 0 ? 'positive' : 'negative'}>{res.deltaA >= 0 ? '+' : ''}{res.deltaA}</span>
          {' · '}
          {p2Name}: <span className={res.deltaB >= 0 ? 'positive' : 'negative'}>{res.deltaB >= 0 ? '+' : ''}{res.deltaB}</span>
        </span>
      </div>
    </div>
  );
}

function RankingInfo() {
  const { t } = useTranslation();
  return (
    <div className="rk-info-section card">
      <h2 className="rk-info-title"><i className="fas fa-info-circle" /> {t('rankingInfo.title')}</h2>

      <div className="rk-info-block">
        <h3>{t('rankingInfo.startingTitle')}</h3>
        <p>
          {t('rankingInfo.startingPrefix')} <strong>{t('rankingInfo.startingMid', { points: 1500 })}</strong>
          <span className="rank-diamante">{t('rankingInfo.startingSuffix', { rank: t('rankingInfo.rankDiamante') })}</span>
        </p>
      </div>

      <div className="rk-info-block">
        <h3>{t('rankingInfo.kFactorTitle')}</h3>
        <p>
          {t('rankingInfo.kFactorTextPrefix')}<strong>{t('rankingInfo.kFactorTextMid', { winner: t('rankingInfo.winnerNoun') })}</strong>{t('rankingInfo.kFactorTextSuffix')}
        </p>
      </div>

      <div className="rk-info-table-wrap">
        <table className="rk-info-table">
          <thead>
            <tr>
              <th>{t('rankingInfo.table.rank')}</th>
              <th>{t('rankingInfo.table.icon')}</th>
              <th>{t('rankingInfo.table.points')}</th>
              <th>{t('rankingInfo.table.kFactor')}</th>
            </tr>
          </thead>
          <tbody>
            {RANK_TIERS.map((tier) => (
              <tr key={tier.name}>
                <td>
                  <span className="rk-info-rank" style={{ color: getRankColor(tier.name) }}>
                    {t(`rankingInfo.tierNames.${tier.name}`)}
                  </span>
                </td>
                <td className="rk-info-icon">
                  <i className={getRankIcon(tier.name)} style={{ color: getRankColor(tier.name) }} />
                </td>
                <td>{t('rankingInfo.pointRange', { min: tier.min, max: tier.max ?? '∞' })}</td>
                <td>{tier.kFactor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rk-info-block">
        <h3>{t('rankingInfo.legendTitle')}</h3>
        <p>
          {t('rankingInfo.legendTextPrefix')}<span className="rank-legend">{t('rankingInfo.legendTextMid', { rank: t('rankingInfo.rankLegend') })}</span>{t('rankingInfo.legendTextSuffix')}
        </p>
      </div>

      <div className="rk-info-block">
        <h3>{t('rankingInfo.examplesTitle')}</h3>
        <p className="rk-info-subtitle">
          {t('rankingInfo.examplesSubtitle')}
        </p>
      </div>

      <div className="rk-info-examples">
        {EXAMPLES.map((ex) => (
          <ExampleCard key={ex.key} ex={ex} />
        ))}
      </div>
    </div>
  );
}

export default RankingInfo;
