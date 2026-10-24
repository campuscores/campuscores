import '../matches/LiveMatchCard.css';

/** Side name with winner emphasis once a result exists. */
function SideName({ match, index }) {
  if (match.winner == null) return <span>{match.sides[index].name}</span>;
  const won = match.winner === index;
  return <span className={won ? 'is-winner' : 'is-loser'}>{match.sides[index].name}{won && <span className="sr-only"> (winner)</span>}</span>;
}

/** Side names around the header score, or VS before a match starts. */
export function Overview({ match }) {
  return <><SideName match={match} index={0} /><strong>{match.score ? match.score.join('–') : 'VS'}</strong><SideName match={match} index={1} /></>;
}

function stateLine(match) {
  if (match.status === 'live') return match.clock;
  if (match.status === 'ended') return `Ended · ${match.sides[match.winner].name} won`;
  if (match.status === 'completed') return match.winner == null ? 'Result recorded' : `${match.sides[match.winner].name} won`;
  if (match.status === 'not-scored') return `Not scored · ${match.dateLabel} · ${match.tournament}`;
  return `${match.dateLabel} · ${match.timeLabel} · ${match.tournament}`;
}

/** Header-only scorecard; activating it opens the full match details. */
export default function SportMatchCard({ sport, match, onOpen }) {
  const headingId = `${sport.id}-${match.id}`;
  return (
    <article className="match-card sport-card" data-status={match.status} data-date={match.date} data-match-id={match.id} aria-labelledby={headingId}>
      <div className="match-surface">
        <h3 id={headingId}>
          <button type="button" className="sport-card-open" aria-haspopup="dialog" onClick={event => onOpen(match, event.currentTarget)}>
            <span className="match-header">
              <span className="match-meta has-stage"><span>{sport.label}</span><span className="match-stage">{match.round || 'Match'}</span><span>{match.tournament}</span></span>
              <span className="match-overview"><Overview match={match} /></span>
              <span className="match-clock">{stateLine(match)}</span>
            </span>
          </button>
        </h3>
      </div>
    </article>
  );
}
