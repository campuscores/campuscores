import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import { messageFor, sportLabel } from '../staff/labels.js';
import DataList from './DataList.jsx';
import TeamForm from './TeamForm.jsx';
import { TEAM_FIELDS, alertFor } from './forms.js';
import { isLocked, TEAM_SPORTS, tournamentNav, tournamentPath } from './manage.js';
import { RetrySave } from './SetupDetailsView.jsx';
import './manage.css';

/**
 * Teams of one Tournament_Sport (Req 11.1, 11.6 to 11.8). `teams` rows carry `locked` (a Live, Final or Not scored
 * match uses it: no Edit) and `used` (any match uses it: no Delete). `editing` is the team in the form, else the form
 * adds a team. `onAdd(values)`, `onEdit(team)`, `onSave(team, values)`, `onCancelEdit()`; `confirm` is the team
 * being deleted, with `onRequestDelete(team)`, `onConfirm(reason)` and `onCancel()`.
 * Optional: `onDirtyChange(dirty)` reports unsaved form values; `onSignInAgain` shows "Sign in again" after a 401.
 */
export default function TeamsView({ role, state, onRetry, tournament, sport, teams = [], editing, saving, error, status,
  onAdd, onEdit, onSave, onCancelEdit, confirm, onRequestDelete, onConfirm, onCancel, onDirtyChange, onSignInAgain }) {
  if (state === 'forbidden') return <NoAccess role={role} />;
  const name = sport ? sportLabel(sport) : 'Sport';
  const teamSport = TEAM_SPORTS.includes(sport);
  const locked = tournament && isLocked(tournament.status);
  const players = team => (!team.players?.length ? 'None' : teamSport ? `${team.players.length}` : team.players.map(player => player.name).join(', '));
  return (
    <StaffShell role={role} title={`${name} teams`} current={tournamentNav(role)} status={status}
      alert={confirm ? '' : alertFor(error, TEAM_FIELDS)}
      back={tournament && { to: `${tournamentPath(tournament.slug)}/sports/${sport}`, label: `${name} setup` }}>
      {error?.status === 401 && onSignInAgain && (
        <div className="page-actions"><button type="button" className="button-primary" onClick={onSignInAgain}>Sign in again</button></div>
      )}
      {tournament && !locked && (
        <section aria-labelledby="team-form">
          <h2 id="team-form">{editing ? `Edit ${editing.name}` : `Add a ${teamSport ? 'team' : 'player or pair'}`}</h2>
          {/* A new key per edited team, and after each added team, starts the form from that team's values. */}
          <TeamForm id="save-team" key={editing ? `edit-${editing.id}` : `add-${teams.length}`} sport={sport} team={editing} saving={saving} error={error}
            submitLabel={editing ? 'Save changes' : 'Add team'} onCancel={editing ? onCancelEdit : undefined} onDirtyChange={onDirtyChange}
            onSubmit={values => (editing ? onSave(editing, values) : onAdd(values))} />
          {!confirm && <RetrySave error={error} formId="save-team" />}
        </section>
      )}
      {locked && <p>This tournament is locked, so its teams cannot change.</p>}
      <section className="staff-section" aria-labelledby="team-list">
        <h2 id="team-list">{name} teams</h2>
        <ScreenState state={state} what="teams" empty={`No teams in ${name} yet. Add the first one above.`} onRetry={onRetry}>
          <DataList label={`${name} teams`} rows={teams} columns={[
            { label: 'Name', cell: team => team.name },
            { label: 'Branch', cell: team => team.branch || 'None' },
            { label: 'Year', cell: team => team.year ?? 'None' },
            { label: teamSport ? 'Players' : 'Player names', cell: players },
          ]} actions={team => !locked && <>
            {!team.locked && <button type="button" className="button-text" onClick={() => onEdit(team)}>Edit<span className="sr-only"> {team.name}</span></button>}
            {!team.used && <button type="button" className="button-text" onClick={() => onRequestDelete(team)}>Delete<span className="sr-only"> {team.name}</span></button>}
          </>} />
        </ScreenState>
      </section>
      <ConfirmDialog open={Boolean(confirm)} title={confirm ? `Delete ${confirm.name}?` : ''} danger confirmLabel="Delete team" reason="optional"
        effects={['Removes the team and its players from this sport.', 'This cannot be undone.']}
        saving={saving} error={confirm ? messageFor(error) : null} onConfirm={onConfirm} onCancel={onCancel} />
    </StaffShell>
  );
}
