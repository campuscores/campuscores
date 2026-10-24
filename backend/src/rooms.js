import { DurableObject } from 'cloudflare:workers';
import { toPublic } from './http.js';
import { withClient } from './db.js';

export const ROOM_PATTERN = /^(home|match:[1-9][0-9]{0,17})$/;
export const parseRoom = (s) => (typeof s === 'string' && ROOM_PATTERN.test(s) ? s : null);
export const shouldAccept = (storedSeq, seq) => Number.isSafeInteger(seq) && seq > (storedSeq ?? 0);

// Home list: per-match seq; live and final cards are visible in separate frontend sections.
export const LIVE_STATUSES = new Set(['LIVE', 'APPROVED']);
export function applyCard(state, matchId, card, seq) {
  if (!shouldAccept(state.cards[matchId]?.seq, seq)) return null;
  return { ...state, seq: state.seq + 1, cards: { ...state.cards, [matchId]: { ...card, seq } } };
}
export const liveCards = (state) => Object.values(state.cards).filter((card) => LIVE_STATUSES.has(card.status));

const WRITE_SIGNAL_MS = 60 * 1000;

// One class for every Live_Room: `home` and `match:<id>`. Viewer sockets are receive-only.
// Every Room_Message carries only Public_DTO fields (toPublic), whatever the caller passes.
export class MatchRoom extends DurableObject {
  async fetch(request) {
    const home = decodeURIComponent(new URL(request.url).pathname) === '/live/home';
    // Keep the upgrade on the existing fetch contract while old and new room code coexist.
    if (home) await this.pruneDeletedCards();
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server); // Hibernation API
    const message = await this.ctx.storage.get('message');
    if (message) server.send(message); // stored snapshot first, no database query
    // An empty home room still answers, so viewers leave "Connecting" before the first score.
    else if (home || this.ctx.id.name === 'home') server.send(JSON.stringify({ type: 'snapshot', room: 'home', seq: 0, data: [] }));
    return new Response(null, { status: 101, webSocket: client });
  }

  // Repair old withdrawals or a demo reset; concurrent viewers share one presence check per minute.
  async pruneDeletedCards() {
    if (!this.env.HYPERDRIVE_UNCACHED) return;
    if (this.pruning) return this.pruning;
    this.pruning = this.#pruneDeletedCards().finally(() => { this.pruning = null; });
    return this.pruning;
  }

  async #pruneDeletedCards() {
    const now = Date.now();
    const check = await this.ctx.storage.get('cardsCheck');
    if (check && now - check.at < 60000) {
      if (!check.ok) throw new Error('Home cache check is unavailable');
      return;
    }
    await this.ctx.storage.put('cardsCheck', { at: now, ok: false });
    const home = await this.ctx.storage.get('home');
    const ids = Object.keys(home?.cards ?? {});
    if (ids.length) {
      const { rows } = await withClient(this.env.HYPERDRIVE_UNCACHED, this.ctx, client =>
        client.query('SELECT id::text FROM matches WHERE id = ANY($1::bigint[])', [ids]));
      const existing = new Set(rows.map(row => row.id));
      const deleted = ids.filter(id => !existing.has(id));
      // removeCards reads the latest state, so a card added during the database read stays intact.
      if (deleted.length) await this.removeCards(deleted);
    }
    await this.ctx.storage.put('cardsCheck', { at: now, ok: true });
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
    if (state.deleted?.includes(String(matchId))) return false; // a late publish must not bring back a deleted match
    const next = applyCard(state, String(matchId), toPublic('card', card), seq);
    if (!next) return false;
    const message = JSON.stringify({ type: 'snapshot', room: 'home', seq: next.seq, data: liveCards(next) });
    await this.ctx.storage.put({ home: next, message });
    this.#broadcast(message);
    return true;
  }

  // Home room: drop the cards of deleted matches and remember the last 500 deleted IDs, then send the new list.
  async removeCards(matchIds) {
    const ids = matchIds.map(String);
    const state = (await this.ctx.storage.get('home')) ?? { seq: 0, cards: {} };
    const cards = Object.fromEntries(Object.entries(state.cards).filter(([id]) => !ids.includes(id)));
    const deleted = [...new Set([...(state.deleted ?? []), ...ids])].slice(-500);
    const next = { ...state, seq: state.seq + 1, cards, deleted };
    const message = JSON.stringify({ type: 'snapshot', room: 'home', seq: next.seq, data: liveCards(next) });
    await this.ctx.storage.put({ home: next, message });
    this.#broadcast(message);
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
