import { useParams } from 'react-router';
import { apiBase } from '../../services/api.js';
import TournamentView from './TournamentView.jsx';
import { fixtureTournament, usePublicRead } from './publicTournaments.js';

/** `/tournaments/:slug`: `GET /api/tournaments/:key` with the slug as key; Display_Fixtures without an API. */
export default function TournamentPage() {
  const { slug } = useParams();
  const read = usePublicRead(apiBase ? `/tournaments/${encodeURIComponent(slug)}` : null);
  if (!apiBase) {
    const tournament = fixtureTournament(slug);
    return <TournamentView tournament={tournament} status={tournament ? 'ready' : 'not-found'} />;
  }
  return <TournamentView tournament={read.data?.tournament} status={read.status} onRetry={read.reload} />;
}
