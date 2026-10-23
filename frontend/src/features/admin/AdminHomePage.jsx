import { timeText } from '../../../../shared/time.mjs';
import StaffShell from '../staff/StaffShell.jsx';
import { messageFor } from '../staff/labels.js';
import useStaffData from '../staff/useStaffData.js';
import { failureKind, toHomeProps } from '../manage/managerHome.js';
import { dateText } from '../manage/manage.js';
import AdminHomeView from './AdminHomeView.jsx';

const never = () => false; // a Super_Admin with no tournament still sees the sections and the invitation count
// AdminHomeView shows `date` and `time` text; times come from `scheduledAt` through shared/time.mjs.
const withText = row => ({ ...row, date: dateText(row.date), time: row.scheduledAt ? timeText(Date.parse(row.scheduledAt)) : '' });
const withRowText = group => group && { ...group, items: group.items.map(withText) };

/**
 * Admin home container (Req 16.2): one `GET /api/manage/home`. For a Super_Admin it covers every tournament (no scope
 * filter) and adds `pendingInvitations`, the count of PENDING unexpired invitations (0 when none). `toHomeProps`
 * (shared with Manager home) checks each part, so a malformed part fails only its own section (Req 8.7).
 * A 401 offers "Sign in again"; a changed account offers a reload; "Try again" reloads. There is no polling.
 */
export default function AdminHomePage({ role, getToken, signInAgain }) {
  const home = useStaffData('/manage/home', getToken, never);
  const retry = () => home.reload();
  if (home.status === 'error') {
    const kind = failureKind(home.error);
    if (kind === 'signIn' || kind === 'changed') {
      return (
        <StaffShell role={role} title="Admin home" current="home">
          <p role="alert">{messageFor(home.error)}</p>
          {kind === 'signIn'
            ? <div className="page-actions">
                <button type="button" className="button-primary" onClick={signInAgain}>Sign in again</button>
                <button type="button" className="button-secondary" onClick={retry}>Try again</button>
              </div>
            : <p><a className="button-text" href="/admin">Reload the page</a></p>}
        </StaffShell>
      );
    }
    return <AdminHomeView role={role} state={kind} onRetry={retry} />;
  }
  if (home.status !== 'ready') return <AdminHomeView role={role} state={home.status} onRetry={retry} />;
  const { data, sections } = toHomeProps(home.data);
  const todayMatches = data.todayMatches && Object.fromEntries(Object.entries(data.todayMatches).map(([key, group]) => [key, withRowText(group)]));
  return (
    <AdminHomeView role={role} state="ready" sectionStates={sections} today={data.today} todayMatches={todayMatches}
      needsScorer={withRowText(data.needsScorer)} pendingInvitations={data.pendingInvitations ?? 0} onRetry={retry} />
  );
}
