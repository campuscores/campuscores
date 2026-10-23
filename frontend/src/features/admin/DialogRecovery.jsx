import { useLocation } from 'react-router';
import { recovery } from '../manage/setup.js';

/**
 * Recovery controls inside a ConfirmDialog (its `actions`) after a failed request (Req 20.3, 20.8, 20.9): "Try again"
 * after no response, a 500 or a 502 is a submit button of the dialog form, so it resends the values still in the dialog;
 * "Sign in again" after a 401 (`onSignIn` closes the dialog first, because the modal makes the sign-in window inert);
 * a reload link after a 403 or 409 that means the account or invitation changed. Nothing is resent by itself.
 */
export default function DialogRecovery({ error, onSignIn }) {
  const { pathname, search } = useLocation();
  const kind = recovery(error);
  if (kind === 'retry') return <div className="page-actions"><button type="submit" className="button-secondary">Try again</button></div>;
  if (kind === 'signIn' && onSignIn) return <div className="page-actions"><button type="button" className="button-secondary" onClick={onSignIn}>Sign in again</button></div>;
  if (kind === 'reload') return <p><a className="button-text" href={`${pathname}${search}`}>Reload the page</a></p>;
  return null;
}
