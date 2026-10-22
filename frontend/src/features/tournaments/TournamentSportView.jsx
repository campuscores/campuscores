import { useRef, useState } from 'react';
import SiteHeader from '../../components/SiteHeader.jsx';
import SportIcon from '../../components/SportIcon.jsx';
import SportSection from '../sports/SportSection.jsx';
import SportMatchDialog from '../sports/SportMatchDialog.jsx';
import { TournamentNotFound, UNAVAILABLE } from './TournamentView.jsx';
import { datesOf, forDisplay } from './publicTournaments.js';
import '../sports/SportPage.css';
import './TournamentPages.css';

const byDate = (matches, date) => date === 'all' ? matches : matches.filter(match => match.date === date);

/**
 * One Tournament_Sport's matches, as the Sport page: Live, Upcoming and Past grouped only by each match's `phase`
 * (Req 17.1, 17.16). Props only, no API call. `matches` use the sport card shape (`toSportMatch`) with already
 * formatted `dateLabel` and `timeLabel`. `status`: 'ready' | 'loading' | 'error' | 'not-found'.
 */
export default function TournamentSportView({ sport, tournament, matches = [], scoring, status = 'ready', onRetry }) {
  const [upcomingDate, setUpcomingDate] = useState('all');
  const [pastDate, setPastDate] = useState('all');
  const [openMatch, setOpenMatch] = useState(null);
  const triggerRef = useRef(null);
  if (status === 'not-found') return <TournamentNotFound />;
  const shown = status === 'ready' ? matches.map(forDisplay) : [];
  const phase = name => shown.filter(match => match.phase === name);
  const upcoming = phase('upcoming');
  const past = phase('past');
  const notice = status === 'loading' ? 'Loading matches…' : status === 'error' ? UNAVAILABLE : undefined;
  const retry = status === 'error' ? onRetry : undefined;
  function open(match, trigger) { triggerRef.current = trigger; setOpenMatch(match); }
  // Explicit focus return: Safari does not focus a clicked button, so the dialog cannot restore it.
  function close() { setOpenMatch(null); triggerRef.current?.focus(); }
  const selected = openMatch && (shown.find(match => match.id === openMatch.id) ?? openMatch);
  const theme = {
    '--match-background': `url('/assets/${sport.id}-background.webp')`,
    '--match-background-phone': `url('/assets/${sport.id}-background-640.webp')`,
    '--sport-color': sport.color,
  };
  return (
    <>
      <SiteHeader />
      <main className="sport-page" style={theme}>
        <header className="sport-section sport-title"><h1><SportIcon sport={sport.id} /><span>{sport.label}{tournament?.name && ` · ${tournament.name}`}</span></h1></header>
        <SportSection sport={sport} id="live" title="Live Matches" live matches={phase('live')} notice={notice} onRetry={retry} onOpen={open} />
        <SportSection sport={sport} id="upcoming" title="Upcoming Matches" matches={byDate(upcoming, upcomingDate)} dates={datesOf(upcoming)} selectedDate={upcomingDate} onSelectDate={setUpcomingDate} notice={notice} onRetry={retry} onOpen={open} />
        <SportSection sport={sport} id="past" title="Past Matches" matches={byDate(past, pastDate)} dates={datesOf(past)} selectedDate={pastDate} onSelectDate={setPastDate} notice={notice} onRetry={retry} onOpen={open} />
        {/* Inside <main> so the dialog inherits the sport texture custom properties. */}
        <SportMatchDialog sport={sport} scoring={selected?.scoring ?? scoring} match={selected} onClose={close} />
      </main>
    </>
  );
}
