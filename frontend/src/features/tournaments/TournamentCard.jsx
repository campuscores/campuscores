import { Link } from 'react-router';
import './TournamentCard.css';

export default function TournamentCard({ event }) {
  return (
    <Link className="tournament-card" to={`/tournaments/${event.id}`}>
      <div className="tournament-surface">
        <img src={`/assets/${event.image}`} alt={event.alt} width="1000" height="500" loading="lazy" decoding="async" style={{ objectPosition: event.position }} />
        <div className="tournament-details">
          <h3>{event.name}</h3>
          <p><time dateTime={event.start}>{event.startLabel}</time> – <time dateTime={event.end}>{event.endLabel}</time></p>
          <svg className="tournament-open" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6" /></svg>
        </div>
      </div>
    </Link>
  );
}
