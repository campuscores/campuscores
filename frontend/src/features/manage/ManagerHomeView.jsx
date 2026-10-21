import { Link } from 'react-router';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import { sportLabel, tournamentStatusLabel } from '../staff/labels.js';
import DataList from './DataList.jsx';
import { matchColumns, stageNames } from './matchColumns.jsx';
import { datesText, tournamentPath } from './manage.js';
import './manage.css';

// [API group, status marker, heading, empty sentence] in the order of Req 8.2.
const GROUPS = [
  ['live', 'live', 'Live', 'No match is live right now.'],
  ['scheduled', 'scheduled', 'Scheduled', 'No more matches are scheduled today.'],
  ['final', 'final', 'Final', 'No match has finished today.'],
  ['notScored', 'not-scored', 'Not scored', 'No match today is marked Not scored.'],
];

/** "Showing 50 of 63 matches." with a link to Matches when a group holds more than it shows (Req 8.4). */
function More({ group }) {
  if (group.total <= group.items.length) return null;
  return <p className="staff-meta">Showing {group.items.length} of {group.total} matches. <Link className="button-text" to="/manage/matches">See all matches</Link></p>;
}

/**
 * Manager home (Req 8). `data` is `GET /api/manage/home`: `{ today, tournaments, todayMatches: { live, scheduled,
 * final, notScored }, needsScorer }`, each group `{ items, total }`; `today` is the formatted current event date.
 * `state` is the whole screen: 'loading', 'error', 'empty' (no Manager_Scope), 'forbidden' or 'ready'.
 * `sections` sets one section's state ('loading' or 'error') so loaded sections stay (Req 8.7); `onRetry(section)`.
 */
export default function ManagerHomeView({ role, state, data, sections = {}, onRetry }) {
  if (state === 'forbidden') return <NoAccess role={role} />;
  const create = <Link className="button-primary" to="/manage/tournaments/new">Create tournament</Link>;
  if (state === 'empty') {
    return (
      <StaffShell role={role} title="Manager home" current="home">
        <p>You do not manage a tournament yet.</p>
        {create}
      </StaffShell>
    );
  }
  const ready = state === 'ready';
  const sectionState = (key, hasRows) => sections[key] ?? (!ready ? state : hasRows ? 'ready' : 'empty');
  // A failed section may have no data, so every read below falls back to an empty group.
  const group = key => data?.todayMatches?.[key] ?? { items: [], total: 0 };
  const needsScorer = data?.needsScorer ?? { items: [], total: 0 };
  const tournaments = data?.tournaments ?? [];
  const columns = matchColumns(stageNames([...GROUPS.flatMap(([key]) => group(key).items), ...needsScorer.items]), { status: false, scorer: false });
  return (
    <StaffShell role={role} title="Manager home" current="home">
      <div className="page-actions">{create}</div>

      <section className="staff-section" aria-labelledby="home-today">
        <h2 id="home-today">{data?.today ? `Today, ${data.today}` : 'Today'}</h2>
        <ScreenState state={sectionState('today', true)} what="today's matches" onRetry={() => onRetry('today')}>
          {GROUPS.map(([key, phase, title, empty]) => (
            <div className="list-group" key={key}>
              <h3><span className="status" data-phase={phase}>{title}</span></h3>
              {group(key).items.length ? <>
                <DataList label={`${title} matches today`} rows={group(key).items} columns={columns} />
                <More group={group(key)} />
              </> : <p>{empty}</p>}
            </div>
          ))}
        </ScreenState>
      </section>

      <section className="staff-section" aria-labelledby="home-scorer">
        <h2 id="home-scorer">Needs a scorer</h2>
        <p className="staff-meta">Matches in the next 7 days with no scorer.</p>
        <ScreenState state={sectionState('needsScorer', needsScorer.items.length > 0)} what="matches that need a scorer"
          empty="Every match in the next 7 days has a scorer." onRetry={() => onRetry('needsScorer')}>
          <DataList label="Matches that need a scorer" rows={needsScorer.items} columns={columns}
            actions={match => match.canAssign && <Link className="button-text" to={`/manage/matches/${match.id}/scorer`}>Assign scorer</Link>} />
          <More group={needsScorer} />
        </ScreenState>
      </section>

      <section className="staff-section" aria-labelledby="home-tournaments">
        <h2 id="home-tournaments">Your tournaments</h2>
        <ScreenState state={sectionState('tournaments', tournaments.length > 0)} what="your tournaments"
          empty="You do not manage a tournament yet." onRetry={() => onRetry('tournaments')}>
          <DataList label="Your tournaments" rows={tournaments} rowKey={t => t.slug} columns={[
            { label: 'Tournament', cell: t => <><Link className="button-text" to={tournamentPath(t.slug)}>{t.name}</Link>{t.isOwner && <span className="tag">Owner</span>}</> },
            { label: 'Status', cell: t => tournamentStatusLabel(t.status) },
            { label: 'Dates', cell: t => datesText(t.startsOn, t.endsOn) },
            { label: 'Sports', cell: t => t.sports.map(sportLabel).join(', ') || 'None yet' },
          ]} />
        </ScreenState>
      </section>
    </StaffShell>
  );
}
