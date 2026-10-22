import { env, exports as workerExports } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyRoleChange, disableAccount } from '../src/routes/accounts.js';
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

// Staff management (Requirements 6.8-6.14). Every account, tournament and match here is a throwaway
// row; no test commits a second ACTIVE Super Admin or changes a seed row.
function staffFixtures() {
  const accounts = [];
  const tournaments = [];
  const matches = [];
  async function account(role, status = 'ACTIVE', email = `test-staff-${crypto.randomUUID()}@example.test`) {
    const user = `test_staff_${crypto.randomUUID()}`;
    const { id } = await one(
      'INSERT INTO admin_accounts (clerk_user_id, role, status, email, name) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [user, role, status, email, 'Staff fixture (fake)'],
    );
    accounts.push(id);
    return { id, user, email };
  }
  // A DRAFT tournament owned by ownerId with one sport; returns the Tournament_Sport ID.
  async function tournament(ownerId) {
    const { id } = await one(
      `INSERT INTO tournaments (slug, name, starts_on, ends_on, status, owner_account_id)
       VALUES ($1, 'Staff Fixture (fake)', '2026-01-10', '2026-01-10', 'DRAFT', $2) RETURNING id`,
      [`test-staff-${crypto.randomUUID().slice(0, 8)}`, ownerId],
    );
    tournaments.push(id);
    return (await one(`INSERT INTO tournament_sports (tournament_id, sport) VALUES ($1, 'badminton') RETURNING id`, [id])).id;
  }
  // A CUSTOM match on tsId with an ACTIVE assignment and a lease held by accountId; returns the assignment ID.
  async function assignment(tsId, accountId) {
    const { id: matchId } = await one(`INSERT INTO matches (tournament_sport_id, kind) VALUES ($1, 'CUSTOM') RETURNING id`, [tsId]);
    matches.push(matchId);
    const { id } = await one('INSERT INTO match_operator_assignments (match_id, account_id, assigned_by) VALUES ($1, $2, 1) RETURNING id', [
      matchId,
      accountId,
    ]);
    await one('INSERT INTO scorer_leases (match_id, account_id, device_id) VALUES ($1, $2, $3) RETURNING match_id', [matchId, accountId, crypto.randomUUID()]);
    return id;
  }
  const cleanup = () =>
    db(async (client) => {
      await client.query(`DELETE FROM admin_audit_log WHERE entity = 'admin_accounts' AND entity_id = ANY($1)`, [accounts]);
      await client.query('DELETE FROM scorer_leases WHERE match_id = ANY($1)', [matches]);
      await client.query('DELETE FROM match_operator_assignments WHERE match_id = ANY($1)', [matches]);
      await client.query('DELETE FROM matches WHERE id = ANY($1)', [matches]);
      await client.query('DELETE FROM tournament_sport_managers WHERE account_id = ANY($1)', [accounts]);
      await client.query('DELETE FROM tournament_sports WHERE tournament_id = ANY($1)', [tournaments]);
      await client.query('DELETE FROM tournaments WHERE id = ANY($1)', [tournaments]);
      await client.query('DELETE FROM admin_accounts WHERE id = ANY($1)', [accounts]);
    });
  return { account, tournament, assignment, cleanup };
}

// Everything a refused staff change must leave untouched for one account.
const accountState = (id) =>
  one(
    `SELECT a.role, a.status,
       (SELECT count(*)::int FROM admin_audit_log WHERE entity = 'admin_accounts' AND entity_id = $1::bigint::text) AS audits,
       (SELECT count(*)::int FROM match_operator_assignments WHERE account_id = $1::bigint AND status = 'ACTIVE') AS active,
       (SELECT count(*)::int FROM scorer_leases WHERE account_id = $1::bigint) AS leases,
       (SELECT count(*)::int FROM tournament_sport_managers WHERE account_id = $1::bigint) AS "sportManager"
     FROM admin_accounts a WHERE a.id = $1::bigint`,
    [id],
  );
