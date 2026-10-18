import { createClerkClient } from '@clerk/backend';
import { withClient } from './db.js';
import { AppError } from './http.js';

// Verifies the Clerk session JWT locally with CLERK_JWT_KEY (no network call) and checks `azp`.
export async function clerkAuth(c, next) {
  const clerk = createClerkClient({ secretKey: c.env.CLERK_SECRET_KEY, publishableKey: c.env.CLERK_PUBLISHABLE_KEY });
  const state = await clerk.authenticateRequest(c.req.raw, {
    jwtKey: c.env.CLERK_JWT_KEY,
    authorizedParties: c.env.AUTHORIZED_PARTIES.split(','),
  });
  const auth = state.toAuth();
  if (!auth?.userId) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in required');
  c.set('clerkUserId', auth.userId); // only the user ID is kept; claims and metadata never decide a role
  c.set('clerk', clerk);
  await next();
}

// Roles come only from admin_accounts, read through the uncached pool on every request,
// so a disable or role change applies on the next call.
export async function loadAccount(c, next) {
  const { rows } = await withClient(c.env.HYPERDRIVE_UNCACHED, c.executionCtx, (client) =>
    client.query('SELECT id, role, status FROM admin_accounts WHERE clerk_user_id = $1', [c.get('clerkUserId')]),
  );
  c.set('account', rows[0] ?? null);
  await next();
}

export const ROUTE_ROLES = {
  manager: ['TOURNAMENT_MANAGER', 'SUPER_ADMIN'],
  superAdmin: ['SUPER_ADMIN'],
  staff: ['MATCH_OPERATOR', 'TOURNAMENT_MANAGER', 'SUPER_ADMIN'],
};

export function canAccess(account, routeKey) {
  if (!account) return { ok: false, code: 'NOT_STAFF' };
  if (account.status !== 'ACTIVE') return { ok: false, code: 'ACCOUNT_DISABLED' };
  return ROUTE_ROLES[routeKey].includes(account.role) ? { ok: true } : { ok: false, code: 'ROLE_FORBIDDEN' };
}

export function canInvite(inviterRole, requestedRole) {
  if (inviterRole === 'SUPER_ADMIN') return ['SUPER_ADMIN', 'TOURNAMENT_MANAGER', 'MATCH_OPERATOR'].includes(requestedRole);
  if (inviterRole === 'TOURNAMENT_MANAGER') return requestedRole === 'MATCH_OPERATOR';
  return false;
}

// Use after clerkAuth and loadAccount.
export function requireRole(routeKey) {
  if (!ROUTE_ROLES[routeKey]) throw new Error(`Unknown route key: ${routeKey}`);
  return async (c, next) => {
    const access = canAccess(c.get('account'), routeKey);
    if (!access.ok) throw new AppError(403, access.code, 'Not allowed');
    await next();
  };
}
