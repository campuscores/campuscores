import { useRef, useState } from 'react';
import SiteHeader from '../../components/SiteHeader.jsx';
import SportIcon from '../../components/SportIcon.jsx';
import SportSection from './SportSection.jsx';
import SportMatchDialog from './SportMatchDialog.jsx';
import { upcomingDates, pastDates } from './sportCalendar.js';
import './SportPage.css';

const byDate = (matches, date) => date === 'all' ? matches : matches.filter(match => match.date === date);

export default function SportPage({ sport, fixtures }) {
  const { scoring, liveMatches, upcomingMatches, pastMatches } = fixtures;
  const [upcomingDate, setUpcomingDate] = useState('all');
  const [pastDate, setPastDate] = useState('all');
  const [openMatch, setOpenMatch] = useState(null);
  const triggerRef = useRef(null);
  function open(match, trigger) { triggerRef.current = trigger; setOpenMatch(match); }
  // Explicit focus return: Safari does not focus a clicked button, so the dialog cannot restore it.
  function close() { setOpenMatch(null); triggerRef.current?.focus(); }
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
        <SportSection sport={sport} id="live" title="Live Matches" live matches={liveMatches} onOpen={open} />
        <SportSection sport={sport} id="upcoming" title="Upcoming Matches" matches={byDate(upcomingMatches, upcomingDate)} dates={upcomingDates} selectedDate={upcomingDate} onSelectDate={setUpcomingDate} onOpen={open} />
        <SportSection sport={sport} id="past" title="Past Matches" matches={byDate(pastMatches, pastDate)} dates={pastDates} selectedDate={pastDate} onSelectDate={setPastDate} onOpen={open} />
        {/* Inside <main> so the dialog inherits the sport texture custom properties. */}
        <SportMatchDialog sport={sport} scoring={scoring} match={openMatch} onClose={close} />
      </main>
    </>
  );
}
