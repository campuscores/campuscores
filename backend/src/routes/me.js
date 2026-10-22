import { Hono } from 'hono';
import { clerkAuth, loadAccount } from '../auth.js';
import { withClient } from '../db.js';
import { AppError } from '../http.js';
import { disableAccount } from './accounts.js';

export const meRoutes = new Hono();

// A missing or DISABLED account is a Viewer (Requirement 11.4, 11.7).
meRoutes.get('/me', clerkAuth, loadAccount, (c) => {
  const account = c.get('account');
  return c.json(account?.status === 'ACTIVE' ? { role: account.role, status: account.status } : { role: 'VIEWER' });
});

// Requirements 13.7–13.9. The staff row is disabled (never deleted) so audit rows keep their actor.
meRoutes.delete('/me', clerkAuth, loadAccount, async (c) => {
  const account = c.get('account');
  if (account?.status === 'ACTIVE') {
    // Throws 409 OWNER_TRANSFER_REQUIRED (Requirement 3.14) or LAST_SUPER_ADMIN and rolls back before Clerk is touched.
    // ALREADY_DISABLED means a concurrent delete or disable won; continue to the Clerk call like a retry.
    await withClient(c.env.HYPERDRIVE_UNCACHED, c.executionCtx, (client) =>
      disableAccount(client, {
        accountId: account.id,
        actorId: account.id,
        reason: 'Account deleted by user',
        requestId: c.get('requestId'),
      }),
    ).catch((err) => {
      if (err.code !== 'ALREADY_DISABLED') throw err;
    });
  }
  try {
    await c.get('clerk').users.deleteUser(c.get('clerkUserId'));
  } catch {
    // The account stays disabled; a retry skips the disable and only repeats this call.
    throw new AppError(502, 'CLERK_UNAVAILABLE', 'Sign-in service unavailable');
  }
  return c.body(null, 204);
});
