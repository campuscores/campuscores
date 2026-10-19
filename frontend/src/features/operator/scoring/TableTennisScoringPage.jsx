import SetScoringPage from './SetScoringPage.jsx';
import { tableTennisFormat } from './scoringConfig.js';

/** Table tennis: ITTF set-model (games to 11, serve swaps every 2 points, every 1 at deuce). */
export default function TableTennisScoringPage() {
  return <SetScoringPage sport="table-tennis" sportLabel="Table Tennis" unit="Game" format={tableTennisFormat()} />;
}
