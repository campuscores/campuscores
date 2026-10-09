import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { sports } from '../data/sports.js';
import './SiteHeader.css';

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
          <Link className="nav-link" to="/#tournaments">Tournaments</Link>
          <SportsDropdown />
        </nav>
      </header>
      <header className="mobile-header" aria-label="Thaparlympics mobile header">
        <Link className="site-name" to="/" aria-label="Thaparlympics home">Thaparlympics</Link>
        <details className="mobile-menu">
          <summary aria-label="Menu" />
          <nav className="mobile-menu-panel" aria-label="Main navigation">
            <Link to="/" aria-current={location.pathname === '/' ? 'page' : undefined}>Home</Link>
            <Link to="/#tournaments">Tournaments</Link>
            <SportsDropdown />
          </nav>
        </details>
      </header>
    </div>
  );
}
