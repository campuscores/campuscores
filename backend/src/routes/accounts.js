import { Hono } from 'hono';
import { clerkAuth, loadAccount, requireRole } from '../auth.js';
import { withClient, withTx } from '../db.js';
import { AppError, jsonBody } from '../http.js';
import { parseId } from './public.js';

// One transaction: disable the account, revoke its ACTIVE assignments, drop its leases, audit.
// Shared by POST /api/accounts/:id/disable and DELETE /api/me. IDs are bigint strings, as pg returns them.
export function disableAccount(client, { accountId, actorId, reason, requestId }) {
  return withTx(client, async (tx) => {
    // Locks the target and every active Super Admin in id order, so concurrent disables cannot remove the last one.
    const { rows } = await tx.query(
      `SELECT id, role, status FROM admin_accounts
       WHERE id = $1 OR (role = 'SUPER_ADMIN' AND status = 'ACTIVE') ORDER BY id FOR UPDATE`,
      [accountId],
    );
    const target = rows.find((r) => r.id === String(accountId));
    if (!target) throw new AppError(404, 'NOT_FOUND', 'Account not found');
    const activeSupers = rows.filter((r) => r.role === 'SUPER_ADMIN' && r.status === 'ACTIVE').length;
    if (target.role === 'SUPER_ADMIN' && target.status === 'ACTIVE' && activeSupers === 1) {
      throw new AppError(409, 'LAST_SUPER_ADMIN', 'Cannot disable the last active Super Admin');
    }
    // A Tournament_Owner must transfer ownership first (Requirement 3.14), checked after the
    // last-Super-Admin guard so that guard takes precedence; still before any write or Clerk call.
    const owned = await tx.query('SELECT 1 FROM tournaments WHERE owner_account_id = $1 LIMIT 1', [accountId]);
    if (owned.rows.length) throw new AppError(409, 'OWNER_TRANSFER_REQUIRED', 'Transfer tournament ownership first');
    await tx.query(`UPDATE admin_accounts SET status = 'DISABLED', updated_at = now() WHERE id = $1`, [accountId]);
    const revoked = await tx.query(
      `UPDATE match_operator_assignments
       SET status = 'REVOKED', revoked_at = now(), revoked_by = $2, revoke_reason = $3
       WHERE account_id = $1 AND status = 'ACTIVE' RETURNING id`,
      [accountId, actorId, reason],
    );
    await tx.query('DELETE FROM scorer_leases WHERE account_id = $1', [accountId]);
    const revokedAssignmentIds = revoked.rows.map((r) => r.id);
    await tx.query(
      `INSERT INTO admin_audit_log (actor_account_id, action, entity, entity_id, request_id, before, after, reason)
       VALUES ($1, 'ACCOUNT_DISABLED', 'admin_accounts', $2, $3, $4, $5, $6)`,
      [actorId, accountId, requestId, { status: target.status }, { status: 'DISABLED', revokedAssignmentIds }, reason],
    );
    return { id: target.id, status: 'DISABLED', revokedAssignmentIds };
  });
}

export const accountRoutes = new Hono();

accountRoutes.post('/accounts/:id/disable', clerkAuth, loadAccount, requireRole('superAdmin'), async (c) => {
  const accountId = parseId(c.req.param('id'));
  if (!accountId) throw new AppError(400, 'BAD_REQUEST', 'Malformed ID');
  const { reason } = await jsonBody(c);
  if (typeof reason !== 'string' || !reason.trim()) throw new AppError(409, 'REASON_REQUIRED', 'A reason is required');
  const account = await withClient(c.env.HYPERDRIVE_UNCACHED, c.executionCtx, (client) =>
    disableAccount(client, { accountId, actorId: c.get('account').id, reason: reason.trim(), requestId: c.get('requestId') }),
  );
  return c.json({ account });
});
