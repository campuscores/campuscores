import { env, exports as workerExports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const live = (room, headers = {}) => workerExports.default.fetch(`http://example.com/live/${room}`, { headers });
const stub = (room) => env.ROOMS.get(env.ROOMS.idFromName(room));
const QUIET_MS = 300; // bounded wait for "sends nothing"
// Public_DTO snapshot shape (toPublic('snapshot')): rooms drop any other field.
const snap = (matchId, a, b) => ({
  matchId,
  status: 'LIVE',
  sides: [
    { name: 'A', points: a },
    { name: 'B', points: b },
  ],
});

// Opens a viewer socket; next() resolves with the next parsed message, or null after `ms` of silence.
async function connect(room) {
  const res = await live(room, { Upgrade: 'websocket' });
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  const queue = [];
  const waiters = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (waiters.length) waiters.shift()(msg);
    else queue.push(msg);
  });
  ws.accept();
  const next = (ms = 2000) => {
    if (queue.length) return Promise.resolve(queue.shift());
    return new Promise((resolve) => {
      const waiter = (msg) => {
        clearTimeout(timer);
        resolve(msg);
      };
      const timer = setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1);
        resolve(null);
      }, ms);
      waiters.push(waiter);
    });
  };
  return { ws, next };
}

describe('/live/:room routing', () => {
  it('returns 426 for a plain GET', async () => {
    for (const room of ['home', 'match:1', 'x']) {
      const res = await live(room);
      expect(res.status).toBe(426);
      expect((await res.json()).error.code).toBe('UPGRADE_REQUIRED');
    }
  });

  it('returns 404 for an invalid room', async () => {
    for (const room of ['x', 'match:0', 'match:abc', 'HOME']) {
      const res = await live(room, { Upgrade: 'websocket' });
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe('NOT_FOUND');
    }
  });
});

describe('match room', () => {
  it('sends the stored snapshot as the first message', async () => {
    expect(await stub('match:101').publish(snap(101, 2, 1), 3)).toBe(true);
    const { ws, next } = await connect('match:101');
    expect(await next()).toEqual({ type: 'snapshot', room: 'match:101', seq: 3, data: snap(101, 2, 1) });
    ws.close(1000);
  });

  it('sends only Public_DTO fields', async () => {
    const leaky = { ...snap(106, 1, 0), email: 'x@example.com', lease: { deviceId: 'd' } };
    leaky.sides[0].accountId = 7;
    expect(await stub('match:106').publish(leaky, 1)).toBe(true);
    const { ws, next } = await connect('match:106');
    expect((await next()).data).toEqual(snap(106, 1, 0));
    ws.close(1000);
  });

  it('sends nothing first when no snapshot is stored', async () => {
    const { ws, next } = await connect('match:102');
    expect(await next(QUIET_MS)).toBeNull();
    ws.close(1000);
  });

  it('delivers one publish to every connected socket', async () => {
    const a = await connect('match:103');
    const b = await connect('match:103');
    expect(await stub('match:103').publish(snap(103, 1, 0), 1)).toBe(true);
    const expected = { type: 'snapshot', room: 'match:103', seq: 1, data: snap(103, 1, 0) };
    expect(await a.next()).toEqual(expected);
    expect(await b.next()).toEqual(expected);
    expect(await a.next(QUIET_MS)).toBeNull(); // exactly one message
    a.ws.close(1000);
    b.ws.close(1000);
  });

  it('keeps the stored snapshot and sends nothing for a stale or equal seq', async () => {
    const room = stub('match:104');
    expect(await room.publish(snap(104, 5, 5), 5)).toBe(true);
    const viewer = await connect('match:104');
    expect((await viewer.next()).seq).toBe(5);
    expect(await room.publish(snap(104, 9, 9), 5)).toBe(false);
    expect(await room.publish(snap(104, 9, 9), 4)).toBe(false);
    expect(await viewer.next(QUIET_MS)).toBeNull();
    const late = await connect('match:104');
    expect((await late.next()).data).toEqual(snap(104, 5, 5));
    viewer.ws.close(1000);
    late.ws.close(1000);
  });

  it('ignores viewer messages and changes no state', async () => {
    const room = stub('match:105');
    expect(await room.publish(snap(105, 0, 0), 2)).toBe(true);
    const sender = await connect('match:105');
    const other = await connect('match:105');
    await sender.next();
    await other.next();
    sender.ws.send(JSON.stringify({ type: 'snapshot', room: 'match:105', seq: 99, data: snap(105, 9, 0) }));
    sender.ws.send('not json');
    expect(await other.next(QUIET_MS)).toBeNull();
    expect(await sender.next(QUIET_MS)).toBeNull();
    const fresh = await connect('match:105');
    expect(await fresh.next()).toEqual({ type: 'snapshot', room: 'match:105', seq: 2, data: snap(105, 0, 0) });
    expect(await room.publish(snap(105, 1, 0), 3)).toBe(true); // stored seq is still 2
    for (const s of [sender, other, fresh]) s.ws.close(1000);
  });
});

