import { useEffect, useRef } from 'react';
import './HorizontalRail.css';

/** Keeps scrolling geometry stable while partially visible card surfaces scale down. */
export default function HorizontalRail({ children, label, className, id, resetKey }) {
  const railRef = useRef(null);
  useEffect(() => {
    const rail = railRef.current;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.target.classList.toggle('is-peek', entry.intersectionRatio < .9));
    }, { root: rail, threshold: .9 });
    [...rail.children].forEach(card => observer.observe(card));
    return () => observer.disconnect();
  }, [children]);
  useEffect(() => { railRef.current.scrollLeft = 0; }, [resetKey]);

  // Native arrow steps can snap back to the same card in WebKit; move one visible page instead.
  function scrollWithKey(event) {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const rail = event.currentTarget;
    rail.scrollBy({ left: (event.key === 'ArrowRight' ? 1 : -1) * rail.clientWidth });
  }

  return <div className="match-rail"><div onKeyDown={scrollWithKey} ref={railRef} id={id} className={className} tabIndex={0} role="region" aria-label={label}>{children}</div></div>;
}
