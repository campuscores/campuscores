// Property tests for the pure Live_Client helpers in src/services/live.js. They run in Node, once.
import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { applyMessage, backoffDelay } from '../src/services/live.js';

test.skip(({ browserName }) => browserName !== 'chromium', 'Pure Node logic: run in one project only.');

const snapshot = fc.record({ type: fc.constant('snapshot'), seq: fc.integer({ min: -50, max: 50 }), data: fc.jsonValue() });
const badSeq = fc.oneof(
  fc.double().filter(n => !Number.isSafeInteger(n)),
  fc.constantFrom(2 ** 53, -(2 ** 53), '7', null, true),
);
const invalidFrame = fc.oneof(
  fc.string().map(s => `{${s}`), // mostly unparseable JSON
  fc.record({ type: fc.string().filter(t => t !== 'snapshot'), seq: fc.integer(), data: fc.jsonValue() }).map(m => JSON.stringify(m)),
  fc.record({ type: fc.constant('snapshot'), seq: badSeq, data: fc.jsonValue() }).map(m => JSON.stringify(m)),
  fc.jsonValue().map(v => JSON.stringify(v)),
);
const frame = fc.oneof(snapshot.map(m => ({ valid: m, raw: JSON.stringify(m) })), invalidFrame.map(raw => ({ raw })));

// Feature: backend-live-platform, Property 16
test('Property 16: live client applies only newer valid snapshots (Req 18.2, 18.3, 18.8)', () => {
  fc.assert(fc.property(fc.array(frame, { maxLength: 40 }), frames => {
    let state = { seq: null };
    const applied = [];
    for (const { valid, raw } of frames) {
      const next = applyMessage(state, raw);
      if (!valid) expect(next).toBe(state); // invalid frame: same state object
      else if (state.seq != null && valid.seq <= state.seq) expect(next).toBe(state); // stale or duplicate
      else {
        expect(next).toEqual({ seq: valid.seq, data: JSON.parse(raw).data });
        applied.push(next.seq);
      }
      state = next;
    }
    applied.forEach((seq, i) => i > 0 && expect(seq).toBeGreaterThan(applied[i - 1]));
    const valids = frames.filter(f => f.valid);
    if (!valids.length) return expect(state).toEqual({ seq: null });
    // Final state is the first valid frame carrying the highest seq; the first frame is accepted at any seq.
    const max = Math.max(...valids.map(f => f.valid.seq));
    const winner = valids.find(f => f.valid.seq === max);
    expect(state).toEqual({ seq: max, data: JSON.parse(winner.raw).data });
  }), { numRuns: 200 });
});

// Feature: backend-live-platform, Property 17
test('Property 17: reconnect delay stays within bounds (Req 18.4)', () => {
  const unit = fc.oneof(
    fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
    fc.constantFrom(0, 1 - Number.EPSILON), // both edges of [0, 1)
  );
  // Up to 2000 so 2 ** attempt overflows to Infinity and the 30 s cap must still hold.
  const attempt = fc.oneof(fc.integer({ min: 0, max: 40 }), fc.integer({ min: 0, max: 2000 }));
  fc.assert(fc.property(attempt, unit, (n, r) => {
    const delay = backoffDelay(n, () => r);
    const bound = Math.min(30000, 1000 * 2 ** n); // window doubles from 1 s, capped at 30 s
    expect(Number.isInteger(delay)).toBe(true);
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThan(bound);
    expect(delay).toBeLessThanOrEqual(30000);
  }), { numRuns: 300 });
});
