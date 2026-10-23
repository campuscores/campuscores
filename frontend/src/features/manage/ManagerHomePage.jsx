import StaffShell from '../staff/StaffShell.jsx';
import { messageFor } from '../staff/labels.js';
import useStaffData from '../staff/useStaffData.js';
import ManagerHomeView from './ManagerHomeView.jsx';
import { failureKind, hasNoScope, toHomeProps } from './managerHome.js';

/**
 * Manager home container (Req 8): one `GET /api/manage/home`, mapped to ManagerHomeView props by `toHomeProps`.
 * A failed read shows an error with "Try again" in every section it affects (all three, as one read feeds them);
 * a malformed part fails only its own section (Req 8.7). No tournament in scope shows the no-scope state (Req 8.6).
 * "Try again" reloads the read; there is no polling (Req 22.4).
 */
export default function ManagerHomePage({ role, getToken, signInAgain }) {
  const home = useStaffData('/manage/home', getToken, hasNoScope);
  const retry = () => home.reload();
  if (home.status === 'error') {
    const kind = failureKind(home.error);
    if (kind === 'signIn' || kind === 'changed') {
      return (
        <StaffShell role={role} title="Manager home" current="home">
          <p role="alert">{messageFor(home.error)}</p>
          {kind === 'signIn'
            ? <div className="page-actions">
                <button type="button" className="button-primary" onClick={signInAgain}>Sign in again</button>
                <button type="button" className="button-secondary" onClick={retry}>Try again</button>
              </div>
            : <p><a className="button-text" href="/manage">Reload the page</a></p>}
        </StaffShell>
      );
    }
    return <ManagerHomeView role={role} state={kind} onRetry={retry} />;
  }
  if (home.status !== 'ready') return <ManagerHomeView role={role} state={home.status} onRetry={retry} />;
  const { data, sections } = toHomeProps(home.data);
  return <ManagerHomeView role={role} state="ready" data={data} sections={sections} onRetry={retry} />;
}
