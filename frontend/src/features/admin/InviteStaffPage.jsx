import { useState } from 'react';
import { istDate, timeText } from '../../../../shared/time.mjs';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import useMutation from '../staff/useMutation.js';
import useUnsavedGuard from '../staff/useUnsavedGuard.js';
import { dateText } from '../manage/manage.js';
import InviteStaffView from './InviteStaffView.jsx';

/*
 * Invite staff at `/admin/staff/invite` (Req 6.5). Sends the existing POST /invites { email, role } with any staff role
 * (backend auth.js canInvite allows every role for a Super_Admin) → 201 { invitation: { id, email, role, status,
 * expiresAt } }; the expiry shows as event-zone date and time through shared/time.mjs. Errors: 409 INVITE_PENDING
 * (below Email), 400, 403 and 502 CLERK_UNAVAILABLE (screen alert, 502 with "Try again"), 401 ("Sign in again").
 * Unsaved values are guarded (Req 20.7); the View clears them after a sent invitation.
 */
export default function InviteStaffPage({ role, getToken, signInAgain }) {
  const write = useMutation(getToken);
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedGuard(dirty);

  async function invite(body) {
    const result = await write.run('/invites', { body });
    if (!result.ok) return null;
    const ms = Date.parse(result.data.invitation.expiresAt);
    return { expires: `${dateText(istDate(ms))}, ${timeText(ms)}` };
  }

  return <>
    <InviteStaffView role={role} saving={write.saving} error={write.error} onSubmit={invite} onDirty={setDirty} onSignIn={signInAgain} />
    <ConfirmDialog {...guard} />
  </>;
}
