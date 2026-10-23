import { Link } from 'react-router';
import SiteHeader from '../../components/SiteHeader.jsx';
import '../staff/staff.css';
import './SignInChoiceView.css';

/**
 * Sign-in choice at /sign-in (Req 4.2): three equal secondary links, no Primary_Action, because no choice is more
 * important. No Super Admin entry; the role comes from GET /api/me after sign-in. Loads no Clerk code.
 */
export default function SignInChoiceView() {
  return (
    <>
      <SiteHeader />
      <main className="staff sign-in-choice">
        <h1>Sign in</h1>
        <ul>
          <li><Link className="button-secondary" to="/">Continue as guest</Link></li>
          <li><Link className="button-secondary" to="/sign-in/scorer">Sign in as Match Scorer</Link></li>
          <li><Link className="button-secondary" to="/sign-in/manager">Sign in as Tournament Manager</Link></li>
        </ul>
        <p>Super Admins use the Tournament Manager sign-in.</p>
      </main>
    </>
  );
}
