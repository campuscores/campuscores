import { useEffect, useRef } from 'react';
import './HorizontalRail.css';

/** Keeps scrolling geometry stable while partially visible card surfaces scale down. */
export default function HorizontalRail({ children, label, className, id, resetKey }) {
  const railRef = useRef(null);
  useEffect(() => {
    const rail = railRef.current;
    const visibility = new Map();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => visibility.set(entry.target, entry.intersectionRatio));
      let prominent, mostVisible = 0;
      for (const [card, ratio] of visibility) {
        if (ratio > mostVisible) { prominent = card; mostVisible = ratio; }
      }
      for (const [card, ratio] of visibility) card.classList.toggle('is-peek', ratio < .9 && card !== prominent);
    }, { root: rail, threshold: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1] });
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
