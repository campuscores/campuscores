// Feature: backend-live-platform, Property 8: Invitation role rules
// Validates: Requirements 12.1, 12.2, 12.3
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canInvite } from '../src/auth.js';

const STAFF = ['SUPER_ADMIN', 'TOURNAMENT_MANAGER', 'MATCH_OPERATOR'];
const role = fc.oneof(
  fc.constantFrom(...STAFF, 'VIEWER', 'super_admin', 'Tournament_Manager', 'match_operator', ' SUPER_ADMIN', '', undefined, null),
  fc.string(),
);

// Reference model from Requirements 12.1-12.3.
function model(inviter, requested) {
  if (inviter === 'SUPER_ADMIN') return STAFF.includes(requested);
  if (inviter === 'TOURNAMENT_MANAGER') return requested === 'MATCH_OPERATOR';
  return false;
}

describe('Property 8: invitation role rules', () => {
  it('matches the reference model for any inviter and requested role', () => {
    fc.assert(
      fc.property(role, role, (inviter, requested) => {
        expect(canInvite(inviter, requested)).toBe(model(inviter, requested));
      }),
      { numRuns: 200 },
    );
  });
});
