import { useState } from 'react';
import { Link } from 'react-router';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import { messageFor, sportLabel, tournamentStatusLabel } from '../staff/labels.js';
import { formatSummary } from '../staff/formatSummary.js';
import DataList from './DataList.jsx';
import SportManagers from './SportManagers.jsx';
import { alertFor } from './forms.js';
import { datesText, isLocked, overviewBack, removeManagerDialog, tournamentNav, tournamentPath } from './manage.js';
import './manage.css';

// Allowed Tournament_Status changes (Req 9.9), keyed "from>to", with the confirmation text of each.
const CHANGES = {
  'DRAFT>ONGOING': { option: 'Ongoing', confirm: 'Publish tournament', title: name => `Publish ${name}?`,
    effects: ['Viewers can see the tournament and all its matches.', 'Assigned scorers can start each match from its scheduled time.'] },
  'ONGOING>COMPLETED': { option: 'Completed', confirm: 'Mark as completed', title: name => `Mark ${name} as completed?`,
    effects: ['Its details, sports, teams, matches and scorers can no longer change.', 'Viewers still see it with its results.'] },
  'COMPLETED>ONGOING': { option: 'Ongoing', confirm: 'Reopen tournament', title: name => `Reopen ${name}?`,
    effects: ['Managers can change its details, sports, teams, matches and scorers again.'] },
  'COMPLETED>ARCHIVED': { option: 'Archived', confirm: 'Archive tournament', title: name => `Archive ${name}?`,
    effects: ['Viewers can no longer see the tournament or its matches.', 'It stays locked. You can move it back to Completed later.'] },
  'ARCHIVED>COMPLETED': { option: 'Completed', confirm: 'Move to completed', title: name => `Move ${name} back to completed?`,
    effects: ['Viewers can see the tournament and its results again.', 'It stays locked.'] },
};
// A Draft is published with its own button, so the status form lists only the later changes.
const nextStatuses = status => (status === 'DRAFT' ? [] : Object.keys(CHANGES).filter(key => key.startsWith(`${status}>`)).map(key => key.split('>')[1]));
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The confirmation dialog props for the open request (one dialog per screen). */
function dialogFor(confirm, tournament, sports) {
  if (!confirm) return { title: '', effects: [] };
  if (confirm.kind === 'status') {
    const change = CHANGES[`${tournament.status}>${confirm.to}`];
    return { title: change.title(tournament.name), effects: change.effects, confirmLabel: change.confirm, reason: 'optional' };
  }
  if (confirm.kind === 'delete') {
    const sum = key => sports.reduce((total, sport) => total + (sport[key] ?? 0), 0);
    const published = tournament.status !== 'DRAFT'; // public results exist, so the API needs a reason
    return {
      title: `Delete ${tournament.name}?`, danger: true, confirmLabel: 'Delete tournament', reason: published ? 'required' : 'optional',
      effects: [`Removes ${count(sports.length, 'sport', 'sports')}, ${count(sum('teamCount'), 'team', 'teams')} and ${count(sum('matchCount'), 'match', 'matches')}.`,
        ...(published ? ['Removes every score and result. Viewers can no longer see the tournament or its matches.'] : []),
        'Removes every scorer assignment and sport manager of this tournament.', 'This cannot be undone.'],
    };
  }
  // The remove endpoint takes no reason, so the dialog asks for none (Req 20.4).
  return { ...removeManagerDialog(confirm.manager, tournament.name), reason: undefined };
}

/** "Sign in again" after a 401 and "Reload" after a 403, 404 or 409 (Req 20.8, 20.9). */
export function ErrorActions({ onSignIn, onReload }) {
  if (!onSignIn && !onReload) return null;
  return (
    <div className="page-actions">
      {onSignIn && <button type="button" className="button-secondary" onClick={onSignIn}>Sign in again</button>}
      {onReload && <button type="button" className="button-secondary" onClick={onReload}>Reload</button>}
    </div>
  );
}

/**
 * Tournament overview (Req 3.10, 3.15, 9.7 to 9.14). `isOwner` (Tournament_Owner or Super_Admin) shows the owner
 * controls; a Sport_Manager gets only their `sports` and no tournament control. `nextStep` is the first incomplete
 * Guided_Setup step. `confirm` is the open request: `{ kind: 'status', to }`, `{ kind: 'delete' }` or
 * `{ kind: 'removeManager', manager }`; `onRequest(request)` asks to open it, `onConfirm(reason)` sends it.
 * `onAddManager({ sport, email })` adds a Sport_Manager. `onSignIn` and `onReload`, when set, show those actions.
 */
