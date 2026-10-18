import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth, useClerk } from '@clerk/react';

const apiBase = import.meta.env.VITE_API_BASE ?? '';
// Users whose invitation was already checked in this page load; StrictMode runs effects twice.
const inviteChecked = new Set();

// shortcut: local fetch helper, replace with services/api.js when task 11.2 adds it.
async function callApi(path, method, getToken) {
  let res;
  try {
    res = await fetch(`${apiBase}/api${path}`, { method, headers: { Authorization: `Bearer ${await getToken()}` } });
  } catch {
    throw new Error('the server could not be reached');
  }
  if (res.ok) return;
  const body = await res.json().catch(() => null);
  throw Object.assign(new Error(body?.error?.message ?? `the server returned status ${res.status}`), { code: body?.error?.code });
}

/** Landing page after sign-in or sign-up: accepts a pending staff invitation once (Req 12.5, 12.6). */
export function AccountPage() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { signOut } = useClerk();
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    if (!isSignedIn || inviteChecked.has(userId)) return;
    inviteChecked.add(userId);
    callApi('/invites/accept', 'POST', getToken).then(
      () => setInvite({ ok: true }),
      err => { if (err.code !== 'INVITE_NOT_FOUND') setInvite({ error: err.message }); }, // most users have no invitation
    );
  }, [isSignedIn, userId, getToken]);

  return (
    <main className="text-page">
      <h1>Your account</h1>
      {!isLoaded ? <p role="status">Loading your account…</p>
        : !isSignedIn ? <p>You are signed out. <Link to="/sign-in">Sign in</Link></p>
        : <>
            <p>You are signed in.</p>
            <p role="status">{invite?.ok ? 'Your staff invitation was accepted.' : ''}</p>
            {invite?.error && <p className="text-error" role="alert">Could not accept your staff invitation: {invite.error}. Reload the page to try again.</p>}
            <div className="text-actions">
              <Link to="/">Return home</Link>
              <Link to="/account/delete">Delete account</Link>
              <button type="button" onClick={() => signOut()}>Sign out</button>
            </div>
          </>}
    </main>
  );
}

/** Explains deletion; a signed-in user can delete the account, then is signed out (Req 13.6). */
export function DeleteAccountPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleted, setDeleted] = useState(params.has('deleted'));

  async function remove() {
    if (!window.confirm('Delete your account? This cannot be undone.')) return;
    setBusy(true);
    setError('');
    try {
      await callApi('/me', 'DELETE', getToken);
    } catch (err) {
      setError(err.code === 'LAST_SUPER_ADMIN'
        ? 'You are the last active Super Admin. Add another Super Admin before you delete your account.'
        : `Could not delete your account: ${err.message}. Try again.`);
      setBusy(false);
      return;
    }
    setDeleted(true);
    // The account is already gone; a failed sign-out only leaves a dead session in this tab.
    signOut({ redirectUrl: '/account/delete?deleted' }).catch(() => {});
  }

  return (
    <main className="text-page">
      <h1>Delete your account</h1>
      <p>Deleting your account removes your sign-in and profile. You can still watch every score without an account.</p>
      <p>If you are event staff, we also disable your staff account and end your match assignments. We keep the audit records of your past staff actions, so the score history stays accurate. The last active Super Admin cannot delete their account.</p>
      <p>Read more in the <Link to="/privacy">privacy policy</Link>.</p>
      {deleted ? <p role="status">Your account was deleted.</p>
        : !isLoaded ? <p role="status">Loading your account…</p>
        : !isSignedIn ? <p>To delete your account, <Link to="/sign-in">sign in</Link> first, then return to this page.</p>
        : <div className="text-actions"><button type="button" onClick={remove} disabled={busy}>{busy ? 'Deleting account…' : 'Delete my account'}</button></div>}
      {error && <p className="text-error" role="alert">{error}</p>}
    </main>
  );
}
