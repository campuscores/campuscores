// Super_Admin console API (Requirements 3.11-3.13, 6.1-6.3, 6.15, 16). Every route is
// clerkAuth → loadAccount → requireRole('superAdmin') on the uncached pool (staff reads use database time).
// Invitation cancel lives in invites.js; enable and role change in accounts.js.
import { Hono } from 'hono';
import { clerkAuth, loadAccount, requireRole } from '../auth.js';
import { audit, withClient, withTx } from '../db.js';
import { AppError, jsonBody } from '../http.js';
import { email, intRange, text } from '../validate.js';
import { parseId } from './public.js';

const PAGE = 50;
const ROLES = ['SUPER_ADMIN', 'TOURNAMENT_MANAGER', 'MATCH_OPERATOR'];
const STATUSES = ['ACTIVE', 'DISABLED'];
const uncached = (c, fn) => withClient(c.env.HYPERDRIVE_UNCACHED, c.executionCtx, fn);
const bad = (field, fix) => new AppError(400, 'BAD_REQUEST', `${field}: ${fix}`);

// `?offset=` paging (design: `nextOffset`). Empty or absent is 0.
const offsetOf = (c) => intRange(c.req.query('offset'), 'offset', 0, 1_000_000, { what: 'a page offset' }) ?? 0;
// One extra row tells whether a next page exists without a count query.
const page = (rows, offset) => ({ items: rows.slice(0, PAGE), nextOffset: rows.length > PAGE ? offset + PAGE : null });

// Tournaments in a member's explicit Manager_Scope: owned, or with a sport they manage.
const SCOPED_TOURNAMENTS = `
  FROM tournaments t
  WHERE t.owner_account_id = a.id
     OR EXISTS (SELECT 1 FROM tournament_sports ts JOIN tournament_sport_managers sm ON sm.tournament_sport_id = ts.id
                WHERE ts.tournament_id = t.id AND sm.account_id = a.id)`;

export const adminRoutes = new Hono();
const guard = [clerkAuth, loadAccount, requireRole('superAdmin')];

// --- GET /api/admin/staff?role=&status=&offset= ---------------------------
// ACTIVE first, then email, then id (a stable total order for offset paging), 50 per page.
adminRoutes.get('/admin/staff', ...guard, async (c) => {
  const role = c.req.query('role') || null;
  const status = c.req.query('status') || null;
  if (role && !ROLES.includes(role)) throw bad('role', 'Choose Super Admin, Tournament Manager or Match Scorer.');
  if (status && !STATUSES.includes(status)) throw bad('status', 'Choose Active or Disabled.');
  const offset = offsetOf(c);
  const { rows } = await uncached(c, (client) =>
    client.query(
      `SELECT a.id::text AS id, a.name, a.email, a.role, a.status,
              COALESCE((SELECT json_agg(t.name ORDER BY t.name, t.id) ${SCOPED_TOURNAMENTS}), '[]') AS tournaments
       FROM admin_accounts a
       WHERE ($1::text IS NULL OR a.role = $1) AND ($2::text IS NULL OR a.status = $2)
       ORDER BY (a.status <> 'ACTIVE'), a.email NULLS LAST, a.id
       LIMIT $3 OFFSET $4`,
      [role, status, PAGE + 1, offset],
    ),
  );
  const { items, nextOffset } = page(rows, offset);
  return c.json({ staff: items, nextOffset });
});

// --- GET /api/admin/staff/:id ---------------------------------------------
// One member with owned tournaments, Sport_Manager scope and the ACTIVE Assignment count.
adminRoutes.get('/admin/staff/:id', ...guard, async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) throw new AppError(400, 'BAD_REQUEST', 'Malformed ID');
  const { rows: [member] } = await uncached(c, (client) =>
    client.query(
      `SELECT a.id::text AS id, a.name, a.email, a.role, a.status,
              COALESCE((SELECT json_agg(json_build_object('slug', t.slug, 'name', t.name) ORDER BY t.name, t.id)
                        FROM tournaments t WHERE t.owner_account_id = a.id), '[]') AS owned,
              COALESCE((SELECT json_agg(json_build_object('tournament', json_build_object('slug', t.slug, 'name', t.name), 'sport', ts.sport)
                                 ORDER BY t.name, t.id, ts.sport)
                        FROM tournament_sport_managers sm
                        JOIN tournament_sports ts ON ts.id = sm.tournament_sport_id
                        JOIN tournaments t ON t.id = ts.tournament_id
                        WHERE sm.account_id = a.id), '[]') AS "sportScope",
              (SELECT count(*) FROM match_operator_assignments ma WHERE ma.account_id = a.id AND ma.status = 'ACTIVE')::int AS "activeAssignments"
       FROM admin_accounts a WHERE a.id = $1`,
      [id],
    ),
  );
  if (!member) throw new AppError(404, 'NOT_FOUND', 'Account not found');
  return c.json({ member });
});

