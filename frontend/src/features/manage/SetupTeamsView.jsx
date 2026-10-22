import { useState } from 'react';
import { Link } from 'react-router';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import { sportLabel } from '../staff/labels.js';
import { TEAM_FIELDS, alertFor } from './forms.js';
import SportChoice from './SportChoice.jsx';
import TeamForm from './TeamForm.jsx';
import { tournamentNav } from './manage.js';
import { stepBack, stepPath, stepTitle } from './setup.js';
import { SaveRecovery } from './SetupDetailsView.jsx';
import './manage.css';

/**
 * Guided_Setup step 3 (Req 9.1, 11.1, 11.6): add teams or players to each sport. `sports` is
 * `[{ sport, teams: [{ id, name }] }]`; `onAddTeam(sport, { name, branch, year, players })`. `status` names the saved team.
 * `onDirty(bool)` reports whether the team form has unsaved values (TeamForm `onDirtyChange`), Req 20.7.
 */
export default function SetupTeamsView({ role, state, onRetry, tournament, sports = [], saving, error, status, onAddTeam, onDirty, onSignIn }) {
  if (state === 'forbidden') return <NoAccess role={role} />;
  return (
    <StaffShell role={role} title={stepTitle(3)} current={tournamentNav(role)} back={stepBack(role, tournament?.slug, 3)}
      status={status} alert={alertFor(error, TEAM_FIELDS)}>
      <ScreenState state={state} what="the tournament" onRetry={onRetry}>
        {tournament && <TeamsStep tournament={tournament} sports={sports} saving={saving} error={error} onAddTeam={onAddTeam} onDirty={onDirty} onSignIn={onSignIn} />}
      </ScreenState>
    </StaffShell>
  );
}

function TeamsStep({ tournament, sports, saving, error, onAddTeam, onDirty, onSignIn }) {
  const [sport, setSport] = useState(sports[0]?.sport);
  const teams = sports.find(entry => entry.sport === sport)?.teams ?? [];
  return <>
    <p>Add each team or player with a name. Details such as branch, year and players are optional.</p>
    <SportChoice legend="Sport" value={sport} onChange={setSport} choices={sports.map(entry => ({ key: entry.sport, label: sportLabel(entry.sport) }))} />
    <section className="staff-section" aria-labelledby="setup-add-team">
      <h2 id="setup-add-team">Add to {sportLabel(sport)}</h2>
      {/* A new key after each saved team clears the form for the next one. */}
      <TeamForm id="save-team" key={`${sport}-${teams.length}`} sport={sport} saving={saving} error={error} submitLabel="Add team"
        onSubmit={values => onAddTeam(sport, values)} onDirtyChange={onDirty} />
      <SaveRecovery error={error} onSignIn={onSignIn} formId="save-team" />
    </section>
    <section className="staff-section" aria-labelledby="setup-teams">
      <h2 id="setup-teams">{sportLabel(sport)} teams</h2>
      {teams.length ? <ul className="plain-list">{teams.map(team => <li key={team.id}>{team.name}</li>)}</ul> : <p>No teams in {sportLabel(sport)} yet.</p>}
    </section>
    <div className="staff-section">
      <Link className="button-secondary" to={stepPath(tournament.slug, 4)}>Continue to {stepTitle(4)}</Link>
    </div>
  </>;
}
