import { useEffect, useRef } from 'react';
import { Overview } from './SportMatchCard.jsx';

function statusText(match) {
  const winner = match.winner == null ? '' : `${match.sides[match.winner].name} won ${match.score[match.winner]}–${match.score[1 - match.winner]}`;
  if (match.status === 'live') return `Live · ${match.clock}`;
  if (match.status === 'ended') return `Match ended · ${winner} · Provisional result`;
  if (match.status === 'completed') return match.winner == null ? 'Result recorded' : `${match.sides[match.winner].name} won`;
  if (match.status === 'not-scored') return `Not scored · ${match.dateLabel} · ${match.timeLabel}`;
  return `Scheduled · ${match.dateLabel} · ${match.timeLabel}`;
}

const ServingMark = ({ serving, children }) => <>{serving && <span className="serve-dot" aria-hidden="true" />}{children}{serving && <span className="sr-only">, serving</span>}</>;

function Players({ side }) {
  return side.players.map(player => <span key={player.name} className="sport-player"><ServingMark serving={player.serving}>{player.name}</ServingMark></span>);
}

/** Team label and players per side, without scores. */
function Participants({ match }) {
  return <div className="sport-participants">{match.sides.map((side, index) => <p key={index}><span className="sport-team">{side.team}</span><Players side={side} /></p>)}</div>;
}

function Side({ scoring, match, index }) {
  const side = match.sides[index];
  return <>
    <span className="sport-team"><ServingMark serving={side.serving}>{side.team}</ServingMark></span>
    {match.winner === index && <span className="winner-tag">Winner</span>}
    {!scoring.team && <Players side={side} />}
  </>;
}

function Points({ period, side }) {
  if (!period) return <span aria-label="Not played">—</span>;
  const points = period.points[side];
  return <>{period.winner === side ? <strong>{points}</strong> : points}{period.tiebreak && <><span className="sr-only">, tiebreak </span><sup className="tiebreak">{period.tiebreak[side]}</sup></>}</>;
}

function ScoreTable({ sport, scoring, match }) {
  return (
    <table aria-label={`${sport.label} score by ${scoring.unit.toLowerCase()}`}>
      <thead><tr>
        <th scope="col"><span className="sr-only">Team and players</span></th>
        {match.periods.map((period, index) => (
          <th key={index} scope="col" className={period?.current ? 'is-current' : undefined} aria-label={`${period?.name ?? `${scoring.unit} ${index + 1}`}${period?.current ? ', current' : ''}`}>
            {period?.label ?? `${scoring.short}${index + 1}`}
          </th>
        ))}
        {match.gamePoints && <th scope="col" className="is-current" aria-label="Current game points">Pts</th>}
        <th scope="col" className="match-total" aria-label={scoring.totalName}>{scoring.total}</th>
      </tr></thead>
      <tbody>{match.sides.map((side, sideIndex) => (
        <tr key={sideIndex} data-side={sideIndex}>
          <th scope="row"><Side scoring={scoring} match={match} index={sideIndex} /></th>
          {match.periods.map((period, index) => <td key={index} className={period?.current ? 'is-current' : undefined}><Points period={period} side={sideIndex} /></td>)}
          {match.gamePoints && <td className="is-current">{match.gamePoints[sideIndex]}</td>}
          <td className="match-total">{match.score[sideIndex]}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function Legend({ scoring, match }) {
  const set = scoring.model === 'set';
  const unit = scoring.unit.toLowerCase();
  const live = match.status === 'live';
  const serving = match.sides.some(side => side.serving || side.players.some(player => player.serving));
  return (
    <p className="sport-legend">
      <span><strong>Bold</strong> = {set ? `${unit} winner` : 'won the period'}</span>
      {live && <span><span className="is-current">Red</span> = current {set ? unit : 'period'}</span>}
      {live && serving && <span><span className="serve-dot" aria-hidden="true" />Serving</span>}
      {match.gamePoints && <span>Pts = points in the current game</span>}
      {match.periods.some(period => period?.tiebreak) && <span>Small number = tiebreak points</span>}
    </p>
  );
}

function Scorers({ scoring, match }) {
  return (
    <div className="sport-extra">
      <h3>{scoring.scorers}</h3>
      <div className="sport-participants">{match.sides.map((side, index) => {
        const scorers = match.scorers.filter(scorer => scorer.side === index);
        return (
          <div key={index}>
            <span className="sport-team">{side.team}</span>
            <ul className="sport-scorers">
              {scorers.length
                ? scorers.map((scorer, item) => <li key={item}>{scorer.player} <span>{scorer.detail}</span></li>)
                : <li><span aria-label="None">—</span></li>}
            </ul>
          </div>
        );
      })}</div>
    </div>
  );
}

/** Fullscreen (phone) or centered (wider screens) match details in a native modal dialog. */
export default function SportMatchDialog({ sport, scoring, match, onClose }) {
  const ref = useRef(null);
  const open = Boolean(match);
  useEffect(() => { if (open && !ref.current.open) ref.current.showModal(); }, [open]);
  function closeOnBackdrop(event) {
    const box = ref.current.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (event.target === ref.current && outside) ref.current.close();
  }
  return (
    <dialog ref={ref} className="sport-dialog" aria-labelledby="sport-dialog-title" onClose={() => { if (!ref.current.open) onClose(); }} onClick={closeOnBackdrop}>
      {match && <>
        <header className="match-header sport-dialog-hero">
          <div className="sport-dialog-top">
            <p className="match-meta"><span>{sport.label}</span><span className="sport-dialog-category">{match.category}</span><span className="sport-dialog-round">{match.round || match.category}</span></p>
            <button type="button" className="sport-dialog-close" aria-label="Close match details" onClick={() => ref.current.close()}>Close</button>
          </div>
          <h2 id="sport-dialog-title" className="match-overview"><Overview match={match} /></h2>
          <p className="match-clock sport-dialog-status">{statusText(match)}</p>
          {match.endedEarly && <p className="match-finish-note">Ended early · completed scores only</p>}
        </header>
        <div className="match-details sport-dialog-details">
          {match.periods
            ? <>
                <div className={`sport-score-table${match.periods.length > 5 ? ' sport-score-scroll' : ''}`} tabIndex={0} role="region" aria-label="Score by set or period, scroll horizontally"><ScoreTable sport={sport} scoring={scoring} match={match} /></div>
                <Legend scoring={scoring} match={match} />
                {match.scorers && <Scorers scoring={scoring} match={match} />}
                {scoring.team && scoring.showLineups !== false && <div className="sport-extra"><h3>Lineups</h3><Participants match={match} /></div>}
              </>
            : <Participants match={match} />}
          {match.events?.length > 0 && <div className="sport-extra"><h3>Match events</h3><ul className="sport-scorers">{match.events.map((e, i) => <li key={i}>{e.type === 'CARD' ? `${e.card === 'red' ? 'Red' : 'Yellow'} card · ${e.player}` : e.type === 'SUB' ? `${e.on} on for ${e.off}` : 'Foul'} · {match.sides[e.side].name}</li>)}</ul></div>}
          <dl className="sport-info">
            <div><dt>Date</dt><dd>{match.dateLabel || 'Not listed'}</dd></div>
            <div><dt>Time</dt><dd>{match.timeLabel || 'Not listed'}</dd></div>
            <div><dt>Tournament</dt><dd>{match.tournament || 'Not listed'}</dd></div>
            <div><dt>Round</dt><dd>{match.round || 'Not listed'}</dd></div>
            <div><dt>Venue</dt><dd>{match.venue || 'Not listed'}</dd></div>
          </dl>
        </div>
      </>}
    </dialog>
  );
}
