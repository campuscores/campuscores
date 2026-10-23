import useHomeCards from '../matches/useHomeCards.js';
import HorizontalRail from '../../components/HorizontalRail.jsx';
import LiveMatchCard from '../matches/LiveMatchCard.jsx';
import { useRef, useState } from 'react';
import { sports } from '../../data/sports.js';
import { toSportMatch } from '../sports/liveSportMatches.js';
import SportMatchDialog from '../sports/SportMatchDialog.jsx';
import '../sports/SportPage.css';
import SiteHeader from '../../components/SiteHeader.jsx';
import Hero from './Hero.jsx';
import SportsFilters from './SportsFilters.jsx';
import LiveMatches from '../matches/LiveMatches.jsx';
import Tournaments from '../tournaments/Tournaments.jsx';
import { sampleMatches } from '../matches/sampleMatches.js';
import { toMatchProp } from '../matches/liveCards.js';
import { sampleTournaments } from '../tournaments/sampleTournaments.js';
import { usePublicRead } from '../tournaments/publicTournaments.js';
import { UNAVAILABLE } from '../tournaments/TournamentView.jsx';
import { toEventProp } from '../tournaments/venues.js';
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
  // Tournament row: Live tournaments by the API `phase` only (Req 17.2, 17.16); Display_Fixtures without an API.
  const tournamentsRead = usePublicRead(apiBase ? '/tournaments' : null);
  const tournaments = !apiBase ? sampleTournaments : (tournamentsRead.data?.tournaments ?? []).filter(t => t.phase === 'live').map(toEventProp);
  const tournamentNotice = !apiBase || tournamentsRead.status === 'ready' ? undefined : tournamentsRead.status === 'loading' ? 'Loading tournaments…' : UNAVAILABLE;
  // Real home-room cards open the sport-page match dialog; the latest snapshot keeps it current. Fixtures stay static.
  const [openCard, setOpenCard] = useState(null);
  const triggerRef = useRef(null);
  const onOpen = apiBase ? (match, trigger) => { triggerRef.current = trigger; setOpenCard(homeCards?.find(c => c.id === match.id) ?? null); } : undefined;
  // Explicit focus return: Safari does not focus a clicked button, so the dialog cannot restore it.
  function close() { setOpenCard(null); triggerRef.current?.focus(); }
  const selectedCard = openCard ? homeCards?.find(c => c.id === openCard.id) ?? openCard : null;
  const selectedSportObj = selectedCard ? sports.find(s => s.id === selectedCard.sport) : null;
  const selectedMatch = selectedSportObj ? toSportMatch(selectedCard) : null;
  const dialogTheme = selectedSportObj ? { '--match-background': `url('/assets/${selectedSportObj.id}-background.webp')`, '--match-background-phone': `url('/assets/${selectedSportObj.id}-background-640.webp')`, '--sport-color': selectedSportObj.color } : undefined;
  const dialog = apiBase && <div style={dialogTheme}><SportMatchDialog sport={selectedSportObj ?? sports[0]} scoring={selectedMatch?.scoring} match={selectedMatch} onClose={close} /></div>;
  const tournamentsRow = <Tournaments tournaments={tournaments} empty={apiBase ? 'No tournaments are live right now.' : undefined} notice={tournamentNotice} onRetry={tournamentNotice === UNAVAILABLE ? tournamentsRead.reload : undefined} />;
  return <><SiteHeader /><main><Hero /><SportsFilters selectedSport={selectedSport} onSelect={setSelectedSport} /><LiveMatches matches={matches} selectedSport={selectedSport} notice={notice} onOpen={onOpen} />{tournamentsRow}{completed.length > 0 && <section className="live-matches" aria-labelledby="final-results-title"><header className="live-heading"><h2 id="final-results-title">Final Results</h2></header><HorizontalRail className="match-scroll" label="Final results, scroll horizontally">{completed.map(match => <LiveMatchCard key={match.id} match={match} onOpen={onOpen} />)}</HorizontalRail></section>}{dialog}</main></>;
}
