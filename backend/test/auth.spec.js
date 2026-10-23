import { env, exports as workerExports } from 'cloudflare:workers';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { canAccess, canInvite, loadAccount, requireRole } from '../src/auth.js';
import { onError, requestId } from '../src/http.js';
import { api, clerkError, clerkUser, db, keys, one, signJwt, stubClerk, testCtx } from './helpers.js';

const worker = (path, headers = {}, method = 'GET') =>
  workerExports.default.fetch(new Request(`http://example.com${path}`, { headers, method }));

describe('/api/me without a valid token', () => {
  it('returns a 401 UNAUTHENTICATED Error_Body', async () => {
    for (const headers of [{}, { Authorization: 'Bearer not-a-jwt' }, { Authorization: 'Basic abc' }]) {
      const res = await worker('/api/me', headers);
      expect(res.status, JSON.stringify(headers)).toBe(401);
      expect(await res.json()).toEqual({
        error: { code: 'UNAUTHENTICATED', message: 'Sign in required', requestId: res.headers.get('X-Request-Id') },
      });
    }
  });

  it('also guards DELETE /api/me', async () => {
    const res = await worker('/api/me', {}, 'DELETE');
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('UNAUTHENTICATED');
  });
});

afterEach(() => vi.restoreAllMocks());

// /api/invites/accept needs no database before its Clerk lookup, so a 404 here proves the token was accepted.
describe('Clerk session JWT verification', () => {
  const now = Math.floor(Date.now() / 1000);
  const accept = (token) => api('POST', '/api/invites/accept', { token });

  it('accepts a valid token signed with CLERK_JWT_KEY', async () => {
    const calls = stubClerk(() => [200, clerkUser('user_jwt_ok', [])]);
    const res = await accept(await signJwt('user_jwt_ok'));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('INVITE_NOT_FOUND');
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /v1/users/user_jwt_ok']);
  });

  it('returns 401 for expired, wrong-azp, bad-signature and missing tokens without calling Clerk', async () => {
    const calls = stubClerk(() => [200, clerkUser('user_jwt_bad', [])]);
    const cases = {
      expired: await signJwt('user_jwt_bad', { iat: now - 600, nbf: now - 600, exp: now - 300 }),
      wrongAzp: await signJwt('user_jwt_bad', { azp: 'https://evil.example' }),
      badSignature: await signJwt('user_jwt_bad', {}, keys.other),
      missing: undefined,
    };
    for (const [name, token] of Object.entries(cases)) {
      const res = await accept(token);
      expect(res.status, name).toBe(401);
      expect((await res.json()).error.code, name).toBe('UNAUTHENTICATED');
    }
    expect(calls).toEqual([]);
  });
});

describe('canAccess', () => {
  const account = (role, status = 'ACTIVE') => ({ role, status });
  it('denies missing and disabled accounts before checking the role', () => {
    expect(canAccess(null, 'staff')).toEqual({ ok: false, code: 'NOT_STAFF' });
    expect(canAccess(account('SUPER_ADMIN', 'DISABLED'), 'staff')).toEqual({ ok: false, code: 'ACCOUNT_DISABLED' });
  });
  it('allows only the listed roles per route key', () => {
    const allowed = {
      staff: ['MATCH_OPERATOR', 'TOURNAMENT_MANAGER', 'SUPER_ADMIN'],
      manager: ['TOURNAMENT_MANAGER', 'SUPER_ADMIN'],
      superAdmin: ['SUPER_ADMIN'],
    };
    for (const [key, roles] of Object.entries(allowed)) {
      for (const role of ['MATCH_OPERATOR', 'TOURNAMENT_MANAGER', 'SUPER_ADMIN', 'VIEWER']) {
        const want = roles.includes(role) ? { ok: true } : { ok: false, code: 'ROLE_FORBIDDEN' };
        expect(canAccess(account(role), key), `${key} ${role}`).toEqual(want);
      }
    }
  });
});

