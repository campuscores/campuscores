import { useEffect, useState } from 'react';
import SiteHeader from '../../components/SiteHeader.jsx';
import Hero from './Hero.jsx';
import SportsFilters from './SportsFilters.jsx';
import LiveMatches from '../matches/LiveMatches.jsx';
import Tournaments from '../tournaments/Tournaments.jsx';
import { sampleMatches } from '../matches/sampleMatches.js';
import { toMatchProp } from '../matches/liveCards.js';
import { sampleTournaments } from '../tournaments/sampleTournaments.js';
import { apiBase } from '../../services/api.js';
import './HomePage.css';

export default function HomePage() {
  const [selectedSport, setSelectedSport] = useState('all');
  const [liveCards, setLiveCards] = useState(null); // null until the first Home_Room message
  const [liveStatus, setLiveStatus] = useState(null);
  useEffect(() => {
    if (!apiBase) return undefined; // fixture mode: the socket module is never loaded (Req 3.6)
    let active = true;
    let unsubscribe;
    import('../../services/live.js')
      .then(({ subscribe }) => {
        if (active) unsubscribe = subscribe('home', { onData: data => setLiveCards(Array.isArray(data) ? data.map(toMatchProp) : []), onStatus: setLiveStatus });
      })
      .catch(() => active && setLiveStatus('unavailable'));
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  const unavailable = liveStatus === 'unavailable';
  const allMatches = !apiBase ? sampleMatches : unavailable ? [] : liveCards ?? [];
  const notice = !apiBase ? undefined : unavailable ? 'Live scores are unavailable right now.' : liveCards == null ? 'Connecting to live scores…' : undefined;
  const matches = selectedSport === 'all' ? allMatches : allMatches.filter(match => match.sport === selectedSport);
  return <><SiteHeader /><main><Hero /><SportsFilters selectedSport={selectedSport} onSelect={setSelectedSport} /><LiveMatches matches={matches} selectedSport={selectedSport} notice={notice} /><Tournaments tournaments={sampleTournaments} /></main></>;
}
