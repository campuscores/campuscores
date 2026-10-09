import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import HomePage from '../features/home/HomePage.jsx';
import SportPage from '../features/sports/SportPage.jsx';
import { sportFixtures } from '../features/sports/sportFixtures.js';
import { sports } from '../data/sports.js';

function ReservedPage() { return null; }

export default function App() {
  const { pathname, hash, search, key } = useLocation();
  useEffect(() => {
    document.title = pathname.startsWith('/sports/') ? 'Sports | Thaparlympics'
      : pathname.startsWith('/tournaments/') ? 'Tournament | Thaparlympics' : 'Thaparlympics';
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
      <Route path="/tournaments/:tournament" element={<ReservedPage />} />
      <Route path="*" element={<main className="not-found"><h1>Page not found</h1><Link to="/">Return home</Link></main>} />
    </Routes>
  );
}
