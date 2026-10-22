import { lazy, Suspense, useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import HomePage from '../features/home/HomePage.jsx';
import SportPage from '../features/sports/SportPage.jsx';
import PrivacyPage from '../features/legal/PrivacyPage.jsx';
import SignInUnavailable from '../features/auth/SignInUnavailable.jsx';
import TournamentsPage from '../features/tournaments/TournamentsPage.jsx';
import TournamentPage from '../features/tournaments/TournamentPage.jsx';
import TournamentSportPage from '../features/tournaments/TournamentSportPage.jsx';
import { sportFixtures } from '../features/sports/sportFixtures.js';
import { sports } from '../data/sports.js';

// Clerk code loads only in this lazy chunk, and only when the build has a Clerk key (Req 11.8, 13.3).
// `staff(screen)` renders the AuthArea screen with that key (see SCREENS and PAGES in AuthArea.jsx).
const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const AuthArea = lazy(() => import('../features/auth/AuthArea.jsx'));
const staff = screen => clerkKey
  ? <Suspense fallback={<p className="sr-only" role="status">Loading sign-in…</p>}><AuthArea screen={screen} /></Suspense>
  : <SignInUnavailable />;

// Stage 1 layout preview: local and staging builds only. Production builds drop the chunk (Req 1.11).
const preview = import.meta.env.DEV || import.meta.env.VITE_LAYOUT_PREVIEW === '1';
const PreviewIndex = preview ? lazy(() => import('../features/preview/PreviewIndex.jsx')) : null;
const previewPage = preview && <Suspense fallback={<p className="sr-only" role="status">Loading preview…</p>}><PreviewIndex /></Suspense>;

// Paths whose every state renders StaffShell, which sets the document title. Without a Clerk key they show
// SignInUnavailable, so this effect titles them.
const shellTitled = path => (clerkKey && /^\/(operator|manage|admin)(\/|$)/.test(path)) || (preview && /^\/preview(\/|$)/.test(path));

export default function App() {
  const { pathname, hash, search, key } = useLocation();
  useEffect(() => {
    // StaffShell sets the title of staff screens; this effect runs after it and must not overwrite it.
    if (!shellTitled(pathname)) document.title = pathname.startsWith('/sports/') ? 'Sports | Thaparlympics'
      : /^\/tournaments\/?$/.test(pathname) ? 'Tournaments | Thaparlympics'
      : pathname.startsWith('/tournaments/') ? 'Tournament | Thaparlympics'
      : pathname.startsWith('/operator/') ? 'My Matches | Thaparlympics'
      : pathname === '/privacy' ? 'Privacy | Thaparlympics'
      : /^\/(sign-in|sign-up|account|start)(\/|$)/.test(pathname) ? 'Account | Thaparlympics' : 'Thaparlympics';
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash, key]);

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/index.html" element={<Navigate to={`/${hash}`} replace />} />
      <Route path="/tournament.html" element={<Navigate to={
        new URLSearchParams(search).get('event')
          ? `/tournaments/${encodeURIComponent(new URLSearchParams(search).get('event'))}`
          : '/#tournaments'
      } replace />} />
      {/* Every sport gets the shared sport page with its display fixtures; key resets its state between sports. */}
      {sports.map(sport => <Route key={sport.id} path={`/sports/${sport.id}`} element={<SportPage key={sport.id} sport={sport} fixtures={sportFixtures[sport.id]} />} />)}
      <Route path="/tournaments" element={<TournamentsPage />} />
      <Route path="/tournaments/:slug" element={<TournamentPage />} />
      <Route path="/tournaments/:slug/:sport" element={<TournamentSportPage />} />
      {/* Pages that need an account live in the lazy Clerk area (design "Information architecture"). */}
      <Route path="/sign-in" element={staff('sign-in')} />
      <Route path="/sign-in/scorer/*" element={staff('sign-in-scorer')} />
      <Route path="/sign-in/manager/*" element={staff('sign-in-manager')} />
      <Route path="/sign-up/*" element={staff('sign-up')} />
      <Route path="/start" element={staff('start')} />
      <Route path="/account" element={staff('account')} />
      <Route path="/account/delete" element={staff('account-delete')} />
      <Route path="/operator/matches" element={staff('my-matches')} />
      <Route path="/operator/matches/:matchId/score" element={staff('score')} />
      <Route path="/manage" element={staff('manager-home')} />
      <Route path="/manage/tournaments/new" element={staff('tournament-new')} />
      <Route path="/manage/tournaments/:slug/setup" element={staff('tournament-setup')} />
      <Route path="/manage/tournaments/:slug/setup/:step" element={staff('tournament-setup')} />
      <Route path="/manage/tournaments/:slug" element={staff('tournament-overview')} />
      <Route path="/manage/tournaments/:slug/details" element={staff('tournament-details')} />
      <Route path="/manage/tournaments/:slug/sports/:sport" element={staff('sport-setup')} />
      <Route path="/manage/tournaments/:slug/sports/:sport/teams" element={staff('teams')} />
      <Route path="/manage/matches" element={staff('matches')} />
      <Route path="/manage/matches/new" element={staff('match-editor')} />
      <Route path="/manage/matches/:matchId" element={staff('match-editor')} />
      <Route path="/manage/matches/:matchId/scorer" element={staff('assign-scorer')} />
      <Route path="/manage/invite" element={staff('invite-scorer')} />
      <Route path="/admin" element={staff('admin-home')} />
      <Route path="/admin/tournaments" element={staff('all-tournaments')} />
      <Route path="/admin/staff" element={staff('staff-list')} />
      <Route path="/admin/staff/invite" element={staff('invite-staff')} />
      <Route path="/admin/staff/:accountId" element={staff('staff-member')} />
      <Route path="/admin/invitations" element={staff('invitations')} />
      <Route path="/privacy" element={<PrivacyPage />} />
      {preview && <Route path="/preview" element={previewPage} />}
      {preview && <Route path="/preview/:screen" element={previewPage} />}
      <Route path="*" element={<main className="not-found"><h1>Page not found</h1><Link to="/">Return home</Link></main>} />
    </Routes>
  );
}
