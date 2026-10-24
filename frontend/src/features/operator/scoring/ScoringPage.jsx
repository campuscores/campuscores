import { useCallback, useEffect, useRef, useState } from 'react';
import SportIcon from '../../../components/SportIcon.jsx';
import { sportLabel, sideName } from '../operatorMatches.js';
import { DEFAULT_FORMATS, RULE_SOURCES, periodLabel, validateFormat } from '../../../../../shared/scoring.mjs';
import { startReasonText } from '../../staff/labels.js';
import FormatSettings from './FormatSettings.jsx';
import './ScoringPage.css';

function Dialog({ label, onClose, onReturnFocus, children }) {
  const ref = useRef(null);
  useEffect(() => { const dialog = ref.current; dialog.showModal(); dialog.querySelector('[data-safe-focus]')?.focus(); return () => { dialog.close(); onReturnFocus(); }; }, [onReturnFocus]);
  return <dialog ref={ref} className="scoring-dialog" aria-label={label} onCancel={onClose} onClose={onClose}>{children}</dialog>;
}
function FormatForm({ match, disabled, onAction }) {
  // The Tournament_Sport Default_Format comes first (Req 10.7); the Official_Preset stays a choice.
  const formats = { default: match.defaultFormat ?? DEFAULT_FORMATS[match.sport], preset: DEFAULT_FORMATS[match.sport] };
  const [choice, setChoice] = useState('default');
  const [format, setFormat] = useState(() => ({ ...formats.default }));
  const [scoreText, setScoreText] = useState(() => formats.default.scoreValues?.join(', ') ?? '');
  const [error, setError] = useState('');
  const change = (key, value) => { setChoice('custom'); setFormat(f => ({ ...f, [key]: value })); setError(''); };
  const choose = next => { setChoice(next); if (next !== 'custom') { setFormat({ ...formats[next] }); setScoreText(formats[next].scoreValues?.join(', ') ?? ''); } };
  const reason = match.canStart ? null : startReasonText(match);
  async function start(e) {
    e.preventDefault();
    try { await onAction('START', { format: validateFormat(match.sport, match.sport === 'basketball' ? { ...format, scoreValues: scoreText.split(',').map(v => Number(v.trim())) } : format) }); }
    catch (err) { setError(err.message); }
  }
  return <form className="format-form" onSubmit={start}>
    <h2>Choose the match format</h2>
    <p>Check the format with the coach before starting. It stays fixed once scoring begins.</p>
    <label className="format-field">Scoring format<select value={choice} onChange={e => choose(e.target.value)}><option value="default">Tournament default format</option><option value="preset">Official scoring preset</option><option value="custom">Changed for this match</option></select></label>
    <p className="format-source"><a href={RULE_SOURCES[match.sport][1]} target="_blank" rel="noreferrer">{RULE_SOURCES[match.sport][0]}</a>.{match.sport === 'table-tennis' && ' The preset uses best of 5; choose another odd number below.'}</p>
    <fieldset disabled={disabled}><legend>Match settings</legend>
      <FormatSettings sport={match.sport} format={format} scoreText={scoreText} onChange={change}
        onScoreText={text => { setScoreText(text); setChoice('custom'); }} sideName={i => sideName(match, i)} />
    </fieldset>
    {error && <p className="text-error" role="alert">{error}</p>}
    {reason && <p>{reason}</p>}
    {match.validNow === false && <p>The scoring assignment is not valid yet or has expired.</p>}
    {/* canStart is the server START rule at load time; the server still decides, and a refusal pauses the queue. */}
    <button className="scoring-action is-primary" type="submit" disabled={disabled || !match.canStart || match.validNow === false}>Start match</button>
  </form>;
}
const eventText = (e, match) => e.type === 'CARD' ? `${e.card === 'red' ? 'Red' : 'Yellow'} card · ${e.player} · ${sideName(match, e.side)}`
  : e.type === 'SUB' ? `${e.on} on for ${e.off} · ${sideName(match, e.side)}` : `Foul · ${sideName(match, e.side)}`;

