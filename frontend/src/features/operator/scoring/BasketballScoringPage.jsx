import PeriodScoringPage from './PeriodScoringPage.jsx';
import { basketballFormat } from './scoringConfig.js';

/** Basketball: FIBA period-model with 1/2/3-point baskets, fouls and substitutions (player-attributed). */
export default function BasketballScoringPage() {
  return <PeriodScoringPage sport="basketball" sportLabel="Basketball" format={basketballFormat()} labels={{ score: 'points', scoreVerb: 'Basket', foulOrCard: 'foul' }} />;
}
