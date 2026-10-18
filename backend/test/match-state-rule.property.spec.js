// Feature: backend-live-platform, Property 11: Match state rule equals the architecture reference
// Validates: Requirements 15.4, 15.6
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { acceptsScores } from '../src/scoring.js';

// Domains from db/migrations/20261018073509_core_schema.sql check constraints.
const STATUSES = ['SCHEDULED', 'LIVE', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'];
const ROUTES = ['OPERATOR', 'MANAGER', null];
const ROLES = ['SUPER_ADMIN', 'TOURNAMENT_MANAGER', 'MATCH_OPERATOR'];

// Reference from Requirement 15.6, written as the accepting rows of a truth table ('*' = any value).
const ACCEPTING_ROWS = [
  ['LIVE', '*', '*'],
  ['REJECTED', 'OPERATOR', '*'],
  ['REJECTED', 'MANAGER', 'TOURNAMENT_MANAGER'],
  ['REJECTED', 'MANAGER', 'SUPER_ADMIN'],
];
const reference = (status, route, role) =>
  ACCEPTING_ROWS.some(([s, c, r]) => s === status && (c === '*' || c === route) && (r === '*' || r === role));

// Block body: fast-check treats a returned `false` as failure, so return nothing.
const check = (status, route, role) => {
  expect(acceptsScores({ status, correction_route: route }, { role }), `${status}/${route}/${role}`).toBe(
    reference(status, route, role),
  );
};

describe('Property 11: match state rule equals the architecture reference', () => {
  it('agrees with the Requirement 15.6 truth table for any status, route and role', () => {
    fc.assert(
      fc.property(fc.constantFrom(...STATUSES), fc.constantFrom(...ROUTES), fc.constantFrom(...ROLES), check),
      { numRuns: 200 },
    );
  });

  it('covers every one of the 45 combinations exactly', () => {
    for (const status of STATUSES) for (const route of ROUTES) for (const role of ROLES) check(status, route, role);
  });

  it('locks a MANAGER correction against a match operator and every non-LIVE, non-REJECTED state', () => {
    expect(acceptsScores({ status: 'REJECTED', correction_route: 'MANAGER' }, { role: 'MATCH_OPERATOR' })).toBe(false);
    for (const status of ['SCHEDULED', 'PENDING_APPROVAL', 'APPROVED']) {
      expect(acceptsScores({ status, correction_route: null }, { role: 'SUPER_ADMIN' })).toBe(false);
    }
  });
});
