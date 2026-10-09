import HorizontalRail from '../../components/HorizontalRail.jsx';
import SportIcon from '../../components/SportIcon.jsx';
import TournamentCard from './TournamentCard.jsx';

export default function Tournaments({ tournaments }) {
  return (
    <section className="tournaments" id="tournaments" aria-labelledby="tournaments-title">
      <header className="live-heading"><h2 id="tournaments-title"><SportIcon sport="trophy" className="tournament-trophy" />Tournaments</h2></header>
      <HorizontalRail className="tournament-scroll" label="Tournaments, scroll horizontally">
        {tournaments.map(event => <TournamentCard key={event.id} event={event} />)}
      </HorizontalRail>
    </section>
  );
}
