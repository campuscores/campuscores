import './LiveMatchCard.css';

/** Presentational card. Sport teams can replace the white detail area without changing its shell. */
export default function LiveMatchCard({ match, onOpen }) {
  const headingId = `match-${match.id}`;
  return (
    <article className="match-card" data-sport={match.sport} style={{ '--match-background': `url('/assets/${match.sport}-background.webp')`, '--match-background-phone': `url('/assets/${match.sport}-background-640.webp')` }} aria-labelledby={headingId}>
      <div className="match-surface">
        <header className="match-header">
          <div className="match-meta has-stage"><span>{match.sportLabel}</span><span className="match-stage">{match.round || 'Match'}</span><span>{match.competition}</span></div>
          <h3 className="match-overview" id={headingId}><span>{match.sides[0].name}</span><strong>{match.score}</strong><span>{match.sides[1].name}</span></h3>
          <p className="match-clock">{match.clock}</p>
          {match.endedEarly && <p className="match-finish-note">Ended early · completed scores only</p>}
        </header>
        <div className="match-details" tabIndex={match.columns.length > 5 ? 0 : undefined} role={match.columns.length > 5 ? "region" : undefined} aria-label={match.columns.length > 5 ? "Score details, scroll horizontally" : undefined}>
          <table aria-label={`${match.sportLabel} score breakdown`}>
            <thead><tr><th scope="col"><span className="sr-only">Team or player</span></th>{match.columns.map(column => <th key={column.key} scope="col" className={column.className} aria-label={column.description}>{column.label}</th>)}</tr></thead>
            <tbody>{match.sides.map((side, sideIndex) => <tr key={sideIndex}><th scope="row">{side.name}</th>{side.values.map((value, index) => <td key={match.columns[index].key} className={match.columns[index].className}>{value === '—' ? <span aria-label="Not started">—</span> : side.winners?.[index] ? <strong>{value}</strong> : value}</td>)}</tr>)}</tbody>
          </table>
        </div>
        {/* Optional overlay: real home-room cards open the shared match dialog. */}
        {onOpen && <button type="button" className="match-card-open" aria-haspopup="dialog" aria-label={`Open match details: ${match.sides[0].name} vs ${match.sides[1].name}`} onClick={event => onOpen(match, event.currentTarget)} />}
      </div>
    </article>
  );
}
