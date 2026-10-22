import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { SignInScreen } from '../manage/SetupStepPage.jsx';
import { isForbidden } from '../manage/setup.js';
import StaffListView from './StaffListView.jsx';
import { ROLES } from './adminText.js';
import usePagedList from './usePagedList.js';

const STATUSES = ['ACTIVE', 'DISABLED'];
const queryOf = values => new URLSearchParams(Object.entries(values).filter(([, value]) => value)).toString();

/**
 * Staff list container (Req 6.1, 6.2, 6.4). The Role and Status filters live in the page query string
 * (`/admin/staff?role=&status=`), so a reload, a shared link and Back keep them; an unknown value counts as no filter.
 * Reads `GET /api/admin/staff?role=&status=` → `{ staff: [{ id, name, email, role, status, tournaments: [name] }],
 * nextOffset }`, ACTIVE first, then email, 50 rows; "Load more" adds `&offset=<nextOffset>` and appends the page.
 */
export default function StaffListPage({ role, getToken, signInAgain }) {
  const [params, setParams] = useSearchParams();
  const pick = (key, allowed) => (allowed.includes(params.get(key)) ? params.get(key) : '');
  const filters = { role: pick('role', ROLES), status: pick('status', STATUSES) };
  const query = queryOf(filters);
  const list = usePagedList(`/admin/staff${query ? `?${query}` : ''}`, 'staff', getToken);
  // The router renders a query change later (a transition), so a second quick change would read the old filters and
  // drop the first one. Until the new query renders, merge into the last requested filters instead.
  const pending = useRef(null);
  useEffect(() => { pending.current = null; }, [query]);
  const changeFilter = change => {
    pending.current = { ...(pending.current ?? filters), ...change };
    setParams(queryOf(pending.current));
  };

  if (list.error?.status === 401) {
    return <SignInScreen role={role} title="Staff list" current="staff" error={list.error} signInAgain={signInAgain} onRetry={list.reload} />;
  }
  return (
    <StaffListView role={role} state={isForbidden(list.error) ? 'forbidden' : list.status} onRetry={list.reload}
      staff={list.rows} filters={filters} onFilterChange={changeFilter}
      hasMore={list.hasMore} loadingMore={list.loadingMore} loadMoreError={list.moreError} onLoadMore={list.loadMore}
      onSignIn={signInAgain} />
  );
}
