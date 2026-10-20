import { describe, expect, it } from 'vitest';
import { activeActions, checkReversal, DEFAULT_FORMATS, scoreMatch, validateFormat, winsPoints } from '../../../shared/scoring.mjs';
const action = (type, payload = {}, extra = {}) => ({ actionId: crypto.randomUUID(), type, payload, ...extra });
const point = (side, value) => action('POINT', { side, ...(value ? { value } : {}) });
const points = (side, n) => Array.from({ length: n }, () => point(side));
const score = (sport, actions, custom = {}) => scoreMatch({ matchId: '7', sport, sides: ['Alpha', 'Bravo'], format: { ...DEFAULT_FORMATS[sport], ...custom }, actions });

describe('validated presets and custom formats', () => {
  it.each(Object.keys(DEFAULT_FORMATS))('%s has a valid independent preset', sport => {
    expect(validateFormat(sport, DEFAULT_FORMATS[sport])).toEqual(DEFAULT_FORMATS[sport]);
  });
  it.each([1, 3, 5, 7])('supports best of %s and a 15-point target', bestOf => {
    const actions = Array.from({ length: (bestOf + 1) / 2 }, () => points(0, 15)).flat();
    expect(score('badminton', actions, { bestOf, target: 15, decidingTarget: 15, cap: 26 }).winner).toBe(0);
  });
  it.each([{ bestOf: 2 }, { target: 0 }, { winBy: 0 }, { cap: 20 }, { firstServe: 3 }, { target: NaN }, { model: 'periods' }, { arbitrary: true }])('rejects invalid format %j', change => {
    expect(() => validateFormat('badminton', { ...DEFAULT_FORMATS.badminton, ...change })).toThrow();
  });
  it('rejects invalid score values and tennis formats', () => {
    for (const scoreValues of [[0], [1, 1], [101], [1, 2, 3, 4], '1,2']) expect(() => validateFormat('basketball', { scoreValues })).toThrow();
    expect(() => validateFormat('lawn-tennis', { tiebreakAt: 2 })).toThrow();
    expect(() => validateFormat('lawn-tennis', { gamesPerSet: 1, tiebreakAt: 0 })).toThrow();
  });
});

