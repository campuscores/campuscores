import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import SportIcon from '../../../components/SportIcon.jsx';
import { sportLabel, sideName } from '../operatorMatches.js';
import { DEFAULT_FORMATS, RULE_SOURCES, periodLabel, validateFormat } from '../../../../../shared/scoring.mjs';
import './ScoringPage.css';

function Dialog({ label, onClose, onReturnFocus, children }) {
  const ref = useRef(null);
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => { dialog.close(); onReturnFocus(); }; }, [onReturnFocus]);
  return <dialog ref={ref} className="scoring-dialog" aria-label={label} onCancel={onClose} onClose={onClose}>{children}</dialog>;
}
function FormatForm({ match, disabled, onAction }) {
  const defaults = DEFAULT_FORMATS[match.sport];
  const [format, setFormat] = useState(() => ({ ...defaults }));
  const [custom, setCustom] = useState(false);
  const [scoreText, setScoreText] = useState(() => defaults.scoreValues?.join(', ') ?? '');
  const [error, setError] = useState('');
  const change = (key, value) => { setCustom(true); setFormat(f => ({ ...f, [key]: value })); setError(''); };
  const number = (key, label, min, max, extra = {}) => <label className="format-field">{label}<input type="number" min={min} max={max} step="1" required value={Number.isNaN(format[key]) ? '' : format[key] ?? ''} onChange={e => change(key, e.target.value === '' ? NaN : Number(e.target.value))} {...extra} /></label>;
  async function start(e) {
    e.preventDefault();
    try { await onAction('START', { format: validateFormat(match.sport, match.sport === 'basketball' ? { ...format, scoreValues: scoreText.split(',').map(v => Number(v.trim())) } : format) }); }
    catch (err) { setError(err.message); }
  }
  return <form className="format-form" onSubmit={start}>
    <h2>Choose the match format</h2>
    <p>Check the format with the coach before starting. It stays fixed once scoring begins.</p>
    <label className="format-field">Scoring format<select value={custom ? 'custom' : 'preset'} onChange={e => { const changed = e.target.value === 'custom'; setCustom(changed); if (!changed) { setFormat({ ...defaults }); setScoreText(defaults.scoreValues?.join(', ') ?? ''); } }}><option value="preset">Official scoring preset</option><option value="custom">Custom match format</option></select></label>
    <p className="format-source"><a href={RULE_SOURCES[match.sport][1]} target="_blank" rel="noreferrer">{RULE_SOURCES[match.sport][0]}</a>.{match.sport === 'table-tennis' && ' The preset uses best of 5; choose another odd number below.'}</p>
    <fieldset disabled={disabled}><legend>Match settings</legend><div className="format-grid">
      {format.model === 'periods' ? <>
        {number('periodCount', 'Number of periods', 1, 12)}
        {match.sport === 'basketball' && <label className="format-field">Scoring values (separate with commas)<input value={scoreText} onChange={e => { setScoreText(e.target.value); setCustom(true); }} /></label>}
      </> : <>
        {number('bestOf', 'Best of (odd number of sets)', 1, 15)}
        <label className="format-field">First serving side<select value={format.firstServe} onChange={e => change('firstServe', Number(e.target.value))}>{[0, 1].map(i => <option key={i} value={i}>{sideName(match, i)}</option>)}</select></label>
        {format.model === 'sets' ? <>
          {number('target', 'Points to win a set', 1, 999)}
          {number('winBy', 'Winning margin', 1, 10)}
          {number('decidingTarget', 'Points in the deciding set', 1, 999)}
          <label className="format-field">Golden point at a tied score (optional)<input aria-label="Golden point at a tied score (optional)" aria-describedby="golden-point-hint" type="number" min="0" max="9998" value={format.cap == null ? '' : format.cap - 1} placeholder="No golden point" onChange={e => change('cap', e.target.value === '' ? null : Number(e.target.value) + 1)} /><span id="golden-point-hint" className="format-hint">{format.cap == null ? 'Play until the winning margin is reached.' : `At ${format.cap - 1}–${format.cap - 1}, the next point wins.`}</span></label>
        </> : <>
          {number('gamesPerSet', 'Games to win a set', 1, 20)}
          {number('gameWinBy', 'Winning margin in games', 1, 2)}
          <label className="format-field">Game scoring<select value={String(format.advantage)} onChange={e => change('advantage', e.target.value === 'true')}><option value="true">Advantage</option><option value="false">No-ad (deciding point at deuce)</option></select></label>
          <label className="format-field">Tie-break at games all (optional)<input type="number" min="1" max="30" value={format.tiebreakAt ?? ''} placeholder="No tie-break" onChange={e => change('tiebreakAt', e.target.value === '' ? null : Number(e.target.value))} /></label>
          {number('tiebreakTo', 'Tie-break point target', 1, 99)}
          {number('tiebreakWinBy', 'Tie-break winning margin', 1, 10)}
        </>}
      </>}
    </div></fieldset>
    {error && <p className="text-error" role="alert">{error}</p>}
    {!match.isToday && <p>This match can be started on its scheduled date in India time.</p>}
    {match.validNow === false && <p>The scoring assignment is not valid yet or has expired.</p>}
    <button className="scoring-action is-primary" type="submit" disabled={disabled || !match.isToday || match.validNow === false}>Start match</button>
  </form>;
}
const eventText = (e, match) => e.type === 'CARD' ? `${e.card === 'red' ? 'Red' : 'Yellow'} card · ${e.player} · ${sideName(match, e.side)}`
  : e.type === 'SUB' ? `${e.on} on for ${e.off} · ${sideName(match, e.side)}` : `Foul · ${sideName(match, e.side)}`;

