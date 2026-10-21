import { Link } from 'react-router';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import ErrorSummary from '../staff/ErrorSummary.jsx';
import Field from '../staff/Field.jsx';
import { messageFor, PHASE_LABELS, sportLabel, stageLabel, staffPhase } from '../staff/labels.js';
import { alertFor, emailRule, reasonRule, useForm } from './forms.js';
import { sidesText } from './manage.js';
import './manage.css';

/**
 * Assign scorer (Req 13.1 to 13.6, 13.8): give one match its Match_Scorer by exact email, or score it yourself.
 * A match that has a scorer needs a reason to change it. `match` is a staff match row; the form shows only while
 * `match.canAssign`. `onAssign({ email, reason })`, `onSelf({ reason })`; "Remove scorer" opens the dialog through
 * `onRequestRemove()`, `confirm` is true while it is open and `onConfirm(reason)` revokes. No window is sent.
 */
export default function AssignScorerView({ role, state, onRetry, match, saving, error, status, onAssign, onSelf,
  confirm, onRequestRemove, onConfirm, onCancel }) {
  if (state === 'forbidden') return <NoAccess role={role} />;
  return (
    <StaffShell role={role} title="Assign scorer" current="matches" back={{ to: '/manage/matches', label: 'Matches' }}
      status={status} alert={confirm ? '' : alertFor(error, ['email', 'reason'])}>
      <ScreenState state={state} what="the match" onRetry={onRetry}>
        {match && <>
          <dl className="facts">
            <div><dt>Match</dt><dd>{match.stage && `${stageLabel(match.stage)}: `}{sidesText(match)}</dd></div>
            <div><dt>Sport</dt><dd>{sportLabel(match.sport)} · {match.tournament?.name}</dd></div>
            <div><dt>When</dt><dd>{match.when}</dd></div>
            <div><dt>Status</dt><dd><span className="status" data-phase={staffPhase(match)}>{PHASE_LABELS[staffPhase(match)]}</span></dd></div>
            <div><dt>Scorer</dt><dd>{match.scorer ? `${match.scorer.name} (${match.scorer.email})` : 'No scorer'}</dd></div>
          </dl>
          {match.canAssign
            ? <AssignForm key={match.assignmentId ?? 'none'} match={match} saving={saving} error={error} onAssign={onAssign} onSelf={onSelf} onRequestRemove={onRequestRemove} />
            : <p>The scorer of this match cannot change now, because the match is over or the tournament is locked.</p>}
        </>}
      </ScreenState>
      <ConfirmDialog open={Boolean(confirm)} title={match?.scorer ? `Remove ${match.scorer.name} from this match?` : ''} danger reason="required"
        confirmLabel="Remove scorer" saving={saving} error={confirm ? messageFor(error) : null} onConfirm={onConfirm} onCancel={onCancel}
        effects={['The match has no scorer until you assign one.', 'Score actions they have not sent yet are refused.']} />
    </StaffShell>
  );
}

function AssignForm({ match, saving, error, onAssign, onSelf, onRequestRemove }) {
  const reassign = Boolean(match.scorer);
  const form = useForm({ email: '', reason: '' }, reassign ? { email: emailRule, reason: reasonRule } : { email: emailRule }, error);
  const reason = values => (reassign ? values.reason.trim() : undefined);
  const assign = form.submit(values => onAssign({ email: values.email.trim().toLowerCase(), reason: reason(values) }));
  const self = form.submit(values => onSelf({ reason: reason(values) }), reassign ? ['reason'] : []);
  const guard = handler => event => (saving ? event.preventDefault() : handler(event));
  return (
    <form className="staff-form staff-section" noValidate onSubmit={guard(assign)}>
      <h2>{reassign ? 'Change the scorer' : 'Choose a scorer'}</h2>
      <ErrorSummary errors={form.summary} />
      <Field type="email" label="Scorer email" help="The email of an active Match Scorer account." autoComplete="off" maxLength={254} {...form.field('email')} />
      {error?.code === 'SCORER_NOT_FOUND' && (
        <p><Link className="button-text" to={`/manage/invite?email=${encodeURIComponent(form.values.email.trim())}`}>Invite as Match Scorer</Link></p>
      )}
      {reassign && <Field as="textarea" label="Reason" rows={3} maxLength={500} help="Why the scorer changes. Only staff see it." {...form.field('reason')} />}
      <div className="form-actions">
        <button type="submit" className="button-primary" aria-disabled={saving || undefined}>{saving ? 'Saving…' : reassign ? 'Reassign scorer' : 'Assign scorer'}</button>
        <button type="button" className="button-secondary" aria-disabled={saving || undefined} onClick={guard(self)}>Score this match myself</button>
      </div>
      {reassign && <p><button type="button" className="button-text" onClick={onRequestRemove}>Remove scorer</button></p>}
    </form>
  );
}
