import { useState } from 'react';
import SiteHeader from '../../components/SiteHeader.jsx';
import Hero from './Hero.jsx';
import SportsFilters from './SportsFilters.jsx';
import LiveMatches from '../matches/LiveMatches.jsx';
import Tournaments from '../tournaments/Tournaments.jsx';
import { sampleMatches } from '../matches/sampleMatches.js';
import { sampleTournaments } from '../tournaments/sampleTournaments.js';
import './HomePage.css';

export default function HomePage() {
  const [selectedSport, setSelectedSport] = useState('all');
  const matches = selectedSport === 'all' ? sampleMatches : sampleMatches.filter(match => match.sport === selectedSport);
  return <><SiteHeader /><main><Hero /><SportsFilters selectedSport={selectedSport} onSelect={setSelectedSport} /><LiveMatches matches={matches} selectedSport={selectedSport} /><Tournaments tournaments={sampleTournaments} /></main></>;
}
