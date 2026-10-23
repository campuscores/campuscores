import { useState } from 'react';
import { useParams } from 'react-router';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import useMutation from '../staff/useMutation.js';
import useStaffData from '../staff/useStaffData.js';
import useUnsavedGuard from '../staff/useUnsavedGuard.js';
import SportSetupView from './SportSetupView.jsx';

const never = () => false; // a tournament response is never an empty list

/** View state of the tournament read: any 403 hides the screen; a sport outside the response is not in scope. */
function viewState(read, entry) {
  if (read.status === 'error') return read.error.status === 403 ? 'forbidden' : 'error';
  if (read.status !== 'ready') return read.status;
  if (!entry) return read.data.isOwner ? 'error' : 'forbidden';
  return 'ready';
}

/** Status line after `PUT .../format`: the API reports `changed: false` for a format equal to the stored one (Req 10.5). */
const formatStatus = data => (data?.changed === false ? 'No change to save' : 'Format saved.');

/**
 * Sport setup container (Req 10.3 to 10.5, 10.8, 19.9, 3.10). One `GET /api/manage/tournaments/:slug` gives the
 * tournament and its `sports[]`; this screen shows the `:sport` entry. Writes: `PUT .../sports/:sport/format` with a
 * format that passed `validateFormat` in the View, `POST .../sports/:sport/managers` and
 * `DELETE .../sports/:sport/managers/:accountId`. Each successful write reloads the tournament.
 */
export default function SportSetupPage({ role, getToken, signInAgain }) {
  const { slug, sport } = useParams();
  const base = `/manage/tournaments/${encodeURIComponent(slug)}`;
  const sportPath = `${base}/sports/${encodeURIComponent(sport)}`;
  const read = useStaffData(base, getToken, never);
  const write = useMutation(getToken);
  const [status, setStatus] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedGuard(dirty);

  const entry = read.data?.sports?.find(item => item.sport === sport);
  const state = viewState(read, entry);
  // A 401 on the read also offers "Sign in again"; other read errors show the section error with "Try again".
  const error = write.error ?? (read.error?.status === 401 ? read.error : null);

  async function send(path, options, done) {
    setStatus('');
    const result = await write.run(path, options);
    if (!result.ok) return;
    // `done` returns false when nothing changed, so the screen keeps its state without a reload.
    if (done(result.data) !== false) read.reload();
  }

  return (
    <>
      <SportSetupView role={role} state={state} onRetry={read.reload} tournament={read.data?.tournament}
        isOwner={Boolean(read.data?.isOwner)} sport={entry ?? null}
        saving={write.saving} error={error} status={status} onDirtyChange={setDirty} onSignInAgain={signInAgain}
        onSaveFormat={format => send(`${sportPath}/format`, { method: 'PUT', body: { format } }, data => {
          setStatus(formatStatus(data));
          return data?.changed !== false;
        })}
        onAddManager={({ email }) => send(`${sportPath}/managers`, { body: { email } },
          data => setStatus(`${data?.manager?.name || email} is now a sport manager.`))}
        confirm={confirm}
        onRequestRemove={manager => { write.reset(); setConfirm(manager); }}
        onConfirm={() => send(`${sportPath}/managers/${encodeURIComponent(confirm.accountId)}`, { method: 'DELETE' }, () => {
          setStatus(`${confirm.name || confirm.email} is no longer a sport manager.`);
          setConfirm(null);
        })}
        onCancel={() => { setConfirm(null); write.reset(); }} />
      <ConfirmDialog {...guard} />
    </>
  );
}
