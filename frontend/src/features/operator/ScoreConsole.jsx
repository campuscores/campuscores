import { activeActions, checkReversal, scoreMatch, validateFormat } from '../../../../shared/scoring.mjs';
import ScoringPage from './scoring/ScoringPage.jsx';
import { useCallback, useEffect, useEffectEvent, useReducer, useRef, useState } from 'react';
import { backoffDelay } from '../../services/live.js';
import { apiBase, apiFetch } from '../../services/api.js';
import StaffShell from '../staff/StaffShell.jsx';
import ScreenState from '../staff/ScreenState.jsx';
import { emptyQueue, nextClientSeq, nextToSend, queueReducer, restoreQueue, retryDelay } from './queue.js';
import { deleteActions, deviceId, loadActions, saveAction } from './queueStore.js';
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
function statusLine(queue, online, held) {
  const waiting = unsynced(queue.items).length;
  if (held) return `Not sending: another device is scoring${waiting ? ` · ${waiting} queued` : ''}`;
  if (queue.paused) return `Requires attention: ${queue.paused}`;
  if (!online) return `Offline · ${waiting} queued`;
  if (queue.inFlight) return `Syncing · ${waiting} queued`;
  if (waiting) return `Online · ${waiting} queued`;
  const last = queue.items.findLast(i => i.status === 'synced');
  return last ? `Synced up to seq ${last.seq}` : 'Online';
}
/**
 * Staff frame for the caller's `role` from `GET /api/me` (Req 4.9, 4.10, 13.7): a Match_Scorer gets My Matches marked
 * current and Back to My Matches; a Tournament_Manager or Super_Admin, who opens the console from Matches, gets
 * Matches marked current and Back to Matches.
 */
const frame = (role = 'MATCH_OPERATOR') => (role === 'MATCH_OPERATOR'
  ? { role, current: 'my-matches', back: { to: '/operator/matches', label: 'My Matches' } }
  : { role, current: 'matches', back: { to: '/manage/matches', label: 'Matches' } });
const describe = (item, match) => item.type === 'POINT' ? `Point to ${sideName(match, item.payload.side)}` : 'Undo';
const itemStatus = item => item.status === 'synced' ? `synced, seq ${item.seq}` : item.status;
/**
 * Scoring console for one assigned match: scorer lease, Offline_Queue and Test_Engine controls (Req 19.2–19.10).
 * `getToken` comes from Clerk in AuthArea; this component loads no Clerk code itself.
 */
