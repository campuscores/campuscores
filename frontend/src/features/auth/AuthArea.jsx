import { ClerkProvider, SignIn, SignUp, useAuth } from '@clerk/react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import SiteHeader from '../../components/SiteHeader.jsx';
import MyMatchesPage from '../operator/MyMatchesPage.jsx';
import ScoreConsole from '../operator/ScoreConsole.jsx';
import { AccountPage, DeleteAccountPage } from './AccountPages.jsx';

const loading = <p role="status">Loading sign-in…</p>;

/** /operator/matches and its score route need a signed-in user; the API checks the staff role (Req 19.1). */
function OperatorPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { matchId } = useParams();
  if (!isLoaded) return <main className="text-page"><p role="status">Loading your account…</p></main>;
  if (!isSignedIn) {
    return (
      <main className="text-page">
        <h1>My Matches</h1>
        <p>Sign in to see and score the matches assigned to you. <Link to="/sign-in">Sign in</Link></p>
      </main>
    );
  }
  return matchId ? <ScoreConsole key={matchId} matchId={matchId} getToken={getToken} /> : <MyMatchesPage getToken={getToken} />;
}

/**
 * Lazy Clerk area for /sign-in/*, /sign-up/*, /account, /account/delete and /operator/matches(/:matchId/score). ClerkProvider lives only in
 * this chunk, so public pages load no Clerk code (Req 11.8, 13.3). Email and Google are configured in the
 * Clerk dashboard (Req 13.4). Sign-in and sign-up always land on /account, which accepts a staff invitation.
 */
export default function AuthArea() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const page = pathname.startsWith('/operator/')
    ? <OperatorPage />
    : pathname.startsWith('/sign-in')
    ? <main className="auth-widget"><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/account" fallback={loading} /></main>
    : pathname.startsWith('/sign-up')
      ? <main className="auth-widget"><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/account" fallback={loading} /></main>
      : pathname.startsWith('/account/delete') ? <DeleteAccountPage /> : <AccountPage />;
  return (
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      routerPush={to => navigate(to)}
      routerReplace={to => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      <SiteHeader />
      {page}
    </ClerkProvider>
  );
}
