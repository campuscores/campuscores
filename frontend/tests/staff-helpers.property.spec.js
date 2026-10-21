// Property tests for the pure staff helpers in src/features/staff. They run in Node, once.
import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { DEFAULT_FORMATS, validateFormat } from '../../shared/scoring.mjs';
import { formatSummary } from '../src/features/staff/formatSummary.js';

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
