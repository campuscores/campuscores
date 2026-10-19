// Property test for the pure Offline_Queue reducer in src/features/operator/queue.js. It runs in Node, once.
import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { emptyQueue, nextClientSeq, nextToSend, queueReducer } from '../src/features/operator/queue.js';

test.skip(({ browserName }) => browserName !== 'chromium', 'Pure Node logic: run in one project only.');

const step = fc.oneof(
  fc.record({ kind: fc.constant('enqueue') }), // new action with the next clientSeq (Req 19.2)
  fc.record({ kind: fc.constant('reenqueue'), pick: fc.nat() }), // same actionId again: must be ignored
  fc.record({ kind: fc.constant('send') }), // driver sends the head, as the console does
  fc.record({ kind: fc.constant('rogueSend'), pick: fc.nat() }), // SEND_START for any known actionId
  fc.record({ kind: fc.constant('outcome'), type: fc.constantFrom('SEND_NETWORK_ERROR', 'SEND_5XX') }),
  fc.record({ kind: fc.constant('ok'), seq: fc.integer({ min: 1, max: 1e6 }) }),
  fc.record({ kind: fc.constant('reject'), rejection: fc.constantFrom([401, 'UNAUTHENTICATED'], [403, 'NOT_ASSIGNED'], [409, 'SEQUENCE_CONFLICT']) }),
  fc.record({ kind: fc.constant('resume') }),
);

// Feature: backend-live-platform, Property 18
test('Property 18: offline queue sends in order and pauses safely (Req 19.3, 19.5, 19.6, 19.7)', () => {
  fc.assert(fc.property(fc.array(step, { maxLength: 60 }), fc.integer({ min: 0, max: 20 }), (steps, leaseSeq) => {
    let state = emptyQueue;
    const enqueued = new Map(); // actionId -> clientSeq, as first recorded
    const accepted = new Map(); // actionId -> server seq
    const sent = []; // clientSeq of every send that actually started
    let paused = false;
    let retryOf = null; // actionId whose last send failed on the network or with 5xx

    for (const s of steps) {
      const before = state;
      const ids = [...enqueued.keys()];
      let event = null;
      if (s.kind === 'enqueue') {
        const actionId = `a${enqueued.size}`;
        event = { type: 'ENQUEUE', item: { actionId, clientSeq: nextClientSeq(state, leaseSeq), matchId: 'm1' } };
        enqueued.set(actionId, event.item.clientSeq);
      } else if (s.kind === 'reenqueue' && ids.length) {
        event = { type: 'ENQUEUE', item: { actionId: ids[s.pick % ids.length], clientSeq: 0, matchId: 'm1' } };
      } else if (s.kind === 'send') {
        const head = nextToSend(state);
        if (paused || before.inFlight) expect(head).toBeNull(); // pause or a send in flight blocks sending
        if (head) {
          if (retryOf) expect(head.actionId).toBe(retryOf); // a retry reuses the same actionId (Req 19.3, 19.6)
          event = { type: 'SEND_START', actionId: head.actionId };
        }
      } else if (s.kind === 'rogueSend' && ids.length) {
        event = { type: 'SEND_START', actionId: ids[s.pick % ids.length] };
      } else if (s.kind === 'outcome') event = { type: s.type };
      else if (s.kind === 'ok') event = { type: 'SEND_OK', seq: s.seq };
      else if (s.kind === 'reject') event = { type: 'SEND_REJECTED', status: s.rejection[0], code: s.rejection[1] };
      else if (s.kind === 'resume') event = { type: 'RESUME' };
      if (!event) continue;

      state = queueReducer(state, event);
      const flying = before.inFlight;

      if (event.type === 'SEND_START' && state !== before) {
        expect(paused).toBe(false); // never sends while paused (Req 19.5)
        expect(flying).toBeNull(); // one at a time (Req 19.3)
        sent.push(enqueued.get(event.actionId));
        retryOf = null;
      }
      if (event.type === 'SEND_OK' && flying) accepted.set(flying, event.seq);
      if ((event.type === 'SEND_NETWORK_ERROR' || event.type === 'SEND_5XX') && flying) retryOf = flying;
      if (event.type === 'SEND_REJECTED' && flying) {
        paused = true;
        expect(state.paused).toBe(event.code); // the server code is kept for display (Req 19.5)
      }
      if (event.type === 'RESUME') paused = false;

      // Invariants after every event.
      const syncing = state.items.filter(i => i.status === 'syncing');
      expect(syncing.length).toBeLessThanOrEqual(1);
      expect(state.inFlight).toBe(syncing[0]?.actionId ?? null);
      expect(Boolean(state.paused)).toBe(paused);
      if (paused) expect(nextToSend(state)).toBeNull();
      // Every recorded action is kept once, in clientSeq order, with its original actionId and clientSeq.
      expect(state.items.map(i => [i.actionId, i.clientSeq])).toEqual([...enqueued].sort((a, b) => a[1] - b[1]));
      for (const i of state.items) {
        // Synced only after an accepted outcome, with the accepted Server_Sequence (Req 19.7).
        if (accepted.has(i.actionId)) expect(i).toMatchObject({ status: 'synced', seq: accepted.get(i.actionId) });
        else expect(i.status).not.toBe('synced');
      }
    }
    sent.forEach((seq, i) => i > 0 && expect(seq).toBeGreaterThanOrEqual(sent[i - 1])); // non-decreasing send order
  }), { numRuns: 200 });
});
