import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import { messageFor, PHASE_LABELS, sportLabel, stageLabel, staffPhase } from '../staff/labels.js';
import MatchForm from './MatchForm.jsx';
import SportChoice from './SportChoice.jsx';
import { SaveRecovery } from './SetupDetailsView.jsx';
import { MATCH_FIELDS, alertFor } from './forms.js';
import { sidesText } from './manage.js';
import './manage.css';

/** Read-only summary of a Live, Final or Not scored match (Req 12.8, 14.3, 14.4). */
function Summary({ match }) {
  const phase = staffPhase(match);
  return (
    <>
      <dl className="facts">
        <div><dt>Status</dt><dd><span className="status" data-phase={phase}>{PHASE_LABELS[phase]}</span></dd></div>
        <div><dt>Match</dt><dd>{match.stage && `${stageLabel(match.stage)}: `}{sidesText(match)}</dd></div>
        <div><dt>When</dt><dd>{match.when}</dd></div>
        {match.venue && <div><dt>Venue</dt><dd>{match.venue}</dd></div>}
        {match.score && <div><dt>Score</dt><dd className="data-score">{match.score}</dd></div>}
        <div><dt>Scorer</dt><dd>{match.scorer?.name ?? 'No scorer'}</dd></div>
      </dl>
      <p>{phase === 'live' ? 'This match is live, so it cannot change.' : 'This match is over, so it cannot change.'}</p>
    </>
  );
}

/**
 * Match editor (Req 12.1 to 12.11, 14.3, 14.4): add a match, or change an Upcoming one (`match.canEdit`). Other
 * matches show a read-only summary. A new match needs `tournament` and `sport`; when the link did not name them,
 * `choices` (`[{ key, label }]`, one per Tournament_Sport in scope), `choice` and `onChoose(key)` pick one, and the
 * container then passes that sport's `tournament` and `teams`. `onSubmit(values)` saves; Delete (`match.canDelete`)
 * opens the dialog through `onRequestDelete()`, and `confirm` is true while it is open. `onDirty(true)` reports the first
 * change in the form (unsaved guard, Req 20.7); `onSignIn` opens the sign-in after a 401 on save (Req 20.8). State
 * 'empty' means no Tournament_Sport in scope can take a new match.
 */
export default function MatchEditorView({ role, state, onRetry, match, tournament, sport, teams = [], choices = [], choice, onChoose,
  today, zone, saving, error, status, onSubmit, confirm, onRequestDelete, onConfirm, onCancel, onDirty, onSignIn }) {
  if (state === 'forbidden') return <NoAccess role={role} />;
  const editable = !match || match.canEdit;
  return (
    <StaffShell role={role} title={match ? 'Edit match' : 'Add match'} current="matches" back={{ to: '/manage/matches', label: 'Matches' }}
      status={status} alert={confirm ? '' : alertFor(error, MATCH_FIELDS)}>
      <ScreenState state={state} what="the match" onRetry={onRetry} empty="No open tournament sport can take a new match. Add a sport to a draft or ongoing tournament first.">
        {!match && <SportChoice legend="Tournament and sport" choices={choices} value={choice} onChange={onChoose} />}
        {tournament && sport && <p>{sportLabel(sport)} · {tournament.name}</p>}
        {match && !editable && <Summary match={match} />}
        {editable && tournament && sport && (
          <div onChange={() => onDirty?.(true)}>
            <MatchForm id="save-match" key={match?.id ?? `${tournament.slug}-${sport}`} tournament={tournament} teams={teams} match={match} today={today} zone={zone}
              saving={saving} error={error} submitLabel="Save match" onSubmit={onSubmit} />
            <SaveRecovery error={error} onSignIn={onSignIn} formId="save-match" />
          </div>
        )}
        {match?.canDelete && (
          <p className="staff-section"><button type="button" className="button-text" onClick={onRequestDelete}>Delete match</button></p>
        )}
      </ScreenState>
      <ConfirmDialog open={Boolean(confirm)} title={match ? `Delete ${sidesText(match)}?` : ''} danger confirmLabel="Delete match" reason="optional"
        effects={['Removes the match from the schedule.', 'Removes its scorer assignment.', 'This cannot be undone.']}
        saving={saving} error={confirm ? messageFor(error) : null} onConfirm={onConfirm} onCancel={onCancel} />
    </StaffShell>
  );
}
