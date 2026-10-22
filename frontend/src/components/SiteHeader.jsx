import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { sports } from '../data/sports.js';
import './SiteHeader.css';

// Sign-in is optional: builds without a Clerk key show no link (Req 13.1, 13.2).
const signInLink = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

function SportsDropdown() {
  return (
    <details className="sports-dropdown">
      <summary>Sports</summary>
      <nav className="sports-options" aria-label="Sports">
        {sports.map(sport => <Link key={sport.id} to={`/sports/${sport.id}/`}>{sport.id === 'lawn-tennis' ? 'Lawn tennis' : sport.label}</Link>)}
      </nav>
    </details>
  );
}

export default function SiteHeader() {
  const headerRef = useRef(null);
  const location = useLocation();
  const signInCurrent = location.pathname.startsWith('/sign-in') ? 'page' : undefined;
  const tournamentsCurrent = /^\/tournaments\/?$/.test(location.pathname) ? 'page' : undefined;

  useEffect(() => {
    const header = headerRef.current;
    function closeMenus(event) {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      const opened = [...header.querySelectorAll('details[open]')];
      if (event.type === 'pointerdown') {
        opened.filter(menu => !menu.contains(event.target)).forEach(menu => { menu.open = false; });
      } else {
        opened.forEach(menu => { menu.open = false; });
        opened[0]?.querySelector('summary').focus();
      }
    }
    document.addEventListener('pointerdown', closeMenus);
    document.addEventListener('keydown', closeMenus);
    return () => {
      document.removeEventListener('pointerdown', closeMenus);
      document.removeEventListener('keydown', closeMenus);
    };
  }, []);

  useEffect(() => {
    headerRef.current.querySelectorAll('details[open]').forEach(menu => { menu.open = false; });
  }, [location]);

  return (
    <div ref={headerRef}>
      <header className="desktop-banner" aria-label="Thaparlympics desktop header">
        <Link className="site-name" to="/" aria-label="Thaparlympics home">Thaparlympics</Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link className="nav-link" to="/" aria-current={location.pathname === '/' ? 'page' : undefined}>Home</Link>
          <Link className="nav-link" to="/tournaments" aria-current={tournamentsCurrent}>Tournaments</Link>
          <SportsDropdown />
          {signInLink && <Link className="nav-link" to="/sign-in" aria-current={signInCurrent}>Sign in</Link>}
        </nav>
      </header>
      <header className="mobile-header" aria-label="Thaparlympics mobile header">
        <Link className="site-name" to="/" aria-label="Thaparlympics home">Thaparlympics</Link>
        <details className="mobile-menu">
          <summary aria-label="Menu" />
          <nav className="mobile-menu-panel" aria-label="Main navigation">
            <Link to="/" aria-current={location.pathname === '/' ? 'page' : undefined}>Home</Link>
            <Link to="/tournaments" aria-current={tournamentsCurrent}>Tournaments</Link>
            <SportsDropdown />
            {signInLink && <Link to="/sign-in" aria-current={signInCurrent}>Sign in</Link>}
          </nav>
        </details>
      </header>
    </div>
  );
}
