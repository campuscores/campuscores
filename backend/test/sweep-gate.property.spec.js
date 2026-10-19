// Feature: backend-live-platform, Property 15: Sweep gate
// Validates: Requirements 17.3, 17.4
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SWEEP_WINDOW_MS, shouldSweep } from '../src/outbox.js';

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const now = fc.integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2027, 0, 1) });
// Ages cluster around the 15-minute edge so the boundary and its neighbours get hit, plus wide ages and future writes.
const age = fc.oneof(
  fc.integer({ min: -3, max: 3 }).map((d) => FIFTEEN_MIN_MS + d),
  fc.integer({ min: -FIFTEEN_MIN_MS, max: 4 * FIFTEEN_MIN_MS }),
);

describe('Property 15: sweep gate', () => {
  it('sweeps if and only if the Write_Signal is at most 15 minutes old', () => {
    fc.assert(
      fc.property(now, age, (t, a) => {
        expect(shouldSweep(t, t - a)).toBe(a <= FIFTEEN_MIN_MS);
      }),
      { numRuns: 500 },
    );
  });

  it('uses a 15-minute window with an inclusive boundary', () => {
    const t = Date.UTC(2026, 9, 18, 9, 0, 0);
    expect(SWEEP_WINDOW_MS).toBe(FIFTEEN_MIN_MS);
    expect(shouldSweep(t, t - FIFTEEN_MIN_MS)).toBe(true);
    expect(shouldSweep(t, t - FIFTEEN_MIN_MS - 1)).toBe(false);
    expect(shouldSweep(t, t)).toBe(true);
  });
});
