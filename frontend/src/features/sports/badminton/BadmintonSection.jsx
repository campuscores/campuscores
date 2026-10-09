import HorizontalRail from '../../../components/HorizontalRail.jsx';
import BadmintonMatchCard from './BadmintonMatchCard.jsx';

/** One match section; optional date chips filter its cards in place. */
export default function BadmintonSection({ id, title, live, matches, dates, selectedDate = 'all', onSelectDate, onOpen }) {
  const dateLabel = dates?.find(day => day.date === selectedDate)?.label;
  const count = `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`;
  return (
    <section className="badminton-section" id={id} aria-labelledby={`${id}-title`}>
      <header className="live-heading"><h2 id={`${id}-title`}>{live && <span className="live-dot" aria-hidden="true" />}{title}</h2></header>
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
            {matches.map(match => <BadmintonMatchCard key={match.id} match={match} onOpen={onOpen} />)}
          </HorizontalRail>
        : <p className="badminton-empty" id={`${id}-results`}>No {title.toLowerCase()} {dateLabel ? `on ${dateLabel}` : 'right now'}.</p>}
    </section>
  );
}
