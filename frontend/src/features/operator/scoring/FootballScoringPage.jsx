import PeriodScoringPage from './PeriodScoringPage.jsx';
import { footballFormat } from './scoringConfig.js';

/** Football: IFAB period-model with goals, yellow/red cards and substitutions (player-attributed). */
export default function FootballScoringPage() {
  return <PeriodScoringPage sport="football" sportLabel="Football" format={footballFormat()} labels={{ score: 'goals', scoreVerb: 'Goal', foulOrCard: 'card' }} />;
}
