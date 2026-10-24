import { Link } from 'react-router';
import SiteHeader from '../../components/SiteHeader.jsx';
import { sports } from '../../data/sports.js';
import { toEventProp } from './venues.js';
import '../home/HomePage.css';
import '../sports/SportPage.css';
import './TournamentPages.css';

export const UNAVAILABLE = 'Scores are unavailable right now.';

/** 404 for a tournament route (Req 17.7); same frame as the site's page-not-found screen. */
export function TournamentNotFound() {
  return <><SiteHeader /><main className="not-found"><h1>Tournament not found</h1><Link to="/">Return home</Link></main></>;
}

/** "Try again" in the approved chip shape; shown only after a failed read (Req 17.12, 22.1). */
export function RetryButton({ onRetry }) {
  return onRetry ? <button type="button" className="date-chip public-retry" onClick={onRetry}>Try again</button> : null;
}

/**
 * One public tournament: facts and one tile link per Tournament_Sport (Req 17.1). Props only, no API call.
 * `tournament`: `{ slug, name, startsOn, endsOn, venue, description, sports: [sport key] }`.
 * `status`: 'ready' | 'loading' | 'error' | 'not-found'.
 */
export default function TournamentView({ tournament, status = 'ready', onRetry }) {
  if (status === 'not-found') return <TournamentNotFound />;
  const ready = status === 'ready';
  const event = ready ? toEventProp(tournament) : null;
  const tournamentSports = ready ? sports.filter(sport => tournament.sports.includes(sport.id)) : [];
  return (
    <>
      <SiteHeader />
      <main>
        <header className="sport-section sport-title">
          <h1><span>{ready ? tournament.name : 'Tournament'}</span></h1>
          {ready && (
            <dl className="tournament-facts">
              <div><dt>Dates</dt><dd><time dateTime={event.start}>{event.startLabel}</time> – <time dateTime={event.end}>{event.endLabel}</time></dd></div>
              {tournament.venue && <div><dt>Venue</dt><dd>{tournament.venue}</dd></div>}
            </dl>
          )}
          {ready && tournament.description && <p className="tournament-description">{tournament.description}</p>}
        </header>
        <section className="sport-section" aria-labelledby="tournament-sports-title">
          <header className="live-heading"><h2 id="tournament-sports-title">Sports</h2></header>
          {!ready
            ? <><p className="sport-empty" role="status">{status === 'loading' ? 'Loading tournament…' : UNAVAILABLE}</p>{status === 'error' && <RetryButton onRetry={onRetry} />}</>
            : tournamentSports.length
              ? <ul className="tournament-sports">
                  {tournamentSports.map(sport => (
                    <li key={sport.id}>
                      <Link className={`tournament-sport-link ${sport.id}`} to={`/tournaments/${tournament.slug}/${sport.id}`} style={{ '--sport-color': sport.color }}>
                        <img src={`/assets/tournament-sports/${sport.id}.webp`} srcSet={`/assets/tournament-sports/${sport.id}-320.webp 320w, /assets/tournament-sports/${sport.id}-640.webp 640w, /assets/tournament-sports/${sport.id}.webp 1254w`} sizes="(max-width: 767px) calc((100vw - 44px) / 2), (max-width: 1023px) calc((100vw - 80px) / 3), 390px" width="1254" height="1254" alt="" loading="lazy" decoding="async" /><span>{sport.label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              : <p className="sport-empty">No sports are listed for this tournament yet.</p>}
        </section>
      </main>
    </>
  );
}
