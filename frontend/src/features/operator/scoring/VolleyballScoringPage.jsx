import SetScoringPage from './SetScoringPage.jsx';
import { volleyballFormat } from './scoringConfig.js';

/** Volleyball: FIVB set-model (best of 5 sets to 25, deciding 5th to 15, rally serve to the winner). */
export default function VolleyballScoringPage() {
  return <SetScoringPage sport="volleyball" sportLabel="Volleyball" unit="Set" format={volleyballFormat()} />;
}
