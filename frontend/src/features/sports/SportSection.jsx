import EmptyState from '../../components/EmptyState.jsx';
import { sportEmptyStates } from './sportEmptyStates.js';
import HorizontalRail from '../../components/HorizontalRail.jsx';
import SportMatchCard from './SportMatchCard.jsx';

/** One match section; optional date chips filter its cards in place. `notice` (loading or failed read) replaces chips and cards. */
export default function SportSection({ sport, id, title, live, matches, dates, selectedDate = 'all', onSelectDate, onOpen, notice, onRetry }) {
  const [emptyTitle, emptyDescription] = sportEmptyStates[sport.id][id];
  const dateLabel = dates?.find(day => day.date === selectedDate)?.label;
  const count = `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`;
  return (
    <section className="sport-section" id={id} aria-labelledby={`${id}-title`}>
      <header className="live-heading"><h2 id={`${id}-title`}>{live && <span className="live-dot" aria-hidden="true" />}{title}</h2></header>
      {notice ? <>
        <p className="sport-empty" role="status">{notice}</p>
        {onRetry && <button type="button" className="date-chip public-retry" onClick={onRetry}>Try again</button>}
      </> : <>
        {dates && (
          <div className="date-chips" role="group" aria-label={`Filter ${title.toLowerCase()} by date`}>
            {[{ date: 'all', label: 'All' }, ...dates].map(day => (
              <button key={day.date} className="date-chip" type="button" aria-pressed={selectedDate === day.date} aria-controls={`${id}-results`} onClick={() => onSelectDate(day.date)}>{day.label}</button>
            ))}
          </div>
        )}
        <p className="sr-only" role="status" aria-live="polite">{title}{dateLabel && `, ${dateLabel}`}: {count}.</p>
        {matches.length
          ? <HorizontalRail id={`${id}-results`} className="match-scroll" label={`${title}, scroll horizontally`} resetKey={selectedDate}>
              {matches.map(match => <SportMatchCard key={match.id} sport={sport} match={match} onOpen={onOpen} />)}
            </HorizontalRail>
          : dateLabel ? <p className="sport-empty" id={`${id}-results`}>No {title.toLowerCase()} on {dateLabel}.</p> : <EmptyState id={`${id}-results`} asset={`empty/sports/${sport.id}-${id}-empty`} title={emptyTitle}>{emptyDescription}</EmptyState>}
      </>}
    </section>
  );
}
