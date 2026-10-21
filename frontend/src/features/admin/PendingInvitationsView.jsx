import { useState } from 'react';
import { Link } from 'react-router';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import { messageFor, roleLabel } from '../staff/labels.js';
import { Cell, StaffTable } from './StaffTable.jsx';
import './admin.css';

// Cancel calls Clerk first; on 502 the invitation stays PENDING (Req 6.6).
const cancelMessage = error =>
  error?.code === 'CLERK_UNAVAILABLE' ? 'The sign-in service is unavailable. The invitation is still active.' : messageFor(error);

/**
 * Pending invitations (Req 6.3, 6.4, 6.6): PENDING, unexpired invitations, soonest expiry first, 50 per page.
 * `invitations`: `[{ id, email, role, invitedBy, expires }]` with `invitedBy` a display name and `expires` display text.
 * `onCancel(invitation, reason)` resolves truthy when the API accepted it; `saving` and `error` belong to that request.
 * `hasMore`, `loadingMore` and `onLoadMore` page the list. `state` is 'loading', 'error', 'ready' or 'forbidden'.
 */
export default function PendingInvitationsView({ role = 'SUPER_ADMIN', state, invitations = [], hasMore = false, loadingMore = false, onLoadMore, onRetry, onCancel, saving = false, error = null }) {
  const [target, setTarget] = useState(null);
  const [notice, setNotice] = useState('');
  if (state === 'forbidden') return <NoAccess role={role} />;
  async function cancelInvitation(reason) {
    if (await onCancel(target, reason)) {
      setNotice(`The invitation to ${target.email} is cancelled.`);
      setTarget(null);
    }
  }
  const listState = state === 'ready' && !invitations.length ? 'empty' : state;
  return (
    <StaffShell role={role} title="Pending invitations" current="home" back={{ to: '/admin', label: 'Admin home' }} status={notice}>
      <div className="form-actions admin-top">
        <Link className="button-primary" to="/admin/staff/invite">Invite staff</Link>
      </div>
      <section className="staff-section">
        <ScreenState state={listState} what="pending invitations" empty="No invitations are waiting to be accepted." onRetry={onRetry}>
          <StaffTable label="Pending invitations" headers={['Email', 'Role', 'Invited by', 'Expires', <span className="sr-only">Action</span>]}>
            {invitations.map(invitation => (
              <tr key={invitation.id}>
                <Cell title>{invitation.email}</Cell>
                <Cell label="Role">{roleLabel(invitation.role)}</Cell>
                <Cell label="Invited by">{invitation.invitedBy}</Cell>
                <Cell label="Expires">{invitation.expires}</Cell>
                <td>
                  <button type="button" className="button-text" onClick={() => setTarget(invitation)}>
                    Cancel invitation<span className="sr-only"> to {invitation.email}</span>
                  </button>
                </td>
              </tr>
            ))}
          </StaffTable>
          {hasMore && (
            <p className="admin-more">
              <button type="button" className="button-secondary" aria-disabled={loadingMore || undefined}
                onClick={() => { if (!loadingMore) onLoadMore(); }}>
                {loadingMore ? 'Loading more…' : 'Load more'}
              </button>
            </p>
          )}
        </ScreenState>
      </section>
      <ConfirmDialog open={Boolean(target)} title={`Cancel the invitation to ${target?.email ?? ''}?`}
        effects={['The link in the invitation email stops working.', 'You can invite this email again later.']}
        confirmLabel="Cancel invitation" danger reason="optional" saving={saving} error={target ? cancelMessage(error) : null}
        onConfirm={cancelInvitation} onCancel={() => setTarget(null)} />
    </StaffShell>
  );
}
