import EmptyState from '../../components/EmptyState.jsx';
import HorizontalRail from '../../components/HorizontalRail.jsx';
import SiteHeader from '../../components/SiteHeader.jsx';
import SportIcon from '../../components/SportIcon.jsx';
import TournamentCard from './TournamentCard.jsx';
import { RetryButton, UNAVAILABLE } from './TournamentView.jsx';
import { toEventProp } from './venues.js';
import '../sports/SportPage.css';
import './TournamentPages.css';

const SECTIONS = [
  { phase: 'live', title: 'Live Tournaments', asset: 'tournaments-live-empty', empty: 'The arena is quiet for now', description: 'Live tournaments will appear here once play begins.' },
  { phase: 'upcoming', title: 'Upcoming Tournaments', asset: 'upcoming-tournaments-empty', empty: 'Nothing on the calendar yet', description: 'New tournaments will appear here when announced.' },
  { phase: 'past', title: 'Past Tournaments', asset: 'past-tournaments-empty', empty: 'History is waiting to be made', description: 'Completed tournaments will appear right here.' },
];

/**
 * Public Tournaments page: Live, Upcoming and Past rails grouped only by each tournament's API `phase` (Req 17.1, 17.16).
 * Props only, no API call. `status`: 'ready' | 'loading' | 'error'.
 */
export default function TournamentsView({ tournaments = [], status = 'ready', onRetry }) {
  const notice = status === 'loading' ? 'Loading tournaments…' : status === 'error' ? UNAVAILABLE : null;
  return (
    <>
      <SiteHeader />
      <main>
        <header className="sport-section sport-title"><h1><SportIcon sport="trophy" className="tournament-trophy" />Tournaments</h1></header>
        {SECTIONS.map(({ phase, title, asset, empty, description }) => {
          const events = tournaments.filter(tournament => tournament.phase === phase).map(toEventProp);
          return (
            <section key={phase} className="tournaments" id={`${phase}-tournaments`} aria-labelledby={`${phase}-tournaments-title`}>
              <header className="live-heading"><h2 id={`${phase}-tournaments-title`}>{phase === 'live' && <span className="live-dot" aria-hidden="true" />}{title}</h2></header>
              {notice
                ? <><p className="sport-empty" role="status">{notice}</p>{status === 'error' && <RetryButton onRetry={onRetry} />}</>
                : events.length
                  ? <HorizontalRail className="tournament-scroll" label={`${title}, scroll horizontally`}>
                      {events.map(event => <TournamentCard key={event.id} event={event} />)}
                    </HorizontalRail>
                  : <EmptyState asset={`empty/tournaments/${asset}`} title={empty}>{description}</EmptyState>}
            </section>
          );
        })}
      </main>
    </>
  );
}