export default function TournamentOverviewView({ role, state, onRetry, tournament, isOwner, nextStep, sports = [], saving, error, status,
  confirm, onRequest, onConfirm, onCancel, onAddManager, onSignIn, onReload }) {
  if (state === 'forbidden') return <NoAccess role={role} />;
  const dialog = tournament ? dialogFor(confirm, tournament, sports) : { title: '', effects: [] };
  return (
    <StaffShell role={role} title={tournament?.name ?? 'Tournament'} current={tournamentNav(role)} back={overviewBack(role)}
      status={status} alert={confirm ? '' : alertFor(error, ['email', 'sport'])}>
      <ErrorActions onSignIn={onSignIn} onReload={onReload} />
      <ScreenState state={state} what="the tournament" onRetry={onRetry}>
        {tournament && <Overview key={tournament.status} tournament={tournament} isOwner={isOwner} canDelete={role === 'SUPER_ADMIN'} nextStep={nextStep} sports={sports} saving={saving} error={error}
          onRequest={onRequest} onAddManager={onAddManager} />}
      </ScreenState>
      <ConfirmDialog open={Boolean(confirm)} {...dialog} saving={saving} error={confirm ? messageFor(error) : null} onConfirm={onConfirm} onCancel={onCancel} />
    </StaffShell>
  );
}

function Overview({ tournament, isOwner, canDelete, nextStep, sports, saving, error, onRequest, onAddManager }) {
  const { slug, status } = tournament;
  const locked = isLocked(status);
  const targets = nextStatuses(status);
  const [to, setTo] = useState(targets[0]);
  const addMatch = `/manage/matches/new?tournament=${encodeURIComponent(slug)}`;
  let primary;
  if (status === 'DRAFT' && isOwner) {
    primary = nextStep && nextStep !== 'scorers'
      ? <Link className="button-primary" to={`${tournamentPath(slug)}/setup`}>Continue setup</Link>
      : <button type="button" className="button-primary" onClick={() => onRequest({ kind: 'status', to: 'ONGOING' })}>Publish tournament</button>;
  } else if (!locked) {
    primary = <Link className="button-primary" to={addMatch}>Add match</Link>;
  } else if (!isOwner) {
    primary = <Link className="button-primary" to={`/manage/matches?tournament=${encodeURIComponent(slug)}`}>View matches</Link>;
  } // A locked tournament's owner gets "Change status" below as the Primary_Action.
  const managers = sports.flatMap(entry => (entry.managers ?? []).map(manager => ({ ...manager, sport: entry.sport })));
  return <>
    {primary && <div className="page-actions">{primary}</div>}
    <dl className="facts">
      <div><dt>Status</dt><dd>{tournamentStatusLabel(status)}</dd></div>
      <div><dt>Dates</dt><dd>{datesText(tournament.startsOn, tournament.endsOn)}</dd></div>
      {tournament.venue && <div><dt>Venue</dt><dd>{tournament.venue}</dd></div>}
    </dl>
    {tournament.description && <p>{tournament.description}</p>}
    {locked && <p>This tournament is {tournamentStatusLabel(status).toLowerCase()}, so only its status can change.</p>}

    <section className="staff-section" aria-labelledby="overview-sports">
      <h2 id="overview-sports">Sports</h2>
      {sports.length ? (
        <DataList label="Sports" rows={sports} rowKey={entry => entry.sport} columns={[
          { label: 'Sport', cell: entry => sportLabel(entry.sport) },
          { label: 'Format', cell: entry => formatSummary(entry.sport, entry.defaultFormat) },
          { label: 'Teams', cell: entry => entry.teamCount },
          { label: 'Matches', cell: entry => entry.matchCount },
        ]} actions={entry => <Link className="button-text" to={`${tournamentPath(slug)}/sports/${entry.sport}`}>Sport setup<span className="sr-only"> for {sportLabel(entry.sport)}</span></Link>} />
      ) : <p>No sports yet.</p>}
    </section>

    {isOwner && !locked && sports.length > 0 && (
      <SportManagers headingId="overview-managers" managers={managers} sports={sports.map(entry => entry.sport)}
        saving={saving} error={error} onAdd={onAddManager} onRemove={manager => onRequest({ kind: 'removeManager', manager })} />
    )}

    {isOwner && (
      <section className="staff-section" aria-labelledby="overview-owner">
        <h2 id="overview-owner">Tournament settings</h2>
        {!locked && <p><Link className="button-text" to={`${tournamentPath(slug)}/details`}>Edit details</Link></p>}
        {targets.length > 0 && (
          <form className="staff-form" onSubmit={event => { event.preventDefault(); onRequest({ kind: 'status', to }); }}>
            <fieldset>
              <legend>Change status</legend>
              <p className="field-help">Now: {tournamentStatusLabel(status)}.</p>
              <div className="choice-list">
                {targets.map(target => (
                  <label className="choice" key={target}>
                    <input type="radio" name="tournament-status" value={target} checked={to === target} onChange={() => setTo(target)} />
                    {CHANGES[`${status}>${target}`].option}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="form-actions">
              <button type="submit" className={locked ? 'button-primary' : 'button-secondary'}>Change status</button>
            </div>
          </form>
        )}
        {/* Only a Super Admin deletes a tournament, in any status (24 October 2026). */}
        {canDelete && (
          <p><button type="button" className="button-text" onClick={() => onRequest({ kind: 'delete' })}>Delete tournament</button></p>
        )}
      </section>
    )}
  </>;
}
