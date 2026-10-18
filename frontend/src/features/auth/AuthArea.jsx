import { ClerkProvider, SignIn, SignUp } from '@clerk/react';
import { useLocation, useNavigate } from 'react-router';
import SiteHeader from '../../components/SiteHeader.jsx';
import { AccountPage, DeleteAccountPage } from './AccountPages.jsx';

const loading = <p role="status">Loading sign-in…</p>;

/**
 * Lazy Clerk area for /sign-in/*, /sign-up/*, /account and /account/delete. ClerkProvider lives only in
 * this chunk, so public pages load no Clerk code (Req 11.8, 13.3). Email and Google are configured in the
 * Clerk dashboard (Req 13.4). Sign-in and sign-up always land on /account, which accepts a staff invitation.
 */
export default function AuthArea() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const page = pathname.startsWith('/sign-in')
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
