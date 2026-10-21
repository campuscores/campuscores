import { Link } from 'react-router';
import SiteHeader from '../../components/SiteHeader.jsx';

/** Privacy policy. Plain page: it loads no Clerk code (Req 11.8, 13.5). */
export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="text-page">
        <h1>Privacy policy</h1>
        <p>You can watch every score without an account. An account is optional and gives viewers no extra features.</p>

        <h2>Data we collect</h2>
        <ul>
          <li>If you create an account: your email address and name. If you sign in with Google, also your basic Google profile (name, email address and profile picture).</li>
          <li>For event staff: the staff role and the audit records of staff actions, such as invitations, assignments and score changes.</li>
          <li>We use no analytics or advertising trackers.</li>
        </ul>

        <h2>Why we use it</h2>
        <p>We use your data only to sign you in, to give event staff the access their role needs, and to keep a record of who changed scores.</p>

        <h2>Who processes it</h2>
        <ul>
          <li>Clerk: sign-in and account storage.</li>
          <li>Google: sign-in with Google, if you choose it.</li>
          <li>Cloudflare: website hosting and live scores.</li>
          <li>Neon: the database for staff accounts, scores and audit records.</li>
        </ul>

        <h2>How long we keep it</h2>
        <p>We keep your account until you delete it. When a staff account is deleted, we disable it and keep its audit records, so the score history stays accurate.</p>

        <h2>Delete your account</h2>
        <p>You can delete your account at any time on the <Link to="/account/delete">account deletion page</Link>.</p>

        <h2>Contact</h2>
        <p>For privacy questions, email <a href="mailto:bhatiaarnav05@gmail.com">bhatiaarnav05@gmail.com</a>.</p>
      </main>
    </>
  );
}