describe('home room', () => {
  // The home room is one shared object; assert only on this test's match IDs.
  const ids = (msg) => msg.data.map((card) => card.id);

  it('always sends a home list first, empty before any card', async () => {
    const { ws, next } = await connect('home');
    const msg = await next();
    expect(msg).toMatchObject({ type: 'snapshot', room: 'home' });
    expect(Array.isArray(msg.data)).toBe(true);
    if (msg.seq === 0) expect(msg.data).toEqual([]);
    ws.close(1000);
  });

  it('adds, updates and removes a card on a non-live status', async () => {
    const home = stub('home');
    const viewer = await connect('home');
    await viewer.next(QUIET_MS); // drain any stored list from other tests

    // The private field must not reach the Room_Message.
    const first = { id: 201, status: 'LIVE', score: [0, 0], operatorEmail: 'x@example.com' };
    expect(await home.publishCard(201, first, 1)).toBe(true);
    let msg = await viewer.next();
    expect(msg).toMatchObject({ type: 'snapshot', room: 'home' });
    expect(msg.data).toContainEqual({ id: 201, status: 'LIVE', score: [0, 0], seq: 1 });

    expect(await home.publishCard(201, { id: 201, status: 'LIVE', score: [1, 0] }, 2)).toBe(true);
    const updated = await viewer.next();
    expect(updated.seq).toBeGreaterThan(msg.seq);
    expect(updated.data.filter((card) => card.id === 201)).toEqual([{ id: 201, status: 'LIVE', score: [1, 0], seq: 2 }]);

    expect(await home.publishCard(201, { id: 201, status: 'LIVE', score: [7, 7] }, 2)).toBe(false);
    expect(await viewer.next(QUIET_MS)).toBeNull();

    expect(await home.publishCard(201, { id: 201, status: 'PENDING_APPROVAL', score: [1, 0] }, 3)).toBe(true);
    msg = await viewer.next();
    expect(ids(msg)).not.toContain(201);

    // A late LIVE resend stays stale after removal.
    expect(await home.publishCard(201, { id: 201, status: 'LIVE', score: [1, 0] }, 2)).toBe(false);
    expect(await viewer.next(QUIET_MS)).toBeNull();

    const late = await connect('home');
    expect(await late.next()).toEqual(msg);
    viewer.ws.close(1000);
    late.ws.close(1000);
  });
});


describe('deleted match delivery', () => {
  it('keeps a deleted card out after another match updates and an old publish arrives', async () => {
    const home = stub('home');
    const deleted = '910001';
    const other = '910002';
    await home.publishCard(deleted, { id: deleted, status: 'LIVE', score: [1, 0] }, 1);
    await home.removeCards([deleted]);
    await home.publishCard(other, { id: other, status: 'LIVE', score: [2, 0] }, 1);
    expect(await home.publishCard(deleted, { id: deleted, status: 'LIVE', score: [3, 0] }, 2)).toBe(false);
    const viewer = await connect('home');
    const message = await viewer.next();
    expect(message.data.some(card => String(card.id) === deleted)).toBe(false);
    expect(message.data.some(card => String(card.id) === other)).toBe(true);
    viewer.ws.close(1000);
  });
});
