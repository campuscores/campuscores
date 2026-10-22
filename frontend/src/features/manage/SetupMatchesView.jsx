import { useState } from 'react';
import { Link } from 'react-router';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import { sportLabel } from '../staff/labels.js';
import DataList from './DataList.jsx';
import { MATCH_FIELDS, alertFor } from './forms.js';
import MatchForm from './MatchForm.jsx';
import SportChoice from './SportChoice.jsx';
import { matchColumns, stageNames } from './matchColumns.jsx';
import { tournamentNav } from './manage.js';
import { stepBack, stepPath, stepTitle } from './setup.js';
import { SaveRecovery } from './SetupDetailsView.jsx';
import './manage.css';

/**
 * Guided_Setup step 4 (Req 9.1, 12.1 to 12.5): schedule matches per sport. `sports` is
 * `[{ sport, teams: [{ id, name }], matches: [staff match row] }]`; `today` is the current event date and `zone` the
 * event time zone label. `onAddMatch(sport, { date, time, stage, sideA, sideB, venue })`.
 * `onDirty(bool)`: true on the first change in the form, false when the sport changes (its form starts again), Req 20.7.
 */
export default function SetupMatchesView({ role, state, onRetry, tournament, sports = [], today, zone, saving, error, status, onAddMatch, onDirty, onSignIn }) {
  if (state === 'forbidden') return <NoAccess role={role} />;
  return (
    <StaffShell role={role} title={stepTitle(4)} current={tournamentNav(role)} back={stepBack(role, tournament?.slug, 4)}
      status={status} alert={alertFor(error, MATCH_FIELDS)}>
      <ScreenState state={state} what="the tournament" onRetry={onRetry}>
        {tournament && <MatchesStep tournament={tournament} sports={sports} today={today} zone={zone} saving={saving} error={error} onAddMatch={onAddMatch} onDirty={onDirty} onSignIn={onSignIn} />}
      </ScreenState>
    </StaffShell>
  );
}

function MatchesStep({ tournament, sports, today, zone, saving, error, onAddMatch, onDirty, onSignIn }) {
  const [sport, setSport] = useState(sports[0]?.sport);
  const entry = sports.find(item => item.sport === sport) ?? { teams: [], matches: [] };
  return <>
    <p>Add the matches you know now. You can add more matches at any time.</p>
    <SportChoice legend="Sport" value={sport} onChange={next => { setSport(next); onDirty?.(false); }} choices={sports.map(item => ({ key: item.sport, label: sportLabel(item.sport) }))} />
    <section className="staff-section" aria-labelledby="setup-add-match" onChange={() => onDirty?.(true)}>
      <h2 id="setup-add-match">Add a {sportLabel(sport)} match</h2>
      <MatchForm id="save-match" key={`${sport}-${entry.matches.length}`} tournament={tournament} teams={entry.teams} today={today} zone={zone}
        saving={saving} error={error} submitLabel="Save match" onSubmit={values => onAddMatch(sport, values)} />
      <SaveRecovery error={error} onSignIn={onSignIn} formId="save-match" />
    </section>
    <section className="staff-section" aria-labelledby="setup-matches">
      <h2 id="setup-matches">{sportLabel(sport)} matches</h2>
      {entry.matches.length
        ? <DataList label={`${sportLabel(sport)} matches`} rows={entry.matches} columns={matchColumns(stageNames(entry.matches), { status: false, scorer: false })} />
        : <p>No {sportLabel(sport)} matches yet.</p>}
    </section>
    <div className="staff-section">
      <Link className="button-secondary" to={stepPath(tournament.slug, 5)}>Continue to {stepTitle(5)}</Link>
    </div>
  </>;
}
