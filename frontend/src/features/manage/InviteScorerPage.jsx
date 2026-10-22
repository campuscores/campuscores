import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { istDate, timeText } from '../../../../shared/time.mjs';
import useMutation from '../staff/useMutation.js';
import InviteScorerView from './InviteScorerView.jsx';
import { dateText } from './manage.js';

/*
 * Invite scorer at `/manage/invite` (`?email=` from "Invite as Match Scorer" on Assign scorer; Req 7.1, 7.3, 13.4).
 * Sends the existing POST /invites { email, role: 'MATCH_OPERATOR' } → 201 { invitation: { id, email, role, status,
 * expiresAt } }; the API sets the expiry 7 days ahead and the page shows `expiresAt` as India_Time date and time.
 * Errors: 409 INVITE_PENDING (below Email), 400 BAD_REQUEST, 403 ROLE_FORBIDDEN and 502 CLERK_UNAVAILABLE (screen alert).
 */
export default function InviteScorerPage({ role, getToken, signInAgain }) {
  const [params] = useSearchParams();
  const write = useMutation(getToken);
  const [sent, setSent] = useState(null);

  async function invite(body) {
    setSent(null);
    const result = await write.run('/invites', { body });
    if (!result.ok) return;
    const { email, expiresAt } = result.data.invitation;
    const ms = Date.parse(expiresAt);
    setSent({ email, expires: `${dateText(istDate(ms))}, ${timeText(ms)}` });
  }

  return <InviteScorerView role={role} initialEmail={params.get('email') ?? ''} saving={write.saving} error={write.error} sent={sent} onSubmit={invite} onSignIn={signInAgain} />;
}