describe('canInvite', () => {
  it('lets a Super Admin invite any staff role and a manager only operators', () => {
    const roles = ['SUPER_ADMIN', 'TOURNAMENT_MANAGER', 'MATCH_OPERATOR', 'VIEWER'];
    const allowed = { SUPER_ADMIN: roles.slice(0, 3), TOURNAMENT_MANAGER: ['MATCH_OPERATOR'] };
    for (const inviter of [...roles, undefined]) {
      for (const requested of roles) {
        expect(canInvite(inviter, requested), `${inviter} -> ${requested}`).toBe(allowed[inviter]?.includes(requested) ?? false);
      }
    }
  });
});

// loadAccount + requireRole behind a stand-in for clerkAuth, so no JWT is needed here.
const app = new Hono();
app.use('*', requestId);
app.onError(onError);
app.use('/as/:user/*', async (c, next) => {
  c.set('clerkUserId', c.req.param('user'));
  await next();
});
app.get('/as/:user/manager', loadAccount, requireRole('manager'), (c) => c.json({ role: c.get('account').role }));
const call = async (path) => {
  const ctx = testCtx();
  const res = await app.fetch(new Request(`http://example.com${path}`), env, ctx);
  await ctx.done();
  return res;
};
const sql = (text, params) => db((client) => client.query(text, params));

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('loadAccount and requireRole against the seed', () => {
  it('reads the role from the database on every request', async () => {
    // A throwaway account, so the shared seed rows never change.
    const user = `test_auth_probe_${crypto.randomUUID()}`;
    await sql(`INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'TOURNAMENT_MANAGER')`, [user]);
    try {
      let res = await call(`/as/${user}/manager`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ role: 'TOURNAMENT_MANAGER' });
      await sql(`UPDATE admin_accounts SET status = 'DISABLED' WHERE clerk_user_id = $1`, [user]);
      res = await call(`/as/${user}/manager`);
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('ACCOUNT_DISABLED');
    } finally {
      await sql('DELETE FROM admin_accounts WHERE clerk_user_id = $1', [user]);
    }
  });

  it('returns 403 for a Viewer and for a role below the route', async () => {
    for (const [user, code] of [['test_unknown_viewer', 'NOT_STAFF'], ['test_match_operator', 'ROLE_FORBIDDEN']]) {
      const res = await call(`/as/${user}/manager`);
      expect(res.status, user).toBe(403);
      expect((await res.json()).error.code, user).toBe(code);
    }
  });
});

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('/api/me with a signed token', () => {
  it('reads the role from the database on each call with the same token', async () => {
    const user = `test_me_probe_${crypto.randomUUID()}`;
    const token = await signJwt(user);
    const me = async () => (await api('GET', '/api/me', { token })).json();
    try {
      expect(await me()).toEqual({ role: 'VIEWER' });
      await sql(`INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'TOURNAMENT_MANAGER')`, [user]);
      expect(await me()).toEqual({ role: 'TOURNAMENT_MANAGER', status: 'ACTIVE' });
      await sql(`UPDATE admin_accounts SET role = 'MATCH_OPERATOR' WHERE clerk_user_id = $1`, [user]);
      expect(await me()).toEqual({ role: 'MATCH_OPERATOR', status: 'ACTIVE' });
      await sql(`UPDATE admin_accounts SET status = 'DISABLED' WHERE clerk_user_id = $1`, [user]);
      expect(await me()).toEqual({ role: 'VIEWER' });
    } finally {
      await sql('DELETE FROM admin_accounts WHERE clerk_user_id = $1', [user]);
    }
  });

  it('ignores role and metadata claims in the token', async () => {
    const claims = {
      role: 'SUPER_ADMIN',
      metadata: { role: 'SUPER_ADMIN' },
      public_metadata: { role: 'SUPER_ADMIN' },
      org_role: 'org:admin',
    };
    const viewer = await signJwt(`test_claims_viewer_${crypto.randomUUID()}`, claims);
    expect(await (await api('GET', '/api/me', { token: viewer })).json()).toEqual({ role: 'VIEWER' });
    let res = await api('POST', '/api/invites', { token: viewer, body: { email: 'test_claims@example.com', role: 'MATCH_OPERATOR' } });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('NOT_STAFF');
    const operator = await signJwt('test_match_operator', claims);
    res = await api('POST', '/api/accounts/3/disable', { token: operator, body: { reason: 'test' } });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('ROLE_FORBIDDEN');
  });
});

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('DELETE /api/me', () => {
  const deleted = (id) => [200, { object: 'user', id, deleted: true }];

  it('deletes a Viewer in Clerk and returns 204', async () => {
    const user = `test_del_viewer_${crypto.randomUUID()}`;
    const calls = stubClerk(() => deleted(user));
    const res = await api('DELETE', '/api/me', { user });
    expect(res.status).toBe(204);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`DELETE /v1/users/${user}`]);
  });

  it('disables staff and revokes assignments before Clerk; a Clerk failure returns 502 and a retry completes', async () => {
    // Throwaway manager (who self-assigned) and CUSTOM match, so the shared seed rows never change.
    const user = `test_del_staff_${crypto.randomUUID()}`;
    const { id: accountId } = await one(`INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'TOURNAMENT_MANAGER') RETURNING id`, [user]);
    const { id: matchId } = await one(`INSERT INTO matches (tournament_sport_id, kind) VALUES (2, 'CUSTOM') RETURNING id`);
    const { id: assignmentId } = await one(
      'INSERT INTO match_operator_assignments (match_id, account_id, assigned_by) VALUES ($1, $2, 1) RETURNING id',
      [matchId, accountId],
    );
    try {
      let calls = stubClerk(() => clerkError);
      let res = await api('DELETE', '/api/me', { user });
      expect(res.status).toBe(502);
      expect((await res.json()).error.code).toBe('CLERK_UNAVAILABLE');
      expect(calls.length).toBeGreaterThan(0);
      expect(await one('SELECT status FROM admin_accounts WHERE id = $1', [accountId])).toEqual({ status: 'DISABLED' });
      expect(await one('SELECT status FROM match_operator_assignments WHERE id = $1', [assignmentId])).toEqual({ status: 'REVOKED' });

      vi.restoreAllMocks();
      calls = stubClerk(() => deleted(user));
      res = await api('DELETE', '/api/me', { user });
      expect(res.status).toBe(204);
      expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`DELETE /v1/users/${user}`]);
      // The retry skips the disable, so exactly one audit row exists.
      expect(
        await one(`SELECT count(*)::int AS n, max(reason) AS reason FROM admin_audit_log WHERE action = 'ACCOUNT_DISABLED' AND entity_id = $1`, [accountId]),
      ).toEqual({ n: 1, reason: 'Account deleted by user' });
    } finally {
      await db(async (client) => {
        await client.query(`DELETE FROM admin_audit_log WHERE entity = 'admin_accounts' AND entity_id = $1`, [accountId]);
        await client.query('DELETE FROM match_operator_assignments WHERE id = $1', [assignmentId]);
        await client.query('DELETE FROM matches WHERE id = $1', [matchId]);
        await client.query('DELETE FROM admin_accounts WHERE id = $1', [accountId]);
      });
    }
  });

  it('refuses an ACTIVE Match Scorer with 403 SCORER_ACCOUNT_MANAGED, changes nothing and never calls Clerk', async () => {
    const user = `test_del_scorer_${crypto.randomUUID()}`;
    const { id: accountId } = await one(`INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'MATCH_OPERATOR') RETURNING id`, [user]);
    try {
      const calls = stubClerk(() => deleted(user));
      const res = await api('DELETE', '/api/me', { user });
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('SCORER_ACCOUNT_MANAGED');
      expect(calls).toEqual([]);
      expect(await one('SELECT status FROM admin_accounts WHERE id = $1', [accountId])).toEqual({ status: 'ACTIVE' });
    } finally {
      await db((client) => client.query('DELETE FROM admin_accounts WHERE id = $1', [accountId]));
    }
  });

  it('returns 409 for the last active Super Admin, changes nothing and never calls Clerk', async () => {
    const calls = stubClerk(() => deleted('test_super_admin'));
    const res = await api('DELETE', '/api/me', { user: 'test_super_admin' });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('LAST_SUPER_ADMIN');
    expect(calls).toEqual([]);
    expect(await one(`SELECT status FROM admin_accounts WHERE clerk_user_id = 'test_super_admin'`)).toEqual({ status: 'ACTIVE' });
  });
});
