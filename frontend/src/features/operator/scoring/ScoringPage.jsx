import { createElement } from 'react';
import { Link, useParams } from 'react-router';
import SiteHeader from '../../../components/SiteHeader.jsx';
import { findAssignment } from '../operatorMatches.js';
import BadmintonScoringPage from './BadmintonScoringPage.jsx';
import TableTennisScoringPage from './TableTennisScoringPage.jsx';
import VolleyballScoringPage from './VolleyballScoringPage.jsx';
import TennisScoringPage from './TennisScoringPage.jsx';
import FootballScoringPage from './FootballScoringPage.jsx';
import BasketballScoringPage from './BasketballScoringPage.jsx';

// One scoring page per sport. The rest render a clear "coming soon" until their own page lands.
// Add a sport by importing its page and mapping its id here.
const pages = {
  badminton: BadmintonScoringPage,
  'table-tennis': TableTennisScoringPage,
  volleyball: VolleyballScoringPage,
  'lawn-tennis': TennisScoringPage,
  football: FootballScoringPage,
  basketball: BasketballScoringPage,
};

/** Resolve a match key (sport__id) to its sport-specific scoring page. */
export default function ScoringPage() {
  const { matchId } = useParams();
  const match = findAssignment(matchId);
  const page = match && pages[match.sport];
  if (page) return createElement(page);
  return (
    <>
      <SiteHeader />
      <main className="not-found">
        <h1>{match ? `${match.sport} scoring is coming soon` : 'Match not found'}</h1>
        <Link to="/operator/matches">Back to My Matches</Link>
      </main>
    </>
  );
}