/** Connected presentation only: every mutation goes through the durable queue in ScoreConsole. */
export default function ScoringPage({ match, snapshot, accepted, disabled, pending, onAction, undoTarget, status, notice, error, children }) {
  const [dialog, setDialog] = useState(null);
  const triggerRef = useRef(null);
  const restoreFocus = useCallback(() => triggerRef.current?.focus({ preventScroll: true }), []);
  const [pick, setPick] = useState(0);
  const [lockAcknowledged, setLockAcknowledged] = useState(false);
  const [player, setPlayer] = useState('');
  const [incoming, setIncoming] = useState('');
  const format = snapshot?.format;
  const winner = snapshot?.winner;
  const final = accepted?.finalized === true;
  const closing = snapshot?.finalized === true;
  const reviewRef = useRef(null);
  useEffect(() => {
    if (winner != null && !closing && !final) reviewRef.current?.focus();
  }, [winner, closing, final]);
  const open = (kind, trigger) => { triggerRef.current = trigger; setPick(kind === 'match' ? null : 0); setLockAcknowledged(false); setPlayer(''); setIncoming(''); setDialog(kind); };
  const close = () => setDialog(null);
  async function commit(type, payload = {}) { if (await onAction(type, payload)) close(); }
  const name = i => sideName(match, i);
  const endedPeriods = snapshot?.periods?.filter(p => !p.current).length ?? 0;
  const currentPeriod = snapshot?.periods?.find(p => p.current);
  const waitingExtra = format?.model === 'periods' && !currentPeriod && winner == null;
  // Content of the StaffShell <main>: the shell gives the "<A> vs <B>" h1 and the Back link (ScoreConsole).
  return <div className="scoring-page" data-sport={match.sport}>
    {notice}
    <header className="scoring-top"><p className="scoring-meta"><span className="scoring-sport"><SportIcon sport={match.sport} className="scoring-sport-icon" />{sportLabel(match.sport)}</span><span>{match.venue}</span></p><p className="scoring-sync console-status" role="status" aria-live="polite">{status}</p></header>
    {error && <p className="text-error" role="alert">{error}</p>}
    {!format ? <FormatForm match={match} disabled={disabled} onAction={onAction} /> : <>
      <div className="score-board" style={{ '--board-bg': `url('/assets/${match.sport}-background.webp')` }}>
        <p className="score-game-no">{final ? 'Result locked' : closing ? 'Result lock waiting to sync' : winner != null ? 'Match ended · review result' : periodLabel(match.sport, endedPeriods, format)} · {pending ? 'Pending score' : 'Accepted score'}</p>
        <div className="score-sides">{[0, 1].map(i => <div className="score-side" key={i} data-winner={winner === i || undefined}><span className="score-side-name">{snapshot.serve === i && winner == null && <span className="serve-dot" aria-label="Serving" />}{name(i)}</span><span className="score-points" aria-label={`${name(i)} score`}>{format.model === 'periods' || winner != null ? snapshot.sides[i].points : snapshot.gamePoints[i]}</span><span className="score-games">{format.model !== 'periods' ? `${snapshot.sides[i].points} ${snapshot.sides[i].points === 1 ? 'set' : 'sets'} won` : `${snapshot.fouls?.[i] ?? 0} fouls`}</span></div>)}</div>
      </div>
      {pending > 0 && <p className="scoring-note">{pending} {pending === 1 ? 'action is' : 'actions are'} saved on this device and awaiting acceptance. Viewers see the last accepted score.</p>}
      <p className="scoring-lock-help">Ending play can be undone. Locking the final result permanently removes scoring and Undo.</p>
      {final ? <div className="scoring-result is-locked" role="status"><strong>Result permanently locked</strong><p>{name(winner)} won. Scoring and Undo are no longer available.</p></div> : closing ? <div className="scoring-result" role="status"><strong>Result lock saved on this device</strong><p>Scoring and Undo have stopped here. The result becomes public and permanently locked when it syncs.</p></div> : <>
        {winner == null && !waitingExtra && <div className="score-controls">{[0, 1].map(i => <div className="score-team-controls" key={i}>{(format.model === 'periods' ? format.scoreValues : [1]).map(value => <button type="button" key={value} className="point-btn" disabled={disabled} onClick={() => onAction('POINT', { side: i, ...(format.model === 'periods' ? { value } : {}) })} aria-label={`Add ${value} to ${name(i)}`}><span className="point-plus">+{value}</span><span className="point-name">{name(i)}</span></button>)}</div>)}</div>}
        <div className="scoring-actions">
          <button type="button" className="scoring-action" disabled={disabled || !undoTarget} onClick={() => onAction('REVERSE', {}, undoTarget.actionId)}>Undo last action</button>
          {winner == null && !waitingExtra && <button type="button" className="scoring-action" disabled={disabled} onClick={event => open('match', event.currentTarget)}>End match early</button>}
          {winner == null && format.model !== 'periods' && <button type="button" className="scoring-action" disabled={disabled} onClick={event => open('set', event.currentTarget)}>End set early</button>}
          {winner == null && format.model === 'periods' && !waitingExtra && <button type="button" className="scoring-action" disabled={disabled} onClick={event => open('period', event.currentTarget)}>End period</button>}
          {waitingExtra && (match.sport === 'football' ? <p>Scores are tied. The organizer must agree the football tie policy before this result can be finalized.</p> : <><p>Scores are tied. Record a deciding extra period before confirming a winner.</p><button type="button" className="scoring-action" disabled={disabled} onClick={() => onAction('EXTRA_PERIOD', {})}>Start extra period</button></>)}
        </div>
        {format.model === 'periods' && winner == null && !waitingExtra && <div className="event-controls">{match.sport === 'football' ? <><button className="event-btn" disabled={disabled} onClick={event => open('yellow', event.currentTarget)}>Yellow card</button><button className="event-btn" disabled={disabled} onClick={event => open('red', event.currentTarget)}>Red card</button></> : <button className="event-btn" disabled={disabled} onClick={event => open('foul', event.currentTarget)}>Foul</button>}<button className="event-btn" disabled={disabled} onClick={event => open('sub', event.currentTarget)}>Substitute</button></div>}
        {winner != null && <section className="scoring-result result-review" aria-labelledby="result-review-title"><h2 id="result-review-title" ref={reviewRef} tabIndex={-1}>Match ended · result not locked</h2><p><strong>Winner: {name(winner)}</strong></p><p>{snapshot.endedEarly ? 'Ended early. Only completed sets or periods count.' : 'Check the winner and recorded score.'} Undo is still available until you lock the result.</p><button type="button" className="scoring-action is-primary" disabled={disabled} onClick={event => open('final', event.currentTarget)}>Review final result</button></section>}
      </>}
      <section className="scoring-detail" aria-label="Score by set or period"><h2>Score breakdown</h2><div className="score-table-scroll" tabIndex="0" role="region" aria-label="Score breakdown, scroll horizontally"><table className="score-table"><thead><tr><th scope="col">Side</th>{snapshot.periods.map((p, i) => <th key={i} scope="col" className={p.current ? 'is-current' : undefined}>{format.model === 'periods' ? `P${i + 1}` : `S${i + 1}`}</th>)}<th scope="col">Total</th></tr></thead><tbody>{[0, 1].map(side => <tr key={side}><th scope="row">{name(side)}</th>{snapshot.periods.map((p, i) => <td key={i} className={p.current ? 'is-current' : undefined}>{p.winner === side ? <strong>{p.points[side]}</strong> : p.points[side]}{p.tiebreak && <sup>{p.tiebreak[side]}</sup>}{p.manual && <span className="sr-only"> · ended early; {name(p.winner)} awarded the set</span>}</td>)}<td className="match-total">{snapshot.sides[side].points}</td></tr>)}</tbody></table></div><p className="format-hint">Bold scores show set/period winners. {snapshot.periods.some(p => p.manual) && 'A set was ended early; its recorded points are unchanged.'}</p></section>
      {snapshot.events.length > 0 && <section className="scoring-timeline"><h2>Match events</h2><ol className="timeline-list">{snapshot.events.slice(-20).map((event, i) => <li className="timeline-row" key={i}>{eventText(event, match)}</li>)}</ol></section>}
      <details className="format-summary"><summary>Match format</summary><p>{format.model === 'sets' ? `Best of ${format.bestOf}; ${format.target} points, win by ${format.winBy}; deciding set to ${format.decidingTarget}.${format.cap ? ` Golden point at ${format.cap - 1}–${format.cap - 1}.` : ' No golden point.'}` : format.model === 'tennis' ? `Best of ${format.bestOf}; ${format.gamesPerSet} games per set; ${format.advantage ? 'advantage' : 'no-ad'} games; ${format.tiebreakAt == null ? 'no tie-break' : `tie-break at ${format.tiebreakAt}–${format.tiebreakAt}, to ${format.tiebreakTo}, win by ${format.tiebreakWinBy}`}.` : `${format.periodCount} periods; scoring values ${format.scoreValues.join(', ')}. No running clock.`}</p></details>
    </>}
    {children}
    {dialog && <Dialog label={dialog === 'final' ? 'Confirm final result' : dialog === 'match' ? 'End match early' : dialog === 'set' ? 'End set early' : dialog === 'period' ? 'End period' : 'Record match event'} onClose={close} onReturnFocus={restoreFocus}>
      <form onSubmit={e => { e.preventDefault(); if (dialog === 'final') { if (lockAcknowledged) commit('FINALIZE'); } else if (dialog === 'match') { if (pick != null) commit('END_MATCH', { winner: pick }); } else if (dialog === 'set') commit('END_SET', { winner: pick }); else if (dialog === 'period') commit('END_PERIOD'); else if (dialog === 'sub') commit('SUB', { side: pick, off: player.trim(), on: incoming.trim() }); else if (dialog === 'foul') commit('FOUL', { side: pick }); else commit('CARD', { side: pick, player: player.trim(), card: dialog }); }}>
        <h2 className="scoring-dialog-title">{dialog === 'final' ? 'Lock this result permanently?' : dialog === 'match' ? 'End the whole match early?' : dialog === 'set' ? 'End this set early?' : dialog === 'period' ? 'End this period?' : dialog === 'sub' ? 'Record substitution' : dialog === 'foul' ? 'Record foul' : `Record ${dialog} card`}</h2>
        {dialog === 'final' ? <><dl className="final-score-review">{[0, 1].map(i => <div key={i}><dt>{name(i)}{winner === i ? ' · Winner' : ''}</dt><dd>{snapshot.sides[i].points}</dd></div>)}</dl><div className="lock-warning"><strong>Scoring and Undo will stop</strong><p>Scoring and Undo stop immediately. When this syncs, the result is public and permanently locked.</p></div><label className="lock-acknowledgement"><input type="checkbox" checked={lockAcknowledged} onChange={event => setLockAcknowledged(event.target.checked)} required />I understand that this permanently locks the result and removes Undo.</label></> : dialog === 'period' ? <p>Check the period score before continuing.</p> : <>
          <fieldset className="scoring-radios"><legend>{dialog === 'match' ? 'Choose the match winner' : dialog === 'set' ? 'Choose the set winner' : 'Team'}</legend>{[0, 1].map(i => <label className="scoring-radio" key={i}><input type="radio" name="side" value={i} checked={pick === i} onChange={() => setPick(i)} />{name(i)}</label>)}</fieldset>
          {dialog === 'match' && <p>The unfinished set or period will not count or appear in the result. Completed scores stay unchanged. You can undo this before locking the final result.</p>}
          {dialog === 'set' && <p>The set keeps its actual points and is marked as ended early. You can undo this before final confirmation.</p>}
          {['yellow', 'red', 'sub'].includes(dialog) && <label className="format-field">{dialog === 'sub' ? 'Player off' : 'Player name'}<input required maxLength="80" value={player} onChange={e => setPlayer(e.target.value)} autoComplete="off" /></label>}
          {dialog === 'sub' && <label className="format-field">Player on<input required maxLength="80" value={incoming} onChange={e => setIncoming(e.target.value)} autoComplete="off" /></label>}
        </>}
        {error && <p className="text-error" role="alert">{error}</p>}
        <div className="scoring-dialog-actions"><button type="button" className="scoring-action" data-safe-focus onClick={close}>Cancel</button><button type="submit" className="scoring-action is-primary" disabled={disabled || (dialog === 'final' && !lockAcknowledged) || (dialog === 'match' && pick == null)}>{dialog === 'final' ? 'Lock result permanently' : dialog === 'match' ? 'End match early' : 'Confirm'}</button></div>
      </form>
    </Dialog>}
  </div>;
}