it('BWF 21, deuce, 29-all golden point; custom 25-all means the 26th point wins', () => {
  expect(winsPoints(21, 19, 21, 2, 30)).toBe(true);
  expect(winsPoints(21, 20, 21, 2, 30)).toBe(false);
  expect(winsPoints(22, 20, 21, 2, 30)).toBe(true);
  expect(winsPoints(30, 29, 21, 2, 30)).toBe(true);
  expect(winsPoints(25, 24, 15, 2, 26)).toBe(false);
  expect(winsPoints(26, 25, 15, 2, 26)).toBe(true);
});
it('rally serve follows the winning side and table-tennis serve changes at two points and at deuce', () => {
  expect(score('badminton', [point(1)]).serve).toBe(1);
  expect(score('table-tennis', points(0, 1)).serve).toBe(0);
  expect(score('table-tennis', points(0, 2)).serve).toBe(1);
  const tied = Array.from({ length: 10 }, () => [point(0), point(1)]).flat();
  expect(score('table-tennis', tied).serve).toBe(0);
  expect(score('table-tennis', [...tied, point(0)]).serve).toBe(1);
});
it('volleyball uses a 15-point deciding set, not 25', () => {
  const actions = [action('END_SET', { winner: 0 }), action('END_SET', { winner: 1 }), action('END_SET', { winner: 0 }), action('END_SET', { winner: 1 }), ...points(0, 15)];
  const state = score('volleyball', actions);
  expect(state.winner).toBe(0); expect(state.periods.at(-1).points).toEqual([15, 0]); expect(state.sides.map(s => s.points)).toEqual([3, 2]);
});
it('early set endings retain actual points and do not invent scores', () => {
  const state = score('badminton', [...points(0, 5), action('END_SET', { winner: 1 })]);
  expect(state.periods[0]).toMatchObject({ points: [5, 0], winner: 1, manual: true });
});
it('undoing a deciding point recalculates the winner; start and finalization cannot be reversed', () => {
  const scored = points(0, 3), reverse = action('REVERSE', {}, { reversesActionId: scored.at(-1).actionId });
  expect(score('badminton', scored, { bestOf: 1, target: 3, decidingTarget: 3 }).winner).toBe(0);
  expect(score('badminton', [...scored, reverse], { bestOf: 1, target: 3, decidingTarget: 3 }).winner).toBe(null);
  expect(activeActions([...scored, reverse])).toHaveLength(2);
  expect(() => checkReversal([action('START')], reverse)).toThrow();
  expect(() => checkReversal([reverse], action('REVERSE', {}, { reversesActionId: reverse.actionId }))).toThrow();
});
it('tennis supports advantage/no-ad, custom short sets and 6-6 tiebreaks', () => {
  expect(score('lawn-tennis', points(0, 3)).gamePoints).toEqual(['40', '0']);
  const deuce = Array.from({ length: 3 }, () => [point(0), point(1)]).flat();
  expect(score('lawn-tennis', [...deuce, point(0)]).gamePoints).toEqual(['Ad', '40']);
  expect(score('lawn-tennis', [...deuce, point(0)], { advantage: false }).periods[0].points).toEqual([1, 0]);
  expect(score('lawn-tennis', points(0, 4 * 4), { bestOf: 1, gamesPerSet: 4, tiebreakAt: 4 }).winner).toBe(0);
  const sixAll = Array.from({ length: 6 }, () => [...points(0, 4), ...points(1, 4)]).flat();
  const tb = score('lawn-tennis', sixAll);
  expect(tb.tiebreak).toBe(true); expect(tb.periods[0].points).toEqual([6, 6]);
  expect(score('lawn-tennis', [...sixAll, point(0)]).serve).toBe(1);
  expect(score('lawn-tennis', [...sixAll, ...points(0, 2)]).serve).toBe(1);
  expect(score('lawn-tennis', [...sixAll, ...points(0, 3)]).serve).toBe(0);
  const won = score('lawn-tennis', [...sixAll, ...points(0, 7)]);
  expect(won.periods[0]).toMatchObject({ points: [7, 6], tiebreak: [7, 0], winner: 0 }); expect(won.serve).toBe(1);
});
it('team points need no player; periods sum; tied basketball offers an extra period', () => {
  const first = [point(0, 3), point(0, 2), point(1, 1)];
  expect(score('basketball', first).sides.map(s => s.points)).toEqual([5, 1]);
  const ended = [point(0, 3), point(1, 3), action('END_PERIOD')];
  expect(score('basketball', ended, { periodCount: 1 }).winner).toBe(null);
  expect(() => score('basketball', [...ended, action('FINALIZE')], { periodCount: 1 })).toThrow(/tied/);
  const overtime = score('basketball', [...ended, action('EXTRA_PERIOD'), point(1, 2), action('END_PERIOD')], { periodCount: 1 });
  expect(overtime.winner).toBe(1); expect(overtime.sides.map(s => s.points)).toEqual([3, 5]);
});
it('records cards/substitutions separately from team goals and rejects invalid input', () => {
  const state = score('football', [point(0), action('CARD', { side: 1, player: 'Kabir', card: 'yellow' }), action('SUB', { side: 0, off: 'Aman', on: 'Rohit' })]);
  expect(state.sides.map(s => s.points)).toEqual([1, 0]); expect(state.events).toHaveLength(2);
  for (const a of [point(2), point(0, 3), action('POINT', { side: 0, player: 'Aman' }), action('CARD', { side: 0, player: '', card: 'red' }), action('SUB', { side: 0, off: 'A', on: 'A' })]) expect(() => score('football', [a])).toThrow();
});
it('final confirmation locks all further scoring and preserves winner 0', () => {
  const actions = [...points(0, 1), action('FINALIZE')];
  const state = score('badminton', actions, { bestOf: 1, target: 1, decidingTarget: 1, winBy: 1 });
  expect(state.status).toBe('APPROVED'); expect(state.winner).toBe(0); expect(state.finalized).toBe(true);
  expect(() => score('badminton', [...actions, point(1)], { bestOf: 1, target: 1, decidingTarget: 1, winBy: 1 })).toThrow(/locked/);
});
it('football ties wait for the event policy and cannot be finalized or resolved with an unapproved period', () => {
  const actions = [action('END_PERIOD'), action('END_PERIOD')];
  expect(score('football', actions).winner).toBeNull();
  expect(() => score('football', [...actions, action('EXTRA_PERIOD')])).toThrow(/football tie policy/);
  expect(() => score('football', [...actions, action('FINALIZE')])).toThrow(/tied/);
});
