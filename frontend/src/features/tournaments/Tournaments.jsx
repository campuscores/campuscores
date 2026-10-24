import EmptyState from '../../components/EmptyState.jsx';
import HorizontalRail from '../../components/HorizontalRail.jsx';
import SportIcon from '../../components/SportIcon.jsx';
import TournamentCard from './TournamentCard.jsx';
import { RetryButton } from './TournamentView.jsx';

/**
 * The homepage tournament row. `notice` (loading or failed read) replaces the rail, with "Try again" when `onRetry`
 * is set; an empty list shows `empty` under the kept heading (Req 17.2, 17.11, 17.12).
 */
export default function Tournaments({ tournaments, empty, notice, onRetry }) {
  return (
    <section className="tournaments" id="tournaments" aria-labelledby="tournaments-title">
      <header className="live-heading"><h2 id="tournaments-title"><SportIcon sport="trophy" className="tournament-trophy" />Tournaments</h2></header>
      {notice
        ? <><p className="live-notice" role="status">{notice}</p><RetryButton onRetry={onRetry} /></>
        : tournaments.length || !empty
          ? <HorizontalRail className="tournament-scroll" label="Tournaments, scroll horizontally">
              {tournaments.map(event => <TournamentCard key={event.id} event={event} />)}
            </HorizontalRail>
          : <EmptyState asset="empty/home/tournaments-empty" title="No tournaments just yet">The next big showdown will appear right here.</EmptyState>}
    </section>
  );
}
