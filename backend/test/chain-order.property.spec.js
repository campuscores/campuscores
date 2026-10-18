// Feature: backend-live-platform, Property 12: Authorization chain returns the first failed check
// Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluateChain } from '../src/scoring.js';

// Requirement 15.1 order with the [status, code] each failure must return (15.2-15.5).
const CHECKS = [
  ['token', [401, 'UNAUTHENTICATED']],
  ['account', [403, 'NOT_STAFF']],
  ['active', [403, 'ACCOUNT_DISABLED']],
  ['assignment', [403, 'NOT_ASSIGNED']],
  ['window', [403, 'OUTSIDE_WINDOW']],
  ['permission', [403, 'PERMISSION_DENIED']],
  ['state', [409, 'SCORING_LOCKED']],
  ['lease', [409, 'LEASE_REQUIRED']],
];

const ROLES = ['SUPER_ADMIN', 'TOURNAMENT_MANAGER', 'MATCH_OPERATOR'];
const MANAGERS = ['SUPER_ADMIN', 'TOURNAMENT_MANAGER'];
const now = new Date(Date.UTC(2026, 9, 18, 9, 0, 0));
const at = (ms) => new Date(now.getTime() + ms);

// Match states from Requirement 15.6, split by whether the given role may score.
const passingStates = (role) => [
  { status: 'LIVE', correction_route: null },
  { status: 'REJECTED', correction_route: 'OPERATOR' },
  ...(MANAGERS.includes(role) ? [{ status: 'REJECTED', correction_route: 'MANAGER' }] : []),
];
const failingStates = (role) => [
  { status: 'SCHEDULED', correction_route: null },
  { status: 'PENDING_APPROVAL', correction_route: null },
  { status: 'APPROVED', correction_route: null },
  ...(MANAGERS.includes(role) ? [] : [{ status: 'REJECTED', correction_route: 'MANAGER' }]),
];

const windows = {
  pass: [[null, null], [now, null], [null, at(1)], [at(-1000), at(1000)], [now, at(1)]],
  // Before start, or at/after end (end is exclusive).
  fail: [[at(1), null], [null, now], [at(-1000), at(-1)], [at(1), at(1000)], [now, now]],
};

const flags = fc.record(Object.fromEntries(CHECKS.map(([name]) => [name, fc.boolean()])));
const scenario = fc.record({
  ok: flags,
  role: fc.constantFrom(...ROLES),
  missingToken: fc.constantFrom(null, undefined, ''),
  badPermission: fc.constantFrom('VIEW', 'score', ''),
  badLease: fc.constantFrom('none', 'otherDevice', 'otherAccount', 'both'),
  pick: fc.nat(),
});

function buildCtx({ ok, role, missingToken, badPermission, badLease, pick }) {
  const states = ok.state ? passingStates(role) : failingStates(role);
  const [validFrom, validUntil] = (ok.window ? windows.pass : windows.fail)[pick % 5];
  const lease = {
    none: null,
    otherDevice: { accountId: 'acc_1', deviceId: 'dev_2' },
    otherAccount: { accountId: 'acc_2', deviceId: 'dev_1' },
    both: { accountId: 'acc_2', deviceId: 'dev_2' },
  }[badLease];
  return {
    userId: ok.token ? 'user_1' : missingToken,
    deviceId: 'dev_1',
    now,
    match: { id: 1, ...states[pick % states.length] },
    account: ok.account ? { id: 'acc_1', status: ok.active ? 'ACTIVE' : 'DISABLED', role } : null,
    assignment: ok.assignment
      ? { validFrom, validUntil, permission: ok.permission ? 'SCORE' : badPermission }
      : null,
    lease: ok.lease ? { accountId: 'acc_1', deviceId: 'dev_1', lastClientSeq: 0 } : lease,
  };
}

const expected = (ok) => CHECKS.find(([name]) => !ok[name])?.[1] ?? null;

describe('Property 12: authorization chain returns the first failed check', () => {
  it('returns null only when every check passes, else the first failure in order', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        expect(evaluateChain(buildCtx(s))).toEqual(expected(s.ok));
      }),
      { numRuns: 1000 },
    );
  });

  it('reports each check when it is the only failure', () => {
    const allPass = Object.fromEntries(CHECKS.map(([name]) => [name, true]));
    const base = { role: 'MATCH_OPERATOR', missingToken: null, badPermission: 'VIEW', badLease: 'none', pick: 0 };
    expect(evaluateChain(buildCtx({ ...base, ok: allPass }))).toBeNull();
    for (const [name, result] of CHECKS) {
      expect(evaluateChain(buildCtx({ ...base, ok: { ...allPass, [name]: false } }))).toEqual(result);
    }
  });
});
