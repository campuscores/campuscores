// Feature: backend-live-platform, Property 14: Test_Engine undo restores the previous score
// Validates: Requirements 16.12
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { apply, init } from '../src/engines/test-engine.js';

const start = () => init({ matchId: '1', sport: 'test', status: 'LIVE', sides: ['A', 'B'] });
const side = fc.constantFrom(0, 1);
// A step is a new point, or a reversal of the pick-th unreversed point (skipped when none is left).
const step = fc.oneof(
  fc.record({ kind: fc.constant('point'), side }),
  fc.record({ kind: fc.constant('reverse'), pick: fc.nat() }),
);

describe('Property 14: Test_Engine undo restores the previous score', () => {
  it('scores each side as its count of unreversed points and keeps corrected false', () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 60 }), (steps) => {
        let snap = start();
        const log = []; // stored actions as the route loads them: { type, payload, reversed }
        for (const s of steps) {
          let res;
          if (s.kind === 'point') {
            res = apply(snap, { type: 'POINT', payload: { side: s.side } });
            log.push({ type: 'POINT', payload: { side: s.side }, reversed: false });
          } else {
            const open = log.filter((a) => !a.reversed);
            if (open.length === 0) continue;
            const target = open[s.pick % open.length];
            res = apply(snap, { type: 'REVERSE', payload: {}, reversesActionId: 'x' }, { ...target });
            target.reversed = true;
          }
          expect(res.ok).toBe(true);
          snap = res.snapshot;
        }
        for (const i of [0, 1]) {
          const expected = log.filter((a) => !a.reversed && a.payload.side === i).length;
          expect(snap.sides[i].points).toBe(expected);
        }
        expect(snap.corrected).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('returns the pre-point score after any point followed by its reversal', () => {
    fc.assert(
      fc.property(fc.nat(20), fc.nat(20), side, (a, b, s) => {
        const before = start();
        before.sides[0].points = a;
        before.sides[1].points = b;
        const frozen = structuredClone(before);
        const point = apply(before, { type: 'POINT', payload: { side: s } });
        expect(point.ok).toBe(true);
        const undo = apply(
          point.snapshot,
          { type: 'REVERSE', payload: {}, reversesActionId: 'x' },
          { type: 'POINT', payload: { side: s }, reversed: false },
        );
        expect(undo.ok).toBe(true);
        expect(undo.snapshot).toEqual(frozen);
        expect(undo.snapshot.corrected).toBe(false);
        expect(before).toEqual(frozen); // inputs are not mutated
      }),
      { numRuns: 200 },
    );
  });
});
