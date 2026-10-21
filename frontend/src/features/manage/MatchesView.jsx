import { useId } from 'react';
import { Link } from 'react-router';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import ConfirmDialog from '../staff/ConfirmDialog.jsx';
import Field from '../staff/Field.jsx';
import { messageFor, PHASE_LABELS } from '../staff/labels.js';
import { sports as SPORTS } from '../../data/sports.js';
import DataList from './DataList.jsx';
import { matchColumns, stageNames } from './matchColumns.jsx';
import { homeBack, sidesText } from './manage.js';
import './manage.css';

/**
 * Matches in the caller's Manager_Scope (Req 13.6, 13.7, 14.1 to 14.6). `filters` is `{ tournament, sport, date,
 * phase }` from the query string, `tournamentName` names a tournament filter, and `onFilter(filters)` changes them.
 * Row actions follow the row flags: Edit (`canEdit`), Assign scorer (`canAssign`), Score (`canScore`, the caller
 * holds the ACTIVE Assignment) and Delete (`canDelete`). `total` above `matches.length` means the list was capped.
 * `confirm` is the match being deleted.
 */
export default function MatchesView({ role, state, onRetry, matches = [], total, filters = {}, tournamentName, onFilter,
  confirm, onRequestDelete, onConfirm, onCancel, saving, error, status }) {
  const id = useId();
  if (state === 'forbidden') return <NoAccess role={role} />;
  const filtered = Object.values(filters).some(Boolean);
  const set = (key, value) => onFilter({ ...filters, [key]: value || undefined });
  const query = new URLSearchParams(Object.entries({ tournament: filters.tournament, sport: filters.sport }).filter(([, value]) => value)).toString();
  return (
    <StaffShell role={role} title="Matches" current="matches" back={homeBack(role)} status={status} alert={confirm ? '' : messageFor(error)}>
      <div className="page-actions">
        <Link className="button-primary" to={`/manage/matches/new${query ? `?${query}` : ''}`}>Add match</Link>
      </div>
      <section aria-labelledby={`${id}-filters`}>
        <h2 id={`${id}-filters`}>Filters</h2>
        {filters.tournament && <p>Showing matches of {tournamentName ?? 'one tournament'}.</p>}
        <div className="filter-row">
          <Field as="select" id={`${id}-sport`} label="Sport" value={filters.sport ?? ''} onChange={event => set('sport', event.target.value)}>
            <option value="">All sports</option>
            {SPORTS.map(sport => <option key={sport.id} value={sport.id}>{sport.label}</option>)}
          </Field>
          <Field type="date" id={`${id}-date`} label="Date" value={filters.date ?? ''} onChange={event => set('date', event.target.value)} />
          <Field as="select" id={`${id}-phase`} label="Status" value={filters.phase ?? ''} onChange={event => set('phase', event.target.value)}>
            <option value="">All</option>
            {Object.entries(PHASE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Field>
        </div>
        {filtered && <button type="button" className="button-text" onClick={() => onFilter({})}>Clear filters</button>}
      </section>
      <section className="staff-section" aria-labelledby={`${id}-list`}>
        <h2 id={`${id}-list`}>{total > 0 ? `${total} ${total === 1 ? 'match' : 'matches'}` : 'Matches'}</h2>
        <ScreenState state={state} what="matches" onRetry={onRetry}
          empty={filtered ? 'No matches match these filters.' : 'No matches yet. Add the first match.'}>
          {total > matches.length && <p className="staff-meta">Showing the first {matches.length}. Use the filters to narrow the list.</p>}
          <DataList label="Matches" rows={matches} columns={matchColumns(stageNames(matches))} actions={match => <>
            {match.canScore && <Link className="button-text" to={`/operator/matches/${match.id}/score`}>Score<span className="sr-only"> {sidesText(match)}</span></Link>}
            {match.canEdit && <Link className="button-text" to={`/manage/matches/${match.id}`}>Edit<span className="sr-only"> {sidesText(match)}</span></Link>}
            {match.canAssign && <Link className="button-text" to={`/manage/matches/${match.id}/scorer`}>{match.scorer ? 'Change scorer' : 'Assign scorer'}<span className="sr-only"> for {sidesText(match)}</span></Link>}
            {match.canDelete && <button type="button" className="button-text" onClick={() => onRequestDelete(match)}>Delete<span className="sr-only"> {sidesText(match)}</span></button>}
          </>} />
        </ScreenState>
      </section>
      <ConfirmDialog open={Boolean(confirm)} title={confirm ? `Delete ${sidesText(confirm)}?` : ''} danger confirmLabel="Delete match" reason="optional"
        effects={['Removes the match from the schedule.', 'Removes its scorer assignment.', 'This cannot be undone.']}
        saving={saving} error={confirm ? messageFor(error) : null} onConfirm={onConfirm} onCancel={onCancel} />
    </StaffShell>
  );
}
