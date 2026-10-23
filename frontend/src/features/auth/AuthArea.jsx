import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import SiteHeader from '../../components/SiteHeader.jsx';
import { apiFetch } from '../../services/api.js';
import AdminHomePage from '../admin/AdminHomePage.jsx';
import AllTournamentsPage from '../admin/AllTournamentsPage.jsx';
import InviteStaffPage from '../admin/InviteStaffPage.jsx';
import PendingInvitationsPage from '../admin/PendingInvitationsPage.jsx';
import StaffListPage from '../admin/StaffListPage.jsx';
import StaffMemberPage from '../admin/StaffMemberPage.jsx';
import AssignScorerPage from '../manage/AssignScorerPage.jsx';
import CreateTournamentPage from '../manage/CreateTournamentPage.jsx';
import InviteScorerPage from '../manage/InviteScorerPage.jsx';
import ManagerHomePage from '../manage/ManagerHomePage.jsx';
import MatchEditorPage from '../manage/MatchEditorPage.jsx';
import MatchesPage from '../manage/MatchesPage.jsx';
import SetupStepPage from '../manage/SetupStepPage.jsx';
import SportSetupPage from '../manage/SportSetupPage.jsx';
import TeamsPage from '../manage/TeamsPage.jsx';
import TournamentDetailsPage from '../manage/TournamentDetailsPage.jsx';
import TournamentOverviewPage from '../manage/TournamentOverviewPage.jsx';
import MyMatchesPage from '../operator/MyMatchesPage.jsx';
import ScoreConsole from '../operator/ScoreConsole.jsx';
import ScreenState, { NoAccess } from '../staff/ScreenState.jsx';
import StaffShell from '../staff/StaffShell.jsx';
import { startScreen } from '../staff/labels.js';
import useMe from '../staff/useMe.js';
import { AccountPage, DeleteAccountPage } from './AccountPages.jsx';
import SignInChoiceView from './SignInChoiceView.jsx';
import useStaffAuth from './useStaffAuth.js';

const loading = <p role="status">Loading sign-in…</p>;

const ALL = ['MATCH_OPERATOR', 'TOURNAMENT_MANAGER', 'SUPER_ADMIN'];
const MANAGERS = ['TOURNAMENT_MANAGER', 'SUPER_ADMIN'];
const ADMIN = ['SUPER_ADMIN'];
// Tournament screens belong to Home for a manager and to Tournaments for a Super Admin (design "Staff navigation").
const TOURNAMENT_NAV = { TOURNAMENT_MANAGER: 'home', SUPER_ADMIN: 'tournaments' };

function ScorePage({ getToken, role }) {
  const { matchId } = useParams();
  return <ScoreConsole key={matchId} matchId={matchId} getToken={getToken} role={role} />;
}

/**
 * Staff_Area screens (design "Information architecture"): `title` (h1 and document title of the gate states), `roles`
 * that may open it, `nav` (the StaffNav item it marks, per role when it differs) and `Page`, which every screen has.
 * Every state of a staff screen renders inside StaffShell, which owns the only SiteHeader and the document title.
 */
const SCREENS = {
  'my-matches': { title: 'My Matches', roles: ALL, nav: 'my-matches', Page: MyMatchesPage, signedOut: 'Sign in to see and score the matches assigned to you.' },
  score: { title: 'Score console', roles: ALL, nav: { MATCH_OPERATOR: 'my-matches', TOURNAMENT_MANAGER: 'matches', SUPER_ADMIN: 'matches' }, Page: ScorePage, signedOut: 'Sign in to see and score the matches assigned to you.' },
  'manager-home': { title: 'Manager home', roles: MANAGERS, nav: 'home', Page: ManagerHomePage },
  'tournament-new': { title: 'Create tournament', roles: MANAGERS, nav: TOURNAMENT_NAV, Page: CreateTournamentPage },
  'tournament-setup': { title: 'Create tournament', roles: MANAGERS, nav: TOURNAMENT_NAV, Page: SetupStepPage },
  'tournament-overview': { title: 'Tournament overview', roles: MANAGERS, nav: TOURNAMENT_NAV, Page: TournamentOverviewPage },
  'tournament-details': { title: 'Tournament details', roles: MANAGERS, nav: TOURNAMENT_NAV, Page: TournamentDetailsPage },
  'sport-setup': { title: 'Sport setup', roles: MANAGERS, nav: TOURNAMENT_NAV, Page: SportSetupPage },
  teams: { title: 'Teams', roles: MANAGERS, nav: TOURNAMENT_NAV, Page: TeamsPage },
  matches: { title: 'Matches', roles: MANAGERS, nav: 'matches', Page: MatchesPage },
  'match-editor': { title: 'Match editor', roles: MANAGERS, nav: 'matches', Page: MatchEditorPage },
  'assign-scorer': { title: 'Assign scorer', roles: MANAGERS, nav: 'matches', Page: AssignScorerPage },
  'invite-scorer': { title: 'Invite scorer', roles: MANAGERS, nav: { TOURNAMENT_MANAGER: 'invite', SUPER_ADMIN: 'staff' }, Page: InviteScorerPage },
  'admin-home': { title: 'Admin home', roles: ADMIN, nav: 'home', Page: AdminHomePage },
  'all-tournaments': { title: 'All tournaments', roles: ADMIN, nav: 'tournaments', Page: AllTournamentsPage },
  'staff-list': { title: 'Staff list', roles: ADMIN, nav: 'staff', Page: StaffListPage },
  'invite-staff': { title: 'Invite staff', roles: ADMIN, nav: 'staff', Page: InviteStaffPage },
  'staff-member': { title: 'Staff member detail', roles: ADMIN, nav: 'staff', Page: StaffMemberPage },
  invitations: { title: 'Pending invitations', roles: ADMIN, nav: 'home', Page: PendingInvitationsPage },
};

