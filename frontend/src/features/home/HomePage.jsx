import useHomeCards from '../matches/useHomeCards.js';
import HorizontalRail from '../../components/HorizontalRail.jsx';
import LiveMatchCard from '../matches/LiveMatchCard.jsx';
import { useState } from 'react';
import SiteHeader from '../../components/SiteHeader.jsx';
import Hero from './Hero.jsx';
import SportsFilters from './SportsFilters.jsx';
import LiveMatches from '../matches/LiveMatches.jsx';
import Tournaments from '../tournaments/Tournaments.jsx';
import { sampleMatches } from '../matches/sampleMatches.js';
import { toMatchProp } from '../matches/liveCards.js';
import { sampleTournaments } from '../tournaments/sampleTournaments.js';
import { apiBase } from '../../services/api.js';
import './HomePage.css';

export default function HomePage() {
  const [selectedSport, setSelectedSport] = useState('all');
  const { cards: homeCards, status: liveStatus } = useHomeCards();
  const liveCards = homeCards?.filter(c => c.status !== 'APPROVED').map(toMatchProp) ?? null;
  const completed = homeCards?.filter(c => c.status === 'APPROVED').map(toMatchProp) ?? [];
  const unavailable = liveStatus === 'unavailable';
  const allMatches = !apiBase ? sampleMatches : unavailable ? [] : liveCards ?? [];
  const notice = !apiBase ? undefined : unavailable ? 'Live scores are unavailable right now.' : liveCards == null ? 'Connecting to live scores…' : undefined;
  const matches = selectedSport === 'all' ? allMatches : allMatches.filter(match => match.sport === selectedSport);
  return <><SiteHeader /><main><Hero /><SportsFilters selectedSport={selectedSport} onSelect={setSelectedSport} /><LiveMatches matches={matches} selectedSport={selectedSport} notice={notice} /><Tournaments tournaments={sampleTournaments} />{completed.length > 0 && <section className="live-matches" aria-labelledby="final-results-title"><header className="live-heading"><h2 id="final-results-title">Final Results</h2></header><HorizontalRail className="match-scroll" label="Final results, scroll horizontally">{completed.map(match => <LiveMatchCard key={match.id} match={match} />)}</HorizontalRail></section>}</main></>;
}
