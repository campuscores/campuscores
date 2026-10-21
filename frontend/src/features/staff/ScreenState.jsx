import { Link } from 'react-router';
import StaffShell from './StaffShell.jsx';
import { startScreen } from './labels.js';

/**
 * Data states of one section (design "Shared screen rules"). `state` is 'ready', 'empty', 'loading' or 'error';
 * children show only when ready, so no stale list stays after an error. The section heading stays outside this.
 * The live regions stay mounted across state changes, so screen readers hear loads and errors (Req 21.8).
 */
export default function ScreenState({ state, what, empty, onRetry, children }) {
  return (
    <>
      <div aria-live="polite">{state === 'loading' && <p>Loading {what}…</p>}</div>
      <div aria-live="assertive">{state === 'error' && <p className="screen-error"><span className="sr-only">Error: </span>Could not load {what}.</p>}</div>
      {state === 'error' && <button type="button" className="button-secondary" onClick={onRetry}>Try again</button>}
      {state === 'empty' && <p>{empty}</p>}
      {state === 'ready' && children}
    </>
  );
}

/** Whole-screen state for a wrong role, ROLE_FORBIDDEN or SCOPE_FORBIDDEN: no screen content (Req 2.6). */
export function NoAccess({ role }) {
  return (
    <StaffShell role={role} title="You do not have access to this page">
      <p><Link className="button-text" to={startScreen(role)}>Go to your start page</Link></p>
    </StaffShell>
  );
}