/** Signed out (Clerk) or 401 from the API: the existing operator behavior, a sign-in prompt (Req 2.8, 4.8). */
function SignInPrompt({ screen, signInAgain }) {
  return (
    <StaffShell title={screen.title}>
      {signInAgain
        ? <><p>Your sign-in has expired.</p><button type="button" className="button-primary" onClick={signInAgain}>Sign in again</button></>
        : <p>{screen.signedOut ?? 'Sign in to use the staff pages.'} <Link to="/sign-in">Sign in</Link></p>}
    </StaffShell>
  );
}

/** Role gate: one `GET /api/me` per Staff_Area mount; the screen renders only for a role it allows (Req 2.6, 4.6–4.8). */
function RoleGate({ screen }) {
  const { getToken, signInAgain } = useStaffAuth();
  const me = useMe(getToken);
  if (me.status === 'loading' || me.status === 'error') {
    return <StaffShell title={screen.title}><ScreenState state={me.status} what="your account" onRetry={me.reload} /></StaffShell>;
  }
  if (me.status === 'signedOut') return <SignInPrompt screen={screen} signInAgain={signInAgain} />;
  if (me.status === 'viewer') return <RejectViewer />;
  if (!screen.roles.includes(me.role)) return <NoAccess role={me.role} />;
  const { Page } = screen;
  return <Page screen={screen} role={me.role} getToken={getToken} signInAgain={signInAgain} />;
}

function StaffScreen({ screen }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <StaffShell title={screen.title}><ScreenState state="loading" what="your account" /></StaffShell>;
  if (!isSignedIn) return <SignInPrompt screen={screen} />;
  return <RoleGate screen={screen} />;
}

/** Public account frame for screens without StaffShell: exactly one SiteHeader. */
function TextPage({ title, children }) {
  return (
    <>
      <SiteHeader />
      <main className="text-page"><h1>{title}</h1>{children}</main>
    </>
  );
}

/** `/start` and `/sign-in` while the role is not known yet: loading, 401 ("Sign in again") or error with "Try again". */
function Pending({ error, onRetry, signInAgain }) {
  if (!error) return <p role="status">Loading your account…</p>;
  if (error.status === 401) return <><p>Your sign-in has expired.</p><div className="text-actions"><button type="button" onClick={signInAgain}>Sign in again</button></div></>;
  return <><p className="text-error" role="alert">Could not load your account.</p><div className="text-actions"><button type="button" onClick={onRetry}>Try again</button></div></>;
}

/**
 * Sign-in is for staff only (Arnav, 24 October 2026). An account without an ACTIVE staff role (GET /api/me Viewer) is
 * signed out at once and lands on /sign-in?no-access, which explains why. No account, role or data changes.
 */
function RejectViewer() {
  const { signOut } = useClerk();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);
  const leave = () => signOut({ redirectUrl: '/sign-in?no-access' }).catch(() => setFailed(true));
  const leaveOnMount = useEffectEvent(leave);
  useEffect(() => {
    if (started.current) return; // StrictMode runs the effect twice
    started.current = true;
    leaveOnMount();
  }, []);
  return (
    <TextPage title="This email has no staff access">
      {failed
        ? <><p className="text-error" role="alert">Could not sign you out.</p><div className="text-actions"><button type="button" onClick={() => { setFailed(false); leave(); }}>Sign out</button></div></>
        : <p role="status">Signing you out…</p>}
    </TextPage>
  );
}

