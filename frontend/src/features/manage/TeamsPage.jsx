import { useState } from 'react';
import { useParams } from 'react-router';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import useMutation from '../staff/useMutation.js';
import useStaffData from '../staff/useStaffData.js';
import useUnsavedGuard from '../staff/useUnsavedGuard.js';
import TeamsView from './TeamsView.jsx';

const never = () => false; // a tournament response is never an empty list
const noTeams = data => !data?.teams?.length;

// TeamForm names the jersey `number`; the API Player_Entry is `{ name, jersey?, captain? }` (backend validatePlayers,
// which drops unknown keys). These two maps keep the jersey on both the read and the write.
const fromApiTeam = team => ({
  ...team,
  players: (team.players ?? []).map(({ jersey, ...player }) => (jersey == null ? player : { ...player, number: jersey })),
});
const toApiTeam = ({ name, branch, year, players }) => ({
  name, branch, year,
  players: players.map(({ number, ...player }) => (number == null ? player : { ...player, jersey: number })),
});

/** View state from the two reads: any 403 hides the screen; the list shows the teams read. */
function viewState(tournament, teams) {
  const failed = [tournament, teams].find(read => read.status === 'error');
  if (failed) return failed.error.status === 403 ? 'forbidden' : 'error';
  return tournament.status === 'loading' ? 'loading' : teams.status;
}

/**
 * Teams container (Req 11.1, 11.6 to 11.8). Reads `GET /api/manage/tournaments/:slug` (name, status, Back link) and
 * `GET .../sports/:sport/teams` (`{ teams }`, each with `locked` and `used`). Writes: `POST .../sports/:sport/teams`,
 * `PATCH /api/manage/teams/:id` and `DELETE /api/manage/teams/:id` with an optional `{ reason }`. The teams list
 * reloads after each successful write, and after TEAM_IN_USE so the row's Edit or Delete hides.
 */
export default function TeamsPage({ role, getToken, signInAgain }) {
  const { slug, sport } = useParams();
  const base = `/manage/tournaments/${encodeURIComponent(slug)}`;
  const tournament = useStaffData(base, getToken, never);
  const teams = useStaffData(`${base}/sports/${encodeURIComponent(sport)}/teams`, getToken, noTeams);
  const write = useMutation(getToken);
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const guard = useUnsavedGuard(dirty);

  const readError = [tournament.error, teams.error].find(error => error?.status === 401);
  const error = write.error ?? readError ?? null;

  async function send(path, options, done) {
    setStatus('');
    const result = await write.run(path, options);
    if (result.ok) {
      done(result.data);
      teams.reload();
    } else if (result.error?.code === 'TEAM_IN_USE') {
      teams.reload();
    } else if (result.error?.code === 'TOURNAMENT_LOCKED') {
      tournament.reload(); // the locked tournament hides the form and the row actions
    }
  }

  return (
    <>
      <TeamsView role={role} state={viewState(tournament, teams)}
        onRetry={() => { tournament.reload(); teams.reload(); }}
        tournament={tournament.data?.tournament} sport={sport} teams={(teams.data?.teams ?? []).map(fromApiTeam)}
        editing={editing} saving={write.saving} error={error} status={status}
        onDirtyChange={setDirty} onSignInAgain={signInAgain}
        onAdd={values => send(`${base}/sports/${encodeURIComponent(sport)}/teams`, { body: toApiTeam(values) },
          data => setStatus(`${data?.team?.name ?? values.name} added.`))}
        onEdit={team => { write.reset(); setStatus(''); setEditing(team); }}
        onSave={(team, values) => send(`/manage/teams/${encodeURIComponent(team.id)}`, { method: 'PATCH', body: toApiTeam(values) }, data => {
          setStatus(`${data?.team?.name ?? values.name} saved.`);
          setEditing(null);
        })}
        onCancelEdit={() => { write.reset(); setEditing(null); }}
        confirm={confirm}
        onRequestDelete={team => { write.reset(); setConfirm(team); }}
        onConfirm={reason => send(`/manage/teams/${encodeURIComponent(confirm.id)}`, { method: 'DELETE', body: reason ? { reason } : undefined }, () => {
          setStatus(`${confirm.name} deleted.`);
          if (editing?.id === confirm.id) setEditing(null);
          setConfirm(null);
        })}
        onCancel={() => { setConfirm(null); write.reset(); }} />
      <ConfirmDialog {...guard} />
    </>
  );
}
