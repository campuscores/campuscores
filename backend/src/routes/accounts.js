import { Hono } from 'hono';
import { clerkAuth, loadAccount, requireRole } from '../auth.js';
import { audit, withClient, withTx } from '../db.js';
import { AppError, jsonBody } from '../http.js';
import { parseId } from './public.js';

const ROLES = ['SUPER_ADMIN', 'TOURNAMENT_MANAGER', 'MATCH_OPERATOR'];
const optionalReason = (v) => (typeof v === 'string' && v.trim()) || null;

// Shared by disable, enable and role change. Locks the target and every ACTIVE Super Admin in id
// order, so two concurrent requests cannot both remove the last one. Returns the target row and
// whether it is the last ACTIVE Super Admin. Account rows are locked before any assignment, lease
// or Sport_Manager row; no match or tournament row is locked here.
async function lockAccount(tx, accountId) {
  const { rows } = await tx.query(
    `SELECT id, role, status FROM admin_accounts
     WHERE id = $1 OR (role = 'SUPER_ADMIN' AND status = 'ACTIVE') ORDER BY id FOR UPDATE`,
    [accountId],
  );
  const target = rows.find((r) => r.id === String(accountId));
  if (!target) throw new AppError(404, 'NOT_FOUND', 'Account not found');
  const activeSupers = rows.filter((r) => r.role === 'SUPER_ADMIN' && r.status === 'ACTIVE').length;
  return { target, last: target.role === 'SUPER_ADMIN' && target.status === 'ACTIVE' && activeSupers === 1 };
}

// A Tournament_Owner must transfer ownership first (Requirements 3.14, 6.13).
async function refuseOwner(tx, accountId) {
  const owned = await tx.query('SELECT 1 FROM tournaments WHERE owner_account_id = $1 LIMIT 1', [accountId]);
  if (owned.rows.length) throw new AppError(409, 'OWNER_TRANSFER_REQUIRED', 'Transfer tournament ownership first');
}

// Revokes ACTIVE assignments, deletes leases and Sport_Manager rows. Returns the revoked assignment IDs.
async function dropAccess(tx, accountId, actorId, reason) {
  const revoked = await tx.query(
    `UPDATE match_operator_assignments
     SET status = 'REVOKED', revoked_at = now(), revoked_by = $2, revoke_reason = $3
     WHERE account_id = $1 AND status = 'ACTIVE' RETURNING id`,
    [accountId, actorId, reason],
  );
  await tx.query('DELETE FROM scorer_leases WHERE account_id = $1', [accountId]);
  await tx.query('DELETE FROM tournament_sport_managers WHERE account_id = $1', [accountId]);
  return revoked.rows.map((r) => r.id);
}

// One transaction: disable the account, revoke its ACTIVE assignments, drop its leases and Manager_Scope, audit.
// Shared by POST /api/accounts/:id/disable and DELETE /api/me. IDs are bigint strings, as pg returns them.
// Order: 404, ALREADY_DISABLED, LAST_SUPER_ADMIN, OWNER_TRANSFER_REQUIRED, all before any write or Clerk call.
export function disableAccount(client, { accountId, actorId, reason, requestId }) {
  return withTx(client, async (tx) => {
    const { target, last } = await lockAccount(tx, accountId);
    if (target.status === 'DISABLED') throw new AppError(409, 'ALREADY_DISABLED', 'The account is already disabled');
    if (last) throw new AppError(409, 'LAST_SUPER_ADMIN', 'Cannot disable the last active Super Admin');
    await refuseOwner(tx, accountId);
    await tx.query(`UPDATE admin_accounts SET status = 'DISABLED', updated_at = now() WHERE id = $1`, [accountId]);
    const revokedAssignmentIds = await dropAccess(tx, accountId, actorId, reason);
    await audit(tx, {
      actorId, action: 'ACCOUNT_DISABLED', entity: 'admin_accounts', entityId: accountId, requestId, reason,
      before: { status: target.status }, after: { status: 'DISABLED', revokedAssignmentIds },
    });
    return { id: target.id, status: 'DISABLED', revokedAssignmentIds };
  });
}

