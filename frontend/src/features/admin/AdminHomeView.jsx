import { Link } from 'react-router';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import { PHASE_LABELS, sportLabel } from '../staff/labels.js';
import { Cell, StaffTable } from './StaffTable.jsx';
import { matchName } from './adminText.js';
import './admin.css';

// API group key → staff Match_Phase marker (labels.js PHASE_LABELS), in the order of Requirement 8.2.
const GROUPS = [['live', 'live'], ['scheduled', 'scheduled'], ['final', 'final'], ['notScored', 'not-scored']];

/** "Showing 50 of 63." and a link to Matches when a group was cut at 50 rows (Req 8.4). */
function More({ group }) {
  if (!group || group.total <= group.items.length) return null;
  return (
    <div className="admin-more">
      <p className="staff-meta">Showing {group.items.length} of {group.total}.</p>
      <Link className="button-text" to="/manage/matches">See all {group.total} in Matches</Link>
    </div>
  );
}

/**
 * Admin home (Req 16.2): the Manager home "Today" and "Needs a scorer" sections across all tournaments, and the
 * count of pending invitations. Props only, shaped like `GET /api/manage/home` for a Super Admin:
 * `today` date text; `todayMatches: { live, scheduled, final, notScored }` and `needsScorer`, each `{ items, total }`
 * of staff match rows with display `date` and `time` text; `pendingInvitations` count.
 * `state` is 'loading', 'error', 'ready' or 'forbidden'; `sectionStates` ({ today, needsScorer }) marks a section that
 * failed while others loaded (Req 8.7). `onRetry` reloads.
 */
export default function AdminHomeView({ role = 'SUPER_ADMIN', state, sectionStates = {}, today, todayMatches = {}, needsScorer, pendingInvitations, onRetry }) {
  if (state === 'forbidden') return <NoAccess role={role} />;
  const stateOf = (key, hasRows) => {
    const own = state === 'ready' ? sectionStates[key] ?? 'ready' : state;
    return own === 'ready' && !hasRows ? 'empty' : own;
  };
  const todayState = stateOf('today', GROUPS.some(([key]) => todayMatches[key]?.items.length));
  const scorerState = stateOf('needsScorer', needsScorer?.items.length);
  return (
    <StaffShell role={role} title="Admin home" current="home">
      <div className="form-actions admin-top">
        <Link className="button-primary" to="/admin/staff/invite">Invite staff</Link>
        {state === 'ready' && <Link className="button-text" to="/admin/invitations">Pending invitations: {pendingInvitations ?? 0}</Link>}
      </div>

      <section className="staff-section">
        <h2>{today ? `Today, ${today}` : 'Today'}</h2>
        <ScreenState state={todayState} what="today's matches" empty="No matches are scheduled today." onRetry={onRetry}>
          {GROUPS.filter(([key]) => todayMatches[key]?.items.length).map(([key, phase]) => (
            <div className="admin-group" key={key}>
              <h3><span className="status" data-phase={phase}>{PHASE_LABELS[phase]}</span></h3>
              <StaffTable label={`${PHASE_LABELS[phase]} matches today`} headers={['Time', 'Match', 'Sport', 'Tournament']}>
                {todayMatches[key].items.map(match => (
                  <tr key={match.id}>
                    <Cell label="Time">{match.time}</Cell>
                    <Cell label="Match">{matchName(match)}</Cell>
                    <Cell label="Sport">{sportLabel(match.sport)}</Cell>
                    <Cell label="Tournament">{match.tournament.name}</Cell>
                  </tr>
                ))}
              </StaffTable>
              <More group={todayMatches[key]} />
            </div>
          ))}
        </ScreenState>
      </section>

      <section className="staff-section">
        <h2>Needs a scorer</h2>
        <p className="staff-meta">Upcoming matches in the next 7 days with no scorer.</p>
        <ScreenState state={scorerState} what="matches that need a scorer" empty="Every match in the next 7 days has a scorer." onRetry={onRetry}>
          <StaffTable label="Matches that need a scorer" headers={['Date', 'Time', 'Match', 'Sport', 'Tournament', <span className="sr-only">Action</span>]}>
            {needsScorer?.items.map(match => (
              <tr key={match.id}>
                <Cell label="Date">{match.date}</Cell>
                <Cell label="Time">{match.time}</Cell>
                <Cell label="Match">{matchName(match)}</Cell>
                <Cell label="Sport">{sportLabel(match.sport)}</Cell>
                <Cell label="Tournament">{match.tournament.name}</Cell>
                <td>
                  {match.canAssign && (
                    <Link className="button-text" to={`/manage/matches/${match.id}/scorer`}>
                      Assign scorer<span className="sr-only"> to {matchName(match)}</span>
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </StaffTable>
          <More group={needsScorer} />
        </ScreenState>
      </section>
    </StaffShell>
  );
}
