// Property tests for the pure staff helpers in src/features/staff. They run in Node, once.
import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { DEFAULT_FORMATS, validateFormat } from '../../shared/scoring.mjs';
import { formatSummary } from '../src/features/staff/formatSummary.js';
import { messageFor } from '../src/features/staff/labels.js';
import { mergeCards } from '../src/features/tournaments/mergeCards.js';

test.skip(({ browserName }) => browserName !== 'chromium', 'Pure Node logic: run in one project only.');

// Full formats inside the validateFormat ranges of shared/scoring.mjs.
const bestOf = fc.integer({ min: 0, max: 7 }).map(n => 2 * n + 1);
const firstServe = fc.constantFrom(0, 1);
const sets = fc.record({ bestOf, target: fc.integer({ min: 1, max: 999 }), decidingTarget: fc.integer({ min: 1, max: 999 }), winBy: fc.integer({ min: 1, max: 10 }), firstServe })
  .chain(f => fc.option(fc.integer({ min: Math.max(f.target, f.decidingTarget), max: 9999 })).map(cap => ({ ...f, cap })));
const tennis = fc.record({ bestOf, gamesPerSet: fc.integer({ min: 1, max: 20 }), gameWinBy: fc.integer({ min: 1, max: 2 }), advantage: fc.boolean(), tiebreakTo: fc.oneof(fc.constant(1), fc.integer({ min: 1, max: 99 })), tiebreakWinBy: fc.integer({ min: 1, max: 10 }), firstServe })
  .chain(f => fc.option(fc.integer({ min: Math.max(1, f.gamesPerSet - 1), max: 30 })).map(tiebreakAt => ({ ...f, tiebreakAt })));
const periods = sport => fc.record({
  periodCount: fc.integer({ min: 1, max: 12 }),
  scoreValues: sport === 'football' ? fc.constant([1]) : fc.uniqueArray(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 3 }),
});
const full = sport => ({ sets, tennis, periods: periods(sport) })[DEFAULT_FORMATS[sport].model];
const valid = ({ sport, input }) => { try { validateFormat(sport, input); return true; } catch { return false; } };
// A stored format may omit fields; missing fields mean the Official_Preset, which can break a kept field (cap, tiebreakAt).
const accepted = fc.constantFrom(...Object.keys(DEFAULT_FORMATS)).chain(sport => full(sport)
  .chain(f => fc.subarray(Object.keys(f)).map(keys => ({ sport, input: Object.fromEntries(keys.map(k => [k, f[k]])) }))))
  .filter(valid);

const internalKeys = [...new Set(Object.values(DEFAULT_FORMATS).flatMap(Object.keys))].filter(k => /[A-Z]/.test(k) || k === 'model');
const has = (text, phrase) => new RegExp(`(^|\\W)${phrase}(\\W|$)`, 'i').test(text);

