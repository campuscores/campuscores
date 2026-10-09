import { useRef, useState } from 'react';
import SiteHeader from '../../../components/SiteHeader.jsx';
import SportIcon from '../../../components/SportIcon.jsx';
import BadmintonSection from './BadmintonSection.jsx';
import BadmintonMatchDialog from './BadmintonMatchDialog.jsx';
import { liveMatches, upcomingMatches, pastMatches, upcomingDates, pastDates } from './badmintonMatches.js';
import './BadmintonPage.css';

const byDate = (matches, date) => date === 'all' ? matches : matches.filter(match => match.date === date);

export default function BadmintonPage() {
  const [upcomingDate, setUpcomingDate] = useState('all');
  const [pastDate, setPastDate] = useState('all');
  const [openMatch, setOpenMatch] = useState(null);
  const triggerRef = useRef(null);
  function open(match, trigger) { triggerRef.current = trigger; setOpenMatch(match); }
  // Explicit focus return: Safari does not focus a clicked button, so the dialog cannot restore it.
  function close() { setOpenMatch(null); triggerRef.current?.focus(); }
  return (
    <>
      <SiteHeader />
      <main className="badminton-page">
        <header className="badminton-section badminton-title"><h1><SportIcon sport="badminton" />Badminton</h1></header>
        <BadmintonSection id="live" title="Live Matches" live matches={liveMatches} onOpen={open} />
        <BadmintonSection id="upcoming" title="Upcoming Matches" matches={byDate(upcomingMatches, upcomingDate)} dates={upcomingDates} selectedDate={upcomingDate} onSelectDate={setUpcomingDate} onOpen={open} />
        <BadmintonSection id="past" title="Past Matches" matches={byDate(pastMatches, pastDate)} dates={pastDates} selectedDate={pastDate} onSelectDate={setPastDate} onOpen={open} />
      </main>
      <BadmintonMatchDialog match={openMatch} onClose={close} />
    </>
  );
}
