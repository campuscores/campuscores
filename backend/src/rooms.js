import { DurableObject } from 'cloudflare:workers';
import { toPublic } from './http.js';

export const ROOM_PATTERN = /^(home|match:[1-9][0-9]{0,17})$/;
export const parseRoom = (s) => (typeof s === 'string' && ROOM_PATTERN.test(s) ? s : null);
export const shouldAccept = (storedSeq, seq) => Number.isSafeInteger(seq) && seq > (storedSeq ?? 0);

// Home list: per-match seq. Non-live cards stay stored (so a late resend stays stale) but leave the list.
export const LIVE_STATUSES = new Set(['LIVE']);
export function applyCard(state, matchId, card, seq) {
  if (!shouldAccept(state.cards[matchId]?.seq, seq)) return null;
  return { seq: state.seq + 1, cards: { ...state.cards, [matchId]: { ...card, seq } } };
}
export const liveCards = (state) => Object.values(state.cards).filter((card) => LIVE_STATUSES.has(card.status));

const WRITE_SIGNAL_MS = 60 * 1000;

// One class for every Live_Room: `home` and `match:<id>`. Viewer sockets are receive-only.
// Every Room_Message carries only Public_DTO fields (toPublic), whatever the caller passes.
export class MatchRoom extends DurableObject {
  async fetch() {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server); // Hibernation API
    const message = await this.ctx.storage.get('message');
    if (message) server.send(message); // stored snapshot first, no database query
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage() {} // receive-only: ignore content, change nothing

  webSocketClose(ws, code) {
    try {
      ws.close(code, 'bye');
    } catch {
      // Reserved codes such as 1005 cannot be echoed; the socket is closed anyway.
    }
  }

  async publish(snapshot, seq) {
    if (!shouldAccept(await this.ctx.storage.get('seq'), seq)) return false;
    const data = toPublic('snapshot', snapshot);
    const message = JSON.stringify({ type: 'snapshot', room: this.ctx.id.name, seq, data });
    await this.ctx.storage.put({ seq, message });
    this.#broadcast(message);
    return true;
  }

  async publishCard(matchId, card, seq) {
    const state = (await this.ctx.storage.get('home')) ?? { seq: 0, cards: {} };
    const next = applyCard(state, String(matchId), toPublic('card', card), seq);
    if (!next) return false;
    const message = JSON.stringify({ type: 'snapshot', room: 'home', seq: next.seq, data: liveCards(next) });
    await this.ctx.storage.put({ home: next, message });
    this.#broadcast(message);
    return true;
  }

  // Write_Signal: skip the row write when a signal from the last minute already covers the sweep window.
  async noteWrite() {
    const now = Date.now();
    if (now - (await this.lastWriteAt()) >= WRITE_SIGNAL_MS) await this.ctx.storage.put('lastWriteAt', now);
  }

  async lastWriteAt() {
    return (await this.ctx.storage.get('lastWriteAt')) ?? 0;
  }

  #broadcast(message) {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(message);
      } catch {
        // A closing socket must not stop delivery to the others.
      }
    }
  }
}
