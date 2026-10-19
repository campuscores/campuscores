import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import SiteHeader from '../../../components/SiteHeader.jsx';
import SportIcon from '../../../components/SportIcon.jsx';
import { sports } from '../../../data/sports.js';
import { findAssignment } from '../operatorMatches.js';
import { maxGames, targetFor } from './scoringConfig.js';
import { useSetScoring, wouldWinMatch } from './useSetScoring.js';
import { seedFromMatch } from './seedActions.js';
import './ScoringPage.css';

const sideName = (match, i) => match.sides[i].name;

/** Native modal that opens whenever `open` is true; closes via Escape, backdrop or its own buttons. */
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

/**
 * Shared scoring console for set-model sports (badminton, table tennis). The sport differs only by
 * its `format` (points target, serve model) and the unit word; everything else is identical.
 *
 * @param {string} sport      sports.js id, for icon/texture
 * @param {string} sportLabel display name
 * @param {string} unit       "Game" or "Set"
 * @param {object} format     format from scoringConfig
 */
export default function SetScoringPage({ sport, sportLabel, unit, format }) {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const match = findAssignment(matchId);

  const [seed] = useState(() => (match?.state === 'live' ? seedFromMatch(match) : []));
  const scoring = useSetScoring(format, seed, null);
  const [submitted, setSubmitted] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishPick, setFinishPick] = useState('0');
  const [confirmWin, setConfirmWin] = useState(false);
  const submitting = useRef(false); // true when "Yes" closed the dialog, so onClose does not undo

  if (!match) {
    return <><SiteHeader /><main className="not-found"><h1>Match not found</h1><Link to="/operator/matches">Back to My Matches</Link></main></>;
  }

  const unitLower = unit.toLowerCase();
  const accent = sports.find(s => s.id === sport)?.color ?? '#526780';
  const needServe = scoring.serve == null && scoring.winner == null;
  const locked = submitted || scoring.winner != null;

  function point(side) {
    const decides = wouldWinMatch(scoring, side, format);
    scoring.point(side);
    if (decides) setConfirmWin(true);
  }

  function submit() {
    // Backend seam: POST the accepted action log for `matchId` here, then navigate on success.
    setSubmitted(true);
    navigate('/operator/matches');
  }

  function openFinish() { setFinishPick('0'); setFinishOpen(true); }
  function confirmFinish() { scoring.finishGame(Number(finishPick)); setFinishOpen(false); }

  const slots = Array.from({ length: maxGames(format) }, (_, i) => scoring.games[i] ?? null);

  return (
    <>
      <SiteHeader />
      <main className="scoring-page" data-sport={sport} style={{ '--sport-accent': accent }}>
        <header className="scoring-top">
          <Link className="scoring-back" to="/operator/matches">← My Matches</Link>
          <p className="scoring-meta"><span className="scoring-sport"><SportIcon sport={sport} className="scoring-sport-icon" />{sportLabel}</span><span>{match.category} · {match.round}</span></p>
          <span className="scoring-sync" data-state="offline" title="Sync state is a display placeholder until the backend exists">Offline · not synced</span>
        </header>

        <div className="score-board" style={{ '--board-bg': `url('/assets/${sport}-background.webp')` }}>
          <p className="score-game-no">{unit} {Math.min(scoring.gameNo, maxGames(format))} · to {targetFor(format, Math.min(scoring.games.length, maxGames(format) - 1))}{format.cap ? ` (cap ${format.cap})` : ''}</p>
          <div className="score-sides">
            {[0, 1].map(i => (
              <div key={i} className="score-side" data-winner={scoring.winner === i || undefined}>
                <span className="score-side-name">{scoring.serve === i && <span className="serve-dot" aria-hidden="true" />}{sideName(match, i)}{scoring.serve === i && <span className="sr-only">, serving</span>}</span>
                <span className="score-points" aria-label={`${sideName(match, i)} points`}>{scoring.current[i]}</span>
                <span className="score-games" aria-label={`${sideName(match, i)} ${unitLower}s won`}>{scoring.score[i]} <span className="score-games-label">{unitLower}s</span></span>
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
          <button type="button" className="scoring-action" disabled={locked || needServe} onClick={openFinish}>Finish {unitLower}</button>
        </div>

        {scoring.winner != null && (
          <div className="scoring-result" role="status">
            <span>{sideName(match, scoring.winner)} won {scoring.score[scoring.winner]}–{scoring.score[1 - scoring.winner]}.</span>
            {submitted ? <span> Result submitted.</span> : <button type="button" className="scoring-action is-primary" onClick={submit}>Submit result</button>}
          </div>
        )}

        <section className="scoring-detail" aria-label={`${sportLabel} score by ${unitLower}`}>
          <table className="score-table" aria-label={`${sportLabel} score by ${unitLower}`}>
            <thead><tr>
              <th scope="col"><span className="sr-only">Side</span></th>
              {slots.map((_, i) => <th key={i} scope="col" className={i === scoring.games.length && !scoring.winner ? 'is-current' : undefined}>{unit[0]}{i + 1}</th>)}
              <th scope="col" className="match-total">{unit}s</th>
            </tr></thead>
            <tbody>{[0, 1].map(side => (
              <tr key={side}>
                <th scope="row">{sideName(match, side)}</th>
                {slots.map((game, i) => <td key={i}>{game ? (game.winner === side ? <strong>{game.points[side]}</strong> : game.points[side]) : <span aria-label="Not played">—</span>}</td>)}
                <td className="match-total">{scoring.score[side]}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>

        <section className="scoring-timeline" aria-label="Recent actions">
          <h2>Recent actions</h2>
          {scoring.timeline.length === 0 ? <p className="scoring-empty">No points yet.</p> : (
            <ol className="timeline-list">{scoring.timeline.slice(-8).reverse().map((event, i) => (
              <li key={i} className={`timeline-row${event.kind === 'game' ? ' is-game' : ''}`}>
                <span className="timeline-what">{event.kind === 'point' ? `Point · ${sideName(match, event.side)}` : `${unit} · ${sideName(match, event.winner)}${event.manual ? ' (manual)' : ''}`}</span>
                <span className="timeline-score">{event.score[0]}<span className="timeline-dash">–</span>{event.score[1]}</span>
              </li>
            ))}</ol>
          )}
        </section>

        {/* Finish game/set: choose the winner with radios (walkover / retirement). */}
        <ScoringDialog open={finishOpen} label={`Finish ${unitLower}`} onClose={() => setFinishOpen(false)}>
          <h2 className="scoring-dialog-title">Finish this {unitLower}</h2>
          <p className="scoring-dialog-text">Award the current {unitLower} to:</p>
          <div className="scoring-radios">
            {[0, 1].map(i => (
              <label key={i} className="scoring-radio">
                <input type="radio" name="finish-winner" value={String(i)} checked={finishPick === String(i)} onChange={() => setFinishPick(String(i))} />
                <span>{sideName(match, i)}</span>
              </label>
            ))}
          </div>
          <div className="scoring-dialog-actions">
            <button type="button" className="scoring-action" onClick={() => setFinishOpen(false)}>Cancel</button>
            <button type="button" className="scoring-action is-primary" onClick={confirmFinish}>Finish {unitLower}</button>
          </div>
        </ScoringDialog>

        {/* Match-deciding point: confirm submission; any dismissal reverts the point once, in onClose. */}
        <ScoringDialog open={confirmWin} label="Confirm match result" onClose={() => { setConfirmWin(false); if (submitting.current) { submitting.current = false; submit(); } else scoring.undo(); }}>
          <h2 className="scoring-dialog-title">Match point</h2>
          <p className="scoring-dialog-text">{scoring.winner != null && `This wins the match for ${sideName(match, scoring.winner)} (${scoring.score[scoring.winner]}–${scoring.score[1 - scoring.winner]}). Submit the result?`}</p>
          <div className="scoring-dialog-actions">
            <button type="button" className="scoring-action" onClick={() => setConfirmWin(false)}>No, undo point</button>
            <button type="button" className="scoring-action is-primary" onClick={() => { submitting.current = true; setConfirmWin(false); }}>Yes, submit</button>
          </div>
        </ScoringDialog>
      </main>
    </>
  );
}
