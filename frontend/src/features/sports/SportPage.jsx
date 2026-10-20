import { apiBase } from '../../services/api.js';
import useHomeCards from '../matches/useHomeCards.js';
import { toSportMatch } from './liveSportMatches.js';
import { useRef, useState } from 'react';
import SiteHeader from '../../components/SiteHeader.jsx';
import SportIcon from '../../components/SportIcon.jsx';
import SportSection from './SportSection.jsx';
import SportMatchDialog from './SportMatchDialog.jsx';
import { upcomingDates, pastDates } from './sportCalendar.js';
import './SportPage.css';

const byDate = (matches, date) => date === 'all' ? matches : matches.filter(match => match.date === date);

export default function SportPage({ sport, fixtures }) {
  const { cards, status } = useHomeCards();
  const realMatches = (cards ?? []).filter(c => c.sport === sport.id).map(toSportMatch);
  const { scoring } = fixtures;
  const liveMatches = apiBase ? realMatches.filter(m => m.status === 'live') : fixtures.liveMatches;
  const pastMatches = apiBase ? realMatches.filter(m => m.status === 'completed') : fixtures.pastMatches;
  const upcomingMatches = apiBase ? [] : fixtures.upcomingMatches;
  const actualDates = [...new Map(pastMatches.filter(m => m.date).map(m => [m.date, { date: m.date, label: m.dateLabel }])).values()];
  const [upcomingDate, setUpcomingDate] = useState('all');
  const [pastDate, setPastDate] = useState('all');
  const [openMatch, setOpenMatch] = useState(null);
  const triggerRef = useRef(null);
  function open(match, trigger) { triggerRef.current = trigger; setOpenMatch(match); }
  // Explicit focus return: Safari does not focus a clicked button, so the dialog cannot restore it.
  function close() { setOpenMatch(null); triggerRef.current?.focus(); }
  const selectedMatch = apiBase && openMatch ? realMatches.find(m => m.id === openMatch.id) ?? openMatch : openMatch;
  const theme = {
    '--match-background': `url('/assets/${sport.id}-background.webp')`,
    '--match-background-phone': `url('/assets/${sport.id}-background-640.webp')`,
    '--sport-color': sport.color,
  };
  return (
    <>
      <SiteHeader />
      <main className="sport-page" style={theme}>
        <header className="sport-section sport-title"><h1><SportIcon sport={sport.id} />{sport.label}</h1></header>
        {apiBase && (cards == null || status === 'unavailable') && <p className="sport-section" role="status">{status === 'unavailable' ? 'Live scores are unavailable right now.' : 'Connecting to live scores…'}</p>}
        <SportSection sport={sport} id="live" title="Live Matches" live matches={liveMatches} onOpen={open} />
        <SportSection sport={sport} id="upcoming" title="Upcoming Matches" matches={byDate(upcomingMatches, upcomingDate)} dates={apiBase ? undefined : upcomingDates} selectedDate={upcomingDate} onSelectDate={setUpcomingDate} onOpen={open} />
        <SportSection sport={sport} id="past" title="Past Matches" matches={byDate(pastMatches, pastDate)} dates={apiBase ? actualDates : pastDates} selectedDate={pastDate} onSelectDate={setPastDate} onOpen={open} />
        {/* Inside <main> so the dialog inherits the sport texture custom properties. */}
        <SportMatchDialog sport={sport} scoring={selectedMatch?.scoring ?? scoring} match={selectedMatch} onClose={close} />
      </main>
    </>
  );
}