/** Connected presentation only: every mutation goes through the durable queue in ScoreConsole. */
export default function ScoringPage({ match, snapshot, accepted, disabled, pending, onAction, undoTarget, status, error, children }) {
  const [dialog, setDialog] = useState(null);
  const triggerRef = useRef(null);
  const restoreFocus = useCallback(() => triggerRef.current?.focus({ preventScroll: true }), []);
  const [pick, setPick] = useState(0);
  const [player, setPlayer] = useState('');
  const [incoming, setIncoming] = useState('');
  const format = snapshot?.format;
  const winner = snapshot?.winner;
  const final = accepted?.finalized === true;
  const closing = snapshot?.finalized === true;
  const open = (kind, trigger) => { triggerRef.current = trigger; setPick(0); setPlayer(''); setIncoming(''); setDialog(kind); };
  const close = () => setDialog(null);
  async function commit(type, payload = {}) { if (await onAction(type, payload)) close(); }
  const name = i => sideName(match, i);
  const endedPeriods = snapshot?.periods?.filter(p => !p.current).length ?? 0;
  const currentPeriod = snapshot?.periods?.find(p => p.current);
  const waitingExtra = format?.model === 'periods' && !currentPeriod && winner == null;
  return <main className="scoring-page" data-sport={match.sport}>
    <header className="scoring-top"><Link className="scoring-back" to="/operator/matches">My Matches</Link><p className="scoring-meta"><span className="scoring-sport"><SportIcon sport={match.sport} className="scoring-sport-icon" />{sportLabel(match.sport)}</span><span>{match.venue}</span></p><p className="scoring-sync console-status" role="status" aria-live="polite">{status}</p></header>
    <h1 className="scoring-title">{name(0)} vs {name(1)}</h1>
    {error && <p className="text-error" role="alert">{error}</p>}
    {!format ? <FormatForm match={match} disabled={disabled} onAction={onAction} /> : <>
      <div className="score-board" style={{ '--board-bg': `url('/assets/${match.sport}-background.webp')` }}>
        <p className="score-game-no">{final ? 'Final result' : closing ? 'Final confirmation queued' : winner != null ? 'Match point reached · check before confirming' : periodLabel(match.sport, endedPeriods, format)} · {pending ? 'Pending score' : 'Accepted score'}</p>
        <div className="score-sides">{[0, 1].map(i => <div className="score-side" key={i} data-winner={winner === i || undefined}><span className="score-side-name">{snapshot.serve === i && winner == null && <span className="serve-dot" aria-label="Serving" />}{name(i)}</span><span className="score-points" aria-label={`${name(i)} score`}>{format.model === 'periods' || winner != null ? snapshot.sides[i].points : snapshot.gamePoints[i]}</span><span className="score-games">{format.model !== 'periods' ? `${snapshot.sides[i].points} sets won` : `${snapshot.fouls?.[i] ?? 0} fouls`}</span></div>)}</div>
      </div>
      {pending > 0 && <p className="scoring-note">{pending} {pending === 1 ? 'action is' : 'actions are'} saved on this device and awaiting acceptance. Viewers see the last accepted score.</p>}
      {final ? <p className="scoring-result" role="status">{name(winner)} won. Final result · editing locked.</p> : closing ? <p className="scoring-result" role="status">Final confirmation is queued. It becomes final for viewers after the server accepts it.</p> : <>
        {winner == null && !waitingExtra && <div className="score-controls">{[0, 1].map(i => <div className="score-team-controls" key={i}>{(format.model === 'periods' ? format.scoreValues : [1]).map(value => <button type="button" key={value} className="point-btn" disabled={disabled} onClick={() => onAction('POINT', { side: i, ...(format.model === 'periods' ? { value } : {}) })} aria-label={`Add ${value} to ${name(i)}`}><span className="point-plus">+{value}</span><span className="point-name">{name(i)}</span></button>)}</div>)}</div>}
        <div className="scoring-actions">
          <button type="button" className="scoring-action" disabled={disabled || !undoTarget} onClick={() => onAction('REVERSE', {}, undoTarget.actionId)}>Undo last action</button>
          {winner == null && format.model !== 'periods' && <button type="button" className="scoring-action" disabled={disabled} onClick={event => open('set', event.currentTarget)}>End set early</button>}
          {winner == null && format.model === 'periods' && !waitingExtra && <button type="button" className="scoring-action" disabled={disabled} onClick={event => open('period', event.currentTarget)}>End period</button>}
          {waitingExtra && <><p>Scores are tied. Record a deciding extra period before confirming a winner.</p><button type="button" className="scoring-action" disabled={disabled} onClick={() => onAction('EXTRA_PERIOD', {})}>Start extra period</button></>}
        </div>
        {format.model === 'periods' && winner == null && !waitingExtra && <div className="event-controls">{match.sport === 'football' ? <><button className="event-btn" disabled={disabled} onClick={event => open('yellow', event.currentTarget)}>Yellow card</button><button className="event-btn" disabled={disabled} onClick={event => open('red', event.currentTarget)}>Red card</button></> : <button className="event-btn" disabled={disabled} onClick={event => open('foul', event.currentTarget)}>Foul</button>}<button className="event-btn" disabled={disabled} onClick={event => open('sub', event.currentTarget)}>Substitute</button></div>}
        {winner != null && <div className="scoring-result"><span>{name(winner)} won. Check the score before confirming.</span><button className="scoring-action is-primary" disabled={disabled} onClick={event => open('final', event.currentTarget)}>Confirm final result</button></div>}
      </>}
      <section className="scoring-detail" aria-label="Score by set or period"><h2>Score breakdown</h2><div className="score-table-scroll" tabIndex="0" role="region" aria-label="Score breakdown, scroll horizontally"><table className="score-table"><thead><tr><th scope="col">Side</th>{snapshot.periods.map((p, i) => <th key={i} scope="col" className={p.current ? 'is-current' : undefined}>{format.model === 'periods' ? `P${i + 1}` : `S${i + 1}`}</th>)}<th scope="col">Total</th></tr></thead><tbody>{[0, 1].map(side => <tr key={side}><th scope="row">{name(side)}</th>{snapshot.periods.map((p, i) => <td key={i} className={p.current ? 'is-current' : undefined}>{p.winner === side ? <strong>{p.points[side]}</strong> : p.points[side]}{p.tiebreak && <sup>{p.tiebreak[side]}</sup>}{p.manual && <span className="sr-only"> · ended early; {name(p.winner)} awarded the set</span>}</td>)}<td className="match-total">{snapshot.sides[side].points}</td></tr>)}</tbody></table></div><p className="format-hint">Bold scores show set/period winners. {snapshot.periods.some(p => p.manual) && 'A set was ended early; its recorded points are unchanged.'}</p></section>
      {snapshot.events.length > 0 && <section className="scoring-timeline"><h2>Match events</h2><ol className="timeline-list">{snapshot.events.slice(-20).map((event, i) => <li className="timeline-row" key={i}>{eventText(event, match)}</li>)}</ol></section>}
      <details className="format-summary"><summary>Match format</summary><p>{format.model === 'sets' ? `Best of ${format.bestOf}; ${format.target} points, win by ${format.winBy}; deciding set to ${format.decidingTarget}.${format.cap ? ` Golden point at ${format.cap - 1}–${format.cap - 1}.` : ' No golden point.'}` : format.model === 'tennis' ? `Best of ${format.bestOf}; ${format.gamesPerSet} games per set; ${format.advantage ? 'advantage' : 'no-ad'} games; ${format.tiebreakAt == null ? 'no tie-break' : `tie-break at ${format.tiebreakAt}–${format.tiebreakAt}, to ${format.tiebreakTo}, win by ${format.tiebreakWinBy}`}.` : `${format.periodCount} periods; scoring values ${format.scoreValues.join(', ')}. No running clock.`}</p></details>
    </>}
    {children}
    {dialog && <Dialog label={dialog === 'final' ? 'Confirm final result' : dialog === 'set' ? 'End set early' : dialog === 'period' ? 'End period' : 'Record match event'} onClose={close} onReturnFocus={restoreFocus}>
      <form onSubmit={e => { e.preventDefault(); if (dialog === 'final') commit('FINALIZE'); else if (dialog === 'set') commit('END_SET', { winner: pick }); else if (dialog === 'period') commit('END_PERIOD'); else if (dialog === 'sub') commit('SUB', { side: pick, off: player.trim(), on: incoming.trim() }); else if (dialog === 'foul') commit('FOUL', { side: pick }); else commit('CARD', { side: pick, player: player.trim(), card: dialog }); }}>
        <h2 className="scoring-dialog-title">{dialog === 'final' ? 'Make this result final?' : dialog === 'set' ? 'End this set early?' : dialog === 'period' ? 'End this period?' : dialog === 'sub' ? 'Record substitution' : dialog === 'foul' ? 'Record foul' : `Record ${dialog} card`}</h2>
        {dialog === 'final' ? <p>{name(winner)} won {snapshot.sides[winner].points}–{snapshot.sides[1 - winner].points}. After server acceptance, the result is public and cannot be edited.</p> : dialog === 'period' ? <p>Check the period score before continuing.</p> : <>
          <fieldset className="scoring-radios"><legend>{dialog === 'set' ? 'Choose the set winner' : 'Team'}</legend>{[0, 1].map(i => <label className="scoring-radio" key={i}><input type="radio" name="side" value={i} checked={pick === i} onChange={() => setPick(i)} />{name(i)}</label>)}</fieldset>
          {dialog === 'set' && <p>The set keeps its actual points and is marked as ended early. You can undo this before final confirmation.</p>}
          {['yellow', 'red', 'sub'].includes(dialog) && <label className="format-field">{dialog === 'sub' ? 'Player off' : 'Player name'}<input required maxLength="80" value={player} onChange={e => setPlayer(e.target.value)} autoComplete="off" /></label>}
          {dialog === 'sub' && <label className="format-field">Player on<input required maxLength="80" value={incoming} onChange={e => setIncoming(e.target.value)} autoComplete="off" /></label>}
        </>}
        {error && <p className="text-error" role="alert">{error}</p>}
        <div className="scoring-dialog-actions"><button type="button" className="scoring-action" onClick={close}>Cancel</button><button type="submit" className="scoring-action is-primary" disabled={disabled}>{dialog === 'final' ? 'Confirm and lock result' : 'Confirm'}</button></div>
      </form>
    </Dialog>}
  </main>;
}