// --- POST /api/admin/tournaments/:slug/owner ------------------------------
// Lock order: the tournament FOR UPDATE, then the new owner's account FOR SHARE (the order of the
// Sport_Manager add in manage.js). A concurrent disable or role change of the new owner either commits
// first (the share lock then re-reads a non-eligible row → 400) or waits and then sees the new owner
// (409 OWNER_TRANSFER_REQUIRED in accounts.js). The new owner's Sport_Manager rows in this tournament
// are redundant and deleted; the previous owner keeps no scope (Requirement 3.11).
adminRoutes.post('/admin/tournaments/:slug/owner', ...guard, async (c) => {
  const actor = c.get('account');
  const slug = c.req.param('slug');
  const body = await jsonBody(c);
  const wanted = email(body.email);
  const reason = text(body.reason, 'reason', 500, { what: 'a reason' }) || null;

  const tournament = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      const { rows: [t] } = await tx.query(
        'SELECT id::text AS id, slug, owner_account_id::text AS "ownerId" FROM tournaments WHERE slug = $1 FOR UPDATE',
        [slug],
      );
      if (!t) throw new AppError(404, 'NOT_FOUND', 'Tournament not found');
      const { rows: [owner] } = await tx.query(
        `SELECT id::text AS id, name, email FROM admin_accounts
         WHERE email = $1 AND status = 'ACTIVE' AND role = 'TOURNAMENT_MANAGER' FOR SHARE`,
        [wanted],
      );
      if (!owner) throw bad('email', 'Enter the email of an active tournament manager.');
      if (owner.id === t.ownerId) throw bad('email', 'This tournament manager already owns this tournament.');

      await tx.query('UPDATE tournaments SET owner_account_id = $2 WHERE id = $1', [t.id, owner.id]);
      const removed = await tx.query(
        `DELETE FROM tournament_sport_managers
         WHERE account_id = $2 AND tournament_sport_id IN (SELECT id FROM tournament_sports WHERE tournament_id = $1)`,
        [t.id, owner.id],
      );
      await audit(tx, {
        actorId: actor.id, action: 'OWNER_TRANSFERRED', entity: 'tournaments', entityId: t.id, requestId: c.get('requestId'), reason,
        before: { ownerId: t.ownerId }, after: { ownerId: owner.id, removedSportManagers: removed.rowCount },
      });
      return { slug: t.slug, owner: { accountId: owner.id, name: owner.name, email: owner.email } };
    }),
  );
  return c.json({ tournament });
});

// --- GET /api/admin/invitations?offset= -----------------------------------
// PENDING and unexpired by database time, soonest expiry first, 50 per page.
adminRoutes.get('/admin/invitations', ...guard, async (c) => {
  const offset = offsetOf(c);
  const { rows } = await uncached(c, (client) =>
    client.query(
      `SELECT i.id::text AS id, i.email, i.role, COALESCE(NULLIF(a.name, ''), a.email) AS "invitedBy",
              to_json(i.expires_at) #>> '{}' AS "expiresAt"
       FROM staff_invitations i JOIN admin_accounts a ON a.id = i.invited_by
       WHERE i.status = 'PENDING' AND i.expires_at > now()
       ORDER BY i.expires_at, i.id
       LIMIT $1 OFFSET $2`,
      [PAGE + 1, offset],
    ),
  );
  const { items, nextOffset } = page(rows, offset);
  return c.json({ invitations: items, nextOffset });
});
