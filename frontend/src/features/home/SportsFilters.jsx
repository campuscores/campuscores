import SportIcon from '../../components/SportIcon.jsx';
import { sports } from '../../data/sports.js';

export default function SportsFilters({ selectedSport, onSelect }) {
  return (
    <div className="sports-nav" role="group" aria-label="Filter live matches by sport" id="sports">
      {[{ id: 'all', label: 'All Sports' }, ...sports].map(sport => (
        <button key={sport.id} className="sport-link" type="button" data-sport={sport.id} aria-pressed={selectedSport === sport.id}
          aria-controls="live-match-results" style={{ '--sport-color': sport.color }} onClick={() => onSelect(sport.id)}>
          <SportIcon sport={sport.id} /><span>{sport.label}</span>
        </button>
      ))}
    </div>
  );
}
