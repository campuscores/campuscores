import { env, exports as workerExports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disableAccount } from '../src/routes/accounts.js';
import { api, clerkError, clerkUser, db, one, stubClerk } from './helpers.js';

const post = (path) => workerExports.default.fetch(new Request(`http://example.com${path}`, { method: 'POST', body: '{}' }));

describe('invite and account routes without a token', () => {
  it('return 401 UNAUTHENTICATED', async () => {
    for (const path of ['/api/invites', '/api/invites/accept', '/api/accounts/1/disable']) {
      const res = await post(path);
      expect(res.status, path).toBe(401);
      expect((await res.json()).error.code, path).toBe('UNAUTHENTICATED');
    }
  });
});

afterEach(() => vi.restoreAllMocks());

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('disableAccount against the seed', () => {
  it('disables the account, revokes its ACTIVE assignment and writes one audit row', async () => {
    // Throwaway operator and CUSTOM match, so the shared seed rows never change.
    const { id: accountId } = await one(`INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'MATCH_OPERATOR') RETURNING id`, [
      `test_disable_probe_${crypto.randomUUID()}`,
    ]);
    const { id: matchId } = await one(`INSERT INTO matches (tournament_sport_id, kind) VALUES (2, 'CUSTOM') RETURNING id`);
    const { id: assignmentId } = await one(
      'INSERT INTO match_operator_assignments (match_id, account_id, assigned_by) VALUES ($1, $2, 1) RETURNING id',
      [matchId, accountId],
    );
    await one('INSERT INTO scorer_leases (match_id, account_id, device_id) VALUES ($1, $2, $3) RETURNING match_id', [
      matchId,
      accountId,
      crypto.randomUUID(),
    ]);
    try {
      const out = await db((client) => disableAccount(client, { accountId, actorId: '1', reason: 'test reason', requestId: 'test-req' }));
      expect(out).toEqual({ id: accountId, status: 'DISABLED', revokedAssignmentIds: [assignmentId] });
      expect(await one('SELECT status FROM admin_accounts WHERE id = $1', [accountId])).toEqual({ status: 'DISABLED' });
      expect(await one('SELECT status, revoked_by, revoke_reason FROM match_operator_assignments WHERE id = $1', [assignmentId])).toEqual({
        status: 'REVOKED',
        revoked_by: '1',
        revoke_reason: 'test reason',
      });
      const audit = await one(
        `SELECT count(*)::int AS n, max(reason) AS reason FROM admin_audit_log WHERE action = 'ACCOUNT_DISABLED' AND entity_id = $1`,
        [accountId],
      );
      expect(audit).toEqual({ n: 1, reason: 'test reason' });
      expect(await one('SELECT count(*)::int AS n FROM scorer_leases WHERE account_id = $1', [accountId])).toEqual({ n: 0 });
    } finally {
      await db(async (client) => {
        await client.query('DELETE FROM scorer_leases WHERE match_id = $1', [matchId]);
        await client.query(`DELETE FROM admin_audit_log WHERE entity = 'admin_accounts' AND entity_id = $1`, [accountId]);
        await client.query('DELETE FROM match_operator_assignments WHERE id = $1', [assignmentId]);
        await client.query('DELETE FROM matches WHERE id = $1', [matchId]);
        await client.query('DELETE FROM admin_accounts WHERE id = $1', [accountId]);
      });
    }
  });

  it('refuses to disable the last active Super Admin and changes nothing', async () => {
    // The seed has one active Super Admin (id 1).
    const err = await db((client) => disableAccount(client, { accountId: '1', actorId: '1', reason: 'test', requestId: 'test-req' })).catch((e) => e);
    expect(err).toMatchObject({ status: 409, code: 'LAST_SUPER_ADMIN' });
    expect(await one('SELECT status FROM admin_accounts WHERE id = 1')).toEqual({ status: 'ACTIVE' });
  });

  it('returns 404 for an unknown account', async () => {
    const err = await db((client) => disableAccount(client, { accountId: '999999999', actorId: '1', reason: 'test', requestId: 'r' })).catch((e) => e);
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

const testEmail = () => `test_inv_${crypto.randomUUID()}@example.com`;
// Removes this run's invitations, their audit rows and any account they created.
const dropInvites = (emails) =>
  db(async (client) => {
    const { rows } = await client.query('SELECT id, accepted_account_id FROM staff_invitations WHERE email = ANY($1)', [emails]);
    const accountIds = rows.map((r) => r.accepted_account_id).filter(Boolean);
    await client.query(`DELETE FROM admin_audit_log WHERE entity = 'staff_invitations' AND entity_id = ANY($1)`, [rows.map((r) => r.id)]);
    await client.query('DELETE FROM staff_invitations WHERE email = ANY($1)', [emails]);
    await client.query('DELETE FROM admin_accounts WHERE id = ANY($1)', [accountIds]);
  });

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('POST /api/invites', () => {
  const ROLES = ['SUPER_ADMIN', 'TOURNAMENT_MANAGER', 'MATCH_OPERATOR', 'VIEWER'];
  const invitationJson = (call) => [200, { object: 'invitation', id: `inv_test_${crypto.randomUUID()}`, email_address: call.body.email_address, status: 'pending' }];

  it('stores, sends and audits only the invitations the inviter role allows', async () => {
    const disabledUser = `test_disabled_admin_${crypto.randomUUID()}`;
    await one(`INSERT INTO admin_accounts (clerk_user_id, role, status) VALUES ($1, 'SUPER_ADMIN', 'DISABLED')`, [disabledUser]);
    const inviters = {
      test_super_admin: { id: '1', allowed: ROLES.slice(0, 3), denied: 'ROLE_FORBIDDEN' },
      test_tournament_manager: { id: '2', allowed: ['MATCH_OPERATOR'], denied: 'ROLE_FORBIDDEN' },
      test_match_operator: { allowed: [], denied: 'ROLE_FORBIDDEN' },
      [`test_viewer_${crypto.randomUUID()}`]: { allowed: [], denied: 'NOT_STAFF' },
      [disabledUser]: { allowed: [], denied: 'ACCOUNT_DISABLED' },
    };
    const emails = [];
    try {
      for (const [user, { id, allowed, denied }] of Object.entries(inviters)) {
        for (const role of ROLES) {
          const label = `${user} -> ${role}`;
          const email = testEmail();
          emails.push(email);
          vi.restoreAllMocks();
          const calls = stubClerk(invitationJson);
          const res = await api('POST', '/api/invites', { user, body: { email: email.toUpperCase(), role } });
          const row = await one('SELECT id, role, status, invited_by FROM staff_invitations WHERE email = $1', [email]);
          if (allowed.includes(role)) {
            expect(res.status, label).toBe(201);
            expect((await res.json()).invitation, label).toMatchObject({ id: row.id, email, role, status: 'PENDING' });
            expect(row, label).toEqual({ id: row.id, role, status: 'PENDING', invited_by: id });
            expect(calls.map((c) => `${c.method} ${c.path} ${c.body.email_address}`), label).toEqual([`POST /v1/invitations ${email}`]);
            const audit = await one(`SELECT actor_account_id, after FROM admin_audit_log WHERE action = 'INVITE_CREATED' AND entity_id = $1`, [row.id]);
            expect(audit, label).toEqual({ actor_account_id: id, after: { email, role } });
          } else {
            expect(res.status, label).toBe(403);
            expect((await res.json()).error.code, label).toBe(denied);
            expect(row, label).toBeUndefined();
            expect(calls, label).toEqual([]);
          }
        }
      }
    } finally {
      await dropInvites(emails);
      await db((client) => client.query('DELETE FROM admin_accounts WHERE clerk_user_id = $1', [disabledUser]));
    }
  });

  it('returns 502 and stores no invitation when the Clerk call fails', async () => {
    const email = testEmail();
    const calls = stubClerk(() => clerkError);
    try {
      const res = await api('POST', '/api/invites', { user: 'test_super_admin', body: { email, role: 'MATCH_OPERATOR' } });
      expect(res.status).toBe(502);
      expect((await res.json()).error.code).toBe('CLERK_UNAVAILABLE');
      expect(calls.length).toBeGreaterThan(0);
      expect(await one('SELECT count(*)::int AS n FROM staff_invitations WHERE email = $1', [email])).toEqual({ n: 0 });
    } finally {
      await dropInvites([email]);
    }
  });
});

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('POST /api/invites/accept', () => {
  // Inserts a MATCH_OPERATOR invitation, so no test creates an extra active Super Admin.
  const invite = (email, expiresIn = '1 day') =>
    one(
      `INSERT INTO staff_invitations (email, role, invited_by, clerk_invitation_id, expires_at)
       VALUES ($1, 'MATCH_OPERATOR', 2, 'inv_test', now() + $2::interval) RETURNING id`,
      [email, expiresIn],
    );
  const accept = (user, emails) => {
    stubClerk(() => [200, clerkUser(user, emails)]);
    return api('POST', '/api/invites/accept', { user });
  };
  const accountOf = (user) => one('SELECT id, role, status, invited_by FROM admin_accounts WHERE clerk_user_id = $1', [user]);

  it('creates the account with the invited role, accepts the invitation and audits it', async () => {
    const email = testEmail();
    const user = `test_accept_${crypto.randomUUID()}`;
    const { id: inviteId } = await invite(email);
    try {
      const res = await accept(user, [['other@example.com', 'unverified'], [email.toUpperCase(), 'verified']]);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ role: 'MATCH_OPERATOR', status: 'ACTIVE' });
      const account = await accountOf(user);
      expect(account).toEqual({ id: account.id, role: 'MATCH_OPERATOR', status: 'ACTIVE', invited_by: '2' });
      expect(await one('SELECT status, accepted_account_id FROM staff_invitations WHERE id = $1', [inviteId])).toEqual({
        status: 'ACCEPTED',
        accepted_account_id: account.id,
      });
      expect(await one(`SELECT actor_account_id FROM admin_audit_log WHERE action = 'INVITE_ACCEPTED' AND entity_id = $1`, [inviteId])).toEqual({
        actor_account_id: account.id,
      });
    } finally {
      await dropInvites([email]);
    }
  });

  it('returns 404 and creates no account for unverified, expired and missing invitations', async () => {
    const unverified = testEmail();
    const expired = testEmail();
    await invite(unverified);
    await invite(expired, '-1 minute');
    try {
      for (const [name, emails] of Object.entries({
        unverified: [[unverified, 'unverified']],
        expired: [[expired, 'verified']],
        missing: [[testEmail(), 'verified']],
      })) {
        vi.restoreAllMocks();
        const user = `test_accept_${name}_${crypto.randomUUID()}`;
        const res = await accept(user, emails);
        expect(res.status, name).toBe(404);
        expect((await res.json()).error.code, name).toBe('INVITE_NOT_FOUND');
        expect(await accountOf(user), name).toBeUndefined();
      }
      expect((await one('SELECT array_agg(status) AS s FROM staff_invitations WHERE email = ANY($1)', [[unverified, expired]])).s).toEqual([
        'PENDING',
        'PENDING',
      ]);
    } finally {
      await dropInvites([unverified, expired]);
    }
  });
});

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('POST /api/accounts/:id/disable', () => {
  const disable = (id, body, user = 'test_super_admin') => api('POST', `/api/accounts/${id}/disable`, { user, body });

  it('disables with a reason, and refuses a missing reason, a manager and the last Super Admin', async () => {
    const { id } = await one(`INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'MATCH_OPERATOR') RETURNING id`, [
      `test_disable_route_${crypto.randomUUID()}`,
    ]);
    const code = async (res) => [res.status, (await res.json()).error.code];
    try {
      expect(await code(await disable(id, {}))).toEqual([409, 'REASON_REQUIRED']);
      expect(await code(await disable(id, { reason: '   ' }))).toEqual([409, 'REASON_REQUIRED']);
      expect(await code(await disable(id, { reason: 'test' }, 'test_tournament_manager'))).toEqual([403, 'ROLE_FORBIDDEN']);
      expect(await code(await disable(1, { reason: 'test' }))).toEqual([409, 'LAST_SUPER_ADMIN']);
      expect(await one('SELECT status FROM admin_accounts WHERE id = $1', [id])).toEqual({ status: 'ACTIVE' });
      expect(await one('SELECT status FROM admin_accounts WHERE id = 1')).toEqual({ status: 'ACTIVE' });

      const res = await disable(id, { reason: ' test reason ' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ account: { id, status: 'DISABLED', revokedAssignmentIds: [] } });
      expect(await one('SELECT status FROM admin_accounts WHERE id = $1', [id])).toEqual({ status: 'DISABLED' });
      expect(await one(`SELECT actor_account_id, reason FROM admin_audit_log WHERE action = 'ACCOUNT_DISABLED' AND entity_id = $1`, [id])).toEqual({
        actor_account_id: '1',
        reason: 'test reason',
      });
    } finally {
      await db(async (client) => {
        await client.query(`DELETE FROM admin_audit_log WHERE entity = 'admin_accounts' AND entity_id = $1`, [id]);
        await client.query('DELETE FROM admin_accounts WHERE id = $1', [id]);
      });
    }
  });
});
