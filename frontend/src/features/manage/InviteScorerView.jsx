import StaffShell from '../staff/StaffShell.jsx';
import { NoAccess } from '../staff/ScreenState.jsx';
import ErrorSummary from '../staff/ErrorSummary.jsx';
import Field from '../staff/Field.jsx';
import { emailRule, useForm } from './forms.js';
import { homeBack } from './manage.js';
import { RetrySave } from './SetupDetailsView.jsx';
import './manage.css';

/**
 * Invite scorer (Req 7.1, 7.3, 13.4): a manager invites a Match_Scorer only, so the role is fixed text.
 * `initialEmail` comes from "Invite as Match Scorer" on Assign scorer. `sent` is `{ email, expires }` after a save,
 * with `expires` as formatted date and time text. `onSubmit({ email, role: 'MATCH_OPERATOR' })`. `onSignIn` shows
 * "Sign in again" after a 401 (Req 20.8); "Try again" resends after no response, a 500 or a 502 (Req 20.3).
 */
export default function InviteScorerView({ role, state = 'ready', initialEmail = '', saving, error, sent, onSubmit, onSignIn }) {
  const form = useForm({ email: initialEmail }, { email: emailRule }, error);
  if (state === 'forbidden') return <NoAccess role={role} />;
  const save = form.submit(values => onSubmit({ email: values.email.trim().toLowerCase(), role: 'MATCH_OPERATOR' }));
  return (
    <StaffShell role={role} title="Invite scorer" current={role === 'SUPER_ADMIN' ? 'staff' : 'invite'} back={homeBack(role)}
      status={sent && `Invitation sent to ${sent.email}. It expires on ${sent.expires}.`} alert={form.alert}>
      <p>The scorer gets an email with a sign-in link. After they accept, you can assign them to matches by this email.</p>
      <form id="invite-scorer" className="staff-form" noValidate onSubmit={event => (saving ? event.preventDefault() : save(event))}>
        <ErrorSummary errors={form.summary} />
        <Field type="email" label="Email" autoComplete="off" maxLength={254} {...form.field('email')} />
        <p><strong>Role:</strong> Match Scorer</p>
        <div className="form-actions">
          <button type="submit" className="button-primary" aria-disabled={saving || undefined}>{saving ? 'Saving…' : 'Send invitation'}</button>
        </div>
      </form>
      <RetrySave error={error} formId="invite-scorer" />
      {error?.status === 401 && onSignIn && <div className="page-actions"><button type="button" className="button-secondary" onClick={onSignIn}>Sign in again</button></div>}
    </StaffShell>
  );
}
