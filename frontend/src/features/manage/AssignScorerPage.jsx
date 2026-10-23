import { useState } from 'react';
import { useParams } from 'react-router';
import useMutation from '../staff/useMutation.js';
import useStaffData from '../staff/useStaffData.js';
import AssignScorerView from './AssignScorerView.jsx';
import { SignInScreen } from './SetupStepPage.jsx';
import { sidesText } from './manage.js';
import { isForbidden, withWhen } from './setup.js';

/*
 * Assign scorer at `/manage/matches/:matchId/scorer` (Req 13.1 to 13.8). API calls and their mapping to View props:
 *   read    GET /manage/matches/:id → { match } (staff match row with `scorer`, `assignmentId`, `canAssign`).
 *   assign  POST /matches/:id/assignments { email, reason? } → 201 { assignment }; "Score this match myself" sends
 *           { self: true, reason? }. `reason` is required (409 REASON_REQUIRED) when the match already has a scorer.
 *           400 `email:` errors (SCORER_NOT_FOUND, NOT_A_SCORER, INVITE_PENDING, BAD_REQUEST) show below Email;
 *           SCORER_NOT_FOUND also offers "Invite as Match Scorer".
 *   remove  POST /assignments/:assignmentId/revoke { reason } → { assignment: { id, status: 'REVOKED' } }.
 * No Assignment window is sent (Req 13.8). Each success reloads the match, so the View shows the current scorer. A 404
 * or 409 (REASON_REQUIRED, MATCH_CLOSED, TOURNAMENT_LOCKED, ASSIGNMENT_CONFLICT) means the match changed: the dialog
 * closes and the match reloads, so the form shows only what the API still allows.
 */
export default function AssignScorerPage(props) {
  const { matchId } = useParams();
  return <AssignScorer key={matchId} matchId={matchId} {...props} />;
}

const never = () => false; // an object response is never an empty list
const changed = error => [404, 409].includes(error?.status);

function AssignScorer({ matchId, role, getToken, signInAgain }) {
  const load = useStaffData(`/manage/matches/${encodeURIComponent(matchId)}`, getToken, never);
  const write = useMutation(getToken);
  const [status, setStatus] = useState('');
  const [confirm, setConfirm] = useState(false);
  const match = load.data?.match ? withWhen(load.data.match) : null;

  async function send(path, body, done) {
    setStatus('');
    const result = await write.run(path, { body });
    if (result.ok) setStatus(done);
    if (result.ok || changed(result.error)) {
      setConfirm(false);
      load.reload();
    }
  }
  const withReason = reason => (reason ? { reason } : {});
  const assignPath = `/matches/${encodeURIComponent(matchId)}/assignments`;

  if (load.error?.status === 401) {
    return <SignInScreen role={role} title="Assign scorer" current="matches" error={load.error} signInAgain={signInAgain} onRetry={load.reload} />;
  }
  return (
    <AssignScorerView role={role} state={isForbidden(load.error) ? 'forbidden' : load.status} onRetry={load.reload} match={match}
      saving={write.saving} error={write.error} status={status}
      // The modal dialog makes the Clerk sign-in inert, so it closes first; the 401 stays and the page offers sign-in too.
      onSignIn={() => { setConfirm(false); signInAgain(); }}
      onAssign={({ email, reason }) => send(assignPath, { email, ...withReason(reason) }, `Assigned ${email} to ${sidesText(match)}.`)}
      onSelf={({ reason }) => send(assignPath, { self: true, ...withReason(reason) }, `You now score ${sidesText(match)}.`)}
      confirm={confirm} onRequestRemove={() => { write.reset(); setConfirm(true); }}
      onConfirm={reason => send(`/assignments/${encodeURIComponent(match.assignmentId)}/revoke`, { reason }, `Removed ${match.scorer.name || match.scorer.email} from ${sidesText(match)}.`)}
      onCancel={() => { setConfirm(false); write.reset(); }} />
  );
}
