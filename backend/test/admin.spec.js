// Super_Admin endpoints. Enable, role change effects and refusal order are in accounts.spec.js;
// authorization is in authz-matrix.spec.js. Every account,
// tournament and invitation here is a throwaway row tagged with this run's id; no seed row changes and
// no second ACTIVE Super Admin is committed to the shared schema. Other files add staff rows in parallel, so list
// assertions use fixture emails that start with "0000-" (they sort before every other staff email)
// and filter to this run's tag.
import { env } from 'cloudflare:workers';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { withClient } from '../src/db.js';
import { api, clerkError, db, one, stubClerk, testCtx } from './helpers.js';

const sa = 'test_super_admin';
const TAG = crypto.randomUUID().slice(0, 8);
const result = async (res) => {
  const body = await res.json();
  return [res.status, body.error?.code ?? 'OK', body.error?.message.split(':')[0]];
};

const accounts = [];
const tournaments = [];
const invitations = [];
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await db(async (client) => {
    await client.query(`DELETE FROM admin_audit_log WHERE entity = 'tournaments' AND entity_id = ANY($1::text[])`, [tournaments]);
    await client.query(`DELETE FROM admin_audit_log WHERE entity = 'staff_invitations' AND entity_id = ANY($1::text[])`, [invitations]);
    await client.query(`DELETE FROM admin_audit_log WHERE entity = 'admin_accounts' AND entity_id = ANY($1::text[])`, [accounts]);
    await client.query('DELETE FROM staff_invitations WHERE id = ANY($1)', [invitations]);
    await client.query('DELETE FROM tournament_sport_managers WHERE account_id = ANY($1)', [accounts]);
    await client.query('DELETE FROM tournament_sports WHERE tournament_id = ANY($1)', [tournaments]);
    await client.query('DELETE FROM tournaments WHERE id = ANY($1)', [tournaments]);
    await client.query('DELETE FROM admin_accounts WHERE id = ANY($1)', [accounts]);
  });
});

async function account(role, { status = 'ACTIVE', label = crypto.randomUUID().slice(0, 8) } = {}) {
  const user = `test_admin_${crypto.randomUUID()}`;
  const email = `0000-${TAG}-${label}@example.test`;
  const { id } = await one(
    'INSERT INTO admin_accounts (clerk_user_id, role, status, email, name) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [user, role, status, email, `Admin fixture ${label} (fake)`],
  );
  accounts.push(id);
  return { id, user, email };
}
// A DRAFT tournament owned by ownerId with one badminton sport.
async function tournament(ownerId, name = `Admin Fixture ${TAG} (fake)`) {
  const slug = `test-admin-${crypto.randomUUID().slice(0, 8)}`;
  const { id } = await one(
    `INSERT INTO tournaments (slug, name, starts_on, ends_on, status, owner_account_id)
     VALUES ($1, $2, '2026-01-10', '2026-01-10', 'DRAFT', $3) RETURNING id`,
    [slug, name, ownerId],
  );
  tournaments.push(id);
  const { id: tsId } = await one(`INSERT INTO tournament_sports (tournament_id, sport) VALUES ($1, 'badminton') RETURNING id`, [id]);
  return { id, slug, name, tsId };
}
const addSportManager = (tsId, accountId, by) =>
  one('INSERT INTO tournament_sport_managers (tournament_sport_id, account_id, added_by) VALUES ($1, $2, $3) RETURNING account_id', [tsId, accountId, by]);
async function invitation(expiresIn, status = 'PENDING') {
  const { id } = await one(
    `INSERT INTO staff_invitations (email, role, invited_by, clerk_invitation_id, expires_at, status)
     VALUES ($1, 'MATCH_OPERATOR', 1, $2, now() + $3::interval, $4) RETURNING id`,
    [`test-admin-inv-${crypto.randomUUID()}@example.test`, `inv_test_${crypto.randomUUID()}`, expiresIn, status],
  );
  invitations.push(id);
  return id;
}
const auditCount = (entity, id, action) =>
  one('SELECT count(*)::int AS n FROM admin_audit_log WHERE entity = $1 AND entity_id = $2 AND action = $3', [entity, String(id), action]).then((r) => r.n);
