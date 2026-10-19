import { apiBase } from './api.js';

// Consecutive closes without a snapshot before the page shows "unavailable"; reconnects continue.
const UNAVAILABLE_AFTER = 3;

/** Full-jitter reconnect delay in ms: starts at 1 s, capped at 30 s (Req 18.4). */
export const backoffDelay = (attempt, random = Math.random) =>
  Math.floor(random() * Math.min(30000, 1000 * 2 ** attempt));

/** Returns the next `{ seq, data }`, or `state` itself for an invalid or stale message (Req 18.2, 18.3, 18.8). */
export function applyMessage(state, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return state; }
  if (!msg || msg.type !== 'snapshot' || !Number.isSafeInteger(msg.seq)) return state;
  if (state.seq != null && msg.seq <= state.seq) return state;
  return { seq: msg.seq, data: msg.data };
}

/**
 * Opens `/live/<room>` on the API base and keeps it open until the returned unsubscribe runs.
 * onStatus: 'connecting' | 'live' | 'reconnecting' | 'unavailable'; onData(snapshot) per applied message.
 */
export function subscribe(room, { onData, onStatus }) {
  const url = new URL(`${apiBase}/live/${room}`, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  let socket;
  let timer;
  let stopped = false;
  let failures = 0;

  function connect() {
    // The first message of each socket replaces state: a re-created room may restart its seq (Req 18.5).
    let state = { seq: null };
    socket = new WebSocket(url);
    socket.onmessage = event => {
      if (stopped) return;
      const next = applyMessage(state, event.data);
      if (next === state) return;
      if (state.seq == null) {
        failures = 0;
        onStatus('live');
      }
      state = next;
      onData(next.data);
    };
    socket.onclose = () => {
      if (stopped) return;
      failures += 1;
      onStatus(failures >= UNAVAILABLE_AFTER ? 'unavailable' : 'reconnecting');
      timer = setTimeout(connect, backoffDelay(failures - 1));
    };
  }

  onStatus('connecting');
  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    socket.close();
  };
}
