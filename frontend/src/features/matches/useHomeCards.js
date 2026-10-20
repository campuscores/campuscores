import { useEffect, useState } from 'react';
import { apiBase } from '../../services/api.js';

/** Public pages share one receive-only home-feed contract. No Clerk code is loaded. */
export default function useHomeCards() {
  const [cards, setCards] = useState(null);
  const [status, setStatus] = useState(null);
  useEffect(() => {
    if (!apiBase) return;
    let active = true;
    let unsubscribe;
    import('../../services/live.js').then(({ subscribe }) => {
      if (active) unsubscribe = subscribe('home', { onData: data => setCards(Array.isArray(data) ? data : []), onStatus: setStatus });
    }).catch(() => active && setStatus('unavailable'));
    return () => { active = false; unsubscribe?.(); };
  }, []);
  return { cards, status };
}