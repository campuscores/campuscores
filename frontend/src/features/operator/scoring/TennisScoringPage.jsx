import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import SiteHeader from '../../../components/SiteHeader.jsx';
import SportIcon from '../../../components/SportIcon.jsx';
import { sports } from '../../../data/sports.js';
import { findAssignment } from '../operatorMatches.js';
import { tennisFormat, maxSets } from './scoringConfig.js';
import { useTennisScoring, wouldWinMatch } from './useTennisScoring.js';
import { seedTennisFromMatch } from './seedActions.js';
import './ScoringPage.css';

const sideName = (match, i) => match.sides[i].name;

function ScoringDialog({ open, label, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="scoring-dialog" aria-label={label} onClose={onClose} onCancel={onClose}>
      {open && children}
    </dialog>
  );
}

export default function TennisScoringPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const match = findAssignment(matchId);
  const format = tennisFormat();
  const accent = sports.find(s => s.id === 'lawn-tennis')?.color ?? '#598d2a';

  const [seed] = useState(() => (match?.state === 'live' ? seedTennisFromMatch(match) : []));
  const scoring = useTennisScoring(format, seed, null);
  const [submitted, setSubmitted] = useState(false);
  const [confirmWin, setConfirmWin] = useState(false);
  const submitting = useRef(false);

  if (!match) {
    return <><SiteHeader /><main className="not-found"><h1>Match not found</h1><Link to="/operator/matches">Back to My Matches</Link></main></>;
  }

  const needServe = scoring.serve == null && scoring.winner == null;
  const locked = submitted || scoring.winner != null;
  const slots = Array.from({ length: maxSets(format) }, (_, i) => scoring.sets[i] ?? null);

  function point(side) {
    const decides = wouldWinMatch(scoring, side, format);
    scoring.point(side);
    if (decides) setConfirmWin(true);
  }
  function submit() { setSubmitted(true); navigate('/operator/matches'); }

  return (
    <>
      <SiteHeader />
      <main className="scoring-page" data-sport="lawn-tennis" style={{ '--sport-accent': accent }}>
        <header className="scoring-top">
          <Link className="scoring-back" to="/operator/matches">← My Matches</Link>
          <p className="scoring-meta"><span className="scoring-sport"><SportIcon sport="lawn-tennis" className="scoring-sport-icon" />Tennis</span><span>{match.category} · {match.round}</span></p>
          <span className="scoring-sync" data-state="offline" title="Sync state is a display placeholder until the backend exists">Offline · not synced</span>
        </header>

        <div className="score-board" style={{ '--board-bg': `url('/assets/lawn-tennis-background.webp')` }}>
          <p className="score-game-no">Set {Math.min(scoring.setNo, maxSets(format))}{scoring.inTiebreak ? ' · Tiebreak' : ''} · games {scoring.setGames[0]}–{scoring.setGames[1]}</p>
          <div className="score-sides">
            {[0, 1].map(i => (
              <div key={i} className="score-side" data-winner={scoring.winner === i || undefined}>
                <span className="score-side-name">{scoring.serve === i && <span className="serve-dot" aria-hidden="true" />}{sideName(match, i)}{scoring.serve === i && <span className="sr-only">, serving</span>}</span>
                <span className="score-points" aria-label={`${sideName(match, i)} ${scoring.inTiebreak ? 'tiebreak points' : 'game points'}`}>{scoring.gameLabels[i]}</span>
                <span className="score-games">{scoring.score[i]} <span className="score-games-label">sets</span></span>
              </div>
            ))}
          </div>
        </div>

        {needServe ? (
          <div className="serve-prompt" role="group" aria-label="Who serves first?">
            <p>Who serves first?</p>
            <div className="serve-choice">
              {[0, 1].map(i => <button key={i} type="button" className="score-btn" onClick={() => scoring.setServe(i)}>{sideName(match, i)}</button>)}
            </div>
          </div>
        ) : (
          <div className="score-controls">
            {[0, 1].map(i => (
              <button key={i} type="button" className="point-btn" disabled={locked} onClick={() => point(i)} aria-label={`Point to ${sideName(match, i)}`}>
                <span className="point-plus">+1</span>
                <span className="point-name">{sideName(match, i)}</span>
              </button>
            ))}
          </div>
        )}

        {!needServe && scoring.winner == null && (
          <p className="serve-override">Serving: <strong>{sideName(match, scoring.serve)}</strong> · <button type="button" className="serve-swap" onClick={() => scoring.setServe(1 - scoring.serve)}>switch</button></p>
        )}

        <div className="scoring-actions">
          <button type="button" className="scoring-action" disabled={locked || scoring.actionCount === 0} onClick={scoring.undo}>Undo</button>
        </div>

        {scoring.winner != null && (
          <div className="scoring-result" role="status">
            <span>{sideName(match, scoring.winner)} won {scoring.score[scoring.winner]}–{scoring.score[1 - scoring.winner]} (sets).</span>
            {submitted ? <span> Result submitted.</span> : <button type="button" className="scoring-action is-primary" onClick={submit}>Submit result</button>}
          </div>
        )}

        <section className="scoring-detail" aria-label="Tennis score by set">
          <table className="score-table" aria-label="Tennis score by set">
            <thead><tr>
              <th scope="col"><span className="sr-only">Side</span></th>
              {slots.map((_, i) => <th key={i} scope="col" className={i === scoring.sets.length && !scoring.winner ? 'is-current' : undefined}>S{i + 1}</th>)}
              <th scope="col" className="match-total">Sets</th>
            </tr></thead>
            <tbody>{[0, 1].map(side => (
              <tr key={side}>
                <th scope="row">{sideName(match, side)}</th>
                {slots.map((set, i) => {
                  if (!set) {
                    // Show live games for the in-progress set, dash for not-yet-played.
                    if (i === scoring.sets.length && !scoring.winner) return <td key={i} className="is-current">{scoring.setGames[side]}</td>;
                    return <td key={i}><span aria-label="Not played">—</span></td>;
                  }
                  const won = set.winner === side;
                  return <td key={i}>{won ? <strong>{set.games[side]}</strong> : set.games[side]}{set.tiebreak && <sup className="tiebreak">{set.tiebreak[side]}</sup>}</td>;
                })}
                <td className="match-total">{scoring.score[side]}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>

        <section className="scoring-timeline" aria-label="Recent actions">
          <h2>Recent actions</h2>
          {scoring.timeline.length === 0 ? <p className="scoring-empty">No points yet.</p> : (
            <ol className="timeline-list">{scoring.timeline.slice(-8).reverse().map((event, i) => (
              <li key={i} className={`timeline-row${event.kind !== 'point' ? ' is-game' : ''}`}>
                <span className="timeline-what">
                  {event.kind === 'point' ? `Point · ${sideName(match, event.side)}`
                    : event.kind === 'game' ? `Game · ${sideName(match, event.winner)}`
                    : `Set · ${sideName(match, event.winner)}`}
                </span>
                <span className="timeline-score">{event.kind === 'point'
                  ? (event.tiebreak ? `${event.raw[0]}–${event.raw[1]}` : 'point')
                  : `${event.games[0]}–${event.games[1]}`}</span>
              </li>
            ))}</ol>
          )}
        </section>

        <ScoringDialog open={confirmWin} label="Confirm match result" onClose={() => { setConfirmWin(false); if (submitting.current) { submitting.current = false; submit(); } else scoring.undo(); }}>
          <h2 className="scoring-dialog-title">Match point</h2>
          <p className="scoring-dialog-text">{scoring.winner != null && `This wins the match for ${sideName(match, scoring.winner)} (${scoring.score[scoring.winner]}–${scoring.score[1 - scoring.winner]} sets). Submit the result?`}</p>
          <div className="scoring-dialog-actions">
            <button type="button" className="scoring-action" onClick={() => setConfirmWin(false)}>No, undo point</button>
            <button type="button" className="scoring-action is-primary" onClick={() => { submitting.current = true; setConfirmWin(false); }}>Yes, submit</button>
          </div>
        </ScoringDialog>
      </main>
    </>
  );
}
