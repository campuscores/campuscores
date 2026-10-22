import { apiBase } from '../../services/api.js';
import useHomeCards from '../matches/useHomeCards.js';
import { toSportMatch } from './liveSportMatches.js';
import { useRef, useState } from 'react';
import SiteHeader from '../../components/SiteHeader.jsx';
import SportIcon from '../../components/SportIcon.jsx';
import SportSection from './SportSection.jsx';
import SportMatchDialog from './SportMatchDialog.jsx';
import { upcomingDates, pastDates } from './sportCalendar.js';
import { datesOf, forDisplay, sportPageMatches, usePublicRead } from '../tournaments/publicTournaments.js';
import { UNAVAILABLE } from '../tournaments/TournamentView.jsx';
import './SportPage.css';

const byDate = (matches, date) => date === 'all' ? matches : matches.filter(match => match.date === date);

/**
 * One sport across public tournaments. Live comes from the home-room cards. With an API, Upcoming and Past come from
 * `GET /api/sports/:sport/matches` grouped by each match's API `phase`, live cards merged in place, and date chips from
 * the read's India_Time dates (Req 17.3, 17.4, 17.16). Without an API, every section shows the Display_Fixtures.
 */
export default function SportPage({ sport, fixtures }) {
  const { cards, status } = useHomeCards();
  const read = usePublicRead(apiBase ? `/sports/${sport.id}/matches` : null);
  const realMatches = (cards ?? []).filter(c => c.sport === sport.id).map(toSportMatch);
  const listed = read.status === 'ready' ? sportPageMatches(read.data.matches, sport.id, cards).map(forDisplay) : [];
  const { scoring } = fixtures;
  const liveMatches = apiBase ? realMatches.filter(m => m.status === 'live') : fixtures.liveMatches;
  const pastMatches = apiBase ? listed.filter(m => m.phase === 'past') : fixtures.pastMatches;
  const upcomingMatches = apiBase ? listed.filter(m => m.phase === 'upcoming') : fixtures.upcomingMatches;
  // Upcoming and Past show the read's state; the Live section and the room status line stay as they were (Req 17.12).
  const notice = !apiBase || read.status === 'ready' ? undefined : read.status === 'loading' ? 'Loading matches…' : UNAVAILABLE;
  const retry = notice === UNAVAILABLE ? read.reload : undefined;
  const [upcomingDate, setUpcomingDate] = useState('all');
  const [pastDate, setPastDate] = useState('all');
  const [openMatch, setOpenMatch] = useState(null);
  const triggerRef = useRef(null);
  function open(match, trigger) { triggerRef.current = trigger; setOpenMatch(match); }
  // Explicit focus return: Safari does not focus a clicked button, so the dialog cannot restore it.
  function close() { setOpenMatch(null); triggerRef.current?.focus(); }
  const selectedMatch = apiBase && openMatch ? [...realMatches, ...listed].find(m => m.id === openMatch.id) ?? openMatch : openMatch;
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
        <SportSection sport={sport} id="upcoming" title="Upcoming Matches" matches={byDate(upcomingMatches, upcomingDate)} dates={apiBase ? datesOf(upcomingMatches) : upcomingDates} selectedDate={upcomingDate} onSelectDate={setUpcomingDate} notice={notice} onRetry={retry} onOpen={open} />
        <SportSection sport={sport} id="past" title="Past Matches" matches={byDate(pastMatches, pastDate)} dates={apiBase ? datesOf(pastMatches) : pastDates} selectedDate={pastDate} onSelectDate={setPastDate} notice={notice} onRetry={retry} onOpen={open} />
        {/* Inside <main> so the dialog inherits the sport texture custom properties. */}
        <SportMatchDialog sport={sport} scoring={selectedMatch?.scoring ?? scoring} match={selectedMatch} onClose={close} />
      </main>
    </>
  );
}
