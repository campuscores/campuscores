import { Link } from 'react-router';
import SportIcon from '../../components/SportIcon.jsx';
import { dayOf, sectionOf, sideName, sportLabel, stageLabel } from './operatorMatches.js';
import '../matches/LiveMatchCard.css';
const rejectedByOperator = match => match.status === 'REJECTED' && match.correctionRoute === 'OPERATOR';
function actionLabel(match, section) {
  if (rejectedByOperator(match)) return 'Fix and resubmit';
  return { live: 'Continue scoring', scheduled: 'Start scoring', completed: 'View match' }[section];
}
function stateLine(match) {
  if (match.status === 'LIVE') return 'Live';
  if (rejectedByOperator(match)) return 'Returned for correction';
  if (match.status === 'SCHEDULED') {
    const day = dayOf(match.scheduledAt);
    return day ? `${day.label} · ${day.time}` : 'Time not set';
  }
  if (match.status === 'PENDING_APPROVAL') return 'Submitted · awaiting approval';
  if (match.status === 'APPROVED') return 'Approved';
  return 'A manager is correcting the result'; // REJECTED/MANAGER
}
/** One assigned match from GET /api/operator/matches: textured header, meta, sides, status, then the scoring action. */
export default function OperatorMatchCard({ match }) {
  const section = sectionOf(match);
  const headingId = `op-match-${match.id}`;
  const theme = { '--match-background': `url('/assets/${match.sport}-background.webp')`, '--match-background-phone': `url('/assets/${match.sport}-background-640.webp')` };
  const action = actionLabel(match, section);
  return (
    <article className="match-card operator-card" data-status={match.status} data-state={section} data-match-id={match.id} style={theme} aria-labelledby={headingId}>
      <div className="match-surface">
        <header className="match-header">
          <div className="match-meta"><span className="operator-sport"><SportIcon sport={match.sport} className="operator-sport-icon" />{sportLabel(match.sport)}</span><span>{stageLabel(match)}</span></div>
          <h3 className="match-overview" id={headingId}><span>{sideName(match, 0)}</span><strong>VS</strong><span>{sideName(match, 1)}</span></h3>
          <p className="match-clock">{stateLine(match)}</p>
        </header>
        <div className="operator-foot">
          <p className="operator-venue">{match.venue}</p>
          <Link className="operator-score-link" to={`/operator/matches/${match.id}/score`} data-state={section} aria-label={`${action}: ${sportLabel(match.sport)}, ${sideName(match, 0)} versus ${sideName(match, 1)}`}>
            {action}
          </Link>
        </div>
      </div>
    </article>
  );
}
