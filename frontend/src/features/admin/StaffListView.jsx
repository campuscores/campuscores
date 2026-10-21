import { Link } from 'react-router';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import Field from '../staff/Field.jsx';
import { accountStatusLabel, roleLabel } from '../staff/labels.js';
import { Cell, StaffTable } from './StaffTable.jsx';
import { ROLES } from './adminText.js';
import './admin.css';

/**
 * Staff list (Req 6.1, 6.2, 6.4): every Staff_Member, ACTIVE first, then by email, 50 per page.
 * `staff`: `[{ id, name, email, role, status, tournaments: [name] }]`. `filters` `{ role, status }` holds stored values
 * ('' for all); `onFilterChange(filters)` applies a change. `hasMore`, `loadingMore` and `onLoadMore` page the list.
 * `state` is 'loading', 'error', 'ready' or 'forbidden'.
 */
export default function StaffListView({ role = 'SUPER_ADMIN', state, staff = [], filters = { role: '', status: '' }, onFilterChange, hasMore = false, loadingMore = false, onLoadMore, onRetry }) {
  if (state === 'forbidden') return <NoAccess role={role} />;
  const filtered = Boolean(filters.role || filters.status);
  const listState = state === 'ready' && !staff.length ? 'empty' : state;
  return (
    <StaffShell role={role} title="Staff" current="staff" back={{ to: '/admin', label: 'Admin home' }}>
      <div className="form-actions admin-top">
        <Link className="button-primary" to="/admin/staff/invite">Invite staff</Link>
      </div>
      <section className="staff-section">
        <div className="admin-filters">
          <Field id="staff-role" label="Role" as="select" value={filters.role} onChange={event => onFilterChange({ ...filters, role: event.target.value })}>
            <option value="">All roles</option>
            {ROLES.map(value => <option key={value} value={value}>{roleLabel(value)}</option>)}
          </Field>
          <Field id="staff-status" label="Status" as="select" value={filters.status} onChange={event => onFilterChange({ ...filters, status: event.target.value })}>
            <option value="">Active and disabled</option>
            <option value="ACTIVE">{accountStatusLabel('ACTIVE')}</option>
            <option value="DISABLED">{accountStatusLabel('DISABLED')}</option>
          </Field>
        </div>
        <ScreenState state={listState} what="staff accounts" empty={filtered ? 'No staff accounts match these filters.' : 'No staff accounts yet.'} onRetry={onRetry}>
          <StaffTable label="Staff accounts" headers={['Name', 'Email', 'Role', 'Status', 'Tournaments']}>
            {staff.map(member => (
              <tr key={member.id}>
                <Cell title><Link className="button-text" to={`/admin/staff/${member.id}`}>{member.name || member.email}</Link></Cell>
                <Cell label="Email">{member.email}</Cell>
                <Cell label="Role">{roleLabel(member.role)}</Cell>
                <Cell label="Status">{accountStatusLabel(member.status)}</Cell>
                <Cell label="Tournaments">{member.tournaments.length ? member.tournaments.join(', ') : 'None'}</Cell>
              </tr>
            ))}
          </StaffTable>
          {hasMore && (
            <p className="admin-more">
              <button type="button" className="button-secondary" aria-disabled={loadingMore || undefined}
                onClick={() => { if (!loadingMore) onLoadMore(); }}>
                {loadingMore ? 'Loading more…' : 'Load more'}
              </button>
            </p>
          )}
        </ScreenState>
      </section>
    </StaffShell>
  );
}
