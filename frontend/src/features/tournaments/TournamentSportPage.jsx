import { useParams } from 'react-router';
import { sports } from '../../data/sports.js';
import { apiBase } from '../../services/api.js';
import useHomeCards from '../matches/useHomeCards.js';
import { sportFixtures } from '../sports/sportFixtures.js';
import TournamentSportView from './TournamentSportView.jsx';
import { fixtureMatches, fixtureTournament, tournamentSportMatches, usePublicRead } from './publicTournaments.js';

/**
 * `/tournaments/:slug/:sport`: the sport's matches from `GET /api/tournaments/:key`, grouped by each match's API
 * `phase`, with live cards from the home room merged in place; Display_Fixtures without an API. An unknown sport, or
 * one the tournament does not have, is "Tournament not found".
 */
export default function TournamentSportPage() {
  const { slug, sport: sportId } = useParams();
  const sport = sports.find(entry => entry.id === sportId);
  const read = usePublicRead(apiBase && sport ? `/tournaments/${encodeURIComponent(slug)}` : null);
  const { cards } = useHomeCards();
  const tournament = !sport ? null : apiBase ? read.data?.tournament : fixtureTournament(slug);
  const listed = Boolean(tournament?.sports?.includes(sportId));
  const status = !sport || (!apiBase && !listed) ? 'not-found'
    : !apiBase ? 'ready'
    : read.status === 'ready' && !listed ? 'not-found' : read.status;
  const matches = status !== 'ready' ? [] : apiBase ? tournamentSportMatches(tournament, sportId, cards) : fixtureMatches(sportId, tournament.name);
  // key resets the date chips and the open dialog between tournaments and sports.
  return <TournamentSportView key={`${slug}/${sportId}`} sport={sport} tournament={tournament} matches={matches}
    scoring={sport && sportFixtures[sportId].scoring} status={status} onRetry={read.reload} />;
}
