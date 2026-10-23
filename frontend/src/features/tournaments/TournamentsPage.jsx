import { apiBase } from '../../services/api.js';
import TournamentsView from './TournamentsView.jsx';
import { fixtureTournaments, usePublicRead } from './publicTournaments.js';

/** `/tournaments`: `GET /api/tournaments`, grouped by each tournament's API `phase`; Display_Fixtures without an API. */
export default function TournamentsPage() {
  const read = usePublicRead(apiBase ? '/tournaments' : null);
  if (!apiBase) return <TournamentsView tournaments={fixtureTournaments} />;
  return <TournamentsView tournaments={read.data?.tournaments} status={read.status} onRetry={read.reload} />;
}
