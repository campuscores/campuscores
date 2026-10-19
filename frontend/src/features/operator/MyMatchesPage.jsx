import { useEffect, useState } from 'react';
import HorizontalRail from '../../components/HorizontalRail.jsx';
import { apiFetch } from '../../services/api.js';
import OperatorMatchCard from './OperatorMatchCard.jsx';
import { dayOf, sectionOf } from './operatorMatches.js';
import './MyMatches.css';
/** One titled section with an optional date filter and a card rail. */
function Section({ id, title, live, matches, dates, selectedDate, onSelectDate, empty }) {
  const shown = dates && selectedDate !== 'all' ? matches.filter(match => dayOf(match.scheduledAt)?.date === selectedDate) : matches;
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
            {shown.map(match => <OperatorMatchCard key={match.id} match={match} />)}
          </HorizontalRail>
        : <p className="sport-empty" id={`${id}-results`}>{label ? `No matches on ${label}.` : empty}</p>}
    </section>
  );
}
/** Match Operator dashboard: the caller's active assignments from GET /api/operator/matches (Req 19.1). */
export default function MyMatchesPage({ getToken }) {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState(null);
  const [scheduledDate, setScheduledDate] = useState('all');
  useEffect(() => {
    let stopped = false;
    (async () => apiFetch('/operator/matches', { token: await getToken() }))().then(
      data => { if (!stopped) setMatches(data?.matches ?? []); },
      err => { if (!stopped) setError(err); },
    );
    return () => { stopped = true; };
  }, [getToken]);
  const by = section => (matches ?? []).filter(match => sectionOf(match) === section);
  const scheduled = by('scheduled');
  // Chips only for days that have a scheduled match, in schedule order (the API sorts by scheduled time).
  const scheduledDates = [...new Map(scheduled.map(match => dayOf(match.scheduledAt)).filter(Boolean).map(day => [day.date, day])).values()];
  return (
    <main className="operator-page">
      <header className="sport-section operator-title">
        <h1>My Matches</h1>
        <p>Matches assigned to you to score.</p>
      </header>
      {error ? <p className="sport-section text-error" role="alert">{error.status === 403
          ? 'Only event staff have assigned matches. Ask a Tournament Manager for an invitation.'
          : `Could not load your matches: ${error.message}. Reload the page to try again.`}</p>
        : !matches ? <p className="sport-section sport-empty" role="status">Loading your matches…</p>
        : matches.length === 0 ? <p className="sport-section sport-empty">No matches assigned to you right now.</p>
        : <>
            <Section id="op-live" title="Live" live matches={by('live')} empty="No live matches right now." />
            <Section id="op-scheduled" title="Scheduled" matches={scheduled} dates={scheduledDates} selectedDate={scheduledDate} onSelectDate={setScheduledDate} empty="No scheduled matches right now." />
            <Section id="op-completed" title="Completed" matches={by('completed')} empty="No submitted matches yet." />
          </>}
    </main>
  );
}
