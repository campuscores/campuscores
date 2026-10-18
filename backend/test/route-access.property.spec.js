// Feature: backend-live-platform, Property 7: Route access depends only on the database account
// Validates: Requirements 11.4, 11.5
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canAccess, requireRole } from '../src/auth.js';

// Reference model, written out independently of ROUTE_ROLES.
const ALLOWED = {
  manager: new Set(['TOURNAMENT_MANAGER', 'SUPER_ADMIN']),
  superAdmin: new Set(['SUPER_ADMIN']),
  staff: new Set(['MATCH_OPERATOR', 'TOURNAMENT_MANAGER', 'SUPER_ADMIN']),
};
function model(account, routeKey) {
  if (!account) return { ok: false, code: 'NOT_STAFF' };
  if (account.status !== 'ACTIVE') return { ok: false, code: 'ACCOUNT_DISABLED' };
  return ALLOWED[routeKey].has(account.role) ? { ok: true } : { ok: false, code: 'ROLE_FORBIDDEN' };
}

const routeKey = fc.constantFrom(...Object.keys(ALLOWED));
const role = fc.oneof(
  fc.constantFrom('SUPER_ADMIN', 'TOURNAMENT_MANAGER', 'MATCH_OPERATOR', 'VIEWER', 'super_admin', ''),
  fc.string(),
);
const status = fc.oneof(fc.constantFrom('ACTIVE', 'DISABLED', 'active', ''), fc.string());
// Extra fields that look like token claims; they must never change the decision.
const extras = fc.record(
  {
    claims: fc.record({ role: role, org_role: role, admin: fc.boolean() }),
    publicMetadata: fc.record({ role: role }),
    isAdmin: fc.boolean(),
  },
  { requiredKeys: [] },
);
const account = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.record({ id: fc.uuid(), role, status }).chain((a) => extras.map((x) => ({ ...x, ...a }))),
);

describe('Property 7: route access depends only on the database account', () => {
  it('canAccess matches the reference model and ignores extra fields', () => {
    fc.assert(
      fc.property(account, routeKey, (acc, key) => {
        const expected = model(acc, key);
        expect(canAccess(acc, key)).toEqual(expected);
        if (acc) expect(canAccess({ role: acc.role, status: acc.status }, key)).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('requireRole decides only from the loaded account, not other context values', async () => {
    await fc.assert(
      fc.asyncProperty(account, routeKey, extras, async (acc, key, ctxExtras) => {
        const store = { ...ctxExtras, sessionClaims: ctxExtras.claims, account: acc };
        const c = { get: (k) => store[k] };
        let nextCalled = false;
        let error = null;
        try {
          await requireRole(key)(c, async () => { nextCalled = true; });
        } catch (e) {
          error = e;
        }
        const expected = model(acc, key);
        expect(nextCalled).toBe(expected.ok);
        if (expected.ok) expect(error).toBeNull();
        else expect({ status: error?.status, code: error?.code }).toEqual({ status: 403, code: expected.code });
      }),
      { numRuns: 200 },
    );
  });
});
