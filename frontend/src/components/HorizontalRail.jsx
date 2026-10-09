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

  return <div className="match-rail"><div ref={railRef} id={id} className={className} tabIndex={0} role="region" aria-label={label}>{children}</div></div>;
}
