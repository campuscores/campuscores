// Feature: backend-live-platform, Property 4: Public DTOs contain only allow-listed fields
// Validates: Requirements 4.8, 10.4
// Feature: staff-roles-manager-console, Property 14: Public responses never leak staff data
// Validates: Requirements 18.2, 18.3
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { toPublic } from '../src/http.js';

// Approved public fields from the design (`true` = primitive leaf, object = nested shape).
// This mirror must match the allow-lists in `backend/src/http.js`.
const SIDE = { name: true };
const FORMAT = { model: true, bestOf: true, target: true, winBy: true, cap: true, decidingTarget: true, firstServe: true, gamesPerSet: true, gameWinBy: true, advantage: true, tiebreakAt: true, tiebreakTo: true, tiebreakWinBy: true, periodCount: true, scoreValues: true };
const PERIOD = { points: true, winner: true, current: true, manual: true, tiebreak: true };
const SNAPSHOT = { matchId: true, sport: true, status: true, sides: { name: true, points: true }, corrected: true, format: FORMAT, periods: PERIOD, currentPoints: true, gamePoints: true, serve: true, winner: true, finalized: true, finalizedAt: true, tiebreak: true, fouls: true, events: { type: true, side: true, player: true, card: true, off: true, on: true, period: true } };
const MATCH = {
  id: true, tournamentId: true, tournamentName: true, tournamentSlug: true, sport: true,
  kind: true, stage: true, status: true, phase: true, scheduledAt: true, venue: true,
  seq: true, sides: SIDE, snapshot: SNAPSHOT,
};
const SPECS = {
  snapshot: SNAPSHOT,
  match: MATCH,
  card: { id: true, sport: true, status: true, competition: true, sides: SIDE, score: true, clock: true, seq: true, format: FORMAT, periods: PERIOD, winner: true, finalizedAt: true, gamePoints: true, serve: true, events: { type: true, side: true, player: true, card: true, off: true, on: true, period: true } },
  tournament: {
    id: true, slug: true, name: true, startsOn: true, endsOn: true, status: true,
    phase: true, imageKey: true, venue: true, description: true, sports: true, matches: MATCH,
  },
};

const MARK = 'PRIVATEMARK';
// Private key names injected by Property 4's generic `extras`. These must never collide with an
// allow-listed field at any depth (e.g. `events.player`), so the generic generator can assume any
// value under one of these keys is dropped. Keep this list free of allow-listed names.
const PRIVATE_KEYS = [
  'email', 'accountId', 'account_id', 'lease', 'leaseHolder', 'assignment', 'assignments',
  'audit', 'auditLog', 'correction_route', 'roster', 'role', 'clerkUserId',
];
// Staff-only field names that must never survive `toPublic` (Requirement 18.2): staff emails,
// account and Clerk IDs, owner, Sport_Managers, Assignments, invitations, leases, device IDs,
// Audit_Rows, raw score actions, configuration version, team branch, year and Player_Entries.
// Property 14 injects these at the top level of each generated node, where none is allow-listed,
// so a surviving value always means a real leak. Some names (`player`, `action`, `year`, `branch`)
// are allow-listed only at deeper levels, so they stay out of `PRIVATE_KEYS` above.
const STAFF_ONLY_KEYS = [
  ...PRIVATE_KEYS,
  'ownerAccountId', 'owner', 'leases', 'sportManager', 'sportManagers',
  'invite', 'invitation', 'invitations', 'deviceId', 'auditRows', 'action', 'actions',
  'configVersion', 'config_version', 'branch', 'year', 'player', 'players',
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

// Property 14 reuses the MARK sentinel approach of Property 4 but injects staff-only fields at
// any depth of a realistic object tree, then asserts no marked value survives `toPublic`.
// MARK is placed ONLY on staff-only values; allow-listed leaves get clean values, so any MARK
// in the output is a genuine leak.

// Every staff value carries MARK so a surviving value is always detectable in the output JSON.
const marked = fc.string().map((s) => `${MARK}${s}`);
// A staff object: account identity, invitations, assignments, leases, audit and raw actions.
const staffObject = fc.record({
  email: marked,
  accountId: marked,
  clerkUserId: marked,
  ownerAccountId: marked,
  deviceId: marked,
  configVersion: marked,
  role: marked,
  invitation: fc.record({ email: marked, role: marked, token: marked }),
  invitations: fc.array(fc.record({ email: marked, token: marked }), { maxLength: 2 }),
  assignments: fc.array(fc.record({ accountId: marked, lease: marked, deviceId: marked }), { maxLength: 2 }),
  sportManagers: fc.array(fc.record({ accountId: marked, email: marked }), { maxLength: 2 }),
  auditLog: fc.array(fc.record({ action: marked, actorId: marked, before: marked }), { maxLength: 2 }),
  actions: fc.array(fc.record({ type: marked, payload: marked }), { maxLength: 2 }),
});

// A team/player object: branch, year and the Player_Entries list are staff-only.
const teamObject = fc.record({
  branch: marked,
  year: marked,
  players: fc.array(fc.record({ name: marked, branch: marked, year: marked }), { maxLength: 3 }),
});

// The staff-only fields injected at a node. Keys never on any allow-list (owner, team, lease,
// assignment, email, ...) plus staff-shaped values under some allow-listed keys. Allow-listed
// keys (name, status, matchId, ...) are omitted here, so no MARK ever rides a surviving key.
function staffFieldsAt(depth) {
  const fields = {
    owner: staffObject,
    team: teamObject,
    lease: marked,
    assignment: fc.record({ accountId: marked, deviceId: marked }),
    ...Object.fromEntries(STAFF_ONLY_KEYS.map((k) => [k, marked])),
  };
  if (depth > 0) {
    const child = staffLadenNode(depth - 1);
    // Nest under allow-listed container keys so recursion carries staff data down the allowed path.
    fields.matches = fc.array(child, { maxLength: 2 });
    fields.sides = fc.array(fc.record({ owner: staffObject, assignment: marked }), { maxLength: 2 });
    fields.snapshot = fc.record({ owner: staffObject, team: teamObject, assignments: fc.array(marked, { maxLength: 2 }) });
    fields.sports = fc.array(staffObject, { maxLength: 2 });
  }
  return fields;
}

// A node that carries staff and team data at the top level and, via allow-listed container keys,
// at deeper levels too.
function staffLadenNode(depth) {
  return fc.record(staffFieldsAt(depth));
}

const kindAndStaffObject = fc.oneof(
  ...Object.keys(SPECS).map((kind) => staffLadenNode(3).map((obj) => [kind, obj])),
);

describe('Property 14: Public responses never leak staff data', () => {
  it('drops every staff-only field injected at any depth', () => {
    fc.assert(
      fc.property(kindAndStaffObject, ([kind, obj]) => {
        const out = toPublic(kind, obj);
        // No injected staff value may survive, at any depth.
        expect(JSON.stringify(out)).not.toContain(MARK);
        // Only allow-listed keys survive at every depth.
        check(SPECS[kind], obj, out, kind);
      }),
      { numRuns: 200 },
    );
  });
});
