import { useState } from 'react';
import { useParams } from 'react-router';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import useMutation from '../staff/useMutation.js';
import useStaffData from '../staff/useStaffData.js';
import useUnsavedGuard from '../staff/useUnsavedGuard.js';
import TournamentDetailsView from './TournamentDetailsView.jsx';

// PATCH /api/manage/tournaments/:slug names the date fields `startDate` and `endDate` in its 400 messages; the form
// ids are `startsOn` and `endsOn`, so the error is renamed to show below the right field.
const FORM_FIELDS = { startDate: 'startsOn', endDate: 'endsOn' };
function toFormError(error) {
  const [, token, fix] = (error?.code === 'BAD_REQUEST' && /^(\w+): (.+)$/.exec(error.message ?? '')) || [];
  return FORM_FIELDS[token] ? { status: error.status, code: error.code, message: `${FORM_FIELDS[token]}: ${fix}` } : error;
}

/**
 * The PATCH body: only the fields that differ from the loaded tournament. The API returns the effective photograph
 * key, so an unchanged photo is not sent and an "Automatic" (stored null) choice stays Automatic.
 */
function changedFields(values, tournament) {
  const before = { ...tournament, venue: tournament.venue ?? '', description: tournament.description ?? '' };
  return Object.fromEntries(Object.entries(values).filter(([name, value]) => value !== before[name]));
}

// A retry of the same request cannot fix these, so the screen offers "Reload" (Req 20.9). A date conflict is fixed in the form.
const needsReload = error => [403, 404, 409].includes(error?.status) && error.code !== 'DATES_EXCLUDE_MATCHES';

/** Tournament details container (Req 9.7, 9.8, 9.14, 20.7): PATCH, then reload; owner and Super_Admin only. */
export default function TournamentDetailsPage({ role, getToken, signInAgain }) {
  const { slug } = useParams();
  const path = `/manage/tournaments/${encodeURIComponent(slug)}`;
  const load = useStaffData(path, getToken);
  const save = useMutation(getToken);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');
  const guard = useUnsavedGuard(dirty);
  const data = load.data;

  async function onSubmit(values) {
    setStatus('');
    const body = changedFields(values, data.tournament);
    if (!Object.keys(body).length) { setStatus('No change to save.'); return; }
    const result = await save.run(path, { method: 'PATCH', body });
    if (!result.ok) return;
    setDirty(false);
    setStatus(`Saved ${result.data.tournament.name}.`);
    load.reload();
  }

  // A Sport_Manager who is not the owner can read the tournament but not edit it (Req 9.15).
  const forbidden = load.error?.status === 403 || (data && !data.isOwner);
  const signIn = load.error?.status === 401 || save.error?.status === 401;
  return (
    <>
      <TournamentDetailsView role={role} state={forbidden ? 'forbidden' : load.status} onRetry={load.reload}
        tournament={data?.tournament} saving={save.saving} error={toFormError(save.error)} status={status}
        onSubmit={onSubmit} onDirtyChange={setDirty}
        onSignIn={signIn ? signInAgain : undefined}
        onReload={needsReload(save.error) ? () => { save.reset(); load.reload(); } : undefined} />
      <ConfirmDialog {...guard} />
    </>
  );
}
