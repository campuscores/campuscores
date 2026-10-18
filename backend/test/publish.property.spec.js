// Feature: backend-live-platform, Property 2: Live room publish is monotonic
// Validates: Requirements 4.5, 4.6
import { env } from 'cloudflare:workers';
import { runInDurableObject } from 'cloudflare:test';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

// Small integers repeat often, so equal and lower resends are common; the rest must always be rejected.
// The largest valid value is MAX_SAFE - 1 so the sentinel publish below is always valid.
const seqValue = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: -3, max: 12 }) },
  { weight: 1, arbitrary: fc.constantFrom(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER + 2) },
  { weight: 2, arbitrary: fc.oneof(fc.double({ noInteger: true }), fc.constantFrom(NaN, Infinity, -Infinity)) },
  { weight: 1, arbitrary: fc.constantFrom(null, undefined, '5', 5n, true, {}) },
);

let roomNo = 900000000; // unique room per run, away from ids other spec files use

describe('Property 2: live room publish is monotonic', () => {
  it('stores the max valid seq and broadcasts only strictly newer seqs', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(seqValue, { maxLength: 12 }), async (seqs) => {
        const name = `match:${roomNo++}`;
        const room = env.ROOMS.get(env.ROOMS.idFromName(name));
        const res = await room.fetch('http://room/', { headers: { Upgrade: 'websocket' } });
        const ws = res.webSocket;
        const received = [];
        let sentinelSeen;
        const sentinel = new Promise((resolve) => (sentinelSeen = resolve));
        ws.addEventListener('message', (e) => {
          const msg = JSON.parse(e.data);
          if (msg.data?.status === 'sentinel') sentinelSeen();
          else received.push(msg.seq);
        });
        ws.accept();

        let max = 0;
        const accepted = [];
        for (const [i, seq] of seqs.entries()) {
          const expected = Number.isSafeInteger(seq) && seq > max;
          expect(await room.publish({ matchId: i }, seq)).toBe(expected);
          if (expected) accepted.push((max = seq));
        }

        const stored = await runInDurableObject(room, (_, state) => state.storage.get('seq'));
        expect(stored ?? 0).toBe(max);

        // Per-socket delivery is ordered, so once the sentinel arrives every earlier broadcast has too.
        expect(await room.publish({ status: 'sentinel' }, max + 1)).toBe(true);
        await sentinel;
        expect(received).toEqual(accepted);
        ws.close(1000);
      }),
      { numRuns: 100 },
    );
  }, 60000); // 100 real Durable Object rooms with a socket each
});
