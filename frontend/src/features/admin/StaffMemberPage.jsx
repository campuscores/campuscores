import { useParams } from 'react-router';
import useMutation from '../staff/useMutation.js';
import useStaffData from '../staff/useStaffData.js';
import { SignInScreen } from '../manage/SetupStepPage.jsx';
import { isForbidden } from '../manage/setup.js';
import StaffMemberView from './StaffMemberView.jsx';

/*
 * Staff member detail at `/admin/staff/:accountId` (Req 6.8, 6.9, 6.11, 6.13, 6.14, 3.11). API calls:
 *   read      GET /admin/staff/:id → { member: { id, name, email, role, status, owned: [{ slug, name }],
 *             sportScope: [{ tournament: { slug, name }, sport }], activeAssignments } }; 404 (or a malformed ID, 400)
 *             shows "This staff account no longer exists."
 *   role      POST /accounts/:id/role { role, reason? } → { account, revokedAssignmentIds }; 409 ACCOUNT_DISABLED,
 *             LAST_SUPER_ADMIN, OWNER_TRANSFER_REQUIRED; 400 `role:` for the same role.
 *   disable   POST /accounts/:id/disable { reason } (required) → { account }; 409 ALREADY_DISABLED, LAST_SUPER_ADMIN,
 *             OWNER_TRANSFER_REQUIRED.
 *   enable    POST /accounts/:id/enable { reason? } → { account }; 409 ALREADY_ACTIVE, ACCOUNT_EXISTS.
 *   transfer  POST /admin/tournaments/:slug/owner { email, reason? } → { tournament: { slug, owner } }; 400 `email:` for
 *             an email that is not an active Tournament Manager or is the current owner.
 * Each accepted change reloads the member, so the screen shows only the controls that now apply. A refused change keeps
 * its dialog open with a plain message and, for a 409, a reload link.
 */
export default function StaffMemberPage(props) {
  const { accountId } = useParams();
  return <StaffMember key={accountId} accountId={accountId} {...props} />;
}

const never = () => false; // an object response is never an empty list

function StaffMember({ accountId, role, getToken, signInAgain }) {
  const id = encodeURIComponent(accountId);
  const load = useStaffData(`/admin/staff/${id}`, getToken, never);
  const write = useMutation(getToken);
  const withReason = reason => (reason ? { reason } : {});

  async function send(path, body) {
    const result = await write.run(path, { body });
    if (result.ok) load.reload();
    return result.ok;
  }

  if (load.error?.status === 401) {
    return <SignInScreen role={role} title="Staff member" current="staff" error={load.error} signInAgain={signInAgain} onRetry={load.reload} />;
  }
  const gone = [400, 404].includes(load.error?.status);
  const state = isForbidden(load.error) ? 'forbidden' : gone ? 'empty' : load.status;
  return (
    <StaffMemberView role={role} state={state} member={load.data?.member} onRetry={load.reload}
      onChangeRole={(newRole, reason) => send(`/accounts/${id}/role`, { role: newRole, ...withReason(reason) })}
      onDisable={reason => send(`/accounts/${id}/disable`, { reason })}
      onEnable={reason => send(`/accounts/${id}/enable`, withReason(reason))}
      onTransferOwner={(tournament, email, reason) => send(`/admin/tournaments/${encodeURIComponent(tournament.slug)}/owner`, { email, ...withReason(reason) })}
      onReset={write.reset} onSignIn={signInAgain} saving={write.saving} error={write.error} />
  );
}