// Feature: staff-roles-manager-console, Property 12: Format summary is plain language
test('Property 12: format summary is plain language (Req 10.8)', () => {
  fc.assert(fc.property(accepted, ({ sport, input }) => {
    const f = validateFormat(sport, input);
    const summary = formatSummary(sport, input);
    expect(formatSummary(sport, f)).toBe(summary);
    expect(typeof summary).toBe('string');
    expect(summary.trim()).not.toBe('');
    expect(summary).toMatch(/^[A-Z0-9]/);
    expect(summary).not.toMatch(/undefined|null|NaN|Infinity|\[object|[{}[\]_=]/);
    for (const key of internalKeys) expect(has(summary, key)).toBe(false);
    expect(summary).not.toMatch(/(?<!or )\b1 (points|games|sets|periods)\b/); // a lone count of 1 is singular; "2 or 1 points" is fine

    if (f.model === 'periods') {
      expect(summary.startsWith(`${f.periodCount} `)).toBe(true);
      for (const v of f.scoreValues) expect(has(summary, String(v))).toBe(true);
      return;
    }
    const unit = f.model === 'tennis' ? 'set' : sport === 'volleyball' ? 'set' : 'game';
    expect(has(summary, f.bestOf === 1 ? `1 ${unit}` : `Best of ${f.bestOf} ${unit}s`)).toBe(true);
    if (f.model === 'tennis') {
      expect(has(summary, `of ${f.gamesPerSet} games?`)).toBe(true);
      expect(has(summary, `win by ${f.gameWinBy} games?`)).toBe(true);
      if (f.tiebreakAt == null) expect(summary).toContain('no tie-break');
      else expect(has(summary, `tie-break at ${f.tiebreakAt}–${f.tiebreakAt} to ${f.tiebreakTo} points?, win by ${f.tiebreakWinBy}`)).toBe(true);
      return;
    }
    // The last game plays to decidingTarget, so a one-game match states only that target.
    expect(has(summary, `to ${f.bestOf === 1 ? f.decidingTarget : f.target}`)).toBe(true);
    if (f.bestOf > 1 && f.decidingTarget !== f.target) expect(has(summary, `to ${f.decidingTarget}`)).toBe(true);
    expect(has(summary, `win by ${f.winBy}`)).toBe(true);
    if (f.cap != null) expect(has(summary, `capped at ${f.cap}`)).toBe(true);
  }), { numRuns: 100 });
});

// The Sport_Manager add route returns one generic 400 that names no account state (Req 3.5).
test('MANAGER_NOT_ELIGIBLE shows a plain sentence on the email field', () => {
  const err = { status: 400, code: 'MANAGER_NOT_ELIGIBLE', message: 'server text' };
  expect(messageFor(err, 'email')).toBe('Enter the email of an active Tournament Manager who is not already on this sport.');
  expect(messageFor(err, 'name')).toBeNull();
});

// Live cards merge into the cached public read by match ID (Req 17.13).
test('mergeCards: card status and score win, read fields stay, card-only IDs are appended', () => {
  const matches = [
    { id: '7', sport: 'football', stage: 'Final', status: 'SCHEDULED', phase: 'upcoming', scheduledAt: '2026-10-21T10:00:00Z', venue: 'Main ground', sides: [{ name: 'A' }, { name: 'B' }] },
    { id: '8', sport: 'football', stage: 'Semi', status: 'SCHEDULED', phase: 'upcoming', venue: 'Court 2', sides: [{ name: 'C' }, { name: 'D' }] },
  ];
  const cards = [
    { id: 9, sport: 'football', status: 'APPROVED', score: [2, 0], winner: 0, sides: [{ name: 'E' }, { name: 'F' }] },
    { id: 7, sport: 'football', status: 'LIVE', score: [1, 1], clock: null, sides: [{ name: 'A' }, { name: 'B' }] },
  ];
  const before = structuredClone({ matches, cards });
  const out = mergeCards(matches, cards);

  expect(out.map(m => String(m.id))).toEqual(['7', '8', '9']);
  expect(out[0]).toEqual({ ...matches[0], clock: null, status: 'LIVE', score: [1, 1] });
  expect(out[1]).toBe(matches[1]);
  expect(out[2]).toEqual(cards[0]);
  expect({ matches, cards }).toEqual(before);
});

test('mergeCards: empty and not-yet-received inputs', () => {
  const matches = [{ id: '1', status: 'SCHEDULED' }];
  expect(mergeCards(matches, null)).toEqual(matches);
  expect(mergeCards(matches, [])).toEqual(matches);
  expect(mergeCards(null, [{ id: '2', status: 'LIVE', score: [0, 0] }])).toEqual([{ id: '2', status: 'LIVE', score: [0, 0] }]);
  expect(mergeCards([], [])).toEqual([]);
});

// An ID is a small number, sent as a number or a string, so '3' and 3 name the same match.
const idValue = fc.integer({ min: 1, max: 12 });
const asId = n => fc.constantFrom(n, String(n));
const score = fc.option(fc.array(fc.nat({ max: 50 }), { minLength: 2, maxLength: 2 }));
const status = fc.constantFrom('SCHEDULED', 'LIVE', 'PENDING_APPROVAL', 'APPROVED', 'ABANDONED');
const matchOf = n => fc.record({ id: asId(n), status, score, stage: fc.string(), venue: fc.string(), scheduledAt: fc.string(), phase: fc.constantFrom('upcoming', 'live', 'past') });
const cardOf = n => fc.record({ id: asId(n), status, score, winner: fc.option(fc.constantFrom(0, 1)), clock: fc.option(fc.nat()), venue: fc.string() }, { requiredKeys: ['id', 'status', 'score'] });
const listOf = item => fc.option(fc.uniqueArray(idValue, { maxLength: 8 }).chain(ids => fc.tuple(...ids.map(item))), { nil: null });

// Feature: staff-roles-manager-console, Property 15: Live cards merge into public match lists
// **Validates: Requirements 17.13**
test('Property 15: live cards merge into public match lists (Req 17.13)', () => {
  fc.assert(fc.property(listOf(matchOf), listOf(cardOf), (matches, cards) => {
    const before = structuredClone({ matches, cards });
    const out = mergeCards(matches, cards);
    const read = matches ?? [];
    const live = cards ?? [];
    const readIds = read.map(m => String(m.id));
    const cardOnly = live.filter(c => !readIds.includes(String(c.id)));

    // Every input ID once; read order first, then card-only IDs in card order.
    expect(out.map(m => String(m.id))).toEqual([...readIds, ...cardOnly.map(c => String(c.id))]);
    read.forEach((match, i) => {
      const card = live.find(c => String(c.id) === String(match.id));
      if (!card) return expect(out[i]).toBe(match);
      expect(out[i].status).toBe(card.status);
      expect(out[i].score).toEqual(card.score);
      for (const [key, value] of Object.entries(match)) if (key !== 'status' && key !== 'score') expect(out[i][key]).toEqual(value);
      for (const [key, value] of Object.entries(card)) if (!(key in match)) expect(out[i][key]).toEqual(value);
    });
    cardOnly.forEach((card, i) => expect(out[read.length + i]).toEqual(card));
    expect({ matches, cards }).toEqual(before);
  }), { numRuns: 200 });
});
