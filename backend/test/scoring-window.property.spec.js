// Feature: backend-live-platform, Property 9: Assignment window uses inclusive start and exclusive end
// Validates: Requirements 14.5, 15.3, 15.7
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isWithinWindow } from '../src/scoring.js';

// Reference: a null bound is an infinite edge; the window is the half-open range [lo, hi) in epoch ms.
const reference = (now, from, until) => {
  const lo = from?.getTime() ?? -Infinity;
  const hi = until?.getTime() ?? Infinity;
  return lo <= now.getTime() && now.getTime() < hi;
};

// Small ms offsets from one base time make equal and adjacent instants common, so both edges get hit.
const base = Date.UTC(2026, 9, 18, 9, 0, 0);
const instant = fc.integer({ min: -3, max: 3 }).map((ms) => new Date(base + ms));
const bound = fc.option(instant, { nil: null, freq: 3 });

describe('Property 9: assignment window uses inclusive start and exclusive end', () => {
  it('matches the half-open reference for any time and nullable bounds', () => {
    fc.assert(
      fc.property(instant, bound, bound, (now, from, until) => {
        expect(isWithinWindow(now, from, until)).toBe(reference(now, from, until));
      }),
      { numRuns: 500 },
    );
  });

  it('accepts the exact start, rejects the exact end, and treats null bounds as open', () => {
    const t = new Date(base);
    expect(isWithinWindow(t, new Date(base), new Date(base + 1))).toBe(true);
    expect(isWithinWindow(t, new Date(base - 1), new Date(base))).toBe(false);
    expect(isWithinWindow(t, new Date(base), new Date(base))).toBe(false);
    expect(isWithinWindow(t, null, null)).toBe(true);
    expect(isWithinWindow(t, null, new Date(base + 1))).toBe(true);
    expect(isWithinWindow(t, new Date(base + 1), null)).toBe(false);
  });
});
