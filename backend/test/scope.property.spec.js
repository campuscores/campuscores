// Feature: staff-roles-manager-console, Property 1: Scope resolution
// Validates: Requirements 3.3, 3.8, 3.9, 5.2, 5.3, 9.15
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scopeDecision } from '../src/scope.js';

// scopeDecision is pure and decides from loaded facts only; status (ACTIVE/DISABLED) is gated
// upstream by canAccess/requireRole, so this property exercises roles only, no DB.
//
// Account IDs are bigint strings as pg returns them. Owner and sport-manager IDs are also those
// strings, so every comparison is string equality. The generators mix number and string id forms
// to confirm scopeDecision normalises both sides before comparing (Requirement 5.2).

const ROLES = ['SUPER_ADMIN', 'TOURNAMENT_MANAGER', 'MATCH_OPERATOR', 'VIEWER', 'UNKNOWN_ROLE'];
const LEVELS = ['tournament', 'sport'];

// A bigint-shaped id as pg returns it (a string of digits). Kept small enough to collide sometimes.
const idDigits = fc.integer({ min: 1, max: 20 }).map(String);

// Independent reference: the documented decision matrix, written from the requirements, not copied
// from the implementation.
function expected(account, { ownerId, sportManagerIds }, level) {
  if (account.role === 'SUPER_ADMIN') return { allow: true, reason: 'super_admin' };
  if (account.role !== 'TOURNAMENT_MANAGER') return { allow: false, reason: 'not_manager' };
  const id = String(account.id);
  if (ownerId != null && String(ownerId) === id) return { allow: true, reason: 'owner' };
  if (level === 'sport' && sportManagerIds.map(String).includes(id)) {
    return { allow: true, reason: 'sport_manager' };
  }
  return { allow: false, reason: 'out_of_scope' };
}

// One generated scenario: an account, a target (owner + sport managers) and a level. The owner and
// the sport-manager list sometimes include the account's own id, in either string or number form.
const scenario = fc
  .record({
    role: fc.constantFrom(...ROLES),
    accountId: idDigits,
    level: fc.constantFrom(...LEVELS),
    includeSelfAsOwner: fc.boolean(),
    includeSelfAsManager: fc.boolean(),
    selfAsNumber: fc.boolean(),
    otherOwner: fc.option(idDigits, { nil: null }),
    otherManagers: fc.array(idDigits, { maxLength: 4 }),
  })
  .chain((s) => {
    const self = s.selfAsNumber ? Number(s.accountId) : s.accountId;
    const ownerGen = s.includeSelfAsOwner
      ? fc.constant(self)
      : fc.constant(s.otherOwner);
    const managersBase = s.otherManagers.filter((m) => m !== s.accountId);
    const managersGen = s.includeSelfAsManager
      ? fc.constant([...managersBase, self])
      : fc.constant(managersBase);
    return fc.record({
      account: fc.record({ role: fc.constant(s.role), id: fc.constant(s.accountId) }),
      ownerId: ownerGen,
      sportManagerIds: managersGen,
      level: fc.constant(s.level),
    });
  });

describe('Property 1: Scope resolution', () => {
  it('matches the documented decision matrix for every role, target and level', () => {
    fc.assert(
      fc.property(scenario, ({ account, ownerId, sportManagerIds, level }) => {
        const got = scopeDecision(account, { ownerId, sportManagerIds }, level);
        const want = expected(account, { ownerId, sportManagerIds }, level);
        expect(got).toEqual(want);
      }),
      { numRuns: 300 },
    );
  });

  it('Super_Admin is always allowed, both levels', () => {
    fc.assert(
      fc.property(fc.constantFrom(...LEVELS), idDigits, (level, id) => {
        const got = scopeDecision({ role: 'SUPER_ADMIN', id }, { ownerId: null, sportManagerIds: [] }, level);
        expect(got).toEqual({ allow: true, reason: 'super_admin' });
      }),
      { numRuns: 100 },
    );
  });

  it('a non-manager, non-admin role is never in scope (not_manager)', () => {
    const nonManager = fc.constantFrom('MATCH_OPERATOR', 'VIEWER', 'UNKNOWN_ROLE');
    fc.assert(
      fc.property(nonManager, fc.constantFrom(...LEVELS), idDigits, idDigits, (role, level, id, ownerId) => {
        const got = scopeDecision({ role, id }, { ownerId, sportManagerIds: [id] }, level);
        expect(got).toEqual({ allow: false, reason: 'not_manager' });
      }),
      { numRuns: 100 },
    );
  });

  it('a manager who owns the tournament is allowed at both levels (owner), string vs number id', () => {
    fc.assert(
      fc.property(idDigits, fc.constantFrom(...LEVELS), fc.boolean(), (digits, level, ownerAsNumber) => {
        const account = { role: 'TOURNAMENT_MANAGER', id: digits }; // id is the pg string form
        const ownerId = ownerAsNumber ? Number(digits) : digits; // owner id as number or string
        const got = scopeDecision(account, { ownerId, sportManagerIds: [] }, level);
        expect(got).toEqual({ allow: true, reason: 'owner' });
      }),
      { numRuns: 100 },
    );
  });

  it('a non-owner manager in sportManagerIds is allowed only at sport level', () => {
    fc.assert(
      fc.property(idDigits, idDigits, fc.boolean(), (selfDigits, otherOwner, managerAsNumber) => {
        fc.pre(otherOwner !== selfDigits); // not the owner
        const account = { role: 'TOURNAMENT_MANAGER', id: selfDigits };
        const managerId = managerAsNumber ? Number(selfDigits) : selfDigits;
        const target = { ownerId: otherOwner, sportManagerIds: [managerId] };
        expect(scopeDecision(account, target, 'sport')).toEqual({ allow: true, reason: 'sport_manager' });
        expect(scopeDecision(account, target, 'tournament')).toEqual({ allow: false, reason: 'out_of_scope' });
      }),
      { numRuns: 100 },
    );
  });

  it('a manager neither owner nor sport manager is denied (out_of_scope), both levels', () => {
    fc.assert(
      fc.property(idDigits, fc.option(idDigits, { nil: null }), fc.array(idDigits, { maxLength: 4 }), fc.constantFrom(...LEVELS), (selfDigits, otherOwner, others, level) => {
        fc.pre(otherOwner !== selfDigits && !others.includes(selfDigits));
        const account = { role: 'TOURNAMENT_MANAGER', id: selfDigits };
        const got = scopeDecision(account, { ownerId: otherOwner, sportManagerIds: others }, level);
        expect(got).toEqual({ allow: false, reason: 'out_of_scope' });
      }),
      { numRuns: 100 },
    );
  });
});
