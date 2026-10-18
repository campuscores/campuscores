import { Hono } from 'hono';
import { canInvite, clerkAuth, loadAccount, requireRole } from '../auth.js';
import { withClient, withTx } from '../db.js';
import { AppError, jsonBody } from '../http.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_DAYS = 7;
const clerkDown = () => new AppError(502, 'CLERK_UNAVAILABLE', 'Sign-in service unavailable');
const uncached = (c, fn) => withClient(c.env.HYPERDRIVE_UNCACHED, c.executionCtx, fn);

export const inviteRoutes = new Hono();

inviteRoutes.post('/invites', clerkAuth, loadAccount, requireRole('manager'), async (c) => {
  const body = await jsonBody(c);
  const inviter = c.get('account');
  if (!canInvite(inviter.role, body.role)) throw new AppError(403, 'ROLE_FORBIDDEN', 'Not allowed to invite this role');
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL.test(email)) throw new AppError(400, 'BAD_REQUEST', 'Valid email required');

  // Checked before Clerk so a duplicate sends no email; the unique index still guards concurrent invites.
  const { rows: pending } = await uncached(c, (client) =>
    client.query(`SELECT 1 FROM staff_invitations WHERE email = $1 AND status = 'PENDING' AND expires_at > now()`, [email]),
  );
  if (pending.length) throw new AppError(409, 'INVITE_PENDING', 'This email already has a pending invitation');

  const clerk = c.get('clerk');
  let clerkInvite;
  try {
    clerkInvite = await clerk.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: c.env.INVITE_REDIRECT_URL,
      expiresInDays: INVITE_DAYS,
      notify: true,
      ignoreExisting: true,
    });
  } catch {
    throw clerkDown(); // no row is stored
  }

  try {
    const invitation = await uncached(c, (client) =>
      withTx(client, async (tx) => {
        // An expired PENDING row would block the partial unique index forever.
        await tx.query(
          `UPDATE staff_invitations SET status = 'REVOKED', updated_at = now()
           WHERE email = $1 AND status = 'PENDING' AND expires_at <= now()`,
          [email],
        );
        const { rows } = await tx.query(
          `INSERT INTO staff_invitations (email, role, invited_by, clerk_invitation_id, expires_at)
           VALUES ($1, $2, $3, $4, now() + make_interval(days => $5))
           RETURNING id, email, role, status, to_json(expires_at) #>> '{}' AS "expiresAt"`,
          [email, body.role, inviter.id, clerkInvite.id, INVITE_DAYS],
        );
        await tx.query(
          `INSERT INTO admin_audit_log (actor_account_id, action, entity, entity_id, request_id, after)
           VALUES ($1, 'INVITE_CREATED', 'staff_invitations', $2, $3, $4)`,
          [inviter.id, rows[0].id, c.get('requestId'), { email, role: body.role }],
        );
        return rows[0];
      }),
    );
    return c.json({ invitation }, 201);
  } catch (err) {
    // Best effort: the Clerk invitation must not outlive a failed row; the original error still returns 500.
    await clerk.invitations.revokeInvitation(clerkInvite.id).catch(() => {});
    throw err;
  }
});

inviteRoutes.post('/invites/accept', clerkAuth, async (c) => {
  const clerkUserId = c.get('clerkUserId');
  let user;
  try {
    user = await c.get('clerk').users.getUser(clerkUserId);
  } catch {
    throw clerkDown();
  }
  const emails = user.emailAddresses
    .filter((e) => e.verification?.status === 'verified')
    .map((e) => e.emailAddress.toLowerCase());
  const notFound = new AppError(404, 'INVITE_NOT_FOUND', 'No pending invitation for a verified email');
  if (!emails.length) throw notFound;

  const account = await uncached(c, (client) =>
    withTx(client, async (tx) => {
      const { rows: [invite] } = await tx.query(
        `SELECT id, role, invited_by FROM staff_invitations
         WHERE email = ANY($1) AND status = 'PENDING' AND expires_at > now()
         ORDER BY created_at, id LIMIT 1 FOR UPDATE`,
        [emails],
      );
      if (!invite) throw notFound;
      // A disabled or existing account is never reactivated or changed by an invitation.
      const { rows: [created] } = await tx.query(
        `INSERT INTO admin_accounts (clerk_user_id, role, invited_by) VALUES ($1, $2, $3)
         ON CONFLICT (clerk_user_id) DO NOTHING RETURNING id, role, status`,
        [clerkUserId, invite.role, invite.invited_by],
      );
      if (!created) throw new AppError(409, 'ACCOUNT_EXISTS', 'This user already has a staff account');
      await tx.query(
        `UPDATE staff_invitations SET status = 'ACCEPTED', accepted_account_id = $2, updated_at = now() WHERE id = $1`,
        [invite.id, created.id],
      );
      await tx.query(
        `INSERT INTO admin_audit_log (actor_account_id, action, entity, entity_id, request_id, after)
         VALUES ($1, 'INVITE_ACCEPTED', 'staff_invitations', $2, $3, $4)`,
        [created.id, invite.id, c.get('requestId'), { accountId: created.id, role: created.role }],
      );
      return created;
    }),
  );
  return c.json({ role: account.role, status: account.status });
});
