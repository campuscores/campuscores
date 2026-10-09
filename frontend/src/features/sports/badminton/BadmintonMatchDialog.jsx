import { useEffect, useRef } from 'react';
import { Overview } from './BadmintonMatchCard.jsx';

function statusText(match) {
  const winner = match.winner == null ? '' : `${match.sides[match.winner].name} won ${match.gamesWon[match.winner]}–${match.gamesWon[1 - match.winner]}`;
  if (match.status === 'live') return `Live · ${match.clock}`;
  if (match.status === 'ended') return `Match ended · ${winner} · Provisional result`;
  if (match.status === 'completed') return `Final · ${winner}`;
  return `Scheduled · ${match.dateLabel} · ${match.timeLabel}`;
}

function Players({ side }) {
  return side.players.map(player => (
    <span key={player.name} className="badminton-player">
      {player.serving && <span className="serve-dot" aria-hidden="true" />}{player.name}{player.serving && <span className="sr-only">, serving</span>}
    </span>
  ));
}

function Side({ match, index }) {
  const side = match.sides[index];
  return <><span className="badminton-team">{side.team}</span>{match.winner === index && <span className="winner-tag">Winner</span>}<Players side={side} /></>;
}

function ScoreTable({ match }) {
  return (
    <table aria-label="Badminton score by game">
      <thead><tr>
        <th scope="col"><span className="sr-only">Team and players</span></th>
        {match.games.map((game, index) => <th key={index} scope="col" className={game?.current ? 'is-current' : undefined} aria-label={`Game ${index + 1}${game?.current ? ', current' : ''}`}>G{index + 1}</th>)}
        <th scope="col" className="match-total" aria-label="Games won">Games</th>
      </tr></thead>
      <tbody>{match.sides.map((side, sideIndex) => (
        <tr key={side.name} data-side={sideIndex}>
          <th scope="row"><Side match={match} index={sideIndex} /></th>
          {match.games.map((game, index) => (
            <td key={index} className={game?.current ? 'is-current' : undefined}>
              {!game ? <span aria-label="Not played">—</span> : game.winner === sideIndex ? <strong>{game.points[sideIndex]}</strong> : game.points[sideIndex]}
            </td>
          ))}
          <td className="match-total">{match.gamesWon[sideIndex]}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

/** Fullscreen (phone) or centered (wider screens) match details in a native modal dialog. */
export default function BadmintonMatchDialog({ match, onClose }) {
  const ref = useRef(null);
  useEffect(() => { if (match && !ref.current.open) ref.current.showModal(); }, [match]);
  function closeOnBackdrop(event) {
    const box = ref.current.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (event.target === ref.current && outside) ref.current.close();
  }
  return (
    <dialog ref={ref} className="badminton-dialog" aria-labelledby="badminton-dialog-title" onClose={onClose} onClick={closeOnBackdrop}>
      {match && <>
        <header className="match-header badminton-dialog-hero">
          <div className="badminton-dialog-top">
            <p className="match-meta"><span>Badminton</span><span>{match.category}</span></p>
            <button type="button" className="badminton-dialog-close" aria-label="Close match details" onClick={() => ref.current.close()}>Close</button>
          </div>
          <h2 id="badminton-dialog-title" className="match-overview"><Overview match={match} /></h2>
          <p className="match-clock badminton-dialog-status">{statusText(match)}</p>
        </header>
        <div className="match-details badminton-dialog-details">
          {match.games
            ? <>
                <ScoreTable match={match} />
                <p className="badminton-legend">
                  <span><strong>Bold</strong> = game winner</span>
                  {match.status === 'live' && <><span><span className="is-current">Red</span> = current game</span><span><span className="serve-dot" aria-hidden="true" />Serving</span></>}
                </p>
              </>
            : <div className="badminton-participants">{[0, 1].map(index => <p key={index}><Side match={match} index={index} /></p>)}</div>}
          <dl className="badminton-info">
            <div><dt>Date</dt><dd>{match.dateLabel}</dd></div>
            <div><dt>Time</dt><dd>{match.timeLabel}</dd></div>
            <div><dt>Tournament</dt><dd>{match.tournament}</dd></div>
            <div><dt>Round</dt><dd>{match.round}</dd></div>
            <div><dt>Venue</dt><dd>{match.venue}</dd></div>
          </dl>
        </div>
      </>}
    </dialog>
  );
}
