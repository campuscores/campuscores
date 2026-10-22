import { istDate, timeText } from '../../../../shared/time.mjs';
import useMutation from '../staff/useMutation.js';
import { SignInScreen } from '../manage/SetupStepPage.jsx';
import { dateText } from '../manage/manage.js';
import { isForbidden } from '../manage/setup.js';
import PendingInvitationsView from './PendingInvitationsView.jsx';
import usePagedList from './usePagedList.js';

/** Expiry as event-zone date and time text through shared/time.mjs, as on Invite scorer. */
const expiresText = expiresAt => {
  const ms = Date.parse(expiresAt);
  return Number.isNaN(ms) ? '' : `${dateText(istDate(ms))}, ${timeText(ms)}`;
};

/**
 * Pending invitations container (Req 6.3, 6.4, 6.6, 6.7). Reads `GET /api/admin/invitations` → `{ invitations:
 * [{ id, email, role, invitedBy, expiresAt }], nextOffset }`: PENDING and unexpired by database time, soonest expiry
 * first, 50 rows; "Load more" adds `?offset=`. Cancel sends `POST /api/invites/:id/cancel` with an optional
 * `{ reason }` → `{ invitation: { id, status: 'REVOKED' } }`, then reloads the list. 502 CLERK_UNAVAILABLE keeps the
 * invitation PENDING and the dialog open with "Try again"; 409 INVITE_CLOSED or 404 means it already closed, so the
 * list reloads behind the dialog, which keeps its message.
 */
export default function PendingInvitationsPage({ role, getToken, signInAgain }) {
  const list = usePagedList('/admin/invitations', 'invitations', getToken);
  const write = useMutation(getToken);
  const invitations = list.rows.map(row => ({ ...row, expires: expiresText(row.expiresAt) }));

  async function cancel(invitation, reason) {
    const result = await write.run(`/invites/${encodeURIComponent(invitation.id)}/cancel`, { body: reason ? { reason } : {} });
    if (result.ok || [404, 409].includes(result.error?.status)) list.reload();
    return result.ok;
  }

  if (list.error?.status === 401) {
    return <SignInScreen role={role} title="Pending invitations" current="home" error={list.error} signInAgain={signInAgain} onRetry={list.reload} />;
  }
  return (
    <PendingInvitationsView role={role} state={isForbidden(list.error) ? 'forbidden' : list.status} onRetry={list.reload}
      invitations={invitations} hasMore={list.hasMore} loadingMore={list.loadingMore} loadMoreError={list.moreError}
      onLoadMore={list.loadMore} onCancel={cancel} onReset={write.reset} onSignIn={signInAgain}
      saving={write.saving} error={write.error} />
  );
}