const result = async (res) => {
  const body = await res.json();
  return [res.status, body.error?.code ?? 'OK', body.error?.message.split(':')[0]];
};
const sa = 'test_super_admin';

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('staff disable, enable and role change', () => {
  const call = (id, action, body, user = sa) => api('POST', `/api/accounts/${id}/${action}`, { user, body });

  it('disable removes Sport_Manager rows, refuses an owner and a repeat, and writes nothing on refusal', async () => {
    const f = staffFixtures();
    try {
      const owner = await f.account('TOURNAMENT_MANAGER');
      const mgr = await f.account('TOURNAMENT_MANAGER');
      const tsId = await f.tournament(owner.id);
      await one('INSERT INTO tournament_sport_managers (tournament_sport_id, account_id, added_by) VALUES ($1, $2, $3) RETURNING account_id', [tsId, mgr.id, owner.id]);

      const ownerBefore = await accountState(owner.id);
      expect(await result(await call(owner.id, 'disable', { reason: 'test' }))).toEqual([409, 'OWNER_TRANSFER_REQUIRED', 'Transfer tournament ownership first']);
      expect(await accountState(owner.id)).toEqual(ownerBefore);

      const res = await call(mgr.id, 'disable', { reason: 'test' });
      expect(res.status).toBe(200);
      expect(await accountState(mgr.id)).toEqual({ role: 'TOURNAMENT_MANAGER', status: 'DISABLED', audits: 1, active: 0, leases: 0, sportManager: 0 });

      expect(await result(await call(mgr.id, 'disable', { reason: 'again' }))).toEqual([409, 'ALREADY_DISABLED', 'The account is already disabled']);
      expect((await accountState(mgr.id)).audits).toBe(1);
    } finally {
      await f.cleanup();
    }
  });

  it('enable restores only the status, keeps the role and refuses an ACTIVE account', async () => {
    const f = staffFixtures();
    try {
      const op = await f.account('MATCH_OPERATOR');
      const tsId = await f.tournament((await f.account('TOURNAMENT_MANAGER')).id);
      await f.assignment(tsId, op.id);
      expect((await call(op.id, 'disable', { reason: 'test' })).status).toBe(200);

      expect(await result(await call(op.id, 'enable', {}, 'test_tournament_manager'))).toEqual([403, 'ROLE_FORBIDDEN', 'Not allowed']);
      expect(await result(await call('999999999', 'enable', {}))).toEqual([404, 'NOT_FOUND', 'Account not found']);
      const res = await call(op.id, 'enable', { reason: ' back ' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ account: { id: op.id, status: 'ACTIVE' } });
      // Disable revoked the assignment and dropped the lease; enable restores neither.
      expect(await accountState(op.id)).toEqual({ role: 'MATCH_OPERATOR', status: 'ACTIVE', audits: 2, active: 0, leases: 0, sportManager: 0 });
      expect(await one(`SELECT actor_account_id, reason, before, after FROM admin_audit_log WHERE action = 'ACCOUNT_ENABLED' AND entity_id = $1`, [op.id])).toEqual({
        actor_account_id: '1',
        reason: 'back',
        before: { status: 'DISABLED' },
        after: { status: 'ACTIVE' },
      });

      expect(await result(await call(op.id, 'enable', {}))).toEqual([409, 'ALREADY_ACTIVE', 'The account is already active']);
      expect((await accountState(op.id)).audits).toBe(2);
    } finally {
      await f.cleanup();
    }
  });

  it('enable refuses when another ACTIVE account now holds the same email', async () => {
    const f = staffFixtures();
    try {
      const shared = `test-staff-${crypto.randomUUID()}@example.test`;
      const old = await f.account('MATCH_OPERATOR', 'DISABLED', shared);
      await f.account('MATCH_OPERATOR', 'ACTIVE', shared);
      const before = await accountState(old.id);
      expect(await result(await call(old.id, 'enable', {}))).toEqual([409, 'ACCOUNT_EXISTS', 'Another active account uses this email']);
      expect(await accountState(old.id)).toEqual(before);
    } finally {
      await f.cleanup();
    }
  });

  it('role change revokes assignments, drops leases and Manager_Scope, and audits old and new role', async () => {
    const f = staffFixtures();
    try {
      const owner = await f.account('TOURNAMENT_MANAGER');
      const mgr = await f.account('TOURNAMENT_MANAGER');
      const tsId = await f.tournament(owner.id);
      await one('INSERT INTO tournament_sport_managers (tournament_sport_id, account_id, added_by) VALUES ($1, $2, $3) RETURNING account_id', [tsId, mgr.id, owner.id]);
      const assignmentId = await f.assignment(tsId, mgr.id);

      const res = await call(mgr.id, 'role', { role: 'MATCH_OPERATOR', reason: ' moved ' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ account: { id: mgr.id, role: 'MATCH_OPERATOR', status: 'ACTIVE' }, revokedAssignmentIds: [assignmentId] });
      expect(await accountState(mgr.id)).toEqual({ role: 'MATCH_OPERATOR', status: 'ACTIVE', audits: 1, active: 0, leases: 0, sportManager: 0 });
      expect(await one('SELECT status, revoked_by, revoke_reason FROM match_operator_assignments WHERE id = $1', [assignmentId])).toEqual({
        status: 'REVOKED',
        revoked_by: '1',
        revoke_reason: 'moved',
      });
      expect(await one(`SELECT actor_account_id, reason, before, after FROM admin_audit_log WHERE action = 'ROLE_CHANGED' AND entity_id = $1`, [mgr.id])).toEqual({
        actor_account_id: '1',
        reason: 'moved',
        before: { role: 'TOURNAMENT_MANAGER' },
        after: { role: 'MATCH_OPERATOR', revokedAssignmentIds: [assignmentId] },
      });
    } finally {
      await f.cleanup();
    }
  });

  it('role change refusals keep their order and write nothing', async () => {
    const f = staffFixtures();
    try {
      const owner = await f.account('TOURNAMENT_MANAGER');
      const disabled = await f.account('TOURNAMENT_MANAGER', 'DISABLED');
      const mgr = await f.account('TOURNAMENT_MANAGER');
      const tsId = await f.tournament(owner.id);
      await one('INSERT INTO tournament_sport_managers (tournament_sport_id, account_id, added_by) VALUES ($1, $2, $3) RETURNING account_id', [tsId, mgr.id, owner.id]);
      await f.assignment(tsId, mgr.id);
      await f.assignment(tsId, owner.id);

      const cases = [
        ['unknown role', mgr.id, { role: 'VIEWER' }, sa, [400, 'BAD_REQUEST', 'role']],
        ['missing role', mgr.id, {}, sa, [400, 'BAD_REQUEST', 'role']],
        ['same role', mgr.id, { role: 'TOURNAMENT_MANAGER' }, sa, [400, 'BAD_REQUEST', 'role']],
        ['manager caller', mgr.id, { role: 'MATCH_OPERATOR' }, 'test_tournament_manager', [403, 'ROLE_FORBIDDEN', 'Not allowed']],
        ['unknown account', '999999999', { role: 'MATCH_OPERATOR' }, sa, [404, 'NOT_FOUND', 'Account not found']],
        // A DISABLED target with its current role: the state check comes before the same-role check.
        ['disabled', disabled.id, { role: 'TOURNAMENT_MANAGER' }, sa, [409, 'ACCOUNT_DISABLED', 'Re-enable the account first']],
        ['owner', owner.id, { role: 'MATCH_OPERATOR' }, sa, [409, 'OWNER_TRANSFER_REQUIRED', 'Transfer tournament ownership first']],
        // The seed Super Admin also owns seed tournaments: LAST_SUPER_ADMIN comes first.
        ['last Super Admin', '1', { role: 'TOURNAMENT_MANAGER' }, sa, [409, 'LAST_SUPER_ADMIN', 'Cannot change the role of the last active Super Admin']],
      ];
      // Parallel files may self-assign the seed Super Admin, so only its role and status are compared.
      const state = async (id) => (id === '1' ? one('SELECT role, status FROM admin_accounts WHERE id = 1') : accountState(id));
      for (const [label, id, body, user, expected] of cases) {
        const before = await state(id);
        expect(await result(await call(id, 'role', body, user)), label).toEqual(expected);
        expect(await state(id), `${label} wrote nothing`).toEqual(before);
      }
    } finally {
      await f.cleanup();
    }
  });

  it('with two Super Admins, demotes one and then refuses the last, in a transaction that rolls back', async () => {
    // The second ACTIVE Super Admin and every change exist only inside this uncommitted transaction,
    // so parallel files never see a second Super Admin.
    await db(async (client) => {
      await client.query('BEGIN');
      try {
        const { rows: [second] } = await client.query(
          `INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'SUPER_ADMIN') RETURNING id`,
          [`test_staff_sa_${crypto.randomUUID()}`],
        );
        const { rows: [owner] } = await client.query(
          `INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'TOURNAMENT_MANAGER') RETURNING id`,
          [`test_staff_owner_${crypto.randomUUID()}`],
        );
        await client.query(
          `INSERT INTO tournaments (slug, name, starts_on, ends_on, status, owner_account_id)
           VALUES ($1, 'Staff Fixture (fake)', '2026-01-10', '2026-01-10', 'DRAFT', $2)`,
          [`test-staff-${crypto.randomUUID().slice(0, 8)}`, owner.id],
        );
        const change = (accountId, role) => applyRoleChange(client, { accountId, role, actorId: '1', reason: null, requestId: 'test-req' });

        // An owner is refused for every role change, a promotion included (Requirement 6.13).
        await expect(change(owner.id, 'SUPER_ADMIN')).rejects.toMatchObject({ status: 409, code: 'OWNER_TRANSFER_REQUIRED' });
        expect(await change(second.id, 'TOURNAMENT_MANAGER')).toEqual({
          account: { id: second.id, role: 'TOURNAMENT_MANAGER', status: 'ACTIVE' },
          revokedAssignmentIds: [],
        });
        await expect(change('1', 'MATCH_OPERATOR')).rejects.toMatchObject({ status: 409, code: 'LAST_SUPER_ADMIN' });
        const { rows } = await client.query(`SELECT id FROM admin_accounts WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' ORDER BY id`);
        expect(rows).toEqual([{ id: '1' }]);
      } finally {
        await client.query('ROLLBACK');
      }
    });
    expect(await one('SELECT role, status FROM admin_accounts WHERE id = 1')).toEqual({ role: 'SUPER_ADMIN', status: 'ACTIVE' });
  });
});