export default function ScoreConsole({ matchId, getToken, role }) {
  const shell = (title, content) => <StaffShell {...frame(role)} title={title}>{content}</StaffShell>;
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
  const sending = useRef(false);
  const leaseAttempts = useRef(0);
  const wireSequences = useRef(new Map());
  const held = useRef(null); // { token, deviceId } while this device holds the lease
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [scoringLoaded, setScoringLoaded] = useState(false);
  useEffect(() => {
    const on = () => { setOnline(true); setLeaseError(err => (err?.status ? err : null)); }; // retry a lease lost to the network
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);
  // Restore durable actions before reading the same committed server revision and sending anything.
  useEffect(() => {
    let stopped = false;
    async function load() {
      try {
        const [id, records] = await Promise.all([deviceId(), loadActions(matchId)]);
        if (stopped) return;
        setDevice(id);
        dispatch({ type: 'RESTORE', records });
        setAccepted(a => records.reduce((best, r) => newer(best, r.snapshot && { ...r.snapshot, seq: r.seq }), a));
        setReady(true);
      } catch { if (!stopped) setStoreError('This browser cannot store the offline queue, so scoring is not available here. Try another browser, or leave private browsing.'); return; }
      try {
        const data = await apiFetch('/operator/matches', { token: await getToken() });
        if (stopped) return;
        const found = data?.matches?.find(m => String(m.id) === matchId);
        if (!found) { setLoadError({ message: 'This match is not assigned to you.' }); return; }
        setMatch(found);
        if (found.status === 'SCHEDULED' || found.format) {
          const result = await apiFetch(`/operator/matches/${matchId}/scoring`, { token: await getToken() });
          const records = await loadActions(matchId);
          if (stopped) return;
          const byId = new Map(result.actions.map(a => [a.actionId, a]));
          dispatch({ type: 'RESTORE', records: records.map(r => byId.has(r.actionId) ? { ...r, status: 'synced', seq: byId.get(r.actionId).seq } : r) });
          setAccepted(a => !a || result.seq >= a.seq ? { ...result.snapshot, seq: result.seq, actions: result.actions } : a);
        } else {
          try {
            const result = await apiFetch(`/matches/${matchId}`);
            const { seq, snapshot } = result?.match ?? {};
            if (!stopped && snapshot?.sides) setAccepted(a => newer(a, { ...snapshot, seq }));
          } catch { /* Legacy/custom matches can have no public snapshot yet. */ }
        }
        if (!stopped) setScoringLoaded(true);
      } catch (err) { if (!stopped) setLoadError(err); }
    }
    load();
    return () => { stopped = true; };
  }, [matchId, getToken]);
  /** Requests the scorer lease; `takeover` moves it from this account's other device (Req 14.6–14.8). */
  const acquire = useCallback(takeover => (async () => {
    const token = await getToken();
    const data = await apiFetch(`/matches/${matchId}/lease`, { method: 'POST', token, body: { deviceId: device, takeover } });
    held.current = { token, deviceId: device };
    return data;
  })().then(
    data => {
      setLeaseError(null);
      leaseAttempts.current = 0;
      if (data.lease.decision !== 'KEEP') wireSequences.current.clear();
      // KEEP (a re-check) may answer before a send that is already accepted, so never lower the number.
      const last = data.lease.lastClientSeq;
      setLease(l => ({ lastClientSeq: data.lease.decision === 'KEEP' ? Math.max(l?.lastClientSeq ?? 0, last) : last }));
      return true;
    },
    err => {
      // Another device holds the lease: stop sending and scoring here until "Take over scoring".
      if (err.code === 'LEASE_HELD') { held.current = null; setLease(null); }
      leaseAttempts.current += 1;
      setLeaseError(err);
      return false;
    },
  ), [matchId, getToken, device]);
  // Release the lease when the scorer leaves, so a reload or another device gets GRANT. The queue stays in IndexedDB.
  // `keepalive` lets the pagehide request outlive the page; pagehide cannot await getToken(), so it uses the cached token.
  const release = useEffectEvent(unloading => {
    const holder = held.current;
    if (!holder) return;
    held.current = null;
    const body = { deviceId: holder.deviceId };
    if (unloading) {
      fetch(`${apiBase}/api/matches/${matchId}/lease`, {
        method: 'DELETE', keepalive: true, body: JSON.stringify(body),
        headers: { Authorization: `Bearer ${holder.token}`, 'Content-Type': 'application/json' },
      }).catch(() => {});
    } else {
      getToken().then(token => apiFetch(`/matches/${matchId}/lease`, { method: 'DELETE', token, body })).catch(() => {});
    }
  });
  useEffect(() => {
    const onHide = () => release(true);
    const onShow = event => { if (event.persisted) setLease(null); }; // restored from the back-forward cache: acquire again
    addEventListener('pagehide', onHide);
    addEventListener('pageshow', onShow);
    return () => { removeEventListener('pagehide', onHide); removeEventListener('pageshow', onShow); release(false); };
  }, []);
  /**
   * Take over from another device (Arnav, 24 October 2026): only one device scores a match. This device's unsent
   * actions were made while another device was scoring, so they are discarded (from IndexedDB first, so a reload never
   * resends them). Then the console loads the accepted score and actions from the server and scoring continues from
   * there, so two devices' points never add up.
   */
  const [takingOver, setTakingOver] = useState(false);
  async function takeOver() {
    if (takingOver) return;
    setTakingOver(true);
    try {
      if (!(await acquire(true))) return;
      await deleteActions(unsynced(queue.items).map(i => i.actionId));
      const records = await loadActions(matchId);
      if (match.status === 'SCHEDULED' || match.format || accepted?.format) {
        const result = await apiFetch(`/operator/matches/${matchId}/scoring`, { token: await getToken() });
        const byId = new Map(result.actions.map(a => [a.actionId, a]));
        dispatch({ type: 'RESTORE', records: records.filter(r => byId.has(r.actionId)).map(r => ({ ...r, status: 'synced', seq: byId.get(r.actionId).seq })) });
        setAccepted({ ...result.snapshot, seq: result.seq, actions: result.actions });
        if (result.snapshot?.format) setMatch(m => ({ ...m, status: result.snapshot.status ?? m.status, format: result.snapshot.format }));
      } else {
        dispatch({ type: 'RESTORE', records: records.filter(r => r.status === 'synced') });
        const { seq, snapshot } = (await apiFetch(`/matches/${matchId}`))?.match ?? {};
        if (snapshot?.sides) setAccepted({ ...snapshot, seq });
      }
      setActionError('');
    } catch (err) {
      setActionError(`Could not load the latest score: ${err.message}. Try "Take over scoring" again.`);
      setLease(null); // scoring stays off until the latest score is loaded
      setLeaseError({ code: 'LEASE_HELD' });
    } finally {
      setTakingOver(false);
    }
  }
  const scoring = match && !isClosed(match);
  useEffect(() => {
    if (!scoring || !device || !online || lease || (leaseError?.status < 500 && leaseError.status !== 429)) return undefined;
    const timer = setTimeout(() => acquire(false), leaseError ? backoffDelay(leaseAttempts.current - 1) : 0);
    return () => clearTimeout(timer);
  }, [scoring, device, online, lease, leaseError, acquire]);
  // While this device scores, re-check the lease every 15 seconds and when the tab is shown again, so a takeover by
  // another device shows here at once, before the next tap. KEEP changes nothing; LEASE_HELD stops scoring here.
  const recheck = useEffectEvent(() => { if (lease && online && !takingOver && document.visibilityState === 'visible') acquire(false); });
  useEffect(() => {
    if (!scoring || !lease) return undefined;
    const timer = setInterval(recheck, 15000);
    const onVisible = () => recheck();
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [scoring, Boolean(lease)]); // eslint-disable-line react-hooks/exhaustive-deps -- only start/stop with the lease
  // Send loop: one action at a time, head of the queue first, same actionId on every retry (Req 19.3, 19.5–19.7).
  useEffect(() => {
    // Nothing goes out during a takeover: the unsent actions are being discarded.
    const item = online && lease && scoringLoaded && !takingOver ? nextToSend(queue) : null;
    if (!item) return;
    const timer = setTimeout(async () => {
      if (sending.current) return;
      sending.current = true;
      try {
        dispatch({ type: 'SEND_START', actionId: item.actionId });
        const { actionId, deviceId: sentFrom, type, payload, reversesActionId } = item;
        // A GRANT or TAKEOVER resets the server lease to 0, so the wire clientSeq follows the lease, not the stored
        // item.clientSeq (the local order). A retry under the same lease sends the same number, so a replay still matches.
        // A lease recheck can see an accepted action whose response was lost. Its retry must keep the original hash.
        const clientSeq = wireSequences.current.get(actionId) ?? lease.lastClientSeq + 1;
        wireSequences.current.set(actionId, clientSeq);
        let result;
        try {
          const token = await getToken();
          result = await apiFetch(`/matches/${matchId}/actions`, {
            method: 'POST', token, body: { actionId, clientSeq, deviceId: sentFrom, type, payload, reversesActionId },
          });
          if (held.current) held.current = { ...held.current, token }; // fresher token for a pagehide release
        } catch (err) {
          if (!err.status) dispatch({ type: 'SEND_NETWORK_ERROR' });
          else if (err.status >= 500 || err.status === 429) dispatch({ type: 'SEND_5XX' }); // 429: rate limit, retry with backoff
          else {
            if (err.code === 'LEASE_REQUIRED') held.current = null; // another device holds it now; never release theirs
            dispatch({ type: 'SEND_REJECTED', status: err.status, code: err.code });
          }
          return;
        }
        wireSequences.current.delete(actionId);
        dispatch({ type: 'SEND_OK', seq: result.seq });
        setLease(l => ({ ...l, lastClientSeq: Math.max(l?.lastClientSeq ?? 0, clientSeq) })); // mirrors the server lease
        setAccepted(a => newer(a, { ...result.snapshot, seq: result.seq, actions: [...(a?.actions ?? []), { ...item, seq: result.seq }] }));
        if (result.snapshot.format) setMatch(m => ({ ...m, status: result.snapshot.status, format: result.snapshot.format }));
        // A failed write only means a reload resends this action; the server replays the same seq.
        saveAction({ ...item, status: 'synced', seq: result.seq, snapshot: result.snapshot }).catch(() => {});
      } finally {
        sending.current = false;
      }
    }, retryDelay(queue));
    return () => clearTimeout(timer);
  }, [queue, online, lease, scoringLoaded, takingOver, matchId, getToken]);
  async function record(type, payload, reversesActionId = null) {
    if (saving.current) return false; // one write at a time, so two taps never share a clientSeq
    setActionError('');
    const format = type === 'START' ? payload.format : accepted?.format ?? match?.format ?? queue.items.find(i => i.type === 'START')?.payload.format;
    if (format) {
      try {
        validateFormat(match.sport, format);
        const history = [...(accepted?.actions ?? []), ...unsynced(queue.items).filter(i => !(accepted?.actions ?? []).some(a => a.actionId === i.actionId))];
        const command = { type, payload, reversesActionId, actionId: 'pending-validation' };
        checkReversal(history, command);
        scoreMatch({ matchId, sport: match.sport, sides: match.sides, format, actions: [...history, command] });
      } catch (err) { setActionError(err.message); return false; }
    }
    saving.current = true;
    setBusy(true);
    // Local order only: the send loop puts the lease's next number on the wire.
    const clientSeq = nextClientSeq(queue, lease?.lastClientSeq);
    const item = { actionId: crypto.randomUUID(), matchId, clientSeq, deviceId: device, type, payload, reversesActionId, status: 'queued' };
    try {
      await saveAction(item); // stored before the console shows it as queued (Req 19.2)
      dispatch({ type: 'ENQUEUE', item });
      return true;
    } catch {
      setStoreError('The action could not be saved on this device. Try again.');
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (loadError) return shell('Score console', loadError.status === 403 ? <p className="screen-error" role="alert">Only event staff can score matches.</p> : <ScreenState state="error" what="this match" onRetry={() => window.location.reload()} />);
  if (!match) return shell('Score console', <p role="status">Loading the match…</p>);
  const title = `${sideName(match, 0)} vs ${sideName(match, 1)}`;
  // Another device holds the lease (refused at load, or taken over later): only a takeover lets this device sync.
  const leaseHeld = scoring && (leaseError?.code === 'LEASE_HELD' || queue.paused === 'LEASE_REQUIRED');
  // Only the device that holds the lease scores (Arnav, 24 October 2026): no tap is queued before the lease answers.
  const canScore = !scoring || (Boolean(lease) && !leaseHeld && !takingOver);
  const unsent = unsynced(queue.items).length;
  const heldNotice = leaseHeld && (
    <div className="console-notice is-top" role="alert">
      <h2>Another device is scoring this match</h2>
      <p>Take over scoring to score here. This device then loads the latest score from the server{unsent ? ` and discards its ${unsent} unsent ${unsent === 1 ? 'action' : 'actions'}` : ''}.</p>
      <div className="text-actions"><button type="button" className="scoring-action" onClick={takeOver} aria-disabled={takingOver || undefined}>{takingOver ? 'Taking over…' : 'Take over scoring'}</button></div>
    </div>
  );
  const notices = <>
      {scoring && leaseError && leaseError.code !== 'LEASE_HELD' && (
        <div className="console-notice" role="alert">
          <p className="text-error">Could not get scoring access: {leaseError.code ?? leaseError.message}.</p>
          <div className="text-actions"><button type="button" onClick={() => acquire(false)}>Try again</button></div>
        </div>
      )}
      {queue.paused && !['SPORT_RULES_OPEN', 'LEASE_REQUIRED'].includes(queue.paused) && (
        <div className="console-notice">
          <p>Sync stopped with <strong>{queue.paused}</strong>. Your queued actions are kept. Ask a Tournament Manager to fix the cause, then retry.</p>
          <div className="text-actions"><button type="button" onClick={() => dispatch({ type: 'RESUME' })}>Retry sync</button></div>
        </div>
      )}
  </>;
  const status = scoring && !lease && !leaseError && !leaseHeld
    ? (online ? 'Getting scoring access…' : 'Offline · connect to the internet to get scoring access')
    : statusLine(queue, online, leaseHeld);
  const format = accepted?.format ?? match.format ?? queue.items.find(i => i.type === 'START')?.payload.format;
  if (match.status === 'SCHEDULED' || format) {
    const history = [...(accepted?.actions ?? []), ...unsynced(queue.items).filter(i => !(accepted?.actions ?? []).some(a => a.actionId === i.actionId))];
    let projection = null;
    let projectionError = '';
    if (format) {
      try { projection = scoreMatch({ matchId, sport: match.sport, sides: match.sides, format, actions: history }); }
      catch (err) { projectionError = err.message; }
    }
    const undo = activeActions(history).findLast(a => !['START', 'FINALIZE'].includes(a.type));
    return shell(title, <ScoringPage match={match} snapshot={projection} accepted={accepted} disabled={!ready || !scoringLoaded || busy || !canScore || Boolean(storeError) || Boolean(queue.paused) || match.validNow === false} pending={unsynced(queue.items).length} onAction={record} undoTarget={undo} status={status} notice={heldNotice} error={actionError || projectionError || storeError}>
      {notices}
      {!scoringLoaded && <p role="status">Loading accepted scoring actions…</p>}
    </ScoringPage>);
  }
  const reversed = new Set(queue.items.map(i => i.reversesActionId).filter(Boolean));
  const undoTarget = queue.items.findLast(i => i.type === 'POINT' && !reversed.has(i.actionId));
  const pending = pendingPoints(accepted, queue.items);
  const canRecord = ready && !busy && !storeError && canScore;
  return shell(title,
    <div className="text-page score-console">
      {heldNotice}
      <p className="console-meta">{[sportLabel(match.sport), stageLabel(match), match.venue].filter(Boolean).join(' · ')}</p>
      <p className="console-status" role="status" aria-live="polite">{status}</p>
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
      {notices}
      {queue.items.length > 0 && (
        <>
          <h2>Recent actions</h2>
          <ol className="console-log">
            {queue.items.slice(-10).map(item => <li key={item.actionId} data-status={item.status}>#{item.clientSeq} {describe(item, match)} · {itemStatus(item)}</li>)}
          </ol>
        </>
      )}
    </div>,
  );
}