const mine = (staff) => staff.filter((s) => s.email?.startsWith(`0000-${TAG}-`));

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('GET /api/admin/staff', () => {
  it('orders ACTIVE first, then email, 50 per page: 51 rows give 50, then 1', async () => {
    // 51 ACTIVE scorers 00..50 and one DISABLED scorer whose email sorts before all of them.
    await db(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO admin_accounts (clerk_user_id, role, email, name)
         SELECT 'test_admin_page_' || $1 || '_' || n, 'MATCH_OPERATOR', '0000-' || $1 || '-p' || lpad(n::text, 2, '0') || '@example.test', 'Page fixture (fake)'
         FROM generate_series(0, 50) n RETURNING id`,
        [TAG],
      );
      accounts.push(...rows.map((r) => r.id));
    });
    const disabled = await account('MATCH_OPERATOR', { status: 'DISABLED', label: 'a-disabled' });
    const want = Array.from({ length: 51 }, (_, n) => `0000-${TAG}-p${String(n).padStart(2, '0')}@example.test`);

    const first = await (await api('GET', '/api/admin/staff?role=MATCH_OPERATOR&status=ACTIVE', { user: sa })).json();
    expect(first.staff).toHaveLength(50);
    expect(first.nextOffset).toBe(50);
    expect(first.staff.map((s) => s.email)).toEqual(want.slice(0, 50));
    expect(first.staff[0]).toEqual({ id: expect.any(String), name: 'Page fixture (fake)', email: want[0], role: 'MATCH_OPERATOR', status: 'ACTIVE', tournaments: [] });
    // Page two starts with the 51st fixture and holds no other fixture; later rows belong to other files.
    const second = await (await api('GET', '/api/admin/staff?role=MATCH_OPERATOR&status=ACTIVE&offset=50', { user: sa })).json();
    expect(second.staff[0].email).toBe(want[50]);
    expect(mine(second.staff).map((s) => s.email)).toEqual([want[50]]);

    // Unfiltered: the DISABLED row sorts by email before the ACTIVE rows but comes after them.
    const all = await (await api('GET', '/api/admin/staff', { user: sa })).json();
    expect(disabled.email < want[0]).toBe(true);
    expect(all.staff[0].email).toBe(want[0]);
  });

  it('filters by role and status and lists the tournaments in scope', async () => {
    const owner = await account('TOURNAMENT_MANAGER', { label: 'b-owner' });
    const sportMgr = await account('TOURNAMENT_MANAGER', { label: 'b-sport' });
    const off = await account('TOURNAMENT_MANAGER', { status: 'DISABLED', label: 'b-off' });
    const t = await tournament(owner.id, `Admin Scope ${TAG} (fake)`);
    await addSportManager(t.tsId, sportMgr.id, owner.id);

    const managers = await (await api('GET', '/api/admin/staff?role=TOURNAMENT_MANAGER', { user: sa })).json();
    expect(managers.staff.every((s) => s.role === 'TOURNAMENT_MANAGER')).toBe(true);
    const byEmail = Object.fromEntries(mine(managers.staff).map((s) => [s.email, s]));
    expect(byEmail[owner.email].tournaments).toEqual([t.name]);
    expect(byEmail[sportMgr.email].tournaments).toEqual([t.name]);

    const disabled = await (await api('GET', '/api/admin/staff?status=DISABLED', { user: sa })).json();
    expect(disabled.staff.every((s) => s.status === 'DISABLED')).toBe(true);
    expect(mine(disabled.staff).map((s) => s.email)).toContain(off.email);
    expect(mine(disabled.staff).map((s) => s.email)).not.toContain(owner.email);

    for (const [query, field] of [['role=VIEWER', 'role'], ['status=GONE', 'status'], ['offset=-1', 'offset'], ['offset=abc', 'offset']]) {
      expect(await result(await api('GET', `/api/admin/staff?${query}`, { user: sa })), query).toEqual([400, 'BAD_REQUEST', field]);
    }
    expect(await result(await api('GET', '/api/admin/staff', { user: 'test_tournament_manager' }))).toEqual([403, 'ROLE_FORBIDDEN', 'Not allowed']);
  });

  it('returns one member with owned tournaments, sport scope and active assignments', async () => {
    const owner = await account('TOURNAMENT_MANAGER', { label: 'c-owner' });
    const t = await tournament(owner.id);
    const other = await tournament((await account('TOURNAMENT_MANAGER', { label: 'c-other' })).id);
    await addSportManager(other.tsId, owner.id, '1');

    const res = await api('GET', `/api/admin/staff/${owner.id}`, { user: sa });
    expect(res.status).toBe(200);
    expect((await res.json()).member).toEqual({
      id: owner.id, name: 'Admin fixture c-owner (fake)', email: owner.email, role: 'TOURNAMENT_MANAGER', status: 'ACTIVE',
      owned: [{ slug: t.slug, name: t.name }],
      sportScope: [{ tournament: { slug: other.slug, name: other.name }, sport: 'badminton' }],
      activeAssignments: 0,
    });
    expect(await result(await api('GET', '/api/admin/staff/999999999', { user: sa }))).toEqual([404, 'NOT_FOUND', 'Account not found']);
    expect(await result(await api('GET', '/api/admin/staff/abc', { user: sa }))).toEqual([400, 'BAD_REQUEST', 'Malformed ID']);
  });
});

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('POST /api/admin/tournaments/:slug/owner', () => {
  const transfer = (slug, body, user = sa) => api('POST', `/api/admin/tournaments/${slug}/owner`, { user, body });
  const ownerOf = async (id) => (await one('SELECT owner_account_id FROM tournaments WHERE id = $1', [id])).owner_account_id;

  it('refuses ineligible targets and the current owner, and writes nothing', async () => {
    const owner = await account('TOURNAMENT_MANAGER', { label: 'd-owner' });
    const scorer = await account('MATCH_OPERATOR', { label: 'd-scorer' });
    const off = await account('TOURNAMENT_MANAGER', { status: 'DISABLED', label: 'd-off' });
    const t = await tournament(owner.id);
    const cases = [
      ['scorer', { email: scorer.email }, sa, [400, 'BAD_REQUEST', 'email']],
      ['disabled manager', { email: off.email }, sa, [400, 'BAD_REQUEST', 'email']],
      ['Super Admin', { email: 'test-super-admin@example.test' }, sa, [400, 'BAD_REQUEST', 'email']],
      ['no account', { email: `0000-${TAG}-nobody@example.test` }, sa, [400, 'BAD_REQUEST', 'email']],
      ['current owner', { email: owner.email.toUpperCase() }, sa, [400, 'BAD_REQUEST', 'email']],
      ['bad email', { email: 'not-an-email' }, sa, [400, 'BAD_REQUEST', 'email']],
      ['manager caller', { email: owner.email }, 'test_tournament_manager', [403, 'ROLE_FORBIDDEN', 'Not allowed']],
    ];
    for (const [label, body, user, expected] of cases) {
      expect(await result(await transfer(t.slug, body, user)), label).toEqual(expected);
    }
    expect(await result(await transfer('test-admin-no-such-slug', { email: owner.email }))).toEqual([404, 'NOT_FOUND', 'Tournament not found']);
    expect(await ownerOf(t.id)).toBe(owner.id);
    expect(await auditCount('tournaments', t.id, 'OWNER_TRANSFERRED')).toBe(0);
  });

  it('replaces the owner, drops the new owner\'s Sport_Manager rows there only, and writes one audit row', async () => {
    const owner = await account('TOURNAMENT_MANAGER', { label: 'e-owner' });
    const next = await account('TOURNAMENT_MANAGER', { label: 'e-next' });
    const t = await tournament(owner.id);
    const elsewhere = await tournament(owner.id);
    await addSportManager(t.tsId, next.id, owner.id);
    await addSportManager(elsewhere.tsId, next.id, owner.id);

    const res = await transfer(t.slug, { email: ` ${next.email.toUpperCase()} `, reason: ' handover ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tournament: { slug: t.slug, owner: { accountId: next.id, name: 'Admin fixture e-next (fake)', email: next.email } } });
    expect(await ownerOf(t.id)).toBe(next.id);
    const rows = await db((client) => client.query('SELECT tournament_sport_id FROM tournament_sport_managers WHERE account_id = $1', [next.id]));
    expect(rows.rows).toEqual([{ tournament_sport_id: elsewhere.tsId }]);
    expect(await one(`SELECT actor_account_id, reason, before, after FROM admin_audit_log WHERE entity = 'tournaments' AND entity_id = $1 AND action = 'OWNER_TRANSFERRED'`, [t.id])).toEqual({
      actor_account_id: '1', reason: 'handover', before: { ownerId: owner.id }, after: { ownerId: next.id, removedSportManagers: 1 },
    });
    // Transferring again to the same account is refused as already owner.
    expect(await result(await transfer(t.slug, { email: next.email }))).toEqual([400, 'BAD_REQUEST', 'email']);
    expect(await auditCount('tournaments', t.id, 'OWNER_TRANSFERRED')).toBe(1);

    // Owner guard (Requirement 6.13): the old owner still owns `elsewhere`, so disable and role change
    // stay refused with no audit row. After that transfer too, the old owner can be disabled.
    const disable = () => api('POST', `/api/accounts/${owner.id}/disable`, { user: sa, body: { reason: 'left' } });
    const guard = [409, 'OWNER_TRANSFER_REQUIRED', 'Transfer tournament ownership first'];
    expect(await result(await disable())).toEqual(guard);
    expect(await result(await api('POST', `/api/accounts/${owner.id}/role`, { user: sa, body: { role: 'MATCH_OPERATOR' } }))).toEqual(guard);
    const accountAudits = () => one(`SELECT count(*)::int AS n FROM admin_audit_log WHERE entity = 'admin_accounts' AND entity_id = $1`, [owner.id]).then((r) => r.n);
    expect(await accountAudits()).toBe(0);
    expect((await transfer(elsewhere.slug, { email: next.email })).status).toBe(200);
    expect(await result(await disable())).toEqual([200, 'OK', undefined]);
    expect(await one('SELECT status FROM admin_accounts WHERE id = $1', [owner.id])).toEqual({ status: 'DISABLED' });
    expect(await auditCount('admin_accounts', owner.id, 'ACCOUNT_DISABLED')).toBe(1);
    expect(await accountAudits()).toBe(1);
  });
});

describe.skipIf(!env.HYPERDRIVE_UNCACHED)('pending invitations', () => {
  const status = async (id) => (await one('SELECT status FROM staff_invitations WHERE id = $1', [id])).status;
  const cancel = (id, body = {}) => api('POST', `/api/invites/${id}/cancel`, { user: sa, body });

  it('lists PENDING unexpired invitations by database time, soonest first', async () => {
    const later = await invitation('2 minutes');
    const soon = await invitation('1 minute');
    const expired = await invitation('-1 minute');
    const revoked = await invitation('1 minute', 'REVOKED');
    const res = await api('GET', '/api/admin/invitations', { user: sa });
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.invitations.map((i) => i.id);
    expect(ids.filter((id) => [later, soon, expired, revoked].includes(id))).toEqual([soon, later]);
    const times = body.invitations.map((i) => Date.parse(i.expiresAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(body.invitations.find((i) => i.id === soon)).toEqual({
      id: soon, email: expect.stringMatching(/^test-admin-inv-/), role: 'MATCH_OPERATOR', invitedBy: 'Test Super Admin (fake)', expiresAt: expect.any(String),
    });
    expect(body).toHaveProperty('nextOffset');
    expect(await result(await api('GET', '/api/admin/invitations?offset=x', { user: sa }))).toEqual([400, 'BAD_REQUEST', 'offset']);
  });

  it('cancel revokes in Clerk first, then closes the row with one audit row', async () => {
    const id = await invitation('1 day');
    const { clerk_invitation_id: clerkId } = await one('SELECT clerk_invitation_id FROM staff_invitations WHERE id = $1', [id]);
    const calls = stubClerk(() => [200, { object: 'invitation', id: clerkId, status: 'revoked' }]);
    const res = await cancel(id, { reason: ' not needed ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ invitation: { id, status: 'REVOKED' } });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([`POST /v1/invitations/${clerkId}/revoke`]);
    expect(await status(id)).toBe('REVOKED');
    expect(await one(`SELECT actor_account_id, reason FROM admin_audit_log WHERE entity = 'staff_invitations' AND entity_id = $1 AND action = 'INVITE_CANCELLED'`, [id])).toEqual({
      actor_account_id: '1', reason: 'not needed',
    });

    // A second cancel is INVITE_CLOSED with no Clerk call and no audit row.
    vi.restoreAllMocks();
    const again = stubClerk(() => [200, {}]);
    expect(await result(await cancel(id))).toEqual([409, 'INVITE_CLOSED', 'This invitation is no longer pending']);
    expect(again).toEqual([]);
    expect(await auditCount('staff_invitations', id, 'INVITE_CANCELLED')).toBe(1);
  });

  it('a Clerk failure returns 502 and keeps the invitation PENDING; Clerk 404 still closes it', async () => {
    const id = await invitation('1 day');
    stubClerk(() => clerkError);
    expect(await result(await cancel(id))).toEqual([502, 'CLERK_UNAVAILABLE', 'Sign-in service unavailable']);
    expect(await status(id)).toBe('PENDING');
    expect(await auditCount('staff_invitations', id, 'INVITE_CANCELLED')).toBe(0);

    // The Clerk invitation is already gone (404): it can no longer be used, so the row is closed.
    vi.restoreAllMocks();
    stubClerk(() => [404, { errors: [{ code: 'resource_not_found', message: 'not found' }] }]);
    expect((await cancel(id)).status).toBe(200);
    expect(await status(id)).toBe('REVOKED');
    expect(await auditCount('staff_invitations', id, 'INVITE_CANCELLED')).toBe(1);
  });

  it('refuses expired, unknown and malformed invitations and non-Super-Admin callers', async () => {
    const expired = await invitation('-1 minute');
    const open = await invitation('1 day');
    const calls = stubClerk(() => [200, {}]);
    expect(await result(await cancel(expired))).toEqual([409, 'INVITE_CLOSED', 'This invitation is no longer pending']);
    expect(await result(await cancel('999999999'))).toEqual([404, 'NOT_FOUND', 'Invitation not found']);
    expect(await result(await cancel('abc'))).toEqual([400, 'BAD_REQUEST', 'Malformed ID']);
    expect(await result(await api('POST', `/api/invites/${open}/cancel`, { user: 'test_tournament_manager', body: {} }))).toEqual([403, 'ROLE_FORBIDDEN', 'Not allowed']);
    expect(calls).toEqual([]);
    expect(await status(expired)).toBe('PENDING');
    expect(await status(open)).toBe('PENDING');
    expect(await auditCount('staff_invitations', expired, 'INVITE_CANCELLED')).toBe(0);
  });
});

// LAST_SUPER_ADMIN under two concurrent requests (Requirement 6.14).
// The race needs two ACTIVE Super Admins committed, so that two separate connections see both. Other
// files rely on the seed Super Admin being the only one, so the race runs in a throwaway schema: it
// copies the tables the requests touch (LIKE ... INCLUDING ALL keeps the checks and unique indexes),
// and the Worker's uncached binding is replaced by one whose connections set search_path to that
// schema first. Its rows are invisible to every other connection, and the finally drops the schema.
// A gate transaction locks both Super Admin rows until both requests wait on it, so they truly overlap.
describe.skipIf(!env.HYPERDRIVE_UNCACHED)('LAST_SUPER_ADMIN under two concurrent requests', () => {
  const TABLES = ['admin_accounts', 'tournaments', 'tournament_sport_managers', 'match_operator_assignments', 'scorer_leases', 'admin_audit_log'];

  it('lets exactly one of a demote and a disable through and leaves one ACTIVE Super Admin', async () => {
    const schema = `test_race_${TAG.replace(/[^0-9a-f]/g, '')}`;
    const url = new URL(env.HYPERDRIVE_UNCACHED.connectionString);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    const raceDb = { connectionString: url.toString() };
    const inRace = async (fn) => {
      const ctx = testCtx();
      try {
        return await withClient(raceDb, ctx, fn);
      } finally {
        await ctx.done();
      }
    };
    await db(async (client) => {
      await client.query(`CREATE SCHEMA ${schema}`);
      for (const t of TABLES) await client.query(`CREATE TABLE ${schema}.${t} (LIKE public.${t} INCLUDING ALL)`);
    });
    try {
      const [a, b] = await inRace(async (client) => {
        expect((await client.query('SHOW search_path')).rows[0].search_path).toBe(`${schema},public`);
        const { rows } = await client.query(
          `INSERT INTO admin_accounts (clerk_user_id, role) VALUES ($1, 'SUPER_ADMIN'), ($2, 'SUPER_ADMIN') RETURNING id, clerk_user_id AS user`,
          [`test_race_a_${crypto.randomUUID()}`, `test_race_b_${crypto.randomUUID()}`],
        );
        return rows;
      });
      const bindings = { HYPERDRIVE_UNCACHED: raceDb };

      const outcome = await inRace(async (gate) => {
        await gate.query('BEGIN');
        await gate.query(`SELECT id FROM admin_accounts WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' FOR UPDATE`);
        const { rows: [{ pid }] } = await gate.query('SELECT pg_backend_pid() AS pid');
        // A demotes B while B disables A.
        const race = Promise.all([
          api('POST', `/api/accounts/${b.id}/role`, { user: a.user, body: { role: 'TOURNAMENT_MANAGER' }, env: bindings }),
          api('POST', `/api/accounts/${a.id}/disable`, { user: b.user, body: { reason: 'race' }, env: bindings }),
        ]);
        // The first request waits on the gate; the second queues behind the first's tuple lock.
        const waiting = `SELECT count(*)::int AS n FROM pg_stat_activity a WHERE $1::int = ANY(pg_blocking_pids(a.pid))
          OR EXISTS (SELECT 1 FROM unnest(pg_blocking_pids(a.pid)) w WHERE $1::int = ANY(pg_blocking_pids(w)))`;
        try {
          await expect.poll(
            async () => (await one(waiting, [pid])).n,
            { timeout: 10000, interval: 50 },
          ).toBe(2);
        } finally {
          await gate.query('ROLLBACK');
        }
        return Promise.all((await race).map(result));
      });

      expect(outcome.map(([status, code]) => `${status} ${code}`).sort()).toEqual(['200 OK', '409 LAST_SUPER_ADMIN']);
      await inRace(async (client) => {
        const { rows } = await client.query(`SELECT id FROM admin_accounts WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE'`);
        expect(rows).toHaveLength(1);
        // One Audit_Row for the accepted change, none for the refused one.
        const audits = await client.query('SELECT action FROM admin_audit_log');
        expect(audits.rows).toHaveLength(1);
        expect(['ROLE_CHANGED', 'ACCOUNT_DISABLED']).toContain(audits.rows[0].action);
      });
    } finally {
      await db((client) => client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`));
    }
    expect(await one('SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = $1', [schema])).toEqual({ n: 0 });
  });
});
