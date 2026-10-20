// Feature: backend-live-platform, Property 4: Public DTOs contain only allow-listed fields
// Validates: Requirements 4.8, 10.4
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { toPublic } from '../src/http.js';

// Approved public fields from the design (`true` = primitive leaf, object = nested shape).
const SIDE = { name: true };
const FORMAT = { model: true, bestOf: true, target: true, winBy: true, cap: true, decidingTarget: true, firstServe: true, gamesPerSet: true, gameWinBy: true, advantage: true, tiebreakAt: true, tiebreakTo: true, tiebreakWinBy: true, periodCount: true, scoreValues: true };
const PERIOD = { points: true, winner: true, current: true, manual: true, tiebreak: true };
const SNAPSHOT = { matchId: true, sport: true, status: true, sides: { name: true, points: true }, corrected: true, format: FORMAT, periods: PERIOD, currentPoints: true, gamePoints: true, serve: true, winner: true, finalized: true, finalizedAt: true, tiebreak: true, fouls: true, events: { type: true, side: true, player: true, card: true, off: true, on: true, period: true } };
const MATCH = {
  id: true, tournamentId: true, sport: true, kind: true, stage: true, status: true,
  scheduledAt: true, venue: true, seq: true, sides: SIDE, snapshot: SNAPSHOT,
};
const SPECS = {
  snapshot: SNAPSHOT,
  match: MATCH,
  card: { id: true, sport: true, status: true, competition: true, sides: SIDE, score: true, clock: true, seq: true, format: FORMAT, periods: PERIOD, winner: true, finalizedAt: true, gamePoints: true, serve: true, events: { type: true, side: true, player: true, card: true, off: true, on: true, period: true } },
  tournament: {
    id: true, slug: true, name: true, startsOn: true, endsOn: true, status: true,
    venue: true, description: true, sports: true, matches: MATCH,
  },
};

const MARK = 'PRIVATEMARK';
const PRIVATE_KEYS = [
  'email', 'accountId', 'account_id', 'lease', 'leaseHolder', 'assignment', 'assignments',
  'audit', 'auditLog', 'correction_route', 'roster', 'role', 'clerkUserId',
];
const ALL_ALLOWED = new Set(Object.values(SPECS).flatMap(function keys(spec) {
  return Object.entries(spec).flatMap(([k, sub]) => [k, ...(sub === true ? [] : keys(sub))]);
}));

const isPrimitive = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const publicLeaf = fc.oneof(
  fc.string().filter((s) => !s.includes(MARK)),
  fc.integer(),
  fc.double({ noNaN: true }),
  fc.boolean(),
  fc.constant(null),
);
const privateObject = fc.string().map((s) => ({ secret: `${MARK}${s}`, email: `${MARK}@example.com` }));
// Object-shaped values: an allowed leaf key holding one of these must be dropped.
const wrongShape = fc.oneof(privateObject, fc.array(privateObject, { minLength: 1, maxLength: 2 }));
const privateValue = fc.oneof(
  fc.string().map((s) => `${MARK}${s}`),
  fc.array(fc.string().map((s) => `${MARK}${s}`), { minLength: 1, maxLength: 3 }),
  wrongShape,
);
const extraKey = fc.string().filter((k) => k !== '__proto__' && !ALL_ALLOWED.has(k));
const extras = fc
  .tuple(
    fc.record(Object.fromEntries(PRIVATE_KEYS.map((k) => [k, privateValue])), { requiredKeys: [] }),
    fc.array(fc.tuple(extraKey, privateValue), { maxLength: 3 }).map(Object.fromEntries),
  )
  .map(([priv, rand]) => ({ ...rand, ...priv }));

// An object with any subset of allowed keys plus private and random extras at this level.
function objectFor(spec) {
  const fields = Object.fromEntries(
    Object.entries(spec).map(([k, sub]) => [
      k,
      sub === true
        ? fc.oneof(publicLeaf, fc.array(publicLeaf, { maxLength: 3 }), wrongShape)
        : fc.oneof(objectFor(sub), fc.array(objectFor(sub), { maxLength: 3 }), publicLeaf),
    ]),
  );
  return fc
    .tuple(fc.record(fields, { requiredKeys: [] }), extras)
    .map(([allowed, extra]) => ({ ...extra, ...allowed }));
}

const kindAndObject = fc.oneof(
  ...Object.entries(SPECS).map(([kind, spec]) => objectFor(spec).map((obj) => [kind, obj])),
);

// Walk output beside input: every key is allowed for its level, leaves are kept unchanged.
function check(spec, input, output, path) {
  if (Array.isArray(input)) {
    expect(Array.isArray(output), path).toBe(true);
    expect(output.length, path).toBe(input.length);
    input.forEach((item, i) => check(spec, item, output[i], `${path}[${i}]`));
    return;
  }
  if (!input || typeof input !== 'object') {
    expect(output, path).toBeNull();
    return;
  }
  for (const key of Object.keys(output)) expect(Object.hasOwn(spec, key), `${path}.${key}`).toBe(true);
  for (const [key, sub] of Object.entries(spec)) {
    const keyPath = `${path}.${key}`;
    if (!Object.hasOwn(input, key)) {
      expect(Object.hasOwn(output, key), keyPath).toBe(false);
    } else if (sub !== true) {
      check(sub, input[key], output[key], keyPath);
    } else if (isPrimitive(input[key]) || (Array.isArray(input[key]) && input[key].every(isPrimitive))) {
      expect(output[key], keyPath).toEqual(input[key]);
    } else {
      expect(Object.hasOwn(output, key), keyPath).toBe(false);
    }
  }
}

describe('Property 4: Public DTOs contain only allow-listed fields', () => {
  it('keeps only allow-listed key paths, drops private data and preserves public leaves', () => {
    fc.assert(
      fc.property(kindAndObject, ([kind, obj]) => {
        const out = toPublic(kind, obj);
        check(SPECS[kind], obj, out, kind);
        expect(JSON.stringify(out)).not.toContain(MARK);
      }),
      { numRuns: 200 },
    );
  });

  it('rejects an unknown kind', () => {
    expect(() => toPublic('account', { email: 'a@example.com' })).toThrow(/Unknown Public_DTO kind/);
  });
});
