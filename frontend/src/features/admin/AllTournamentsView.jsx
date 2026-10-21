import { useState } from 'react';
import { Link } from 'react-router';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import { sportLabel, tournamentStatusLabel } from '../staff/labels.js';
import { Cell, StaffTable } from './StaffTable.jsx';
import TransferOwnerDialog from './TransferOwnerDialog.jsx';
import { personName } from './adminText.js';
import './admin.css';

/**
 * All tournaments (Req 16.1): every tournament with its status, owner, sports and Sport_Managers.
 * `tournaments`: `[{ slug, name, status, dates, owner: { name, email }, sports: [{ sport, managers: [{ name, email }] }] }]`
 * with display `dates` text. `state` is 'loading', 'error', 'ready' or 'forbidden'.
 * `onTransferOwner(tournament, email, reason)` resolves truthy when the API accepted it; `saving` and `error` (the
 * `apiFetch` error) belong to that request.
 */
export default function AllTournamentsView({ role = 'SUPER_ADMIN', state, tournaments = [], onRetry, onTransferOwner, saving = false, error = null }) {
  const [target, setTarget] = useState(null);
  const [notice, setNotice] = useState('');
  if (state === 'forbidden') return <NoAccess role={role} />;
  async function transfer(email, reason) {
    if (await onTransferOwner(target, email, reason)) {
      setNotice(`${email} now owns ${target.name}.`);
      setTarget(null);
    }
  }
  const listState = state === 'ready' && !tournaments.length ? 'empty' : state;
  return (
    <StaffShell role={role} title="All tournaments" current="tournaments" back={{ to: '/admin', label: 'Admin home' }} status={notice}>
      <div className="form-actions admin-top">
        <Link className="button-primary" to="/manage/tournaments/new">Create tournament</Link>
      </div>
      <section className="staff-section">
        <ScreenState state={listState} what="tournaments" empty="No tournaments yet." onRetry={onRetry}>
          <StaffTable label="All tournaments" headers={['Tournament', 'Status', 'Dates', 'Owner', 'Sports and sport managers', <span className="sr-only">Action</span>]}>
            {tournaments.map(tournament => (
              <tr key={tournament.slug}>
                <Cell title><Link className="button-text" to={`/manage/tournaments/${tournament.slug}`}>{tournament.name}</Link></Cell>
                <Cell label="Status">{tournamentStatusLabel(tournament.status)}</Cell>
                <Cell label="Dates">{tournament.dates}</Cell>
                <Cell label="Owner">{personName(tournament.owner)}</Cell>
                <Cell label="Sports">
                  {tournament.sports.length ? (
                    <ul className="admin-plain">
                      {tournament.sports.map(({ sport, managers }) => (
                        <li key={sport}>{sportLabel(sport)}: {managers.length ? managers.map(personName).join(', ') : 'no sport managers'}</li>
                      ))}
                    </ul>
                  ) : 'No sports yet'}
                </Cell>
                <td>
                  <button type="button" className="button-text" onClick={() => setTarget(tournament)}>
                    Transfer ownership<span className="sr-only"> of {tournament.name}</span>
                  </button>
                </td>
              </tr>
            ))}
          </StaffTable>
        </ScreenState>
      </section>
      <TransferOwnerDialog tournament={target} owner={target?.owner} saving={saving} error={target ? error : null}
        onConfirm={transfer} onCancel={() => setTarget(null)} />
    </StaffShell>
  );
}
