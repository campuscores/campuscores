import { describe, expect, it } from 'vitest';
import { engineFor } from '../src/engines/index.js';
import testEngine from '../src/engines/test-engine.js';
// Example cases; the Test_Engine undo property test arrives with task 9.7.

describe('engineFor', () => {
  it('returns the Test_Engine only when the flag is exactly "true"', () => {
    expect(engineFor('football', { ENABLE_TEST_ENGINE: 'true' })).toBe(testEngine);
    expect(engineFor('football', {})).toBeNull();
    expect(engineFor('football', { ENABLE_TEST_ENGINE: 'false' })).toBeNull();
    expect(engineFor('football', { ENABLE_TEST_ENGINE: true })).toBeNull();
  });
});

describe('Test_Engine', () => {
  const start = testEngine.init({ matchId: '42', sport: 'badminton', status: 'LIVE', sides: ['A', 'B'] });
  const point = (side) => ({ type: 'POINT', payload: { side } });
  const reverse = { type: 'REVERSE', payload: {}, reversesActionId: 'p1' };
  const points = (r) => r.snapshot.sides.map((s) => s.points);

  it('starts at 0-0 with the design snapshot shape', () => {
    expect(start).toEqual({
      matchId: '42',
      sport: 'badminton',
      status: 'LIVE',
      sides: [{ name: 'A', points: 0 }, { name: 'B', points: 0 }],
      corrected: false,
    });
  });

  it('adds a point to the named side without mutating the input', () => {
    const r = testEngine.apply(start, point(1));
    expect(r.ok).toBe(true);
    expect(points(r)).toEqual([0, 1]);
    expect(start.sides[1].points).toBe(0);
  });

  it('reverses an unreversed POINT back to the previous score with corrected still false', () => {
    const after = testEngine.apply(start, point(0)).snapshot;
    const r = testEngine.apply(after, reverse, { type: 'POINT', payload: { side: 0 }, reversed: false });
    expect(r.ok).toBe(true);
    expect(r.snapshot).toEqual(start);
  });

  it('rejects invalid actions', () => {
    const one = testEngine.apply(start, point(0)).snapshot;
    const target = { type: 'POINT', payload: { side: 0 }, reversed: false };
    expect(testEngine.apply(start, point(2)).ok).toBe(false);
    expect(testEngine.apply(start, { type: 'POINT', payload: {} }).ok).toBe(false);
    expect(testEngine.apply(start, { type: 'GOAL', payload: { side: 0 } }).ok).toBe(false);
    expect(testEngine.apply(one, reverse, null).ok).toBe(false); // unknown or other match
    expect(testEngine.apply(one, reverse, { ...target, reversed: true }).ok).toBe(false);
    expect(testEngine.apply(one, reverse, { ...target, type: 'REVERSE' }).ok).toBe(false);
    expect(testEngine.apply(one, { ...point(0), reversesActionId: 'p1' }, target).ok).toBe(false);
    expect(testEngine.apply(start, reverse, target).ok).toBe(false); // no point to remove
  });
});
