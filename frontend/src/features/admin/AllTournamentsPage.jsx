import useMutation from '../staff/useMutation.js';
import useStaffData from '../staff/useStaffData.js';
import { SignInScreen } from '../manage/SetupStepPage.jsx';
import { datesText } from '../manage/manage.js';
import { isForbidden } from '../manage/setup.js';
import AllTournamentsView from './AllTournamentsView.jsx';

/** One View row: display dates and each sport with its Sport_Managers, from the flat `sportManagers` list. */
const toRow = ({ slug, name, status, startsOn, endsOn, sports, owner, sportManagers = [] }) => ({
  slug, name, status, owner,
  dates: datesText(startsOn, endsOn),
  sports: sports.map(sport => ({ sport, managers: sportManagers.filter(manager => manager.sport === sport) })),
});

/**
 * All tournaments at `/admin/tournaments` (Req 16.1, 3.11, 20.4). Reads `GET /api/manage/tournaments` → `{ tournaments:
 * [{ slug, name, status, startsOn, endsOn, sports[], owner: { accountId, name, email }, sportManagers: [{ sport,
 * accountId, name, email }] }] }`: every tournament for a Super_Admin, sorted by start date then name, not paged.
 * Transfer sends `POST /api/admin/tournaments/:slug/owner { email, reason? }` → `{ tournament: { slug, owner } }` from
 * `ConfirmDialog`; a 400 `email:` shows under the email field. Each accepted transfer reloads the list.
 */
export default function AllTournamentsPage({ role, getToken, signInAgain }) {
  const load = useStaffData('/manage/tournaments', getToken);
  const write = useMutation(getToken);

  async function transfer(tournament, email, reason) {
    const result = await write.run(`/admin/tournaments/${encodeURIComponent(tournament.slug)}/owner`, { body: reason ? { email, reason } : { email } });
    if (result.ok) load.reload();
    return result.ok;
  }

  if (load.error?.status === 401) {
    return <SignInScreen role={role} title="All tournaments" current="tournaments" error={load.error} signInAgain={signInAgain} onRetry={load.reload} />;
  }
  return (
    <AllTournamentsView role={role} state={isForbidden(load.error) ? 'forbidden' : load.status} onRetry={load.reload}
      tournaments={(load.data?.tournaments ?? []).map(toRow)} onTransferOwner={transfer}
      onReset={write.reset} onSignIn={signInAgain} saving={write.saving} error={write.error} />
  );
}
