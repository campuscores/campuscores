import { Link } from 'react-router';
import SiteHeader from '../../components/SiteHeader.jsx';

/** Shown on the sign-in and account routes when the build has no Clerk key; loads no Clerk code. */
export default function SignInUnavailable() {
  return (
    <>
      <SiteHeader />
      <main className="text-page">
        <h1>Sign-in unavailable</h1>
        <p>Sign-in is not set up on this site yet. You can watch every score without an account.</p>
        <p>Read how we handle data in the <Link to="/privacy">privacy policy</Link>.</p>
      </main>
    </>
  );
}
