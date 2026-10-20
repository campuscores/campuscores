import { lazy, Suspense, useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import HomePage from '../features/home/HomePage.jsx';
import SportPage from '../features/sports/SportPage.jsx';
import PrivacyPage from '../features/legal/PrivacyPage.jsx';
import SignInUnavailable from '../features/auth/SignInUnavailable.jsx';
import { sportFixtures } from '../features/sports/sportFixtures.js';
import { sports } from '../data/sports.js';

function ReservedPage() { return null; }

// Clerk code loads only in this lazy chunk, and only when the build has a Clerk key (Req 11.8, 13.3).
const AuthArea = lazy(() => import('../features/auth/AuthArea.jsx'));
const authPage = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  ? <Suspense fallback={<p className="sr-only" role="status">Loading sign-in…</p>}><AuthArea /></Suspense>
  : <SignInUnavailable />;

export default function App() {
  const { pathname, hash, search, key } = useLocation();
  useEffect(() => {
    document.title = pathname.startsWith('/sports/') ? 'Sports | Thaparlympics'
      : pathname.startsWith('/tournaments/') ? 'Tournament | Thaparlympics'
      : pathname.startsWith('/operator/') ? 'My Matches | Thaparlympics'
      : pathname === '/privacy' ? 'Privacy | Thaparlympics'
      : /^\/(sign-in|sign-up|account)/.test(pathname) ? 'Account | Thaparlympics' : 'Thaparlympics';
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
      {/* Operator pages need sign-in, so they live in the lazy Clerk area with the account pages. */}
      <Route path="/operator/matches" element={authPage} />
      <Route path="/operator/matches/:matchId/score" element={authPage} />
      <Route path="/tournaments/:tournament" element={<ReservedPage />} />
      <Route path="/sign-in/*" element={authPage} />
      <Route path="/sign-up/*" element={authPage} />
      <Route path="/account" element={authPage} />
      <Route path="/account/delete" element={authPage} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="*" element={<main className="not-found"><h1>Page not found</h1><Link to="/">Return home</Link></main>} />
    </Routes>
  );
}
