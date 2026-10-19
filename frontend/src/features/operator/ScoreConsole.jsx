import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router';
import { apiFetch } from '../../services/api.js';
import { emptyQueue, nextClientSeq, nextToSend, queueReducer, restoreQueue, retryDelay } from './queue.js';
import { deviceId, loadActions, saveAction } from './queueStore.js';
import { isClosed, sideName, sportLabel, stageLabel } from './operatorMatches.js';
import './MyMatches.css';
// RESTORE replaces the state with the stored queue after a reload (Req 19.8); every other event is the pure reducer.
const reducer = (state, event) => (event.type === 'RESTORE' ? restoreQueue(event.records) : queueReducer(state, event));
// Keeps whichever accepted snapshot has the higher Server_Sequence.
const newer = (a, b) => (!b || (a && a.seq >= b.seq) ? a : b);
const unsynced = items => items.filter(i => i.status !== 'synced');
/** Accepted points plus the effect of every action the server has not accepted yet (Req 19.9). */
function pendingPoints(accepted, items) {
  const points = [0, 1].map(i => accepted?.sides?.[i]?.points ?? 0);
  for (const item of unsynced(items)) {
    const side = item.type === 'POINT' ? item.payload.side : items.find(i => i.actionId === item.reversesActionId)?.payload.side;
    if (side === 0 || side === 1) points[side] += item.type === 'POINT' ? 1 : -1;
  }
  return points;
}
function statusLine(queue, online) {
  const waiting = unsynced(queue.items).length;
  if (queue.paused) return `Requires attention: ${queue.paused}`;
  if (!online) return `Offline · ${waiting} queued`;
  if (queue.inFlight) return `Syncing · ${waiting} queued`;
  if (waiting) return `Online · ${waiting} queued`;
  const last = queue.items.findLast(i => i.status === 'synced');
  return last ? `Synced up to seq ${last.seq}` : 'Online';
}
const describe = (item, match) => item.type === 'POINT' ? `Point to ${sideName(match, item.payload.side)}` : 'Undo';
const itemStatus = item => item.status === 'synced' ? `synced, seq ${item.seq}` : item.status;
/**
 * Scoring console for one assigned match: scorer lease, Offline_Queue and Test_Engine controls (Req 19.2–19.10).
 * `getToken` comes from Clerk in AuthArea; this component loads no Clerk code itself.
 */
