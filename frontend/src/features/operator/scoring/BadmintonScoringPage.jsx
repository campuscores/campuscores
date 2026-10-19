import SetScoringPage from './SetScoringPage.jsx';
import { badmintonFormat } from './scoringConfig.js';

/** Badminton: BWF set-model (games to 21, serve to the rally winner). */
export default function BadmintonScoringPage() {
  return <SetScoringPage sport="badminton" sportLabel="Badminton" unit="Game" format={badmintonFormat()} />;
}
