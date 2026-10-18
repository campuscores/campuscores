// Feature: backend-live-platform, Property 10: Lease decisions
// Validates: Requirements 14.6, 14.7, 14.8
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { leaseDecision } from '../src/scoring.js';

// Reference from the requirement rules: 14.6 grant on no lease or an inactive holder,
// same account and device keeps it, 14.8 the same account takes over with the flag, 14.7 everyone else is refused.
const reference = (lease, req, holderActive) => {
  if (lease === null || !holderActive) return 'GRANT';
  const sameAccount = lease.accountId === req.accountId;
  if (sameAccount && lease.deviceId === req.deviceId) return 'KEEP';
  if (sameAccount && req.takeover) return 'TAKEOVER';
  return 'LEASE_HELD';
};

// Tiny ID pools so same-account and same-device pairs occur often.
const accountId = fc.constantFrom('7', '8', '9');
const deviceId = fc.constantFrom('a', 'b', 'c');
const lease = fc.option(fc.record({ accountId, deviceId }), { nil: null, freq: 4 });
// The route sends takeover as a boolean; an absent flag means no takeover.
const req = fc.record({ accountId, deviceId, takeover: fc.boolean() }, { requiredKeys: ['accountId', 'deviceId'] });

describe('Property 10: lease decisions', () => {
  it('matches the requirement rules for any lease, request and holder state', () => {
    fc.assert(
      fc.property(lease, req, fc.boolean(), (l, r, holderActive) => {
        expect(leaseDecision(l, r, holderActive)).toBe(reference(l, r, holderActive));
      }),
      { numRuns: 500 },
    );
  });

  it('never lets a different account take an active holder lease', () => {
    fc.assert(
      fc.property(fc.record({ accountId, deviceId }), req, (l, r) => {
        fc.pre(l.accountId !== r.accountId);
        expect(leaseDecision(l, r, true)).toBe('LEASE_HELD');
      }),
      { numRuns: 200 },
    );
  });
});
