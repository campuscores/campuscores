import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { staffPhase } from '../staff/labels.js';
import useMutation from '../staff/useMutation.js';
import useStaffData from '../staff/useStaffData.js';
import MatchesView from './MatchesView.jsx';
import { SignInScreen } from './SetupStepPage.jsx';
import { sidesText } from './manage.js';
import { isForbidden, withWhen } from './setup.js';

const KEYS = ['tournament', 'sport', 'date', 'phase'];
// The page `phase` is a staff Match_Phase key (labels.js PHASE_LABELS); the API filter is live, upcoming or past.
// Final and Not scored are both API `past`, so the page keeps only the rows of the chosen key.
const API_PHASE = { live: 'live', scheduled: 'upcoming', final: 'past', 'not-scored': 'past' };
const queryOf = values => new URLSearchParams(Object.entries(values).filter(([, value]) => value)).toString();

/**
 * Matches container (Req 14.1 to 14.6, 12.9, 12.10). The filters live in the page query string
 * (`?tournament=&sport=&date=&phase=`), so a reload, a shared link and Back keep them; "Clear filters" empties it.
 * Reads `GET /api/manage/matches?tournament=&sport=&date=&phase=` → `{ matches: [staff match row], total }` (at most
 * 500 rows); a read runs on entry, on a filter change and on "Try again" only. Delete sends
 * `DELETE /api/manage/matches/:id` with an optional `{ reason }` → `{ removed: true }`, then reloads the list; a 404
 * or 409 (`MATCH_CLOSED`, `TOURNAMENT_LOCKED`) closes the dialog and reloads, so the row shows its current controls.
 * The editor passes a `status` sentence in the location state after it saves or deletes a match.
 */
export default function MatchesPage({ role, getToken, signInAgain }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const filters = Object.fromEntries(KEYS.map(key => [key, params.get(key) || undefined])
    .filter(([key, value]) => value && (key !== 'phase' || API_PHASE[value])));
  const query = queryOf({ ...filters, phase: API_PHASE[filters.phase] });
  const list = useStaffData(`/manage/matches${query ? `?${query}` : ''}`, getToken);
  const write = useMutation(getToken);
  const [status, setStatus] = useState(location.state?.status ?? '');
  const [confirm, setConfirm] = useState(null);

  if (list.error?.status === 401) {
    return <SignInScreen role={role} title="Matches" current="matches" error={list.error} signInAgain={signInAgain} onRetry={list.reload} />;
  }
  const all = list.data?.matches ?? [];
  const rows = (filters.phase ? all.filter(match => staffPhase(match) === filters.phase) : all).map(withWhen);
  // A Final or Not scored filter narrows the API `past` rows here, so the count is the rows kept.
  const total = API_PHASE[filters.phase] === 'past' ? rows.length : list.data?.total ?? 0;
  const state = isForbidden(list.error) ? 'forbidden' : list.status === 'ready' && !rows.length ? 'empty' : list.status;

  async function remove(reason) {
    setStatus('');
    const result = await write.run(`/manage/matches/${encodeURIComponent(confirm.id)}`, { method: 'DELETE', body: reason ? { reason } : undefined });
    if (result.ok) {
      setStatus(`Deleted ${sidesText(confirm)}.`);
      setConfirm(null);
      list.reload();
    } else if ([404, 409].includes(result.error?.status)) {
      setConfirm(null); // the alert shows the error; the reloaded row shows only the controls the API still allows
      list.reload();
    }
  }

  return (
    <MatchesView role={role} state={state} onRetry={list.reload} matches={rows} total={total} filters={filters}
      tournamentName={all.find(match => match.tournament?.slug === filters.tournament)?.tournament.name}
      onFilter={next => { setStatus(''); write.reset(); setParams(queryOf(next)); }}
      confirm={confirm} onRequestDelete={match => { write.reset(); setConfirm(match); }}
      onConfirm={remove} onCancel={() => { setConfirm(null); write.reset(); }}
      saving={write.saving} error={write.error} status={status} />
  );
}
