import { useLocation } from 'react-router';
import StaffShell from '../staff/StaffShell.jsx';
import { NoAccess } from '../staff/ScreenState.jsx';
import ErrorSummary from '../staff/ErrorSummary.jsx';
import Field from '../staff/Field.jsx';
import { tournamentRules, useForm } from './forms.js';
import { tournamentNav } from './manage.js';
import { recovery, stepBack, stepTitle } from './setup.js';
import './manage.css';
/**
 * "Try again" after a save got no response, 500 or 502 (Req 20.3): a submit button of the form `formId`, so it resends
 * the values now in the form through the form's own checks.
 */
export function RetrySave({ error, formId }) {
  if (recovery(error) !== 'retry' || !formId) return null;
  return <div className="page-actions"><button type="submit" form={formId} className="button-secondary">Try again</button></div>;
}
/**
 * Next to a failed Guided_Setup save: "Try again" (see RetrySave), "Sign in again" after a 401 (Req 20.8), or a reload
 * link when the account, scope or tournament changed (Req 20.9). The entered values stay, and nothing is resent until
 * the user submits again.
 */
export function SaveRecovery({ error, onSignIn, formId }) {
  const { pathname, search } = useLocation();
  const kind = recovery(error);
  if (kind === 'retry') return <RetrySave error={error} formId={formId} />;
  if (kind === 'signIn' && onSignIn) return <div className="page-actions"><button type="button" className="button-secondary" onClick={onSignIn}>Sign in again</button></div>;
  if (kind === 'reload') return <p><a className="button-text" href={`${pathname}${search}`}>Reload the page</a></p>;
  return null;
}
/**
 * Guided_Setup step 1 (Req 9.1, 9.4, 9.5): five fields; the end date defaults to the start date.
 * `onSubmit({ name, startsOn, endsOn, venue, description })` creates the Draft tournament. `onDirty(true)` reports the
 * first change (unsaved guard, Req 20.7); `onSignIn` opens the sign-in after a 401.
 */
export default function SetupDetailsView({ role, state = 'ready', saving, error, onSubmit, onDirty, onSignIn }) {
  const form = useForm({ name: '', startsOn: '', endsOn: '', venue: '', description: '' }, tournamentRules(), error);
  if (state === 'forbidden') return <NoAccess role={role} />;
  const save = form.submit(values => onSubmit({
    name: values.name.trim(),
    startsOn: values.startsOn,
    endsOn: values.endsOn || values.startsOn,
    venue: values.venue.trim(),
    description: values.description.trim(),
  }));
  return (
    <StaffShell role={role} title={stepTitle(1)} current={tournamentNav(role)} back={stepBack(role, null, 1)} alert={form.alert}>
      <p>Start with the name and dates. You can add sports, teams and matches in the next steps.</p>
      <form id="save-tournament" className="staff-form" noValidate onChange={() => onDirty?.(true)} onSubmit={event => (saving ? event.preventDefault() : save(event))}>
        <ErrorSummary errors={form.summary} />
        <Field label="Tournament name" autoComplete="off" maxLength={120} {...form.field('name')} />
        <Field type="date" label="Start date" {...form.field('startsOn')} />
        <Field type="date" label="End date" optional help="Leave empty for a one-day tournament." min={form.values.startsOn || undefined} {...form.field('endsOn')} />
        <Field label="Venue" optional autoComplete="off" maxLength={200} {...form.field('venue')} />
        <Field as="textarea" label="Description" optional rows={4} maxLength={1000} {...form.field('description')} />
        <div className="form-actions">
          <button type="submit" className="button-primary" aria-disabled={saving || undefined}>{saving ? 'Saving…' : 'Save and continue'}</button>
        </div>
      </form>
      <SaveRecovery error={error} onSignIn={onSignIn} formId="save-tournament" />
    </StaffShell>
  );
}