/** Signed-in visitor on /sign-in: open the start screen of the role from GET /api/me (Req 4.5). */
function SignedInRedirect() {
  const { getToken, signInAgain } = useStaffAuth();
  const me = useMe(getToken);
  if (me.status === 'signedOut') return <SignInChoiceView />;
  if (me.status === 'viewer') return <RejectViewer />;
  if (me.status === 'staff') return <Navigate to={startScreen(me.role)} replace />;
  return <TextPage title="Sign in"><Pending error={me.error} onRetry={me.reload} signInAgain={signInAgain} /></TextPage>;
}

function SignInChoice() {
  const { isLoaded, isSignedIn } = useAuth();
  return isLoaded && isSignedIn ? <SignedInRedirect /> : <SignInChoiceView />;
}

// One POST /api/invites/accept per Clerk session, shared by StrictMode's second effect run. A failure clears it so
// "Try again" sends it again. 404 INVITE_NOT_FOUND and 409 ACCOUNT_EXISTS mean there is nothing to accept.
const acceptCalls = new Map();
function acceptInvite(sessionId, getToken) {
  if (!acceptCalls.has(sessionId)) {
    acceptCalls.set(sessionId, (async () => apiFetch('/invites/accept', { method: 'POST', token: await getToken() }))().catch(err => {
      if (err.code === 'INVITE_NOT_FOUND' || err.code === 'ACCOUNT_EXISTS') return null;
      acceptCalls.delete(sessionId);
      throw err;
    }));
  }
  return acceptCalls.get(sessionId);
}

/** After the invitation step: read the role and replace /start with its start screen (Req 4.3, 4.4). */
function StartRedirect({ getToken, signInAgain }) {
  const me = useMe(getToken);
  if (me.status === 'staff') return <Navigate to={startScreen(me.role)} replace />;
  if (me.status === 'viewer') return <RejectViewer />;
  return <TextPage title="Signing you in"><Pending error={me.error} onRetry={me.reload} signInAgain={signInAgain} /></TextPage>;
}

/** /start, the landing page of every sign-in and sign-up: accept a pending invitation once, then open the start screen. */
function StartPage() {
  const { isLoaded, isSignedIn, sessionId } = useAuth();
  const { getToken, signInAgain } = useStaffAuth();
  const [attempt, setAttempt] = useState(0);
  const [accepted, setAccepted] = useState(null); // { key, error } of the latest finished accept call
  const key = `${sessionId} ${attempt}`;
  const accept = useEffectEvent(() => acceptInvite(sessionId, getToken));
  useEffect(() => {
    if (!isSignedIn) return;
    let current = true;
    accept().then(() => { if (current) setAccepted({ key }); }, error => { if (current) setAccepted({ key, error }); });
    return () => { current = false; };
  }, [isSignedIn, key]);

  if (isLoaded && !isSignedIn) return <TextPage title="Sign in"><p>You are signed out. <Link to="/sign-in">Sign in</Link></p></TextPage>;
  const done = isLoaded && accepted?.key === key ? accepted : null;
  if (done && !done.error) return <StartRedirect getToken={getToken} signInAgain={signInAgain} />;
  return <TextPage title="Signing you in"><Pending error={done?.error} onRetry={() => setAttempt(n => n + 1)} signInAgain={signInAgain} /></TextPage>;
}

const signIn = path => function ClerkSignIn() {
  return <><SiteHeader /><main className="auth-widget"><SignIn routing="path" path={path} signUpUrl="/sign-up" forceRedirectUrl="/start" fallback={loading} /></main></>;
};

/** Account screens outside StaffShell; each renders its own single SiteHeader. */
const PAGES = {
  'sign-in': SignInChoice,
  'sign-in-scorer': signIn('/sign-in/scorer'),
  'sign-in-manager': signIn('/sign-in/manager'),
  'sign-up': () => <><SiteHeader /><main className="auth-widget"><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/start" fallback={loading} /></main></>,
  start: StartPage,
  account: () => <><SiteHeader /><AccountPage /></>,
  'account-delete': () => <><SiteHeader /><DeleteAccountPage /></>,
};

/**
 * Lazy Clerk area for every route that needs an account: `screen` is a key of SCREENS (Staff_Area) or PAGES. App.jsx
 * lists the paths. ClerkProvider lives only in this chunk, so public pages load no Clerk code (Req 4.1, 11.8, 13.3).
 * Email and Google are configured in the Clerk dashboard (Req 13.4). Sign-in and sign-up land on /start.
 */
export default function AuthArea({ screen }) {
  const navigate = useNavigate();
  const Page = PAGES[screen];
  return (
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      routerPush={to => navigate(to)}
      routerReplace={to => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      {SCREENS[screen] ? <StaffScreen screen={SCREENS[screen]} /> : <Page />}
    </ClerkProvider>
  );
}
