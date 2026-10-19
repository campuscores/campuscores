import { Link } from 'react-router';
import { sports } from '../../data/sports.js';
import SportIcon from '../../components/SportIcon.jsx';
import '../matches/LiveMatchCard.css';

const sportLabel = id => sports.find(sport => sport.id === id)?.label ?? id;

/** Side names around the score, or VS before a match starts. */
function Overview({ match }) {
  const name = index => {
    if (match.winner == null) return <span>{match.sides[index].name}</span>;
    const won = match.winner === index;
    return <span className={won ? 'is-winner' : 'is-loser'}>{match.sides[index].name}{won && <span className="sr-only"> (winner)</span>}</span>;
  };
  return <><>{name(0)}</><strong>{match.score ? match.score.join('–') : 'VS'}</strong><>{name(1)}</></>;
}

const action = { live: 'Continue scoring', scheduled: 'Start scoring', completed: 'View match' };

function stateLine(match) {
  if (match.state === 'live') return match.status === 'ended' ? `Ended · ${match.sides[match.winner].name} won · submit result` : match.clock;
  if (match.state === 'completed') return `Submitted · ${match.sides[match.winner].name} won`;
  return `${match.dateLabel} · ${match.timeLabel}`;
}

/** One assigned match: textured header, meta, score/VS, status, then the scoring action. */
export default function OperatorMatchCard({ match }) {
  const headingId = `op-${match.key}`;
  const theme = { '--match-background': `url('/assets/${match.sport}-background.webp')`, '--match-background-phone': `url('/assets/${match.sport}-background-640.webp')` };
  return (
    <article className="match-card operator-card" data-status={match.status} data-state={match.state} data-date={match.date} data-match-id={match.key} style={theme} aria-labelledby={headingId}>
      <div className="match-surface">
        <header className="match-header">
          <div className="match-meta"><span className="operator-sport"><SportIcon sport={match.sport} className="operator-sport-icon" />{sportLabel(match.sport)}</span><span>{match.round}</span></div>
          <h3 className="match-overview" id={headingId}><Overview match={match} /></h3>
          <p className="match-clock">{stateLine(match)}</p>
        </header>
        <div className="operator-foot">
          <p className="operator-venue">{match.venue}</p>
          <Link className="operator-score-link" to={`/operator/matches/${match.key}/score`} data-state={match.state} aria-label={`${action[match.state]}: ${sportLabel(match.sport)}, ${match.sides[0].name} versus ${match.sides[1].name}`}>
            {action[match.state]}
          </Link>
        </div>
      </div>
    </article>
  );
}
