import { backoffDelay } from '../../services/live.js';

// Pure Offline_Queue reducer (Req 19.3, 19.5, 19.6, 19.7). Item status: 'queued' | 'syncing' | 'synced' (with `seq`).
// `attempt` counts consecutive network/5xx failures for the retry backoff.
export const emptyQueue = { items: [], paused: null, inFlight: null, attempt: 0 };

/** State rebuilt from stored records after a reload; an unanswered send goes back to queued (Req 19.8). */
export const restoreQueue = records => ({
  ...emptyQueue,
  items: [...records]
    .sort((a, b) => a.clientSeq - b.clientSeq)
    .map(r => (r.status === 'synced' ? r : { ...r, status: 'queued' })),
});

/** The server accepts only `lease.lastClientSeq + 1`, so the floor comes from the lease. */
export const nextClientSeq = (state, leaseLastClientSeq = 0) =>
  Math.max(leaseLastClientSeq, ...state.items.map(i => i.clientSeq)) + 1;

export function nextToSend(state) {
  if (state.paused || state.inFlight) return null;
  return state.items.find(i => i.status === 'queued') ?? null; // items kept sorted by clientSeq
}

/** Delay in ms before the next send; 0 unless the last send failed on the network or with 5xx. */
export const retryDelay = (state, random) => (state.attempt ? backoffDelay(state.attempt - 1, random) : 0);

const setInFlight = (state, patch) => ({
  ...state,
  inFlight: null,
  items: state.items.map(i => (i.actionId === state.inFlight ? { ...i, ...patch } : i)),
});

export function queueReducer(state, event) {
  switch (event.type) {
    case 'ENQUEUE': {
      if (state.items.some(i => i.actionId === event.item.actionId)) return state;
      const items = [...state.items, { ...event.item, status: 'queued' }].sort((a, b) => a.clientSeq - b.clientSeq);
      return { ...state, items };
    }
    case 'SEND_START': {
      // Only the head of the queue may go out, and only one at a time.
      if (nextToSend(state)?.actionId !== event.actionId) return state;
      return {
        ...state,
        inFlight: event.actionId,
        items: state.items.map(i => (i.actionId === event.actionId ? { ...i, status: 'syncing' } : i)),
      };
    }
    case 'SEND_OK':
      if (!state.inFlight) return state;
      return { ...setInFlight(state, { status: 'synced', seq: event.seq }), attempt: 0 };
    case 'SEND_NETWORK_ERROR':
    case 'SEND_5XX':
      if (!state.inFlight) return state;
      return { ...setInFlight(state, { status: 'queued' }), attempt: state.attempt + 1 };
    case 'SEND_REJECTED':
      // 401/403/409 (and any other 4xx) need a person: keep every item and stop until RESUME (Req 19.5).
      if (!state.inFlight) return state;
      return { ...setInFlight(state, { status: 'queued' }), paused: event.code ?? String(event.status), attempt: 0 };
    case 'RESUME':
      return { ...state, paused: null, attempt: 0 };
    default:
      return state;
  }
}