// Re-enable keeps the role and restores no assignment, lease or Manager_Scope (Requirement 6.9).
// An ACTIVE account that now holds the same email maps the unique index clash to 409 ACCOUNT_EXISTS.
export async function enableAccount(client, { accountId, actorId, reason, requestId }) {
  try {
    return await withTx(client, async (tx) => {
      const { target } = await lockAccount(tx, accountId);
      if (target.status === 'ACTIVE') throw new AppError(409, 'ALREADY_ACTIVE', 'The account is already active');
      await tx.query(`UPDATE admin_accounts SET status = 'ACTIVE', updated_at = now() WHERE id = $1`, [accountId]);
      await audit(tx, {
        actorId, action: 'ACCOUNT_ENABLED', entity: 'admin_accounts', entityId: accountId, requestId, reason,
        before: { status: 'DISABLED' }, after: { status: 'ACTIVE' },
      });
      return { id: target.id, status: 'ACTIVE' };
    });
  } catch (err) {
    if (err.code === '23505') throw new AppError(409, 'ACCOUNT_EXISTS', 'Another active account uses this email');
    throw err;
  }
}

// Role change on an open transaction (the caller owns BEGIN/COMMIT). `role` is already one of ROLES.
// Order: 404, ACCOUNT_DISABLED, same role 400, LAST_SUPER_ADMIN, OWNER_TRANSFER_REQUIRED, before any write.
export async function applyRoleChange(tx, { accountId, role, actorId, reason, requestId }) {
  const { target, last } = await lockAccount(tx, accountId);
  if (target.status === 'DISABLED') throw new AppError(409, 'ACCOUNT_DISABLED', 'Re-enable the account first');
  if (target.role === role) throw new AppError(400, 'BAD_REQUEST', 'role: Choose a role different from the current role.');
  if (last) throw new AppError(409, 'LAST_SUPER_ADMIN', 'Cannot change the role of the last active Super Admin');
  await refuseOwner(tx, accountId);
  await tx.query('UPDATE admin_accounts SET role = $2, updated_at = now() WHERE id = $1', [accountId, role]);
  const revokedAssignmentIds = await dropAccess(tx, accountId, actorId, reason);
  await audit(tx, {
    actorId, action: 'ROLE_CHANGED', entity: 'admin_accounts', entityId: accountId, requestId, reason,
    before: { role: target.role }, after: { role, revokedAssignmentIds },
  });
  return { account: { id: target.id, role, status: 'ACTIVE' }, revokedAssignmentIds };
}

export const accountRoutes = new Hono();
const guard = [clerkAuth, loadAccount, requireRole('superAdmin')];
const targetId = (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) throw new AppError(400, 'BAD_REQUEST', 'Malformed ID');
  return id;
};
const uncached = (c, fn) => withClient(c.env.HYPERDRIVE_UNCACHED, c.executionCtx, fn);

accountRoutes.post('/accounts/:id/disable', ...guard, async (c) => {
  const accountId = targetId(c);
  const { reason } = await jsonBody(c);
  if (typeof reason !== 'string' || !reason.trim()) throw new AppError(409, 'REASON_REQUIRED', 'A reason is required');
  const account = await uncached(c, (client) =>
    disableAccount(client, { accountId, actorId: c.get('account').id, reason: reason.trim(), requestId: c.get('requestId') }),
  );
  return c.json({ account });
});

accountRoutes.post('/accounts/:id/enable', ...guard, async (c) => {
  const accountId = targetId(c);
  const reason = optionalReason((await jsonBody(c)).reason);
  const account = await uncached(c, (client) =>
    enableAccount(client, { accountId, actorId: c.get('account').id, reason, requestId: c.get('requestId') }),
  );
  return c.json({ account });
});

accountRoutes.post('/accounts/:id/role', ...guard, async (c) => {
  const accountId = targetId(c);
  const body = await jsonBody(c);
  if (!ROLES.includes(body.role)) throw new AppError(400, 'BAD_REQUEST', 'role: Choose Super Admin, Tournament Manager or Match Scorer.');
  const reason = optionalReason(body.reason);
  const result = await uncached(c, (client) =>
    withTx(client, (tx) =>
      applyRoleChange(tx, { accountId, role: body.role, actorId: c.get('account').id, reason, requestId: c.get('requestId') }),
    ),
  );
  return c.json(result);
});
