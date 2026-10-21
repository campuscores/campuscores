import { useState } from 'react';
import StaffShell from '../staff/StaffShell.jsx';
import { NoAccess } from '../staff/ScreenState.jsx';
import ErrorSummary from '../staff/ErrorSummary.jsx';
import Field from '../staff/Field.jsx';
import { messageFor } from '../staff/labels.js';
import RoleRadios from './RoleRadios.jsx';
import { emailError, ROLES } from './adminText.js';
import './admin.css';

/**
 * Invite staff (Req 6.5): email and any staff role, through the existing `POST /api/invites` contract.
 * `onSubmit({ email, role })` resolves `{ expires }` (display text) when the API accepted it, else a falsy value;
 * `saving` and `error` (the `apiFetch` error) belong to that request. `state` 'forbidden' shows the no-access screen.
 */
export default function InviteStaffView({ role = 'SUPER_ADMIN', state = 'ready', onSubmit, saving = false, error = null }) {
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [errors, setErrors] = useState({});
  const [summary, setSummary] = useState([]);
  const [notice, setNotice] = useState('');
  if (state === 'forbidden') return <NoAccess role={role} />;

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    const next = { email: emailError(email), role: inviteRole ? '' : 'Choose a role.' };
    setErrors(next);
    setSummary([next.email && { id: 'invite-email', message: next.email }, next.role && { id: 'invite-role', message: next.role }].filter(Boolean));
    if (next.email || next.role) return;
    setNotice('');
    const address = email.trim().toLowerCase();
    const sent = await onSubmit({ email: address, role: inviteRole });
    if (sent) {
      setNotice(`Invitation sent to ${address}. It expires on ${sent.expires}.`);
      setEmail('');
      setInviteRole('');
    }
  }

  return (
    <StaffShell role={role} title="Invite staff" current="staff" back={{ to: '/admin/staff', label: 'Staff' }}
      status={notice} alert={messageFor(error, 'email') ? null : messageFor(error)}>
      <ErrorSummary errors={summary} />
      <form className="staff-form" noValidate onSubmit={submit}>
        <Field id="invite-email" label="Email" help="The invitation is sent to this address. It stays valid for 7 days."
          type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={254}
          value={email} error={errors.email || messageFor(error, 'email')}
          onChange={event => { setEmail(event.target.value); if (!emailError(event.target.value)) setErrors({ ...errors, email: '' }); }}
          onBlur={() => setErrors({ ...errors, email: emailError(email) })} />
        <RoleRadios id="invite-role" legend="Role" roles={ROLES} value={inviteRole} error={errors.role}
          onChange={value => { setInviteRole(value); setErrors({ ...errors, role: '' }); }} />
        <div className="form-actions">
          <button type="submit" className="button-primary" aria-disabled={saving || undefined}>{saving ? 'Saving…' : 'Send invitation'}</button>
        </div>
      </form>
    </StaffShell>
  );
}
