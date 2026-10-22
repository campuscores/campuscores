import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { sportLabel, startScreen, tournamentStatusLabel } from '../staff/labels.js';
import useMutation from '../staff/useMutation.js';
import useStaffData from '../staff/useStaffData.js';
import TournamentOverviewView from './TournamentOverviewView.jsx';

// A retry of the same request cannot fix these: the screen closes its dialog and offers "Sign in again" or "Reload" (Req 20.8, 20.9).
const stuck = error => [401, 403, 404, 409].includes(error?.status);

/**
 * Tournament overview container (Req 3.4, 3.7, 3.10, 9.9 to 9.13, 20.4). GET /api/manage/tournaments/:slug gives
 * `{ tournament, isOwner, nextStep, sports }`; each accepted change reloads it, so the screen shows server truth.
 */
export default function TournamentOverviewPage({ role, getToken, signInAgain }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const base = `/manage/tournaments/${encodeURIComponent(slug)}`;
  const load = useStaffData(base, getToken);
  const action = useMutation(getToken);
  const [confirm, setConfirm] = useState(null);
  const [status, setStatus] = useState('');
  const data = load.data;

  const done = message => { setConfirm(null); setStatus(message); load.reload(); };
  const failed = result => { if (stuck(result.error)) setConfirm(null); };

  function request(next) {
    action.reset();
    setStatus('');
    setConfirm(next);
  }

  async function onConfirm(reason) {
    if (confirm.kind === 'status') {
      const result = await action.run(`${base}/status`, { body: { status: confirm.to, ...(reason ? { reason } : {}) } });
      if (result.ok) done(`${result.data.tournament.name} is now ${tournamentStatusLabel(result.data.tournament.status).toLowerCase()}.`);
      else failed(result);
    } else if (confirm.kind === 'delete') {
      const result = await action.run(base, { method: 'DELETE', body: reason ? { reason } : undefined });
      // The tournament no longer exists, so Back must not return to it.
      if (result.ok) navigate(startScreen(role), { replace: true });
      else failed(result);
    } else {
      const { manager } = confirm;
      const result = await action.run(`${base}/sports/${encodeURIComponent(manager.sport)}/managers/${encodeURIComponent(manager.accountId)}`, { method: 'DELETE' });
      if (result.ok) done(`Removed ${manager.name || manager.email} from ${sportLabel(manager.sport)}.`);
      else failed(result);
    }
  }

  async function onAddManager({ sport, email }) {
    setStatus('');
    const result = await action.run(`${base}/sports/${encodeURIComponent(sport)}/managers`, { body: { email } });
    if (result.ok) done(`Added ${result.data.manager.name || result.data.manager.email} as a sport manager for ${sportLabel(sport)}.`);
  }

  const signIn = load.error?.status === 401 || action.error?.status === 401;
  return (
    <TournamentOverviewView role={role} state={load.error?.status === 403 ? 'forbidden' : load.status} onRetry={load.reload}
      tournament={data?.tournament} isOwner={data?.isOwner} nextStep={data?.nextStep} sports={data?.sports}
      saving={action.saving} error={action.error} status={status}
      confirm={confirm} onRequest={request} onConfirm={onConfirm} onCancel={() => { setConfirm(null); action.reset(); }}
      onAddManager={onAddManager}
      onSignIn={signIn ? signInAgain : undefined}
      onReload={!signIn && stuck(action.error) ? () => { action.reset(); load.reload(); } : undefined} />
  );
}
