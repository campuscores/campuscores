import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import SiteHeader from '../../../components/SiteHeader.jsx';
import SportIcon from '../../../components/SportIcon.jsx';
import { sports } from '../../../data/sports.js';
import { findAssignment } from '../operatorMatches.js';
import { usePeriodScoring } from './usePeriodScoring.js';
import './ScoringPage.css';

const sideName = (match, i) => match.sides[i].name;
const roster = (match, side) => match.sides[side].players.map(p => p.name);

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

/** A labelled list of radio tiles (team or player picker). */
function RadioList({ name, options, value, onChange }) {
  return (
    <div className="scoring-radios">
      {options.map(opt => (
        <label key={opt.value} className="scoring-radio">
          <input type="radio" name={name} value={opt.value} checked={value === opt.value} onChange={() => onChange(opt.value)} />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Shared player-attributed console for period-model sports (football, basketball).
 * @param {string} sport sports.js id
 * @param {string} sportLabel display name
 * @param {object} format from scoringConfig (periods, scoreValues, events)
 * @param {object} labels { score, scoreVerb, foulOrCard } sport wording
 */
export default function PeriodScoringPage({ sport, sportLabel, format, labels }) {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const match = findAssignment(matchId);
  const accent = sports.find(s => s.id === sport)?.color ?? '#263653';

  const scoring = usePeriodScoring([]);
  const [submitted, setSubmitted] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  // Active dialog: { kind: 'score'|'card'|'foul'|'sub', step, side, player, value, card, off, on }
  const [dialog, setDialog] = useState(null);

  if (!match) {
    return <><SiteHeader /><main className="not-found"><h1>Match not found</h1><Link to="/operator/matches">Back to My Matches</Link></main></>;
  }

  const locked = submitted;
  const teamOptions = [0, 1].map(i => ({ value: String(i), label: sideName(match, i) }));
  const playerOptions = side => roster(match, side).map(n => ({ value: n, label: n }));

  function open(kind) { setDialog({ kind, step: 'team', side: null, player: null, value: format.scoreValues[0], card: 'yellow', off: null, on: null }); }
  function update(patch) { setDialog(d => ({ ...d, ...patch })); }
  function close() { setDialog(null); }

  function commit() {
    const d = dialog;
    if (d.kind === 'score') scoring.addScore(Number(d.side), d.player, Number(d.value));
    else if (d.kind === 'card') scoring.addCard(Number(d.side), d.player, d.card);
    else if (d.kind === 'foul') scoring.addFoul(Number(d.side), d.player);
    else if (d.kind === 'sub') scoring.addSub(Number(d.side), d.off, d.on);
    close();
  }

  function submit() { setSubmitted(true); navigate('/operator/matches'); }

  const hasScore = format.events.includes('goal') || format.events.includes('basket');

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
          <p className="score-game-no">{format.periods[scoring.period]}</p>
          <div className="score-sides">
            {[0, 1].map(i => (
              <div key={i} className="score-side">
                <span className="score-side-name">{sideName(match, i)}</span>
                <span className="score-points" aria-label={`${sideName(match, i)} ${labels.score}`}>{scoring.score[i]}</span>
                <span className="score-games">{labels.foulOrCard === 'foul' ? `${scoring.teamFouls[i]} fouls` : ''}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Period control */}
        <div className="period-tabs" role="group" aria-label="Match period">
          {format.periods.map((label, i) => (
            <button key={label} type="button" className="period-tab" aria-pressed={scoring.period === i} disabled={locked} onClick={() => scoring.setPeriod(i)}>{label}</button>
          ))}
        </div>

        {/* Event controls */}
        <div className="event-controls">
          {hasScore && <button type="button" className="event-btn is-score" disabled={locked} onClick={() => open('score')}>{labels.scoreVerb}</button>}
          {format.events.includes('card') && <>
            <button type="button" className="event-btn is-yellow" disabled={locked} onClick={() => open('card')}>Card</button>
          </>}
          {format.events.includes('foul') && <button type="button" className="event-btn" disabled={locked} onClick={() => open('foul')}>Foul</button>}
          {format.events.includes('sub') && <button type="button" className="event-btn" disabled={locked} onClick={() => open('sub')}>Substitute</button>}
          <button type="button" className="event-btn" disabled={locked || scoring.actionCount === 0} onClick={scoring.undo}>Undo</button>
        </div>

        <div className="scoring-actions">
          <button type="button" className="scoring-action is-primary" disabled={locked} onClick={() => setConfirmSubmit(true)}>Submit result</button>
        </div>

        {submitted && <div className="scoring-result" role="status"><span>Result submitted · {sideName(match, 0)} {scoring.score[0]}–{scoring.score[1]} {sideName(match, 1)}.</span></div>}

        {/* Event feed */}
        <section className="scoring-timeline" aria-label="Match events">
          <h2>Match events</h2>
          {scoring.feed.length === 0 ? <p className="scoring-empty">No events yet.</p> : (
            <ol className="timeline-list">{scoring.feed.slice(-10).reverse().map((e, i) => (
              <li key={i} className={`timeline-row${e.kind === 'period' ? ' is-game' : ''}`}>
                <span className="timeline-what">
                  {e.kind === 'score' && `${labels.score === 'points' ? 'Basket' : 'Goal'} · ${e.player} (${sideName(match, e.side)})${e.value > 1 ? ` +${e.value}` : ''}`}
                  {e.kind === 'card' && `${e.card === 'red' ? 'Red card' : e.second ? 'Second yellow → red' : 'Yellow card'} · ${e.player} (${sideName(match, e.side)})`}
                  {e.kind === 'foul' && `Foul · ${e.player} (${sideName(match, e.side)})`}
                  {e.kind === 'sub' && `Sub · ${e.on} for ${e.off} (${sideName(match, e.side)})`}
                  {e.kind === 'period' && format.periods[e.index]}
                </span>
              </li>
            ))}</ol>
          )}
        </section>

        {/* Per-player contributions */}
        <section className="scoring-detail" aria-label="Player contributions">
          <div className="player-stats">
            {[0, 1].map(side => (
              <div key={side} className="player-stat-col">
                <h3>{sideName(match, side)}</h3>
                <ul>
                  {roster(match, side).map(name => {
                    const p = scoring.players[side][name];
                    const bits = [];
                    if (p?.points) bits.push(labels.score === 'points' ? `${p.points} pts` : `${p.points} ${p.points === 1 ? 'goal' : 'goals'}`);
                    if (p?.yellow) bits.push(`${p.yellow}Y`);
                    if (p?.red) bits.push('R');
                    if (p?.fouls) bits.push(`${p.fouls} ${p.fouls === 1 ? 'foul' : 'fouls'}`);
                    return <li key={name} className={p?.off ? 'is-off' : undefined}>{name}{p?.off && ' (off)'}{bits.length > 0 && <span className="player-bits">{bits.join(' · ')}</span>}</li>;
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Attribution dialog */}
        <ScoringDialog open={dialog != null} label={dialog?.kind ?? 'event'} onClose={close}>
          {dialog && (dialog.step === 'team' ? (
            <>
              <h2 className="scoring-dialog-title">{dialog.kind === 'sub' ? 'Substitution' : dialog.kind === 'score' ? labels.scoreVerb : dialog.kind === 'card' ? 'Card' : 'Foul'}</h2>
              <p className="scoring-dialog-text">Which team?</p>
              <RadioList name="team" options={teamOptions} value={dialog.side} onChange={v => update({ side: v })} />
              <div className="scoring-dialog-actions">
                <button type="button" className="scoring-action" onClick={close}>Cancel</button>
                <button type="button" className="scoring-action is-primary" disabled={dialog.side == null} onClick={() => update({ step: 'detail' })}>Next</button>
              </div>
            </>
          ) : (
            <>
              <h2 className="scoring-dialog-title">{sideName(match, Number(dialog.side))}</h2>
              {dialog.kind === 'score' && format.scoreValues.length > 1 && (
                <>
                  <p className="scoring-dialog-text">Points</p>
                  <div className="score-value-row">
                    {format.scoreValues.map(v => (
                      <button key={v} type="button" className="score-value-btn" aria-pressed={Number(dialog.value) === v} onClick={() => update({ value: v })}>+{v}</button>
                    ))}
                  </div>
                </>
              )}
              {dialog.kind === 'card' && (
                <>
                  <p className="scoring-dialog-text">Card</p>
                  <RadioList name="card" options={[{ value: 'yellow', label: 'Yellow' }, { value: 'red', label: 'Red' }]} value={dialog.card} onChange={v => update({ card: v })} />
                </>
              )}
              {dialog.kind === 'sub' ? (
                <>
                  <p className="scoring-dialog-text">Player off</p>
                  <RadioList name="off" options={playerOptions(Number(dialog.side))} value={dialog.off} onChange={v => update({ off: v })} />
                  <p className="scoring-dialog-text">Player on</p>
                  <RadioList name="on" options={playerOptions(Number(dialog.side)).filter(o => o.value !== dialog.off)} value={dialog.on} onChange={v => update({ on: v })} />
                </>
              ) : (
                <>
                  <p className="scoring-dialog-text">Player</p>
                  <RadioList name="player" options={playerOptions(Number(dialog.side))} value={dialog.player} onChange={v => update({ player: v })} />
                </>
              )}
              <div className="scoring-dialog-actions">
                <button type="button" className="scoring-action" onClick={() => update({ step: 'team' })}>Back</button>
                <button type="button" className="scoring-action is-primary" disabled={dialog.kind === 'sub' ? (!dialog.off || !dialog.on) : !dialog.player} onClick={commit}>Confirm</button>
              </div>
            </>
          ))}
        </ScoringDialog>

        {/* Submit confirmation */}
        <ScoringDialog open={confirmSubmit} label="Confirm submit" onClose={() => setConfirmSubmit(false)}>
          <h2 className="scoring-dialog-title">Submit result?</h2>
          <p className="scoring-dialog-text">{sideName(match, 0)} {scoring.score[0]}–{scoring.score[1]} {sideName(match, 1)}. Scoring will lock and you return to My Matches.</p>
          <div className="scoring-dialog-actions">
            <button type="button" className="scoring-action" onClick={() => setConfirmSubmit(false)}>Cancel</button>
            <button type="button" className="scoring-action is-primary" onClick={() => { setConfirmSubmit(false); submit(); }}>Submit</button>
          </div>
        </ScoringDialog>
      </main>
    </>
  );
}
