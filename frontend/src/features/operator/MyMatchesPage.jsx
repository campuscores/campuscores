import { useState } from 'react';
import SiteHeader from '../../components/SiteHeader.jsx';
import HorizontalRail from '../../components/HorizontalRail.jsx';
import OperatorMatchCard from './OperatorMatchCard.jsx';
import { assignedBy } from './operatorMatches.js';
import { upcomingDates } from '../sports/sportCalendar.js';
import './MyMatches.css';

const live = assignedBy('live');
const scheduled = assignedBy('scheduled');
const completed = assignedBy('completed');
// Only date chips with at least one scheduled match; avoids empty days that have no assignment.
const scheduledDates = upcomingDates.filter(day => scheduled.some(match => match.date === day.date));

/** One titled section with an optional date filter and a card rail. */
function Section({ id, title, live, matches, dates, selectedDate, onSelectDate, empty }) {
  const shown = dates && selectedDate !== 'all' ? matches.filter(match => match.date === selectedDate) : matches;
  const label = dates?.find(day => day.date === selectedDate)?.label;
  const count = `${shown.length} ${shown.length === 1 ? 'match' : 'matches'}`;
  return (
    <section className="sport-section" id={id} aria-labelledby={`${id}-title`}>
      <header className="live-heading"><h2 id={`${id}-title`}>{live && <span className="live-dot" aria-hidden="true" />}{title}</h2></header>
      {dates && (
        <div className="date-chips" role="group" aria-label={`Filter ${title.toLowerCase()} by date`}>
          {[{ date: 'all', label: 'All' }, ...dates].map(day => (
            <button key={day.date} className="date-chip" type="button" aria-pressed={selectedDate === day.date} aria-controls={`${id}-results`} onClick={() => onSelectDate(day.date)}>{day.label}</button>
          ))}
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">{title}{label && `, ${label}`}: {count}.</p>
      {shown.length
        ? <HorizontalRail id={`${id}-results`} className="match-scroll" label={`${title}, scroll horizontally`} resetKey={selectedDate}>
            {shown.map(match => <OperatorMatchCard key={`${match.sport}-${match.id}`} match={match} />)}
          </HorizontalRail>
        : <p className="sport-empty" id={`${id}-results`}>{label ? `No matches on ${label}.` : empty}</p>}
    </section>
  );
}

/** Match Operator dashboard: only this scorer's assigned matches, grouped by scoring state. */
export default function MyMatchesPage() {
  const [scheduledDate, setScheduledDate] = useState('all');
  const total = live.length + scheduled.length + completed.length;
  return (
    <>
      <SiteHeader />
      <main className="operator-page">
        <header className="sport-section operator-title">
          <h1>My Matches</h1>
          <p>Matches assigned to you to score.</p>
        </header>
        {total === 0
          ? <p className="sport-section sport-empty">No matches assigned to you right now.</p>
          : <>
              <Section id="op-live" title="Live" live matches={live} empty="No live matches right now." />
              <Section id="op-scheduled" title="Scheduled" matches={scheduled} dates={scheduledDates} selectedDate={scheduledDate} onSelectDate={setScheduledDate} empty="No scheduled matches right now." />
              <Section id="op-completed" title="Completed" matches={completed} empty="No submitted matches yet." />
            </>}
      </main>
    </>
  );
}
