import { useState } from 'react';
import { Link } from 'react-router';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import ErrorSummary from '../staff/ErrorSummary.jsx';
import { accountStatusLabel, messageFor, roleLabel, sportLabel } from '../staff/labels.js';
import RoleRadios from './RoleRadios.jsx';
import TransferOwnerDialog from './TransferOwnerDialog.jsx';
import { personName, plural, ROLES } from './adminText.js';
import './admin.css';

/**
 * Staff member detail (Req 6.8–6.14): facts, owned tournaments with "Transfer ownership", sport scope, and the role
 * change, disable and re-enable controls. `member`: `{ id, name, email, role, status, owned: [{ slug, name }],
 * sportScope: [{ tournament: { slug, name }, sport }], activeAssignments }` from `GET /api/admin/staff/:id`.
 * An owner gets no role change or disable control; the API would refuse both (Req 6.13).
 * Handlers resolve truthy when the API accepted the request: `onChangeRole(role, reason)`, `onDisable(reason)`,
 * `onEnable()`, `onTransferOwner(tournament, email, reason)`. `saving` and `error` (the `apiFetch` error) belong to
 * the request in progress. `state` is 'loading', 'error', 'empty' (account gone), 'ready' or 'forbidden'.
 */
export default function StaffMemberView({ role = 'SUPER_ADMIN', state, member, onRetry, onChangeRole, onDisable, onEnable, onTransferOwner, saving = false, error = null }) {
  const [newRole, setNewRole] = useState('');
  const [roleError, setRoleError] = useState('');
  const [summary, setSummary] = useState([]);
  const [dialog, setDialog] = useState(null); // 'role' | 'disable'
  const [transferFor, setTransferFor] = useState(null);
  const [notice, setNotice] = useState('');
  if (state === 'forbidden') return <NoAccess role={role} />;
  const ready = state === 'ready' && member;
  const name = ready ? personName(member) : '';

  function requestRoleChange(event) {
    event.preventDefault();
    const problem = newRole ? '' : 'Choose a new role.';
    setRoleError(problem);
    setSummary(problem ? [{ id: 'member-role', message: problem }] : []);
    if (!problem) setDialog('role');
  }
  async function confirm(reason) {
    if (dialog === 'role' ? await onChangeRole(newRole, reason) : await onDisable(reason)) {
      setNotice(dialog === 'role' ? `${name} is now a ${roleLabel(newRole)}.` : `${name} is disabled.`);
      setDialog(null);
      setNewRole('');
    }
  }
  async function enable() {
    if (!saving && await onEnable()) setNotice(`${name} is active again.`);
  }
  async function transfer(email, reason) {
    if (await onTransferOwner(transferFor, email, reason)) {
      setNotice(`${email} now owns ${transferFor.name}.`);
      setTransferFor(null);
    }
  }

  const active = ready && member.status === 'ACTIVE';
  const owner = ready && member.owned.length > 0;
  const n = ready ? member.activeAssignments : 0;
  const losses = ready ? [
    n > 0 && `Their ${plural(n, 'active scorer assignment')} ${n === 1 ? 'is' : 'are'} removed.`,
    member.sportScope.length > 0 && 'They lose access to the sports they manage.',
  ].filter(Boolean) : [];
  const dialogProps = dialog === 'role'
    ? { title: `Change the role of ${name}?`, confirmLabel: 'Change role', reason: 'optional',
        effects: [`The role changes from ${roleLabel(member.role)} to ${roleLabel(newRole)}.`, ...losses] }
    : { title: `Disable ${name}?`, confirmLabel: 'Disable account', danger: true, reason: 'required',
        effects: ['They can no longer use staff pages.', ...losses, 'You can re-enable the account later. Removed assignments and sport access do not come back.'] };

  return (
    <StaffShell role={role} title={ready ? name : 'Staff member'} current="staff" back={{ to: '/admin/staff', label: 'Staff' }}
      status={notice} alert={dialog || transferFor ? null : messageFor(error)}>
      <ScreenState state={state} what="this staff account" empty="This staff account no longer exists." onRetry={onRetry}>
        {ready && (
          <>
            <section className="staff-panel">
              <dl className="admin-facts">
                <dt>Email</dt><dd>{member.email}</dd>
                <dt>Role</dt><dd>{roleLabel(member.role)}</dd>
                <dt>Status</dt><dd>{accountStatusLabel(member.status)}</dd>
                <dt>Active scorer assignments</dt><dd>{member.activeAssignments}</dd>
              </dl>
            </section>

            {(member.role !== 'MATCH_OPERATOR' || owner) && (
              <section className="staff-section">
                <h2>Owned tournaments</h2>
                {owner ? (
                  <ul className="staff-panel admin-rows">
                    {member.owned.map((tournament, i) => (
                      <li key={tournament.slug}>
                        <Link className="button-text" to={`/manage/tournaments/${tournament.slug}`}>{tournament.name}</Link>
                        {/* For an active owner, transferring is the next step, so the first one is the Primary_Action. */}
                        <button type="button" className={active && i === 0 ? 'button-primary' : 'button-secondary'} onClick={() => setTransferFor(tournament)}>
                          Transfer ownership<span className="sr-only"> of {tournament.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p>This account owns no tournaments.</p>}
              </section>
            )}

            {(member.role === 'TOURNAMENT_MANAGER' || member.sportScope.length > 0) && (
              <section className="staff-section">
                <h2>Sports managed</h2>
                {member.sportScope.length ? (
                  <ul className="staff-panel admin-rows">
                    {member.sportScope.map(({ tournament, sport }) => <li key={`${tournament.slug}/${sport}`}>{sportLabel(sport)} · {tournament.name}</li>)}
                  </ul>
                ) : <p>This account is not a sport manager in any tournament.</p>}
              </section>
            )}

            <section className="staff-section">
              <h2>Role and access</h2>
              {!active ? (
                <>
                  <p>This account is disabled. Re-enabling it restores staff sign-in with the same role. Removed assignments and sport access do not come back.</p>
                  <button type="button" className="button-primary" aria-disabled={saving || undefined} onClick={enable}>{saving ? 'Saving…' : 'Re-enable account'}</button>
                </>
              ) : owner ? (
                <p>Transfer ownership of {member.owned.map(tournament => tournament.name).join(', ')} first. Then you can change the role or disable the account.</p>
              ) : (
                <>
                  <ErrorSummary errors={summary} />
                  <form className="staff-form" noValidate onSubmit={requestRoleChange}>
                    <RoleRadios id="member-role" legend="New role" roles={ROLES.filter(value => value !== member.role)} value={newRole} error={roleError}
                      onChange={value => { setNewRole(value); setRoleError(''); }} />
                    <div className="form-actions">
                      <button type="submit" className="button-primary">Change role</button>
                    </div>
                  </form>
                  <p className="admin-more">
                    <button type="button" className="button-text" onClick={() => setDialog('disable')}>Disable account</button>
                  </p>
                </>
              )}
            </section>
          </>
        )}
      </ScreenState>
      <ConfirmDialog open={Boolean(dialog)} {...dialogProps} saving={saving} error={dialog ? messageFor(error) : null}
        onConfirm={confirm} onCancel={() => setDialog(null)} />
      <TransferOwnerDialog tournament={transferFor} owner={member} saving={saving} error={transferFor ? error : null}
        onConfirm={transfer} onCancel={() => setTransferFor(null)} />
    </StaffShell>
  );
}
