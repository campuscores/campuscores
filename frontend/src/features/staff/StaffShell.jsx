import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import SiteHeader from '../../components/SiteHeader.jsx';
import { roleLabel, STAFF_NAV } from './labels.js';
import './staff.css';

/**
 * Frame of every Staff_Area screen: SiteHeader, the role's staff navigation with one `aria-current` item (`current`),
 * an optional Back link to the parent screen (`back: { to, label }`; none on the start screen), and `<main>` with the
 * screen `h1`, focused on entry, and the document title "<title> | Campuscores" (Req 4.9, 4.10, 21.4, 21.5).
 * `status` (saves) and `alert` (mutation errors) fill polite and assertive live regions that stay in the page (Req 21.8).
 */
export default function StaffShell({ role, title, current, back, status, alert, children }) {
  const heading = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => { document.title = `${title} | Campuscores`; }, [title]);
  useEffect(() => { heading.current.focus(); }, [pathname]);
  // A save or error that reloads the screen can remove the focused control, and focus then falls to the page body.
  // Focus the h1 instead, so keyboard users continue from the top of the screen, next to the announcement (Req 21.1).
  useEffect(() => {
    if ((status || alert) && (!document.activeElement || document.activeElement === document.body)) heading.current.focus();
  }, [status, alert]);
  const items = STAFF_NAV[role] ?? [];
  return (
    <>
      <SiteHeader />
      <div className="staff">
        {items.length > 0 && (
          <nav className="staff-nav" aria-label="Staff">
            <div className="staff-container staff-nav-row">
              <ul>
                {items.map(item => <li key={item.key}><Link to={item.to} aria-current={item.key === current ? 'page' : undefined}>{item.label}</Link></li>)}
              </ul>
              <p className="staff-role">Signed in as {roleLabel(role)}</p>
            </div>
          </nav>
        )}
        <main className="staff-container staff-main">
          {back && <Link className="button-text staff-back" to={back.to}>Back to {back.label}</Link>}
          <h1 ref={heading} tabIndex={-1}>{title}</h1>
          <p className="staff-notice" role="status">{status}</p>
          <p className="staff-notice is-error" role="alert">{alert && <><span className="sr-only">Error: </span>{alert}</>}</p>
          {children}
        </main>
      </div>
    </>
  );
}
