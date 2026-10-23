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
  // Clerk's `__client_uat[_<id>]` cookie is a timestamp when signed in and "0" when signed out; reading it loads no Clerk code.
  const signedIn = typeof document !== 'undefined' && document.cookie.split(';').some(part => {
    const [name, value] = part.trim().split('=');
    return name.startsWith('__client_uat') && Boolean(value) && value !== '0';
  });
  const account = signedIn ? { to: '/start', label: 'Dashboard', current: location.pathname.startsWith('/start') ? 'page' : undefined } : { to: '/sign-in', label: 'Sign in', current: location.pathname.startsWith('/sign-in') ? 'page' : undefined };
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
        <Link className="site-name" to="/" aria-label="Campuscores home">Campuscores</Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link className="nav-link" to="/" aria-current={location.pathname === '/' ? 'page' : undefined}>Home</Link>
          <Link className="nav-link" to="/tournaments" aria-current={tournamentsCurrent}>Tournaments</Link>
          <SportsDropdown />
          {signInLink && <Link className="nav-link" to={account.to} aria-current={account.current}>{account.label}</Link>}
        </nav>
      </header>
      <header className="mobile-header" aria-label="Thaparlympics mobile header">
        <Link className="site-name" to="/" aria-label="Campuscores home">Campuscores</Link>
        <details className="mobile-menu">
          <summary aria-label="Menu" />
          <nav className="mobile-menu-panel" aria-label="Main navigation">
            <Link to="/" aria-current={location.pathname === '/' ? 'page' : undefined}>Home</Link>
            <Link to="/tournaments" aria-current={tournamentsCurrent}>Tournaments</Link>
            <SportsDropdown />
            {signInLink && <Link to={account.to} aria-current={account.current}>{account.label}</Link>}
          </nav>
        </details>
      </header>
    </div>
  );
}
