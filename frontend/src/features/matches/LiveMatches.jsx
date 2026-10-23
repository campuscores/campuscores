import HorizontalRail from '../../components/HorizontalRail.jsx';
import LiveMatchCard from './LiveMatchCard.jsx';
import { sports } from '../../data/sports.js';

/** `notice`, when set, replaces the hidden match count with visible text in the same polite status region. */
export default function LiveMatches({ matches, selectedSport, notice, onOpen }) {
  const label = sports.find(sport => sport.id === selectedSport)?.label ?? 'All Sports';
  return (
    <section className="live-matches" aria-labelledby="live-matches-title">
      <header className="live-heading"><h2 id="live-matches-title"><span className="live-dot" aria-hidden="true" />Live Matches</h2></header>
      <p className={notice ? 'live-notice' : 'sr-only'} id="match-filter-status" role="status" aria-live="polite">{notice ?? `${label}: ${matches.length} live ${matches.length === 1 ? 'match' : 'matches'}.`}</p>
      <HorizontalRail id="live-match-results" className="match-scroll" label="Live matches, scroll horizontally" resetKey={selectedSport}>
        {matches.map(match => <LiveMatchCard key={match.id} match={match} onOpen={onOpen} />)}
      </HorizontalRail>
    </section>
  );
}