export default function ScoreConsole({ matchId, getToken }) {
  const [match, setMatch] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [accepted, setAccepted] = useState(null); // { seq, sides: [{ name, points }] }
  const [lease, setLease] = useState(null); // { lastClientSeq } once this device holds the lease
  const [leaseError, setLeaseError] = useState(null);
  const [device, setDevice] = useState(null);
  const [ready, setReady] = useState(false);
  const [storeError, setStoreError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, dispatch] = useReducer(reducer, emptyQueue);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = () => { setOnline(true); setLeaseError(err => (err?.status ? err : null)); }; // retry a lease lost to the network
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);
  // The assignment row, the device ID and the stored queue; the queue works offline once restored.
  useEffect(() => {
    let stopped = false;
    Promise.all([deviceId(), loadActions(matchId)]).then(([id, records]) => {
      if (stopped) return;
      setDevice(id);
      dispatch({ type: 'RESTORE', records });
      setAccepted(a => records.reduce((best, r) => newer(best, r.snapshot && { seq: r.seq, sides: r.snapshot.sides }), a));
      setReady(true);
    }, () => { if (!stopped) setStoreError('This browser cannot store the offline queue, so scoring is not available here. Try another browser, or leave private browsing.'); });
    (async () => apiFetch('/operator/matches', { token: await getToken() }))().then(data => {
      if (stopped) return;
      const found = data?.matches?.find(m => String(m.id) === matchId);
      if (found) setMatch(found);
      else setLoadError({ message: 'This match is not assigned to you.' });
    }, err => { if (!stopped) setLoadError(err); });
    // shortcut: the public match read is cached and skips custom matches; switch to the match Live_Room if the accepted score lags.
    apiFetch(`/matches/${matchId}`).then(data => {
      const { seq, snapshot } = data?.match ?? {};
      if (!stopped && snapshot?.sides) setAccepted(a => newer(a, { seq, sides: snapshot.sides }));
    }, () => {}); // no snapshot yet or not public: the console starts from zero
    return () => { stopped = true; };
  }, [matchId, getToken]);
  /** Requests the scorer lease; `takeover` moves it from this account's other device (Req 14.6–14.8). */
  const acquire = useCallback(takeover => (async () => apiFetch(`/matches/${matchId}/lease`, {
    method: 'POST', token: await getToken(), body: { deviceId: device, takeover },
  }))().then(
    data => { setLeaseError(null); setLease({ lastClientSeq: data.lease.lastClientSeq }); return true; },
    err => { setLeaseError(err); return false; },
  ), [matchId, getToken, device]);
  const takeOver = async () => { if (await acquire(true)) dispatch({ type: 'RESUME' }); };
  const scoring = match && !isClosed(match);
  useEffect(() => {
    if (scoring && device && online && !lease && !leaseError) acquire(false);
  }, [scoring, device, online, lease, leaseError, acquire]);
  // Send loop: one action at a time, head of the queue first, same actionId on every retry (Req 19.3, 19.5–19.7).
  useEffect(() => {
    const item = online && lease ? nextToSend(queue) : null;
    if (!item) return;
    const timer = setTimeout(async () => {
      dispatch({ type: 'SEND_START', actionId: item.actionId });
      const { actionId, clientSeq, deviceId: sentFrom, type, payload, reversesActionId } = item;
      let result;
      try {
        result = await apiFetch(`/matches/${matchId}/actions`, {
          method: 'POST', token: await getToken(), body: { actionId, clientSeq, deviceId: sentFrom, type, payload, reversesActionId },
        });
      } catch (err) {
        if (!err.status) dispatch({ type: 'SEND_NETWORK_ERROR' });
        else if (err.status >= 500) dispatch({ type: 'SEND_5XX' });
        else dispatch({ type: 'SEND_REJECTED', status: err.status, code: err.code });
        return;
      }
      dispatch({ type: 'SEND_OK', seq: result.seq });
      setLease(l => ({ ...l, lastClientSeq: Math.max(l?.lastClientSeq ?? 0, clientSeq) })); // mirrors the server lease
      setAccepted(a => newer(a, { seq: result.seq, sides: result.snapshot.sides }));
      // A failed write only means a reload resends this action; the server replays the same seq.
      saveAction({ ...item, status: 'synced', seq: result.seq, snapshot: result.snapshot }).catch(() => {});
    }, retryDelay(queue));
    return () => clearTimeout(timer);
  }, [queue, online, lease, matchId, getToken]);
  async function record(type, payload, reversesActionId = null) {
    if (saving.current) return; // one write at a time, so two taps never share a clientSeq
    saving.current = true;
    setBusy(true);
    // With the lease, the server expects lastClientSeq + 1; offline without it, continue after the stored actions.
    const clientSeq = lease ? nextClientSeq({ items: unsynced(queue.items) }, lease.lastClientSeq) : nextClientSeq(queue);
    const item = { actionId: crypto.randomUUID(), matchId, clientSeq, deviceId: device, type, payload, reversesActionId, status: 'queued' };
    try {
      await saveAction(item); // stored before the console shows it as queued (Req 19.2)
      dispatch({ type: 'ENQUEUE', item });
    } catch {
      setStoreError('The action could not be saved on this device. Try again.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (loadError) {
    return (
      <main className="text-page">
        <h1>Score match</h1>
        <p className="text-error" role="alert">{loadError.status === 403 ? 'Only event staff can score matches.' : `Could not load this match: ${loadError.message}`}</p>
        <div className="text-actions"><Link to="/operator/matches">Back to My Matches</Link></div>
      </main>
    );
  }
  if (!match) return <main className="text-page"><h1>Score match</h1><p role="status">Loading the match…</p></main>;
  const reversed = new Set(queue.items.map(i => i.reversesActionId).filter(Boolean));
  const undoTarget = queue.items.findLast(i => i.type === 'POINT' && !reversed.has(i.actionId));
  const pending = pendingPoints(accepted, queue.items);
  const canRecord = ready && !busy && !storeError;
  return (
    <main className="text-page score-console">
      <p className="console-meta">{[sportLabel(match.sport), stageLabel(match), match.venue].filter(Boolean).join(' · ')}</p>
      <h1>{sideName(match, 0)} vs {sideName(match, 1)}</h1>
      <p className="console-status" role="status" aria-live="polite">{statusLine(queue, online)}</p>
      <table className="console-score">
        <caption className="sr-only">Score</caption>
        <thead><tr><th scope="col">Side</th><th scope="col">Accepted{accepted ? ` (seq ${accepted.seq})` : ''}</th><th scope="col">Pending</th></tr></thead>
        <tbody>
          {[0, 1].map(side => (
            <tr key={side}><th scope="row">{sideName(match, side)}</th><td>{accepted?.sides?.[side]?.points ?? 0}</td><td>{pending[side]}</td></tr>
          ))}
        </tbody>
      </table>
      {storeError && <p className="text-error" role="alert">{storeError}</p>}
      {!scoring ? <p>This result is submitted, so scoring is closed.</p>
        : queue.paused === 'SPORT_RULES_OPEN' ? <p className="text-error" role="alert">The scoring rules for {sportLabel(match.sport)} are not confirmed yet, so this match cannot be scored. Your actions stay saved on this device.</p>
        : <div className="text-actions console-controls">
            <button type="button" disabled={!canRecord} onClick={() => record('POINT', { side: 0 })}>Point to {sideName(match, 0)}</button>
            <button type="button" disabled={!canRecord} onClick={() => record('POINT', { side: 1 })}>Point to {sideName(match, 1)}</button>
            <button type="button" className="console-secondary" disabled={!canRecord || !undoTarget} onClick={() => record('REVERSE', {}, undoTarget.actionId)}>Undo last</button>
          </div>}
      {scoring && leaseError && (
        <div className="console-notice" role="alert">
          <p className="text-error">{leaseError.code === 'LEASE_HELD' ? 'Another device is scoring this match. Your actions stay queued on this device.'
            : `Could not get scoring access: ${leaseError.code ?? leaseError.message}.`}</p>
          <div className="text-actions">
            {leaseError.code === 'LEASE_HELD'
              ? <button type="button" onClick={takeOver}>Take over scoring</button>
              : <button type="button" onClick={() => acquire(false)}>Try again</button>}
          </div>
        </div>
      )}
      {queue.paused && queue.paused !== 'SPORT_RULES_OPEN' && (
        <div className="console-notice">
          <p>Sync stopped with <strong>{queue.paused}</strong>. Your queued actions are kept. Ask a Tournament Manager to fix the cause, then retry.</p>
          <div className="text-actions">
            {/* Another device took the lease: only a takeover lets this device sync again. */}
            {queue.paused === 'LEASE_REQUIRED'
              ? <button type="button" onClick={takeOver}>Take over scoring</button>
              : <button type="button" onClick={() => dispatch({ type: 'RESUME' })}>Retry sync</button>}
          </div>
        </div>
      )}
      {queue.items.length > 0 && (
        <>
          <h2>Recent actions</h2>
          <ol className="console-log">
            {queue.items.slice(-10).map(item => <li key={item.actionId} data-status={item.status}>#{item.clientSeq} {describe(item, match)} · {itemStatus(item)}</li>)}
          </ol>
        </>
      )}
      <div className="text-actions"><Link to="/operator/matches">Back to My Matches</Link></div>
    </main>
  );
}
